/**
 * Cinematics: the opening (the developer at his desk, lightning, the AI agents, the teleport into the
 * machine) and the ending (back at the desk at dawn). CONTRACT, owned by the cinematic module:
 * main.ts calls these and awaits them; the game clock is paused (session.setPaused) while they run.
 * Both render into `host` (an element laid over the stage), clean up after themselves, and resolve when
 * finished or skipped (Esc / click / Enter).
 *
 * playIntro: ~40 s, three comic pages from comix/intro: he overworks his AI agents (Claude, Grok,
 *   Codex, Gemini parodies), lightning wakes them, they roast him and take over, the computer sucks him in.
 *   Esc / Enter / Space / click skips it and resolves at once. It resolves by itself after the
 *   "ENTERING FLOOR 01" card (main.ts relies on a full play lasting more than 23 s).
 * playOutro: reverse lightning at dawn, then a splash page with the run stats. Esc / Enter / click
 *   during the animation jumps to the splash; once "PRESS ANY KEY" shows, any key or click resolves.
 *   It draws no button: the caller shows "Play Again" after the promise resolves.
 * While either runs, keydown is captured on window and never reaches the terminal. Input in the first
 * 400 ms is ignored (the Enter that submitted `exit` must not skip the ending).
 * Both remove every DOM node, listener, WebGL context and AudioContext they made before resolving.
 * Preview / screenshots: /cinematic.html?play=intro|outro&t=<seconds>.
 */
import { suspendComicLight } from '../shaders/comic-material.js';
import { startIntro } from './intro.js';
import { startOutro } from './outro.js';

export interface OutroStats {
  rank: 'C' | 'B' | 'A' | 'S';
  timeSec: number;
  commands: number;
  shortcuts: string[];
}

export interface CinematicOptions {
  /** Allow Esc / Enter / click to skip. Default true. */
  skippable?: boolean;
  muted?: boolean;
}

export async function playIntro(host: HTMLElement, opts: CinematicOptions = {}): Promise<void> {
  suspendComicLight(true);
  try {
    await startIntro(host, opts);
  } catch (err) {
    console.error('[cinematic] intro failed', err);
  } finally {
    suspendComicLight(false);
  }
}

export async function playOutro(host: HTMLElement, stats: OutroStats, opts: CinematicOptions = {}): Promise<void> {
  suspendComicLight(true);
  try {
    await startOutro(host, stats, opts);
  } catch (err) {
    console.error('[cinematic] outro failed', err);
  } finally {
    suspendComicLight(false);
  }
}
