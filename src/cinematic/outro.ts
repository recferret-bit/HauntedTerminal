import * as THREE from 'three';
import { CineAudio, safeAudio } from './audio.js';
import type { OutroStats } from './index.js';
import type { DebugOptions } from './intro.js';
import { Bubble, Caption, ComicPage, el, Sfx, svg, jaggedPoints, type PanelDef } from './page.js';
import { runCinematic, type CineScript } from './runner.js';
import { makeBolt, partsNamed, poseSeated, v3 } from './set.js';
import { CinematicStage, easeOutBack, fitPanelStage, lerp, span, stepped, type Actor, type Shot } from './stage.js';

/**
 * The ending, on room.outro (the real desk at dawn):
 *
 *   page 1   P1 0.0 - 5.0   the monitor blazes, reverse lightning goes UP out of it (MOOKARK!), he is thrown
 *                           out of the screen and lands in his chair (THUD!); the AI agents follow him out
 *                           and shatter (2.1, SEGFAULT!)
 *            P2 5.0 - 9.0   dawn close-up: "Dawn. Production is green." / "...was it all a dream?"
 *   turn     9.0 - 9.8     page 1 turns away
 *   splash   9.8 -         the dawn room, THE END?, rank, time, commands, shortcuts; "PRESS ANY KEY" at 10.4
 */
export const OUTRO_T = { REVERSE: 0.5, LAND: 1.5, SHATTER: 2.1, P2: 5.0, TURN: 9.0, SPLASH: 9.8, KEY: 10.4 } as const;
const T = OUTRO_T;

const PANELS: PanelDef[] = [
  { id: 'P1', page: 0, landscape: [0, 0, 0.6, 1], portrait: [0, 0, 1, 0.56] },
  { id: 'P2', page: 0, landscape: [0.6, 0, 0.4, 1], portrait: [0, 0.56, 1, 0.44] },
  { id: 'S', page: 1, landscape: [0, 0, 1, 1], portrait: [0, 0, 1, 1] },
];

const RANK_COLOR: Record<OutroStats['rank'], string> = { S: '#ffd166', A: '#4cc9f0', B: '#39ff88', C: '#ef476f' };
const RANK_WORD: Record<OutroStats['rank'], string> = { S: 'SYSADMIN LEGEND', A: 'SENIOR ENGINEER', B: 'ON-CALL SURVIVOR', C: 'STILL EMPLOYED' };

type CinePanel = ReturnType<ComicPage['panel']>;

interface OutroReel {
  page: ComicPage;
  stage: CinematicStage | null;
  audio: CineAudio;
  sound: CineAudio;
  hero: Actor | null;
  agents: Actor[];
  screenParts: THREE.Mesh[];
  bolt: THREE.Mesh | null;
  monitor: THREE.Vector3;
  seat: THREE.Vector3;
  fling: THREE.Vector3[];
  cap1: Caption;
  mookark: Sfx;
  thud: Sfx;
  crash: Sfx;
  cap2: Caption;
  dream: Bubble;
  capS: Caption;
  p1: CinePanel;
  p2: CinePanel;
  splash: HTMLDivElement;
  row: HTMLDivElement;
  rank: HTMLDivElement;
  press: HTMLDivElement;
  current: string;
  prev: number;
}

function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const two = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(mm)}:${two(ss)}` : `${two(mm)}:${two(ss)}`;
}

function buildSplash(page: ComicPage, stats: OutroStats): Pick<OutroReel, 'splash' | 'row' | 'rank' | 'press' | 'capS'> {
  const pS = page.panel('S');
  const splash = el('div', 'htc-splash');
  const title = el('div', 'htc-stats-title', 'THE END?');
  const row = el('div', 'htc-stats-row');
  const rank = el('div', 'htc-rank');
  const burst = svg('svg', { viewBox: '0 0 100 100' });
  const pts = jaggedPoints(12, 1.7, 0.72);
  burst.append(
    svg('polygon', { points: pts, fill: '#110e1b', transform: 'translate(4 5)' }),
    svg('polygon', { points: pts, fill: RANK_COLOR[stats.rank], stroke: '#110e1b', 'stroke-width': 3, 'stroke-linejoin': 'miter' }),
  );
  rank.append(burst, el('b', '', stats.rank));
  const dl = el('dl', 'htc-stats');
  const add = (k: string, v: string): void => {
    dl.append(el('dt', '', k), el('dd', '', v));
  };
  add('Rank', `${stats.rank} // ${RANK_WORD[stats.rank]}`);
  add('Time', clock(stats.timeSec));
  add('Commands', String(stats.commands));
  add('Shortcuts', stats.shortcuts.length ? String(stats.shortcuts.length) : 'none');
  row.append(rank, dl);
  const chips = el('div', 'htc-chips');
  for (const s of stats.shortcuts.slice(0, 12)) chips.append(el('span', 'htc-chip', s));
  const press = el('div', 'htc-press', 'PRESS ANY KEY ▸');
  splash.append(title, row);
  if (stats.shortcuts.length) splash.append(chips);
  splash.append(press);
  splash.style.display = 'none';
  pS.overlay.appendChild(splash);
  const capS = new Caption(pS.overlay, 'Exit code 0.', T.SPLASH + 0.1, T.SPLASH + 0.5);
  return { splash, row, rank, press, capS };
}

