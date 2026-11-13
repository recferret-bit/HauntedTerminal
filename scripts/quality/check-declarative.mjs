#!/usr/bin/env node
// Declarative gate: the runtime plays whatever the chapter specs say, so no code may name a chapter or a level.
//   node scripts/quality/check-declarative.mjs
// Fails on: a `chapter-NN-...` id, a level id (`level-NN-...`), or a branch on a level number
// (`spec.index === 4`, `levelIdx < 3`; "is this the first level" checks against 0 or 1 are fine) in the runtime layers. New behaviour = a field in the spec types,
// one interpreter branch in src/chapters/script.ts, one entry in src/chapter-editor/schema.ts.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SRC = resolve('src');
const AREAS = ['chapters', 'play', 'ui', 'pages', 'renderer', 'cinematic', 'sandbox', 'chapter-editor', 'comix-editor', 'hub', 'main.ts'];
const SKIP = ['chapters/generated/'];
const RULES = [
  { rx: /chapter-\d{2}-[a-z]/, what: 'a chapter id' },
  { rx: /level-\d{2}-[a-z]/, what: 'a level id' },
  { rx: /\b(?:spec|level|rt\.spec)\.index\s*(?:===|!==|<=|>=|<|>)\s*(?![01]\b)\d/, what: 'a branch on a level number' },
  { rx: /\blevelIdx\s*(?:===|!==|<=|>=|<|>)\s*\d/, what: 'a branch on a level number' },
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
      for (const { rx, what } of RULES) {
        if (rx.test(line)) {
          console.log(`HARD-CODED  src/${rel}:${i + 1} names ${what}: ${line.trim().slice(0, 100)}`);
          bad++;
        }
      }
    });
  }
}
console.log(bad ? `${bad} hard-coded chapter reference(s): move them into the chapter specs` : 'declarative gate OK');
process.exit(bad ? 1 : 0);
