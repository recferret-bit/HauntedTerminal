import type { BubbleLetter, PanelFlashLetter } from './spec-types.js';
import type { Bubble } from './page.js';
import { v3 } from './set.js';
import { span, stepped, easeIn } from './stage.js';
import { markAt, panelAt, type ComixWorld } from './reel.js';
import type { BubbleNode, BurstNode, LetterNodes, SfxNode, SplashNode } from './letters-build.js';

function fontPx(minFont: number, h: number, w: number, fontH: number, fontW: number, fontOfMin?: number): number {
  if (fontOfMin !== undefined) return Math.max(minFont, Math.min(w, h) * fontOfMin);
  return Math.max(minFont, Math.min(h * fontH, w * fontW));
}

function drawSfx(world: ComixWorld, item: SfxNode, t: number, cur: string, w: number, h: number): void {
  const { node, spec } = item;
  if (spec.only && spec.only !== cur) {
    if (spec.keep) node.keep(t);
    else node.update(-1, 0, 0, 0);
    return;
  }
  const place = spec.place;
  const size = Math.min(w, h) * place.size;
  if (place.mode === 'frac') {
    node.update(t, w * place.x, h * place.y, size);
    return;
  }
  const point = world.points[place.point];
  if (!world.stage || !point) {
    node.update(-1, 0, 0, 0);
    return;
  }
  const projected = world.stage.project(point);
  node.update(t, projected.x + place.dx * w, projected.y + place.dy * h, size);
}

function drawBurst(world: ComixWorld, item: BurstNode, t: number, cur: string, w: number, h: number): void {
  const { nodes, spec } = item;
  if (spec.only && spec.only !== cur) {
    for (const node of nodes) (spec.keep ? node.keep(t) : node.update(-1, 0, 0, 0));
    return;
  }
  const point = world.points[spec.point];
  if (!world.stage || !point) {
    for (const node of nodes) node.update(-1, 0, 0, 0);
    return;
  }
  const projected = world.stage.project(point);
  const size = Math.min(w, h) * spec.size;
  nodes.forEach((node, i) => {
    const ox = spec.dx + (i % spec.dxMod) * spec.dxStep;
    const oy = spec.dy + (i % spec.dyMod) * spec.dyStep;
    node.update(t, projected.x + ox * w, projected.y + oy * h, size);
  });
}

/** `live` uses the actor group. `point` uses tailPoint or the actor home. Y is `tailLift`, not the point's y. */
function bubbleTail(world: ComixWorld, place: Extract<BubbleLetter['place'], { mode: 'frac' }>): { x: number; y: number } | null {
  const stage = world.stage;
  if (!stage) return null;
  if (place.tailFrom === 'live') {
    const member = world.actors.get(place.tail);
    if (!member) return null;
    const grp = member.actor.model.group;
    return stage.project(v3(grp.position.x, grp.position.y + place.tailLift * grp.scale.y, place.tailZ));
  }
  const id = place.tailPoint ?? world.actors.get(place.tail)?.spec.home;
  const point = id ? world.points[id] : undefined;
  if (!point) return null;
  return stage.project(v3(point.x, place.tailLift, place.tailZ));
}

function drawFrac(world: ComixWorld, item: BubbleNode, t: number, w: number, h: number): void {
  const place = item.spec.place;
  if (place.mode !== 'frac') return;
  const tail = bubbleTail(world, place);
  if (!tail) return;
  const px = fontPx(place.minFont, h, w, place.fontH, place.fontW, place.fontOfMin);
  const cy = place.yFloor !== undefined ? Math.max(h * place.y, px * place.yFloor) : h * place.y;
  const width = place.wChars !== undefined ? Math.min(w * place.w, px * place.wChars) : w * place.w;
  const until = item.spec.until ? markAt(world, item.spec.until) : Infinity;
  item.node.update(t, w * place.x, cy, width, px, tail.x, tail.y, until);
}

/** Head is `project(home.x, lift, z)` — the home point's x only, never the live group. */
function drawFollow(world: ComixWorld, item: BubbleNode, t: number, w: number, h: number): void {
  const place = item.spec.place;
  const stage = world.stage;
  if (place.mode !== 'follow' || !stage) return;
  const homeId = world.actors.get(place.actor)?.spec.home;
  const home = homeId ? world.points[homeId] : undefined;
  if (!home) return;
  const px = fontPx(place.minFont, h, w, place.fontH, place.fontW);
  const head = stage.project(v3(home.x, place.lift, place.z));
  const until = item.spec.until ? markAt(world, item.spec.until) : Infinity;
  item.node.update(
    t,
    Math.max(px * place.minXChars, head.x + place.x * w),
    head.y + place.y * h,
    px * place.wChars,
    px * place.fontScale,
    head.x + place.tailDx * w,
    head.y + place.tailDy * h,
    until,
  );
}

