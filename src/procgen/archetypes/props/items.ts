/**
 * Items and graveyard props: a document, a tar crate, a fuse, a log tombstone.
 * Props do not glow: light is reserved for things the player should look at.
 * Briefs: .kiro/skills/haunted-art-direction/references/world-lexicon.md
 */
import { makeRng } from '../../core/rng.js';
import type { ModelSpec, PartSpec, Vec2 } from '../../core/types.js';
import {
  kitBox, kitDisc, kitPlate, offsetParts, outlineArch, outlineRoundRect, outlineStroke, outlineSymmetric, SCREEN_LEFT, SCREEN_RIGHT,
  greebleDipChip, tiltParts,
} from '../../kit/greebles.js';

// ---------------------------------------------------------------- prop.file

export function buildFile(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const W = 0.32, H = 0.4;
  // The folded corner is the top screen-right one.
  const R = SCREEN_RIGHT;
  const card: Vec2[] = [[-W / 2 * R, -H / 2], [W / 2 * R, -H / 2], [W / 2 * R, H / 2 - 0.1], [(W / 2 - 0.1) * R, H / 2], [-W / 2 * R, H / 2]];
  const fold: Vec2[] = [[W / 2 * R, H / 2 - 0.1], [(W / 2 - 0.1) * R, H / 2], [(W / 2 - 0.1) * R, H / 2 - 0.1]];
  const line = (i: number, w: number, y: number): PartSpec =>
    kitBox(`line${i}`, [w, 0.034, 0.01], 'ink', [(W * 0.76 - w) / 2 * SCREEN_LEFT, y, -0.022], { outline: false });
  let parts: PartSpec[] = [
    kitPlate('card', card, 0.03, 'paper', [0, 0, 0], { texture: 'tex.paper-lines' }),
    kitPlate('fold', fold, 0.012, 'plastic', [0, 0, -0.02]),
    line(0, 0.13, 0.085),
    line(1, 0.24, 0.0),
    line(2, 0.19, -0.085),
  ];
  // Lean it against nothing, a little, pivoting on the corner it leans toward so it stays on the floor.
  const lean = rng.range(0.05, 0.13) * (rng.chance(0.5) ? 1 : -1);
  parts = tiltParts(offsetParts(parts, [0, H / 2, 0]), lean, [lean > 0 ? -W / 2 : W / 2, 0]);
  return { id: 'prop.file', category: 'prop', label: 'File', parts, sockets: { label: [0, H + 0.14, 0], fx: [0, H / 2, -0.05] } };
}

// ---------------------------------------------------------------- prop.tar

export function buildTar(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const platters = rng.int(3, 4);
  const W = 0.92, D = 0.4;
  const board = 0.06, slab = 0.075, gap = 0.014;
  const stackH = platters * slab + (platters - 1) * gap;
  const H = board * 2 + stackH;
  const parts: PartSpec[] = [
    kitBox('pallet', [W, board, D], 'plastic', [0, board / 2, 0], { bevel: 0.01 }),
    kitBox('spindle', [0.16, stackH, D * 0.5], 'silicon', [0, board + stackH / 2, 0]),
  ];
  for (let i = 0; i < platters; i++) {
    const y = board + slab / 2 + i * (slab + gap);
    parts.push(kitPlate(`platter${i}`, outlineRoundRect(W - 0.1, slab, slab / 2, 2), D - 0.04, 'solder', [0, y, 0]));
  }
  parts.push(kitBox('lid', [W, board, D], 'plastic', [0, H - board / 2, 0], { bevel: 0.01 }));
  for (const [side, sx] of [['l', 1], ['r', -1]] as const) {
    parts.push(
      kitBox(`strap.${side}`, [0.085, H + 0.02, D + 0.04], 'rubber', [0.27 * sx, H / 2 + 0.01, 0]),
      kitBox(`buckle.${side}`, [0.11, 0.07, 0.03], 'gold', [0.27 * sx, H * 0.56, -D / 2 - 0.03]),
    );
  }
  return { id: 'prop.tar', category: 'prop', label: 'Tar crate', parts, sockets: { label: [0, H + 0.14, 0], fx: [0, H / 2, -0.25] } };
}

