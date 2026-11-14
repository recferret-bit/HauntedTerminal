#!/usr/bin/env node
// Declarative gate: the runtime plays whatever the chapter and comix specs say, so no code may name a chapter, level, or comix scene.
//   node scripts/quality/check-declarative.mjs
// Fails on: a `chapter-NN-...` id, a level id (`level-NN-...`), a comix page id (`page-NN-...`), a comix sequence slug,
// or a branch on a level number (`spec.index === 4`, `levelIdx < 3`; "is this the first level" checks against 0 or 1 are fine) in runtime layers.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SRC = resolve('src');
const COMIX = resolve('comix');
const AREAS = ['chapters', 'play', 'ui', 'pages', 'renderer', 'cinematic', 'sandbox', 'chapter-editor', 'comix-editor', 'hub', 'main.ts'];
const SKIP = ['chapters/generated/', 'cinematic/generated/'];
const comixSlugs = existsSync(COMIX)
  ? readdirSync(COMIX).filter((n) => statSync(join(COMIX, n)).isDirectory() && /^[a-z0-9-]+$/.test(n))
  : [];
const nonPhaseComixSlugs = comixSlugs.filter((s) => s !== 'intro' && s !== 'outro');
const comixSlugRx = comixSlugs.length ? new RegExp(`['"\`](?:${comixSlugs.join('|')})['"\`]`) : null;
const comixCallRx = comixSlugs.length
  ? new RegExp(`\\b(?:playComix|getComixPack|getComixManifest|getComixPages|readDraftComixPack)\\s*\\(\\s*['"\`](?:${comixSlugs.join('|')})['"\`]`)
  : null;
const nonPhaseSlugRx = nonPhaseComixSlugs.length ? new RegExp(`['"\`](?:${nonPhaseComixSlugs.join('|')})['"\`]`) : null;
const RULES = [
  { rx: /chapter-\d{2}-[a-z]/, what: 'a chapter id' },
  { rx: /level-\d{2}-[a-z]/, what: 'a level id' },
  { rx: /page-\d{2}-[a-z]/, what: 'a comix page id' },
  { rx: /\b(?:spec|level|rt\.spec)\.index\s*(?:===|!==|<=|>=|<|>)\s*(?![01]\b)\d/, what: 'a branch on a level number' },
  { rx: /\blevelIdx\s*(?:===|!==|<=|>=|<|>)\s*\d/, what: 'a branch on a level number' },
  ...(comixSlugRx ? [{ rx: comixSlugRx, what: 'a comix sequence id', only: ['cinematic/', 'comix-editor/'] }] : []),
  ...(comixCallRx ? [{ rx: comixCallRx, what: 'a comix sequence id' }] : []),
  ...(nonPhaseSlugRx ? [{ rx: nonPhaseSlugRx, what: 'a comix sequence id' }] : []),
];

function* walk(path) {
  if (statSync(path).isFile()) {
    if (path.endsWith('.ts')) yield path;
    return;
  }
  for (const name of readdirSync(path)) yield* walk(join(path, name));
}

let bad = 0;
for (const area of AREAS) {
  for (const file of walk(join(SRC, area))) {
    const rel = relative(SRC, file);
    if (SKIP.some((s) => rel.startsWith(s))) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      for (const { rx, what, only } of RULES) {
        if (only && !only.some((prefix) => rel.startsWith(prefix))) continue;
        if (rx.test(line)) {
          console.log(`HARD-CODED  src/${rel}:${i + 1} names ${what}: ${line.trim().slice(0, 100)}`);
          bad++;
        }
      }
    });
  }
}
console.log(bad ? `${bad} hard-coded declarative reference(s): move them into chapters/ or comix/ specs` : 'declarative gate OK');
process.exit(bad ? 1 : 0);