function drawBubble(world: ComixWorld, item: BubbleNode, t: number, cur: string, w: number, h: number): void {
  if (item.spec.only && item.spec.only !== cur) return;
  if (item.spec.place.mode === 'frac') drawFrac(world, item, t, w, h);
  else drawFollow(world, item, t, w, h);
}

function drawCast(world: ComixWorld, bubbles: Bubble[], spec: LetterNodes['casts'][number]['spec'], t: number, cur: string, w: number, h: number): void {
  const stage = world.stage;
  if (!stage || cur !== spec.panel) return;
  const px = fontPx(spec.minFont, h, w, spec.fontH, spec.fontW);
  const until = markAt(world, spec.until);
  world.agents.forEach((member, i) => {
    const bubble = bubbles[i];
    if (!bubble) return;
    const grp = member.actor.model.group;
    const top = stage.project(v3(grp.position.x, grp.position.y + spec.headLift * grp.scale.y, -0.5));
    const slot = member.spec.slot ?? i;
    bubble.update(t, w * (spec.x0 + slot * spec.xStep), h * (slot % 2 ? spec.yOdd : spec.yEven), w * spec.width, px, top.x, top.y, until);
  });
}

function drawTags(world: ComixWorld, item: LetterNodes['tags'][number], t: number, cur: string, w: number, h: number): void {
  const stage = world.stage;
  const screen = world.points.screen;
  const inScreen = world.points.inScreen;
  if (!stage || !screen || !inScreen || cur !== item.spec.panel) return;
  const from = markAt(world, item.spec.from);
  world.agents.forEach((member, i) => {
    const tag = item.nodes[i];
    if (!tag) return;
    const projected = stage.project(v3(screen.x + (member.spec.inX ?? 0), inScreen.y + item.spec.dy, item.spec.z));
    tag.style.display = t >= from + i * item.spec.step ? '' : 'none';
    tag.style.left = `${(projected.x / w) * 100}%`;
    tag.style.top = `${(projected.y / h) * 100}%`;
  });
}

function drawLines(world: ComixWorld, item: LetterNodes['lines'][number], t: number, cur: string): void {
  const from = markAt(world, item.spec.from);
  const n = t < from ? 0 : Math.min(item.spec.texts.length, Math.floor((t - from) / item.spec.step) + 1);
  item.el.textContent = n ? item.spec.texts[n - 1]! : '';
  const jit = item.spec.jitter && cur === item.spec.panel && n ? (Math.floor(t * 12) % 3) - 1 : 0;
  item.el.style.transform = `translate(${jit * 3}px, ${-jit * 2}px)`;
}

function drawCard(world: ComixWorld, item: LetterNodes['cards'][number], t: number): void {
  const at = markAt(world, item.spec.at);
  item.root.style.display = t >= at ? '' : 'none';
  if (t < at) return;
  const age = t - at;
  item.big.style.transform = `rotate(-2deg) scale(${age < 0.08 ? 1.3 : 1})`;
  item.big.style.visibility = age >= 0.05 ? 'visible' : 'hidden';
  const n = Math.round(span(t, markAt(world, item.spec.typeFrom), markAt(world, item.spec.typeTo)) * item.spec.path.length);
  item.typed.textContent = item.spec.path.slice(0, n);
  item.cursor.style.visibility = Math.floor(t * 2.5) % 2 ? 'hidden' : 'visible';
  item.root.style.opacity = String(1 - span(t, markAt(world, item.spec.fadeFrom), markAt(world, item.spec.fadeTo)) * 0.8);
}

function drawTurn(world: ComixWorld, spec: LetterNodes['turns'][number], t: number): void {
  const page = world.page.pages[spec.page];
  if (!page) return;
  const turn = span(t, markAt(world, spec.from), markAt(world, spec.to));
  const eased = spec.ease === 'quad' ? turn * turn : easeIn(turn);
  page.classList.toggle('htc-hidden', turn >= 1);
  page.style.transform = turn > 0 ? `perspective(1800px) rotateY(${-stepped(eased, 8) * 100}deg)` : '';
  page.style.boxShadow = turn > 0 ? '30px 0 60px rgba(0,0,0,0.45)' : '';
}

