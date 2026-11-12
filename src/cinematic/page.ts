/**
 * The comic page around the cinematic's canvas: paper with Ben-Day dots, ink-framed panels with
 * gutters, yellow narration boxes, speech bubbles, onomatopoeia, the SKIP hint and full-bleed cards.
 * It is DOM, like the game's own caption and HUD, so the lettering stays crisp above the pixel-art and
 * CRT passes. Everything is styled from the cinematic time `t`, never by CSS animations, so a frozen
 * `?t=` frame is exact.
 *
 * Panel rects are fractions of the page (inside the margin); `portrait` is used when the page is taller
 * than wide. Sizes inside a panel use container units (cqh / cqw / cqmin), so any window size works.
 */

export type Rect = [x: number, y: number, w: number, h: number];

export interface PanelDef {
  id: string;
  page: number;
  landscape: Rect;
  portrait: Rect;
}

const STYLE_ID = 'htc-cinematic-style';

const CSS = /* css */ `
.htc-root {
  position: absolute; inset: 0; z-index: 60; overflow: hidden; user-select: none; cursor: default; pointer-events: auto;
  background-color: #efe6d2;
  background-image: radial-gradient(#d9d0b8 1.2px, transparent 1.4px);
  background-size: 7px 7px;
  font-family: "Chakra Petch", "Arial Narrow", system-ui, sans-serif;
  color: #110e1b;
  --ink: #110e1b; --paper: #f4f1ea; --yellow: #ffd166; --mag: #ef476f; --cyan: #4cc9f0; --green: #39ff88;
}
.htc-root.htc-fixed { position: fixed; }
.htc-root * { box-sizing: border-box; }
.htc-page {
  position: absolute; inset: 0;
  background-color: #efe6d2;
  background-image: radial-gradient(#d9d0b8 1.2px, transparent 1.4px);
  background-size: 7px 7px;
  transform-origin: 0% 50%;
  backface-visibility: hidden;
}
.htc-page.htc-hidden { visibility: hidden; }
.htc-panel {
  position: absolute; border: 5px solid var(--ink); background: #110e1b; overflow: hidden;
  box-shadow: 7px 7px 0 rgba(17, 14, 27, 0.9);
  container-type: size;
}
.htc-panel.htc-hidden { visibility: hidden; }
.htc-panel > canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.htc-flash { position: absolute; inset: 0; background: #fffbe8; opacity: 0; pointer-events: none; }
.htc-caption {
  position: absolute; left: 3cqmin; top: 3cqmin; max-width: 70cqw;
  background: var(--yellow); border: 3px solid var(--ink); box-shadow: 4px 4px 0 var(--ink);
  padding: 0.35em 0.65em 0.3em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em;
  font-size: max(13px, min(5.2cqh, 3.4cqw)); line-height: 1.15; white-space: pre-wrap;
}
.htc-caption .htc-ghost { visibility: hidden; }
.htc-caption.htc-mono { font-family: "IBM Plex Mono", ui-monospace, monospace; font-weight: 600; background: var(--paper); }
.htc-sfx {
  position: absolute; left: 0; top: 0; font-weight: 700; font-style: italic; white-space: nowrap; pointer-events: none;
  color: var(--yellow); -webkit-text-stroke: 0.06em var(--ink); paint-order: stroke fill;
  text-shadow: 0.07em 0.07em 0 var(--ink); letter-spacing: 0.02em; line-height: 1;
  transform-origin: 50% 50%;
}
.htc-bubble {
  position: absolute; display: grid; place-items: center; text-align: center; pointer-events: none;
  transform-origin: 50% 100%;
}
.htc-bubble > svg { position: absolute; inset: -14% -9%; width: 118%; height: 128%; overflow: visible; }
.htc-bubble > span { position: relative; font-weight: 700; text-transform: uppercase; line-height: 1.02; letter-spacing: 0.01em; }
.htc-tails { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.htc-skip {
  position: absolute; right: 16px; bottom: 14px; z-index: 5; padding: 5px 11px 4px;
  font: 700 13px/1 "Chakra Petch", system-ui, sans-serif; letter-spacing: 0.08em;
  background: var(--ink); color: var(--paper); border: 2px solid var(--paper); box-shadow: 3px 3px 0 rgba(0,0,0,0.5);
  opacity: 0.82; pointer-events: none;
}
.htc-card {
  position: absolute; inset: 0; z-index: 4; background: #07080a; display: grid; place-items: center; overflow: hidden;
  container-type: size;
}
.htc-card-inner { display: grid; gap: 3cqh; justify-items: start; max-width: 90cqw; }
.htc-card .htc-big {
  font-weight: 700; font-size: max(26px, min(11cqh, 8.5cqw)); line-height: 1; padding: 0.18em 0.4em 0.12em;
  background: var(--yellow); color: var(--ink); border: 4px solid var(--paper); box-shadow: 8px 8px 0 var(--mag);
  transform: rotate(-2deg);
}
.htc-card .htc-path {
  font-family: "IBM Plex Mono", ui-monospace, monospace; font-weight: 600; color: var(--green);
  font-size: max(14px, min(4.6cqh, 3.3cqw)); text-shadow: 0 0 10px rgba(57, 255, 136, 0.55); white-space: pre;
}
.htc-cursor { display: inline-block; width: 0.6em; height: 1em; vertical-align: -0.12em; background: var(--green); margin-left: 0.08em; }
.htc-splash {
  position: absolute; z-index: 3; display: grid; gap: 1.6cqh; padding: 2.6cqh 3cqw;
  background: var(--paper); border: 5px solid var(--ink); box-shadow: 9px 9px 0 var(--ink);
  container-type: normal;
}
.htc-stats-title { font-weight: 700; font-size: max(22px, min(7cqh, 9cqw)); line-height: 0.95; color: var(--ink); text-transform: uppercase; }
.htc-stats-row { display: flex; flex-wrap: wrap; align-items: center; gap: 1.6cqh 2.4cqw; }
.htc-rank { position: relative; width: max(72px, min(19cqh, 24cqw)); height: max(72px, min(19cqh, 24cqw)); flex: none; display: grid; place-items: center; }
.htc-rank svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.htc-rank b { position: relative; font-size: max(36px, min(11cqh, 14cqw)); line-height: 1; color: var(--ink); }
.htc-stats { display: grid; grid-template-columns: auto auto; gap: 0.5cqh 1.6cqw; align-items: baseline; font-size: max(13px, min(3.1cqh, 4cqw)); }
.htc-stats dt { font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
.htc-stats dd { font-family: "IBM Plex Mono", ui-monospace, monospace; font-weight: 600; margin: 0; }
.htc-chips { display: flex; flex-wrap: wrap; gap: 0.6cqh 0.6cqw; max-width: 60cqw; }
.htc-chip { font: 600 max(11px, min(2.3cqh, 3cqw))/1 "IBM Plex Mono", ui-monospace, monospace; padding: 0.3em 0.5em; background: var(--ink); color: var(--yellow); }
.htc-meme {
  position: absolute; left: 3cqw; right: 3cqw; text-align: center; pointer-events: none; z-index: 2;
  font-family: Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Black", sans-serif; font-weight: 900;
  text-transform: uppercase; color: #fff; letter-spacing: 0.01em; line-height: 1.0;
  -webkit-text-stroke: 0.09em #000; paint-order: stroke fill; text-shadow: 0 0.04em 0 #000;
  font-size: max(15px, min(8.5cqh, 5.6cqw));
}
.htc-meme.htc-top { top: 3cqh; }
.htc-meme.htc-bottom { bottom: 3cqh; }
.htc-tag {
  position: absolute; left: 0; top: 0; transform: translate(-50%, 0); pointer-events: none; white-space: nowrap;
  font: 700 max(10px, min(4.2cqh, 2.8cqw))/1 "Chakra Petch", system-ui, sans-serif; letter-spacing: 0.08em;
  padding: 0.25em 0.4em 0.2em; background: var(--ink); color: var(--yellow); border: 2px solid var(--paper);
}
.htc-glitch {
  position: absolute; left: 0; right: 0; bottom: 6cqh; text-align: center; pointer-events: none; z-index: 2;
  font-family: Impact, Haettenschweiler, "Arial Black", sans-serif; font-weight: 900; color: #fff;
  font-size: max(18px, min(13cqh, 10cqw)); line-height: 1; letter-spacing: 0.04em; white-space: nowrap;
  -webkit-text-stroke: 0.06em #000; paint-order: stroke fill;
  text-shadow: 0.06em 0 0 #ef476f, -0.06em 0 0 #4cc9f0;
}
.htc-queue {
  position: absolute; right: 3cqmin; top: 16cqh; width: min(40cqw, 230px); display: grid; gap: 1.2cqh; pointer-events: none;
  font: 600 max(10px, min(3.6cqh, 2.4cqw))/1.15 "IBM Plex Mono", ui-monospace, monospace;
}
.htc-queue .htc-qhead { font-family: "Chakra Petch", system-ui, sans-serif; font-weight: 700; letter-spacing: 0.06em; color: var(--ink);
  background: var(--yellow); border: 2px solid var(--ink); padding: 0.3em 0.5em 0.25em; box-shadow: 3px 3px 0 var(--ink); }
.htc-queue .htc-qitem { background: var(--paper); color: var(--ink); border: 2px solid var(--ink); padding: 0.35em 0.55em; box-shadow: 3px 3px 0 var(--ink); }
.htc-queue .htc-qitem::before { content: "> "; color: #9b5de5; }
.htc-brain { position: absolute; inset: 0; display: grid; grid-template-rows: repeat(4, 1fr); background: var(--ink); gap: 4px; }
.htc-brain > div { position: relative; display: grid; grid-template-columns: 34% 1fr; align-items: center; overflow: hidden; padding: 0 3cqw; }
.htc-brain svg { width: 100%; height: 86%; overflow: visible; }
.htc-brain b { font-family: Impact, Haettenschweiler, "Arial Black", sans-serif; font-weight: 900; text-transform: uppercase; line-height: 1.02;
  font-size: max(10px, min(6.4cqh, 9.5cqw)); color: #fff; -webkit-text-stroke: 0.08em #000; paint-order: stroke fill; }
.htc-brain > div.htc-light b { color: var(--ink); -webkit-text-stroke: 0; text-shadow: 2px 2px 0 rgba(255,255,255,0.7); }
.htc-brain small { display: table; font: 700 max(8px, min(3.2cqh, 5cqw))/1 "Chakra Petch", system-ui, sans-serif; letter-spacing: 0.1em; color: var(--yellow);
  background: var(--ink); padding: 0.2em 0.4em 0.15em; -webkit-text-stroke: 0; text-shadow: none; margin-bottom: 0.35em; }
.htc-controls { position: absolute; right: 14px; bottom: 12px; z-index: 6; display: flex; gap: 10px; }
.htc-btn {
  font: 700 14px/1 "Chakra Petch", system-ui, sans-serif; letter-spacing: 0.08em; cursor: pointer; pointer-events: auto;
  padding: 8px 13px 7px; background: var(--yellow); color: var(--ink); border: 3px solid var(--ink);
  box-shadow: 4px 4px 0 var(--ink); transform: rotate(-1.5deg);
}
.htc-btn.htc-btn-skip { background: var(--paper); transform: rotate(1.5deg); }
.htc-btn:hover { filter: brightness(1.06); }
.htc-btn:active { box-shadow: 1px 1px 0 var(--ink); translate: 3px 3px; }
.htc-btn:focus-visible { outline: 3px solid var(--cyan); outline-offset: 3px; }
.htc-root.htc-paused::after {
  content: "PAUSED"; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(-4deg); z-index: 5;
  font: 900 max(28px, 9vmin)/1 Impact, Haettenschweiler, "Arial Black", sans-serif; color: #fff; letter-spacing: 0.04em;
  -webkit-text-stroke: 0.08em #000; paint-order: stroke fill; text-shadow: 0.08em 0.08em 0 #ef476f; pointer-events: none;
}
.htc-press { font-weight: 700; font-size: max(12px, min(2.6cqh, 3.4cqw)); letter-spacing: 0.1em; text-transform: uppercase; }
`;

