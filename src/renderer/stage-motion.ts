import * as THREE from 'three';
import { disposeModel } from '../procgen/index.js';
import type { FxCue } from './event-fx.js';
import { actorSocket, type StageActor } from './stage-cast.js';
import { buildSystemHand } from './procgen-cast.js';
import { easeOutBack, stepped } from './tween.js';
import { fade, removeActor, setRest } from './stage-actor.js';
import { ACTOR_Z, HERO_STEPS, HERO_WALK_MS } from './stage-const.js';
import { playCues, playFx, say } from './stage-fx.js';
import { applyLantern } from './stage-layout.js';
import { anchorPoint, findByModel, firstOfKind } from './stage-resolve.js';
import type { ComicStage } from './comic-stage.js';

/** Take ownership of an actor's motion. Returns the generation; stale callbacks compare against it. */
export function claim(a: StageActor): number {
  a.gen++;
  a.lock = a.gen;
  return a.gen;
}

export function owns(a: StageActor, g: number): boolean {
  return !a.disposed && a.gen === g;
}

export function release(a: StageActor, g: number): void {
  if (a.gen === g) a.lock = 0;
}

function faceHero(stage: ComicStage, a: StageActor): { dir: number; hero: StageActor | null } {
  const hero = stage.hero();
  const dir = hero ? Math.sign(hero.base.x - a.base.x) || -1 : -1;
  a.animator.setFacing(dir > 0 ? 1 : -1);
  return { dir, hero };
}

function beginExit(a: StageActor): { g: number; start: THREE.Vector3 } | null {
  if (a.disposed || a.exiting) return null;
  a.exiting = true;
  return { g: claim(a), start: a.base.clone() };
}

function runExit(a: StageActor, run: (g: number, start: THREE.Vector3) => void): void {
  const exit = beginExit(a);
  if (exit) run(exit.g, exit.start);
}

export function rattle(stage: ComicStage, a: StageActor, ms: number, amp: number): void {
  stage.tweens.add(ms, (t) => {
    if (!a.disposed) a.offset.x = Math.sin(t * Math.PI * 10) * amp;
  }, () => {
    if (!a.disposed) a.offset.x = 0;
  });
}

export function knockback(stage: ComicStage, a: StageActor, dist: number): void {
  const hero = stage.hero();
  const dir = hero ? Math.sign(a.base.x - hero.base.x) || 1 : 1;
  stage.tweens.add(260, (t) => {
    if (a.disposed) return;
    const k = t < 0.34 ? 1 : t < 0.67 ? 0.5 : 0;
    a.offset.x = dir * dist * k;
  }, () => {
    if (!a.disposed) a.offset.x = 0;
  });
}

export function hopInPlace(stage: ComicStage, a: StageActor, height: number, ms: number): void {
  stage.tweens.add(ms, (t) => {
    if (!a.disposed) a.offset.y = Math.sin(stepped(t, 5) * Math.PI) * height;
  }, () => {
    if (!a.disposed) a.offset.y = 0;
  });
}

export function flashActor(stage: ComicStage, a: StageActor, hex: number, ms: number, delayMs: number): void {
  stage.tweens.delay(delayMs, () => {
    if (a.disposed) return;
    const saved = a.all.map((m) => (m.uniforms.uColor?.value as THREE.Color | undefined)?.getHex());
    for (const m of a.all) (m.uniforms.uColor?.value as THREE.Color | undefined)?.setHex(hex);
    stage.tweens.delay(ms, () => {
      if (a.disposed) return;
      a.all.forEach((m, i) => {
        const v = saved[i];
        if (v !== undefined) (m.uniforms.uColor?.value as THREE.Color | undefined)?.setHex(v);
      });
      // A state tint (rage, ice, stone) that started during the flash is drawn again over the restore.
      a.retint();
    });
  });
}

/**
 * Hero acting for VIBECODER_EMOTE, all short (under a second) and additive on `offset` / the body group,
 * so they never fight a walk: shock (jumps back, eyes-wide stretch, ?! and sweat), confused (head
 * tilt, ???), determined (wind-up lean), relief (sag and PHEW), panic (shaking, sweat, AAAH).
 */
