/**
 * Triangle-level maths for the model validator. Everything reads 9-float triangles straight out of
 * `BakedPart.pos`, so nothing is allocated in the inner loops.
 */

function dot(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return ax * bx + ay * by + az * bz;
}

/** Squared distance from point p to triangle (A[o..o+8]). Ericson, Real-Time Collision Detection 5.1.5. */
function pointTriDist2(px: number, py: number, pz: number, A: Float32Array, o: number): number {
  const ax = A[o], ay = A[o + 1], az = A[o + 2];
  const abx = A[o + 3] - ax, aby = A[o + 4] - ay, abz = A[o + 5] - az;
  const acx = A[o + 6] - ax, acy = A[o + 7] - ay, acz = A[o + 8] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = dot(abx, aby, abz, apx, apy, apz);
  const d2 = dot(acx, acy, acz, apx, apy, apz);
  let cx: number, cy: number, cz: number;
  if (d1 <= 0 && d2 <= 0) { cx = ax; cy = ay; cz = az; } else {
    const bpx = apx - abx, bpy = apy - aby, bpz = apz - abz;
    const d3 = dot(abx, aby, abz, bpx, bpy, bpz);
    const d4 = dot(acx, acy, acz, bpx, bpy, bpz);
    if (d3 >= 0 && d4 <= d3) { cx = ax + abx; cy = ay + aby; cz = az + abz; } else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const v = d1 / (d1 - d3 || 1);
        cx = ax + abx * v; cy = ay + aby * v; cz = az + abz * v;
      } else {
        const cpx = apx - acx, cpy = apy - acy, cpz = apz - acz;
        const d5 = dot(abx, aby, abz, cpx, cpy, cpz);
        const d6 = dot(acx, acy, acz, cpx, cpy, cpz);
        if (d6 >= 0 && d5 <= d6) { cx = ax + acx; cy = ay + acy; cz = az + acz; } else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) {
            const w = d2 / (d2 - d6 || 1);
            cx = ax + acx * w; cy = ay + acy * w; cz = az + acz * w;
          } else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
              const w = (d4 - d3) / (d4 - d3 + (d5 - d6) || 1);
              cx = ax + abx + (acx - abx) * w; cy = ay + aby + (acy - aby) * w; cz = az + abz + (acz - abz) * w;
            } else {
              const denom = 1 / (va + vb + vc || 1);
              const v = vb * denom, w = vc * denom;
              cx = ax + abx * v + acx * w; cy = ay + aby * v + acy * w; cz = az + abz * v + acz * w;
            }
          }
        }
      }
    }
  }
  const dx = px - cx, dy = py - cy, dz = pz - cz;
  return dx * dx + dy * dy + dz * dz;
}

