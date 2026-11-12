/**
 * Outline and part helpers for relief modelling.
 * A model is drawn on the XY plane (the page) and given thickness along z. The camera sits on −z,
 * so "in front" means a smaller z, and world +x is SCREEN-LEFT.
 * Skill: .kiro/skills/procedural-kitbash-3d/SKILL.md
 */
import * as THREE from 'three';
import type { ZoneId } from '../core/palette.js';
import type { PartSpec, ShapeSpec, Vec2, Vec3 } from '../core/types.js';

/** Multiply an x coordinate by these to say which side of the SCREEN you mean. */
export const SCREEN_LEFT = 1;
export const SCREEN_RIGHT = -1;

/** Rotation that turns a y-axis shape (cylinder, lathe, cone) to face the camera. */
export const FACE_CAMERA: Vec3 = [Math.PI / 2, 0, 0];

/** The smallest feature that survives the pixel-art pass: 2 px at 58 px per unit. */
export const MIN_FEATURE = 0.035;

// ---------------------------------------------------------------- outlines (all centred on 0,0 unless noted)

export function outlineRect(w: number, h: number): Vec2[] {
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
}

/** Rounded rectangle. `r` is clamped to half the short side (which gives a stadium). */
export function outlineRoundRect(w: number, h: number, r: number, seg = 3): Vec2[] {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rad < 1e-4) return outlineRect(w, h);
  const out: Vec2[] = [];
  const corners: Array<[number, number, number]> = [
    [w / 2 - rad, -h / 2 + rad, -Math.PI / 2],
    [w / 2 - rad, h / 2 - rad, 0],
    [-w / 2 + rad, h / 2 - rad, Math.PI / 2],
    [-w / 2 + rad, -h / 2 + rad, Math.PI],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
    }
  }
  return dedupe(out);
}

/** Rectangle with 45-degree cut corners: the hardware answer to a rounded rectangle. */
export function outlineChamferRect(w: number, h: number, c: number): Vec2[] {
  const k = Math.min(c, w / 2, h / 2);
  return [
    [-w / 2 + k, -h / 2], [w / 2 - k, -h / 2], [w / 2, -h / 2 + k], [w / 2, h / 2 - k],
    [w / 2 - k, h / 2], [-w / 2 + k, h / 2], [-w / 2, h / 2 - k], [-w / 2, -h / 2 + k],
  ];
}

/** Circle or ellipse (`ry` defaults to `rx`). */
export function outlineEllipse(rx: number, ry = rx, seg = 16): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    out.push([Math.cos(a) * rx, Math.sin(a) * ry]);
  }
  return out;
}

/** A doorway: flat bottom, straight sides, round top. `pointed` > 0 lifts the crown into a gothic point. */
export function outlineArch(w: number, h: number, seg = 8, pointed = 0): Vec2[] {
  const r = w / 2;
  const springY = h / 2 - r - pointed;
  const out: Vec2[] = [[-r, -h / 2], [r, -h / 2]];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI;
    const lift = pointed * Math.sin(a);
    out.push([Math.cos(a) * r, springY + Math.sin(a) * r + lift]);
  }
  return out;
}

/** Symmetric trapezoid, `wBottom` wide at the bottom and `wTop` at the top. */
export function outlineTrapezoid(wBottom: number, wTop: number, h: number): Vec2[] {
  return [[-wBottom / 2, -h / 2], [wBottom / 2, -h / 2], [wTop / 2, h / 2], [-wTop / 2, h / 2]];
}

/** Lightning bolt filling a w × h box. */
export function outlineBolt(w: number, h: number): Vec2[] {
  const pts: Vec2[] = [[0.12, 0.5], [-0.42, -0.1], [-0.06, -0.1], [-0.24, -0.5], [0.42, 0.12], [0.06, 0.12], [0.34, 0.5]];
  return pts.map(([x, y]) => [x * w, y * h]);
}

/**
 * Comb: a bar with `count` teeth hanging below it. Bar spans y 0..barH, teeth span y −toothH..0.
 * Used for contact fingers, chip legs, heatsink fins (rotate or flip it with `outlineTransform`).
 * `duty` is tooth width / pitch.
 */
export function outlineComb(width: number, count: number, toothH: number, barH: number, duty = 0.55): Vec2[] {
  const n = Math.max(1, Math.round(count));
  const pitch = width / n;
  const tw = pitch * duty;
  const out: Vec2[] = [[-width / 2, barH], [-width / 2, 0]];
  for (let i = 0; i < n; i++) {
    const cx = -width / 2 + pitch * (i + 0.5);
    out.push([cx - tw / 2, 0], [cx - tw / 2, -toothH], [cx + tw / 2, -toothH], [cx + tw / 2, 0]);
  }
  out.push([width / 2, 0], [width / 2, barH]);
  return out;
}

