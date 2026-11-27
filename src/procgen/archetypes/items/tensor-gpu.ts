/**
 * item.tensor_gpu: a PCIe graphics card standing on its gold edge connector, carried by a steel
 * bracket handle. Teal (`pcb`) board, `heatsink` shroud with a rib block, a dark `silicon` die with
 * a 2x2 grid of glowing `dataCyan` tensor cells, `gold` contacts. Seeds only change the rib count.
 * Briefs: .kiro/skills/credits-art-direction/references/world-lexicon.md
 */
import type { ModelSpec, PartSpec } from '../../core/types.js';
import {
  greebleContactTeeth, greebleHeatsinkFins, kitBox, kitPlate, outlineChamferRect, outlineRoundRect, outlineStroke,
  SCREEN_LEFT, SCREEN_RIGHT,
} from '../../kit/greebles.js';

const W = 0.46;
const H = 0.26;
const BEVEL = 0.01;
const BASE = 0.08;
const CY = BASE + H / 2;
const TOP = CY + H / 2 + BEVEL;

export function buildTensorGpu(seed: number): ModelSpec {
  const ribs = 4 + (seed % 2);
  const handle: [number, number][] = [[0.1, -0.02], [0.1, 0.04], [0.07, 0.075], [-0.07, 0.075], [-0.1, 0.04], [-0.1, -0.02]];
  const cell = (name: string, dx: number, dy: number): PartSpec =>
    kitBox(name, [0.032, 0.032, 0.014], 'dataCyan', [(0.09 * SCREEN_RIGHT) + dx, CY + dy, -0.092], { outline: false });
  const parts: PartSpec[] = [
    kitPlate('handle', outlineStroke(handle, 0.036), 0.05, 'heatsink', [0, TOP - 0.01, 0]),
    ...greebleContactTeeth({ name: 'pcie', pos: [0.03 * SCREEN_LEFT, 0.04, 0.01], width: 0.3, count: 6, toothLength: 0.05, bar: 0.03, depth: 0.03, zone: 'gold' }),
    kitPlate('board', outlineRoundRect(W, H, 0.02, 2), 0.055, 'pcb', [0, CY, 0.01], { bevel: BEVEL }),
    kitPlate('shroud', outlineChamferRect(0.4, 0.21, 0.03), 0.045, 'pcb', [0, CY, -0.035]),
    ...greebleHeatsinkFins({ name: 'sink', pos: [0.1 * SCREEN_LEFT, CY, -0.0575], width: 0.17, height: 0.16, depth: 0.05, fins: ribs, style: 'ribs', zone: 'copper' })
      .map((p) => (p.name.startsWith('sink.rib') ? { ...p, outline: false } : p)),
    kitBox('die', [0.13, 0.13, 0.03], 'silicon', [0.09 * SCREEN_RIGHT, CY, -0.0725]),
    cell('cell.a', 0.026, 0.026),
    cell('cell.b', -0.026, 0.026),
    cell('cell.c', 0.026, -0.026),
    cell('cell.d', -0.026, -0.026),
  ];
  return {
    id: 'item.tensor_gpu',
    category: 'item',
    label: 'Tensor GPU',
    parts,
    sockets: {
      grip: [0, TOP + 0.065, 0],
      label: [0, TOP + 0.2, 0],
      fx: [0, CY, -0.1],
      die: [0.09 * SCREEN_RIGHT, CY, -0.09],
    },
  };
}
