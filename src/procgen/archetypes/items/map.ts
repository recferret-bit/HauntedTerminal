/**
 * item.map: the developer's trace-etched PCB motherboard schematic slate, carried by a leather top
 * strap. Dark teal (`pcb`) motherboard, brown leather (`hair`) strap and side edge rails shared with
 * his other gear, dark (`ink`) schematic bed with `paper` bus channels, `hoodie` / `pcb` IC sector
 * blocks, and glowing `phosphor` node beacons. Zero `light` socket.
 * Briefs: .kiro/skills/credits-art-direction/references/world-lexicon.md
 */
import type { ModelSpec, PartSpec } from '../../core/types.js';
import { kitBox, kitPlate, outlineRoundRect, outlineStroke, SCREEN_LEFT, SCREEN_RIGHT } from '../../kit/greebles.js';

const W = 0.42;
const H = 0.34;
const BEVEL = 0.015;
const CY = H / 2 + BEVEL;
const TOP = H + 2 * BEVEL;

export function buildMap(_seed: number): ModelSpec {
  const strapPts: [number, number][] = [
    [0.12, -0.02], [0.11, 0.055], [0, 0.08], [-0.11, 0.055], [-0.12, -0.02],
  ];
  const parts: PartSpec[] = [
    kitPlate('handle', outlineStroke(strapPts, 0.036), 0.05, 'hair', [0, TOP - 0.01, 0]),
    kitPlate('board', outlineRoundRect(W, H, 0.03, 3), 0.075, 'pcb', [0, CY, 0], { bevel: BEVEL }),
    kitBox('rail.l', [0.04, H - 0.02, 0.085], 'hair', [(W / 2 - 0.01) * SCREEN_LEFT, CY, -0.002]),
    kitBox('rail.r', [0.04, H - 0.02, 0.085], 'hair', [(W / 2 - 0.01) * SCREEN_RIGHT, CY, -0.002]),
    kitPlate('well', outlineRoundRect(W - 0.09, H - 0.07, 0.02, 2), 0.022, 'ink', [0, CY, -0.044], { bevel: 0.006 }),
    // Silkscreen banner strip along top of board face
    kitBox('banner', [0.24, 0.035, 0.014], 'paper', [0, CY + 0.09, -0.055], { outline: false }),
    // Orthogonal PCB channel bus wires across the recessed dark bed
    kitBox('bus.top', [0.24, 0.016, 0.014], 'paper', [0, CY + 0.035, -0.055], { outline: false }),
    kitBox('bus.mid', [0.24, 0.016, 0.014], 'paper', [0, CY - 0.025, -0.055], { outline: false }),
    kitBox('bus.bot', [0.24, 0.016, 0.014], 'paper', [0, CY - 0.085, -0.055], { outline: false }),
    kitBox('trunk.l', [0.018, 0.14, 0.014], 'paper', [0.11 * SCREEN_LEFT, CY - 0.025, -0.055], { outline: false }),
    kitBox('trunk.r', [0.018, 0.14, 0.014], 'paper', [0.11 * SCREEN_RIGHT, CY - 0.025, -0.055], { outline: false }),
    // IC sector blocks mounted over the bus traces
    kitBox('chip.boot', [0.052, 0.052, 0.018], 'hoodie', [0.11 * SCREEN_LEFT, CY - 0.025, -0.06], { outline: false }),
    kitBox('chip.ch1', [0.05, 0.04, 0.018], 'pcb', [0, CY + 0.035, -0.06], { outline: false }),
    kitBox('chip.ch2', [0.05, 0.04, 0.018], 'pcb', [0, CY - 0.025, -0.06], { outline: false }),
    kitBox('chip.ch3', [0.05, 0.04, 0.018], 'pcb', [0, CY - 0.085, -0.06], { outline: false }),
    kitBox('chip.core', [0.056, 0.056, 0.018], 'hoodie', [0.11 * SCREEN_RIGHT, CY - 0.025, -0.06], { outline: false }),
    // Glowing active beacon dots on Boot ROM & Boss Core sockets
    kitBox('node.boot', [0.024, 0.024, 0.012], 'phosphor', [0.11 * SCREEN_LEFT, CY - 0.025, -0.068], { outline: false }),
    kitBox('node.core', [0.028, 0.028, 0.012], 'phosphor', [0.11 * SCREEN_RIGHT, CY - 0.025, -0.068], { outline: false }),
  ];

  return {
    id: 'item.map',
    category: 'item',
    label: 'Map',
    parts,
    sockets: {
      grip: [0, TOP + 0.075, 0],
      label: [0, TOP + 0.21, 0],
      fx: [0, CY, -0.09],
      board: [0, CY, -0.07],
    },
  };
}
