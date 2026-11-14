import { resolveTime } from './expr.js';
import { Bubble, Caption, Meme, Sfx, el, jaggedPoints, svg } from './page.js';
import type { ComixStats, ComixWorld } from './reel.js';
import type { PanelLetter } from './spec-types.js';
import type { ResolvedLetter, ResolvedOverlay, ResolvedPageTurn } from './timeline.js';

type SpecOf<K extends PanelLetter['kind']> = Extract<PanelLetter, { kind: K }>;

export interface CaptionNode { node: Caption; until: number }
export interface BannerNode { node: Meme; until: number }
export interface SfxNode { node: Sfx; item: ResolvedLetter; spec: SpecOf<'sfx'> }
export interface SfxSeqNode { nodes: Sfx[]; item: ResolvedLetter; spec: SpecOf<'sfx_seq'> }
export interface BubbleNode { node: Bubble; item: ResolvedLetter; spec: SpecOf<'bubble'>; until: number }
export interface TagNode { el: HTMLElement; item: ResolvedLetter; spec: SpecOf<'label_tag'>; at: number; until: number; placed: boolean }
export interface PromptListNode { head: HTMLElement; items: HTMLElement[]; from: number; spec: SpecOf<'prompt_list'> }
export interface GlitchNode { el: HTMLElement; panelId: string; from: number; spec: SpecOf<'glitch_text'> }
export interface TierNode { rows: HTMLElement[]; from: number; spec: SpecOf<'tier_stack'> }
export interface FlashNode { panelId: string; at: number; spec: SpecOf<'panel_flash'> }
export interface InvertNode { panelId: string; at: number; spec: SpecOf<'invert'> }
export interface TitleCardNode { root: HTMLElement; big: HTMLElement; typed: HTMLElement; cursor: HTMLElement; overlay: ResolvedOverlay }
export interface StatsCardNode {
  panelId: string;
  root: HTMLDivElement;
  row: HTMLDivElement;
  rank: HTMLDivElement;
  press: HTMLDivElement;
  at: number;
  keyAt: number;
  spec: SpecOf<'stats_card'>;
}

export interface LetterNodes {
  captions: CaptionNode[];
  banners: BannerNode[];
  sfx: SfxNode[];
  sfxSeqs: SfxSeqNode[];
  bubbles: BubbleNode[];
  tags: TagNode[];
  prompts: PromptListNode[];
  glitches: GlitchNode[];
  tiers: TierNode[];
  flashes: FlashNode[];
  inverts: InvertNode[];
  turns: ResolvedPageTurn[];
  cards: TitleCardNode[];
  statsCards: StatsCardNode[];
}

const DEFAULT_STATS: ComixStats = {
  rank: 'A',
  timeSec: 1234,
  commands: 87,
  shortcuts: ['ls -la', 'chmod +x', 'kill -9', 'cd -', '!!', 'tab-complete'],
};

function tierBrainSvg(glow: number): SVGSVGElement {
  const s = svg('svg', { viewBox: '-20 -20 140 100' });
  if (glow >= 2) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r1 = 34;
      const r2 = glow === 3 ? 66 : 50;
      s.append(svg('line', {
        x1: 50 + Math.cos(a) * r1,
        y1: 30 + Math.sin(a) * r1 * 0.75,
        x2: 50 + Math.cos(a) * r2,
        y2: 30 + Math.sin(a) * r2 * 0.75,
        stroke: glow === 3 ? '#fffbe8' : '#ffd166',
        'stroke-width': glow === 3 ? 4 : 3,
      }));
    }
  }
  const fill = ['#f4a6b8', '#f7b267', '#c8fff4', '#ffffff'][glow] ?? '#ffffff';
  const path = 'M20 40 C8 40 6 24 18 22 C18 10 34 6 42 12 C48 4 64 4 68 12 C80 8 92 18 86 28 C96 34 88 48 76 46 C70 56 52 56 46 50 C38 56 22 54 20 40 Z';
  s.append(
    svg('path', { d: path, fill: '#110e1b', transform: 'translate(3 4)' }),
    svg('path', { d: path, fill, stroke: '#110e1b', 'stroke-width': 3 }),
    svg('path', { d: 'M50 10 C44 22 58 30 50 50 M30 22 C36 28 30 36 38 42 M70 18 C64 26 72 34 66 42', fill: 'none', stroke: '#110e1b', 'stroke-width': 2.5 }),
  );
  if (glow > 0) s.style.filter = `drop-shadow(0 0 ${4 + glow * 7}px ${glow === 3 ? '#4cc9f0' : '#fffbe8'})`;
  return s;
}

