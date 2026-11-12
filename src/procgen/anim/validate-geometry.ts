/**
 * Geometry helpers for the AnimTag validator: bounding boxes of shapes and of posed parts, and the
 * lowest vertex of a posed part. Plain data in, numbers out.
 */
import * as THREE from 'three';
import type { PartSpec, ShapeSpec, Vec3 } from '../core/types.js';
import type { AnimBase } from './tags.js';

export interface Box {
  min: Vec3;
  max: Vec3;
}

/** A box that contains nothing yet; grow it with `growBox`. */
export const emptyBox = (): Box => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });

/** Extend `box` so it contains point `p`. */
export function growBox(box: Box, p: Vec3): Box {
  for (let i = 0; i < 3; i++) {
    box.min[i] = Math.min(box.min[i]!, p[i]!);
    box.max[i] = Math.max(box.max[i]!, p[i]!);
  }
  return box;
}

const symmetric = (x: number, y: number, z: number): Box => ({ min: [-x, -y, -z], max: [x, y, z] });

/** Local-space bounding box of a shape, as shapeToGeometry builds it. */
export function animShapeBounds(shape: ShapeSpec): Box {
  switch (shape.kind) {
    case 'box':
      return symmetric(shape.size[0] / 2, shape.size[1] / 2, shape.size[2] / 2);
    case 'cylinder': {
      const r = Math.max(shape.rTop, shape.rBottom);
      return symmetric(r, shape.height / 2, r);
    }
    case 'capsule':
      return symmetric(shape.radius, shape.length / 2 + shape.radius, shape.radius);
    case 'sphere':
      return symmetric(shape.radius, shape.radius, shape.radius);
    case 'cone':
      return symmetric(shape.radius, shape.height / 2, shape.radius);
    case 'torus':
      return symmetric(shape.radius + shape.tube, shape.radius + shape.tube, shape.tube);
    case 'extrude': {
      const xs = shape.outline.map((p) => p[0]);
      const ys = shape.outline.map((p) => p[1]);
      return { min: [Math.min(...xs), Math.min(...ys), -shape.depth / 2], max: [Math.max(...xs), Math.max(...ys), shape.depth / 2] };
    }
    case 'tube': {
      const b = emptyBox();
      const r = shape.radius;
      for (const p of shape.path) {
        growBox(b, [p[0] - r, p[1] - r, p[2] - r]);
        growBox(b, [p[0] + r, p[1] + r, p[2] + r]);
      }
      return b;
    }
    case 'lathe': {
      const r = Math.max(...shape.profile.map((p) => Math.abs(p[0])));
      const ys = shape.profile.map((p) => p[1]);
      return { min: [-r, Math.min(...ys), -r], max: [r, Math.max(...ys), r] };
    }
  }
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();

/** Compose the part transform into the shared scratch matrix. */
function composeBase(t: AnimBase): THREE.Matrix4 {
  return _m.compose(_p.set(...t.pos), _q.setFromEuler(_e.set(t.rot[0], t.rot[1], t.rot[2], 'XYZ')), _s.set(...t.scale));
}

/** Model-space box of a part's shape under a transform (8 corners of the local box). */
export function posedBox(local: Box, t: AnimBase): Box {
  const m = composeBase(t);
  const out = emptyBox();
  for (let i = 0; i < 8; i++) {
    _v.set(i & 1 ? local.max[0] : local.min[0], i & 2 ? local.max[1] : local.min[1], i & 4 ? local.max[2] : local.min[2]).applyMatrix4(m);
    growBox(out, [_v.x, _v.y, _v.z]);
  }
  return out;
}

/** Lowest y of the part's real vertices under a pose. */
export function lowestY(vertices: Float32Array, t: AnimBase): number {
  const e = composeBase(t).elements;
  let low = Infinity;
  for (let i = 0; i < vertices.length; i += 3) {
    low = Math.min(low, e[1]! * vertices[i]! + e[5]! * vertices[i + 1]! + e[9]! * vertices[i + 2]! + e[13]!);
  }
  return low;
}

export const baseOf = (part: PartSpec): AnimBase => ({
  pos: [...part.pos],
  rot: [...(part.rot ?? [0, 0, 0])],
  scale: [...(part.scale ?? [1, 1, 1])],
});

export const inside = (p: Vec3, b: Box, margin: number): boolean =>
  p.every((v, i) => v >= b.min[i]! - margin && v <= b.max[i]! + margin);
