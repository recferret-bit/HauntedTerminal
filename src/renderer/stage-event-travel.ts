import type { KernelEvent } from '../contracts/events.js';
import { actorSocket, type StageActor } from './stage-cast.js';
import { setRest } from './stage-actor.js';
import { FLOORS } from './stage-const.js';
import { playCard, playFx, say } from './stage-fx.js';
import { applyLantern, syncFlood } from './stage-layout.js';
import { claim, hopInPlace, owns, rattle, release, slideToHome, suckIntoNull } from './stage-motion.js';
import { anchorPoint, findByModel } from './stage-resolve.js';
import { stepped } from './tween.js';
import type { ComicStage } from './comic-stage.js';

export function handleTravelEvent(stage: ComicStage, ev: KernelEvent, subject: StageActor | null): boolean {
  switch (ev.type) {
    case 'LANTERN_REVEAL':
      onLanternReveal(stage);
      return true;
    case 'ROOM_TRANSITION':
      onRoomTransition(stage, ev);
      return true;
    case 'PERMISSION_DENIED_RATTLE':
      if (subject) rattle(stage, subject, 320, 0.06);
      return true;
    case 'INODE_MODE_CHANGED':
      // An inode id names no actor. Petrify and door state come from the view (applyActor / syncOverlays),
      // so a chmod on some other file never opens a gate or petrifies a statue by guess.
      return true;
    case 'OBJECT_MOVED':
      onObjectMoved(stage, ev, subject);
      return true;
    case 'FLOOR_CLEARED':
      onFloorCleared(stage, ev);
      return true;
    case 'FLOOR_ENTERED':
      onFloorEntered(stage, ev);
      return true;
    case 'GAME_ENDED':
      playCard(stage, 'THE END // YOU WOKE UP', `RANK ${ev.rank}`, `${Math.round(ev.timeSec)}s  ${ev.commands} commands`, '#ffd166', 4200);
      return true;
    default:
      return false;
  }
}

function onLanternReveal(stage: ComicStage): void {
  stage.revealArmed = stage.clockMs + 1500;
  stage.tweens.add(stage.config.transitionMs, (t) => applyLantern(stage, t));
  for (const a of stage.actors.values()) {
    if (a.exiting || a.kind === 'vibecoder') continue;
    const alpha = (a as StageActor & { viewAlpha?: number }).viewAlpha ?? 1;
    if (a.rest === 'hidden' || alpha < 0.5) stage.tweens.delay(80, () => !a.disposed && a.animator.setState('revealed'));
  }
}

function onRoomTransition(stage: ComicStage, ev: Extract<KernelEvent, { type: 'ROOM_TRANSITION' }>): void {
  const hero = stage.hero();
  if (!hero) return;
  if (ev.viaSymlinkLoop) {
    say(stage, 'ELOOP! MIRROR TRAP!', actorSocket(hero, 'fx'), '#4cc9f0', 1.1);
    stage.floodPercent = Math.min(85, stage.floodPercent + 18);
    syncFlood(stage);
    return;
  }
  const smash = ev.upwardPanelsSmashed >= 3;
  const g = claim(hero);
  const startX = hero.base.x;
  const dur = smash ? 504 : stage.config.transitionMs;
  hero.animator.setState(smash ? 'attack' : 'walk');
  // The new panel's home is known once syncRoom ran (same call stack, before the first update).
  // Landing on the same spot: he hops in over the gutter from the screen-left side instead.
  let from: number | null = null;
  stage.tweens.add(dur, (t) => {
    if (!owns(hero, g)) return;
    if (from === null) from = !smash && Math.abs(hero.home.x - startX) < 0.3 ? hero.home.x + 1.1 : startX;
    const k = smash ? stepped(t, 6) : t;
    hero.base.x = from + (hero.home.x - from) * k;
    hero.base.y = hero.home.y;
    hero.offset.y = Math.sin(k * Math.PI) * (smash ? 1.1 : 0.45);
  }, () => {
    if (!owns(hero, g)) return;
    hero.offset.y = 0;
    release(hero, g);
    hero.base.copy(hero.home);
    setRest(hero);
    if (stage.floodPercent > 1) playFx(stage, 'fx.flood-splash', anchorPoint(stage, 'flood', null), {}, 'flood');
  });
}

function onObjectMoved(stage: ComicStage, ev: Extract<KernelEvent, { type: 'OBJECT_MOVED' }>, subject: StageActor | null): void {
  if (ev.suckedIntoNull) {
    const hole = findByModel(stage, 'door.devnull');
    if (hole) {
      stage.tweens.add(650, (t) => !hole.disposed && hole.body.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.45), () => !hole.disposed && hole.body.scale.setScalar(1));
    }
    say(stage, '/DEV/NULL VORTEX!', anchorPoint(stage, 'devnull', subject), '#b5179e', 0.7);
    if (subject && subject !== hole && subject.key === 'crate') suckIntoNull(stage, subject);
  } else if (subject) {
    slideToHome(stage, subject, ev.formedBridge);
    if (ev.formedBridge) stage.tweens.delay(340, () => say(stage, 'MV -> BRIDGE FORMED!', subject.group.position.clone(), '#ffd166', 0.5));
  }
}

function onFloorCleared(stage: ComicStage, ev: Extract<KernelEvent, { type: 'FLOOR_CLEARED' }>): void {
  say(stage, ev.speedrunBonus ? 'FLOOR CLEARED // RANK S!' : 'FLOOR CLEARED!', anchorPoint(stage, 'panel', null), '#06d6a0', 0.2);
  const hero = stage.hero();
  if (hero) hopInPlace(stage, hero, 0.3, 300);
}

function onFloorEntered(stage: ComicStage, ev: Extract<KernelEvent, { type: 'FLOOR_ENTERED' }>): void {
  const floor = FLOORS[ev.floorId] ?? FLOORS[stage.currentFloor] ?? FLOORS[1]!;
  const accent = `#${floor.accent.toString(16).padStart(6, '0')}`;
  const path = ev.path || floor.path;
  const title = (ev.title || floor.name).replace(/^FLOOR\s*0?\d+\s*\/\/\s*/i, '').toUpperCase();
  playCard(stage, `ENTERING FLOOR ${ev.floorId}: ${path}`, title, path, accent);
}
