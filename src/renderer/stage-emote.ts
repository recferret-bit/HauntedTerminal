import * as THREE from 'three';
import { actorSocket, type StageActor } from './stage-cast.js';
import { setRest } from './stage-actor.js';
import { playFx, say, triggerShake } from './stage-fx.js';
import { setActorBodyScale } from './stage-hero-turn.js';
import { hopInPlace } from './stage-motion.js';
import { anchorPoint } from './stage-resolve.js';
import { stepped } from './tween.js';
import type { ComicStage } from './comic-stage.js';

/**
 * Hero acting for VIBECODER_EMOTE, all short (under a second) and additive on `offset` / the body group,
 * so they never fight a walk: shock (jumps back, eyes-wide stretch, ?! and sweat), confused (head
 * tilt, ???), determined (wind-up lean), relief (sag and PHEW), panic (shaking, sweat, AAAH), shout
 * (big FIGHT!-style lettering over the panel, a stretch, a hop and a shake).
 */
export function heroEmote(stage: ComicStage, hero: StageActor, emote: string, text?: string): void {
  const head = () => actorSocket(hero, 'fx').add(new THREE.Vector3(0, 0.55, 0));
  const word = (fallback: string, color: string, big = false) => say(stage, text?.trim() || fallback, head(), color, 0.35, big ? 1.5 : 1);
  const body = hero.body;
  const restZ = hero.baseRot[2];
  switch (emote) {
    case 'shock':
      hero.animator.setState('hit');
      word('?!', '#ffd166', true);
      sweat(stage, hero, 3);
      stage.tweens.add(520, (t) => {
        if (hero.disposed) return;
        const k = stepped(t, 6);
        hero.offset.x = 0.32 * (t < 0.5 ? stepped(t / 0.5, 3) : 1 - stepped((t - 0.5) / 0.5, 3));
        hero.offset.y = Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.26;
        // Eyes-wide beat: a two-pose stretch.
        setActorBodyScale(hero, k < 0.34 ? 0.94 : 1, k < 0.34 ? 1.12 : 1, 1);
      }, () => {
        if (hero.disposed) return;
        hero.offset.set(0, 0, 0);
        setActorBodyScale(hero);
      });
      break;
    case 'confused':
      word('???', '#4cc9f0', true);
      stage.tweens.add(700, (t) => {
        if (!hero.disposed) body.rotation.z = restZ + (Math.floor(t * 6) % 2 ? 0.07 : -0.05);
      }, () => {
        if (!hero.disposed) body.rotation.z = restZ;
      });
      break;
    case 'determined':
      hero.animator.setState('windup');
      word('LET\'S GO.', '#ffd166');
      stage.tweens.add(420, (t) => {
        if (!hero.disposed) body.rotation.z = restZ + (t < 0.7 ? -0.08 : 0);
      }, () => {
        if (hero.disposed) return;
        body.rotation.z = restZ;
        setRest(hero);
      });
      break;
    case 'relief':
      word('PHEW...', '#06d6a0');
      stage.tweens.add(600, (t) => {
        if (!hero.disposed) setActorBodyScale(hero, t < 0.6 ? 1.04 : 1, t < 0.6 ? 0.92 : 1, 1);
      }, () => {
        if (!hero.disposed) setActorBodyScale(hero);
      });
      break;
    case 'panic':
      hero.animator.setState('hit');
      word('AAAH!', '#ef476f', true);
      sweat(stage, hero, 4);
      stage.tweens.add(720, (t) => {
        if (!hero.disposed) hero.offset.x = (Math.floor(t * 18) % 2 ? 0.05 : -0.05) * (1 - t * 0.5);
      }, () => {
        if (!hero.disposed) hero.offset.x = 0;
      });
      break;
    case 'shout':
      shout(stage, hero, text?.trim() || 'HELLO?!');
      break;
    default:
      break;
  }
}

/**
 * The hero shouts into the dark: the FIGHT! banner preset with its word replaced, drawn big over the
 * panel, one camera shake, and a stretch-and-hop of the hero on the same 12 fps beat. The stage has no
 * sound of its own; the sound cue belongs to the app bus (`src/audio/`).
 */
function shout(stage: ComicStage, hero: StageActor, word: string): void {
  stage.strikeLightning(anchorPoint(stage, 'panel-floor', hero), 5.2, undefined, 'shout');
  playFx(stage, 'fx.fight', anchorPoint(stage, 'panel', null), { text: word, scale: 1.2, noShake: true }, 'shout');
  triggerShake(stage, 1.4);
  hopInPlace(stage, hero, 0.12, 300);
  const body = hero.body;
  const restZ = hero.baseRot[2];
  stage.tweens.add(640, (t) => {
    if (hero.disposed) return;
    const k = stepped(t, 8);
    // Chest out, then a held lean back, then settle.
    setActorBodyScale(hero, k < 0.25 ? 0.95 : 1, k < 0.25 ? 1.1 : k < 0.7 ? 1.04 : 1, 1);
    body.rotation.z = restZ + (k < 0.25 ? 0 : k < 0.7 ? 0.06 : 0);
  }, () => {
    if (hero.disposed) return;
    setActorBodyScale(hero);
    body.rotation.z = restZ;
  });
}

/** Sweat drops flung off the hero's head in stepped arcs. */
function sweat(stage: ComicStage, hero: StageActor, n: number): void {
  const from = actorSocket(hero, 'fx').add(new THREE.Vector3(0, 0.6, -0.7));
  for (let i = 0; i < n; i++) {
    const mat = new THREE.SpriteMaterial({ map: dropTexture(), transparent: true, depthTest: false, toneMapped: false });
    const drop = new THREE.Sprite(mat);
    drop.scale.set(0.13, 0.17, 1);
    drop.renderOrder = 6;
    drop.position.copy(from);
    stage.fx.add(drop);
    const dir = (i % 2 ? 1 : -1) * (0.35 + 0.15 * i);
    stage.tweens.add(520, (t) => {
      const k = stepped(t, 5);
      drop.position.set(from.x + dir * k, from.y + Math.sin(k * Math.PI) * 0.35 - k * 0.25, from.z);
      mat.opacity = t > 0.7 ? 0.5 : 1;
    }, () => {
      drop.removeFromParent();
      mat.map?.dispose();
      mat.dispose();
    });
  }
}

/** A sweat drop (emote art, stays in the canvas): cyan teardrop with an ink outline. */
function dropTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 48;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.beginPath();
    ctx.moveTo(24, 4);
    ctx.quadraticCurveTo(44, 36, 40, 46);
    ctx.arc(24, 44, 16, 0, Math.PI);
    ctx.quadraticCurveTo(4, 36, 24, 4);
    ctx.fillStyle = '#9be7ff';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#110e1b';
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
