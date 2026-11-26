#!/usr/bin/env node
/**
 * Static dead-code gate:
 * 1. Ensures every `.ts` file under `src/` is reachable from `pages/*.html` or test/harness scripts
 *    (tracing static, dynamic, and Worker imports, ignoring generated outputs only).
 * 2. Detects exported runtime values (functions, consts, classes, enums) never imported by any other
 *    `.ts` module or `.mjs` script, including internal-only exports and namespace imports (`import * as ns`).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'src');
const PAGES = join(ROOT, 'pages');

// Public API allowlist: files whose exports are kept without an importer. Adding a file here needs a user
// decision recorded in a Kiro spec (see .kiro/specs/architecture-hardening/); agents never extend it.
const PUBLIC_API_FILES = new Set([
  'src/contracts/brand.ts',
  'src/procgen/index.ts',
]);

function hasExportMod(node) {
  return Boolean(node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) &&
    !node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword);
}

function walkFiles(dir, matchExt, skipDirs = new Set(['node_modules', '.git', 'out'])) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(ent.name)) continue;
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(full, matchExt, skipDirs));
    else if (matchExt(ent.name)) out.push(full);
  }
  return out;
}

function resolveTs(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), spec).replace(/\.(js|jsx|mjs|ts|tsx|mts)$/, '');
  for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(cand)) return cand;
  }
  return null;
}

function recordNamespaceAccesses(text, alias, target, addImport) {
  const rx = new RegExp(`\\b${alias}\\.([A-Za-z0-9_]+)`, 'g');
  let hit = false;
  for (const match of text.matchAll(rx)) {
    addImport(target, match[1]);
    hit = true;
  }
  if (!hit) addImport(target, '*');
}

function collectModuleEdges(file) {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const edges = new Set();
  const importedNames = new Map();
  const starExports = [];
  const addImport = (target, name) => {
    if (!target) return;
    edges.add(target);
    if (!importedNames.has(target)) importedNames.set(target, new Set());
    importedNames.get(target).add(name);
  };

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const target = resolveTs(file, stmt.moduleSpecifier.text);
      const clause = stmt.importClause;
      if (!clause) {
        if (target) edges.add(target);
      } else {
        if (clause.name) addImport(target, 'default');
        const nb = clause.namedBindings;
        if (nb && ts.isNamespaceImport(nb)) {
          if (clause.isTypeOnly) edges.add(target);
          else if (target) recordNamespaceAccesses(text, nb.name.text, target, addImport);
        } else if (nb && ts.isNamedImports(nb)) {
          for (const el of nb.elements) addImport(target, (el.propertyName ?? el.name).text);
        }
      }
    } else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const target = resolveTs(file, stmt.moduleSpecifier.text);
      if (!stmt.exportClause) {
        if (target) {
          edges.add(target);
          if (!stmt.isTypeOnly) starExports.push(target);
        }
      } else if (ts.isNamespaceExport(stmt.exportClause)) {
        addImport(target, '*');
      } else if (ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) addImport(target, (el.propertyName ?? el.name).text);
      }
    }
  }

  for (const m of text.matchAll(/(?:import\s*\(|new\s+URL\s*\()\s*['"]([^'"]+)['"]/g)) {
    const target = resolveTs(file, m[1]);
    if (target) addImport(target, '*');
  }
  edges.delete(null);
  return { sf, edges: [...edges], importedNames, starExports };
}

function valueExportsOf(sf) {
  const names = [];
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && hasExportMod(stmt) && stmt.name && stmt.body) {
      names.push(stmt.name.text);
    } else if (ts.isClassDeclaration(stmt) && hasExportMod(stmt) && stmt.name) {
      names.push(stmt.name.text);
    } else if (ts.isEnumDeclaration(stmt) && hasExportMod(stmt)) {
      names.push(stmt.name.text);
    } else if (ts.isVariableStatement(stmt) && hasExportMod(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) names.push(decl.name.text);
        else if (ts.isObjectBindingPattern(decl.name)) {
          for (const el of decl.name.elements) {
            if (ts.isIdentifier(el.name)) names.push(el.name.text);
          }
        }
      }
    } else if (ts.isExportDeclaration(stmt) && !stmt.isTypeOnly && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) {
        if (!el.isTypeOnly) names.push(el.name.text);
      }
    }
  }
  return names;
}

function collectIdentifiers(node, out) {
  if (ts.isIdentifier(node)) out.add(node.text);
  ts.forEachChild(node, (child) => collectIdentifiers(child, out));
}

function typeExportsOf(sf) {
  const types = new Map();
  const valueRefs = new Set();
  const localRefs = new Map();
  for (const stmt of sf.statements) {
    if ((ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt)) && hasExportMod(stmt)) {
      const refs = new Set();
      collectIdentifiers(stmt, refs);
      refs.delete(stmt.name.text);
      types.set(stmt.name.text, refs);
    } else if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) {
        if (stmt.isTypeOnly || el.isTypeOnly) types.set(el.name.text, new Set());
      }
    } else if (hasExportMod(stmt) || ts.isModuleDeclaration(stmt)) {
      collectIdentifiers(stmt, valueRefs);
    } else if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      const refs = new Set();
      collectIdentifiers(stmt, refs);
      localRefs.set(stmt.name.text, refs);
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const refs = new Set();
          collectIdentifiers(decl, refs);
          localRefs.set(decl.name.text, refs);
        }
      }
    }
  }
  const seenLocal = new Set();
  const queue = [...valueRefs];
  while (queue.length > 0) {
    const id = queue.shift();
    if (seenLocal.has(id) || !localRefs.has(id)) continue;
    seenLocal.add(id);
    for (const ref of localRefs.get(id)) {
      if (!valueRefs.has(ref)) {
        valueRefs.add(ref);
        queue.push(ref);
      }
    }
  }
  return { types, valueRefs };
}

const tsFiles = walkFiles(SRC, (n) => n.endsWith('.ts') && !n.endsWith('.d.ts')).sort();
const graph = new Map();
const importedByTarget = new Map();
const starExportChildren = new Map();

for (const file of tsFiles) {
  const { sf, edges, importedNames, starExports } = collectModuleEdges(file);
  graph.set(file, { sf, edges });
  if (starExports.length > 0) starExportChildren.set(file, starExports);
  for (const [target, names] of importedNames) {
    if (!importedByTarget.has(target)) importedByTarget.set(target, new Set());
    const dst = importedByTarget.get(target);
    for (const n of names) dst.add(n);
  }
}

// Include imports from skill examples (.kiro/skills/**/*.ts) without treating examples as shipped src/.
const skillTsFiles = walkFiles(join(ROOT, '.kiro/skills'), (n) => n.endsWith('.ts') && !n.endsWith('.d.ts')).sort();
for (const file of skillTsFiles) {
  const { importedNames } = collectModuleEdges(file);
  for (const [target, names] of importedNames) {
    if (!importedByTarget.has(target)) importedByTarget.set(target, new Set());
    const dst = importedByTarget.get(target);
    for (const n of names) dst.add(n);
  }
}