function buildCast(stage: CinematicStage | null): Pick<OutroReel, 'hero' | 'agents' | 'screenParts' | 'bolt' | 'monitor' | 'seat' | 'fling'> {
  const monitor = v3(3.0, 1.62, 0.44);
  const chair = v3(0.95, 0, 0.18);
  const seat = v3(0.95, 0, -0.15);
  let hero: Actor | null = null;
  let agents: Actor[] = [];
  let screenParts: THREE.Mesh[] = [];
  let bolt: THREE.Mesh | null = null;
  if (stage) {
    stage.setBackground(0x3a506b);
    const room = stage.addModel('room.outro', 1);
    stage.addModel('prop.office_chair', 1).model.group.position.copy(chair);
    hero = stage.addModel('vibecoder.dev', 1);
    hero.model.group.visible = false;
    agents = [
      stage.addModel('agent.clod', 1),
      stage.addModel('agent.gork', 1),
      stage.addModel('agent.codec', 1),
      stage.addModel('agent.antigravy', 1),
    ];
    for (const a of agents) a.model.group.visible = false;
    screenParts = [...partsNamed(room, 'monitor-screen')];
    bolt = makeBolt(stage, monitor.clone().setY(1.95).setZ(0.3), v3(3.35, 5.3, 0.3));
  }
  const fling = [v3(3.7, 2.4, -0.3), v3(2.3, 2.9, -0.3), v3(3.1, 3.35, -0.35), v3(1.6, 3.2, -0.3)];
  return { hero, agents, screenParts, bolt, monitor, seat, fling };
}

function buildLetters(page: ComicPage): Pick<OutroReel, 'cap1' | 'mookark' | 'thud' | 'crash' | 'cap2' | 'dream' | 'p1' | 'p2'> {
  const p1 = page.panel('P1'), p2 = page.panel('P2');
  const cap1 = new Caption(p1.overlay, 'Then the storm ran backwards.', 0.15, 1.1);
  const mookark = new Sfx(p1.overlay, 'MOOKARK!', T.REVERSE + 0.05, 1.2, '#4cc9f0', 8);
  const thud = new Sfx(p1.overlay, 'THUD!', T.LAND, 0.9, '#ffd166', -10);
  const crash = new Sfx(p1.overlay, 'KSSHH!', T.SHATTER, 1.0, '#ef476f', 6);
  const cap2 = new Caption(p2.overlay, 'Dawn. Production is green.', T.P2 + 0.2, T.P2 + 1.3);
  const dream = new Bubble(p2.overlay, p2.tails, '...was it all a dream?', T.P2 + 1.8, 'thought');
  return { cap1, mookark, thud, crash, cap2, dream, p1, p2 };
}

function shotFor(reel: OutroReel, t: number): Shot {
  if (t < T.P2) return { x: 2.0, y: 1.75, w: 4.2, h: 3.6 };
  if (t < T.TURN) return { x: 0.2, y: 1.95, w: 3.0, h: 3.4 };
  const { w, h } = reel.page.panelSize('S');
  return h > w ? { x: 1.2, y: 1.6, w: 2.0, h: 2.0 } : { x: 0.9, y: 2.2, w: 7.6, h: 4.6 };
}

function panelAt(t: number): string {
  return t < T.P2 ? 'P1' : t < T.TURN ? 'P2' : 'S';
}

function poseHeroFlight(reel: OutroReel, t: number): void {
  const { hero, monitor, seat } = reel;
  if (!hero) return;
  const g = hero.model.group;
  const fly = span(t, T.REVERSE + 0.1, T.LAND);
  g.visible = t >= T.REVERSE + 0.1;
  if (fly < 1) {
    const k = stepped(fly, 9);
    g.position.set(lerp(monitor.x, seat.x, k), lerp(monitor.y - 0.4, seat.y, k) + Math.sin(k * Math.PI) * 1.1, lerp(0.3, seat.z, k));
    g.scale.set(lerp(0.25, 1, k), lerp(1.8, 1, k), 1);
    g.rotation.z = lerp(0.9, 0, k);
  } else {
    const land = t - T.LAND;
    const squash = land < 0.08 ? 0.82 : land < 0.16 ? 1.06 : 1;
    g.position.copy(seat);
    g.scale.set(2 - squash, squash, 1);
    g.rotation.z = 0;
  }
  poseSeated(hero, t, 0, true);
}

