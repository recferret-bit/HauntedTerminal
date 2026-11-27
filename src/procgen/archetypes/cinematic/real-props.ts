import { ModelCatalog } from '../../core/catalog.js';
import type { ModelSpec, PartSpec } from '../../core/types.js';
import { kitBox } from '../../kit/greebles.js';

// ---------------------------------------------------------------- prop.coffee_mug

function buildCoffeeMug(_seed: number): ModelSpec {
  // Proportions stay <= 0.6 depth/major ratio while scaling smoothly on desk tops.
  const parts: PartSpec[] = [
    { name: 'cup', shape: { kind: 'cylinder', rTop: 0.095, rBottom: 0.088, height: 0.34, sides: 12 }, zone: 'paper', pos: [0, 0.17, 0] },
    { name: 'coffee', shape: { kind: 'cylinder', rTop: 0.078, rBottom: 0.078, height: 0.04, sides: 10 }, zone: 'hair', pos: [0, 0.33, 0], outline: false },
    { name: 'handle', shape: { kind: 'torus', radius: 0.09, tube: 0.026 }, zone: 'paper', pos: [-0.085, 0.18, 0] },
    kitBox('band', [0.195, 0.055, 0.06], 'hoodie', [0, 0.11, -0.07]),
  ];
  return { id: 'prop.coffee_mug', category: 'prop', label: 'Coffee mug', parts, sockets: { fx: [0, 0.17, -0.1] }, tags: ['real-world'] };
}

// ---------------------------------------------------------------- prop.desk_lamp

function buildDeskLamp(_seed: number): ModelSpec {
  const parts: PartSpec[] = [
    { name: 'base', shape: { kind: 'cylinder', rTop: 0.14, rBottom: 0.16, height: 0.06, sides: 10 }, zone: 'rubber', pos: [0, 0.03, 0] },
    {
      name: 'arm',
      shape: { kind: 'tube', path: [[0, 0.05, 0], [-0.04, 0.58, -0.02], [-0.24, 0.9, -0.04]], radius: 0.032 },
      zone: 'silicon',
      pos: [0, 0, 0],
    },
    { name: 'shade', shape: { kind: 'cone', radius: 0.17, height: 0.22, sides: 8 }, zone: 'silicon', pos: [-0.27, 0.86, -0.04], rot: [0, 0, -0.5] },
    { name: 'bulb', shape: { kind: 'sphere', radius: 0.065 }, zone: 'lantern', pos: [-0.34, 0.72, -0.1], outline: false },
  ];
  return { id: 'prop.desk_lamp', category: 'prop', label: 'Desk lamp', parts, sockets: { fx: [-0.32, 0.74, -0.12] }, tags: ['real-world'] };
}

// ---------------------------------------------------------------- prop.pc_tower

function buildPcTower(_seed: number): ModelSpec {
  const w = 0.46;
  const h = 0.86;
  const d = 0.44;
  const parts: PartSpec[] = [
    kitBox('tower', [w, h, d], 'plastic', [0, h / 2, 0]),
    kitBox('tower-face', [w - 0.1, h - 0.1, 0.04], 'rubber', [0, h / 2, -d / 2 - 0.015]),
    kitBox('tower-bay.0', [w - 0.18, 0.08, 0.03], 'heatsink', [0, h - 0.16, -d / 2 - 0.03]),
    kitBox('tower-bay.1', [w - 0.18, 0.08, 0.03], 'heatsink', [0, h - 0.29, -d / 2 - 0.03]),
    kitBox('tower-led', [0.06, 0.06, 0.02], 'powerAmber', [-0.1, 0.18, -d / 2 - 0.038], { outline: false, anim: { type: 'blink', speed: 0.8 } }),
    kitBox('tower-button', [0.1, 0.1, 0.02], 'phosphor', [0.06, 0.18, -d / 2 - 0.038], { outline: false }),
  ];
  return { id: 'prop.pc_tower', category: 'prop', label: 'PC tower', parts, sockets: { fx: [0, h, -d / 2] }, tags: ['real-world'] };
}

// ---------------------------------------------------------------- prop.bookshelf

