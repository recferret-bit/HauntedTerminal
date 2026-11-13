import type {
  BrainLetter, BubbleLetter, CaptionLetter, CardLetter, CastBubblesLetter, InvertLetter, Letter, LinesLetter,
  PageTurnLetter, PanelFlashLetter, QueueLetter, SfxBurstLetter, SfxLetter, SplashSpec, TagsLetter,
} from './spec-types.js';
import { markAt, type ComixStats, type ComixWorld } from './reel.js';
import { Bubble, Caption, Meme, Sfx, el, jaggedPoints, svg } from './page.js';

export interface SfxNode { node: Sfx; spec: SfxLetter }
export interface BurstNode { nodes: Sfx[]; spec: SfxBurstLetter }
export interface BubbleNode { node: Bubble; spec: BubbleLetter }
export interface CastNode { nodes: Bubble[]; spec: CastBubblesLetter }
export interface QueueNode { head: HTMLElement; items: HTMLElement[]; spec: QueueLetter }
export interface TagsNode { nodes: HTMLElement[]; spec: TagsLetter }
export interface LinesNode { el: HTMLElement; spec: LinesLetter }
export interface BrainNode { rows: HTMLElement[]; spec: BrainLetter }
export interface CardNode { root: HTMLElement; big: HTMLElement; typed: HTMLElement; cursor: HTMLElement; spec: CardLetter }
export interface SplashNode {
  root: HTMLDivElement;
  row: HTMLDivElement;
  rank: HTMLDivElement;
  press: HTMLDivElement;
  caption: Caption;
  spec: SplashSpec;
}

/** DOM built once from the pack. Drawing it is `letters-draw.ts`. */
export interface LetterNodes {
  captions: Caption[];
  memes: Meme[];
  sfx: SfxNode[];
  bursts: BurstNode[];
  bubbles: BubbleNode[];
  casts: CastNode[];
  queues: QueueNode[];
  tags: TagsNode[];
  lines: LinesNode[];
  brains: BrainNode[];
  cards: CardNode[];
  turns: PageTurnLetter[];
  flashes: PanelFlashLetter[];
  inverts: InvertLetter[];
  splash: SplashNode | null;
}

