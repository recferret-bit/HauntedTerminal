#!/usr/bin/env node
// Harness smoke test: builds a throwaway model, rasterizes it, builds the Three.js group, writes a PNG.
//   node scripts/harness/smoke.mjs [out.png]
import { resolve } from 'node:path';
import { withProcgen, projectRoot } from './lib/load.mjs';
import { writePng } from './lib/png.mjs';

await withProcgen(async (p) => {
  const spec = {
    id: 'prop.smoke', category: 'prop', label: 'smoke chip',
    parts: [
      { name: 'board', shape: { kind: 'box', size: [1.2, 0.12, 0.6], bevel: 0.02 }, zone: 'pcb', pos: [0, 0.06, 0] },
      { name: 'chip', shape: { kind: 'box', size: [0.5, 0.5, 0.3], bevel: 0.03 }, zone: 'silicon', pos: [0, 0.36, 0] },
      { name: 'led', shape: { kind: 'sphere', radius: 0.06 }, zone: 'phosphor', pos: [0.15, 0.42, -0.16], outline: false },
      { name: 'horn', shape: { kind: 'extrude', outline: [[0, 0], [0.12, 0], [0.3, 0.4], [0.2, 0.42]], depth: 0.1 }, zone: 'corruptMagenta', pos: [0.2, 0.6, 0] },
      { name: 'cable', shape: { kind: 'tube', path: [[-0.5, 0.12, 0], [-0.7, 0.5, 0], [-0.3, 0.7, 0]], radius: 0.03 }, zone: 'rubber', pos: [0, 0, 0] },
      { name: 'aura', shape: { kind: 'sphere', radius: 0.3 }, zone: 'ghostViolet', pos: [-0.3, 0.75, 0] },
    ],
  };
  const r = p.rasterizeModel(spec, { size: 256 });
  const built = p.buildModel(spec);
  const ok = r.filled > 2000 && [...r.coverage].every((c) => c > 0) && built.group.children.length === spec.parts.length;
  const out = writePng(resolve(projectRoot, process.argv[2] ?? 'scripts/harness/out/smoke.png'), r.image);
  console.log(`${ok ? 'PASS' : 'FAIL'} smoke: ${r.image.width}x${r.image.height}, filled ${r.filled}px, coverage [${[...r.coverage].join(', ')}], ${built.group.children.length} meshes -> ${out}`);
  process.exitCode = ok ? 0 : 1;
});