const publicTree = new Set([...PUBLIC_API_FILES].map((rel) => join(ROOT, rel)));
const pubQueue = [...publicTree];
while (pubQueue.length > 0) {
  const cur = pubQueue.shift();
  for (const child of starExportChildren.get(cur) ?? []) {
    if (!publicTree.has(child)) {
      publicTree.add(child);
      pubQueue.push(child);
    }
  }
}

// Propagate names imported from a non-public barrel via `export *` to its children.
let changed = true;
while (changed) {
  changed = false;
  for (const [barrel, children] of starExportChildren) {
    const names = importedByTarget.get(barrel);
    if (!names) continue;
    for (const child of children) {
      if (!importedByTarget.has(child)) importedByTarget.set(child, new Set());
      const dst = importedByTarget.get(child);
      for (const n of names) {
        if (!dst.has(n)) {
          dst.add(n);
          changed = true;
        }
      }
    }
  }
}

// Entry roots: pages/*.html script tags + .mjs harness/skill scripts loading `/src/...ts`.
const roots = new Set();
for (const html of walkFiles(PAGES, (n) => n.endsWith('.html'))) {
  const text = readFileSync(html, 'utf8');
  for (const m of text.matchAll(/<script[^>]+src=['"]([^'"]+)['"]/gi)) {
    const spec = m[1];
    if (!spec.startsWith('/src/')) continue;
    const cand = join(ROOT, spec.slice(1));
    if (existsSync(cand)) roots.add(cand);
  }
}