/** A brain in a 100 x 60 box, `glow` 0..3 rays and halo. Drawn here, not loaded as an image. */
function brainSvg(glow: number): SVGSVGElement {
  const s = svg('svg', { viewBox: '-20 -20 140 100' });
  if (glow >= 2) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r1 = 34;
      const r2 = glow === 3 ? 66 : 50;
      s.append(svg('line', {
        x1: 50 + Math.cos(a) * r1, y1: 30 + Math.sin(a) * r1 * 0.75,
        x2: 50 + Math.cos(a) * r2, y2: 30 + Math.sin(a) * r2 * 0.75,
        stroke: glow === 3 ? '#fffbe8' : '#ffd166', 'stroke-width': glow === 3 ? 4 : 3,
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

function emptyNodes(): LetterNodes {
  return {
    captions: [], memes: [], sfx: [], bursts: [], bubbles: [], casts: [], queues: [], tags: [],
    lines: [], brains: [], cards: [], turns: [], flashes: [], inverts: [], splash: null,
  };
}

function buildCaption(world: ComixWorld, spec: CaptionLetter): Caption {
  const from = markAt(world, spec.from);
  const node = new Caption(world.page.panel(spec.panel).overlay, spec.text, from, from + spec.typeFor, spec.mono ? 'htc-mono' : '');
  if (spec.anchor === 'bottom') {
    node.el.style.top = 'auto';
    node.el.style.bottom = '3cqmin';
  }
  if (spec.maxWidth) node.el.style.maxWidth = spec.maxWidth;
  return node;
}

function buildSfx(world: ComixWorld, spec: SfxLetter): SfxNode {
  const node = new Sfx(world.page.panel(spec.panel).overlay, spec.text, markAt(world, spec.at), spec.hold, spec.color, spec.tilt);
  return { node, spec };
}

function buildBurst(world: ComixWorld, spec: SfxBurstLetter): BurstNode {
  const from = markAt(world, spec.from);
  const parent = world.page.panel(spec.panel).overlay;
  const nodes = spec.words.map((word, i) => {
    const last = i === spec.words.length - 1 && spec.lastHold !== undefined;
    return new Sfx(parent, word, from + i * spec.step, last ? spec.lastHold! : spec.hold, spec.color, spec.tilts[i] ?? 0);
  });
  return { nodes, spec };
}

function buildBubble(world: ComixWorld, spec: BubbleLetter): BubbleNode {
  const panel = world.page.panel(spec.panel);
  const node = new Bubble(panel.overlay, panel.tails, spec.text, markAt(world, spec.at), spec.style, spec.fill);
  return { node, spec };
}

function buildCast(world: ComixWorld, spec: CastBubblesLetter): CastNode {
  const panel = world.page.panel(spec.panel);
  const at = markAt(world, spec.at);
  const step = markAt(world, spec.step);
  const nodes = world.agents.map((member) => new Bubble(
    panel.overlay,
    panel.tails,
    `${member.spec.name ?? member.spec.id}: ${member.spec.mock ?? ''}`,
    at + (member.spec.order ?? 0) * step,
    'speech',
  ));
  return { nodes, spec };
}

function buildQueue(world: ComixWorld, spec: QueueLetter): QueueNode {
  const queue = el('div', 'htc-queue');
  const head = el('div', 'htc-qhead', `${spec.title} ${spec.base}`);
  queue.append(head);
  const items = spec.prompts.map((prompt) => {
    const item = el('div', 'htc-qitem', prompt);
    item.style.display = 'none';
    queue.append(item);
    return item;
  });
  world.page.panel(spec.panel).overlay.appendChild(queue);
  return { head, items, spec };
}

function buildTags(world: ComixWorld, spec: TagsLetter): TagsNode {
  const overlay = world.page.panel(spec.panel).overlay;
  const nodes = world.agents.map((member) => {
    const tag = el('div', 'htc-tag', member.spec.name ?? member.spec.id);
    tag.style.display = 'none';
    overlay.appendChild(tag);
    return tag;
  });
  return { nodes, spec };
}

function buildLines(world: ComixWorld, spec: LinesLetter): LinesNode {
  const node = el('div', 'htc-glitch');
  world.page.panel(spec.panel).overlay.appendChild(node);
  return { el: node, spec };
}

function buildBrain(world: ComixWorld, spec: BrainLetter): BrainNode {
  const brain = el('div', 'htc-brain');
  const rows = spec.rows.map((row) => {
    const node = el('div', row.glow < 2 ? 'htc-light' : '');
    node.style.background = row.bg;
    const label = el('b');
    label.append(el('small', '', row.who), document.createTextNode(row.what));
    node.append(brainSvg(row.glow), label);
    node.style.visibility = 'hidden';
    brain.append(node);
    return node;
  });
  world.page.panel(spec.panel).overlay.appendChild(brain);
  return { rows, spec };
}

function buildCard(world: ComixWorld, spec: CardLetter): CardNode {
  const root = el('div', 'htc-card');
  const inner = el('div', 'htc-card-inner');
  const big = el('div', 'htc-big', spec.title);
  const path = el('div', 'htc-path');
  const typed = el('span');
  const cursor = el('span', 'htc-cursor');
  path.append(typed, cursor);
  inner.append(big, path);
  root.append(inner);
  root.style.display = 'none';
  world.page.root.appendChild(root);
  return { root, big, typed, cursor, spec };
}

function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const two = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(mm)}:${two(ss)}` : `${two(mm)}:${two(ss)}`;
}

function addStat(dl: HTMLElement, key: string, value: string): void {
  dl.append(el('dt', '', key), el('dd', '', value));
}

function buildSplash(world: ComixWorld, stats: ComixStats, spec: SplashSpec): SplashNode {
  const panel = world.page.panel(spec.panel);
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
  addStat(dl, spec.labels.rank, `${stats.rank} // ${spec.rankWord[stats.rank] ?? stats.rank}`);
  addStat(dl, spec.labels.time, clock(stats.timeSec));
  addStat(dl, spec.labels.commands, String(stats.commands));
  const shortcuts = stats.shortcuts.length ? String(stats.shortcuts.length) : spec.emptyShortcuts;
  addStat(dl, spec.labels.shortcuts, shortcuts);
  row.append(rank, dl);
  const chips = el('div', 'htc-chips');
  for (const shortcut of stats.shortcuts.slice(0, 12)) chips.append(el('span', 'htc-chip', shortcut));
  const press = el('div', 'htc-press', spec.labels.press);
  root.append(el('div', 'htc-stats-title', spec.title), row);
  if (stats.shortcuts.length) root.append(chips);
  root.append(press);
  root.style.display = 'none';
  panel.overlay.appendChild(root);
  const from = markAt(world, spec.caption.from);
  const caption = new Caption(panel.overlay, spec.caption.text, from, from + spec.caption.typeFor);
  return { root, row, rank, press, caption, spec };
}

function addLetter(world: ComixWorld, nodes: LetterNodes, letter: Letter): void {
  switch (letter.kind) {
    case 'caption':
      nodes.captions.push(buildCaption(world, letter));
      break;
    case 'meme':
      nodes.memes.push(new Meme(world.page.panel(letter.panel).overlay, letter.text, markAt(world, letter.at), letter.edge));
      break;
    case 'sfx':
      nodes.sfx.push(buildSfx(world, letter));
      break;
    case 'sfx_burst':
      nodes.bursts.push(buildBurst(world, letter));
      break;
    case 'bubble':
      nodes.bubbles.push(buildBubble(world, letter));
      break;
    case 'cast_bubbles':
      nodes.casts.push(buildCast(world, letter));
      break;
    case 'queue':
      nodes.queues.push(buildQueue(world, letter));
      break;
    case 'tags':
      nodes.tags.push(buildTags(world, letter));
      break;
    case 'lines':
      nodes.lines.push(buildLines(world, letter));
      break;
    case 'brain':
      nodes.brains.push(buildBrain(world, letter));
      break;
    case 'card':
      nodes.cards.push(buildCard(world, letter));
      break;
    case 'page_turn':
      nodes.turns.push(letter);
      break;
    case 'panel_flash':
      nodes.flashes.push(letter);
      break;
    case 'invert':
      nodes.inverts.push(letter);
      break;
    default:
      break;
  }
}

export function buildLetters(world: ComixWorld, stats?: ComixStats): LetterNodes {
  const nodes = emptyNodes();
  for (const letter of world.pack.letters) addLetter(world, nodes, letter);
  if (world.pack.splash && stats) nodes.splash = buildSplash(world, stats, world.pack.splash);
  if (!world.stage && world.pack.splash) {
    world.page.panel(world.pack.splash.panel).el.style.background = world.pack.splash.fallbackBackground;
  }
  return nodes;
}