export function heroEmote(stage: ComicStage, hero: StageActor, emote: string, text?: string): void {
  const head = () => actorSocket(hero, 'fx').add(new THREE.Vector3(0, 0.55, 0));
  const word = (fallback: string, color: string, big = false) => say(stage, text?.trim() || fallback, head(), color, 0.35, big ? 1.5 : 1);
  const body = hero.body;
  const base = body.scale.x;
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
        body.scale.set(base * (k < 0.34 ? 0.94 : 1), base * (k < 0.34 ? 1.12 : 1), base);
      }, () => {
        if (hero.disposed) return;
        hero.offset.set(0, 0, 0);
        body.scale.setScalar(base);
      });
      break;
    case 'confused':
      word('???', '#4cc9f0', true);
      stage.tweens.add(700, (t) => {
        if (!hero.disposed) body.rotation.z = (Math.floor(t * 6) % 2 ? 0.07 : -0.05);
      }, () => {
        if (!hero.disposed) body.rotation.z = 0;
      });
      break;
    case 'determined':
      hero.animator.setState('windup');
      word('LET\'S GO.', '#ffd166');
      stage.tweens.add(420, (t) => {
        if (!hero.disposed) body.rotation.z = t < 0.7 ? -0.08 : 0;
      }, () => {
        if (hero.disposed) return;
        body.rotation.z = 0;
        setRest(hero);
      });
      break;
    case 'relief':
      word('PHEW...', '#06d6a0');
      stage.tweens.add(600, (t) => {
        if (!hero.disposed) body.scale.set(base * (t < 0.6 ? 1.04 : 1), base * (t < 0.6 ? 0.92 : 1), base);
      }, () => {
        if (!hero.disposed) body.scale.setScalar(base);
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
    default:
      break;
  }
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

/** The hero acts out the command: walks (stepped) up to the target, strikes / reaches, walks back. */
export function heroAction(stage: ComicStage, hero: StageActor, action: string, targetId?: string): void {
  const target = targetId ? stage.actors.get(targetId) : undefined;
  if (action === 'lantern') {
    stage.tweens.add(stage.config.transitionMs, (t) => applyLantern(stage, Math.max(stage.view?.lantern ? 1 : 0, t)));
  }
  if (!target || target.disposed || target === hero) {
    // A typing nod: y −0.02 for 80 ms, two poses.
    stage.tweens.add(160, (t) => {
      if (!hero.disposed) hero.offset.y = t < 0.5 ? -0.02 : 0;
    }, () => {
      if (!hero.disposed) hero.offset.y = 0;
    });
    if (action === 'cast' || action === 'write') stage.tweens.delay(60, () => !hero.disposed && hero.animator.setState('attack'));
    return;
  }
  const g = claim(hero);
  const startX = hero.base.x;
  const dir = Math.sign(target.base.x - startX) || 1;
  const reach = action === 'collect' ? 0.35 : 1.25;
  let standX = target.base.x - dir * reach;
  if (Math.sign(standX - startX) !== dir) standX = startX;
  hero.animator.setFacing(dir > 0 ? 1 : -1);
  const walk = Math.abs(standX - startX) > 0.08;
  if (walk) hero.animator.setState('walk');
  (hero as StageActor & { moveDir?: number }).moveDir = dir;
  stage.tweens.add(walk ? HERO_WALK_MS : 16, (t) => {
    if (owns(hero, g)) hero.base.x = startX + (standX - startX) * stepped(t, HERO_STEPS);
  }, () => {
    if (!owns(hero, g)) return;
    hero.base.x = standX;
    hero.animator.setState(action === 'collect' || action === 'read' ? 'idle' : 'attack');
    if (action === 'collect' || action === 'read') hopInPlace(stage, hero, 0.1, 200);
    stage.tweens.delay(action === 'collect' ? 380 : 620, () => {
      if (!owns(hero, g)) return;
      const back = hero.base.x;
      const goHome = Math.abs(hero.home.x - back) > 0.08;
      if (goHome) {
        hero.animator.setState('walk');
        hero.animator.setFacing(hero.home.x > back ? 1 : -1);
      }
      stage.tweens.add(goHome ? HERO_WALK_MS : 16, (t) => {
        if (owns(hero, g)) hero.base.x = back + (hero.home.x - back) * stepped(t, HERO_STEPS);
      }, () => {
        if (!owns(hero, g)) return;
        hero.base.copy(hero.home);
        release(hero, g);
        hero.animator.setFacing(-1);
        setRest(hero);
      });
    });
  });
}

/**
 * ENEMY_ATTACK is the tell (the kernel emits it one tick before the damage): hold `windup`, eye locked
 * on the hero. The strike plays on the PLAYER_DAMAGED that follows (strikeFrom); with no strike within
 * 1.6 s (killed, frozen, out of reach) it relaxes back to its resting state.
 */
export function enemyAttack(stage: ComicStage, a: StageActor): void {
  if (a.exiting || a.dead || a.rest === 'petrified' || a.rest === 'frozen' || a.rest === 'hidden') return;
  stage.lastAttack = { id: a.id, at: stage.clockMs };
  const { dir, hero } = faceHero(stage, a);
  a.animator.setState('windup');
  if (hero) a.animator.setLook(dir, 0);
  const g = a.gen;
  stage.tweens.delay(1600, () => {
    if (owns(a, g) && !a.exiting && a.animator.state === 'windup') setRest(a);
  });
}

/** The strike: attack pose and a stepped lunge toward the hero (pulled back, snap out, two holds back). */
export function strikeFrom(stage: ComicStage, a: StageActor): void {
  if (a.exiting || a.dead || a.rest === 'petrified' || a.rest === 'frozen') return;
  const { dir } = faceHero(stage, a);
  a.animator.setState('attack');
  const g = claim(a);
  const lunge = a.kind === 'boss' ? 0.25 : 0.42;
  stage.tweens.add(420, (t) => {
    if (!owns(a, g)) return;
    const k = t < 0.15 ? -0.2 : t < 0.55 ? 1 : t < 0.8 ? 0.5 : 0;
    a.offset.x = dir * lunge * k;
  }, () => {
    if (!owns(a, g)) return;
    a.offset.x = 0;
    release(a, g);
  });
}

/** The view re-locked a door: the grille drops back, the padlock returns. */
export function closeDoor(stage: ComicStage, door: StageActor): void {
  if (door.disposed) return;
  const legacyGate = door.key === 'gate';
  const from = door.offset.y;
  stage.tweens.add(220, (t) => {
    if (door.disposed) return;
    if (legacyGate) door.offset.y = from * (1 - stepped(t, 3));
  }, () => {
    if (door.disposed) return;
    door.offset.y = 0;
    if (legacyGate) fade(door, Math.max(0.04, (door as StageActor & { viewAlpha?: number }).viewAlpha ?? 1));
  });
  door.animator.setState('hit');
}

export function openDoor(stage: ComicStage, door: StageActor): void {
  if (door.disposed) return;
  const legacyGate = door.key === 'gate';
  stage.tweens.add(stage.config.transitionMs, (t) => {
    if (door.disposed) return;
    const k = easeOutBack(Math.min(1, t));
    if (legacyGate) {
      door.offset.y = 0.7 * k;
      fade(door, 1 - 0.65 * Math.min(1, t));
    }
  });
  door.animator.setState('revealed');
}

export function slideToHome(stage: ComicStage, a: StageActor, bridge: boolean): void {
  const g = claim(a);
  const startX = a.base.x;
  stage.tweens.add(stage.config.transitionMs, (t) => {
    if (!owns(a, g)) return;
    const to = a.home.x;
    (a as StageActor & { moveDir?: number }).moveDir = Math.sign(to - startX);
    a.base.x = startX + (to - startX) * (bridge ? easeOutBack(Math.min(1, t)) : stepped(t, 4));
  }, () => {
    if (!owns(a, g)) return;
    a.base.copy(a.home);
    release(a, g);
  });
  if (!bridge) a.animator.setState('revealed');
}

/** Death: the animator's own collapse, then the actor leaves (or stays hidden while the view still lists it). */
export function kill(stage: ComicStage, a: StageActor, how: string, delayMs: number, dedupe: boolean): void {
  if (a.disposed || a.exiting) return;
  void dedupe;
  a.exiting = true;
  const g = claim(a);
  stage.tweens.delay(delayMs, () => {
    if (!owns(a, g)) return;
    a.animator.setState('death');
    if (how === 'rm') say(stage, 'RM!', actorSocket(a, 'fx'), '#ef476f', 0.9);
    if (delayMs > 0 && (a.kind === 'enemy' || a.kind === 'boss')) playFx(stage, 'fx.malware-death', actorSocket(a, 'fx'), { noShake: true }, a.id);
    stage.tweens.delay(950, () => finishExit(stage, a, g));
  });
}

export function suckIntoNull(stage: ComicStage, a: StageActor): void {
  runExit(a, (g, start) => {
    const hole = anchorPoint(stage, 'devnull', a);
    a.animator.setState('death');
    stage.tweens.add(650, (t) => {
      if (!owns(a, g)) return;
      const k = stepped(t, 6);
      const ang = k * Math.PI * 3;
      const r = (1 - k) * 0.25;
      a.base.set(start.x + (hole.x - start.x) * k + Math.cos(ang) * r, start.y + (hole.y - 0.5 - start.y) * k + Math.sin(ang) * r, start.z);
      a.body.scale.setScalar(Math.max(0.05, 1 - k));
    }, () => finishExit(stage, a, g));
  });
}

export function collect(stage: ComicStage, a: StageActor): void {
  runExit(a, (g, start) => {
    const hero = stage.hero();
    stage.tweens.add(320, (t) => {
      if (!owns(a, g)) return;
      const k = stepped(t, 4);
      const to = hero ? actorSocket(hero, 'fx') : start;
      a.base.set(start.x + (to.x - start.x) * k, start.y + 0.5 * k, start.z);
      a.body.scale.setScalar(Math.max(0.05, 1 + 0.4 * k - 1.3 * k * k));
    }, () => finishExit(stage, a, g));
  });
}

function finishExit(stage: ComicStage, a: StageActor, g: number): void {
  if (!owns(a, g)) return;
  const listed = (a as StageActor & { listed?: boolean }).listed;
  if (listed && stage.actors.get(a.id) === a && a.kind !== 'enemy' && a.kind !== 'boss' && a.viewState !== 'death') {
    // A thing (not malware) the view still lists: it was only moved away. Draw it back in place.
    a.exiting = false;
    a.lock = 0;
    a.offset.set(0, 0, 0);
    a.body.scale.setScalar(1);
    a.base.copy(a.home);
    a.animator.setState('revealed');
    fade(a, Math.max(0.04, (a as StageActor & { viewAlpha?: number }).viewAlpha ?? 1));
  } else if (listed && stage.actors.get(a.id) === a) {
    a.dead = true;
    a.exiting = false;
    a.lock = 0;
    a.group.visible = false;
  } else {
    removeActor(stage, a);
  }
}

export function popOut(stage: ComicStage, a: StageActor): void {
  if (a.disposed || a.exiting) return;
  a.exiting = true;
  const g = claim(a);
  stage.tweens.add(150, (t) => {
    if (owns(a, g)) a.body.scale.setScalar(Math.max(0.05, 1 - stepped(t, 3)));
  }, () => {
    if (owns(a, g)) removeActor(stage, a);
  });
}

/** Spawn performance: the System Hand draws it in (fork / cron / split), or it materialises (script / touch). */
export function playSpawn(stage: ComicStage, a: StageActor, reason: string): void {
  if (reason === 'room_enter') {
    a.awaitingSpawn = false;
    return;
  }
  if (reason === 'script') {
    a.awaitingSpawn = true;
    stage.tweens.delay(80, () => {
      if (a.disposed) return;
      a.awaitingSpawn = false;
      a.animator.setState('revealed');
    });
    playCues(stage, [{ id: 'fx.touch-materialize', anchor: 'subject', delayMs: 80 }], a, null);
    return;
  }
  const source = reason === 'boss_fork' || reason === 'virus_split' ? firstOfKind(stage, 'boss') ?? findByModel(stage, 'malware.virus') : null;
  if (source && reason === 'boss_fork' && !source.exiting) source.animator.setState('attack');
  const text = reason === 'cron_restore' ? 'CRON RESTORE!' : reason === 'virus_split' ? 'SPLIT!' : undefined;
  const beat = reason === 'cron_restore' ? 280 : 530;
  playHand(stage, a, a.home.clone(), reason, [{ id: 'fx.fork-spawn', anchor: 'hand', delayMs: beat, text }]);
}

/** The System Hand drops in from the top of the panel, scribbles, withdraws (620 ms, three beats). */
export function playHand(stage: ComicStage, spawned: StageActor | null, at: THREE.Vector3, reason: string, cues: FxCue[]): void {
  const startDelay = reason === 'boss_fork' ? 250 : 0;
  const reveal = reason === 'cron_restore' ? 280 : 530;
  if (spawned && !spawned.exiting) {
    spawned.awaitingSpawn = true;
    stage.tweens.delay(reveal, () => {
      if (spawned.disposed) return;
      spawned.awaitingSpawn = false;
      spawned.animator.setState('revealed');
    });
  }
  playCues(stage, cues, spawned, null, at);
  stage.tweens.delay(startDelay, () => {
    const hand = buildSystemHand();
    // Drawn big: the artist's hand reaching into the panel, pencil point on the spawn spot.
    hand.group.scale.setScalar(1.7);
    const top = stage.viewTop + 1.2;
    const tipY = at.y + 0.85 * 1.7;
    hand.group.position.set(at.x, top, ACTOR_Z - 0.7);
    stage.fx.add(hand.group);
    stage.tweens.add(620, (t) => {
      if (t < 0.45) {
        hand.group.position.y = top + (tipY - top) * easeOutBack(stepped(t / 0.45, 4));
      } else if (t < 0.75) {
        hand.group.position.y = tipY;
        hand.group.position.x = at.x + Math.sin(t * 40) * 0.08;
      } else {
        const out = stepped((t - 0.75) / 0.25, 3);
        hand.group.position.y = tipY + out * (top - tipY);
      }
    }, () => {
      hand.animator.dispose();
      hand.group.removeFromParent();
      disposeModel(hand.model);
    });
  });
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
