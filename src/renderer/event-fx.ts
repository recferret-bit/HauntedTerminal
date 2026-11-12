import type { KernelEvent } from '../contracts/events.js';
import type { FxId } from './fx-player.js';

/**
 * Where a cue's origin goes. The stage resolves it:
 *   hero / hero-feet      the hero's `fx` socket / his feet
 *   subject / -feet       the actor the event names (entity id, pid, inode heuristics), its `fx` socket / feet
 *   subject-lock          the subject's `lock` socket (doors, sockets), else its `fx` socket
 *   devnull               the `door.devnull` vortex (or the room's `devnull` socket)
 *   flood                 the flood water line, centred on the room's `flood` socket
 *   hand                  where the System Hand's stylus touches down (the spawned actor)
 *   panel                 the middle of the main panel (full-panel effects)
 *   panel-floor           the floor line in the middle of the main panel
 */
export type FxAnchor =
  | 'vibecoder' | 'hero-feet' | 'subject' | 'subject-feet' | 'subject-lock'
  | 'devnull' | 'flood' | 'hand' | 'panel' | 'panel-floor';

export interface FxCue {
  id: FxId;
  anchor: FxAnchor;
  /** From the moment the event plays. */
  delayMs?: number;
  /** Replaces the preset word. A single space suppresses it. */
  text?: string;
  scale?: number;
}

const cue = (id: FxId, anchor: FxAnchor, delayMs = 0, text?: string, scale?: number): FxCue => ({ id, anchor, delayMs, text, scale });

/**
 * The event -> FX table. Every KernelEvent variant that has an effect, and every one of the 23 presets.
 * Beats follow ANIM_EVENT_MAP (src/procgen/anim/events.ts) and the death beats of the malware sheets
 * (`collapse` at 250 ms). Storm strikes and the intro play `fx.lightning-strike` from the stage clock.
 */