export function injectStyle(): HTMLStyleElement {
  const existing = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (existing) {
    existing.dataset.users = String(Number(existing.dataset.users ?? '1') + 1);
    return existing;
  }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.dataset.users = '1';
  style.textContent = CSS;
  document.head.appendChild(style);
  return style;
}

export function releaseStyle(style: HTMLStyleElement): void {
  const users = Number(style.dataset.users ?? '1') - 1;
  if (users <= 0) style.remove();
  else style.dataset.users = String(users);
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** A jagged "shout" outline in a 0..100 box: an ellipse with spikes. */
export function jaggedPoints(spikes: number, seed: number, inner = 0.84): string {
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const wobble = 0.04 * Math.sin(seed + i * 2.3);
    const r = i % 2 === 0 ? 1 + wobble : inner + wobble;
    pts.push(`${(50 + Math.cos(a) * 50 * r).toFixed(1)},${(50 + Math.sin(a) * 50 * r).toFixed(1)}`);
  }
  return pts.join(' ');
}

/** An oval outline in a 0..100 box (plain speech / thought). */
export function ovalPoints(n = 28): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(`${(50 + Math.cos(a) * 50).toFixed(1)},${(50 + Math.sin(a) * 50).toFixed(1)}`);
  }
  return pts.join(' ');
}

