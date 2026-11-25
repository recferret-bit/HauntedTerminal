/**
 * item.manual: the developer's dog-eared hardcover Unix Field Manual, carried by a leather spine
 * handle. Dark teal (`pcb`) boards, brown leather (`hair`) spine and strap shared with his other
 * gear, creamy `paper` page block, orange (`hoodie`) ribbon bookmark, and a glowing `phosphor` `>_`
 * emblem. Zero `light` socket: holding it does not emit an oil-lantern light cone.
 * Briefs: .kiro/skills/credits-art-direction/references/world-lexicon.md
 */
import type { ModelSpec, PartSpec } from '../../core/types.js';
import { kitBox, kitPlate, outlineRoundRect, outlineStroke, SCREEN_LEFT, SCREEN_RIGHT } from '../../kit/greebles.js';

const W = 0.34;
const H = 0.4;
const BEVEL = 0.015;
const CY = H / 2 + BEVEL;
const TOP = H + 2 * BEVEL;

export function buildManual(_seed: number): ModelSpec {
  const handle: [number, number][] = [
    [0.09, -0.02], [0.09, 0.045], [0.06, 0.08], [-0.06, 0.08], [-0.09, 0.045], [-0.09, -0.02],
  ];
  const parts: PartSpec[] = [
    kitPlate('handle', outlineStroke(handle, 0.036), 0.05, 'hair', [0, TOP - 0.01, 0]),
    kitPlate('cover', outlineRoundRect(W, H, 0.03, 3), 0.08, 'pcb', [0, CY, 0], { bevel: BEVEL }),
    kitPlate('spine', outlineRoundRect(0.08, H - 0.005, 0.02, 2), 0.1, 'hair', [(W / 2 - 0.03) * SCREEN_LEFT, CY, 0], { bevel: 0.006 }),
    kitBox('pages', [0.065, H - 0.04, 0.066], 'paper', [(W / 2 - 0.015) * SCREEN_RIGHT, CY, 0.002]),
    kitPlate('front.board', outlineRoundRect(W - 0.055, H - 0.05, 0.02, 2), 0.025, 'pcb', [0.015 * SCREEN_RIGHT, CY, -0.048], { bevel: 0.008 }),
    kitPlate('title.plate', outlineRoundRect(0.19, 0.11, 0.015, 2), 0.01, 'paper', [0.025 * SCREEN_RIGHT, CY + 0.065, -0.064], { outline: false }),
    kitBox('title.rule1', [0.13, 0.016, 0.01], 'ink', [0.025 * SCREEN_RIGHT, CY + 0.09, -0.071], { outline: false }),
    kitBox('title.rule2', [0.1, 0.016, 0.01], 'ink', [0.015 * SCREEN_RIGHT, CY + 0.055, -0.071], { outline: false }),
    kitPlate(
      'emblem.prompt',
      outlineStroke([[0.032 * SCREEN_LEFT, 0.018], [0.008 * SCREEN_LEFT, 0], [0.032 * SCREEN_LEFT, -0.018]], 0.015),
      0.01,
      'phosphor',
      [0.055 * SCREEN_LEFT, CY - 0.065, -0.065],
      { outline: false },
    ),
    kitBox('emblem.cursor', [0.03, 0.014, 0.01], 'phosphor', [0.01 * SCREEN_LEFT, CY - 0.082, -0.065], { outline: false }),
    kitPlate('clasp', outlineRoundRect(0.085, 0.045, 0.015, 1), 0.05, 'hair', [(W / 2 - 0.015) * SCREEN_RIGHT, CY - 0.02, -0.032]),
    kitBox('bookmark', [0.034, 0.06, 0.014], 'hoodie', [(W / 2 - 0.07) * SCREEN_RIGHT, 0.045, -0.062], { outline: false }),
  ];

  return {
    id: 'item.manual',
    category: 'item',
    label: 'Manual',
    parts,
    sockets: {
      grip: [0, TOP + 0.07, 0],
      label: [0, TOP + 0.21, 0],
      fx: [0, CY, -0.09],
      cover: [0.015 * SCREEN_RIGHT, CY, -0.075],
    },
  };
}
