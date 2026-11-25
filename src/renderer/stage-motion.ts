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

/** The hero acts out the command: walks (stepped) up to the target, strikes / reaches, walks back. */
export function heroAction(stage: ComicStage, hero: StageActor, action: string, targetId?: string): void {
  const target = targetId ? stage.actors.get(targetId) : undefined;
  if (action === 'lantern') {
    stage.tweens.add(stage.config.transitionMs, (t) => applyLantern(stage, Math.max(stage.view?.lantern ? 1 : 0, t)));
  }
  if (!target || target.disposed || target === hero) {
    hopInPlace(stage, hero, 0.16, 220);
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

const FLINCH_MS = 500;
/** One pose per 12 fps frame (83 ms): [offset.x in world units (58 px each), lean in radians]. Snap back, recoil twice, hold the lean, ease off. */
const FLINCH_POSES: ReadonlyArray<readonly [number, number]> = [
  [0.26, 0.2],
  [0.08, 0.06],
  [0.26, 0.2],
  [0.2, 0.18],
  [0.2, 0.18],
  [0.1, 0.08],
];

/**
 * The hero's answer to a command that failed: two recoil nudges (about 15 px) and a lean (about 11 degrees) held
 * a beat, 500 ms on the 12 fps beat, additive
 * on `offset.x` and the body's z rotation. No animator state, no claim, no walk (a failed command never looks like a cast).
 */
export function heroFlinch(stage: ComicStage, hero: StageActor): void {
  const body = hero.body;
  stage.tweens.add(FLINCH_MS, (t) => {
    if (hero.disposed) return;
    const pose = FLINCH_POSES[Math.min(FLINCH_POSES.length - 1, Math.floor(t * FLINCH_POSES.length))];
    hero.offset.x = pose[0];
    body.rotation.z = pose[1];
  }, () => {
    if (hero.disposed) return;
    hero.offset.x = 0;
    body.rotation.z = 0;
  });
}

/** Stamp of each actor's live tell: the enemy-turn count it was told on, and a serial for its safety fallback. */
const tells = new WeakMap<StageActor, { turn: number; serial: number }>();
const enemyTurns = new WeakMap<ComicStage, number>();
let tellSerial = 0;
/** A pose can never stick: a tell relaxes by itself after this long. */
const TELL_FALLBACK_MS = 35000;

/**
 * ENEMY_ATTACK is the tell, told on one enemy turn; the strike lands on a later enemy turn, with the
 * player's turn (up to 30 s) between. Hold `windup`, eye locked on the hero, until the strike
 * (PLAYER_DAMAGED -> strikeFrom), the battle ends or a second enemy turn passes without it
 * (battleTurnChanged), the enemy is killed, frozen or leaves (the guards), or the 35 s fallback.
 */
export function enemyAttack(stage: ComicStage, a: StageActor): void {
  if (a.exiting || a.dead || a.rest === 'petrified' || a.rest === 'frozen' || a.rest === 'hidden') return;
  stage.lastAttack = { id: a.id, at: stage.clockMs };
  const { dir, hero } = faceHero(stage, a);
  a.animator.setState('windup');
  if (hero) a.animator.setLook(dir, 0);
  const stamp = { turn: enemyTurns.get(stage) ?? 0, serial: ++tellSerial };
  tells.set(a, stamp);
  const g = a.gen;
  stage.tweens.delay(TELL_FALLBACK_MS, () => {
    if (owns(a, g) && !a.exiting && tells.get(a) === stamp && a.animator.state === 'windup') setRest(a);
  });
}

function relaxTell(a: StageActor): void {
  tells.delete(a);
  if (!a.disposed && !a.exiting && !a.dead && a.animator.state === 'windup') setRest(a);
}

/**
 * A BATTLE_TURN / BATTLE_ENDED reached the stage. The player's turn keeps every tell; a new enemy turn
 * relaxes the tells that were not struck on the previous one; the end of the battle relaxes them all.
 */
export function battleTurnChanged(stage: ComicStage, ev: { type: 'BATTLE_TURN'; actor: 'player' | 'enemy' } | { type: 'BATTLE_ENDED' }): void {
  if (ev.type === 'BATTLE_TURN' && ev.actor !== 'enemy') return;
  const turn = ev.type === 'BATTLE_ENDED' ? 0 : (enemyTurns.get(stage) ?? 0) + 1;
  enemyTurns.set(stage, turn);
  for (const a of stage.actors.values()) {
    const tell = tells.get(a);
    if (tell && (ev.type === 'BATTLE_ENDED' || tell.turn < turn - 1)) relaxTell(a);
  }
}

/** The strike: attack pose and a stepped lunge toward the hero (pulled back, snap out, two holds back). */
export function strikeFrom(stage: ComicStage, a: StageActor): void {
  if (a.exiting || a.dead || a.rest === 'petrified' || a.rest === 'frozen') return;
  const { dir } = faceHero(stage, a);
  tells.delete(a);
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

/** Which way an actor enters: `appear` is the classic spawn performance, `glide` slides it in from the panel edge. */
export type SpawnEntrance = 'appear' | 'glide';

/** Entrance of a script spawn. `glide` tweens the actor from the screen-right panel edge to its slot, stepped at 8 fps. */
export function playEntrance(stage: ComicStage, a: StageActor, reason: string, entrance: SpawnEntrance | undefined): void {
  if (entrance !== 'glide') {
    playSpawn(stage, a, reason);
    return;
  }
  const g = claim(a);
  const fromX = Math.min(stage.panelRight - 0.45, a.home.x - 1.2);
  a.awaitingSpawn = false;
  a.base.set(fromX, a.home.y + 0.9, a.home.z);
  a.animator.setState('walk');
  flyTo(stage, a, a.home.clone(), 1500, () => setRest(a), g);
}

/** Natural facing of every model: screen-right (-x). A negative `scale.x` on the body mirrors it to face screen-left (+x). */
function faceDir(a: StageActor, dir: number): void {
  if (dir !== 0) a.body.scale.x = Math.abs(a.body.scale.x) * (dir > 0 ? -1 : 1);
}

/** Turn to look at the hero (the way he is from here); keeps the facing when there is no hero. */
export function faceHeroNow(stage: ComicStage, a: StageActor): void {
  const hero = stage.hero();
  if (hero && hero !== a) faceDir(a, Math.sign(hero.base.x - a.base.x));
}

const FLY_FPS = 8;

/**
 * Flight: a quadratic Bezier arc from where `a` is to `to` (the control point sits above the midpoint and
 * pulled back, so the path swoops and settles), eased in and out, sampled at 8 fps through `stepped` like
 * every comic motion. A small bob rides on top, the body leans into the flight and mirrors to face the way
 * it travels (models face screen-right at rest), then turns to the hero on arrival. It takes the actor's
 * motion (`claim`), or continues claim `gen` when the caller already holds it, and lets go on arrival
 * unless `hold` (a hovering carrier keeps the claim). A newer motion on the actor cancels it quietly.
 */
export function flyTo(stage: ComicStage, a: StageActor, to: THREE.Vector3, ms: number, then?: () => void, gen?: number, hold = false): void {
  if (a.disposed) return;
  const g = gen ?? claim(a);
  const from = a.base.clone();
  const dx = to.x - from.x;
  const dir = Math.sign(dx);
  faceDir(a, dir);
  const run = Math.hypot(dx, to.y - from.y);
  const lift = Math.min(1.5, 0.5 + run * 0.28);
  const ctrl = new THREE.Vector3((from.x + to.x) / 2 - dir * Math.min(0.5, run * 0.18), Math.max(from.y, to.y) + lift, (from.z + to.z) / 2);
  const frames = Math.max(2, Math.round((ms / 1000) * FLY_FPS));
  const baseScale = Math.abs(a.body.scale.x);
  stage.tweens.add(ms, (t) => {
    if (!owns(a, g)) return;
    const s = stepped(t, frames);
    const k = s * s * (3 - 2 * s);
    const u = 1 - k;
    a.base.set(
      u * u * from.x + 2 * u * k * ctrl.x + k * k * to.x,
      u * u * from.y + 2 * u * k * ctrl.y + k * k * to.y,
      u * u * from.z + 2 * u * k * ctrl.z + k * k * to.z,
    );
    const frame = Math.floor(t * frames);
    const mid = Math.sin(s * Math.PI);
    a.offset.y = s >= 1 ? 0 : (frame % 2 ? 0.045 : -0.02) * (0.4 + mid);
    a.body.rotation.z = -dir * 0.16 * mid;
    a.body.scale.y = baseScale * (1 + 0.04 * mid);
  }, () => {
    if (!owns(a, g)) return;
    a.base.copy(to);
    a.offset.y = 0;
    a.body.rotation.z = 0;
    a.body.scale.y = baseScale;
    faceHeroNow(stage, a);
    if (!hold) release(a, g);
    then?.();
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