/** Turn a polyline into a ribbon outline of constant `width` with mitred corners (traces, cracks, straps). */
export function outlineStroke(points: Vec2[], width: number): Vec2[] {
  const n = points.length;
  if (n < 2) return outlineRect(width, width);
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  const dir = (a: Vec2, b: Vec2): Vec2 => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const d0 = i > 0 ? dir(points[i - 1]!, p) : dir(p, points[i + 1]!);
    const d1 = i < n - 1 ? dir(p, points[i + 1]!) : d0;
    let nx = -(d0[1] + d1[1]), ny = d0[0] + d1[0];
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    const cos = Math.max(0.4, nx * -d0[1] + ny * d0[0]);
    const m = width / 2 / cos;
    left.push([p[0] + nx * m, p[1] + ny * m]);
    right.push([p[0] - nx * m, p[1] - ny * m]);
  }
  return [...left, ...right.reverse()];
}

/** Sample a sagging line from `a` to `b`: a parabola that hangs `sag` below the chord at its middle. */
export function sagPath(a: Vec2, b: Vec2, sag: number, seg = 8): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t)]);
  }
  return out;
}

/** Scale, rotate (radians, counter-clockwise in model space) and then move an outline. */
export function outlineTransform(pts: Vec2[], opts: { scale?: Vec2; rot?: number; move?: Vec2 }): Vec2[] {
  const [sx, sy] = opts.scale ?? [1, 1];
  const c = Math.cos(opts.rot ?? 0), s = Math.sin(opts.rot ?? 0);
  const [mx, my] = opts.move ?? [0, 0];
  return pts.map(([x, y]) => {
    const px = x * sx, py = y * sy;
    return [px * c - py * s + mx, px * s + py * c + my];
  });
}

/** Mirror an outline left-right. Use it to draw in screen coordinates (+x right) and convert once. */
export function outlineFlipX(pts: Vec2[]): Vec2[] {
  return pts.map(([x, y]) => [-x, y] as Vec2).reverse();
}

/** Build a symmetric outline from its x ≥ 0 half, listed bottom to top. */
export function outlineSymmetric(half: Vec2[]): Vec2[] {
  const mirrored = half.map(([x, y]) => [-x, y] as Vec2).reverse();
  return dedupe([...half, ...mirrored]);
}

function dedupe(pts: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-5) out.push(p);
  }
  const first = out[0], last = out[out.length - 1];
  if (out.length > 2 && first && last && Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-5) out.pop();
  return out;
}

// ---------------------------------------------------------------- shapes

/** A flat ring (washer) with a real hole, facing the camera once rotated by FACE_CAMERA. `depth` is its thickness. */
export function ringShape(rOuter: number, rInner: number, depth: number, sides = 20): ShapeSpec {
  const d = depth / 2;
  return { kind: 'lathe', profile: [[rInner, -d], [rOuter, -d], [rOuter, d], [rInner, d], [rInner, -d]], sides };
}

// ---------------------------------------------------------------- part constructors

export type PartExtra = Partial<Omit<PartSpec, 'name' | 'shape' | 'zone' | 'pos'>> & { bevel?: number };

function finish(name: string, shape: ShapeSpec, zone: ZoneId, pos: Vec3, extra: PartExtra | undefined): PartSpec {
  const { bevel: _bevel, ...rest } = extra ?? {};
  return { name, shape, zone, pos, ...rest };
}

/** `{ bevel }` when the part asks for one, else nothing (keeps the spec free of `bevel: undefined`). */
const bevelOf = (extra: PartExtra | undefined): { bevel?: number } => (extra?.bevel ? { bevel: extra.bevel } : {});

/** An extruded outline: the workhorse. `depth` is the thickness along z, centred on `pos[2]`. */
export function kitPlate(name: string, outline: Vec2[], depth: number, zone: ZoneId, pos: Vec3, extra?: PartExtra): PartSpec {
  const shape: ShapeSpec = { kind: 'extrude', outline, depth, ...bevelOf(extra) };
  return finish(name, shape, zone, pos, extra);
}

export function kitBox(name: string, size: Vec3, zone: ZoneId, pos: Vec3, extra?: PartExtra): PartSpec {
  const shape: ShapeSpec = { kind: 'box', size, ...bevelOf(extra) };
  return finish(name, shape, zone, pos, extra);
}