// ---------------------------------------------------------------- prop.fuse

export function buildFuse(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const y = 0.085;
  const blown = rng.chance(0.3);
  const wire: Vec2[] = blown
    ? [[-0.13, 0], [-0.06, 0.02], [-0.03, -0.02]]
    : [[-0.13, 0], [-0.07, 0.022], [-0.02, -0.022], [0.03, 0.022], [0.08, -0.022], [0.13, 0]];
  const parts: PartSpec[] = [
    kitPlate('tube', outlineRoundRect(0.34, 0.11, 0.03, 2), 0.1, 'glass', [0, y, 0]),
    kitPlate('filament', outlineStroke(wire, 0.026), 0.02, 'copper', [0, y, -0.06], { outline: false }),
    kitPlate('cap.l', outlineRoundRect(0.1, 0.15, 0.03, 2), 0.15, 'gold', [0.19, y, 0], { bevel: 0.01 }),
    kitPlate('cap.r', outlineRoundRect(0.1, 0.15, 0.03, 2), 0.15, 'gold', [-0.19, y, 0], { bevel: 0.01 }),
  ];
  if (blown) parts.push(kitPlate('filament.stub', outlineStroke([[0.13, 0], [0.07, -0.02]], 0.026), 0.02, 'copper', [0, y, -0.06], { outline: false }));
  return { id: 'prop.fuse', category: 'prop', label: 'Fuse', parts, sockets: { label: [0, 0.32, 0], fx: [0, y, -0.1] } };
}

// ---------------------------------------------------------------- prop.tombstone

export function buildTombstone(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const W = 0.46, H = 0.8;
  const cy = H / 2 + 0.05;
  const lines = rng.int(3, 4);
  let stone: PartSpec[] = [
    // A chip package stood on end: legs down both sides.
    ...greebleDipChip({ name: 'slab', pos: [0, cy - 0.06, 0.07], width: W, height: H * 0.62, depth: 0.14, legs: 5, legLength: 0.07, legSides: 'x', notch: false, marks: 0 })
      .filter((p) => p.name !== 'slab.body'),
    kitPlate('slab.body', outlineArch(W, H, 8), 0.14, 'silicon', [0, cy, 0], { bevel: 0.02 }),
    // Pin-1 dot where the cross would be.
    kitDisc('dot', 0.04, 0.012, 'solder', [0, cy + 0.24, -0.075], { outline: false, sides: 8 }),
  ];
  // The epitaph, laser-etched: one long FATAL line and the stack trace under it.
  const widths = [0.3, 0.2, 0.26, 0.14];
  for (let i = 0; i < lines; i++) {
    const w = widths[i]!;
    stone.push(kitBox(`etch${i}`, [w, i === 0 ? 0.05 : 0.034, 0.01], 'solder', [(0.3 - w) / 2 * SCREEN_LEFT, cy + 0.1 - i * 0.095, -0.075], { outline: false }));
  }
  const lean = rng.range(0.03, 0.1) * (rng.chance(0.5) ? 1 : -1);
  stone = tiltParts(stone, lean, [0, 0]);
  const parts: PartSpec[] = [
    ...stone,
    kitPlate('mound', outlineSymmetric([[0.36, 0], [0.33, 0.06], [0.2, 0.1]]), 0.26, 'pcbDark', [0, 0.02, -0.02], { bevel: 0.012, texture: 'tex.pcb-traces' }),
  ];
  return { id: 'prop.tombstone', category: 'prop', label: 'Log tombstone', parts, sockets: { label: [0, H + 0.2, 0], fx: [0, cy, -0.1] } };
}
