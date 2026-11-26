#!/usr/bin/env node
/**
 * Detects runtime circular ES module dependencies in `src/` via TypeScript's AST scanner.
 * Type-only imports (`import type ...` / `import { type X }`) and type-only re-exports are ignored.
 * Exits 1 if any strongly connected component of size > 1 (or self-import) exists.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'src');

function walkTs(dir, out = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const full = join(dir, ent.name);
    if (ent.isDirectory()) walkTs(full, out);
    else if (ent.name.endsWith('.ts') && !ent.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), spec);
  const stripped = base.replace(/\.(js|jsx|mjs|ts|tsx|mts)$/, '');
  for (const cand of [`${stripped}.ts`, `${stripped}.tsx`, join(stripped, 'index.ts')]) {
    if (existsSync(cand)) return cand;
  }
  return null;
}

function hasValueSpecifier(clause) {
  if (!clause) return true; // side-effect import: import './foo.js'
  if (clause.isTypeOnly) return false;
  if (clause.name) return true; // default import
  const nb = clause.namedBindings;
  if (!nb) return false;
  if (ts.isNamespaceImport(nb)) return true;
  if (ts.isNamedImports(nb)) return nb.elements.some((el) => !el.isTypeOnly);
  return true;
}

function runtimeImportsOf(file) {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
  const deps = new Set();
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      if (!hasValueSpecifier(stmt.importClause)) continue;
      const target = resolveImport(file, stmt.moduleSpecifier.text);
      if (target) deps.add(target);
    } else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
      if (stmt.isTypeOnly) continue;
      if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        if (!stmt.exportClause.elements.some((el) => !el.isTypeOnly)) continue;
      }
      const target = resolveImport(file, stmt.moduleSpecifier.text);
      if (target) deps.add(target);
    }
  }
  return [...deps];
}

function findSccs(graph) {
  let index = 0;
  const idx = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const sccs = [];

  function visit(v) {
    idx.set(v, index);
    low.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of graph.get(v) ?? []) {
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), idx.get(w)));
      }
    }

    if (low.get(v) === idx.get(v)) {
      const comp = [];
      while (stack.length > 0) {
        const w = stack.pop();
        onStack.delete(w);
        comp.push(w);
        if (w === v) break;
      }
      if (comp.length > 1 || (comp.length === 1 && (graph.get(comp[0]) ?? []).includes(comp[0]))) {
        sccs.push(comp);
      }
    }
  }

  for (const node of graph.keys()) {
    if (!idx.has(node)) visit(node);
  }
  return sccs;
}

const files = walkTs(SRC).sort();
const graph = new Map(files.map((f) => [f, runtimeImportsOf(f)]));
const sccs = findSccs(graph);

if (sccs.length > 0) {
  console.error(`cycles gate FAIL: ${sccs.length} runtime circular dependency component(s) in src/:`);
  for (const comp of sccs) {
    console.error(`  - ${comp.map((f) => relative(ROOT, f)).sort().join(' <-> ')}`);
  }
  process.exit(1);
}

console.log(`cycles gate OK (${files.length} modules, 0 runtime cycles)`);
