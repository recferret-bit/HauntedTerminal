/**
 * Pure 2D helpers shared by every software rasterizer (model preview, FX preview, validators):
 * barycentric triangle fill, the three-band cel lookup and a radius neighbourhood test.
 * No `three`, no allocation per pixel.
 */

/** Inclusive pixel window a fill is clipped to. */
export interface PixelWindow {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type PixelVisit = (x: number, y: number, w0: number, w1: number, w2: number) => void;

/**
 * Fill one screen-space triangle. `t` holds (ax, ay, bx, by, cx, cy) in its first six slots.
 * `visit` receives each pixel centre inside the triangle with its barycentric weights.
 * Degenerate triangles are skipped.
 */
export function rasterTriangle(t: ArrayLike<number>, win: PixelWindow, visit: PixelVisit): void {
  const ax = t[0]!, ay = t[1]!, bx = t[2]!, by = t[3]!, cx = t[4]!, cy = t[5]!;
  const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  if (Math.abs(area) < 1e-9) return;
  const loX = Math.max(win.x0, Math.floor(Math.min(ax, bx, cx)));
  const hiX = Math.min(win.x1, Math.ceil(Math.max(ax, bx, cx)));
  const loY = Math.max(win.y0, Math.floor(Math.min(ay, by, cy)));
  const hiY = Math.min(win.y1, Math.ceil(Math.max(ay, by, cy)));
  for (let y = loY; y <= hiY; y++) {
    for (let x = loX; x <= hiX; x++) {
      const sx = x + 0.5, sy = y + 0.5;
      const w0 = ((bx - sx) * (cy - sy) - (cx - sx) * (by - sy)) / area;
      const w1 = ((cx - sx) * (ay - sy) - (ax - sx) * (cy - sy)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      visit(x, y, w0, w1, w2);
    }
  }
}

/** The comic material's three cel bands (lit, mid, shadow) for a unit normal and a unit light vector. */
export function celBand(nx: number, ny: number, nz: number, light: readonly [number, number, number]): number {
  const shade = (nx * light[0] + ny * light[1] + nz * light[2]) * 0.5 + 0.5;
  return shade > 0.66 ? 1 : shade > 0.4 ? 0.68 : 0.4;
}

/** True when `test(index)` holds for any pixel within `radius` (round brush) of (x, y), image-clipped. */
export function anyWithinRadius(
  x: number, y: number, radius: number, width: number, height: number, test: (index: number) => boolean,
): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const qx = x + dx, qy = y + dy;
      if (qx < 0 || qy < 0 || qx >= width || qy >= height) continue;
      if (test(qy * width + qx)) return true;
    }
  }
  return false;
}
