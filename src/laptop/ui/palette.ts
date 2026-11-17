/**
 * The laptop draws in the game's one palette: every zone it uses becomes a CSS custom property
 * (`--z-plastic`, `--z-phosphor`, ...), so laptop.css never inlines a colour of its own.
 */
import { ZONES, type ZoneId } from '../../procgen/core/palette.js';

const USED: readonly ZoneId[] = [
  'ink', 'paper', 'plastic', 'solder', 'heatsink', 'rubber', 'silicon', 'pcb', 'pcbDark',
  'hoodie', 'skin', 'hair', 'phosphor', 'powerAmber', 'dataCyan', 'lockRed',
];

export function paletteVars(): Record<string, string> {
  return Object.fromEntries(USED.map((id) => [`--z-${id}`, `#${ZONES[id].color.toString(16).padStart(6, '0')}`]));
}
