#!/usr/bin/env node
// Renders an unregistered room builder to a PNG, so a draft can be looked at before it is registered.
//   node .kiro/skills/procedural-rooms-3d/examples/render-example.mjs [module] [exportName] [out.png] [seed]
// Defaults render examples/worked-room.ts -> scripts/harness/out/room-example.png
import { resolve } from 'node:path';
import { withProcgen, projectRoot } from '../../../../scripts/harness/lib/load.mjs';
import { writePng } from '../../../../scripts/harness/lib/png.mjs';

const [modulePath = '/.kiro/skills/procedural-rooms-3d/examples/worked-room.ts', exportName = 'buildOssuary', outArg = 'scripts/harness/out/room-example.png', seedArg = '1'] = process.argv.slice(2);

await withProcgen(async (p, vite) => {
  const mod = await vite.ssrLoadModule(modulePath);
  const build = mod[exportName];
  if (typeof build !== 'function') throw new Error(`${modulePath} has no exported function "${exportName}"`);
  const spec = build(Number(seedArg));
  const baked = p.bakeModel(spec);
  const bounds = p.modelBounds(baked);
  const r = p.rasterizeModel(spec, { size: 900, background: 0x211a36 }, baked);
  const out = writePng(resolve(projectRoot, outArg), r.image);
  console.log(`${spec.id}: ${spec.parts.length} parts, ${bounds.triCount} tris, sockets: ${Object.keys(spec.sockets ?? {}).join(', ')}`);
  console.log(`wrote ${out} (${r.image.width}x${r.image.height})`);
});