function poseAgentsOut(reel: OutroReel, t: number): void {
  const { agents, monitor, fling } = reel;
  agents.forEach((a, i) => {
    const k = span(t, T.REVERSE + 0.4 + i * 0.12, T.SHATTER - 0.1);
    const grp = a.model.group;
    grp.visible = k > 0 && a.animator.deathProgress < 0.999 && t < T.TURN;
    const e = stepped(easeOutBack(k), 6);
    const to = fling[i]!;
    grp.position.set(lerp(monitor.x, to.x, e), lerp(monitor.y - 0.3, to.y, e), lerp(0.3, to.z, Math.min(1, e)));
    grp.scale.setScalar(lerp(0.1, 0.62, Math.min(1, e)));
  });
}

function poseOutro(reel: OutroReel, t: number): void {
  const { stage, hero, screenParts, bolt, monitor } = reel;
  if (!stage || !hero) return;
  stage.shot = shotFor(reel, t);
  poseHeroFlight(reel, t);
  poseAgentsOut(reel, t);
  const blaze = t < T.SHATTER + 0.3;
  for (const p of screenParts) p.visible = true;
  stage.flashPos.copy(monitor);
  stage.flash = blaze ? (t < T.REVERSE ? 0.35 + (Math.floor(t * 12) % 2) * 0.45 : 0.4) : 0;
  if (bolt) {
    const bk = t - T.REVERSE;
    bolt.visible = bk >= 0 && bk < 0.6 && Math.floor(bk * 20) % 3 !== 2;
  }
  let shake = 0;
  const r = t - T.REVERSE;
  if (r >= 0 && r < 0.5) shake = 0.08 * (1 - r / 0.5);
  const l = t - T.LAND;
  if (l >= 0 && l < 0.3) shake = Math.max(shake, 0.05 * (1 - l / 0.3));
  stage.shake = shake;
}

function letterPanels(reel: OutroReel, t: number, cur: string, w: number, h: number, minSide: number): void {
  const { stage, p1, seat } = reel;
  reel.cap1.update(t);
  reel.cap2.update(t);
  if (cur === 'P1' && stage) {
    reel.mookark.update(t, w * 0.5, h * 0.24, minSide * 0.15);
    const st = stage.project(seat);
    reel.thud.update(t, st.x - w * 0.05, st.y - h * 0.05, minSide * 0.11);
    reel.crash.update(t, w * 0.62, h * 0.34, minSide * 0.11);
    p1.flash.style.opacity = t >= T.REVERSE && t < T.REVERSE + 0.08 ? '1' : '0';
  } else {
    [reel.mookark, reel.thud, reel.crash].forEach((s) => s.update(-1, 0, 0, 0));
    p1.flash.style.opacity = '0';
  }
  if (cur === 'P2' && stage) {
    const head = stage.project(v3(seat.x, 1.75, -0.2));
    const fontPx = Math.max(13, minSide * 0.065);
    reel.dream.update(t, w * 0.5, Math.max(h * 0.2, fontPx * 2.4), Math.min(w * 0.8, fontPx * 10), fontPx, head.x, head.y);
  }
}

function letterSplash(reel: OutroReel, t: number, h: number, w: number): void {
  const turn = span(t, T.TURN, T.SPLASH);
  const pg = reel.page.pages[0]!;
  pg.classList.toggle('htc-hidden', turn >= 1);
  pg.style.transform = turn > 0 ? `perspective(1800px) rotateY(${-stepped(turn * turn, 8) * 100}deg)` : '';
  pg.style.boxShadow = turn > 0 ? '30px 0 60px rgba(0,0,0,0.45)' : '';
  const s = t - T.SPLASH;
  reel.splash.style.display = s >= 0 ? '' : 'none';
  if (s >= 0) {
    const portrait = h > w;
    reel.splash.style.left = portrait ? '4cqw' : 'auto';
    reel.splash.style.right = portrait ? '4cqw' : '4cqw';
    reel.splash.style.top = portrait ? '2.5cqh' : '9cqh';
    reel.row.style.flexWrap = portrait ? 'wrap' : 'nowrap';
    reel.splash.style.bottom = 'auto';
    reel.splash.style.maxWidth = portrait ? '92cqw' : '52cqw';
    reel.splash.style.transform = `rotate(${s < 0.08 ? -4 : -1}deg) scale(${s < 0.08 ? 1.1 : 1})`;
    reel.rank.style.transform = `rotate(-6deg) scale(${s < 0.3 ? 0.4 : s < 0.38 ? 1.25 : 1})`;
    reel.press.style.visibility = t >= T.KEY && Math.floor(t * 2) % 2 === 0 ? 'visible' : 'hidden';
  }
  reel.capS.update(t);
  if (!reel.stage) reel.page.panel('S').el.style.background = '#3a506b';
}

