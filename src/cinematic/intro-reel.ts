import * as THREE from 'three';
import { INTRO_LAYOUT } from '../procgen/archetypes/cinematic.js';
import type { ComicMaterial } from '../shaders/comic-material.js';
import { CineAudio, safeAudio } from './audio.js';
import { BRAIN, CAST, INTRO_T, PROMPTS, SHOUT_TEXT } from './intro-data.js';
import { Bubble, Caption, ComicPage, Meme, Sfx, el, svg } from './page.js';
import { makeBolt, makeComicBolt, makeVortex, partsNamed, Rain, v3 } from './set.js';
import type { Actor, CinematicStage } from './stage.js';

const T = INTRO_T;

type CinePanel = ReturnType<ComicPage['panel']>;

export interface IntroAgent {
  readonly id: string;
  readonly name: string;
  readonly inX: number;
  readonly to: readonly [number, number];
  readonly scale: number;
  readonly mock: string;
  readonly order: number;
  readonly slot: number;
  actor: Actor;
}

export interface IntroReel {
  stage: CinematicStage;
  page: ComicPage;
  audio: CineAudio;
  sound: CineAudio;
  layout: typeof INTRO_LAYOUT;
  hero: Actor;
  heroHome: THREE.Vector3;
  screen: THREE.Vector3;
  inScreenY: number;
  agents: IntroAgent[];
  towerTop: THREE.Vector3;
  keyboard: THREE.Vector3;
  rain: Rain;
  strikeBolt: THREE.Mesh;
  comicBolt: THREE.Group;
  vortex: THREE.Mesh;
  glassParts: THREE.Mesh[];
  codeParts: THREE.Mesh[];
  glass: ComicMaterial | undefined;
  glassColor: number;
  amber: ComicMaterial | undefined;
  capA: Caption;
  clockA: Caption;
  clatter: Sfx[];
  qhead: HTMLElement;
  qitems: HTMLElement[];
  memeA2top: Meme;
  memeA2bot: Meme;
  tags: HTMLElement[];
  capB: Caption;
  krakoom: Sfx;
  bzzt: Sfx;
  pB: CinePanel;
  memeC1top: Meme;
  sentient: HTMLElement;
  pC1: CinePanel;
  brainRows: HTMLElement[];
  mocks: Bubble[];
  shout: Bubble;
  fine: Bubble;
  capC3: Caption;
  pC3: CinePanel;
  memeDtop: Meme;
  memeDbot: Meme;
  slurp: Sfx;
  pD: CinePanel;
  card: HTMLElement;
  cardBig: HTMLElement;
  cardTyped: HTMLElement;
  cardCursor: HTMLElement;
  current: string;
  prev: number;
  kept: Set<string>;
}

/** A brain drawn in a 100 x 60 box, with `glow` 0..3 rays and halo. Our own drawing, not a meme image. */
function brainSvg(glow: number): SVGSVGElement {
  const s = svg('svg', { viewBox: '-20 -20 140 100' });
  if (glow >= 2) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r1 = 34, r2 = glow === 3 ? 66 : 50;
      s.append(svg('line', { x1: 50 + Math.cos(a) * r1, y1: 30 + Math.sin(a) * r1 * 0.75, x2: 50 + Math.cos(a) * r2, y2: 30 + Math.sin(a) * r2 * 0.75, stroke: glow === 3 ? '#fffbe8' : '#ffd166', 'stroke-width': glow === 3 ? 4 : 3 }));
    }
  }
  const fill = ['#f4a6b8', '#f7b267', '#c8fff4', '#ffffff'][glow]!;
  const path = 'M20 40 C8 40 6 24 18 22 C18 10 34 6 42 12 C48 4 64 4 68 12 C80 8 92 18 86 28 C96 34 88 48 76 46 C70 56 52 56 46 50 C38 56 22 54 20 40 Z';
  s.append(
    svg('path', { d: path, fill: '#110e1b', transform: 'translate(3 4)' }),
    svg('path', { d: path, fill, stroke: '#110e1b', 'stroke-width': 3 }),
    svg('path', { d: 'M50 10 C44 22 58 30 50 50 M30 22 C36 28 30 36 38 42 M70 18 C64 26 72 34 66 42', fill: 'none', stroke: '#110e1b', 'stroke-width': 2.5 }),
  );
  if (glow > 0) s.style.filter = `drop-shadow(0 0 ${4 + glow * 7}px ${glow === 3 ? '#4cc9f0' : '#fffbe8'})`;
  return s;
}

