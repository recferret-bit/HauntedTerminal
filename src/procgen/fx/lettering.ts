import type { Vec2 } from '../core/types.js';
import { fxSoupFromTriangles, type FxSoup } from './shapes.js';

/**
 * Onomatopoeia lettering as geometry: a 5-row pixel font laid out in page space.
 * No canvas, no DOM, so the same word is drawn by the game (comic material quads),
 * by the node filmstrip and measured by the validator.
 */
const FONT: Record<string, string> = {
  A: '010/101/111/101/101', B: '110/101/110/101/110', C: '011/100/100/100/011', D: '110/101/101/101/110',
  E: '111/100/110/100/111', F: '111/100/110/100/100', G: '011/100/101/101/011', H: '101/101/111/101/101',
  I: '111/010/010/010/111', J: '001/001/001/101/010', K: '101/101/110/101/101', L: '100/100/100/100/111',
  M: '10001/11011/10101/10001/10001', N: '1001/1101/1011/1001/1001', O: '010/101/101/101/010',
  P: '110/101/110/100/100', Q: '010/101/101/110/011', R: '110/101/110/101/101', S: '011/100/010/001/110',
  T: '111/010/010/010/010', U: '101/101/101/101/111', V: '101/101/101/101/010',
  W: '10001/10001/10101/11011/10001', X: '101/101/010/101/101', Y: '101/101/010/010/010', Z: '111/001/010/100/111',
  0: '111/101/101/101/111', 1: '010/110/010/010/111', 2: '110/001/010/100/111', 3: '110/001/010/001/110',
  4: '101/101/111/001/001', 5: '111/100/110/001/110', 6: '011/100/110/101/010', 7: '111/001/010/010/010',
  8: '010/101/010/101/010', 9: '010/101/011/001/110',
  '!': '1/1/1/0/1', '?': '110/001/010/000/010', '+': '000/010/111/010/000', '-': '000/000/111/000/000',
  '/': '001/001/010/100/100', '.': '0/0/0/0/1', ':': '0/1/0/1/0', x: '000/101/010/101/000',
  '(': '01/10/10/10/01', ')': '10/01/01/01/10', '>': '100/010/001/010/100', '_': '000/000/000/000/111',
  '#': '01010/11111/01010/11111/01010', '%': '101/001/010/100/101', ' ': '00/00/00/00/00',
};

export const FX_WORD_MAX_CHARS = 18;
export const FX_WORD_DEFAULT_SIZE = 0.3;
export const FX_WORD_DEFAULT_OFFSET: Vec2 = [0, 0.7];

/** Characters the lettering font can draw. */
export function fxWordCharset(): string {
  return Object.keys(FONT).join('');
}

export function fxWordUnsupported(text: string): string[] {
  return [...new Set([...text].filter((ch) => !(ch in FONT)))];
}

/** Long words break once, at the space nearest the middle, so a shout stays a block and not a banner. */
export function fxWordLines(text: string): string[] {
  if (text.length <= 10 || !text.includes(' ')) return [text];
  let best = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ' && (best < 0 || Math.abs(i - text.length / 2) < Math.abs(best - text.length / 2))) best = i;
  }
  return [text.slice(0, best), text.slice(best + 1)];
}

export interface FxWordLayout {
  /** Lit runs as [x, y, w, h] in page units, y is the BOTTOM of the run; the block is centred on (0, 0). */
  rects: [number, number, number, number][];
  width: number;
  height: number;
  /** Size of one font pixel in world units. */
  cell: number;
  lines: string[];
}

export function fxLayoutWord(text: string, capHeight = FX_WORD_DEFAULT_SIZE): FxWordLayout {
  const cell = capHeight / 5;
  const lines = fxWordLines(text);
  const lineStep = 6.5;
  const widths = lines.map((line) => [...line].reduce((w, ch) => w + (FONT[ch] ?? FONT['?']!).split('/')[0]!.length + 1, -1));
  const blockW = Math.max(...widths, 1);
  const blockH = 5 + (lines.length - 1) * lineStep;
  const rects: [number, number, number, number][] = [];
  lines.forEach((line, li) => {
    let cx = (blockW - widths[li]!) / 2;
    const top = blockH - li * lineStep;
    for (const ch of line) {
      const rows = (FONT[ch] ?? FONT['?']!).split('/');
      const w = rows[0]!.length;
      rows.forEach((row, ri) => {
        let run = -1;
        for (let c = 0; c <= w; c++) {
          const lit = c < w && row[c] === '1';
          if (lit && run < 0) run = c;
          if (!lit && run >= 0) {
            rects.push([(cx + run - blockW / 2) * cell, (top - ri - 1 - blockH / 2) * cell, (c - run) * cell, cell]);
            run = -1;
          }
        }
      });
      cx += w + 1;
    }
  });
  return { rects, width: blockW * cell, height: blockH * cell, cell, lines };
}

/** The word as camera-facing quads (normal -z), optionally grown by `grow` units for the ink backing. */
export function fxWordSoup(layout: FxWordLayout, grow = 0): FxSoup {
  const pos = new Float32Array(layout.rects.length * 18);
  layout.rects.forEach(([x, y, w, h], i) => {
    const x0 = x - grow, y0 = y - grow, x1 = x + w + grow, y1 = y + h + grow;
    pos.set([x0, y0, 0, x0, y1, 0, x1, y1, 0, x0, y0, 0, x1, y1, 0, x1, y0, 0], i * 18);
  });
  return fxSoupFromTriangles(pos);
}