function letterOutro(reel: OutroReel, t: number): void {
  const cur = panelAt(t);
  const { w, h } = reel.current ? reel.page.panelSize(reel.current) : reel.page.panelSize(cur);
  const minSide = Math.min(w, h);
  letterPanels(reel, t, cur, w, h, minSide);
  letterSplash(reel, t, h, w);
}

function fitOutro(reel: OutroReel): void {
  if (!reel.stage || !reel.current) return;
  fitPanelStage(reel.stage, reel.page, reel.current);
}

function cutOutro(reel: OutroReel, to: string, t: number): void {
  const { stage } = reel;
  if (stage && reel.current) {
    const before = t - 1e-3;
    poseOutro(reel, before);
    stage.render(before);
    letterOutro(reel, before);
    reel.page.snapshot(reel.current, stage.canvas);
  }
  reel.page.show(to);
  if (stage) reel.page.mount(to, stage.canvas);
  reel.current = to;
  fitOutro(reel);
}

function stepOutro(reel: OutroReel, t: number, dt: number, live: boolean): void {
  const { stage, hero, sound, seat, agents, fling } = reel;
  const crossed = (at: number): boolean => reel.prev < at && t >= at;
  for (const [id, at] of [['P2', T.P2], ['S', T.TURN]] as const) if (crossed(at)) cutOutro(reel, id, at);
  if (stage && hero) {
    if (crossed(T.REVERSE)) {
      stage.lightning.flashStrength = 2.2;
      stage.lightning.flashPos.copy(reel.monitor);
      if (live) {
        sound.thunder();
        sound.zap(1.0, true);
      }
    }
    if (crossed(T.LAND)) stage.fire('fx.hop', seat.clone().setZ(-0.3), t, { seed: 4, text: 'HOME!' });
    if (crossed(T.SHATTER)) {
      agents.forEach((a, i) => {
        a.animator.setState('death');
        // From the scripted position (the group may not have been posed during a fast-forward).
        const at = fling[i]!.clone().setZ(-0.5);
        at.y += 0.45;
        stage.fire(i === 0 ? 'fx.malware-death' : 'fx.malware-hit', at, t, { seed: 20 + i, scale: 0.8 });
      });
      if (live) sound.shatter();
    }
    if (crossed(T.LAND + 0.8)) hero.animator.setLook(-1, 0.2);
    if (crossed(T.P2 + 1.0)) hero.animator.setLook(-1, 0.6);
    stage.step(dt);
  }
  reel.prev = t;
}

function outroScript(reel: OutroReel): CineScript {
  return {
    end: T.SPLASH,
    holdAtEnd: true,
    step(t, dt, live) {
      stepOutro(reel, t, dt, live);
    },
    draw(t) {
      poseOutro(reel, t);
      reel.stage?.render(t);
      letterOutro(reel, t);
    },
    layout() {
      reel.page.layout();
      fitOutro(reel);
    },
    // Never ends from a skip: the splash must show; only a key after T.KEY resolves.
    skipTo: (t) => (t < T.TURN ? T.TURN : t < T.SPLASH ? T.SPLASH : t),
    acceptsKey: (t) => t >= T.KEY,
    onPause: (p) => reel.audio.setPaused(p),
  };
}

export function startOutro(host: HTMLElement, stats: OutroStats, opts: { skippable?: boolean; muted?: boolean } = {}, debug: DebugOptions = {}): Promise<void> {
  const page = new ComicPage(host, PANELS, 2);
  let stage: CinematicStage | null = null;
  try {
    stage = new CinematicStage();
  } catch (err) {
    console.warn('[cinematic] no WebGL, showing the stats without the scene', err);
  }
  const audio = new CineAudio(!!opts.muted || debug.freezeAt !== undefined);
  const reel: OutroReel = {
    page,
    stage,
    audio,
    sound: safeAudio(audio),
    ...buildCast(stage),
    ...buildLetters(page),
    ...buildSplash(page, stats),
    current: '',
    prev: 0,
  };
  const cleanup = (): void => {
    reel.stage?.dispose();
    reel.audio.dispose();
    page.dispose();
  };
  cutOutro(reel, 'P1', 0);
  return runCinematic(page.root, outroScript(reel), { skippable: opts.skippable !== false, freezeAt: debug.freezeAt, inputGraceMs: 600 }, cleanup).done;
}
