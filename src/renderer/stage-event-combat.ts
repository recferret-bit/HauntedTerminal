import type { KernelEvent } from '../contracts/events.js';
import { actorSocket, type StageActor } from './stage-cast.js';
import { setRest } from './stage-actor.js';
import { playTear, say } from './stage-fx.js';
import { claim, collect, enemyAttack, flashActor, hopInPlace, kill, knockback, release, suckIntoNull } from './stage-motion.js';
import { anchorPoint, childrenOf } from './stage-resolve.js';
import { syncOverlays } from './stage-sync.js';
import type { ComicStage } from './comic-stage.js';

export function handleCombatEvent(stage: ComicStage, ev: KernelEvent, subject: StageActor | null): boolean {
  switch (ev.type) {
    case 'PROC_SIGNALED':
      onProcSignaled(stage, ev, subject);
      return true;
    case 'PLAYER_DAMAGED':
      onPlayerDamaged(stage, ev);
      return true;
    case 'ENEMY_ATTACK':
      if (subject) enemyAttack(stage, subject);
      return true;
    case 'ENEMY_HIT':
      onEnemyHit(stage, ev, subject);
      return true;
    case 'ENEMY_KILLED':
      onEnemyKilled(stage, ev, subject);
      return true;
    case 'ENEMY_STATE':
      onEnemyState(stage, ev, subject);
      return true;
    case 'PICKUP_COLLECTED':
      onPickup(stage, ev, subject);
      return true;
    case 'FILE_REMOVED':
      if (subject && subject.kind !== 'vibecoder') kill(stage, subject, 'rm', 0, true);
      return true;
    case 'PLAYER_RESPAWNED':
      onPlayerRespawned(stage, ev);
      return true;
    default:
      return false;
  }
}

function onProcSignaled(stage: ComicStage, ev: Extract<KernelEvent, { type: 'PROC_SIGNALED' }>, subject: StageActor | null): void {
  if (!subject) return;
  if (ev.outcome === 'FROZEN') {
    subject.rest = 'frozen';
    setRest(subject);
  } else if (ev.outcome === 'TRAPPED_ENRAGED') {
    subject.rest = 'enraged';
    setRest(subject);
  } else {
    kill(stage, subject, 'SIGKILL', 0, false);
    for (const child of childrenOf(stage, subject)) kill(stage, child, 'SIGKILL', 120, false);
  }
}

function onPlayerDamaged(stage: ComicStage, ev: Extract<KernelEvent, { type: 'PLAYER_DAMAGED' }>): void {
  const hero = stage.hero();
  if (!hero) return;
  flashActor(stage, hero, 0xef476f, 240, 250);
  if (ev.hpRemaining <= 0) stage.tweens.delay(450, () => playTear(stage, 'SEGFAULT'));
}

function onEnemyHit(stage: ComicStage, ev: Extract<KernelEvent, { type: 'ENEMY_HIT' }>, subject: StageActor | null): void {
  if (!subject || subject.exiting) return;
  subject.displayHp = Math.max(0, ev.hpRemaining);
  subject.animator.setState('hit');
  flashActor(stage, subject, 0xf4f1ea, 120, 0);
  knockback(stage, subject, 0.14);
  syncOverlays(stage);
}

function onEnemyKilled(stage: ComicStage, ev: Extract<KernelEvent, { type: 'ENEMY_KILLED' }>, subject: StageActor | null): void {
  if (!subject) return;
  if (ev.how === 'devnull') suckIntoNull(stage, subject);
  else kill(stage, subject, ev.how, 0, true);
}

function onEnemyState(stage: ComicStage, ev: Extract<KernelEvent, { type: 'ENEMY_STATE' }>, subject: StageActor | null): void {
  if (!subject || subject.exiting) return;
  if (ev.state === 'revealed') {
    subject.rest = 'idle';
    subject.animator.setState('revealed');
  } else {
    subject.rest = ev.state;
    setRest(subject);
    if (ev.state === 'petrified') say(stage, 'PETRIFIED!', actorSocket(subject, 'fx'), '#adb5bd', 1.0);
  }
}

function onPickup(stage: ComicStage, ev: Extract<KernelEvent, { type: 'PICKUP_COLLECTED' }>, subject: StageActor | null): void {
  if (subject) collect(stage, subject);
  const hero = stage.hero();
  const at = subject ? actorSocket(subject, 'fx') : hero ? actorSocket(hero, 'fx') : anchorPoint(stage, 'panel', null);
  // The preset bursts the amount (ev.label); the item's name rises above it.
  const noun = ev.item === 'energy' ? 'ENERGY CELL' : ev.item === 'ram' ? 'RAM STICK' : 'SSD DRIVE';
  say(stage, noun, at, ev.item === 'energy' ? '#ffd166' : ev.item === 'ram' ? '#4cc9f0' : '#06d6a0', 1.35);
  if (hero) hopInPlace(stage, hero, 0.12, 200);
}

function onPlayerRespawned(stage: ComicStage, ev: Extract<KernelEvent, { type: 'PLAYER_RESPAWNED' }>): void {
  playTear(stage, ev.from === 'ssd_backup' ? 'BACKUP RESTORE' : 'CORE DUMPED');
  if (ev.from === 'ssd_backup') {
    const kiro = stage.actors.get('kiro');
    if (kiro && !kiro.disposed) {
      kiro.animator.setState('windup');
      flashActor(stage, kiro, 0x4cc9f0, 320, 0);
      say(stage, 'EYES UP, DEV!', actorSocket(kiro, 'fx'), '#4cc9f0', 1.0);
      stage.tweens.delay(900, () => !kiro.disposed && setRest(kiro));
    }
  }
  const hero = stage.hero();
  if (!hero) return;
  hero.awaitingSpawn = true;
  const g = claim(hero);
  stage.tweens.delay(1100, () => {
    if (hero.disposed) return;
    hero.awaitingSpawn = false;
    release(hero, g);
    hero.base.copy(hero.home);
    hero.offset.set(0, 0, 0);
    hero.animator.setState('revealed');
  });
}
