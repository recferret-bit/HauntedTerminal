/**
 * item.laptop: an old clamshell laptop with a carry handle, closed and stood on its edge like a
 * briefcase, lid to the camera. Beige plastic, a brown handle and hinge barrel like the lantern's (his
 * things share one leather brown, which keeps him under the zone budget while he holds it), a `>_`
 * sticker and one amber sleep light that says the machine inside is still running. The `grip` socket is
 * the top of the handle.
 * Briefs: .kiro/skills/haunted-art-direction/references/world-lexicon.md
 */
import type { ModelSpec, PartSpec } from '../../core/types.js';
import { kitBox, kitDisc, kitPlate, outlineRoundRect, outlineStroke, SCREEN_LEFT, SCREEN_RIGHT } from '../../kit/greebles.js';

const W = 0.5;
const H = 0.36;
const BEVEL = 0.02;
/** Centre of the shell; the bevel grows the outline, so lift it by the bevel to stand on y = 0. */
const CY = H / 2 + BEVEL;
const TOP = H + 2 * BEVEL;

export function buildLaptop(_seed: number): ModelSpec {
  const handle: [number, number][] = [[0.13, -0.02], [0.13, 0.07], [0.09, 0.12], [-0.09, 0.12], [-0.13, 0.07], [-0.13, -0.02]];
  const parts: PartSpec[] = [
    kitPlate('handle', outlineStroke(handle, 0.04), 0.05, 'hair', [0, TOP - 0.01, 0.0]),
    kitPlate('shell', outlineRoundRect(W, H, 0.08, 4), 0.1, 'plastic', [0, CY, 0], { bevel: BEVEL }),
    kitPlate('hinge', outlineRoundRect(W * 0.8, 0.045, 0.02, 2), 0.12, 'hair', [0, TOP - 0.015, -0.005]),
    // The lid sits proud of the base: one more plate in front, so ink draws the seam.
    kitPlate('lid', outlineRoundRect(W - 0.06, H - 0.07, 0.06, 4), 0.03, 'plastic', [0, CY + 0.01, -0.07], { bevel: 0.01 }),
    kitPlate('sticker', outlineRoundRect(0.15, 0.1, 0.02, 2), 0.01, 'paper', [0.07 * SCREEN_LEFT, CY + 0.04, -0.092]),
    // `>_` drawn left to right on the page: the chevron points screen-right, the cursor follows it.
    kitPlate('sticker.prompt', outlineStroke([[0.04 * SCREEN_LEFT, 0.025], [0.01 * SCREEN_LEFT, 0], [0.04 * SCREEN_LEFT, -0.025]], 0.018), 0.01, 'ink', [0.1 * SCREEN_LEFT, CY + 0.045, -0.1], { outline: false }),
    kitBox('sticker.cursor', [0.04, 0.016, 0.01], 'ink', [0.05 * SCREEN_LEFT, CY + 0.02, -0.1], { outline: false }),
    kitPlate('latch', outlineRoundRect(0.12, 0.04, 0.015, 1), 0.04, 'paper', [0, 0.045, -0.08]),
    kitDisc('sleep.light', 0.022, 0.02, 'powerAmber', [0.17 * SCREEN_RIGHT, 0.06, -0.09], { outline: false, sides: 8 }),
  ];
  return {
    id: 'item.laptop', category: 'item', label: 'Laptop', parts,
    sockets: { grip: [0, TOP + 0.1, 0], label: [0, TOP + 0.24, 0], fx: [0, CY, -0.12], screen: [0, CY, -0.1] },
  };
}
