#!/usr/bin/env node
// Lists procgen models, textures and FX presets the GAME never references (src/ minus src/procgen and src/lab).
//   node scripts/harness/asset-usage.mjs            (exit 1 if anything is unused)
//   node scripts/harness/asset-usage.mjs --json
// A reference is the id as a string literal anywhere in game code (e.g. 'malware.worm' in a cast table).
// Rooms are referenced through roomIdForKind(kind): every RoomKind the game can reach counts as used.
// Textures count as used when a model the game uses names them (PartSpec.texture).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { withProcgen, parseArgs, projectRoot } from './lib/load.mjs';

const args = parseArgs();
const skip = [resolve(projectRoot, 'src/procgen'), resolve(projectRoot, 'src/lab')];
let corpus = '';
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (skip.some((s) => p.startsWith(s))) continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|js|mjs|json)$/.test(name)) corpus += readFileSync(p, 'utf8') + '\n';
  }
})(resolve(projectRoot, 'src'));

await withProcgen(async (p) => {
  const has = (id) => corpus.includes(`'${id}'`) || corpus.includes(`"${id}"`) || corpus.includes(`\`${id}\``);
  const kinds = new Set([...corpus.matchAll(/'(desk|attic|crypt_entrance|crypt_hall|chasm|cell|lab_hall|catwalk|furnace|core|outro|intro)'/g)].map((m) => m[1]));
  const usesRooms = corpus.includes('roomIdForKind');
  const models = p.ModelCatalog.list();
  const usedModels = models.filter((e) => has(e.id) || (usesRooms && e.category === 'room' && kinds.has(e.id.slice(5))));
  const usedTex = new Set();
  for (const e of usedModels) for (const part of p.ModelCatalog.build(e.id, 1).parts) if (part.texture) usedTex.add(part.texture);
  const textures = p.TextureCatalog.list().map((t) => t.id);
  const fx = p.FxCatalog.list().map((f) => f.id);
  const report = {
    unusedModels: models.filter((e) => !usedModels.includes(e)).map((e) => e.id),
    unusedTextures: textures.filter((t) => !usedTex.has(t) && !has(t)),
    unusedFx: fx.filter((id) => !has(id)),
  };
  if (args.flag('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`models   ${models.length - report.unusedModels.length}/${models.length} used${report.unusedModels.length ? `; unused: ${report.unusedModels.join(', ')}` : ''}`);
    console.log(`textures ${textures.length - report.unusedTextures.length}/${textures.length} used${report.unusedTextures.length ? `; unused: ${report.unusedTextures.join(', ')}` : ''}`);
    console.log(`fx       ${fx.length - report.unusedFx.length}/${fx.length} used${report.unusedFx.length ? `; unused: ${report.unusedFx.join(', ')}` : ''}`);
  }
  process.exitCode = report.unusedModels.length + report.unusedTextures.length + report.unusedFx.length ? 1 : 0;
});