export class ComicPage {
  readonly root: HTMLDivElement;
  readonly pages: HTMLDivElement[] = [];
  readonly panels = new Map<string, { def: PanelDef; el: HTMLDivElement; overlay: HTMLDivElement; flash: HTMLDivElement; tails: SVGSVGElement }>();
  private readonly style: HTMLStyleElement;
  private readonly fixed: boolean;

  constructor(host: HTMLElement, defs: PanelDef[], pageCount: number) {
    this.style = injectStyle();
    this.root = el('div', 'htc-root');
    this.root.setAttribute('role', 'presentation');
    this.fixed = getComputedStyle(host).position === 'static' && host !== document.body;
    if (this.fixed || host === document.body) this.root.classList.add('htc-fixed');
    for (let i = 0; i < pageCount; i++) {
      const page = el('div', 'htc-page');
      page.style.zIndex = String(pageCount - i);
      this.pages.push(page);
      this.root.appendChild(page);
    }
    for (const def of defs) {
      const panel = el('div', 'htc-panel htc-hidden');
      panel.dataset.panel = def.id;
      const overlay = el('div');
      overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
      const flash = el('div', 'htc-flash');
      const tails = svg('svg', { class: 'htc-tails' });
      overlay.append(tails);
      panel.append(flash, overlay);
      this.pages[def.page]!.appendChild(panel);
      this.panels.set(def.id, { def, el: panel, overlay, flash, tails });
    }
    host.appendChild(this.root);
    this.layout();
  }

