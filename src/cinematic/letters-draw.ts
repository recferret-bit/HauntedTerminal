import type { BubbleNode, FlashNode, LetterNodes, SfxNode, SfxSeqNode, StatsCardNode, TagNode, TitleCardNode } from './letters-build.js';
import { panelAt, worldPoint, type ComixWorld } from './reel.js';
import { v3 } from './set.js';
import type { PanelLetter } from './spec-types.js';
import { easeIn, span, stepped } from './stage.js';
import type { ResolvedPageTurn } from './timeline.js';

function fontPx(minFont: number, h: number, w: number, fontH: number, fontW: number, fontOfMin?: number): number {
  if (fontOfMin !== undefined) return Math.max(minFont, Math.min(w, h) * fontOfMin);
  return Math.max(minFont, Math.min(h * fontH, w * fontW));
}

function projectPoint(world: ComixWorld, ref: PanelLetter extends never ? never : string | { x: number; y: number; z: number }): { x: number; y: number } | null {
  return world.stage ? world.stage.project(worldPoint(world, ref)) : null;
}

function drawSfx(world: ComixWorld, entry: SfxNode, t: number, cur: string, w: number, h: number): void {
  const { node, item, spec } = entry;
  if (spec.activePanelOnly && item.panelId !== cur) {
    if (spec.freezeOnCut) node.keep(t);
    else node.update(-1, 0, 0, 0);
    return;
  }
  const maxByWidth = (w * 0.92) / Math.max(2.5, spec.text.length * 0.82);
  const size = Math.min(Math.min(w, h) * spec.size, maxByWidth);
  if (spec.anchor === 'frac') {
    node.update(t, w * (spec.x ?? 0.5), h * (spec.y ?? 0.5), size);
    return;
  }
  const projected = spec.point !== undefined ? projectPoint(world, spec.point) : null;
  if (!projected) {
    node.update(-1, 0, 0, 0);
    return;
  }
  node.update(t, projected.x + (spec.dx ?? 0) * w, projected.y + (spec.dy ?? 0) * h, size);
}

function drawSfxSeq(world: ComixWorld, entry: SfxSeqNode, t: number, cur: string, w: number, h: number): void {
  const { nodes, item, spec } = entry;
  if (spec.activePanelOnly && item.panelId !== cur) {
    for (const node of nodes) (spec.freezeOnCut ? node.keep(t) : node.update(-1, 0, 0, 0));
    return;
  }
  const projected = projectPoint(world, spec.point);
  if (!projected) {
    for (const node of nodes) node.update(-1, 0, 0, 0);
    return;
  }
  const size = Math.min(w, h) * spec.size;
  const dxMod = Math.max(1, Math.floor(spec.dxMod || 1));
  const dyMod = Math.max(1, Math.floor(spec.dyMod || 1));
  nodes.forEach((node, i) => {
    const ox = spec.dx + (i % dxMod) * spec.dxStep;
    const oy = spec.dy + (i % dyMod) * spec.dyStep;
    node.update(t, projected.x + ox * w, projected.y + oy * h, size);
  });
}

function resolveTailPx(world: ComixWorld, spec: Extract<PanelLetter, { kind: 'bubble' }>): { x: number; y: number } | null {
  const stage = world.stage;
  if (!stage) return null;
  if (spec.tailActor) {
    const member = world.actors.get(spec.tailActor);
    if (!member) return null;
    const grp = member.actor.model.group;
    return stage.project(v3(grp.position.x, grp.position.y + (spec.tailLift ?? 1.3) * grp.scale.y, spec.tailZ ?? -0.5));
  }
  if (spec.tailPoint !== undefined) {
    return stage.project(worldPoint(world, spec.tailPoint));
  }
  return null;
}

