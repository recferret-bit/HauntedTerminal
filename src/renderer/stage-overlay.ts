import * as THREE from 'three';
import { el as overlayNode } from '../contracts/dom.js';
import { isReducedMotionPreferred, mountWordReveal, planWordReveal } from '../contracts/word-reveal.js';
import { TextureCatalog, ZONES, type FxPreset, type ZoneId } from '../procgen/index.js';
import { fitBalloonText, fitWordWidth, imgNode, stepped, type Item, type PxRect } from './stage-fit.js';
import { buildCaptionBox, buildStageCard, buildStageTearText, type CardHost } from './stage-overlay-cards.js';
import { avoidOffset, CHROME_IDS, hudBottom, tailOffset, type Box } from './stage-avoid.js';
import './stage-overlay.css';

/**
 * The stage's DOM overlay: dialogue, lettering, cards, plates, pips, padlocks and PS_XRAY links,
 * drawn crisp over the canvas instead of inside the WebGL scene (so the pixel-art and
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

export type { PxRect };

export interface BadgeState {
  /** World point over the actor's head. */
  top: THREE.Vector3;
  visible: boolean;
  pips: { lit: number; cells: number } | null;
  plate: { pid: number; name?: string } | null;
  /** Attack countdown skull: actions until the hit (0 = told, `!`), or null. */
  strike: number | null;
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
  skull: HTMLDivElement | null;
  skullKey: string;
  lock: HTMLDivElement | null;
}

const imgCache = new Map<string, string>();

