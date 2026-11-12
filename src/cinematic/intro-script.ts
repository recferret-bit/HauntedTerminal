import { INTRO_KEYFRAMES, INTRO_ORDER, INTRO_T } from './intro-data.js';
import { letterIntro } from './intro-letter.js';
import { fitIntro, poseIntro } from './intro-pose.js';
import type { IntroReel } from './intro-reel.js';
import type { CineScript } from './runner.js';
import { v3 } from './set.js';

const T = INTRO_T;

export function cutIntro(reel: IntroReel, to: string, t: number): void {
  const S = reel.stage;
  if (reel.current && !reel.kept.has(reel.current)) {
    const before = t - 1e-3;
    poseIntro(reel, before);
    S.render(before);
    letterIntro(reel, before);
    reel.page.snapshot(reel.current, S.canvas);
  }
  reel.page.show(to);
  reel.page.mount(to, S.canvas);
  reel.current = to;
  fitIntro(reel);
}

function stepIntro(reel: IntroReel, t: number, dt: number, live: boolean): void {
  const S = reel.stage;
  const { sound, hero, agents, screen, inScreenY, towerTop } = reel;
  const win = reel.layout.window;
  const crossed = (at: number): boolean => reel.prev < at && t >= at;
  for (const [id, at] of INTRO_ORDER) if (id !== 'A' && crossed(at)) cutIntro(reel, id, at);
  for (const [id, at] of INTRO_KEYFRAMES) {
    if (crossed(at) && reel.current === id) {
      poseIntro(reel, t);
      S.render(t);
      letterIntro(reel, t);
      reel.page.snapshot(id, S.canvas);
      reel.kept.add(id);
    }
  }
  for (const at of [1.5, 4.3, T.A2 + 2.0, T.B + 0.4]) {
    if (crossed(at)) {
      S.lightning.strikeAt(v3(win.x + 0.35, win.y - 0.75, 0.84), 1.3);
      S.lightning.flashStrength = 1.2;
      if (live) sound.distantThunder();
    }
  }
  if (crossed(T.A2 + 0.3)) {
    hero.animator.setLook(1, -0.2);
    for (const a of agents) a.actor.animator.setLook(0, -1);
  }
  if (crossed(T.STRIKE)) {
    S.lightning.strikeAt(towerTop.clone(), 3.2);
    S.lightning.flashStrength = 1.1;
    S.fire('fx.lightning-strike', towerTop.clone().setZ(0.2), t, { seed: 7, scale: 0.62 });
    if (live) sound.thunder();
  }
  if (crossed(T.STRIKE + 0.35)) S.fire('fx.rm-ash', towerTop.clone().setZ(0.2).setY(towerTop.y - 0.2), t, { seed: 3, scale: 0.8 });
  if (crossed(T.WAKE)) {
    for (const a of agents) a.actor.animator.setLook(0, 0);
    if (live) sound.zap(0.6, true);
  }
  for (let i = 0; i < 3; i++) {
    const at = T.WAKE + 0.1 + i * 0.7;
    if (crossed(at)) {
      const a = agents[i]!, b = agents[i + 1]!;
      S.lightning.spawnGridOverloadArc(v3(screen.x + a.inX, inScreenY + 0.12, 0.3), v3(screen.x + b.inX, inScreenY + 0.12, 0.3));
      S.lightning.flashStrength = 0.6;
    }
  }
  if (crossed(T.BURST)) {
    S.fire('fx.panel-smash', screen.clone().setZ(0.2), t, { seed: 5, text: 'KRSSSH!', scale: 0.85 });
    if (live) sound.burst();
  }
  if (crossed(T.RISE + 1.4)) for (const a of agents) a.actor.animator.setLook(-1, -0.5);
  if (crossed(T.SHOUT)) {
    hero.animator.setState('hit');
    if (live) sound.zap(1.1, true);
  }
  for (let i = 0; i < 4; i++) {
    const at = T.PULL + 0.2 + i * 0.62;
    if (crossed(at)) S.fire('fx.devnull-suck', screen.clone().setZ(0.2), t, { seed: 11 + i, scale: 1.2 });
  }
  if (live) {
    if (crossed(0.02)) sound.rain(true);
    if (crossed(T.TURN2)) sound.rain(false);
    if (crossed(T.PULL)) sound.zap(2.6);
    if (crossed(T.WHITE)) sound.burst();
    if (t > 0.9 && t < T.A2 && Math.floor(t * 9) !== Math.floor(reel.prev * 9) && Math.random() > 0.3) sound.key();
  }
  S.step(dt);
  reel.prev = t;
}

export function introScript(reel: IntroReel): CineScript {
  return {
    end: T.END,
    step(t, dt, live) {
      stepIntro(reel, t, dt, live);
    },
    draw(t) {
      poseIntro(reel, t);
      reel.stage.render(t);
      letterIntro(reel, t);
    },
    layout() {
      reel.page.layout();
      fitIntro(reel);
    },
    skipTo: () => 'end',
    onPause: (p) => reel.audio.setPaused(p),
  };
}