function drawBubble(world: ComixWorld, entry: BubbleNode, t: number, cur: string, w: number, h: number): void {
  const { node, item, spec, until } = entry;
  if (spec.activePanelOnly && item.panelId !== cur) {
    if (spec.freezeOnCut !== false) node.keep(t, until);
    else node.update(-1, 0, 0, 0, 0, 0, 0);
    return;
  }
  if (spec.anchor === 'world') {
    const stage = world.stage;
    if (!stage || spec.tailPoint === undefined) return;
    const px = fontPx(spec.minFont, h, w, spec.fontH, spec.fontW, spec.fontOfMin);
    const head = stage.project(worldPoint(world, spec.tailPoint));
    const cx = spec.minXChars !== undefined ? Math.max(px * spec.minXChars, head.x + spec.x * w) : head.x + spec.x * w;
    node.update(
      t,
      cx,
      head.y + spec.y * h,
      px * (spec.wChars ?? 10),
      px * (spec.fontScale ?? 1),
      head.x + (spec.tailDx ?? 0) * w,
      head.y + (spec.tailDy ?? 0) * h,
      until,
    );
    return;
  }
  const tail = resolveTailPx(world, spec) ?? { x: w * spec.x, y: h * (spec.y + 0.15) };
  const px = fontPx(spec.minFont, h, w, spec.fontH, spec.fontW, spec.fontOfMin);
  const cy = spec.yFloor !== undefined ? Math.max(h * spec.y, px * spec.yFloor) : h * spec.y;
  const width = spec.wChars !== undefined ? Math.min(w * (spec.w ?? 0.5), px * spec.wChars) : w * (spec.w ?? 0.5);
  node.update(t, w * spec.x, cy, width, px, tail.x, tail.y, until);
}

function drawTag(world: ComixWorld, entry: TagNode, t: number, cur: string, w: number, h: number): void {
  const stage = world.stage;
  const on = t >= entry.at && t < entry.until;
  if (!stage || !on) {
    entry.el.style.display = 'none';
    return;
  }
  if (entry.spec.activePanelOnly && cur !== entry.item.panelId) {
    entry.el.style.display = entry.spec.freezeOnCut !== false && entry.placed ? '' : 'none';
    return;
  }
  entry.el.style.display = '';
  entry.placed = true;
  const projected = stage.project(worldPoint(world, entry.spec.point));
  entry.el.style.left = `${(projected.x / w) * 100}%`;
  entry.el.style.top = `${(projected.y / h) * 100}%`;
}

function drawTitleCard(card: TitleCardNode, t: number): void {
  const { overlay } = card;
  card.root.style.display = t >= overlay.at ? '' : 'none';
  if (t < overlay.at) return;
  const age = t - overlay.at;
  card.big.style.transform = `rotate(-2deg) scale(${age < 0.08 ? 1.3 : 1})`;
  card.big.style.visibility = age >= 0.05 ? 'visible' : 'hidden';
  const n = Math.round(span(t, overlay.typeFrom, overlay.typeTo) * overlay.subtitle.length);
  card.typed.textContent = overlay.subtitle.slice(0, n);
  card.cursor.style.visibility = Math.floor(t * 2.5) % 2 ? 'hidden' : 'visible';
  card.root.style.opacity = String(1 - span(t, overlay.fadeFrom, overlay.fadeTo) * 0.8);
}

function drawTurn(world: ComixWorld, spec: ResolvedPageTurn, t: number): void {
  const page = world.page.pages[spec.pageIndex];
  if (!page) return;
  const turn = span(t, spec.from, spec.to);
  const eased = spec.ease === 'quad' ? turn * turn : easeIn(turn);
  page.classList.toggle('htc-hidden', turn >= 1);
  page.style.transform = turn > 0 ? `perspective(1800px) rotateY(${-stepped(eased, 8) * 100}deg)` : '';
  page.style.boxShadow = turn > 0 ? '30px 0 60px rgba(0,0,0,0.45)' : '';
}

function flashOpacity(entry: FlashNode, t: number): number {
  const { spec, at } = entry;
  const k = t - at;
  if (spec.hold) return t >= at ? Math.max(span(t, at, at + spec.dur), spec.opacity) : 0;
  if (k >= 0 && k < spec.dur) return spec.opacity;
  if (spec.fade !== undefined && k >= spec.dur && k < spec.dur + spec.fade) {
    const from = spec.fadeFrom ?? spec.opacity * 0.55;
    return from * (1 - (k - spec.dur) / spec.fade);
  }
  return 0;
}