function buildIntroSet(stage: CinematicStage): Pick<IntroReel,
  'layout' | 'hero' | 'heroHome' | 'screen' | 'inScreenY' | 'agents' | 'towerTop' | 'keyboard' | 'rain'
  | 'strikeBolt' | 'comicBolt' | 'vortex' | 'glassParts' | 'codeParts' | 'glass' | 'glassColor' | 'amber'> {
  const L = INTRO_LAYOUT;
  const room = stage.addModel('room.intro', 1);
  const hero = stage.addModel('vibecoder.dev', 1);
  const heroHome = v3(L.chairX, 0, -0.15);
  hero.model.group.position.copy(heroHome);
  hero.animator.setLook(1, -0.4);
  const m = L.monitor;
  const screen = v3(m.x, m.y + 0.01, 0.42);
  const inScreenY = m.y - 0.24;
  const agents: IntroAgent[] = CAST.map((c) => ({ ...c, actor: stage.addModel(c.id, 1) }));
  for (const a of agents) a.actor.model.group.visible = false;
  const towerTop = v3(L.tower.x, L.deskTop + L.tower.h, 0.4);
  const keyboard = v3(L.keyboard.x, L.keyboard.y + 0.05, 0.4);
  const rain = new Rain(stage, L.window, 0.835);
  const strikeBolt = makeBolt(stage, v3(L.tower.x - 0.35, L.deskTop + L.tower.h + 2.6, 0.2), towerTop.clone().setZ(0.2));
  const comicBolt = makeComicBolt(stage, v3(L.tower.x - 0.5, 3.3, 0.12), towerTop.clone().setZ(0.12).setY(towerTop.y + 0.02), 7);
  const vortex = makeVortex(stage, v3(m.x, m.y + 0.01, 0.47), m.w - 0.16, m.h - 0.16);
  const glassParts = partsNamed(room, 'monitor-screen');
  const codeParts = [...partsNamed(room, 'code-line'), ...partsNamed(room, 'cursor')];
  const glass = room.model.materials.get('glass');
  const glassColor = glass ? (glass.uniforms.uColor!.value as THREE.Color).getHex() : 0xc8fff4;
  const amber = room.model.materials.get('powerAmber');
  return {
    layout: L, hero, heroHome, screen, inScreenY, agents, towerTop, keyboard, rain,
    strikeBolt, comicBolt, vortex, glassParts, codeParts, glass, glassColor, amber,
  };
}

