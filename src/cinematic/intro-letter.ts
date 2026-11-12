import { INTRO_T, PROMPTS } from './intro-data.js';
import type { IntroReel } from './intro-reel.js';
import { panelAt } from './intro-pose.js';
import { v3 } from './set.js';
import { easeIn, span, stepped } from './stage.js';

const T = INTRO_T;
const PATH = '// /home/dev/nightmare_workspace';
const SENTIENT = ['WE...', 'WE... ARE...', 'WE... ARE... SENTIENT'];

function letterDesk(reel: IntroReel, t: number, cur: string, w: number, h: number, minSide: number): void {
  const S = reel.stage;
  reel.capA.update(t);
  reel.clockA.update(t);
  const shown = Math.max(0, Math.min(PROMPTS.length, Math.floor((t - 0.9) / 0.95) + 1));
  reel.qitems.forEach((item, i) => (item.style.display = i < shown ? '' : 'none'));
  reel.qhead.textContent = `PROMPT QUEUE: ${846 + shown}`;
  if (cur === 'A') {
    const kb = S.project(reel.keyboard);
    reel.clatter.forEach((s, i) => s.update(t, kb.x - (0.02 + (i % 2) * 0.06) * w, kb.y + (0.1 + (i % 3) * 0.035) * h, minSide * 0.085));
  } else reel.clatter.forEach((s) => s.keep(t));
  reel.memeA2top.update(t);
  reel.memeA2bot.update(t);
  if (cur === 'A2') {
    reel.agents.forEach((a, i) => {
      const p = S.project(v3(reel.screen.x + a.inX, reel.inScreenY - 0.03, 0.3));
      const tag = reel.tags[i]!;
      tag.style.display = t >= T.A2 + 0.6 + i * 0.15 ? '' : 'none';
      // Percentages of the panel, so the tags stay under their agents when the window is resized.
      tag.style.left = `${(p.x / w) * 100}%`;
      tag.style.top = `${(p.y / h) * 100}%`;
    });
  }
}

function letterStorm(reel: IntroReel, t: number, cur: string, w: number, h: number, minSide: number): void {
  const S = reel.stage;
  reel.capB.update(t);
  const k = t - T.STRIKE;
  reel.pB.flash.style.opacity = k >= 0 && k < 0.09 ? '1' : k >= 0.09 && k < 0.3 ? String(0.55 * (1 - (k - 0.09) / 0.21)) : '0';
  if (cur === 'B') {
    S.canvas.style.filter = k >= 0.09 && k < 0.2 ? 'invert(1) contrast(1.4)' : '';
    const tw = S.project(reel.towerTop);
    reel.bzzt.update(t, tw.x + w * 0.06, tw.y - h * 0.12, minSide * 0.13);
    reel.krakoom.update(t, w * 0.5, h * 0.3, minSide * 0.32);
  } else {
    reel.bzzt.update(-1, 0, 0, 0);
    reel.krakoom.keep(t);
    S.canvas.style.filter = '';
  }
}

function letterWake(reel: IntroReel, t: number, cur: string): void {
  reel.memeC1top.update(t);
  const words = t < T.WAKE + 0.5 ? 0 : t < T.WAKE + 1.3 ? 1 : t < T.WAKE + 2.1 ? 2 : 3;
  reel.sentient.textContent = words ? SENTIENT[words - 1]! : '';
  const jit = cur === 'C1' && words ? (Math.floor(t * 12) % 3) - 1 : 0;
  reel.sentient.style.transform = `translate(${jit * 3}px, ${-jit * 2}px)`;
  reel.pC1.flash.style.opacity = t >= T.WAKE && t < T.WAKE + 0.07 ? '0.85' : '0';
  reel.brainRows.forEach((row, i) => (row.style.visibility = t >= T.C2 + 0.25 + i * 0.75 ? 'visible' : 'hidden'));
}