function flashOpacity(spec: PanelFlashLetter, t: number, at: number): number {
  const k = t - at;
  if (spec.hold) return t >= at ? Math.max(span(t, at, at + spec.dur), spec.opacity) : 0;
  if (k >= 0 && k < spec.dur) return spec.opacity;
  if (spec.fade !== undefined && k >= spec.dur && k < spec.dur + spec.fade) {
    const from = spec.fadeFrom ?? spec.opacity * 0.55;
    return from * (1 - (k - spec.dur) / spec.fade);
  }
  return 0;
}

function drawSplash(world: ComixWorld, splash: SplashNode, t: number, w: number, h: number): void {
  const age = t - markAt(world, splash.spec.at);
  splash.root.style.display = age >= 0 ? '' : 'none';
  if (age >= 0) {
    const portrait = h > w;
    splash.root.style.left = portrait ? '4cqw' : 'auto';
    splash.root.style.right = '4cqw';
    splash.root.style.top = portrait ? '2.5cqh' : '9cqh';
    splash.root.style.bottom = 'auto';
    splash.root.style.maxWidth = portrait ? '92cqw' : '52cqw';
    splash.row.style.flexWrap = portrait ? 'wrap' : 'nowrap';
    splash.root.style.transform = `rotate(${age < 0.08 ? -4 : -1}deg) scale(${age < 0.08 ? 1.1 : 1})`;
    const pop = age < 0.3 ? 0.4 : age < 0.38 ? 1.25 : 1;
    splash.rank.style.transform = `rotate(-6deg) scale(${pop})`;
    const show = t >= markAt(world, splash.spec.keyAt) && Math.floor(t * 2) % 2 === 0;
    splash.press.style.visibility = show ? 'visible' : 'hidden';
  }
  splash.caption.update(t);
  if (!world.stage) world.page.panel(splash.spec.panel).el.style.background = splash.spec.fallbackBackground;
}

/** Lettering for the active panel (`panelAt`), using the mounted panel's pixel size. */
export function drawLetterNodes(world: ComixWorld, nodes: LetterNodes, t: number): void {
  const cur = panelAt(world, t);
  const sized = world.current || cur;
  const box = sized && world.page.panels.has(sized) ? world.page.panelSize(sized) : { w: 1, h: 1 };
  const { w, h } = box;
  for (const caption of nodes.captions) caption.update(t);
  for (const meme of nodes.memes) meme.update(t);
  for (const item of nodes.sfx) drawSfx(world, item, t, cur, w, h);
  for (const item of nodes.bursts) drawBurst(world, item, t, cur, w, h);
  for (const item of nodes.bubbles) drawBubble(world, item, t, cur, w, h);
  for (const item of nodes.casts) drawCast(world, item.nodes, item.spec, t, cur, w, h);
  for (const item of nodes.queues) drawQueue(world, item, t);
  for (const item of nodes.tags) drawTags(world, item, t, cur, w, h);
  for (const item of nodes.lines) drawLines(world, item, t, cur);
  for (const item of nodes.brains) drawBrain(world, item, t);
  for (const item of nodes.cards) drawCard(world, item, t);
  for (const spec of nodes.turns) drawTurn(world, spec, t);
  for (const spec of nodes.flashes) {
    const on = !spec.only || spec.only === cur;
    world.page.panel(spec.panel).flash.style.opacity = String(on ? flashOpacity(spec, t, markAt(world, spec.at)) : 0);
  }
  drawInvert(world, nodes, t, cur);
  if (nodes.splash) drawSplash(world, nodes.splash, t, w, h);
}

function drawQueue(world: ComixWorld, item: LetterNodes['queues'][number], t: number): void {
  const from = markAt(world, item.spec.from);
  const shown = Math.max(0, Math.min(item.spec.prompts.length, Math.floor((t - from) / item.spec.every) + 1));
  item.items.forEach((row, i) => { row.style.display = i < shown ? '' : 'none'; });
  item.head.textContent = `${item.spec.title} ${item.spec.base + shown}`;
}

function drawBrain(world: ComixWorld, item: LetterNodes['brains'][number], t: number): void {
  const from = markAt(world, item.spec.from);
  item.rows.forEach((row, i) => { row.style.visibility = t >= from + i * item.spec.step ? 'visible' : 'hidden'; });
}

function drawInvert(world: ComixWorld, nodes: LetterNodes, t: number, cur: string): void {
  const canvas = world.stage?.canvas;
  if (!canvas) return;
  const on = nodes.inverts.some((spec) => {
    const k = t - markAt(world, spec.at);
    return cur === spec.panel && k >= spec.from && k < spec.to;
  });
  canvas.style.filter = on ? 'invert(1) contrast(1.4)' : '';
}
