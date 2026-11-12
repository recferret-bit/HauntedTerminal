import * as THREE from 'three';
import { TextureCatalog, ZONES, type FxPreset, type ZoneId } from '../procgen/index.js';
import { escHtml as esc } from './html-escape.js';
import './stage-overlay.css';

/**
 * The stage's DOM overlay: dialogue, lettering, cards, plates, pips, padlocks, PS_XRAY links and the
 * neighbour column, drawn crisp over the canvas instead of inside the WebGL scene (so the pixel-art and
 * CRT passes never touch interface text). Everything is placed at the projected screen position of a
 * world point, re-projected every stage step, so it follows camera shake, zoom and resize.
 * Transient items are driven by the stage clock (not CSS timers), so `__stage.advance()` and the
 * frozen-clock screenshots see exactly the pose the canvas shows.
 */

export interface OverlayPanel {
  /** Main panel in world units: left > right (world +x is screen-left). */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Item {
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
  render: ((t01: number, ms: number) => void) | null;
  done: boolean;
}

export interface BadgeState {
  /** World point over the actor's head. */
  top: THREE.Vector3;
  visible: boolean;
  pips: { lit: number; cells: number } | null;
  plate: { pid: number; name?: string } | null;
  /** World point of the door's lock socket when it is locked. */
  lock: THREE.Vector3 | null;
}

interface BadgeDom {
  wrap: HTMLDivElement;
  stack: HTMLDivElement;
  pips: HTMLDivElement | null;
  pipKey: string;
  plate: HTMLDivElement | null;
  plateKey: string;
  lock: HTMLDivElement | null;
}

const imgCache = new Map<string, string>();

/** A procgen texture as a data URL (cached), for crisp DOM images (image-rendering: pixelated). */
export function textureUrl(id: string): string {
  const hit = imgCache.get(id);
  if (hit !== undefined) return hit;
  let url = '';
  if (TextureCatalog.has(id)) {
    const buf = TextureCatalog.build(id, 1);
    const c = document.createElement('canvas');
    c.width = buf.width;
    c.height = buf.height;
    c.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(buf.data), buf.width, buf.height), 0, 0);
    url = c.toDataURL();
  }
  imgCache.set(id, url);
  return url;
}

export function zoneCss(zone: ZoneId | string): string {
  const z = (ZONES as Record<string, { color: number }>)[zone];
  return `#${(z?.color ?? 0xffd166).toString(16).padStart(6, '0')}`;
}

const stepped = (t: number, n: number) => (t >= 1 ? 1 : Math.floor(Math.max(0, t) * n) / n);

export class StageOverlay {
  readonly root: HTMLDivElement;
  private readonly column: HTMLDivElement;
  private readonly badgeLayer: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly transient: HTMLDivElement;
  /** Cameos live here (managed by CameoDirector). */
  readonly cameoLayer: HTMLDivElement;
  private readonly cardLayer: HTMLDivElement;
  private readonly items: Item[] = [];
  private readonly badges = new Map<string, BadgeDom>();
  private readonly linkEls: SVGLineElement[] = [];
  private camera: THREE.Camera | null = null;
  private w = 1;
  private h = 1;
  private u = 58;
  private panelRect: PxRect = { x: 0, y: 0, w: 1, h: 1 };
  /** The socket dialogue balloon on screen, if any. Cameos yield to it (see stage-cameos.ts). */
  private dialogue: Item | null = null;