function letterRoast(reel: IntroReel, t: number, cur: string, w: number, h: number): void {
  if (cur === 'C3') {
    // The roast: four bubbles in one staggered row over their heads; the shout replaces them.
    const S = reel.stage;
    const fontPx = Math.max(11, Math.min(h * 0.03, w * 0.031));
    reel.agents.forEach((a, i) => {
      const grp = a.actor.model.group;
      const top = S.project(v3(grp.position.x, grp.position.y + 1.35 * grp.scale.y, -0.5));
      const bw = w * 0.235;
      const bx = w * (0.13 + a.slot * 0.248);
      const by = h * (a.slot % 2 ? 0.25 : 0.13);
      reel.mocks[i]!.update(t, bx, by, bw, fontPx, top.x, top.y, T.SHOUT);
    });
    const shoutPx = Math.max(15, Math.min(h * 0.06, w * 0.06));
    const head = S.project(v3(reel.heroHome.x, 1.7, -0.2));
    const gem = reel.agents[1]!.actor.model.group;
    const gtop = S.project(v3(gem.position.x, gem.position.y + 1.3 * gem.scale.y, -0.5));
    reel.shout.update(t, w * 0.5, Math.max(h * 0.12, shoutPx * 1.9), w * 0.8, shoutPx, gtop.x, gtop.y);
    reel.fine.update(t, Math.max(fontPx * 5, head.x - w * 0.24), head.y - h * 0.02, fontPx * 9, fontPx * 1.2, head.x - w * 0.03, head.y + h * 0.04);
    reel.pC3.flash.style.opacity = t >= T.BURST && t < T.BURST + 0.07 ? '0.9' : '0';
  }
  reel.capC3.update(t);
}

function letterUpload(reel: IntroReel, t: number, cur: string, w: number, h: number, minSide: number): void {
  reel.memeDtop.update(t);
  reel.memeDbot.update(t);
  if (cur === 'D') {
    reel.slurp.update(t, w * 0.66, h * 0.66, minSide * 0.13);
    const wk = span(t, T.WHITE, T.WHITE + 0.5);
    reel.pD.flash.style.opacity = String(t >= T.WHITE ? Math.max(wk, 0.92) : 0);
  } else reel.slurp.update(-1, 0, 0, 0);
}

function turnIntroPages(reel: IntroReel, t: number): void {
  const turnPage = (idx: number, t0: number, t1: number): void => {
    const turn = span(t, t0, t1);
    const pg = reel.page.pages[idx]!;
    pg.classList.toggle('htc-hidden', turn >= 1);
    pg.style.transform = turn > 0 ? `perspective(1800px) rotateY(${-stepped(easeIn(turn), 8) * 100}deg)` : '';
    pg.style.boxShadow = turn > 0 ? '30px 0 60px rgba(0,0,0,0.45)' : '';
  };
  turnPage(0, T.TURN1, T.TURN1_END);
  turnPage(1, T.TURN2, T.TURN2_END);
}

function letterCard(reel: IntroReel, t: number): void {
  reel.card.style.display = t >= T.CARD ? '' : 'none';
  if (t >= T.CARD) {
    const big = t - T.CARD;
    reel.cardBig.style.transform = `rotate(-2deg) scale(${big < 0.08 ? 1.3 : 1})`;
    reel.cardBig.style.visibility = big >= 0.05 ? 'visible' : 'hidden';
    const n = Math.round(span(t, T.CARD + 0.5, T.CARD + 2.0) * PATH.length);
    reel.cardTyped.textContent = PATH.slice(0, n);
    reel.cardCursor.style.visibility = Math.floor(t * 2.5) % 2 ? 'hidden' : 'visible';
    reel.card.style.opacity = String(1 - span(t, T.END - 0.5, T.END) * 0.8);
  }
}

/** DOM lettering, placed from the current panel's camera. */
export function letterIntro(reel: IntroReel, t: number): void {
  const cur = panelAt(t);
  const { w, h } = reel.current ? reel.page.panelSize(reel.current) : { w: 1, h: 1 };
  const minSide = Math.min(w, h);
  letterDesk(reel, t, cur, w, h, minSide);
  letterStorm(reel, t, cur, w, h, minSide);
  letterWake(reel, t, cur);
  letterRoast(reel, t, cur, w, h);
  letterUpload(reel, t, cur, w, h, minSide);
  turnIntroPages(reel, t);
  letterCard(reel, t);
}
