#!/usr/bin/env node
// Connected-spec and 60fps timeline validator for comix/<slug>/.
//
//   node scripts/harness/validate-comix.mjs
//   node scripts/harness/validate-comix.mjs --comix intro
//   node scripts/harness/validate-comix.mjs --root /tmp/test-comix
//
// Checks:
//   1. Folder connectivity: every comix/<slug>/ has README.md, comix.manifest.json, and pages/page-XX-<name>/page.spec.json
//      matching manifest.pages[].specPath, with zero disconnected or legacy JSON files.
//   2. Compiled catalog sync (when checking the repo's default comix/ directory).
//   3. Full schema, ModelCatalog/FxCatalog, cue, rect, and 60fps simulation checks from src/comix-editor/check.ts.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { comixCatalogFile, comixDir, compileAllComix } from './lib/comix-compile.mjs';
import { parseArgs, withProcgen } from './lib/load.mjs';

const args = parseArgs(process.argv.slice(2), ['--root', '--comix']);
const customRoot = args.val('--root', '');
const targetRoot = customRoot ? resolve(customRoot) : comixDir;
const filterSlug = args.val('--comix', '');
const PAGE_PATH_RE = /^pages\/page-\d{2}-[a-z0-9-]+\/page\.spec\.json$/;

function walkJsonFiles(dir, base = '') {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const rel = base ? `${base}/${entry}` : entry;
    if (statSync(abs).isDirectory()) out.push(...walkJsonFiles(abs, rel));
    else if (entry.endsWith('.json')) out.push(rel);
  }
  return out.sort();
}

function loadComixFolder(rootDir, slug, problems) {
  const dir = join(rootDir, slug);
  if (!existsSync(join(dir, 'README.md'))) {
    problems.push(`comix/${slug}/README.md: missing human-readable sequence overview`);
  }
  const manifestFile = join(dir, 'comix.manifest.json');
  if (!existsSync(manifestFile)) {
    problems.push(`comix/${slug}/comix.manifest.json: missing`);
    return null;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  } catch (err) {
    problems.push(`comix/${slug}/comix.manifest.json: invalid JSON (${err.message})`);
    return null;
  }

  if (manifest.id !== slug) {
    problems.push(`comix/${slug}/comix.manifest.json: id "${manifest.id}" must match folder "${slug}"`);
  }
  if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) {
    problems.push(`comix/${slug}/comix.manifest.json: pages[] must list at least 1 page`);
    return null;
  }

  const expectedJson = new Set(['comix.manifest.json']);
  const pages = [];

  manifest.pages.forEach((summary, idx) => {
    const label = `comix/${slug}/comix.manifest.json pages[${idx}]`;
    if (!summary || typeof summary.specPath !== 'string') {
      problems.push(`${label}: missing specPath`);
      return;
    }
    if (!PAGE_PATH_RE.test(summary.specPath)) {
      problems.push(`${label}: specPath "${summary.specPath}" must match pages/page-XX-<slug>/page.spec.json`);
    }
    const expectedFolder = `pages/${summary.id}/page.spec.json`;
    if (summary.specPath !== expectedFolder) {
      problems.push(`${label}: specPath "${summary.specPath}" must match summary.id ("${expectedFolder}")`);
    }
    expectedJson.add(summary.specPath);
    const absPage = join(dir, summary.specPath);
    if (!existsSync(absPage)) {
      problems.push(`comix/${slug}/${summary.specPath}: file declared in manifest.pages does not exist`);
      return;
    }
    try {
      const spec = JSON.parse(readFileSync(absPage, 'utf8'));
      if (spec.id !== summary.id) {
        problems.push(`comix/${slug}/${summary.specPath}: page id "${spec.id}" disagrees with manifest summary id "${summary.id}"`);
      }
      pages.push(spec);
    } catch (err) {
      problems.push(`comix/${slug}/${summary.specPath}: invalid JSON (${err.message})`);
    }
  });

  for (const rel of walkJsonFiles(dir)) {
    if (!expectedJson.has(rel)) {
      problems.push(`comix/${slug}/${rel}: disconnected JSON file (not referenced in comix.manifest.json)`);
    }
  }

  return { slug, pack: { manifest, pages: pages.sort((a, b) => a.index - b.index) } };
}

if (!existsSync(targetRoot)) {
  console.error(`${targetRoot}: directory does not exist`);
  process.exit(1);
}

const slugs = readdirSync(targetRoot)
  .filter((name) => statSync(join(targetRoot, name)).isDirectory())
  .filter((name) => !filterSlug || name === filterSlug)
  .sort();

if (slugs.length === 0) {
  console.error(`No comix sequences found under ${targetRoot}`);
  process.exit(1);
}

const problems = [];
const loaded = [];
for (const slug of slugs) {
  const item = loadComixFolder(targetRoot, slug, problems);
  if (item) loaded.push(item);
}

if (!filterSlug) {
  const roleOwners = new Map();
  for (const { slug, pack } of loaded) {
    const role = pack.manifest.role;
    const playable = (pack.manifest.status ?? 'playable') === 'playable';
    if (!playable || (role !== 'opening' && role !== 'ending')) continue;
    if (roleOwners.has(role)) {
      problems.push(`comix/${slug}: duplicate playable "${role}" role (already claimed by "${roleOwners.get(role)}")`);
    } else {
      roleOwners.set(role, slug);
    }
  }
}

if (!customRoot && !filterSlug) {
  const { ts } = compileAllComix();
  const existing = existsSync(comixCatalogFile) ? readFileSync(comixCatalogFile, 'utf8') : '';
  if (existing !== ts) {
    problems.push('src/cinematic/generated/catalog-data.ts is out of sync with comix/*. Run: node scripts/harness/generate-comix.mjs');
  }
}

await withProcgen(async (_p, vite) => {
  const { checkComixPack } = await vite.ssrLoadModule('/src/comix-editor/check.ts');
  for (const { slug, pack } of loaded) {
    const issues = checkComixPack(pack);
    for (const issue of issues) {
      if (issue.severity === 'error') {
        problems.push(`comix/${slug} [${issue.where}]: ${issue.message}`);
      } else {
        console.warn(`warn  comix/${slug} [${issue.where}]: ${issue.message}`);
      }
    }
  }
});

if (problems.length > 0) {
  for (const line of problems) console.error(`ERROR ${line}`);
  console.error(`${problems.length} comix problem(s)`);
  process.exit(1);
}

const totalPages = loaded.reduce((n, item) => n + item.pack.pages.length, 0);
console.log(`comix OK (${loaded.length} sequences, ${totalPages} connected pages)`);
