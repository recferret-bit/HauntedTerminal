// Deterministic zero-dependency icon synthesizer for Tauri v2 bundles (RGBA PNG, Windows ICO, Apple ICNS).
// Draws Haunted Terminal's Comix Zone ink-framed CRT emblem in the official palette (#140f12, #ffd166, #ff6a13, #06d6a0).
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function drawTerminalEmblemRgba(size) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a = 255) => {
    const i = (y * size + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  };
  const rect = (x0, y0, x1, y1, r, g, b) => {
    const sx = Math.max(0, Math.round(x0 * size));
    const sy = Math.max(0, Math.round(y0 * size));
    const ex = Math.min(size, Math.round(x1 * size));
    const ey = Math.min(size, Math.round(y1 * size));
    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) set(x, y, r, g, b, 255);
    }
  };

  // Outer comic ink card (#140f12) with subtle margin transparency for rounded-feel desktop dock
  rect(0.04, 0.04, 0.96, 0.96, 0x14, 0x0f, 0x12);
  // Comic paper gutter frame (#efe6d2)
  rect(0.1, 0.1, 0.9, 0.9, 0xef, 0xe6, 0xd2);
  // Inner ink bezel (#140f12)
  rect(0.14, 0.15, 0.86, 0.85, 0x14, 0x0f, 0x12);
  // CRT phosphor gold header & screen (#ffd166)
  rect(0.19, 0.2, 0.81, 0.67, 0xff, 0xd1, 0x66);
  // Terminal prompt `>` chevron block in ink (#140f12)
  rect(0.25, 0.3, 0.35, 0.38, 0x14, 0x0f, 0x12);
  rect(0.31, 0.36, 0.41, 0.44, 0x14, 0x0f, 0x12);
  rect(0.25, 0.42, 0.35, 0.5, 0x14, 0x0f, 0x12);
  // Active command cursor bar in Comix orange (#ff6a13) + Kiro cyan spark (#06d6a0)
  rect(0.46, 0.42, 0.73, 0.51, 0xff, 0x6a, 0x13);
  rect(0.66, 0.27, 0.75, 0.36, 0x06, 0xd6, 0xa0);
  // Bottom TTY status strip (#06d6a0 + #ff6a13)
  rect(0.19, 0.72, 0.56, 0.79, 0x06, 0xd6, 0xa0);
  rect(0.6, 0.72, 0.81, 0.79, 0xff, 0x6a, 0x13);
  return px;
}

export function encodeEmblemPng(size) {
  const rgba = drawTerminalEmblemRgba(size);
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // Filter type 0 (None)
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA color type
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

export function encodeWindowsIco(png32, png256) {
  const frames = [
    { size: 32, data: png32 },
    { size: 256, data: png256 },
  ];
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(frames.length, 4);

  const dirEntries = [];
  let offset = 6 + frames.length * 16;
  for (const frame of frames) {
    const entry = Buffer.alloc(16);
    entry[0] = frame.size === 256 ? 0 : frame.size;
    entry[1] = frame.size === 256 ? 0 : frame.size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // 32 bpp RGBA
    entry.writeUInt32LE(frame.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += frame.data.length;
    dirEntries.push(entry);
  }
  return Buffer.concat([header, ...dirEntries, ...frames.map((f) => f.data)]);
}

export function encodeAppleIcns(png256, png512) {
  const block = (osType, data) => {
    const head = Buffer.alloc(8);
    head.write(osType, 0, 4, 'ascii');
    head.writeUInt32BE(8 + data.length, 4);
    return Buffer.concat([head, data]);
  };
  const body = Buffer.concat([block('ic08', png256), block('ic09', png512)]);
  const fileHead = Buffer.alloc(8);
  fileHead.write('icns', 0, 4, 'ascii');
  fileHead.writeUInt32BE(8 + body.length, 4);
  return Buffer.concat([fileHead, body]);
}

export function buildTauriIconSet() {
  const png32 = encodeEmblemPng(32);
  const png128 = encodeEmblemPng(128);
  const png256 = encodeEmblemPng(256);
  const png512 = encodeEmblemPng(512);
  return {
    '32x32.png': png32,
    '128x128.png': png128,
    '128x128@2x.png': png256,
    'icon.png': png512,
    'icon.ico': encodeWindowsIco(png32, png256),
    'icon.icns': encodeAppleIcns(png256, png512),
  };
}
