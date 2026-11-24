/**
 * item.lantern: the oil lantern the developer carries. `ls -a` lights it and dotfiles show.
 * Standing on its foot at y = 0; the `grip` socket is the handle ring, where a hand closes.
 * Briefs: .kiro/skills/credits-art-direction/references/world-lexicon.md
 */
import type { ModelSpec } from '../../core/types.js';
import { kitPlate, kitRing, outlineRoundRect, outlineSymmetric } from '../../kit/greebles.js';

export function buildLantern(_seed: number): ModelSpec {
  return {
    id: 'item.lantern', category: 'item', label: 'Lantern',
    parts: [
      // Hands close over handles: the holder draws a part named `handle` behind the hand.
      kitRing('handle', 0.075, 0.045, 0.04, 'hair', [0, 0.33, 0], { sides: 12 }),
      kitPlate('cap', outlineSymmetric([[0.085, 0], [0.085, 0.025], [0.035, 0.07]]), 0.14, 'hair', [0, 0.225, 0]),
      kitPlate('glass', outlineRoundRect(0.15, 0.2, 0.04, 2), 0.12, 'lantern', [0, 0.135, 0]),
      kitPlate('foot', outlineRoundRect(0.19, 0.05, 0.02, 1), 0.14, 'hair', [0, 0.025, 0]),
    ],
    sockets: { grip: [0, 0.33, 0], light: [0, 0.135, -0.07], label: [0, 0.56, 0], fx: [0, 0.2, -0.1] },
  };
}
