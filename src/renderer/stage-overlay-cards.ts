import { el as overlayNode } from '../contracts/dom.js';
import { imgNode, stepped, type Item, type PxRect } from './stage-fit.js';

export interface CardHost {
  panelRect(): PxRect;
  pin(el: HTMLElement, life: number, render: (t01: number, ms: number) => void): Item;
  textureUrl(id: string): string;
}

/** Page-turn card: swings in around the screen-left spine in 6 poses, holds, turns away in 5. */
export function buildStageCard(
  host: CardHost,
  kicker: string,
  title: string,
  path: string,
  accent: string,
  inMs: number,
  holdMs: number,
  outMs: number,
): { drop(): void } {
  const el = document.createElement('div');
  el.className = 'st-card';
  el.style.setProperty('--accent', accent);
  el.style.setProperty('--accent-a', `${accent}33`);
  const bolt = host.textureUrl('tex.decal.bolt');
  const halftone = host.textureUrl('tex.halftone');
  if (halftone) {
    el.style.backgroundImage = `url(${halftone})`;
    el.style.backgroundSize = '48px 48px';
    el.style.imageRendering = 'pixelated';
  }
  const kickChildren: Array<Node> = [overlayNode('span', '', [kicker])];
  if (bolt) {
    kickChildren.unshift(imgNode(bolt));
    kickChildren.push(imgNode(bolt));
  }
  el.replaceChildren(
    overlayNode('div', 'inner', [
      overlayNode('div', 'kick', kickChildren),
      overlayNode('h2', '', [title]),
      overlayNode('div', 'path', [path]),
    ]),
  );
  const total = inMs + holdMs + outMs;
  const it = host.pin(el, total, (_t, ms) => {
    const r = host.panelRect();
    el.style.left = `${r.x}px`;
    el.style.top = `${r.y}px`;
    el.style.width = `${r.w}px`;
    el.style.height = `${r.h}px`;
    let a = 0;
    if (ms < inMs) a = 90 * (1 - stepped(ms / inMs, 6));
    else if (ms > inMs + holdMs) a = 90 * stepped((ms - inMs - holdMs) / outMs, 5);
    el.style.transform = `perspective(${(r.w * 2.2).toFixed(0)}px) rotateY(${(-a).toFixed(1)}deg)`;
    el.style.visibility = a > 88 ? 'hidden' : '';
  });
  return {
    drop: () => {
      it.done = true;
      it.wrap.remove();
    },
  };
}

/** Lettering over the coredump tear (the torn-page art stays in the canvas). */
export function buildStageTearText(host: CardHost, title: string, sub: string, delayMs: number, showMs: number): void {
  const el = overlayNode('div', 'st-tear', [title, overlayNode('small', '', [sub])]);
  host.pin(el, delayMs + showMs, (_t, ms) => {
    const r = host.panelRect();
    const n = Math.floor(ms / 83);
    const on = ms >= delayMs;
    el.style.left = `${r.x + r.w / 2 + (n % 4 === 1 ? 6 : n % 4 === 3 ? -5 : 0)}px`;
    el.style.top = `${r.y + r.h * 0.42}px`;
    el.style.visibility = on && n % 7 !== 6 ? '' : 'hidden';
  });
}

/** Non-blocking bottom-left Comix Zone yellow caption box shown during level transitions. */
export function buildCaptionBox(
  host: CardHost,
  kicker: string,
  title: string,
  path: string,
  accent: string,
  lifeMs = 1180,
): { drop(): void } {
  const el = overlayNode('div', 'st-caption-box', [
    overlayNode('div', 'cap-kick', [kicker]),
    overlayNode('div', 'cap-body', [
      overlayNode('strong', '', [title]),
      overlayNode('span', '', [path]),
    ]),
  ]);
  el.style.setProperty('--accent', accent);
  const it = host.pin(el, lifeMs, (_t, ms) => {
    const r = host.panelRect();
    const h = el.offsetHeight || 56;
    const leftOffset = r.x < 56 ? 60 : 14;
    el.style.left = `${(r.x + leftOffset).toFixed(1)}px`;
    el.style.top = `${Math.max(r.y + 8, r.y + r.h - h - 14).toFixed(1)}px`;
    const scale = ms < 83 ? 0.9 : ms < 166 ? 1.03 : 1;
    const fadeOut = ms > lifeMs - 166 ? (ms > lifeMs - 83 ? 0 : 0.5) : 1;
    el.style.transform = `scale(${scale})`;
    el.style.opacity = String(fadeOut);
  });
  return {
    drop: () => {
      it.done = true;
      it.wrap.remove();
    },
  };
}