const scriptFiles = [
  ...walkFiles(join(ROOT, 'scripts'), (n) => n.endsWith('.mjs')),
  ...walkFiles(join(ROOT, '.kiro/skills'), (n) => n.endsWith('.mjs')),
];
const externalTexts = scriptFiles.map((f) => ({ path: f, text: readFileSync(f, 'utf8') }));
const externalByPath = new Map(externalTexts.map((e) => [e.path, e.text]));
const directSrcRefsByScript = new Map();
const mjsEdges = new Map();

for (const { path: scriptPath, text } of externalTexts) {
  const refs = new Set();
  for (const m of text.matchAll(/\/(src\/[A-Za-z0-9_./-]+\.ts)/g)) {
    const cand = join(ROOT, m[1]);
    if (existsSync(cand)) {
      roots.add(cand);
      refs.add(cand);
    }
  }
  for (const m of text.matchAll(/['"`](src\/[A-Za-z0-9_./-]+\.ts)['"`]/g)) {
    const cand = join(ROOT, m[1]);
    if (existsSync(cand)) refs.add(cand);
  }
  directSrcRefsByScript.set(scriptPath, refs);

  const deps = new Set();
  for (const m of text.matchAll(/(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"](\.[^'"]+\.mjs)['"]|import\s*\(\s*['"](\.[^'"]+\.mjs)['"]\s*\)/g)) {
    const spec = m[1] ?? m[2];
    const dep = resolve(dirname(scriptPath), spec);
    if (externalByPath.has(dep)) deps.add(dep);
  }
  mjsEdges.set(scriptPath, deps);
}

const externalScriptsByTs = new Map();
for (const { path: scriptPath } of externalTexts) {
  const seenMjs = new Set([scriptPath]);
  const mjsQueue = [scriptPath];
  const targetQueue = [];
  while (mjsQueue.length > 0) {
    const cur = mjsQueue.shift();
    for (const target of directSrcRefsByScript.get(cur) ?? []) targetQueue.push(target);
    for (const dep of mjsEdges.get(cur) ?? []) {
      if (!seenMjs.has(dep)) {
        seenMjs.add(dep);
        mjsQueue.push(dep);
      }
    }
  }
  const seenTs = new Set(targetQueue);
  while (targetQueue.length > 0) {
    const target = targetQueue.shift();
    if (!externalScriptsByTs.has(target)) externalScriptsByTs.set(target, new Set());
    externalScriptsByTs.get(target).add(scriptPath);
    for (const child of starExportChildren.get(target) ?? []) {
      if (!seenTs.has(child)) {
        seenTs.add(child);
        targetQueue.push(child);
      }
    }
  }
}

const visited = new Set();
const queue = [...roots];
for (const r of queue) visited.add(r);
while (queue.length > 0) {
  const cur = queue.shift();
  for (const next of graph.get(cur)?.edges ?? []) {
    if (!visited.has(next)) {
      visited.add(next);
      queue.push(next);
    }
  }
}

const unreachable = tsFiles
  .filter((f) => !visited.has(f))
  .map((f) => relative(ROOT, f))
  .filter((rel) => !rel.startsWith('src/chapters/generated/') && !rel.startsWith('src/cinematic/generated/'));

const deadExports = [];
const deadTypes = [];
for (const file of tsFiles) {
  const rel = relative(ROOT, file);
  if (rel.startsWith('src/chapters/generated/') || rel.startsWith('src/cinematic/generated/')) continue;
  if (publicTree.has(file)) continue;
  const imported = importedByTarget.get(file) ?? new Set();
  if (imported.has('*')) continue;
  const fileExternalCorpus = [...(externalScriptsByTs.get(file) ?? [])]
    .map((p) => externalByPath.get(p) ?? '')
    .join('\n');
  const { sf } = graph.get(file);
  for (const name of valueExportsOf(sf)) {
    if (imported.has(name)) continue;
    const rx = new RegExp(`\\b${name}\\b`, 'g');
    if (rx.test(fileExternalCorpus)) continue;
    deadExports.push(`${rel}: ${name}`);
  }
  const { types, valueRefs } = typeExportsOf(sf);
  const liveTypes = new Set();
  for (const name of types.keys()) {
    if (imported.has(name) || valueRefs.has(name) || new RegExp(`\\b${name}\\b`).test(fileExternalCorpus)) {
      liveTypes.add(name);
    }
  }
  let typeChanged = true;
  while (typeChanged) {
    typeChanged = false;
    for (const live of [...liveTypes]) {
      for (const ref of types.get(live) ?? []) {
        if (types.has(ref) && !liveTypes.has(ref)) {
          liveTypes.add(ref);
          typeChanged = true;
        }
      }
    }
  }
  for (const name of types.keys()) {
    if (!liveTypes.has(name)) deadTypes.push(`${rel}: type ${name}`);
  }
}

const cssFiles = [
  ...walkFiles(SRC, (n) => n.endsWith('.css')),
  ...walkFiles(PAGES, (n) => n.endsWith('.css')),
].sort();
const cssTextByPath = new Map(cssFiles.map((f) => [f, readFileSync(f, 'utf8')]));
const htmlFiles = walkFiles(PAGES, (n) => n.endsWith('.html'));
const viteConfigPath = join(ROOT, 'vite.config.ts');
const seedCssHolders = [
  ...[...visited].map((f) => readFileSync(f, 'utf8')),
  ...htmlFiles.map((f) => readFileSync(f, 'utf8')),
  ...(existsSync(viteConfigPath) ? [readFileSync(viteConfigPath, 'utf8')] : []),
];
const reachableCss = new Set();
const cssQueue = [];
for (const css of cssFiles) {
  const name = basename(css);
  if (seedCssHolders.some((text) => text.includes(name))) {
    reachableCss.add(css);
    cssQueue.push(css);
  }
}
while (cssQueue.length > 0) {
  const holder = cssQueue.shift();
  const text = cssTextByPath.get(holder) ?? '';
  for (const css of cssFiles) {
    if (!reachableCss.has(css) && text.includes(basename(css))) {
      reachableCss.add(css);
      cssQueue.push(css);
    }
  }
}
const deadCss = cssFiles.filter((css) => !reachableCss.has(css)).map((css) => relative(ROOT, css));

if (unreachable.length > 0 || deadExports.length > 0 || deadTypes.length > 0 || deadCss.length > 0) {
  if (unreachable.length > 0) {
    console.error(`deadcode gate FAIL: ${unreachable.length} unreachable module(s):`);
    for (const rel of unreachable) console.error(`  - ${rel}`);
  }
  if (deadExports.length > 0) {
    console.error(`deadcode gate FAIL: ${deadExports.length} unused export(s):`);
    for (const entry of deadExports) console.error(`  - ${entry}`);
  }
  if (deadTypes.length > 0) {
    console.error(`deadcode gate FAIL: ${deadTypes.length} unused exported type(s):`);
    for (const entry of deadTypes) console.error(`  - ${entry}`);
  }
  if (deadCss.length > 0) {
    console.error(`deadcode gate FAIL: ${deadCss.length} unreferenced stylesheet(s):`);
    for (const rel of deadCss) console.error(`  - ${rel}`);
  }
  process.exit(1);
}

console.log(`deadcode gate OK (${tsFiles.length} modules reachable, ${cssFiles.length} stylesheets used, 0 dead exports/types)`);