/** Squared distance between segments p1q1 and p2q2. Ericson 5.1.9. */
function segSegDist2(
  p1x: number, p1y: number, p1z: number, q1x: number, q1y: number, q1z: number,
  p2x: number, p2y: number, p2z: number, q2x: number, q2y: number, q2z: number,
): number {
  const d1x = q1x - p1x, d1y = q1y - p1y, d1z = q1z - p1z;
  const d2x = q2x - p2x, d2y = q2y - p2y, d2z = q2z - p2z;
  const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;
  const a = dot(d1x, d1y, d1z, d1x, d1y, d1z);
  const e = dot(d2x, d2y, d2z, d2x, d2y, d2z);
  const f = dot(d2x, d2y, d2z, rx, ry, rz);
  const EPS = 1e-12;
  let s: number, t: number;
  if (a <= EPS && e <= EPS) { s = 0; t = 0; } else if (a <= EPS) {
    s = 0; t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = dot(d1x, d1y, d1z, rx, ry, rz);
    if (e <= EPS) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else {
      const b = dot(d1x, d1y, d1z, d2x, d2y, d2z);
      const denom = a * e - b * b;
      s = denom > EPS ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  const dx = rx + d1x * s - d2x * t, dy = ry + d1y * s - d2y * t, dz = rz + d1z * s - d2z * t;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Moller-Trumbore: parameter t where the ray p + t·d meets triangle (A[o..o+8]), NaN on a miss.
 * Coplanar rays miss (the distance terms cover them), so every comparison with NaN is false.
 */
function rayTriT(px: number, py: number, pz: number, dx: number, dy: number, dz: number, A: Float32Array, o: number): number {
  const ax = A[o], ay = A[o + 1], az = A[o + 2];
  const e1x = A[o + 3] - ax, e1y = A[o + 4] - ay, e1z = A[o + 5] - az;
  const e2x = A[o + 6] - ax, e2y = A[o + 7] - ay, e2z = A[o + 8] - az;
  const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
  const det = e1x * hx + e1y * hy + e1z * hz;
  if (Math.abs(det) < 1e-14) return NaN;
  const inv = 1 / det;
  const sx = px - ax, sy = py - ay, sz = pz - az;
  const u = (sx * hx + sy * hy + sz * hz) * inv;
  if (u < 0 || u > 1) return NaN;
  const qvx = sy * e1z - sz * e1y, qvy = sz * e1x - sx * e1z, qvz = sx * e1y - sy * e1x;
  const v = (dx * qvx + dy * qvy + dz * qvz) * inv;
  if (v < 0 || u + v > 1) return NaN;
  return (e2x * qvx + e2y * qvy + e2z * qvz) * inv;
}

/** Does segment pq pass through triangle (A[o..])? */
function segTriHit(px: number, py: number, pz: number, qx: number, qy: number, qz: number, A: Float32Array, o: number): boolean {
  const t = rayTriT(px, py, pz, qx - px, qy - py, qz - pz, A, o);
  return t >= 0 && t <= 1;
}

/** Squared distance between two triangles; 0 when they cross. */
export function triTriDist2(A: Float32Array, a: number, B: Float32Array, b: number): number {
  for (let i = 0; i < 3; i++) {
    const p = a + i * 3, q = a + ((i + 1) % 3) * 3;
    if (segTriHit(A[p], A[p + 1], A[p + 2], A[q], A[q + 1], A[q + 2], B, b)) return 0;
    const r = b + i * 3, s = b + ((i + 1) % 3) * 3;
    if (segTriHit(B[r], B[r + 1], B[r + 2], B[s], B[s + 1], B[s + 2], A, a)) return 0;
  }
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const p = a + i * 3, r = b + i * 3;
    let d = pointTriDist2(A[p], A[p + 1], A[p + 2], B, b);
    if (d < best) best = d;
    d = pointTriDist2(B[r], B[r + 1], B[r + 2], A, a);
    if (d < best) best = d;
    const q = a + ((i + 1) % 3) * 3;
    for (let j = 0; j < 3; j++) {
      const u = b + j * 3, v = b + ((j + 1) % 3) * 3;
      d = segSegDist2(A[p], A[p + 1], A[p + 2], A[q], A[q + 1], A[q + 2], B[u], B[u + 1], B[u + 2], B[v], B[v + 1], B[v + 2]);
      if (d < best) best = d;
    }
  }
  return best;
}

/** Per-triangle boxes: 6 floats (min xyz, max xyz) per triangle. */
export function triBoxes(pos: Float32Array): Float32Array {
  const n = pos.length / 9;
  const out = new Float32Array(n * 6);
  for (let t = 0; t < n; t++) {
    const o = t * 9, k = t * 6;
    for (let c = 0; c < 3; c++) {
      const v0 = pos[o + c], v1 = pos[o + 3 + c], v2 = pos[o + 6 + c];
      out[k + c] = Math.min(v0, v1, v2);
      out[k + 3 + c] = Math.max(v0, v1, v2);
    }
  }
  return out;
}

/** Ray-parity inside test against a closed triangle soup. Two rays must agree, so a grazing hit cannot flip it. */
export function pointInSolid(px: number, py: number, pz: number, pos: Float32Array): boolean {
  return rayParity(px, py, pz, 0.5377, 0.2113, 0.8161, pos) && rayParity(px, py, pz, -0.3119, 0.9034, -0.2943, pos);
}

function rayParity(px: number, py: number, pz: number, dx: number, dy: number, dz: number, A: Float32Array): boolean {
  let hits = 0;
  for (let o = 0; o < A.length; o += 9) if (rayTriT(px, py, pz, dx, dy, dz, A, o) > 1e-7) hits++;
  return (hits & 1) === 1;
}

/** Area of the overlap of two triangles in 2D (Sutherland-Hodgman clip, then shoelace). */
export function triOverlapArea2D(
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
  px: number, py: number, qx: number, qy: number, rx: number, ry: number,
): number {
  let poly: number[] = [ax, ay, bx, by, cx, cy];
  let clip = [px, py, qx, qy, rx, ry];
  // Clip against the inside of pqr, whatever its winding.
  const orient = (qx - px) * (ry - py) - (qy - py) * (rx - px);
  if (Math.abs(orient) < 1e-14) return 0;
  if (orient < 0) clip = [px, py, rx, ry, qx, qy];
  for (let e = 0; e < 3 && poly.length >= 6; e++) {
    const x0 = clip[e * 2], y0 = clip[e * 2 + 1];
    const x1 = clip[((e + 1) % 3) * 2], y1 = clip[((e + 1) % 3) * 2 + 1];
    const next: number[] = [];
    const n = poly.length / 2;
    for (let i = 0; i < n; i++) {
      const sx = poly[i * 2], sy = poly[i * 2 + 1];
      const tx = poly[((i + 1) % n) * 2], ty = poly[((i + 1) % n) * 2 + 1];
      const ds = (x1 - x0) * (sy - y0) - (y1 - y0) * (sx - x0);
      const dt = (x1 - x0) * (ty - y0) - (y1 - y0) * (tx - x0);
      if (ds >= 0) next.push(sx, sy);
      if ((ds >= 0) !== (dt >= 0)) {
        const k = ds / (ds - dt);
        next.push(sx + (tx - sx) * k, sy + (ty - sy) * k);
      }
    }
    poly = next;
  }
  let area = 0;
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += poly[i * 2] * poly[j * 2 + 1] - poly[j * 2] * poly[i * 2 + 1];
  }
  return Math.abs(area) / 2;
}