  get size(): { w: number; h: number } {
    const r = this.root.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return { w: window.innerWidth || 800, h: window.innerHeight || 450 };
    return { w: r.width, h: r.height };
  }

  /** Margin and gutter in px for the current page size. */
  private metrics(): { m: number; g: number } {
    const { w, h } = this.size;
    const s = Math.min(w, h);
    return { m: Math.round(Math.max(10, s * 0.03)), g: Math.round(Math.max(8, s * 0.022)) };
  }

  layout(): void {
    const { w, h } = this.size;
    const { m, g } = this.metrics();
    const portrait = h > w * 1.02;
    const iw = w - m * 2;
    const ih = h - m * 2;
    for (const { def, el: panel } of this.panels.values()) {
      const [fx, fy, fw, fh] = portrait ? def.portrait : def.landscape;
      // Gutters: half a gutter on every inner edge.
      const x0 = m + fx * iw + (fx > 0.001 ? g / 2 : 0);
      const y0 = m + fy * ih + (fy > 0.001 ? g / 2 : 0);
      const x1 = m + (fx + fw) * iw - (fx + fw < 0.999 ? g / 2 : 0);
      const y1 = m + (fy + fh) * ih - (fy + fh < 0.999 ? g / 2 : 0);
      panel.style.left = `${Math.round(x0)}px`;
      panel.style.top = `${Math.round(y0)}px`;
      panel.style.width = `${Math.round(x1 - x0)}px`;
      panel.style.height = `${Math.round(y1 - y0)}px`;
    }
  }

  /** Inner (content) size of a panel in CSS px. */
  panelSize(id: string): { w: number; h: number } {
    const p = this.panels.get(id)!.el;
    return { w: Math.max(1, p.clientWidth), h: Math.max(1, p.clientHeight) };
  }

  panel(id: string): { el: HTMLDivElement; overlay: HTMLDivElement; flash: HTMLDivElement; tails: SVGSVGElement } {
    const p = this.panels.get(id);
    if (!p) throw new Error(`no panel ${id}`);
    return p;
  }

  show(id: string, on = true): void {
    this.panel(id).el.classList.toggle('htc-hidden', !on);
  }