function drawStatsCard(world: ComixWorld, card: StatsCardNode, t: number, w: number, h: number): void {
  const age = t - card.at;
  card.root.style.display = age >= 0 ? '' : 'none';
  if (age >= 0) {
    const portrait = h > w;
    card.root.style.left = portrait ? '4cqw' : 'auto';
    card.root.style.right = '4cqw';
    card.root.style.top = portrait ? '8.5cqh' : '9cqh';
    card.root.style.bottom = 'auto';
    card.root.style.maxWidth = portrait ? '92cqw' : '52cqw';
    card.row.style.flexWrap = portrait ? 'wrap' : 'nowrap';
    card.root.style.transform = `rotate(${age < 0.08 ? -4 : -1}deg) scale(${age < 0.08 ? 1.1 : 1})`;
    const pop = age < 0.3 ? 0.4 : age < 0.38 ? 1.25 : 1;
    card.rank.style.transform = `rotate(-6deg) scale(${pop})`;
    const show = t >= card.keyAt && Math.floor(t * 2) % 2 === 0;
    card.press.style.visibility = show ? 'visible' : 'hidden';
  }
  if (!world.stage) world.page.panel(card.panelId).el.style.background = card.spec.fallbackBackground;
}

export function drawLetterNodes(world: ComixWorld, nodes: LetterNodes, t: number): void {
  const cur = panelAt(world, t);
  const sized = world.current || cur;
  const box = sized && world.page.panels.has(sized) ? world.page.panelSize(sized) : { w: 1, h: 1 };
  const { w, h } = box;

  for (const c of nodes.captions) c.node.update(t, c.until);
  for (const m of nodes.banners) {
    if (t >= m.until) m.node.el.style.display = 'none';
    else m.node.update(t);
  }
  for (const s of nodes.sfx) drawSfx(world, s, t, cur, w, h);
  for (const seq of nodes.sfxSeqs) drawSfxSeq(world, seq, t, cur, w, h);
  for (const b of nodes.bubbles) drawBubble(world, b, t, cur, w, h);
  for (const tag of nodes.tags) drawTag(world, tag, t, cur, w, h);
  for (const q of nodes.prompts) {
    const every = Math.max(1e-3, q.spec.every);
    const shown = Math.max(0, Math.min(q.spec.items.length, Math.floor((t - q.from) / every) + 1));
    q.items.forEach((row, i) => { row.style.display = i < shown ? '' : 'none'; });
    q.head.textContent = `${q.spec.title} ${q.spec.baseCount + shown}`;
  }
  for (const g of nodes.glitches) {
    const step = Math.max(1e-3, g.spec.step);
    const n = t < g.from ? 0 : Math.min(g.spec.texts.length, Math.floor((t - g.from) / step) + 1);
    g.el.textContent = n ? g.spec.texts[n - 1]! : '';
    const jit = g.spec.jitter && cur === g.panelId && n ? (Math.floor(t * 12) % 3) - 1 : 0;
    g.el.style.transform = `translate(${jit * 3}px, ${-jit * 2}px)`;
  }
  for (const tier of nodes.tiers) {
    const step = Math.max(1e-3, tier.spec.step);
    tier.rows.forEach((row, i) => { row.style.visibility = t >= tier.from + i * step ? 'visible' : 'hidden'; });
  }
  for (const turn of nodes.turns) drawTurn(world, turn, t);

  const flashByPanel = new Map<string, number>();
  for (const fl of nodes.flashes) {
    if (fl.spec.activePanelOnly && fl.panelId !== cur) continue;
    const prev = flashByPanel.get(fl.panelId) ?? 0;
    flashByPanel.set(fl.panelId, Math.max(prev, flashOpacity(fl, t)));
  }
  for (const [id, p] of world.page.panels) p.flash.style.opacity = String(flashByPanel.get(id) ?? 0);

  if (world.stage?.canvas) {
    const inv = nodes.inverts.some((iv) => {
      const k = t - iv.at;
      return cur === iv.panelId && k >= iv.spec.fromOffset && k < iv.spec.toOffset;
    });
    world.stage.canvas.style.filter = inv ? 'invert(1) contrast(1.4)' : '';
  }
  for (const card of nodes.cards) drawTitleCard(card, t);
  for (const sc of nodes.statsCards) drawStatsCard(world, sc, t, w, h);
}
