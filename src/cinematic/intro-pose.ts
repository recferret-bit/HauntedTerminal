import * as THREE from 'three';
import { INTRO_ORDER, INTRO_T } from './intro-data.js';
import type { IntroReel } from './intro-reel.js';
import { poseSeated } from './set.js';
import { easeIn, easeOut, easeOutBack, fitPanelStage, lerp, span, stepped, type Shot } from './stage.js';

const T = INTRO_T;

const lerpShot = (a: Shot, b: Shot, k: number): Shot => ({
  x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k),
});

export function panelAt(t: number): string {
  let id = 'A';
  for (const [p, at] of INTRO_ORDER) if (t >= at) id = p;
  return id;
}

export function shotFor(reel: IntroReel, t: number): Shot {
  const m = reel.layout.monitor;
  const p = panelAt(t);
  const closeUp: Shot = { x: m.x, y: m.y + 0.02, w: 1.36, h: 0.98 };
  if (p === 'A') return lerpShot({ x: 1.3, y: 1.8, w: 5.4, h: 3.3 }, { x: 1.55, y: 1.55, w: 4.5, h: 2.75 }, easeOut(span(t, T.A, T.A2)));
  if (p === 'A2') return closeUp;
  if (p === 'B') return { x: 1.6, y: 1.8, w: 8.2, h: 2.4 };
  if (p === 'C1' || p === 'C2') return lerpShot({ x: m.x, y: m.y + 0.05, w: 1.7, h: 1.25 }, closeUp, easeOut(span(t, T.C1, T.C2)));
  if (p === 'C3') return lerpShot({ x: 2.2, y: 1.5, w: 3.2, h: 2.4 }, { x: 2.0, y: 2.3, w: 4.6, h: 4.4 }, easeOut(span(t, T.RISE, T.RISE + 1.6)));
  return lerpShot({ x: 1.95, y: 1.3, w: 3.8, h: 2.6 }, { x: 2.35, y: 1.35, w: 3.0, h: 2.1 }, easeIn(span(t, T.PULL, T.WHITE)));
}

export function fitIntro(reel: IntroReel): void {
  if (!reel.current) return;
  fitPanelStage(reel.stage, reel.page, reel.current);
}

function poseHero(reel: IntroReel, t: number, pull: number): void {
  const { hero, heroHome, screen } = reel;
  const typing = t < T.STRIKE ? 1 : t < T.C3 ? 0.4 : 0;
  poseSeated(hero, t, typing, false);
  const g = hero.model.group;
  if (pull > 0) {
    const k = stepped(easeIn(pull), 10);
    // Head first into the vortex: the body turns to point at the screen, stretches, then shrinks away.
    const cx = heroHome.x, cy = heroHome.y + 0.8;
    const dx = screen.x - cx, dy = screen.y - cy;
    const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    const sy = lerp(1, 1.65, Math.min(1, k * 1.6)) * lerp(1, 0.08, span(k, 0.55, 1));
    const sx = lerp(1, 0.32, k) * lerp(1, 0.2, span(k, 0.55, 1));
    const reach = 1.25 * sy;
    g.position.set(lerp(heroHome.x, screen.x - ux * reach, k), lerp(heroHome.y, screen.y - uy * reach, k), lerp(heroHome.z, 0.3, k));
    g.rotation.z = -(Math.PI / 2 - Math.atan2(uy, ux)) * Math.min(1, k * 2.2);
    g.scale.set(sx, sy, 1);
    g.visible = t < T.WHITE;
  } else {
    const recoil = t > T.SHOUT && t < T.SHOUT + 0.5 ? 0.06 : 0;
    g.position.set(heroHome.x - recoil, heroHome.y, heroHome.z);
    g.rotation.z = recoil * 1.5;
    g.scale.set(1, 1, 1);
    g.visible = true;
  }
}

function poseMonitor(reel: IntroReel, t: number): void {
  const { glassParts, codeParts, vortex, glass, glassColor, amber } = reel;
  const m = reel.layout.monitor;
  const burst = t >= T.BURST;
  for (const p of glassParts) p.visible = !burst;
  for (const p of codeParts) p.visible = t < T.A2;
  vortex.visible = burst && t < T.WHITE + 0.4;
  if (vortex.visible) {
    const grow = stepped(easeOut(span(t, T.BURST, T.BURST + 0.4)), 4);
    vortex.scale.set((m.w - 0.16) * grow, (m.h - 0.16) * grow, 0.08);
  }
  if (glass) {
    const c = glass.uniforms.uColor!.value as THREE.Color;
    const glitching = (t >= T.STRIKE && t < T.STRIKE + 0.8) || (t >= T.WAKE && t < T.WAKE + 0.6) || (t >= T.C3 && t < T.BURST);
    const f = Math.floor(t * 12) % 4;
    c.setHex(glitching ? (f === 0 ? 0xef476f : f === 2 ? 0x9b5de5 : glassColor) : glassColor);
  }
  if (amber) (amber.uniforms.uColor!.value as THREE.Color).setHex(t >= T.STRIKE ? 0xef233c : 0xffd166);
}