function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const two = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(mm)}:${two(ss)}` : `${two(mm)}:${two(ss)}`;
}

function buildStatsCard(world: ComixWorld, item: ResolvedLetter, spec: SpecOf<'stats_card'>, stats: ComixStats): StatsCardNode {
  const panel = world.page.panel(item.panelId);
  const root = el('div', 'htc-splash');
  const row = el('div', 'htc-stats-row');
  const rank = el('div', 'htc-rank');
  const burst = svg('svg', { viewBox: '0 0 100 100' });
  const pts = jaggedPoints(12, 1.7, 0.72);
  const color = spec.rankColor[stats.rank] ?? '#ffd166';
  burst.append(
    svg('polygon', { points: pts, fill: '#110e1b', transform: 'translate(4 5)' }),
    svg('polygon', { points: pts, fill: color, stroke: '#110e1b', 'stroke-width': 3, 'stroke-linejoin': 'miter' }),
  );
  rank.append(burst, el('b', '', stats.rank));
  const dl = el('dl', 'htc-stats');
  const addStat = (key: string, val: string): void => {
    dl.append(el('dt', '', key), el('dd', '', val));
  };
  addStat(spec.labels.rank, `${stats.rank} // ${spec.rankWord[stats.rank] ?? stats.rank}`);
  addStat(spec.labels.time, clock(stats.timeSec));
  addStat(spec.labels.commands, String(stats.commands));
  addStat(spec.labels.shortcuts, stats.shortcuts.length ? String(stats.shortcuts.length) : spec.emptyShortcuts);
  row.append(rank, dl);
  const chips = el('div', 'htc-chips');
  for (const shortcut of stats.shortcuts.slice(0, 12)) chips.append(el('span', 'htc-chip', shortcut));
  const press = el('div', 'htc-press', spec.labels.press);
  root.append(el('div', 'htc-stats-title', spec.title), row);
  if (stats.shortcuts.length) root.append(chips);
  root.append(press);
  root.style.display = 'none';
  panel.overlay.appendChild(root);
  if (!world.stage) panel.el.style.background = spec.fallbackBackground;
  return {
    panelId: item.panelId,
    root,
    row,
    rank,
    press,
    at: resolveTime(spec.at, item.cues, item.panelFrom),
    keyAt: resolveTime(spec.keyAt, item.cues, item.panelFrom),
    spec,
  };
}

function tagLetterEl(node: HTMLElement, item: ResolvedLetter): void {
  node.dataset.comixSelKind = 'letter';
  node.dataset.comixPageId = item.pageId;
  node.dataset.comixPanelId = item.panelId;
  node.dataset.comixPanelIdx = String(item.panelIndex);
  node.dataset.comixItemIdx = String(item.letterIndex);
  node.dataset.comixLetterKind = item.spec.kind;
}

function buildTitleCard(world: ComixWorld, overlay: ResolvedOverlay): TitleCardNode {
  const root = el('div', 'htc-card');
  root.dataset.comixSelKind = 'overlay';
  root.dataset.comixPageId = overlay.pageId;
  root.dataset.comixItemIdx = String(overlay.overlayIndex);
  root.dataset.comixOverlayTitle = overlay.title;
  const inner = el('div', 'htc-card-inner');
  const big = el('div', 'htc-big', overlay.title);
  const path = el('div', 'htc-path');
  const typed = el('span');
  const cursor = el('span', 'htc-cursor');
  path.append(typed, cursor);
  inner.append(big, path);
  root.append(inner);
  root.style.display = 'none';
  world.page.root.appendChild(root);
  return { root, big, typed, cursor, overlay };
}