export function fxCuesFor(ev: KernelEvent): FxCue[] {
  switch (ev.type) {
    case 'ROOM_TRANSITION':
      if (ev.viaSymlinkLoop) return [cue('fx.flood-splash', 'flood')];
      if (ev.upwardPanelsSmashed >= 3) {
        const n = Math.max(3, Math.floor(ev.upwardPanelsSmashed));
        return [
          cue('fx.panel-smash', 'vibecoder', 250, `PANEL SMASH x${n}!`),
          cue('fx.panel-smash', 'vibecoder', 330, ' ', 0.8),
          cue('fx.panel-smash', 'vibecoder', 410, ' ', 0.65),
        ];
      }
      return [cue('fx.hop', 'hero-feet', 0)];
    case 'LANTERN_REVEAL':
      return [cue('fx.reveal', 'vibecoder', 80)];
    case 'PERMISSION_DENIED_RATTLE':
      return [cue('fx.permission-denied', 'subject-lock')];
    case 'INODE_MODE_CHANGED':
      return (ev.newMode & 0o111) === 0 ? [] : [cue('fx.gate-open', 'subject', 300)];
    case 'OBJECT_MOVED':
      if (ev.suckedIntoNull) return [cue('fx.devnull-suck', 'devnull')];
      return [cue('fx.mv-dust', 'subject-feet', ev.formedBridge ? 340 : 0)];
    case 'SYSTEM_HAND_SPAWN':
      return [cue('fx.fork-spawn', 'hand', ev.reason === 'boss_fork' ? 530 : 280)];
    case 'ENTITY_SPAWNED':
      if (ev.reason === 'room_enter') return [];
      if (ev.reason === 'script') return [cue('fx.touch-materialize', 'subject', 80)];
      return [cue('fx.fork-spawn', 'hand', ev.reason === 'cron_restore' ? 280 : 530)];
    case 'PROC_SIGNALED':
      if (ev.outcome === 'FROZEN') return [cue('fx.sigstop-ice', 'subject')];
      if (ev.outcome === 'TRAPPED_ENRAGED') return [cue('fx.sigterm-rage', 'subject')];
      return [cue('fx.sigkill', 'subject', 120), cue('fx.lightning-strike', 'subject-feet', 0, ' ')];
    case 'HUD_OVERLAY_TOGGLED':
    case 'OBSTACLE_DIALOGUE_RENDERED':
      return [];
    case 'PUZZLE_DOOR_RESOLVED':
      return [cue('fx.door-unlock', 'subject-lock')];
    case 'PLAYER_DAMAGED':
      return ev.hpRemaining <= 0
        ? [cue('fx.hit-hero', 'vibecoder', 250, `-${ev.amount}HP`), cue('fx.coredump', 'panel', 450)]
        : [cue('fx.hit-hero', 'vibecoder', 250, `-${ev.amount}HP`)];
    case 'FLOOR_CLEARED':
      return [];
    case 'ENEMY_ATTACK':
      return [];
    case 'ENEMY_HIT':
      return [cue('fx.malware-hit', 'subject', 0, ev.damage > 0 ? `-${ev.damage}` : undefined)];
    case 'ENEMY_KILLED':
      switch (ev.how) {
        case 'SIGKILL':
          return [cue('fx.sigkill', 'subject', 120), cue('fx.lightning-strike', 'subject-feet', 0, ' ')];
        case 'rm':
          return [cue('fx.rm-ash', 'subject', 250)];
        case 'devnull':
          return [cue('fx.devnull-suck', 'devnull')];
        default:
          return [cue('fx.malware-death', 'subject', 250)];
      }
    case 'ENEMY_STATE':
      if (ev.state === 'frozen') return [cue('fx.sigstop-ice', 'subject')];
      if (ev.state === 'enraged') return [cue('fx.sigterm-rage', 'subject')];
      if (ev.state === 'revealed') return [cue('fx.reveal', 'subject', 80, ' ')];
      return [];
    case 'PICKUP_COLLECTED': {
      const id: FxId = ev.item === 'ram' ? 'fx.pickup-ram' : ev.item === 'ssd' ? 'fx.pickup-ssd' : 'fx.pickup-energy';
      return [cue(id, 'subject', 0, ev.label || undefined)];
    }
    case 'FILE_REMOVED':
      return [cue('fx.rm-ash', 'subject', 250)];
    case 'FILE_CREATED':
      return [cue('fx.touch-materialize', 'subject', 80)];
    case 'PLAYER_RESPAWNED':
      return [cue('fx.coredump', 'panel'), cue('fx.touch-materialize', 'vibecoder', 1100)];
    case 'FLOOR_ENTERED':
      return [];
    case 'VIBECODER_ACTION':
      return [];
    case 'GAME_ENDED':
      return [cue('fx.lightning-strike', 'panel-floor')];
    default:
      return [];
  }
}

/** The entity / target ids an event names (used to keep leaving actors alive until their event plays). */
export function eventEntityIds(ev: KernelEvent): string[] {
  const out: string[] = [];
  const rec = ev as unknown as Record<string, unknown>;
  if (typeof rec.entityId === 'string') out.push(rec.entityId);
  if (typeof rec.targetEntityId === 'string') out.push(rec.targetEntityId);
  return out;
}

/**
 * How long the stage holds the rest of a batch after this event, so a command reads in order:
 * the hero walks up and strikes, then the target reacts; an enemy winds up, then the hero is hurt.
 */
export function eventLeadMs(ev: KernelEvent, heroWalkMs: number): number {
  switch (ev.type) {
    case 'VIBECODER_ACTION':
      return ev.targetEntityId ? heroWalkMs + 160 : ev.action === 'type' ? 0 : 120;
    case 'ENEMY_ATTACK':
      // A tell, one tick ahead of its PLAYER_DAMAGED: holding the batch would only delay unrelated events.
      return 0;
    default:
      return 0;
  }
}
