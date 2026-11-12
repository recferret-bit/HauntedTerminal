import { ModelCatalog, TextureCatalog } from '../procgen/core/catalog.js';
import { fillRect, makePixels } from '../procgen/core/pixels.js';
import type { ModelSpec } from '../procgen/core/types.js';

/**
 * Lab self-test fixtures, loaded only with `?fixtures=1`. They are not game art: they exist so the
 * lab (and scripts/harness/screenshot-lab.mjs --selftest) can be exercised when the catalogs are
 * empty or broken, and they touch every feature: textures, ink on/off parts, emissive, ghost,
 * sockets and every AnimTag type the lab's fallback animator drives.
 */
function fixtureBug(): ModelSpec {
  return {
    id: 'malware.lab_fixture',
    category: 'malware',
    label: 'Lab fixture bug',
    sockets: { eye: [0.05, 0.62, -0.2], fx: [0, 1.05, 0], bubble: [0.4, 1.2, 0] },
    parts: [
      { name: 'body', shape: { kind: 'box', size: [0.9, 0.5, 0.32], bevel: 0.04 }, zone: 'silicon', pos: [0, 0.55, 0], texture: 'lab.fixture_grid', anim: { type: 'breathe', amp: 0.04, pivot: [0, 0.3, 0] } },
      { name: 'horn', shape: { kind: 'extrude', outline: [[0, 0], [0.16, 0], [0.34, 0.42], [0.22, 0.4]], depth: 0.12 }, zone: 'corruptMagenta', pos: [0.18, 0.78, 0], anim: { type: 'jitter', amp: 0.03 } },
      { name: 'horn_b', shape: { kind: 'extrude', outline: [[0, 0], [-0.14, 0], [-0.22, 0.3], [-0.14, 0.28]], depth: 0.12 }, zone: 'corruptViolet', pos: [-0.2, 0.78, 0] },
      { name: 'eye', shape: { kind: 'sphere', radius: 0.1 }, zone: 'malwareEye', pos: [0.05, 0.62, -0.17], outline: false, anim: { type: 'pulse', amp: 0.18, speed: 1.5 } },
      { name: 'led', shape: { kind: 'sphere', radius: 0.035 }, zone: 'lockRed', pos: [-0.3, 0.7, -0.17], outline: false, anim: { type: 'blink', speed: 2 } },
      { name: 'leg_l', shape: { kind: 'box', size: [0.08, 0.34, 0.08] }, zone: 'solder', pos: [0.3, 0.17, 0], anim: { type: 'legWalk', pivot: [0.3, 0.34, 0], amp: 0.4, speed: 1.4 } },
      { name: 'leg_r', shape: { kind: 'box', size: [0.08, 0.34, 0.08] }, zone: 'solder', pos: [-0.3, 0.17, 0], anim: { type: 'legWalk', pivot: [-0.3, 0.34, 0], amp: 0.4, speed: 1.4, phase: 0.5 } },
      { name: 'tail', shape: { kind: 'tube', path: [[-0.45, 0.5, 0], [-0.7, 0.75, 0], [-0.62, 1.0, 0]], radius: 0.03 }, zone: 'rubber', pos: [0, 0, 0], anim: { type: 'swing', axis: 'z', pivot: [-0.45, 0.5, 0], amp: 0.25, speed: 0.8 } },
      { name: 'shroud', shape: { kind: 'sphere', radius: 0.26 }, zone: 'ghostViolet', pos: [0.36, 1.0, 0], anim: { type: 'bob', amp: 0.06, speed: 0.7 } },
    ],
  };
}

function fixtureFan(): ModelSpec {
  return {
    id: 'prop.lab_fixture',
    category: 'prop',
    label: 'Lab fixture fan',
    sockets: { label: [0, 0.95, -0.1] },
    parts: [
      { name: 'frame', shape: { kind: 'box', size: [0.9, 0.9, 0.2], bevel: 0.03 }, zone: 'plastic', pos: [0, 0.45, 0.05] },
      { name: 'hub', shape: { kind: 'cylinder', rTop: 0.1, rBottom: 0.1, height: 0.1, sides: 8 }, zone: 'heatsink', pos: [0, 0.45, -0.1], rot: [Math.PI / 2, 0, 0] },
      { name: 'blade_a', shape: { kind: 'box', size: [0.7, 0.1, 0.03] }, zone: 'pcb', pos: [0, 0.45, -0.08], anim: { type: 'spin', axis: 'z', speed: 0.6 } },
      { name: 'blade_b', shape: { kind: 'box', size: [0.1, 0.7, 0.03] }, zone: 'pcb', pos: [0, 0.45, -0.08], anim: { type: 'spin', axis: 'z', speed: 0.6 } },
      { name: 'led', shape: { kind: 'sphere', radius: 0.04 }, zone: 'phosphor', pos: [0.36, 0.82, -0.06], outline: false, anim: { type: 'orbit', pivot: [0, 0.45, -0.06], speed: 0.25 } },
    ],
  };
}

export function registerFixtures(): void {
  if (!TextureCatalog.has('lab.fixture_grid')) {
    TextureCatalog.register({
      id: 'lab.fixture_grid',
      label: 'Lab fixture grid',
      usage: 'surface',
      tileable: true,
      build: () => {
        const buf = makePixels(32, 32, 0x2b2540);
        fillRect(buf, 0, 0, 32, 2, 0x110e1b);
        fillRect(buf, 0, 0, 2, 32, 0x110e1b);
        fillRect(buf, 10, 10, 12, 12, 0x1f7a5c);
        fillRect(buf, 14, 14, 4, 4, 0xe9b44c);
        return buf;
      },
    });
  }
  if (!ModelCatalog.has('malware.lab_fixture')) {
    ModelCatalog.register({ id: 'malware.lab_fixture', category: 'malware', label: 'Lab fixture bug', lore: 'Not game art. Exercises the storybook.', build: fixtureBug });
  }
  if (!ModelCatalog.has('prop.lab_fixture')) {
    ModelCatalog.register({ id: 'prop.lab_fixture', category: 'prop', label: 'Lab fixture fan', lore: 'Not game art. Exercises the storybook.', build: fixtureFan });
  }
}
