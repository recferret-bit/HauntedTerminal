#!/usr/bin/env node
// Compiles all chapter folders under chapters/* into src/chapters/generated/catalog-data.ts.
//
//   node scripts/harness/generate-chapter.mjs           compile (writes the catalog)
//   node scripts/harness/generate-chapter.mjs --check   read-only: is the compiled catalog in sync with chapters/*?
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from './lib/load.mjs';
import { catalogFile, compileAll, writeCatalog } from './lib/chapter-compile.mjs';

const args = parseArgs(process.argv.slice(2), []);

const { chapters, ts: generatedTs } = compileAll();
const levelsByChapter = Object.fromEntries(
  chapters.filter((c) => c.levels.length > 0).map((c) => [c.slug, c.levels.map((l) => l.spec).sort((a, b) => a.index - b.index)]),
);

if (args.flag('--check')) {
  const existing = existsSync(catalogFile) ? readFileSync(catalogFile, 'utf8') : '';
  if (existing !== generatedTs) {
    console.error('catalog-data.ts is out of sync with chapters/*. Run: node scripts/harness/generate-chapter.mjs');
    process.exit(1);
  }
  console.log('catalog-data.ts is in sync with chapters/*');
} else {
  writeCatalog(generatedTs);
  console.log(
    `generated ${catalogFile} (${chapters.length} manifests, ${Object.keys(levelsByChapter).length} playable level packs)`,
  );
}