/** A disc facing the camera (a short cylinder whose axis is z). */
export function kitDisc(name: string, radius: number, depth: number, zone: ZoneId, pos: Vec3, extra?: PartExtra & { sides?: number }): PartSpec {
  const { sides, ...rest } = extra ?? {};
  const shape: ShapeSpec = { kind: 'cylinder', rTop: radius, rBottom: radius, height: depth, sides: sides ?? 12 };
  return finish(name, shape, zone, pos, { rot: FACE_CAMERA, ...rest });
}

/** A ring with a hole, facing the camera. */
export function kitRing(name: string, rOuter: number, rInner: number, depth: number, zone: ZoneId, pos: Vec3, extra?: PartExtra & { sides?: number }): PartSpec {
  const { sides, ...rest } = extra ?? {};
  return finish(name, ringShape(rOuter, rInner, depth, sides ?? 20), zone, pos, { rot: FACE_CAMERA, ...rest });
}

// ---------------------------------------------------------------- part list transforms

/** Move parts (and their animation pivots). */
export function offsetParts(parts: PartSpec[], by: Vec3): PartSpec[] {
  return parts.map((p) => {
    const moved: PartSpec = { ...p, pos: [p.pos[0] + by[0], p.pos[1] + by[1], p.pos[2] + by[2]] };
    if (p.anim?.pivot) moved.anim = { ...p.anim, pivot: [p.anim.pivot[0] + by[0], p.anim.pivot[1] + by[1], p.anim.pivot[2] + by[2]] };
    return moved;
  });
}

/** Put `prefix.` in front of every part name. */
export function prefixParts(parts: PartSpec[], prefix: string): PartSpec[] {
  return parts.map((p) => ({ ...p, name: `${prefix}.${p.name}` }));
}

function mirrorShape(shape: ShapeSpec): ShapeSpec {
  if (shape.kind === 'extrude') return { ...shape, outline: outlineFlipX(shape.outline) };
  if (shape.kind === 'tube') return { ...shape, path: shape.path.map(([x, y, z]) => [-x, y, z] as Vec3) };
  return shape;
}

/**
 * Mirrored copies across the model's x = 0 plane. Returns only the copies; spread both lists into the model.
 * `rename` maps each name to the copy's name (default: `.l` ↔ `.r` suffix swap, else append `.m`).
 * A torus with a partial `arc` is the one shape this cannot mirror exactly.
 */
export function mirrorX(parts: PartSpec[], rename?: (name: string) => string): PartSpec[] {
  const auto = (name: string): string =>
    /\.l\b/.test(name) ? name.replace(/\.l\b/, '.r') : /\.r\b/.test(name) ? name.replace(/\.r\b/, '.l') : `${name}.m`;
  return parts.map((p) => {
    const copy: PartSpec = { ...p, name: (rename ?? auto)(p.name), shape: mirrorShape(p.shape), pos: [-p.pos[0], p.pos[1], p.pos[2]] };
    if (p.rot) copy.rot = [p.rot[0], -p.rot[1], -p.rot[2]];
    if (p.anim) {
      copy.anim = { ...p.anim };
      if (p.anim.pivot) copy.anim.pivot = [-p.anim.pivot[0], p.anim.pivot[1], p.anim.pivot[2]];
    }
    return copy;
  });
}

/**
 * Rotate a finished group of parts in the page plane around `pivot` (radians, counter-clockwise in
 * model space, which is clockwise on screen). For leaning tombstones and jaunty pickups.
 */
export function tiltParts(parts: PartSpec[], angle: number, pivot: Vec2 = [0, 0]): PartSpec[] {
  if (Math.abs(angle) < 1e-6) return parts;
  const c = Math.cos(angle), s = Math.sin(angle);
  const turn = (v: Vec3): Vec3 => {
    const x = v[0] - pivot[0], y = v[1] - pivot[1];
    return [pivot[0] + x * c - y * s, pivot[1] + x * s + y * c, v[2]];
  };
  const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
  return parts.map((p) => {
    const r = p.rot ?? [0, 0, 0];
    const q = qz.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], 'XYZ')));
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    const out: PartSpec = { ...p, pos: turn(p.pos), rot: [e.x, e.y, e.z] };
    if (p.anim?.pivot) out.anim = { ...p.anim, pivot: turn(p.anim.pivot) };
    return out;
  });
}

/** Give every part that has no animation the same tag (a pickup that bobs as one piece). */
export function animateParts(parts: PartSpec[], anim: NonNullable<PartSpec['anim']>): PartSpec[] {
  return parts.map((p) => (p.anim ? p : { ...p, anim }));
}
