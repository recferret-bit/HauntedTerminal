import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ModelSpec, PartSpec, ShapeSpec } from '../core/types.js';

export function shapeToGeometry(shape: ShapeSpec): THREE.BufferGeometry {
  switch (shape.kind) {
    case 'box': {
      const [w, h, d] = shape.size;
      const bevel = Math.min(shape.bevel ?? 0, Math.min(w, h, d) / 2 - 1e-4);
      return bevel > 0 ? new RoundedBoxGeometry(w, h, d, 2, bevel) : new THREE.BoxGeometry(w, h, d);
    }
    case 'cylinder':
      return new THREE.CylinderGeometry(shape.rTop, shape.rBottom, shape.height, shape.sides ?? 12);
    case 'capsule':
      return new THREE.CapsuleGeometry(shape.radius, shape.length, 4, 10);
    case 'sphere':
      return new THREE.SphereGeometry(shape.radius, 16, 12);
    case 'cone':
      return new THREE.ConeGeometry(shape.radius, shape.height, shape.sides ?? 10);
    case 'torus':
      return new THREE.TorusGeometry(shape.radius, shape.tube, 8, 20, shape.arc ?? Math.PI * 2);
    case 'extrude': {
      const outline = new THREE.Shape(shape.outline.map(([x, y]) => new THREE.Vector2(x, y)));
      const bevel = shape.bevel ?? 0;
      const geo = new THREE.ExtrudeGeometry(outline, {
        depth: Math.max(shape.depth - bevel * 2, 1e-3),
        bevelEnabled: bevel > 0,
        bevelSize: bevel,
        bevelThickness: bevel,
        bevelSegments: 1,
        curveSegments: 6,
      });
      geo.translate(0, 0, -Math.max(shape.depth - bevel * 2, 1e-3) / 2);
      // ExtrudeGeometry's caps use u = x. The camera sits on −z, where world +x is screen-left,
      // so that u runs right-to-left and textures read mirrored. Flip u so it runs left-to-right.
      // Caps still map one texture tile per world unit.
      const uv = geo.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setX(i, -uv.getX(i));
      uv.needsUpdate = true;
      return geo;
    }
    case 'tube': {
      const curve = new THREE.CatmullRomCurve3(shape.path.map((p) => new THREE.Vector3(...p)), shape.closed ?? false);
      return new THREE.TubeGeometry(curve, Math.max(8, shape.path.length * 6), shape.radius, 6, shape.closed ?? false);
    }
    case 'lathe':
      return new THREE.LatheGeometry(shape.profile.map(([r, y]) => new THREE.Vector2(r, y)), shape.sides ?? 12);
  }
}

export function partMatrix(part: PartSpec): THREE.Matrix4 {
  const rot = part.rot ?? [0, 0, 0];
  const scale = part.scale ?? [1, 1, 1];
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...part.pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
    new THREE.Vector3(...scale),
  );
}

/**
 * The ink outline: a copy of the mesh pushed out along smoothed normals and drawn back-face only.
 * Thickness is in world units, so every part of a model gets the same line weight
 * (a scaled copy would give thick lines on big parts and hairlines on small ones).
 */
export function inkShellGeometry(geo: THREE.BufferGeometry, thickness: number): THREE.BufferGeometry {
  let shell = geo.clone();
  shell.deleteAttribute('normal');
  shell.deleteAttribute('uv');
  shell = mergeVertices(shell, 1e-4);
  shell.computeVertexNormals();
  const pos = shell.getAttribute('position');
  const nrm = shell.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + nrm.getX(i) * thickness,
      pos.getY(i) + nrm.getY(i) * thickness,
      pos.getZ(i) + nrm.getZ(i) * thickness,
    );
  }
  pos.needsUpdate = true;
  return shell;
}

/** A part as model-space triangle soup. The validators and the software rasterizer both read this. */
export interface BakedPart {
  index: number;
  part: PartSpec;
  /** 9 floats per triangle. */
  pos: Float32Array;
  /** 9 floats per triangle, per-vertex normals. */
  nrm: Float32Array;
  /** 6 floats per triangle, or null when the shape has no uvs. */
  uv: Float32Array | null;
  triCount: number;
  min: [number, number, number];
  max: [number, number, number];
}

export function bakePart(part: PartSpec, index = 0): BakedPart {
  const source = shapeToGeometry(part.shape);
  const geo = source.index ? source.toNonIndexed() : source;
  const matrix = partMatrix(part);
  geo.applyMatrix4(matrix);
  const p = geo.getAttribute('position');
  const n = geo.getAttribute('normal');
  const u = geo.getAttribute('uv');
  const pos = new Float32Array(p.count * 3);
  const nrm = new Float32Array(p.count * 3);
  const uv = u ? new Float32Array(p.count * 2) : null;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    nrm[i * 3] = n.getX(i); nrm[i * 3 + 1] = n.getY(i); nrm[i * 3 + 2] = n.getZ(i);
    if (uv && u) { uv[i * 2] = u.getX(i); uv[i * 2 + 1] = u.getY(i); }
    if (x < min[0]) min[0] = x; if (y < min[1]) min[1] = y; if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x; if (y > max[1]) max[1] = y; if (z > max[2]) max[2] = z;
  }
  if (source !== geo) source.dispose();
  geo.dispose();
  return { index, part, pos, nrm, uv, triCount: p.count / 3, min, max };
}

export function bakeModel(spec: ModelSpec): BakedPart[] {
  return spec.parts.map((part, i) => bakePart(part, i));
}

export interface ModelBounds {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
  triCount: number;
}

export function modelBounds(baked: BakedPart[]): ModelBounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let triCount = 0;
  for (const b of baked) {
    triCount += b.triCount;
    for (let a = 0; a < 3; a++) {
      if (b.min[a]! < min[a]!) min[a] = b.min[a]!;
      if (b.max[a]! > max[a]!) max[a] = b.max[a]!;
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]], triCount };
}
