import type { KernelEvent } from '../contracts/events.js';
import { actorSocket, type StageActor } from './stage-cast.js';
import { setRest } from './stage-actor.js';
import { playTear, say } from './stage-fx.js';
import { battleTurnChanged, claim, collect, enemyAttack, flashActor, hopInPlace, kill, knockback, release, suckIntoNull } from './stage-motion.js';
import { anchorPoint, childrenOf } from './stage-resolve.js';
import { syncHeroFace, syncOverlays } from './stage-sync.js';
import type { ComicStage } from './comic-stage.js';

export function handleCombatEvent(stage: ComicStage, ev: KernelEvent, subject: StageActor | null): boolean {
  switch (ev.type) {
    case 'PROC_SIGNALED':
      onProcSignaled(stage, ev, subject);
      return true;
    case 'PLAYER_DAMAGED':
      onPlayerDamaged(stage, ev);
      return true;
    case 'BATTLE_STARTED':
      onBattleStarted(stage, ev, subject);
      return true;
    case 'ENEMY_ATTACK':
      onEnemyAttack(stage, ev, subject);
      return true;
    case 'BATTLE_TURN':
    case 'BATTLE_ENDED':
      battleTurnChanged(stage, ev);
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
  } else if (ev.outcome === 'RESUMED') {
    subject.rest = 'idle';
    setRest(subject);
  } else if (ev.outcome === 'TRAPPED_ENRAGED') {
    subject.rest = 'enraged';
    setRest(subject);
  } else {
    stage.strikeLightning(anchorPoint(stage, 'subject-feet', subject), 5.2, undefined, `kill:${subject.id}`);
    kill(stage, subject, 'SIGKILL', 0, false);
    for (const child of childrenOf(stage, subject)) kill(stage, child, 'SIGKILL', 120, false);
  }
}

function onPlayerDamaged(stage: ComicStage, ev: Extract<KernelEvent, { type: 'PLAYER_DAMAGED' }>): void {
  const hero = stage.hero();
  if (!hero) return;
  hero.hp = ev.hpRemaining;
  stage.heroOuchUntil = stage.clockMs + 600;
  syncHeroFace(stage, hero);
  stage.tweens.delay(610, () => {
    if (!hero.disposed) syncHeroFace(stage, hero);
  });
  flashActor(stage, hero, 0xef476f, 240, 250);
  if (ev.hpRemaining <= 0) stage.tweens.delay(450, () => playTear(stage, 'SEGFAULT'));
}

function onBattleStarted(stage: ComicStage, ev: Extract<KernelEvent, { type: 'BATTLE_STARTED' }>, subject: StageActor | null): void {
  if (subject && !subject.disposed && !subject.exiting && !subject.dead && subject.modelId.startsWith('agent.')) {
    if (subject.rest !== 'frozen' && subject.rest !== 'petrified') subject.animator.setState('attack');
  }
  const hero = stage.hero();
  const ids = Array.isArray(ev.enemyIds) ? ev.enemyIds : [];
  for (const id of ids) {
    const a = stage.actors.get(id);
    if (!a || a.disposed || a.exiting || a.dead || a.rest === 'petrified' || a.rest === 'frozen' || a.rest === 'hidden') continue;
    const dir = hero ? Math.sign(hero.base.x - a.base.x) || -1 : -1;
    a.animator.setFacing(dir > 0 ? 1 : -1);
    hopInPlace(stage, a, 0.14, 240);
    if (!stage.reducedMotion.on) flashActor(stage, a, 0xe8002b, 200, 0);
  }
  say(stage, 'BATTLE INCOMING!', anchorPoint(stage, 'panel', null), '#ffd166', 0.8, 1.12);
}

function onEnemyAttack(stage: ComicStage, ev: Extract<KernelEvent, { type: 'ENEMY_ATTACK' }>, subject: StageActor | null): void {
  if (!subject) return;
  enemyAttack(stage, subject);
  if (subject.exiting || subject.dead || subject.rest === 'petrified' || subject.rest === 'frozen' || subject.rest === 'hidden') return;
  if (typeof ev.damage === 'number' && ev.damage > 0) {
    const word = String(ev.attack || 'INCOMING').trim().toUpperCase().slice(0, 18);
    say(stage, `${word}!`, actorSocket(subject, 'fx'), '#ef476f', 0.95);
  }
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
  if (ev.how === 'SIGKILL') stage.strikeLightning(anchorPoint(stage, 'subject-feet', subject), 5.2, undefined, `kill:${subject.id}`);
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
  const noun =
    ev.item === 'energy'
      ? 'ENERGY CELL'
      : ev.item === 'ram'
        ? 'RAM STICK'
        : ev.item === 'tube_transistor'
          ? 'TUBE TRANSISTOR'
          : ev.item === 'laptop'
            ? 'LAPTOP'
            : 'SSD DRIVE';
  const tint = ev.item === 'energy' || ev.item === 'tube_transistor' ? '#ffd166' : ev.item === 'ram' || ev.item === 'laptop' ? '#4cc9f0' : '#06d6a0';
  say(stage, noun, at, tint, 1.35);
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
