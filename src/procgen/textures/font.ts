import { setPixel } from '../core/pixels.js';
import type { PixelBuffer } from '../core/types.js';

/**
 * A 3x5 bitmap font: digits, capitals, a little punctuation, and 16 katakana-like marks for code rain.
 * Draw it at scale 2 or more on surfaces: 1 px strokes do not survive the pixel-art pass.
 */
const ROWS: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '111100100100111', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '111100101101111', H: '101101111101101',
  I: '111010010010111', J: '001001001101111', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '111101111100100',
  Q: '111101101111001', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  '-': '000000111000000', '.': '000000000000010', ':': '000010000010000', '/': '001001010100100',
  _: '000000000000111', '#': '101111101111101', '+': '000010111010000', '=': '000111000111000',
  '>': '100010001010100', '<': '001010100010001', '!': '010010010000010', '?': '111001010000010',
  '*': '101010111010101', '%': '101001010100101', '[': '110100100100110', ']': '011001001001011',
  '(': '010100100100010', ')': '010001001001010', '|': '010010010010010', ' ': '000000000000000',
};

/** Katakana-like marks. They only need to read as "alien code", not as real kana. */
const KANA: readonly string[] = [
  '111010111010100', '101101001001010', '111001001010100', '010111010010011',
  '100111100100011', '111000111001110', '010111101001010', '001010110010010',
  '111101101101111', '111001111001111', '000111000000111', '010010111010101',
  '101010001010100', '111010010010111', '100100110101100', '010101001010100',
];

export const TEX_GLYPH_W = 3;
export const TEX_GLYPH_H = 5;
export const TEX_KANA_COUNT = KANA.length;

function stamp(buf: PixelBuffer, bits: string, x: number, y: number, hex: number, scale: number): void {
  for (let r = 0; r < TEX_GLYPH_H; r++) {
    for (let c = 0; c < TEX_GLYPH_W; c++) {
      if (bits[r * TEX_GLYPH_W + c] !== '1') continue;
      for (let j = 0; j < scale; j++) for (let i = 0; i < scale; i++) setPixel(buf, x + c * scale + i, y + r * scale + j, hex);
    }
  }
}

/** Width in pixels of `text` drawn by texText at `scale` (3 px glyph + 1 px gap, times scale). */
export function texTextWidth(text: string, scale = 1): number {
  return text.length === 0 ? 0 : (text.length * (TEX_GLYPH_W + 1) - 1) * scale;
}

/** Draw text with its top-left corner at (x, y). Lower case maps to capitals, unknown characters to a blank. Returns the width drawn. */
export function texText(buf: PixelBuffer, text: string, x: number, y: number, hex: number, scale = 1): number {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    stamp(buf, ROWS[ch] ?? ROWS[' ']!, cx, y, hex, scale);
    cx += (TEX_GLYPH_W + 1) * scale;
  }
  return texTextWidth(text, scale);
}

/** Draw katakana-like mark `index` (wraps around TEX_KANA_COUNT) with its top-left corner at (x, y). */
export function texKana(buf: PixelBuffer, index: number, x: number, y: number, hex: number, scale = 1): void {
  stamp(buf, KANA[((index % KANA.length) + KANA.length) % KANA.length]!, x, y, hex, scale);
}

/** Two upper-case hex digits for a byte. */
export function texHexByte(value: number): string {
  return (value & 255).toString(16).toUpperCase().padStart(2, '0');
}
