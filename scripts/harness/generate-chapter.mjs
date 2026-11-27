#!/usr/bin/env node
// Compiles all chapter folders under chapters/* into src/chapters/generated/catalog-data.ts and checks them.
//
//   node scripts/harness/generate-chapter.mjs              compile (writes the catalog)
//   node scripts/harness/generate-chapter.mjs --check      read-only: is the compiled catalog in sync with chapters/*?
//   node scripts/harness/generate-chapter.mjs --validate   read-only and fast: every static check (references, asset ids, field tables)
//   node scripts/harness/generate-chapter.mjs --verify     compile, validate, then a headless playthrough of every level under
//                                                          enemy tick pressure (--ticks N, default 2) asserting 0 deaths
//   node scripts/harness/generate-chapter.mjs --format     canonicalize JSON formatting across chapters/* (before compile)
// The static checks are the chapter editor's Check tab (src/chapter-editor/check.ts): a human and an agent see the same errors.
// Options: --chapter <slug> limits --validate/--verify/--format to one chapter. Exit 1 on any error.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stringifyChapterJson } from './lib/chapter-json.mjs';
import { writeAtomicText } from './lib/editor-api-common.mjs';
import { parseArgs, withProcgen } from './lib/load.mjs';
import { catalogFile, chaptersDir, compileAll, writeCatalog } from './lib/chapter-compile.mjs';

const args = parseArgs(process.argv.slice(2), ['--ticks', '--chapter']);
const ticksPerCmd = Number(args.val('--ticks', 2));
const filterChapter = args.val('--chapter', '');

if (args.flag('--format')) {
  const { chapters: rawChapters } = compileAll();
  let formatted = 0;
  const writeIfChanged = (absPath, value, relPath) => {
    const next = stringifyChapterJson(value, relPath);
    const prev = existsSync(absPath) ? readFileSync(absPath, 'utf8') : '';
    if (prev === next) return;
    writeAtomicText(absPath, next);
    formatted += 1;
  };
  for (const c of rawChapters) {
    if (filterChapter && c.slug !== filterChapter) continue;
    writeIfChanged(resolve(chaptersDir, c.slug, 'chapter.manifest.json'), c.manifest, 'chapter.manifest.json');
    for (const l of c.levels) writeIfChanged(resolve(chaptersDir, c.slug, l.path), l.spec, l.path);
    if (c.dialogsPath && c.dialogs) writeIfChanged(resolve(chaptersDir, c.slug, c.dialogsPath), c.dialogs, c.dialogsPath);
    if (c.comixPath && c.comix) writeIfChanged(resolve(chaptersDir, c.slug, c.comixPath), c.comix, c.comixPath);
  }
  console.log(`formatted chapters/* (${formatted} file(s) updated)`);
}

const { chapters, ts: generatedTs } = compileAll();
const levelsByChapter = Object.fromEntries(
  chapters.filter((c) => c.levels.length > 0).map((c) => [c.slug, c.levels.map((l) => l.spec).sort((a, b) => a.index - b.index)]),
);

const readOnly = args.flag('--check') || args.flag('--validate');
if (args.flag('--check')) {
  const existing = existsSync(catalogFile) ? readFileSync(catalogFile, 'utf8') : '';
  if (existing !== generatedTs) {
    console.error('catalog-data.ts is out of sync with chapters/*. Run: node scripts/harness/generate-chapter.mjs');
    process.exit(1);
  }
  console.log('catalog-data.ts is in sync with chapters/*');
} else if (!readOnly) {
  writeCatalog(generatedTs);
  console.log(
    `generated ${catalogFile} (${chapters.length} manifests, ${Object.keys(levelsByChapter).length} playable level packs)`,
  );
}

if (args.flag('--validate') || args.flag('--verify')) {
  const playthrough = args.flag('--verify');
  await withProcgen(async (_p, vite) => {
    const { checkPack } = await vite.ssrLoadModule('/src/chapter-editor/check.ts');
    const { solvePack } = await vite.ssrLoadModule('/src/chapters/solve.ts');
    let failed = false;

    for (const c of chapters) {
      if (c.levels.length === 0 || (filterChapter && c.slug !== filterChapter)) continue;
      const pack = { manifest: c.manifest, levels: c.levels.map((l) => l.spec).sort((a, b) => a.index - b.index), dialogs: c.dialogs, comix: c.comix };

      const issues = checkPack(pack);
      for (const i of issues) console.log(`${i.severity === 'error' ? 'ERROR' : 'warn '} [${c.slug}] ${i.where}: ${i.message}`);
      const errors = issues.filter((i) => i.severity === 'error').length;
      if (errors > 0) failed = true;
      console.log(`checked [${c.slug}]: ${pack.levels.length} levels, ${errors} error(s), ${issues.length - errors} warning(s)`);
      if (!playthrough) continue;

      const report = solvePack(pack, { ticks: ticksPerCmd });
      for (const l of report.levels) if (!l.ok) console.error(`FAIL [${c.slug}] ${l.levelId}: ${l.problem ?? 'unsolved'}`);
      if (!report.ok) failed = true;
      else console.log(`verified [${c.slug}]: ${report.levels.length} levels cleared, cmds=${report.commands}, deaths=${report.deaths}`);
    }
    if (failed) process.exit(1);
  });
}