function poseAgents(reel: IntroReel, t: number): void {
  const { agents, screen, inScreenY } = reel;
  const awake = t >= T.WAKE;
  for (const a of agents) {
    const grp = a.actor.model.group;
    grp.visible = t >= T.A2 && t < T.CARD;
    if (!grp.visible) continue;
    const inScale = awake ? lerp(0.15, 0.19, stepped(span(t, T.WAKE, T.WAKE + 0.6), 3)) : 0.15;
    const inPos = new THREE.Vector3(screen.x + a.inX, inScreenY + (awake ? 0.02 : -0.02), 0.4);
    const k = span(t, T.RISE + a.order * 0.18, T.RISE + a.order * 0.18 + 1.0);
    const e = stepped(easeOutBack(k), 8);
    const lean = span(t, T.SHOUT + 0.6, T.TURN2);
    grp.position.set(lerp(inPos.x, a.to[0], e) - lean * 0.2, lerp(inPos.y, a.to[1], e), lerp(inPos.z, -0.5, Math.min(1, e)));
    grp.scale.setScalar(lerp(inScale, a.scale, Math.min(1.06, e)));
    // Slumped and tired before the lightning; upright after.
    grp.rotation.z = awake ? 0 : (a.order % 2 ? 0.22 : -0.18);
  }
}

function poseShake(reel: IntroReel, t: number, pull: number): void {
  const S = reel.stage;
  const { strikeBolt, comicBolt, screen } = reel;
  const sinceStrike = t - T.STRIKE;
  strikeBolt.visible = sinceStrike >= 0 && sinceStrike < 0.45 && Math.floor(sinceStrike * 24) % 4 !== 3;
  // The drawn bolt flickers for a beat, then stays lettered on the panel (comics keep their bolts).
  comicBolt.visible = sinceStrike >= 0.04 && sinceStrike < 2.6 && (sinceStrike > 0.4 || Math.floor(sinceStrike * 24) % 5 !== 4);
  const sinceBurst = t - T.BURST;
  let shake = 0;
  if (sinceStrike >= 0 && sinceStrike < 0.55) shake = 0.09 * (1 - sinceStrike / 0.55);
  if (sinceBurst >= 0 && sinceBurst < 0.45) shake = Math.max(shake, 0.06 * (1 - sinceBurst / 0.45));
  const sinceWake = t - T.WAKE;
  if (sinceWake >= 0 && sinceWake < 0.4) shake = Math.max(shake, 0.015);
  if (t > T.SHOUT && t < T.SHOUT + 0.35) shake = Math.max(shake, 0.03);
  if (t > T.PULL && t < T.WHITE) shake = Math.max(shake, 0.012 + 0.02 * pull);
  S.shake = shake;
  S.flashPos.copy(screen);
  S.flash = 0;
  if (sinceWake >= 0 && t < T.C2) S.flash = 0.3 * (Math.floor(t * 10) % 2) + (sinceWake < 0.3 ? 1.2 : 0);
  if (t >= T.C3 && t < T.BURST) S.flash = 0.35 * (Math.floor(t * 12) % 2);
  if (sinceBurst >= 0 && sinceBurst < 0.15) S.flash = 2.2;
  if (t >= T.TURN2) S.flash = 0.35 * pull * pull;
  const d = span(t, T.DISSOLVE, T.WHITE);
  S.setPixelSize(3.5 + stepped(easeIn(d), 6) * 24);
}

/** Everything that is a pure function of t: transforms, colours, shot, shake. */
export function poseIntro(reel: IntroReel, t: number): void {
  const S = reel.stage;
  const pull = span(t, T.PULL, T.PULL_END);
  S.shot = shotFor(reel, t);
  poseHero(reel, t, pull);
  reel.rain.group.visible = t < T.CARD;
  reel.rain.update(t);
  poseMonitor(reel, t);
  poseAgents(reel, t);
  poseShake(reel, t, pull);
}
