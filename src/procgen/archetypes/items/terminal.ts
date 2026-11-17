/**
 * item.terminal: the developer's handheld field cyberdeck slate, carried in his inventory and
 * stood on its edge. Dark silicon shell, brown leather grip handle on top (shared brown tone with
 * the lantern and laptop), a recessed pcbDark bezel with glowing phosphor `>_` screen, and a solder
 * keypad. Sockets: `grip` at handle top, `screen` at display center, `label` above, `fx` at center.
 * No `light` socket: holding it does not emit an oil-lantern light cone.
 * Briefs: .kiro/skills/haunted-art-direction/references/world-lexicon.md
 */
import type { ModelSpec, PartSpec } from '../../core/types.js';
import { kitBox, kitPlate, outlineRoundRect, outlineStroke, SCREEN_LEFT } from '../../kit/greebles.js';

const W = 0.44;
const H = 0.32;
const BEVEL = 0.015;
const CY = H / 2 + BEVEL;
const TOP = H + 2 * BEVEL;

export function buildTerminal(_seed: number): ModelSpec {
  const handle: [number, number][] = [
    [0.11, -0.02], [0.11, 0.05], [0.07, 0.09], [-0.07, 0.09], [-0.11, 0.05], [-0.11, -0.02],
  ];
  const parts: PartSpec[] = [
    kitPlate('handle', outlineStroke(handle, 0.035), 0.05, 'hair', [0, TOP - 0.01, 0.0]),
    kitPlate('shell', outlineRoundRect(W, H, 0.04, 3), 0.08, 'silicon', [0, CY, 0], { bevel: BEVEL }),
    kitPlate('foot', outlineRoundRect(W * 0.75, 0.036, 0.01, 1), 0.085, 'silicon', [0, 0.018, 0], { outline: false }),
    // Recessed screen area: dark bezel, glass, glowing phosphor prompt and block cursor
    kitPlate('bezel', outlineRoundRect(W - 0.06, 0.15, 0.02, 2), 0.02, 'ink', [0, CY + 0.05, -0.045], { bevel: 0.008 }),
    kitPlate('screen', outlineRoundRect(W - 0.1, 0.11, 0.015, 2), 0.01, 'ink', [0, CY + 0.05, -0.056], { outline: false }),
    kitPlate(
      'screen.prompt',
      outlineStroke([[0.035 * SCREEN_LEFT, 0.02], [0.01 * SCREEN_LEFT, 0], [0.035 * SCREEN_LEFT, -0.02]], 0.016),
      0.01, 'phosphor', [0.09 * SCREEN_LEFT, CY + 0.05, -0.063], { outline: false },
    ),
    kitBox('screen.cursor', [0.032, 0.014, 0.01], 'phosphor', [0.04 * SCREEN_LEFT, CY + 0.03, -0.063], { outline: false }),
    // Keypad under the display
    kitPlate('keypad', outlineRoundRect(W - 0.08, 0.075, 0.015, 2), 0.02, 'ink', [0, CY - 0.085, -0.045]),
    kitPlate('keys', outlineRoundRect(W - 0.12, 0.045, 0.01, 1), 0.015, 'silicon', [0, CY - 0.085, -0.056], { texture: 'tex.grille' }),
  ];

  return {
    id: 'item.terminal',
    category: 'item',
    label: 'Terminal',
    parts,
    sockets: {
      grip: [0, TOP + 0.08, 0],
      label: [0, TOP + 0.22, 0],
      fx: [0, CY, -0.08],
      screen: [0, CY + 0.05, -0.07],
    },
  };
}
