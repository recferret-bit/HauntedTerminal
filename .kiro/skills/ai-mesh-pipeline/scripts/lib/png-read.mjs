// Dependency-free PNG reader (node:zlib only). Enough for sprite and baked-texture checks:
// 8-bit or 16-bit, colour types 0 (grey), 2 (RGB), 3 (palette), 4 (grey+alpha), 6 (RGBA), non-interlaced.
import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function isPng(buf) {
  return buf.length >= 24 && buf.subarray(0, 8).equals(SIGNATURE);
}

/** { width, height, bitDepth, colorType, interlace, hasAlpha } without decoding pixels. */
export function readPngHeader(buf) {
  if (!isPng(buf)) throw new Error('not a PNG (bad signature)');
  if (buf.toString('ascii', 12, 16) !== 'IHDR') throw new Error('PNG has no IHDR chunk');
  const colorType = buf[25];
  if (!(colorType in CHANNELS)) throw new Error(`PNG has unknown colour type ${colorType}`);
  let hasAlpha = colorType === 4 || colorType === 6;
  if (!hasAlpha) {
    for (const c of chunks(buf)) if (c.type === 'tRNS') hasAlpha = true;
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colorType, interlace: buf[28], hasAlpha };
}

function* chunks(buf) {
  let o = 8;
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    yield { type, data: buf.subarray(o + 8, o + 8 + len) };
    if (type === 'IEND') return;
    o += 12 + len;
  }
}

/** Decodes to { width, height, data: Uint8Array RGBA8, row 0 on top }. */
export function decodePng(buf) {
  const head = readPngHeader(buf);
  if (head.interlace) throw new Error('interlaced PNGs are not supported: re-save without interlacing');
  if (head.bitDepth !== 8 && head.bitDepth !== 16) throw new Error(`PNG bit depth ${head.bitDepth} is not supported: re-save as 8-bit`);
  const idat = [];
  let palette = null;
  let trns = null;
  for (const c of chunks(buf)) {
    if (c.type === 'IDAT') idat.push(c.data);
    else if (c.type === 'PLTE') palette = c.data;
    else if (c.type === 'tRNS') trns = c.data;
  }
  if (head.colorType === 3 && !palette) throw new Error('palette PNG without a PLTE chunk');
  const raw = inflateSync(Buffer.concat(idat));
  const { width, height } = head;
  const bytes = head.bitDepth / 8;
  const bpp = CHANNELS[head.colorType] * bytes;
  const stride = width * bpp;
  if (raw.length < (stride + 1) * height) throw new Error('PNG pixel data is truncated');
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Uint8Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`PNG row ${y} uses unknown filter ${filter}`);
      line[i] = (line[i] + add) & 255;
    }
    for (let x = 0; x < width; x++) {
      const s = x * bpp;
      const o = (y * width + x) * 4;
      const ch = (k) => line[s + k * bytes]; // high byte of 16-bit samples
      let r, g, b, a = 255;
      if (head.colorType === 0) { r = g = b = ch(0); } // a tRNS colour key on grey / RGB images is ignored
      else if (head.colorType === 2) { r = ch(0); g = ch(1); b = ch(2); }
      else if (head.colorType === 3) { const i = line[s]; r = palette[i * 3]; g = palette[i * 3 + 1]; b = palette[i * 3 + 2]; if (trns && i < trns.length) a = trns[i]; }
      else if (head.colorType === 4) { r = g = b = ch(0); a = ch(1); }
      else { r = ch(0); g = ch(1); b = ch(2); a = ch(3); }
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
    }
    prev = line;
  }
  return { width, height, data: out };
}
