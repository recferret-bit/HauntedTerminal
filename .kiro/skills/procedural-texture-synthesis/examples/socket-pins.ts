/**
 * Worked example: a CPU socket pin field, start to finish.
 * Not registered in the game. Check it and see it without touching src/:
 *
 *   node .kiro/skills/procedural-texture-synthesis/scripts/validate-textures.mjs \
 *     --file .kiro/skills/procedural-texture-synthesis/examples/socket-pins.ts --sheet --out scripts/harness/out/draft.png
 *
 * To ship a texture like this: move the entry into src/procgen/textures/surfaces.ts (import the toolkit
 * from './toolkit.js' and './font.js' there), add it to SURFACE_TEXTURES, run `npm run procgen:textures`.
 */
import {
  INK, PAPER, makeRng, texColor, texDisc, texNew, texRect, texText, texTextWidth,
  type PixelBuffer, type TexEntry,
} from '../../../../src/procgen/index.js';

// 1. Decide the identity in one sentence and pick the zones before drawing anything.
//    "Gold pins on a dark board, ink-ringed, a few missing, one silk-screen mark."
//    Dominant pcbDark, second gold, accent paper. The validator locks the texture to exactly these.
const ZONES = ['pcbDark', 'gold'] as const;

// 2. Pick a size and a grid. Everything sits on multiples of 2 px (the pixel-art pass samples 2 px
//    cells) and the 16 px pin pitch divides 128, so the lattice wraps without a seam.
const SIZE = 128;
const PITCH = 16;

function build(seed: number): PixelBuffer {
  // 3. One rng from the seed. The seed moves things around; it never changes what the texture is.
  const rng = makeRng(seed);

  // 4. Flat base colour. texColor(zone, shade) is the only source of colour: shade 0 lit, 1 mid, 2 shadow.
  const buf = texNew(SIZE, SIZE, texColor('pcbDark'));

  // 5. Big shapes first: a keep-out block where the label goes. Its position is the seeded layout.
  const label = rng.pick(['LGA', 'PGA', 'ZIF', 'BGA']);
  const labelW = texTextWidth(label, 2);
  const bx = PITCH * rng.int(1, 4), by = PITCH * rng.int(1, 5);
  const inBlock = (x: number, y: number): boolean => x >= bx && x < bx + 48 && y >= by && y < by + 32;

  // 6. The repeating feature, with ink under it. Ink is drawn as a slightly larger shape first:
  //    radius 6 of ink, then radius 4 of gold (a 2 px ring), then a darker cel step. No gradients anywhere.
  for (let y = PITCH / 2; y < SIZE; y += PITCH) {
    for (let x = PITCH / 2; x < SIZE; x += PITCH) {
      if (inBlock(x, y)) continue;
      const missing = rng.chance(0.08);
      texDisc(buf, x, y, 6, INK);
      if (missing) continue; // an empty socket hole: variation without a new colour
      texDisc(buf, x, y, 4, texColor('gold'));
      texDisc(buf, x - 1, y + 1, 2.5, texColor('gold', 1)); // cel shadow, lower-left (light is upper screen-right)
    }
  }

  // 7. The accent: a recessed plate with silk-screen text at scale 2 (1 px strokes do not survive).
  texRect(buf, bx + 2, by + 2, 44, 28, texColor('pcbDark', 1));
  texRect(buf, bx + 2, by + 2, 44, 2, INK);
  texText(buf, label, bx + 2 + Math.floor((44 - labelW) / 2), by + 12, PAPER, 2);

  // 8. Nothing else. No noise, no wear, no highlights: the cel bands and halftone come from the shader.
  return buf;
}

export const socketPins: TexEntry = {
  id: 'tex.example.socket-pins',
  label: 'Socket pin field',
  usage: 'surface',
  tileable: true,
  zones: ZONES,
  purpose: 'Example only: a CPU socket pin field with a silk-screen plate.',
  build,
};
