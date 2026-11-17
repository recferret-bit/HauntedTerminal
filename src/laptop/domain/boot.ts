/**
 * The boot sequence as a timeline (ms from the start of the `booting` phase): BIOS lines, a memory
 * count, then the OS splash with a block progress bar. The boot view only plays it; `bootFrame` is the
 * pure "what is on screen at time t" so it can be tested and scrubbed.
 */
import { PHASE_MS } from './machine.js';

export interface BootLine {
  at: number;
  text: string;
}

export const BOOT = {
  lines: [
    { at: 0, text: 'HAUNTED BIOS v1.02   (C) 1994 Phantom Megatrends Inc.' },
    { at: 200, text: 'CPU : 486DX2-66   math co-processor found' },
    { at: 1500, text: 'IDE 0 : HAUNTED HDD 540 MB' },
    { at: 1750, text: 'IDE 1 : none            serial : COM1 /dev/ttyS0' },
    { at: 2050, text: 'Starting HAUNTED/OS ...' },
  ] as readonly BootLine[],
  /** The memory test counts up between these times. */
  memory: { from: 450, to: 1350, kb: 16384 },
  splashAt: 2500,
  /** The progress bar fills between `splashAt` and here. */
  barDoneAt: (PHASE_MS.booting ?? 5200) - 350,
  blocks: 18,
} as const;

export interface BootFrame {
  lines: string[];
  splash: boolean;
  /** Filled blocks of the progress bar. */
  filled: number;
}

export function bootFrame(t: number): BootFrame {
  const lines = BOOT.lines.filter((l) => l.at <= t).map((l) => l.text);
  const m = BOOT.memory;
  if (t >= m.from) {
    const k = Math.min(1, (t - m.from) / (m.to - m.from));
    // The memory count steps in 1024K chunks, the way the real ones flickered.
    const kb = Math.floor((k * m.kb) / 1024) * 1024;
    lines.splice(2, 0, `Memory test : ${String(kb).padStart(5)}K${k >= 1 ? ' OK' : ''}`);
  }
  const span = BOOT.barDoneAt - BOOT.splashAt;
  const filled = t < BOOT.splashAt ? 0 : Math.min(BOOT.blocks, Math.floor(((t - BOOT.splashAt) / span) * BOOT.blocks));
  return { lines, splash: t >= BOOT.splashAt, filled };
}