  /** Freeze what the live canvas shows into a 2D canvas kept in that panel. */
  snapshot(id: string, from: HTMLCanvasElement): void {
    const p = this.panel(id).el;
    let still = p.querySelector('canvas.htc-still') as HTMLCanvasElement | null;
    if (!still) {
      still = el('canvas', 'htc-still');
      p.insertBefore(still, p.firstChild);
    }
    still.width = Math.max(1, from.width);
    still.height = Math.max(1, from.height);
    const ctx = still.getContext('2d');
    try {
      ctx?.drawImage(from, 0, 0);
    } catch {
      // A lost context leaves the still blank; the page still reads.
    }
  }

  /** Move the live canvas into a panel (under its overlay). */
  mount(id: string, canvas: HTMLCanvasElement): void {
    const p = this.panel(id).el;
    const still = p.querySelector('canvas.htc-still');
    if (still) still.remove();
    p.insertBefore(canvas, p.firstChild);
  }

  dispose(): void {
    this.root.remove();
    releaseStyle(this.style);
  }
}

/** A narration box that types itself out between t0 and t1 (characters revealed by time). */
export class Caption {
  readonly el: HTMLDivElement;
  private readonly shown: HTMLSpanElement;
  private readonly rest: HTMLSpanElement;
  constructor(parent: HTMLElement, readonly text: string, readonly t0: number, readonly t1: number, cls = '') {
    this.el = el('div', `htc-caption ${cls}`.trim());
    this.shown = el('span');
    this.rest = el('span', 'htc-ghost');
    this.el.append(this.shown, this.rest);
    this.el.style.display = 'none';
    parent.appendChild(this.el);
  }

  update(t: number, until = Infinity): void {
    const on = t >= this.t0 && t < until;
    this.el.style.display = on ? '' : 'none';
    if (!on) return;
    const n = Math.round(Math.min(1, (t - this.t0) / Math.max(0.001, this.t1 - this.t0)) * this.text.length);
    // The whole string is always laid out (ghosted), so the box does not grow while it types.
    if (this.shown.textContent !== this.text.slice(0, n)) {
      this.shown.textContent = this.text.slice(0, n);
      this.rest.textContent = this.text.slice(n);
    }
  }
}

/**
 * An onomatopoeia: pops in oversized, settles, holds, cuts. `x`, `y` in panel CSS px (centre),
 * `size` in px. Colour and tilt are per word.
 */
export class Sfx {
  readonly el: HTMLDivElement;
  private last: [number, number, number] = [0, 0, 0];
  constructor(parent: HTMLElement, text: string, readonly t0: number, readonly hold: number, readonly color = '#ffd166', readonly tilt = -8) {
    this.el = el('div', 'htc-sfx', text);
    this.el.style.color = color;
    this.el.style.display = 'none';
    parent.appendChild(this.el);
  }

  /** Redraw at the last placement (the panel is frozen; the word stays lettered on it). */
  keep(t: number): void {
    const pw = this.el.parentElement?.clientWidth || 1, ph = this.el.parentElement?.clientHeight || 1;
    const [fx, fy, fs] = this.last;
    if (fs <= 0) return this.update(-1, 0, 0, 0);
    this.update(t, fx * pw, fy * ph, fs * Math.min(pw, ph));
  }

