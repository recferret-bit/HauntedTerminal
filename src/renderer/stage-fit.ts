/**
 * DOM text fitting for the stage overlay: a speech balloon is shrunk (font down to 10 px, then a cap at
 * whole lines) to the room between the HUD strip and the speaker, and FX lettering wider than the panel
 * is scaled down. Pure element work; stage-overlay.ts decides where the room is.
 */

import type * as THREE from 'three';

/** One piece of overlay DOM placed from a world point (or a px position) every stage step. */
export interface Item {
  wrap: HTMLDivElement;
  el: HTMLElement;
  t: number;
  life: number;
  world: (() => THREE.Vector3 | null) | null;
  /** Fixed px position (used when `world` is null). */
  px: { x: number; y: number } | null;
  dy: number;
  clamp: boolean;
  halfW: number;
  /** Lettering that slides clear of page chrome, cameos and earlier captions (stage-avoid.ts). */
  avoid: boolean;
  /** Speech balloon: shrinks and clips to the room between the HUD strip and the speaker. */
  fit: boolean;
  /** Anchored on its centre (FX words) instead of its bottom edge. */
  center: boolean;
  /** Last room (px) the balloon was fitted to, and whether a word was already shrunk to the panel. */
  fitKey: number;
  sized: boolean;
  render: ((t01: number, ms: number) => void) | null;
  done: boolean;
}

const MIN_FONT_PX = 10;

/** Make `el` at most `room` px tall: shrink the font, then clip at a whole number of lines. */
export function fitBalloonText(el: HTMLElement, room: number): void {
  el.style.fontSize = '';
  el.style.maxHeight = '';
  el.style.overflow = '';
  let fs = parseFloat(getComputedStyle(el).fontSize) || 12;
  while (el.offsetHeight > room && fs > MIN_FONT_PX) {
    fs -= 1;
    el.style.fontSize = `${fs}px`;
  }
  if (el.offsetHeight <= room) return;
  const s = getComputedStyle(el);
  const extras = parseFloat(s.paddingTop) + parseFloat(s.paddingBottom) + parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth);
  const lh = parseFloat(s.lineHeight) || fs * 1.25;
  const lines = Math.max(2, Math.floor((Math.max(room, 0) - extras) / lh));
  el.style.maxHeight = `${(extras + lines * lh).toFixed(1)}px`;
  el.style.overflow = 'hidden';
}

/** Scale the `--fs` of lettering down so it is at most `maxW` px wide. */
export function fitWordWidth(el: HTMLElement, maxW: number): void {
  const w = el.offsetWidth;
  if (w <= maxW) return;
  const fs = parseFloat(el.style.getPropertyValue('--fs')) || 20;
  el.style.setProperty('--fs', `${Math.max(12, (fs * maxW) / w).toFixed(1)}px`);
}