/** A procgen texture as a data URL (cached), for crisp DOM images (image-rendering: pixelated). */
function textureUrl(id: string): string {
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

function zoneCss(zone: ZoneId | string): string {
  const z = (ZONES as Record<string, { color: number }>)[zone];
  return `#${(z?.color ?? 0xffd166).toString(16).padStart(6, '0')}`;
}

export class StageOverlay {
  readonly root: HTMLDivElement;
  private readonly badgeLayer: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly transient: HTMLDivElement;
  private readonly cardLayer: HTMLDivElement;
  private readonly items: Item[] = [];
  private readonly badges = new Map<string, BadgeDom>();
  private readonly linkEls: SVGLineElement[] = [];
  private camera: THREE.Camera | null = null;
  private w = 1;
  private h = 1;
  private u = 58;
  private panelRect: PxRect = { x: 0, y: 0, w: 1, h: 1 };
  /** The socket dialogue balloon on screen, if any. */
  private dialogue: Item | null = null;

  get dialogueOpen(): boolean {
    const d = this.dialogue;
    return !!d && !d.done && d.t < d.life && this.items.includes(d);
  }
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
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'st-links');
    this.root.appendChild(this.svg);
    this.badgeLayer = layer('badges');
    this.transient = layer('transient');
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
  }

  project(p: THREE.Vector3): { x: number; y: number } {
    if (!this.camera) return { x: 0, y: 0 };
    this.v.copy(p).project(this.camera);
    return { x: (this.v.x + 1) * 0.5 * this.w, y: (1 - this.v.y) * 0.5 * this.h };
  }

  /** Advance transient items by `dtMs` of stage time and re-place everything anchored. */
  update(dtMs: number): void {
    this.clock += dtMs;
    this.obstacles = null;
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
      const rawX = x;
      if (it.fit) y = this.fitBalloon(it, y);
      else if (it.center && !it.sized) this.fitWord(it);
      if (!it.halfW) it.halfW = (it.el.offsetWidth || 0) / 2;
      const r = this.panelRect;
      const m = 6;
      x = Math.min(r.x + r.w - it.halfW - m, Math.max(r.x + it.halfW + m, x));
      const h = it.el.offsetHeight || 0;
      if (it.center) y = Math.min(r.y + r.h - m - h * 0.55, Math.max(r.y + m + h * 0.55, y));
      else y = Math.max(r.y + m + h * 0.5, Math.min(r.y + r.h - m, y));
      if (it.fit) it.el.style.setProperty('--tail', `${tailOffset(rawX, x - it.halfW, it.halfW * 2).toFixed(1)}px`);
    }
    if (it.avoid) {
      const o = this.avoidLetter(it, x, y);
      x += o.dx;
      y += o.dy;
    }
    it.wrap.style.display = '';
    it.wrap.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  /** Top of the stage that is free of the HUD strip (px, overlay space). */
  private safeTop(): number {
    return Math.max(this.panelRect.y + 6, hudBottom(this.root.getBoundingClientRect()) + 6);
  }

  /**
   * Fit a balloon between the HUD strip and the speaker: shrink the font (down to 10 px), then cap the
   * height at whole lines. Returns the (possibly pushed-down) bottom anchor y; the tail stays on the speaker.
   */
  private fitBalloon(it: Item, y: number): number {
    const tail = 14;
    const top = this.safeTop();
    const room = Math.floor(y - tail - top);
    if (it.fitKey !== room) {
      it.fitKey = room;
      fitBalloonText(it.el, room);
      it.halfW = (it.el.offsetWidth || 0) / 2;
    }
    return Math.max(y, top + tail + (it.el.offsetHeight || 0));
  }

  /** Shrink FX lettering that is wider than the panel so the whole word reads. */
  private fitWord(it: Item): void {
    if (this.panelRect.w <= 1) return;
    it.sized = true;
    fitWordWidth(it.el, this.panelRect.w - 24);
    it.halfW = (it.el.offsetWidth || 0) / 2;
  }

  /** Pixel boxes (overlay space) the lettering must not cover; captions placed this frame are appended. */
  private obstacles: Box[] | null = null;

  private collectObstacles(): Box[] {
    const base = this.root.getBoundingClientRect();
    const m = 4;
    const boxes: Box[] = [];
    const push = (e: Element | null, blinks = false): void => {
      if (!e || (!blinks && (e as HTMLElement).style?.visibility === 'hidden')) return;
      const b = e.getBoundingClientRect();
      if (b.width <= 0 || b.height <= 0) return;
      boxes.push({ l: b.left - base.left - m, t: b.top - base.top - m, r: b.right - base.left + m, b: b.bottom - base.top + m });
    };
    for (const id of CHROME_IDS) push(document.getElementById(id));
    push(document.querySelector('#hero-hud.open .hero-dialog-drawer'));
    push(document.querySelector('.dialog-box.open'));
    this.badgeLayer.querySelectorAll('.st-lock').forEach((e) => push(e)); // padlock badges: lettering stays off them
    // The death card flickers (visibility toggles) but its box stays: keep words off it the whole time.
    this.cardLayer.querySelectorAll('.st-tear').forEach((e) => push(e, true));
    return boxes;
  }

  /** Offset that keeps a caption (with its rise) off the chrome, the cameo and earlier captions. */
  private avoidLetter(it: Item, x: number, y: number): { dx: number; dy: number } {
    this.obstacles ??= this.collectObstacles();
    const hw = it.halfW || (it.el.offsetWidth || 0) / 2;
    const h = it.el.offsetHeight || 0;
    const box: Box = it.center ? { l: x - hw, r: x + hw, t: y - h * 0.55, b: y + h * 0.55 } : { l: x - hw, r: x + hw, t: y - h - 0.3 * this.u, b: y };
    const r = this.panelRect;
    const bounds: Box = { l: r.x + 4, t: r.y + 4, r: r.x + r.w - 4, b: r.y + r.h - 4 };
    const o = avoidOffset(box, this.obstacles, bounds);
    this.obstacles.push({ l: box.l + o.dx - 3, r: box.r + o.dx + 3, t: box.t + o.dy - 3, b: box.b + o.dy + 3 });
    return o;
  }

  private pinCard(el: HTMLElement, life: number, render: (t01: number, ms: number) => void): Item {
    return this.add(el, life, { px: { x: 0, y: 0 }, layer: this.cardLayer, render });
  }

  private add(el: HTMLElement, life: number, opts: { world?: (() => THREE.Vector3 | null) | null; px?: { x: number; y: number }; dy?: number; clamp?: boolean; avoid?: boolean; fit?: boolean; center?: boolean; render?: (t01: number, ms: number) => void; layer?: HTMLElement }): Item {
    const wrap = document.createElement('div');
    wrap.className = 'st-anchor';
    wrap.appendChild(el);
    (opts.layer ?? this.transient).appendChild(wrap);
    const it: Item = { wrap, el, t: 0, life, world: opts.world ?? null, px: opts.px ?? null, dy: opts.dy ?? 0, clamp: !!opts.clamp, halfW: 0, avoid: !!opts.avoid, fit: !!opts.fit, center: !!opts.center, fitKey: NaN, sized: false, render: opts.render ?? null, done: false };
    this.items.push(it);
    this.obstacles = null;
    this.place(it);
    this.obstacles = null;
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
      center: true,
      avoid: true,
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
      avoid: true,
      render: (t) => {
        const k = stepped(t, 6);
        el.style.transform = `translate(-50%, calc(-100% - ${(k * 0.28 * this.u).toFixed(1)}px)) scale(${t < 0.08 ? 1.18 : 1})`;
        el.style.opacity = String(t > 0.7 ? 1 - stepped((t - 0.7) / 0.3, 3) : 1);
      },
    });
  }

  /** A speech balloon (BubbleStyle) anchored over a world point; stays until `drop()` or `life`. */
  balloon(
    speaker: string,
    text: string,
    style: string,
    at: () => THREE.Vector3 | null,
    life = 60000,
    opts: { instant?: boolean } = {},
  ): { drop(): void } {
    const cls = ['COMIX_CLASSIC', 'JAGGED_SCREAM', 'GHOST_WHISPER', 'KERNEL_GLITCH'].includes(style) ? style : 'COMIX_CLASSIC';
    const body = overlayNode('span', 'st-balloon-text');
    const reveal = mountWordReveal(body, text);
    const instant = opts.instant ?? isReducedMotionPreferred();
    const plan = planWordReveal(reveal.wordCount, life, { instant });
    if (plan.stepMs <= 0) reveal.showAll();
    else reveal.showWords(1);
    const el = overlayNode('div', `st-balloon ${cls}`, speaker ? [overlayNode('b', '', [speaker]), body] : [body]);
    const it = this.add(el, plan.holdMs, {
      world: at,
      clamp: true,
      fit: true,
      render: (_t, ms) => {
        if (plan.stepMs > 0) reveal.atMs(ms, plan.stepMs);
        const n = Math.floor(ms / 83);
        const pop = n === 0 ? 0.6 : n === 1 ? 1.08 : 1;
        const shake = cls === 'JAGGED_SCREAM' ? (n % 2 ? 1.5 : -1.5) : cls === 'KERNEL_GLITCH' && n % 9 === 0 ? 4 : 0;
        el.style.transform = `translate(calc(-50% + ${shake}px), -100%) scale(${pop})`;
      },
    });
    this.dialogue = it;
    return {
      drop: () => {
        it.done = true;
        it.wrap.remove();
        if (this.dialogue === it) this.dialogue = null;
      },
    };
  }

  private cardHost(): CardHost {
    return {
      panelRect: () => this.panelRect,
      pin: (el, life, render) => this.pinCard(el, life, render),
      textureUrl,
    };
  }

  /** The page-turn card: swings in around the spine (screen-left edge) in 6 poses, holds, turns away in 5. */
  card(kicker: string, title: string, path: string, accent: string, inMs: number, holdMs: number, outMs: number): { drop(): void } {
    return buildStageCard(this.cardHost(), kicker, title, path, accent, inMs, holdMs, outMs);
  }

  /** Lettering over the coredump tear (the torn-page art stays in the canvas). */
  tearText(title: string, sub: string, delayMs: number, showMs: number): void {
    buildStageTearText(this.cardHost(), title, sub, delayMs, showMs);
  }

  /** Non-blocking Comix Zone yellow caption box docked bottom-left of the panel. */
  captionBox(kicker: string, title: string, path: string, accent: string, lifeMs = 1180): { drop(): void } {
    return buildCaptionBox(this.cardHost(), kicker, title, path, accent, lifeMs);
  }

  /** HP pips, PID plate and padlock for one actor; diffed by key, re-placed every step. */
  badge(id: string, s: BadgeState): void {
    let d = this.badges.get(id);
    const any = s.visible && (s.pips || s.plate || s.lock || s.strike !== null);
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
      d = { wrap, stack, pips: null, pipKey: '', plate: null, plateKey: '', skull: null, skullKey: '', lock: null };
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
        const src = textureUrl('tex.decal.pid-tag');
        const parts: Node[] = [];
        if (src) parts.push(imgNode(src));
        parts.push(overlayNode('span', 'pid', [String(s.plate.pid)]));
        if (s.plate.name) parts.push(overlayNode('span', 'nm', [s.plate.name.slice(0, 16)]));
        const p = overlayNode('div', 'st-plate', parts);
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
        const p = overlayNode(
          'div',
          'st-pips',
          Array.from({ length: s.pips.cells }, (_, i) => overlayNode('i', i < s.pips!.lit ? 'on' : '')),
        );
        d.stack.appendChild(p);
        d.pips = p;
      }
    }
    const skullKey = s.strike === null ? '' : String(s.strike);
    if (skullKey !== d.skullKey) {
      d.skullKey = skullKey;
      d.skull?.remove();
      d.skull = null;
      if (s.strike !== null) {
        // Solid red when the hit lands after the next action (told, or 1 left); a stepped pulse above that.
        d.skull = overlayNode('div', `st-skull${s.strike <= 1 ? ' hot' : ''}`, [overlayNode('i', '', ['\u2620']), overlayNode('b', '', [s.strike <= 0 ? '!' : String(s.strike)])]);
        d.stack.appendChild(d.skull);
      }
    }
    if (s.lock) {
      if (!d.lock) {
        const src = textureUrl('tex.decal.rwx-lock');
        const l = overlayNode('div', 'st-lock', [
          src ? imgNode(src) : overlayNode('i', '', ['\uD83D\uDD12']),
        ]);
        this.badgeLayer.appendChild(l);
        d.lock = l;
      }
      const lp = this.project(s.lock);
      d.lock.style.display = '';
      // Keep the badge inside the stage panel: a door at the panel edge must not push the padlock out of the stage.
      const r = this.panelRect;
      const half = (d.lock.offsetWidth || 0) / 2 + 4;
      const lx = r.w > half * 2 ? Math.min(r.x + r.w - half, Math.max(r.x + half, lp.x)) : lp.x;
      d.lock.style.left = `${lx.toFixed(1)}px`;
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

  clearTransient(): void {
    for (const it of this.items) this.kill(it);
    this.items.length = 0;
  }

  /** Live DOM counts (the self-check asserts transient nodes drain back to zero). */
  counts(): { transient: number; cards: number; badges: number; links: number } {
    return {
      transient: this.transient.childElementCount,
      cards: this.cardLayer.childElementCount,
      badges: this.badges.size,
      links: this.linkEls.length,
    };
  }
}