  update(t: number, x: number, y: number, size: number): void {
    if (size > 0) {
      // Kept as fractions of the panel, so a frozen word stays put when the window is resized.
      const pw = this.el.parentElement?.clientWidth || 1, ph = this.el.parentElement?.clientHeight || 1;
      this.last = [x / pw, y / ph, size / Math.min(pw, ph)];
    }
    const k = t - this.t0;
    const on = k >= 0 && k < this.hold;
    this.el.style.display = on ? '' : 'none';
    if (!on) return;
    // Held poses: 1.35 on the first frames, 1.0 after, a last shrink before the cut.
    const s = k < 0.07 ? 1.35 : k < 0.14 ? 1.12 : k > this.hold - 0.08 ? 0.82 : 1;
    this.el.style.fontSize = `${Math.round(size)}px`;
    this.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%) rotate(${this.tilt}deg) scale(${s})`;
  }
}

/**
 * A speech bubble: jagged (shout), oval (speech) or cloud-ish (thought), with a tail drawn in the
 * panel's tail layer toward a target point. The text is a single text node.
 */
export class Bubble {
  readonly el: HTMLDivElement;
  readonly text: HTMLSpanElement;
  private readonly tail: SVGPolygonElement;
  private readonly tailInk: SVGPolygonElement;
  constructor(
    parent: HTMLElement,
    tails: SVGSVGElement,
    content: string,
    readonly t0: number,
    readonly kind: 'shout' | 'speech' | 'thought' = 'speech',
    readonly fill = '#f4f1ea',
  ) {
    this.el = el('div', 'htc-bubble');
    const shape = svg('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none' });
    const points = kind === 'shout' ? jaggedPoints(15, 3.1, 0.8) : ovalPoints(kind === 'thought' ? 18 : 30);
    shape.append(
      svg('polygon', { points, fill: '#110e1b', transform: 'translate(2.2 3)' }),
      svg('polygon', { points, fill, stroke: '#110e1b', 'stroke-width': 2.4, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'miter' }),
    );
    this.text = el('span', '', content);
    this.el.append(shape, this.text);
    this.el.style.display = 'none';
    parent.appendChild(this.el);
    this.tailInk = svg('polygon', { fill: '#110e1b' });
    this.tail = svg('polygon', { fill, stroke: '#110e1b', 'stroke-width': 3, 'stroke-linejoin': 'miter' });
    tails.append(this.tailInk, this.tail);
    this.tail.style.display = 'none';
    this.tailInk.style.display = 'none';
  }

  /**
   * Place the bubble: centre (cx, cy) and width in panel px, font size in px, tail toward (tx, ty).
   * `until` hides it again.
   */
  update(t: number, cx: number, cy: number, width: number, fontPx: number, tx: number, ty: number, until = Infinity, color = '#110e1b'): void {
    const k = t - this.t0;
    const on = k >= 0 && t < until;
    this.el.style.display = on ? '' : 'none';
    this.tail.style.display = on ? '' : 'none';
    this.tailInk.style.display = on ? '' : 'none';
    if (!on) return;
    const s = k < 0.06 ? 0.55 : k < 0.12 ? 1.12 : 1;
    // Placed in percentages of the panel (and the tails in a viewBox of its size), so a frozen panel's
    // bubbles stay where they belong when the window is resized.
    const pw = this.el.parentElement?.clientWidth || 1, ph = this.el.parentElement?.clientHeight || 1;
    this.el.style.width = `${(width / pw) * 100}%`;
    this.text.style.fontSize = `${Math.round(fontPx)}px`;
    this.text.style.color = color;
    this.el.style.left = `${((cx - width / 2) / pw) * 100}%`;
    const h = this.el.offsetHeight || fontPx * 2.4;
    this.el.style.top = `${((cy - h / 2) / ph) * 100}%`;
    const tails = this.tail.ownerSVGElement;
    if (tails) {
      tails.setAttribute('viewBox', `0 0 ${pw} ${ph}`);
      tails.setAttribute('preserveAspectRatio', 'none');
    }
    this.el.style.transform = `scale(${s})`;
    this.el.style.padding = `${Math.round(fontPx * 0.55)}px ${Math.round(fontPx * 0.5)}px`;
    // Tail: a wedge from the bubble's lower edge toward the target, stopping short of it.
    const bx = cx + (tx - cx) * 0.18;
    const by = cy + h * 0.32;
    const dx = tx - bx, dy = ty - by;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const half = Math.max(8, fontPx * 0.55) * (this.kind === 'shout' ? 1.2 : 1);
    const tip = { x: bx + dx * 0.86, y: by + dy * 0.86 };
    const pts = (ox: number, oy: number): string =>
      `${bx + nx * half + ox},${by + ny * half + oy} ${bx - nx * half + ox},${by - ny * half + oy} ${tip.x + ox},${tip.y + oy}`;
    this.tailInk.setAttribute('points', pts(3, 4));
    this.tail.setAttribute('points', pts(0, 0));
    if (this.kind === 'thought') this.tail.setAttribute('points', pts(0, 0));
  }
}

/** A meme caption: Impact-like white text with a black outline, at the top or bottom of a panel. */
export class Meme {
  readonly el: HTMLDivElement;
  constructor(parent: HTMLElement, text: string, readonly t0: number, where: 'top' | 'bottom') {
    this.el = el('div', `htc-meme htc-${where}`, text);
    this.el.style.display = 'none';
    parent.appendChild(this.el);
  }

  update(t: number): void {
    const k = t - this.t0;
    this.el.style.display = k >= 0 ? '' : 'none';
    this.el.style.transform = k >= 0 && k < 0.08 ? 'scale(1.15)' : '';
  }
}