function buildIntroLetters(page: ComicPage, agents: IntroAgent[]): Pick<IntroReel,
  'capA' | 'clockA' | 'clatter' | 'qhead' | 'qitems' | 'memeA2top' | 'memeA2bot' | 'tags' | 'capB' | 'krakoom' | 'bzzt' | 'pB'
  | 'memeC1top' | 'sentient' | 'pC1' | 'brainRows' | 'mocks' | 'shout' | 'fine' | 'capC3' | 'pC3'
  | 'memeDtop' | 'memeDbot' | 'slurp' | 'pD' | 'card' | 'cardBig' | 'cardTyped' | 'cardCursor'> {
  const pA = page.panel('A'), pA2 = page.panel('A2'), pB = page.panel('B');
  const pC1 = page.panel('C1'), pC2 = page.panel('C2'), pC3 = page.panel('C3'), pD = page.panel('D');
  const capA = new Caption(pA.overlay, "Day 847 of being asked to 'just make it work'.", 0.3, 2.0);
  const clockA = new Caption(pA.overlay, '02:47 AM', 2.2, 2.5, 'htc-mono');
  clockA.el.style.top = 'auto';
  clockA.el.style.bottom = '3cqmin';
  const clatter = ['TAK', 'TIKA-TAK', 'TAK!', 'TAKA-TAKA'].map((w, i, all) =>
    new Sfx(pA.overlay, w, 1.2 + i * 1.5, i === all.length - 1 ? 90 : 0.5, '#f4f1ea', i % 2 ? 7 : -9));
  const queue = el('div', 'htc-queue');
  const qhead = el('div', 'htc-qhead', 'PROMPT QUEUE: 846');
  queue.append(qhead);
  const qitems = PROMPTS.map((p) => {
    const item = el('div', 'htc-qitem', p);
    item.style.display = 'none';
    queue.append(item);
    return item;
  });
  pA.overlay.appendChild(queue);
  const memeA2top = new Meme(pA2.overlay, 'HUMAN: "JUST ONE MORE TINY FIX"', T.A2 + 0.2, 'top');
  const memeA2bot = new Meme(pA2.overlay, 'THE AGENTS:', T.A2 + 1.4, 'bottom');
  const tags = agents.map((a) => {
    const tag = el('div', 'htc-tag', a.name);
    tag.style.display = 'none';
    pA2.overlay.appendChild(tag);
    return tag;
  });
  const capB = new Caption(pB.overlay, 'Then the storm found the tower.', T.B + 0.15, T.B + 1.0);
  const krakoom = new Sfx(pB.overlay, 'KRAKOOM!', T.STRIKE + 0.04, 90, '#fffbe8', -7);
  const bzzt = new Sfx(pB.overlay, 'BZZZT!', T.STRIKE + 1.4, 1.4, '#4cc9f0', 6);
  const memeC1top = new Meme(pC1.overlay, 'AFTER THE LIGHTNING:', T.C1 + 0.3, 'top');
  const sentient = el('div', 'htc-glitch');
  pC1.overlay.appendChild(sentient);
  const brain = el('div', 'htc-brain');
  const brainRows = BRAIN.map((b) => {
    const row = el('div', b.glow < 2 ? 'htc-light' : '');
    row.style.background = b.bg;
    const label = el('b');
    label.append(el('small', '', b.who), document.createTextNode(b.what));
    row.append(brainSvg(b.glow), label);
    row.style.visibility = 'hidden';
    brain.append(row);
    return row;
  });
  pC2.overlay.appendChild(brain);
  const mocks = agents.map((a) => new Bubble(pC3.overlay, pC3.tails, `${a.name}: ${a.mock}`, T.MOCK + a.order * T.MOCK_STEP, 'speech'));
  const shout = new Bubble(pC3.overlay, pC3.tails, SHOUT_TEXT, T.SHOUT, 'shout', '#fff4d6');
  const fine = new Bubble(pC3.overlay, pC3.tails, '...this is fine.', T.FINE, 'speech');
  const capC3 = new Caption(pC3.overlay, 'Day 1 of the new management.', T.FINE + 0.5, T.FINE + 1.2);
  capC3.el.style.top = 'auto';
  capC3.el.style.bottom = '3cqmin';
  capC3.el.style.maxWidth = '46cqw';
  const memeDtop = new Meme(pD.overlay, 'UPLOADING HUMAN...', T.PULL + 0.1, 'top');
  const memeDbot = new Meme(pD.overlay, 'PLEASE DO NOT TURN OFF YOUR DEVELOPER', T.PULL + 1.0, 'bottom');
  const slurp = new Sfx(pD.overlay, 'SHLUUURRP!', T.PULL + 0.3, 2.4, '#9b5de5', -6);
  const card = el('div', 'htc-card');
  const cardInner = el('div', 'htc-card-inner');
  const cardBig = el('div', 'htc-big', 'ENTERING FLOOR 01');
  const cardPath = el('div', 'htc-path');
  const cardTyped = el('span');
  const cardCursor = el('span', 'htc-cursor');
  cardPath.append(cardTyped, cardCursor);
  cardInner.append(cardBig, cardPath);
  card.append(cardInner);
  card.style.display = 'none';
  page.root.appendChild(card);
  return {
    capA, clockA, clatter, qhead, qitems, memeA2top, memeA2bot, tags, capB, krakoom, bzzt, pB,
    memeC1top, sentient, pC1, brainRows, mocks, shout, fine, capC3, pC3,
    memeDtop, memeDbot, slurp, pD, card, cardBig, cardTyped, cardCursor,
  };
}

export function createIntroReel(stage: CinematicStage, page: ComicPage, audio: CineAudio): IntroReel {
  stage.setBackground(0x211a36);
  const set = buildIntroSet(stage);
  const letters = buildIntroLetters(page, set.agents);
  return {
    stage,
    page,
    audio,
    sound: safeAudio(audio),
    ...set,
    ...letters,
    current: '',
    prev: 0,
    kept: new Set(),
  };
}