  get dialogueOpen(): boolean {
    const d = this.dialogue;
    return !!d && !d.done && d.t < d.life && this.items.includes(d);
  }
  private colKey = '';
  private colRectKey = '';
  private colWorld: OverlayPanel | null = null;
  private readonly v = new THREE.Vector3();
  private clock = 0;

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'st-overlay';
    const layer = (name: string) => {
      const d = document.createElement('div');
      d.className = `st-layer st-l-${name}`;
      this.root.appendChild(d);
      return d;
    };
    this.column = layer('column');
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'st-links');
    this.root.appendChild(this.svg);
    this.badgeLayer = layer('badges');
    this.transient = layer('transient');
    this.cameoLayer = layer('cameos');
    this.cardLayer = layer('cards');
    host.appendChild(this.root);
  }

  /** Pixels per world unit. */
  get unit(): number {
    return this.u;
  }

  get rect(): PxRect {
    return this.panelRect;
  }

  /** Called every stage step after the camera moved (shake) and on resize. */
  sync(camera: THREE.Camera, panel: OverlayPanel, unitPx: number): void {
    this.camera = camera;
    this.w = Math.max(1, this.root.clientWidth);
    this.h = Math.max(1, this.root.clientHeight);
    if (Math.abs(unitPx - this.u) > 0.01) {
      this.u = unitPx;
      this.root.style.setProperty('--u', `${unitPx.toFixed(2)}px`);
    }
    camera.updateMatrixWorld();
    const a = this.project(new THREE.Vector3(panel.left, panel.top, 0));
    const b = this.project(new THREE.Vector3(panel.right, panel.bottom, 0));
    this.panelRect = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    this.svg.setAttribute('viewBox', `0 0 ${this.w} ${this.h}`);
    if (this.colWorld) this.layoutColumn();
  }

  project(p: THREE.Vector3): { x: number; y: number } {
    if (!this.camera) return { x: 0, y: 0 };
    this.v.copy(p).project(this.camera);
    return { x: (this.v.x + 1) * 0.5 * this.w, y: (1 - this.v.y) * 0.5 * this.h };
  }

  /** Advance transient items by `dtMs` of stage time and re-place everything anchored. */
  update(dtMs: number): void {
    this.clock += dtMs;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      it.t += dtMs;
      if (it.done || it.t >= it.life) {
        this.kill(it);
        this.items.splice(i, 1);
        continue;
      }
      this.place(it);
      it.render?.(it.t / it.life, it.t);
    }
  }

  private place(it: Item): void {
    let x: number;
    let y: number;
    if (it.world) {
      const p = it.world();
      if (!p) {
        it.wrap.style.display = 'none';
        return;
      }
      const s = this.project(p);
      x = s.x;
      y = s.y;
    } else if (it.px) {
      x = it.px.x;
      y = it.px.y;
    } else return;
    y += it.dy;
    if (it.clamp) {
      if (!it.halfW) it.halfW = (it.el.offsetWidth || 0) / 2;
      const r = this.panelRect;
      const m = 6;
      x = Math.min(r.x + r.w - it.halfW - m, Math.max(r.x + it.halfW + m, x));
      y = Math.max(r.y + m + (it.el.offsetHeight || 0) * 0.5, Math.min(r.y + r.h - m, y));
    }
    it.wrap.style.display = '';
    it.wrap.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  private pinCard(el: HTMLElement, life: number, render: (t01: number, ms: number) => void): Item {
    return this.add(el, life, { px: { x: 0, y: 0 }, layer: this.cardLayer, render });
  }

  private add(el: HTMLElement, life: number, opts: { world?: (() => THREE.Vector3 | null) | null; px?: { x: number; y: number }; dy?: number; clamp?: boolean; render?: (t01: number, ms: number) => void; layer?: HTMLElement }): Item {
    const wrap = document.createElement('div');
    wrap.className = 'st-anchor';
    wrap.appendChild(el);
    (opts.layer ?? this.transient).appendChild(wrap);
    const it: Item = { wrap, el, t: 0, life, world: opts.world ?? null, px: opts.px ?? null, dy: opts.dy ?? 0, clamp: !!opts.clamp, halfW: 0, render: opts.render ?? null, done: false };
    this.items.push(it);
    this.place(it);
    it.render?.(0, 0);
    return it;
  }

  private kill(it: Item): void {
    it.wrap.remove();
  }

  /**
   * FX lettering: the preset's onomatopoeia, popped in DOM at the effect origin plus the word's
   * page-space offset (+x screen-right). Burst pops oversized and settles, jagged rattles,
   * whisper drifts up half-opaque, glitch slips sideways and drops frames.
   */
  word(preset: FxPreset, at: THREE.Vector3, text: string | undefined, opts: { mirror?: boolean; scale?: number } = {}): void {
    const w = preset.onomatopoeia;
    if (!w) return;
    const s = opts.scale ?? 1;
    const [ox, oy] = w.offset ?? [0, 0.7];
    const pos = new THREE.Vector3(at.x - ox * s * (opts.mirror ? -1 : 1), at.y + oy * s, at.z);
    const el = document.createElement('div');
    el.className = `st-word ${w.style}`;
    el.textContent = text ?? w.text;
    el.style.setProperty('--c', zoneCss(w.zone));
    const fs = Math.max(14, (w.size ?? 0.3) * s * this.u * 1.45);
    el.style.setProperty('--fs', `${fs.toFixed(1)}px`);
    const fps = preset.stepFps ?? 12;
    const tilt = w.style === 'burst' ? -6 : w.style === 'jagged' ? -3 : 0;
    this.add(el, w.holdMs, {
      world: () => pos,
      clamp: true,
      render: (_t, ms) => {
        const n = Math.floor((ms / 1000) * fps);
        let sc = 1;
        let rot = tilt;
        let dx = 0;
        let dy = 0;
        let op = 1;
        if (w.style === 'burst') sc = n === 0 ? 1.3 : n === 1 ? 0.92 : 1;
        else if (w.style === 'jagged') {
          rot = tilt + (n % 2 ? 3 : -3);
          dx = n % 2 ? 2 : -2;
        } else if (w.style === 'whisper') {
          dy = -n * 1.5;
          op = 0.75;
        } else {
          dx = n % 3 === 1 ? 6 : n % 3 === 2 ? -4 : 0;
          op = n % 5 === 4 ? 0 : 1;
        }
        if (ms > w.holdMs - 120) op *= 0.5;
        el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rot}deg) scale(${sc})`;
        el.style.opacity = String(op);
      },
    });
  }

  /** Dynamic lettering: rises 0.28 units and fades over 980 ms, stepped. */
  say(text: string, at: THREE.Vector3, color: string, dyWorld: number, size = 1): void {
    const el = document.createElement('div');
    el.className = 'st-say';
    el.textContent = text;
    el.style.setProperty('--c', color);
    el.style.setProperty('--fs', `${Math.max(13, this.u * 0.3 * size).toFixed(1)}px`);
    const base = at.clone();
    this.add(el, 980, {
      world: () => new THREE.Vector3(base.x, base.y + dyWorld, base.z),
      clamp: true,
      render: (t) => {
        const k = stepped(t, 6);
        el.style.transform = `translate(-50%, calc(-100% - ${(k * 0.28 * this.u).toFixed(1)}px)) scale(${t < 0.08 ? 1.18 : 1})`;
        el.style.opacity = String(t > 0.7 ? 1 - stepped((t - 0.7) / 0.3, 3) : 1);
      },
    });
  }

  /** A speech balloon (BubbleStyle) anchored over a world point; stays until `drop()` or `life`. */
  balloon(speaker: string, text: string, style: string, at: () => THREE.Vector3 | null, life = 60000): { drop(): void } {
    const el = document.createElement('div');
    const cls = ['COMIX_CLASSIC', 'JAGGED_SCREAM', 'GHOST_WHISPER', 'KERNEL_GLITCH'].includes(style) ? style : 'COMIX_CLASSIC';
    el.className = `st-balloon ${cls}`;
    el.innerHTML = `${speaker ? `<b>${esc(speaker)}</b>` : ''}${esc(text)}`;
    const it = this.add(el, life, {
      world: at,
      clamp: true,
      render: (_t, ms) => {
        const n = Math.floor(ms / 83);
        const pop = n === 0 ? 0.6 : n === 1 ? 1.08 : 1;
        const shake = cls === 'JAGGED_SCREAM' ? (n % 2 ? 1.5 : -1.5) : cls === 'KERNEL_GLITCH' && n % 9 === 0 ? 4 : 0;
        el.style.transform = `translate(calc(-50% + ${shake}px), -100%) scale(${pop})`;
      },
    });
    this.dialogue = it;
    return { drop: () => { it.done = true; } };
  }

  /** The page-turn card: swings in around the spine (screen-left edge) in 6 poses, holds, turns away in 5. */
  card(kicker: string, title: string, path: string, accent: string, inMs: number, holdMs: number, outMs: number): { drop(): void } {
    const el = document.createElement('div');
    el.className = 'st-card';
    el.style.setProperty('--accent', accent);
    el.style.setProperty('--accent-a', `${accent}33`);
    const bolt = textureUrl('tex.decal.bolt');
    const halftone = textureUrl('tex.halftone');
    if (halftone) {
      el.style.backgroundImage = `url(${halftone})`;
      el.style.backgroundSize = '48px 48px';
      el.style.imageRendering = 'pixelated';
    }
    el.innerHTML = `<div class="inner"><div class="kick">${bolt ? `<img src="${bolt}" alt="">` : ''}<span>${esc(kicker)}</span>${bolt ? `<img src="${bolt}" alt="">` : ''}</div><h2>${esc(title)}</h2><div class="path">${esc(path)}</div></div>`;
    const total = inMs + holdMs + outMs;
    const it = this.pinCard(el, total, (_t, ms) => {
        const r = this.panelRect;
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
    return { drop: () => { it.done = true; } };
  }

  /** Lettering over the coredump tear (the torn-page art stays in the canvas). */
  tearText(title: string, sub: string, delayMs: number, showMs: number): void {
    const el = document.createElement('div');
    el.className = 'st-tear';
    el.innerHTML = `${esc(title)}<small>${esc(sub)}</small>`;
    this.pinCard(el, delayMs + showMs, (_t, ms) => {
        const r = this.panelRect;
        const n = Math.floor(ms / 83);
        const on = ms >= delayMs;
        el.style.left = `${r.x + r.w / 2 + (n % 4 === 1 ? 6 : n % 4 === 3 ? -5 : 0)}px`;
        el.style.top = `${r.y + r.h * 0.42}px`;
        el.style.visibility = on && n % 7 !== 6 ? '' : 'hidden';
    });
  }

  /** HP pips, PID plate and padlock for one actor; diffed by key, re-placed every step. */
  badge(id: string, s: BadgeState): void {
    let d = this.badges.get(id);
    const any = s.visible && (s.pips || s.plate || s.lock);
    if (!any) {
      if (d) {
        d.wrap.style.display = 'none';
        if (d.lock) {
          d.lock.remove();
          d.lock = null;
        }
      }
      return;
    }
    if (!d) {
      const wrap = document.createElement('div');
      wrap.className = 'st-anchor';
      const stack = document.createElement('div');
      stack.className = 'st-badges';
      wrap.appendChild(stack);
      this.badgeLayer.appendChild(wrap);
      d = { wrap, stack, pips: null, pipKey: '', plate: null, plateKey: '', lock: null };
      this.badges.set(id, d);
    }
    d.wrap.style.display = '';
    const top = this.project(s.top);
    d.wrap.style.transform = `translate(${top.x.toFixed(1)}px, ${(top.y - 4).toFixed(1)}px)`;
    // Plate above pips.
    const plateKey = s.plate ? `${s.plate.pid}|${s.plate.name ?? ''}` : '';
    if (plateKey !== d.plateKey) {
      d.plateKey = plateKey;
      d.plate?.remove();
      d.plate = null;
      if (s.plate) {
        const p = document.createElement('div');
        p.className = 'st-plate';
        const src = textureUrl('tex.decal.pid-tag');
        p.innerHTML = `${src ? `<img src="${src}" alt="">` : ''}<span class="pid">${esc(String(s.plate.pid))}</span>${s.plate.name ? `<span class="nm">${esc(s.plate.name.slice(0, 16))}</span>` : ''}`;
        d.stack.prepend(p);
        d.plate = p;
      }
    }
    const pipKey = s.pips ? `${s.pips.lit}/${s.pips.cells}` : '';
    if (pipKey !== d.pipKey) {
      d.pipKey = pipKey;
      d.pips?.remove();
      d.pips = null;
      if (s.pips) {
        const p = document.createElement('div');
        p.className = 'st-pips';
        p.innerHTML = Array.from({ length: s.pips.cells }, (_, i) => `<i class="${i < s.pips!.lit ? 'on' : ''}"></i>`).join('');
        d.stack.appendChild(p);
        d.pips = p;
      }
    }
    if (s.lock) {
      if (!d.lock) {
        const l = document.createElement('div');
        l.className = 'st-lock';
        const src = textureUrl('tex.decal.rwx-lock');
        l.innerHTML = `${src ? `<img src="${src}" alt="">` : ''}<span>LOCKED</span>`;
        this.badgeLayer.appendChild(l);
        d.lock = l;
      }
      const lp = this.project(s.lock);
      d.lock.style.display = '';
      d.lock.style.left = `${lp.x.toFixed(1)}px`;
      d.lock.style.top = `${lp.y.toFixed(1)}px`;
    } else if (d.lock) {
      d.lock.remove();
      d.lock = null;
    }
  }

  /** Drop badges of actors that are gone. */
  pruneBadges(live: Set<string>): void {
    for (const [id, d] of this.badges) {
      if (live.has(id)) continue;
      d.wrap.remove();
      d.lock?.remove();
      this.badges.delete(id);
    }
  }

  /** PS_XRAY parent -> child links as SVG: an ink line under a dashed green one, pulsing in two held widths. */
  links(pairs: [THREE.Vector3, THREE.Vector3][]): void {
    const need = pairs.length * 2;
    while (this.linkEls.length < need) {
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.setAttribute('class', this.linkEls.length % 2 === 0 ? 'ink' : 'glow');
      this.svg.appendChild(l);
      this.linkEls.push(l);
    }
    while (this.linkEls.length > need) this.linkEls.pop()!.remove();
    const pulse = Math.floor(this.clock / 250) % 2 === 0 ? 1 : 0.7;
    pairs.forEach(([a, b], i) => {
      const pa = this.project(a);
      const pb = this.project(b);
      for (let k = 0; k < 2; k++) {
        const l = this.linkEls[i * 2 + k]!;
        l.setAttribute('x1', pa.x.toFixed(1));
        l.setAttribute('y1', pa.y.toFixed(1));
        l.setAttribute('x2', pb.x.toFixed(1));
        l.setAttribute('y2', pb.y.toFixed(1));
        l.setAttribute('stroke-width', ((k === 0 ? 7 : 3.5) * pulse).toFixed(1));
      }
    });
  }

  /** The neighbour column: crisp comic panels (.. / NEXT / DOWN / LOCKED + directory name). */
  neighbors(cards: { mark: string; label: string; kind: string }[], column: OverlayPanel): void {
    const key = JSON.stringify(cards);
    this.colWorld = column;
    if (key !== this.colKey) {
      this.colKey = key;
      this.colRectKey = '';
      this.column.replaceChildren(...cards.map((c) => {
        const d = document.createElement('div');
        d.className = `st-ncard ${c.kind}`;
        d.innerHTML = `<span class="mk">${esc(c.mark)}</span><span class="lb">${esc(c.label)}</span>`;
        return d;
      }));
    }
    this.layoutColumn();
  }

  private layoutColumn(): void {
    const c = this.colWorld;
    if (!c) return;
    const a = this.project(new THREE.Vector3(c.left, c.top, 0));
    const b = this.project(new THREE.Vector3(c.right, c.bottom, 0));
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    const key = `${x.toFixed(0)},${y.toFixed(0)},${w.toFixed(0)},${h.toFixed(0)}`;
    if (key === this.colRectKey) return;
    this.colRectKey = key;
    const kids = [...this.column.children] as HTMLElement[];
    const gap = 8;
    const ch = (h - gap * Math.max(0, kids.length - 1)) / Math.max(1, kids.length);
    kids.forEach((k, i) => {
      k.style.left = `${x}px`;
      k.style.top = `${y + i * (ch + gap)}px`;
      k.style.width = `${w}px`;
      k.style.height = `${ch}px`;
    });
  }

  clearTransient(): void {
    for (const it of this.items) this.kill(it);
    this.items.length = 0;
  }

  /** Live DOM counts (the self-check asserts transient nodes drain back to zero). */
  counts(): { transient: number; cards: number; badges: number; links: number; column: number } {
    return {
      transient: this.transient.childElementCount,
      cards: this.cardLayer.childElementCount,
      badges: this.badges.size,
      links: this.linkEls.length,
      column: this.column.childElementCount,
    };
  }
}
