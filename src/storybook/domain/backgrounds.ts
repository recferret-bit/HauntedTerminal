import { FLOOR_THEMES, PAPER, type FloorId } from '../../procgen/core/palette.js';
import type { BgId } from './options.js';

export function bgColor(bg: BgId): number {
  if (bg === 'paper') return PAPER;
  return FLOOR_THEMES[Number(bg.slice(5)) as FloorId].bg;
}

export function bgLabel(bg: BgId): string {
  if (bg === 'paper') return 'paper';
  return `${bg.slice(5)} ${FLOOR_THEMES[Number(bg.slice(5)) as FloorId].name}`;
}