function addPanelLetter(world: ComixWorld, nodes: LetterNodes, item: ResolvedLetter, stats: ComixStats): void {
  const { panelId, cues, panelFrom, spec } = item;
  const panel = world.page.panel(panelId);
  const time = (expr: string): number => resolveTime(expr, cues, panelFrom);
  switch (spec.kind) {
    case 'caption': {
      const from = time(spec.from);
      const until = spec.until !== undefined ? time(spec.until) : Infinity;
      const node = new Caption(panel.overlay, spec.text, from, from + spec.typeDur, spec.mono ? 'htc-mono' : '');
      if (spec.position === 'bottom') {
        node.el.style.top = 'auto';
        node.el.style.bottom = '3cqmin';
      }
      if (spec.maxWidth) node.el.style.maxWidth = spec.maxWidth;
      tagLetterEl(node.el, item);
      nodes.captions.push({ node, until });
      return;
    }
    case 'banner': {
      const until = spec.until !== undefined ? time(spec.until) : Infinity;
      const node = new Meme(panel.overlay, spec.text, time(spec.at), spec.edge);
      tagLetterEl(node.el, item);
      nodes.banners.push({ node, until });
      return;
    }
    case 'sfx': {
      const node = new Sfx(panel.overlay, spec.text, time(spec.at), spec.hold, spec.color, spec.tilt);
      tagLetterEl(node.el, item);
      nodes.sfx.push({ node, item, spec });
      return;
    }
    case 'sfx_seq': {
      const from = time(spec.from);
      const list = spec.words.map((w, i) => {
        const last = i === spec.words.length - 1 && spec.lastHold !== undefined;
        const sfxNode = new Sfx(panel.overlay, w, from + i * spec.step, last ? spec.lastHold! : spec.hold, spec.color, spec.tilts[i] ?? 0);
        tagLetterEl(sfxNode.el, item);
        return sfxNode;
      });
      nodes.sfxSeqs.push({ nodes: list, item, spec });
      return;
    }
    case 'bubble': {
      const until = spec.until !== undefined ? time(spec.until) : Infinity;
      const node = new Bubble(panel.overlay, panel.tails, spec.text, time(spec.at), spec.style, spec.fill);
      tagLetterEl(node.el, item);
      nodes.bubbles.push({ node, item, spec, until });
      return;
    }
    case 'label_tag': {
      const tag = el('div', 'htc-tag', spec.text);
      tag.style.display = 'none';
      tagLetterEl(tag, item);
      panel.overlay.appendChild(tag);
      const until = spec.until !== undefined ? time(spec.until) : Infinity;
      nodes.tags.push({ el: tag, item, spec, at: time(spec.at), until, placed: false });
      return;
    }
    case 'prompt_list': {
      const box = el('div', 'htc-queue');
      tagLetterEl(box, item);
      const head = el('div', 'htc-qhead', `${spec.title} ${spec.baseCount}`);
      box.append(head);
      const items = spec.items.map((txt) => {
        const row = el('div', 'htc-qitem', txt);
        row.style.display = 'none';
        box.append(row);
        return row;
      });
      panel.overlay.appendChild(box);
      nodes.prompts.push({ head, items, from: time(spec.from), spec });
      return;
    }
    case 'glitch_text': {
      const node = el('div', 'htc-glitch');
      tagLetterEl(node, item);
      panel.overlay.appendChild(node);
      nodes.glitches.push({ el: node, panelId, from: time(spec.from), spec });
      return;
    }
    case 'tier_stack': {
      const brain = el('div', 'htc-brain');
      tagLetterEl(brain, item);
      const rows = spec.rows.map((r) => {
        const div = el('div', r.glow < 2 ? 'htc-light' : '');
        div.style.background = r.bg;
        const label = el('b');
        label.append(el('small', '', r.who), document.createTextNode(r.what));
        div.append(tierBrainSvg(r.glow), label);
        div.style.visibility = 'hidden';
        brain.append(div);
        return div;
      });
      panel.overlay.appendChild(brain);
      nodes.tiers.push({ rows, from: time(spec.from), spec });
      return;
    }
    case 'panel_flash':
      nodes.flashes.push({ panelId, at: time(spec.at), spec });
      return;
    case 'invert':
      nodes.inverts.push({ panelId, at: time(spec.at), spec });
      return;
    case 'stats_card': {
      const card = buildStatsCard(world, item, spec, stats);
      tagLetterEl(card.root, item);
      nodes.statsCards.push(card);
      return;
    }
  }
}

export function buildLetters(world: ComixWorld, stats?: ComixStats): LetterNodes {
  const nodes: LetterNodes = {
    captions: [],
    banners: [],
    sfx: [],
    sfxSeqs: [],
    bubbles: [],
    tags: [],
    prompts: [],
    glitches: [],
    tiers: [],
    flashes: [],
    inverts: [],
    turns: [...world.timeline.turns],
    cards: [],
    statsCards: [],
  };
  const resolvedStats = stats ?? DEFAULT_STATS;
  for (const letter of world.timeline.letters) addPanelLetter(world, nodes, letter, resolvedStats);
  for (const overlay of world.timeline.overlays) nodes.cards.push(buildTitleCard(world, overlay));
  return nodes;
}

export function resetLetterNodes(nodes: LetterNodes): void {
  for (const s of nodes.sfx) s.node.reset();
  for (const seq of nodes.sfxSeqs) for (const node of seq.nodes) node.reset();
  for (const b of nodes.bubbles) b.node.reset();
  for (const tag of nodes.tags) {
    tag.placed = false;
    tag.el.style.display = 'none';
  }
}
