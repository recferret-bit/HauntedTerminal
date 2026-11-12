/**
 * Outlines traced from the agents' real marks, so the parodies read as their logo at a glance.
 * Model space: centred on the mark, y up, 1 unit = 1 world unit, world +x is screen-left (already mirrored).
 *
 * CODEX_* are the Codex icon (24 x 24 viewBox, cloud spans 3..21) flattened and scaled by 0.064, so the
 * cloud is 1.15 units across. The `>` and `_` are its cut-outs.
 */
import type { Vec2 } from '../../core/types.js';

/** The six-lobed Codex cloud. */
export const CODEX_CLOUD: Vec2[] = [
  [0.188, 0.554], [0.116, 0.573], [0.042, 0.574], [-0.005, 0.565], [-0.049, 0.548], [-0.132, 0.491], [-0.214, 0.5],
  [-0.253, 0.497], [-0.311, 0.481], [-0.376, 0.446], [-0.424, 0.404], [-0.461, 0.353], [-0.489, 0.29], [-0.5, 0.205],
  [-0.492, 0.131], [-0.541, 0.063], [-0.569, -0.012], [-0.576, -0.078], [-0.56, -0.172], [-0.532, -0.231], [-0.492, -0.281],
  [-0.425, -0.332], [-0.36, -0.36], [-0.326, -0.436], [-0.287, -0.485], [-0.235, -0.529], [-0.175, -0.559], [-0.108, -0.574],
  [-0.017, -0.571], [0.06, -0.543], [0.132, -0.491], [0.174, -0.499], [0.226, -0.5], [0.314, -0.481], [0.372, -0.45],
  [0.423, -0.405], [0.464, -0.351], [0.487, -0.296], [0.501, -0.21], [0.491, -0.133], [0.544, -0.059], [0.573, 0.029],
  [0.575, 0.104], [0.557, 0.18], [0.534, 0.228], [0.484, 0.289], [0.428, 0.331], [0.361, 0.359], [0.332, 0.426],
  [0.296, 0.477], [0.252, 0.517],
];

/** The `>` of the prompt. */
export const CODEX_CHEVRON: Vec2[] = [
  [0.226, 0.177], [0.245, 0.193], [0.27, 0.196], [0.291, 0.184], [0.302, 0.161], [0.297, 0.137], [0.216, -0.005],
  [0.302, -0.154], [0.302, -0.167], [0.292, -0.19], [0.271, -0.203], [0.246, -0.2], [0.227, -0.184], [0.128, -0.01],
  [0.133, 0.014],
];

/** The `_` cursor of the prompt. */
export const CODEX_CURSOR: Vec2[] = [
  [-0.035, -0.122], [-0.012, -0.131], [0.004, -0.163], [-0.012, -0.195], [-0.035, -0.204], [-0.268, -0.204],
  [-0.293, -0.197], [-0.309, -0.176], [-0.309, -0.15], [-0.293, -0.129], [-0.281, -0.124],
];

/**
 * The icon's gradient as three flat bands, as heights in the cloud's frame: lilac above the first,
 * indigo below the second. The sky middle is kept widest so it is the dominant (60/30/10) zone.
 */
export const CODEX_BANDS = { lilacAbove: 0.27, indigoBelow: -0.3 } as const;

/** Keep the part of a closed outline above the line y = k (Sutherland-Hodgman against one half-plane). */
export function clipAbove(o: Vec2[], k: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < o.length; i++) {
    const a = o[i]!;
    const b = o[(i + 1) % o.length]!;
    const ia = a[1] >= k;
    const ib = b[1] >= k;
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (k - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, k]);
    }
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
