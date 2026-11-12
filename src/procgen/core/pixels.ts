import { hexToRgb } from './palette.js';
import type { PixelBuffer } from './types.js';

export function makePixels(width: number, height: number, fill = 0x000000, alpha = 255): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  const [r, g, b] = hexToRgb(fill);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = alpha;
  }
  return { width, height, data };
}

/** Byte offset of the pixel at (x, y), wrapping around the borders. */
function wrappedIndex(buf: PixelBuffer, x: number, y: number): number {
  const px = ((Math.floor(x) % buf.width) + buf.width) % buf.width;
  const py = ((Math.floor(y) % buf.height) + buf.height) % buf.height;
  return (py * buf.width + px) * 4;
}

/** Blend colour (r, g, b) at alpha `a` (0..1) into the pixel starting at byte `i`; the alpha channel keeps the max. */
function blendAt(buf: PixelBuffer, i: number, r: number, g: number, b: number, a: number, alpha255: number): void {
  buf.data[i] = buf.data[i]! * (1 - a) + r * a;
  buf.data[i + 1] = buf.data[i + 1]! * (1 - a) + g * a;
  buf.data[i + 2] = buf.data[i + 2]! * (1 - a) + b * a;
  buf.data[i + 3] = Math.max(buf.data[i + 3]!, alpha255);
}

/** Clipped (non-wrapping) blend of an RGB colour at alpha 0..1. Used by the software previews. */
export function blendPixel(buf: PixelBuffer, x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || y < 0 || x >= buf.width || y >= buf.height) return;
  blendAt(buf, (y * buf.width + x) * 4, r, g, b, a, Math.round(a * 255));
}

/** Wrapping write, so generators that draw across the border stay tileable for free. */
export function setPixel(buf: PixelBuffer, x: number, y: number, hex: number, alpha = 255): void {
  const i = wrappedIndex(buf, x, y);
  const [r, g, b] = hexToRgb(hex);
  blendAt(buf, i, r, g, b, alpha / 255, alpha);
}

/** Wrapping nearest read. Returns [r, g, b, a] in 0..255. */
export function getPixel(buf: PixelBuffer, x: number, y: number): [number, number, number, number] {
  const i = wrappedIndex(buf, x, y);
  return [buf.data[i]!, buf.data[i + 1]!, buf.data[i + 2]!, buf.data[i + 3]!];
}

export function fillRect(buf: PixelBuffer, x: number, y: number, w: number, h: number, hex: number, alpha = 255): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) setPixel(buf, x + i, y + j, hex, alpha);
}

/** Copy `src` into `dst` with its top-left corner at (x, y). No wrapping, clipped. */
export function blit(dst: PixelBuffer, src: PixelBuffer, x: number, y: number): void {
  for (let j = 0; j < src.height; j++) {
    const dy = y + j;
    if (dy < 0 || dy >= dst.height) continue;
    for (let i = 0; i < src.width; i++) {
      const dx = x + i;
      if (dx < 0 || dx >= dst.width) continue;
      const s = (j * src.width + i) * 4;
      const d = (dy * dst.width + dx) * 4;
      const a = src.data[s + 3]!;
      blendAt(dst, d, src.data[s]!, src.data[s + 1]!, src.data[s + 2]!, a / 255, a);
    }
  }
}
