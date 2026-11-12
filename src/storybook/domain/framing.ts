import type { Vec3 } from '../../procgen/core/types.js';
import { pxPerUnit, type LabOptions } from './options.js';

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/** What framing needs to know about a subject: what it is and the box around its rest pose. */
export interface FrameTarget {
  kind: 'model' | 'texture' | 'fx';
  bounds: Bounds;
}

export interface Framing {
  centerX: number;
  centerY: number;
  /** CSS pixels per world unit. */
  ppu: number;
  /** False when the subject had to be shrunk to fit and no longer shares the gallery scale. */
  toScale: boolean;
}

/** World units along each edge of a gallery cell. Bosses are up to 2.6 tall. */
export const CELL_UNITS = 3;
/** World y at the bottom edge of a to-scale cell, so the ground line sits a little above it. */
const CELL_FLOOR = -0.25;
/** Vibecoder height: the yardstick every size in the art bible is given against. */
export const VIBECODER_HEIGHT = 1.6;

/** Gallery: every cell shows the same CELL_UNITS window at the same scale, unless the subject cannot fit. */
export function galleryFraming(subject: FrameTarget, ppu: number, cellPx: number): Framing {
  const { min, max } = subject.bounds;
  const w = max[0] - min[0];
  const span = cellPx / ppu;
  const fits = w <= span - 0.1 && max[1] <= CELL_FLOOR + span - 0.05 && min[1] >= CELL_FLOOR;
  if (fits && subject.kind !== 'texture') {
    return { centerX: (min[0] + max[0]) / 2, centerY: CELL_FLOOR + span / 2, ppu, toScale: true };
  }
  const h = max[1] - Math.min(min[1], 0);
  const fit = (cellPx * 0.88) / Math.max(w, h, 1e-3);
  return {
    centerX: (min[0] + max[0]) / 2,
    centerY: (Math.min(min[1], 0) + max[1]) / 2,
    ppu: subject.kind !== 'texture' ? Math.min(ppu, fit) : fit,
    // Re-centred but not shrunk: still at the shared scale.
    toScale: subject.kind !== 'texture' && fit >= ppu,
  };
}

/** Inspect: `fit` fills the panel; `game` and numeric scales are honest pixels per unit. */
export function inspectFraming(subject: FrameTarget, scale: LabOptions['scale'], width: number, height: number): Framing {
  const { min, max } = subject.bounds;
  // Always keep the ground (and the top of the plinth) in frame.
  const lo = Math.min(min[1], -0.3);
  const centerX = (min[0] + max[0]) / 2;
  const centerY = (lo + max[1]) / 2;
  const fixed = pxPerUnit(scale);
  if (fixed !== null) return { centerX, centerY, ppu: fixed, toScale: true };
  const w = Math.max(max[0] - min[0], 0.2);
  const h = Math.max(max[1] - lo, 0.2);
  return { centerX, centerY, ppu: Math.max(4, Math.min((width * 0.8) / w, (height * 0.74) / h)), toScale: true };
}
