import type { KernelEvent } from '../contracts/events.js';
import { animReactionsFor, ZONES, type AnimEventReaction } from '../procgen/index.js';
import { eventLeadMs, fxCuesFor } from './event-fx.js';
import { reportStage, setRest } from './stage-actor.js';
import { clearCarried } from './stage-carry.js';
import { clearComposeOomActors } from './stage-compose.js';
import { HERO_WALK_MS, MAX_LEAD_MS } from './stage-const.js';
import { handleCastEvent } from './stage-event-cast.js';
import { handleCombatEvent } from './stage-event-combat.js';
import { handleTravelEvent } from './stage-event-travel.js';
import { clearBubble, playCues, triggerShake } from './stage-fx.js';
import { flashActor, strikeFrom } from './stage-motion.js';
import { findByModel, sourceFor, subjectFor } from './stage-resolve.js';
import { isLevelTransitionActiveOrArmed, noteFloorCleared, noteFloorEntered, noteGameEnded } from './stage-level-transition.js';
import type { StageActor } from './stage-cast.js';
import type { ComicStage } from './comic-stage.js';

/** Never throws. Events of one batch are sequenced: a hero action or an enemy wind-up holds the rest briefly. */
export function enqueueStageEvent(stage: ComicStage, ev: KernelEvent): void {
  try {
    if (!ev || typeof ev !== 'object' || typeof (ev as { type?: unknown }).type !== 'string') return;
    if (!stage.built) return;
    if (ev.type === 'FLOOR_CLEARED') noteFloorCleared(stage);
    if (ev.type === 'GAME_ENDED') noteGameEnded(stage);
    if (ev.type === 'FLOOR_ENTERED') {
      clearBubble(stage);
      clearCarried(stage);
      clearComposeOomActors(stage);
      stage.xrayProcs = [];
      stage.xrayOn = false;
      noteFloorEntered(stage, ev);
    }
    const now = stage.clockMs;
    let at = Math.max(now, stage.cursor);
    if (at - now > MAX_LEAD_MS) at = now;
    if (at <= now) runStageEvent(stage, ev);
    else stage.queue.push({ at, ev });
    stage.cursor = at + eventLeadMs(ev, HERO_WALK_MS);
  } catch (err) {
    reportStage(stage, `handleEvent ${(ev as { type?: string })?.type}`, err);
  }
}

export function runStageEvent(stage: ComicStage, ev: KernelEvent): void {
  try {
    runStageEventInner(stage, ev);
  } catch (err) {
    reportStage(stage, `runEvent ${ev.type}`, err);
  }
}

function runStageEventInner(stage: ComicStage, ev: KernelEvent): void {
  if (ev.type === 'ROOM_TRANSITION' && isLevelTransitionActiveOrArmed(stage)) return;
  const subject = subjectFor(stage, ev);
  const reactions = animReactionsFor(ev);
  const spawnLike = ev.type === 'ENTITY_SPAWNED' || ev.type === 'FILE_CREATED' || ev.type === 'SYSTEM_HAND_SPAWN';
  // The kernel removes an enemy's file right before ENEMY_KILLED; that event owns the death and its fx.
  if (ev.type === 'FILE_REMOVED' && subject && (subject.kind === 'enemy' || subject.kind === 'boss')) return;
  // Under reduced motion a command's swirl and glitch give way to a 300 ms tint of the hero (green, or red when it failed).
  const tint = ev.type === 'VIBECODER_ACTION' && stage.reducedMotion.on;
  const cues = tint ? [] : fxCuesFor(ev);
  if (tint) {
    const hero = stage.hero();
    if (hero) flashActor(stage, hero, ZONES[ev.failed ? 'faultBright' : 'matrixBright'].color, 300, 0);
  }
  if (!spawnLike) playCues(stage, cues, subject, ev);
  // One shake per event: the preset's, else ANIM_EVENT_MAP's.
  const presetShakes = cues.some((c) => (stage.fxPlayer.preset(c.id)?.shake ?? 0) > 0);
  const mapShake = reactions.reduce<AnimEventReaction | null>((best, r) => (r.shake > (best?.shake ?? 0) ? r : best), null);
  if (!presetShakes && mapShake && mapShake.shake > 0) {
    const shake = mapShake.shake;
    stage.tweens.delay(mapShake.beatMs ?? 0, () => triggerShake(stage, shake));
  }
  applyReactions(stage, ev, reactions, subject);
  if (handleTravelEvent(stage, ev, subject)) return;
  if (handleCombatEvent(stage, ev, subject)) return;
  handleCastEvent(stage, ev, subject, cues);
}

/** Generic ANIM_EVENT_MAP driver: states for hero / subject / source / door / children at their delays. */
function applyReactions(stage: ComicStage, ev: KernelEvent, reactions: AnimEventReaction[], subject: StageActor | null): void {
  for (const r of reactions) {
    if (!r.state) continue;
    let targets: StageActor[] = [];
    switch (r.role) {
      case 'vibecoder': {
        const h = stage.hero();
        if (h && !(ev.type === 'ROOM_TRANSITION' && r.state !== 'hit')) targets = [h];
        break;
      }
      case 'subject':
        // Petrify, freeze, rage and death are applied by the handlers as resting states.
        if (subject && r.state !== 'petrified' && r.state !== 'frozen' && r.state !== 'enraged' && r.state !== 'death') targets = [subject];
        break;
      case 'source': {
        // The attacker's strike (pose + lunge) is played by strikeFrom in the PLAYER_DAMAGED handler.
        const src = sourceFor(stage, ev);
        if (src) strikeFrom(stage, src);
        break;
      }
      case 'door': {
        if (ev.type === 'ROOM_TRANSITION') {
          const mirror = findByModel(stage, 'door.loopback');
          if (mirror) {
            targets = [mirror];
            stage.tweens.delay(r.durationMs || 600, () => setRest(mirror));
          }
        }
        break;
      }
      default:
        break;
    }
    for (const a of targets) {
      if (a.exiting || a.dead) continue;
      if ((a.rest === 'petrified' || a.rest === 'frozen') && r.role !== 'vibecoder') continue;
      stage.tweens.delay(r.delayMs, () => !a.disposed && !a.exiting && a.animator.setState(r.state!));
    }
  }
}
