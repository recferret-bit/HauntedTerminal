/**
 * Outline makers for the parody agents (cast.ts): a lumpy clay mound, a puffy cartoon cloud, a disk
 * seen at an angle, and a half-plane clip for cel bands. Pure functions, model space (y up, world +x is
 * screen-left), outlines centred on their own origin unless stated.
 */
import type { Vec2 } from '../../core/types.js';
import type { Rng } from '../../core/rng.js';

const TAU = Math.PI * 2;

/**
 * A lumpy blob: an ellipse (rx, ry) whose radius wobbles in a few seeded bumps, cut flat at
 * y = `floor` so it can sit on the ground. Hand-squashed clay, not a geometric shape.
 */
export function lumpy(rng: Rng, rx: number, ry: number, floor: number, n = 36): Vec2[] {
  const waves = [2, 3, 5].map((k) => ({ k, amp: rng.range(0.03, 0.07), ph: rng.range(0, TAU) }));
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r = 1 + waves.reduce((s, w) => s + w.amp * Math.sin(w.k * a + w.ph), 0);
    const y = Math.max(floor, ry * r * Math.sin(a));
    const p: Vec2 = [rx * r * Math.cos(a), y];
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-4) pts.push(p);
  }
  return pts;
}

/**
 * A cartoon cloud: the union of `puffs` (centre and radius) traced from the origin, with a flat
 * bottom at y = `floor`. The origin must lie inside the union so every ray meets the outline once.
 */
export function puffCloud(puffs: { at: Vec2; r: number }[], floor: number, n = 56): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const d: Vec2 = [Math.cos(a), Math.sin(a)];
    let far = 0;
    for (const { at, r } of puffs) {
      // Farthest t where |t*d - at| = r.
      const b = d[0] * at[0] + d[1] * at[1];
      const disc = b * b - (at[0] * at[0] + at[1] * at[1] - r * r);
      if (disc >= 0) far = Math.max(far, b + Math.sqrt(disc));
    }
    let p: Vec2 = [d[0] * far, d[1] * far];
    if (p[1] < floor) p = [d[1] < 0 ? (d[0] * floor) / d[1] : p[0], floor];
    pts.push(p);
  }
  return pts;
}

/** Keep the part of a closed outline above (or below) the line y = k: Sutherland-Hodgman, one half-plane. */
export function clipHalf(o: Vec2[], k: number, keep: 'above' | 'below'): Vec2[] {
  const inside = (p: Vec2): boolean => (keep === 'above' ? p[1] >= k : p[1] <= k);
  const out: Vec2[] = [];
  for (let i = 0; i < o.length; i++) {
    const a = o[i]!;
    const b = o[(i + 1) % o.length]!;
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) out.push([a[0] + ((b[0] - a[0]) * (k - a[1])) / (b[1] - a[1]), k]);
  }
  return out;
}

/**
 * Half of a disk seen at an angle, as a flat band: the ellipse ring between `inner` and `outer`
 * ([major, minor] radii) from angle a0 to a1 in the disk's own frame, its major axis rolled by `tilt`.
 * a0..a1 = 0..π is the far half (upper side), π..2π the near half.
 */
export function diskHalf(inner: Vec2, outer: Vec2, a0: number, a1: number, tilt: number, steps = 14): Vec2[] {
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const at = (r: Vec2, a: number): Vec2 => {
    const u = r[0] * Math.cos(a);
    const v = r[1] * Math.sin(a);
    return [u * ct - v * st, u * st + v * ct];
  };
  const pts: Vec2[] = [];
  for (let i = 0; i <= steps; i++) pts.push(at(outer, a0 + ((a1 - a0) * i) / steps));
  for (let i = steps; i >= 0; i--) pts.push(at(inner, a0 + ((a1 - a0) * i) / steps));
  return pts;
}

/** A point on a disk-orbit ellipse ([major, minor] radii, rolled by `tilt`) at angle `t`, around `c`. */
export function diskPoint(c: Vec2, radii: Vec2, tilt: number, t: number): Vec2 {
  const u = radii[0] * Math.cos(t);
  const v = radii[1] * Math.sin(t);
  return [c[0] + u * Math.cos(tilt) - v * Math.sin(tilt), c[1] + u * Math.sin(tilt) + v * Math.cos(tilt)];
}