function buildBookshelf(_seed: number): ModelSpec {
  const books: Array<readonly ['denim' | 'hoodie' | 'paper' | 'plastic' | 'skin', number]> = [
    ['hoodie', 0.46],
    ['paper', 0.4],
    ['denim', 0.52],
    ['plastic', 0.38],
    ['hoodie', 0.44],
    ['denim', 0.48],
  ];
  const cy = 0.2;
  const parts: PartSpec[] = [
    kitBox('shelf', [1.72, 0.12, 0.3], 'hair', [0, cy, 0]),
    kitBox('backboard', [1.62, 0.22, 0.05], 'hair', [0, cy + 0.16, 0.12]),
    kitBox('bracket.l', [0.1, 0.18, 0.22], 'hair', [0.64, 0.09, 0.02]),
    kitBox('bracket.r', [0.1, 0.18, 0.22], 'hair', [-0.64, 0.09, 0.02]),
  ];
  books.forEach(([zoneId, bh], i) => {
    const bx = 0.52 - i * 0.2;
    parts.push(kitBox(`book.${i}`, [0.17, bh, 0.22], zoneId, [bx, cy + 0.055 + bh / 2, -0.01]));
  });
  return { id: 'prop.bookshelf', category: 'prop', label: 'Bookshelf', parts, sockets: { fx: [0, cy + 0.3, -0.15] }, tags: ['hover', 'wall', 'real-world'] };
}

// ---------------------------------------------------------------- prop.wall_poster

function buildWallPoster(_seed: number): ModelSpec {
  const cy = 0.62;
  const parts: PartSpec[] = [
    kitBox('poster', [0.8, 1.05, 0.04], 'paper', [0, cy, 0]),
    kitBox('poster-art', [0.54, 0.54, 0.04], 'denim', [0, cy + 0.12, -0.02]),
    kitBox('poster-title', [0.46, 0.1, 0.03], 'hoodie', [0, cy - 0.3, -0.02]),
    kitBox('poster-pin', [0.08, 0.06, 0.04], 'plastic', [0, cy + 0.47, -0.02]),
  ];
  return { id: 'prop.wall_poster', category: 'prop', label: 'Wall poster', parts, sockets: { fx: [0, cy, -0.06] }, tags: ['hover', 'wall', 'real-world'] };
}

// ---------------------------------------------------------------- prop.sticky_note

function buildStickyNote(_seed: number): ModelSpec {
  const cy = 0.32;
  const parts: PartSpec[] = [
    kitBox('note', [0.32, 0.32, 0.04], 'gold', [0, cy, 0]),
    kitBox('board', [0.36, 0.1, 0.04], 'paper', [0, cy + 0.14, -0.012]),
    kitBox('line.0', [0.2, 0.036, 0.02], 'ink', [0.01, cy + 0.01, -0.022], { outline: false }),
    kitBox('line.1', [0.15, 0.036, 0.02], 'ink', [0.03, cy - 0.06, -0.022], { outline: false }),
  ];
  return { id: 'prop.sticky_note', category: 'prop', label: 'Sticky note', parts, sockets: { fx: [0, cy, -0.06] }, tags: ['hover', 'wall', 'real-world'] };
}

ModelCatalog.register({
  id: 'prop.coffee_mug',
  category: 'prop',
  label: 'Coffee mug',
  lore: 'A ceramic mug on the developer desk. Real-world prop placed by comix stage.props.',
  build: buildCoffeeMug,
});
ModelCatalog.register({
  id: 'prop.desk_lamp',
  category: 'prop',
  label: 'Desk lamp',
  lore: 'An articulated desk lamp with a warm glowing bulb. Real-world prop placed by comix stage.props.',
  build: buildDeskLamp,
});
ModelCatalog.register({
  id: 'prop.pc_tower',
  category: 'prop',
  label: 'PC tower',
  lore: 'The developer desktop tower on his desk, lightning target in the opening comix.',
  build: buildPcTower,
});
ModelCatalog.register({
  id: 'prop.bookshelf',
  category: 'prop',
  label: 'Bookshelf',
  lore: 'A wooden wall bookshelf lined with manuals and paperbacks. Real-world prop.',
  build: buildBookshelf,
});
ModelCatalog.register({
  id: 'prop.wall_poster',
  category: 'prop',
  label: 'Wall poster',
  lore: 'A framed retro poster taped to the developer wall. Real-world prop.',
  build: buildWallPoster,
});
ModelCatalog.register({
  id: 'prop.sticky_note',
  category: 'prop',
  label: 'Sticky note',
  lore: 'A yellow sticky note tacked beside the dawn window. Real-world prop.',
  build: buildStickyNote,
});
