import type * as THREE from 'three';
import { disposeModel } from '../procgen/index.js';
import type { FxCue } from './event-fx.js';
import { actorSocket, type StageActor } from './stage-cast.js';
import { buildSystemHand } from './procgen-cast.js';
import { easeOutBack, stepped } from './tween.js';
import { flightPath, smootherstep } from './stage-flight-path.js';
import { claim, fade, owns, release, removeActor, setRest } from './stage-actor.js';
import { setFirewallOpenProgress } from './stage-door-rig.js';
import { ACTOR_Z, HERO_STEPS, HERO_WALK_MS } from './stage-const.js';
import { playCues, playFx, say } from './stage-fx.js';
import { applyLantern, placeX } from './stage-layout.js';
import { launchEnemyProjectile } from './stage-projectile.js';
import { anchorPoint, findByModel, firstOfKind } from './stage-resolve.js';
import { HERO_HALF_YAW, poseHeroWalk, resetHeroPose, restoreActorBodyPose, setActorBodyScale } from './stage-hero-turn.js';
import type { ComicStage } from './comic-stage.js';

export { claim, owns, release };

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
    if (a.disposed || (a.kind === 'vibecoder' && stage.isLevelTransitioning())) return;
    a.offset.y = Math.sin(stepped(t, 5) * Math.PI) * height;
  }, () => {
    if (!a.disposed && !(a.kind === 'vibecoder' && stage.isLevelTransitioning())) a.offset.y = 0;
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
    if (!owns(hero, g)) return;
    hero.base.x = startX + (standX - startX) * stepped(t, HERO_STEPS);
    if (walk) poseHeroWalk(hero, dir, t);
  }, () => {
    if (!owns(hero, g)) return;
    hero.base.x = standX;
    if (walk) hero.body.rotation.y = hero.baseRot[1] + (dir < 0 ? 1 : -1) * HERO_HALF_YAW;
    hero.animator.setState(action === 'collect' || action === 'read' ? 'idle' : 'attack');
    if (action === 'collect' || action === 'read') hopInPlace(stage, hero, 0.1, 200);
    stage.tweens.delay(action === 'collect' ? 380 : 620, () => {
      if (!owns(hero, g)) return;
      const back = hero.base.x;
      const goHome = Math.abs(hero.home.x - back) > 0.08;
      const backDir: 1 | -1 = hero.home.x > back ? 1 : -1;
      if (goHome) {
        hero.animator.setState('walk');
        hero.animator.setFacing(backDir);
      }
      stage.tweens.add(goHome ? HERO_WALK_MS : 16, (t) => {
        if (!owns(hero, g)) return;
        hero.base.x = back + (hero.home.x - back) * stepped(t, HERO_STEPS);
        if (goHome) poseHeroWalk(hero, backDir, t);
      }, () => {
        if (!owns(hero, g)) return;
        hero.base.copy(hero.home);
        release(hero, g);
        resetHeroPose(hero);
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
function setScaledBody(a: StageActor, factor: number): void {
  setActorBodyScale(a, factor, factor, factor);
}

function restoreBodyTransform(a: StageActor): void {
  restoreActorBodyPose(a);
}

export function heroFlinch(stage: ComicStage, hero: StageActor): void {
  const body = hero.body;
  const restZ = hero.baseRot[2];
  stage.tweens.add(FLINCH_MS, (t) => {
    if (hero.disposed) return;
    const pose = FLINCH_POSES[Math.min(FLINCH_POSES.length - 1, Math.floor(t * FLINCH_POSES.length))];
    hero.offset.x = pose[0];
    body.rotation.z = restZ + pose[1];
  }, () => {
    if (hero.disposed) return;
    hero.offset.x = 0;
    body.rotation.z = restZ;
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
  if (!stage.reducedMotion.on) flashActor(stage, a, 0xe8002b, 160, 0);
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

/** The strike: attack pose, red-Matrix fireball projectile, and a stepped lunge toward the hero. */
export function strikeFrom(stage: ComicStage, a: StageActor): void {
  if (a.exiting || a.dead || a.rest === 'petrified' || a.rest === 'frozen') return;
  const { dir } = faceHero(stage, a);
  tells.delete(a);
  a.animator.setState('attack');
  launchEnemyProjectile(stage, a);
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

function tweenDoorState(stage: ComicStage, door: StageActor, open: boolean): void {
  if (door.disposed) return;
  door.offset.y = 0;
  fade(door, Math.max(0.04, (door as StageActor & { viewAlpha?: number }).viewAlpha ?? 1));
  if (door.modelId === 'door.firewall') {
    setFirewallOpenProgress(door, open ? 0 : 1);
    stage.tweens.add(open ? stage.config.transitionMs : 220, (t) => {
      const k = stepped(Math.min(1, t), open ? 4 : 3);
      if (!door.disposed) setFirewallOpenProgress(door, open ? k : 1 - k);
    }, () => {
      if (!door.disposed) setFirewallOpenProgress(door, open ? 1 : 0);
    });
  }
  door.animator.setState(open ? 'revealed' : 'hit');
}

/** The view re-locked a door: keep grounded at y = 0 and close any firewall grille bars. */
export function closeDoor(stage: ComicStage, door: StageActor): void {
  tweenDoorState(stage, door, false);
}

/** Opens a door in place (grounded at y = 0, full opacity); only `door.firewall` retracts its inner spear grille. */
export function openDoor(stage: ComicStage, door: StageActor): void {
  tweenDoorState(stage, door, true);
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
      setScaledBody(a, Math.max(0.05, 1 - k));
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
      setScaledBody(a, Math.max(0.05, 1 + 0.4 * k - 1.3 * k * k));
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
    restoreBodyTransform(a);
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
    if (owns(a, g)) setScaledBody(a, Math.max(0.05, 1 - stepped(t, 3)));
  }, () => {
    if (owns(a, g)) removeActor(stage, a);
  });
}

/** Which way an actor enters: `appear` is the classic spawn performance, `glide` flies it in from the panel edge. */
export type SpawnEntrance = 'appear' | 'glide';

/** Optional design-space launch origin when a script pickup tumbles out from behind a prop. */
export interface SpawnOrigin {
  x?: number;
  y?: number;
}

/** Entrance of a script spawn. `glide` flies the actor from the screen-right panel edge to its slot along a smooth winding path (`flyTo`). */
export function playEntrance(stage: ComicStage, a: StageActor, reason: string, entrance: SpawnEntrance | undefined, from?: SpawnOrigin): void {
  if (entrance !== 'glide') {
    playSpawn(stage, a, reason, from);
    return;
  }
  const g = claim(a);
  const fromX = Math.min(stage.panelRight - 0.45, a.home.x - 1.2);
  a.awaitingSpawn = false;
  a.base.set(fromX, a.home.y + 0.9, a.home.z);
  a.animator.setState('walk');
  flyTo(stage, a, a.home.clone(), 3200, () => setRest(a), g);
}

/** Natural facing of every model: screen-right (-x). A negative `scale.x` on the body mirrors it to face screen-left (+x). */
function faceDir(a: StageActor, dir: number): void {
  if (dir !== 0) a.body.scale.x = Math.abs(a.scaleVec[0]) * (dir > 0 ? -1 : 1);
}

/** Turn to look at the hero (the way he is from here); keeps the facing when there is no hero. */
function faceHeroNow(stage: ComicStage, a: StageActor): void {
  const hero = stage.hero();
  if (hero && hero !== a) faceDir(a, Math.sign(hero.base.x - a.base.x));
}

/** How fast the bank angle follows the flight's horizontal speed (per second; higher is snappier). */
const FLY_LEAN_RATE = 7;

/**
 * Flight: a continuous, smooth path (`flightPath`: an S-winding spline, never a straight slide) walked with a
 * quintic ease so it lifts off, cruises and lands softly. It is the one motion that is not stepped: it moves
 * every frame, because a stepped glide reads as teleporting. A small sway and bob ride on top and fade at both
 * ends, the body banks into the way it is moving (the bank is low-passed, so it never snaps), and a slight
 * stretch follows the speed. The body mirrors once to face the way it travels (models face screen-right at
 * rest) and turns to the hero on arrival. It takes the actor's motion (`claim`), or continues claim `gen` when
 * the caller already holds it, and lets go on arrival unless `hold` (a hovering carrier keeps the claim). A
 * newer motion on the actor cancels it quietly.
 */
export function flyTo(stage: ComicStage, a: StageActor, to: THREE.Vector3, ms: number, then?: () => void, gen?: number, hold = false): void {
  if (a.disposed) return;
  const g = gen ?? claim(a);
  const from = a.base.clone();
  const dir = Math.sign(to.x - from.x);
  faceDir(a, dir);
  const path = flightPath(from, to);
  const restZ = a.baseRot[2];
  const seconds = ms / 1000;
  let lastT = 0;
  let lean = 0;
  stage.tweens.add(ms, (t) => {
    if (!owns(a, g)) return;
    const k = smootherstep(t);
    const before = a.base.x;
    a.base.copy(path.getPointAt(k));
    const dt = Math.max(1e-4, (t - lastT) * seconds);
    lastT = t;
    const vx = (a.base.x - before) / dt;
    lean += (Math.max(-0.3, Math.min(0.3, -vx * 0.09)) - lean) * (1 - Math.exp(-dt * FLY_LEAN_RATE));
    const env = Math.sin(Math.PI * k);
    const clock = t * seconds;
    a.offset.x = Math.sin(clock * 5.6 + 1.3) * 0.05 * env;
    a.offset.y = Math.sin(clock * 8.2) * 0.06 * env;
    a.body.rotation.z = restZ + lean;
    setActorBodyScale(a, 1, 1 + 0.05 * env, 1);
  }, () => {
    if (!owns(a, g)) return;
    a.base.copy(to);
    a.offset.set(0, 0, 0);
    a.body.rotation.z = restZ;
    setActorBodyScale(a);
    faceHeroNow(stage, a);
    if (!hold) release(a, g);
    then?.();
  });
}


/** Drops a floor item pickup (e.g. Tube Transistor) from above onto the ground with a stepped comic bounce. */
function dropToGround(stage: ComicStage, a: StageActor, from?: SpawnOrigin): void {
  const g = claim(a);
  const restRotZ = typeof a.body.userData.restRotZ === 'number' ? a.body.userData.restRotZ : a.body.rotation.z;
  const dropH = typeof from?.y === 'number' && Number.isFinite(from.y) ? Math.max(0.2, from.y) : 1.15;
  const startDx = typeof from?.x === 'number' && Number.isFinite(from.x) ? placeX(stage, from.x) - a.home.x : 0;
  const startSpin = startDx === 0 ? -0.55 : Math.sign(startDx) * 0.9;
  a.awaitingSpawn = false;
  a.offset.set(startDx, dropH, 0);
  a.body.rotation.z = restRotZ + startSpin;
  playCues(stage, [{ id: 'fx.touch-materialize', anchor: 'subject', delayMs: 220, text: 'DROP!' }], a, null);
  stage.tweens.add(460, (t) => {
    if (!owns(a, g)) return;
    const k = stepped(t, 6);
    if (k < 0.55) {
      const u = k / 0.55;
      a.offset.x = startDx * (1 - u);
      a.offset.y = dropH * (1 - u * u);
      a.body.rotation.z = restRotZ + startSpin * (1 - u);
    } else if (k < 0.82) {
      const u = (k - 0.55) / 0.27;
      a.offset.x = 0;
      a.offset.y = Math.sin(u * Math.PI) * 0.22;
      a.body.rotation.z = restRotZ + Math.sin(u * Math.PI) * 0.16;
    } else {
      const u = (k - 0.82) / 0.18;
      a.offset.x = 0;
      a.offset.y = Math.sin(u * Math.PI) * 0.06;
      a.body.rotation.z = restRotZ;
    }
  }, () => {
    if (!owns(a, g)) return;
    a.offset.set(0, 0, 0);
    a.body.rotation.z = restRotZ;
    a.animator.setState('revealed');
    release(a, g);
  });
}

/** Spawn performance: the System Hand draws it in (fork / cron / split), or it materialises (script / touch). */
export function playSpawn(stage: ComicStage, a: StageActor, reason: string, from?: SpawnOrigin): void {
  if (reason === 'room_enter') {
    a.awaitingSpawn = false;
    return;
  }
  if (reason === 'script') {
    // Paired FILE_CREATED + ENTITY_SPAWNED for the same actor in one batch must not trigger the drop animation twice.
    const stamped = a as StageActor & { scriptSpawnAt?: number };
    if (stamped.scriptSpawnAt === stage.clockMs) return;
    stamped.scriptSpawnAt = stage.clockMs;
    if (a.kind === 'pickup' && a.modelId.startsWith('item.')) {
      dropToGround(stage, a, from);
      return;
    }
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
