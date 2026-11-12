#!/usr/bin/env node
// Layer gate: imports must point inward. Rules live in LAYERS below (first match wins per file).
//   node scripts/quality/check-layers.mjs
// A rule says which src/ areas a file may import (relative imports) and whether it may import `three`
// or the shader/material layer. Exit 1 on any violation.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const SRC = resolve('src');
/** area = path prefix under src/. `may` = areas it can import (own area always allowed). */
const LAYERS = [
  { area: 'contracts/', may: [], three: false },
  { area: 'procgen/core/', may: ['contracts/'], three: false },
  { area: 'procgen/geometry/', may: ['contracts/', 'procgen/core/'], three: true },
  { area: 'procgen/kit/', may: ['contracts/', 'procgen/core/', 'procgen/geometry/'], three: true },
  { area: 'procgen/textures/', may: ['contracts/', 'procgen/core/'], three: false },
  { area: 'procgen/archetypes/', may: ['contracts/', 'procgen/core/', 'procgen/kit/', 'procgen/geometry/'], three: true },
  { area: 'procgen/fx/', may: ['contracts/', 'procgen/core/', 'procgen/geometry/'], three: true },
  { area: 'procgen/anim/', may: ['contracts/', 'procgen/core/', 'procgen/geometry/'], three: true },
  { area: 'procgen/validate/', may: ['contracts/', 'procgen/core/', 'procgen/geometry/', 'procgen/textures/'], three: false },
  { area: 'procgen/runtime/', may: ['contracts/', 'procgen/', 'shaders/'], three: true },
  { area: 'procgen/index.ts', may: ['contracts/', 'procgen/', 'shaders/'], three: true },
  { area: 'shaders/', may: [], three: true },
  // Storybook: domain <- subjects <- stage <- ui <- app. The entry file only wires app and domain.
  { area: 'storybook/domain/', may: ['contracts/', 'procgen/core/'], three: false },
  { area: 'storybook/subjects/', may: ['storybook/domain/', 'procgen/', 'shaders/'], three: true },
  { area: 'storybook/stage/', may: ['storybook/domain/', 'storybook/subjects/', 'procgen/core/', 'shaders/'], three: true },
  { area: 'storybook/ui/', may: ['storybook/domain/', 'storybook/subjects/', 'storybook/stage/'], three: false },
  { area: 'storybook/app/', may: ['storybook/', 'procgen/', 'shaders/'], three: true },
  { area: 'storybook/fixtures.ts', may: ['procgen/core/'], three: false },
  { area: 'storybook/storybook.ts', may: ['storybook/app/', 'storybook/domain/'], three: false },
  // Gameplay. Dependencies point inward: contracts and procgen stay free of the game.
  // The play entry (main.ts) is the only file that wires every outer layer together.
  { area: 'assets/', may: [], three: true },
  { area: 'game/', may: ['contracts/', 'procgen/anim/', 'procgen/core/'], three: false },
  { area: 'chapters/', may: ['contracts/', 'game/'], three: false },
  { area: 'renderer/', may: ['contracts/', 'procgen/', 'shaders/', 'assets/'], three: true },
  { area: 'cinematic/', may: ['contracts/', 'procgen/', 'shaders/'], three: true },
  { area: 'ui/', may: ['contracts/', 'game/', 'chapters/', 'shaders/', 'renderer/'], three: false },
  { area: 'sandbox/', may: ['contracts/', 'game/', 'renderer/', 'ui/'], three: false },
  { area: 'pages/', may: ['contracts/', 'game/', 'chapters/'], three: false },
  { area: 'hub/', may: [], three: false },
  // Play page composition. main.ts only starts it. Helpers live in play/ so the entry stays small.
  { area: 'play/', may: ['assets/', 'chapters/', 'cinematic/', 'contracts/', 'game/', 'renderer/', 'sandbox/', 'ui/'], three: true },
  { area: 'main.ts', may: ['play/'], three: false },
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) yield p;
  }
}

const layerOf = (rel) => LAYERS.find((l) => rel.startsWith(l.area));
let bad = 0;
for (const file of walk(SRC)) {
  const rel = relative(SRC, file);
  const layer = layerOf(rel);
  if (!layer) { console.log(`NO LAYER  src/${rel}`); bad++; continue; }
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    if (spec === 'three' || spec.startsWith('three/')) {
      if (!layer.three) { console.log(`THREE     src/${rel} imports ${spec} (layer ${layer.area} is three-free)`); bad++; }
      continue;
    }
    if (!spec.startsWith('.')) continue;
    if (/\.css$/.test(spec)) continue;
    const target = relative(SRC, resolve(dirname(file), spec.replace(/\.js$/, '.ts')));
    if (target.startsWith('..')) continue;
    const ownArea = layer.area.endsWith('/') ? layer.area : '';
    const allowed = target.startsWith(ownArea || '\0') || layer.may.some((a) => target.startsWith(a)) || target === rel;
    if (!allowed) { console.log(`LAYER     src/${rel} -> src/${target} (${layer.area} may import: ${layer.may.join(', ') || 'nothing'})`); bad++; }
  }
}
console.log(bad ? `${bad} layer violation(s)` : 'layer gate OK');
process.exit(bad ? 1 : 0);
