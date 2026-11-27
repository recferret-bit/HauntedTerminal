/**
 * item.vram_module: a small memory card standing on its gold pins, carried by a steel clip handle.
 * Teal (`pcb`) board, three dark `silicon` memory chips with `heatsink` marks, a `dataCyan` status
 * pip, `gold` contacts. Seeds only move the notch.
 * Briefs: .kiro/skills/credits-art-direction/references/world-lexicon.md
 */
import type { ModelSpec, PartSpec } from '../../core/types.js';
import {
  greebleContactTeeth, greebleDipChip, kitBox, kitPlate, outlineRoundRect, outlineStroke, SCREEN_LEFT, SCREEN_RIGHT,
} from '../../kit/greebles.js';

const W = 0.4;
const H = 0.2;
const BEVEL = 0.01;
const BASE = 0.07;
const CY = BASE + H / 2;
const TOP = CY + H / 2 + BEVEL;

export function buildVramModule(seed: number): ModelSpec {
  const handle: [number, number][] = [[0.08, -0.02], [0.08, 0.035], [0.055, 0.065], [-0.055, 0.065], [-0.08, 0.035], [-0.08, -0.02]];
  const chip = (i: number): PartSpec[] =>
    greebleDipChip({
      name: `chip${i}`, pos: [(0.12 - i * 0.12) * SCREEN_LEFT, CY - 0.01, -0.03], width: 0.1, height: 0.1, depth: 0.05,
      legSides: 'none', zone: 'silicon', notch: false, marks: 1, markZone: 'heatsink',
    });
  const notchX = (0.09 + 0.04 * (seed % 3)) * SCREEN_RIGHT;
  const parts: PartSpec[] = [
    kitPlate('handle', outlineStroke(handle, 0.034), 0.05, 'heatsink', [0, TOP - 0.01, 0]),
    ...greebleContactTeeth({ name: 'pins', pos: [0, 0.035, 0.01], width: 0.34, count: 8, toothLength: 0.045, bar: 0.03, depth: 0.03, zone: 'gold' }),
    kitPlate('board', outlineRoundRect(W, H, 0.02, 2), 0.055, 'pcb', [0, CY, 0.01], { bevel: BEVEL }),
    ...chip(0), ...chip(1), ...chip(2),
    kitBox('pip', [0.034, 0.034, 0.014], 'dataCyan', [0.17 * SCREEN_RIGHT, CY + 0.048, -0.07], { outline: false }),
    kitBox('notch', [0.03, 0.03, 0.02], 'ink', [notchX, 0.075, -0.02], { outline: false }),
  ];
  return {
    id: 'item.vram_module',
    category: 'item',
    label: 'VRAM module',
    parts,
    sockets: {
      grip: [0, TOP + 0.055, 0],
      label: [0, TOP + 0.19, 0],
      fx: [0, CY, -0.09],
    },
  };
}
