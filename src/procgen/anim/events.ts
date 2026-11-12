/**
 * Game events -> motion, as data. Terminal commands are the only input: a command makes the kernel
 * emit KernelEvents (src/contracts/events.ts), and the stage turns each one into animator states,
 * Group tweens, a screen shake and an onomatopoeia. This table is that mapping, ready for
 * src/renderer/comic-stage.ts to adopt; nothing here is wired into the stage yet.
 * Skill: .kiro/skills/procedural-animation-3d/references/event-to-motion.md
 */
import type { KernelEvent } from '../../contracts/events.js';
import type { RoomActor } from '../../contracts/room-view.js';
import type { AnimState } from './states.js';

export type AnimEventType = KernelEvent['type'];

/** Who performs the reaction. The stage resolves a role to an actor. */
export type AnimEventRole =
  | 'vibecoder'      // vibecoder.dev
  | 'subject'   // the inode or process the event names (targetId, inodeId, pid)
  | 'children'  // child processes of the subject (zombies of the boss)
  | 'door'      // the door / gate / mirror involved
  | 'revealed'  // every actor in `revealedInodes`
  | 'spawned'   // the entity the System Hand draws in
  | 'hand'      // vibecoder.hand, the System Hand
  | 'source'    // the attacker named by `sourceName`
  | 'page';     // the comic page itself: camera, panels, overlays

/** Timings in ms. `T` in a tween description is the stage's `config.transitionMs` (ANIM_TRANSITION_MS by default). */
export interface AnimEventReaction {
  event: AnimEventType;
  /** Which form of the event this row covers (see `animEventVariant`). */
  variant: string;
  /** The condition on the event payload, in words. */
  when: string;
  role: AnimEventRole;
  /** Animator state to set on the role's actor. Omitted: the animator keeps its state. */
  state?: AnimState;
  /** `true`: the state stays until another event changes it. `false`: one-shot, the animator returns by itself. */
  hold: boolean;
  /** Delay from the event to `setState` / the tween start. */
  delayMs: number;
  /** Length of the Group tween (0 = none). */
  durationMs: number;
  /** What the stage tweens on the actor's Group (the animator never moves the Group). */
  tween?: string;
  /** `triggerShake` multiplier, 0 = no shake. Fired at `beatMs`. */
  shake: number;
  /** The lettering and its colour, fired at `beatMs`. `{n}` = a value from the event. */
  onomatopoeia?: string;
  color?: string;
  /** When the hit lands: shake, lettering and FX hand-off share this beat. */
  beatMs: number;
}

/** Default `config.transitionMs` of the stage. */
export const ANIM_TRANSITION_MS = 420;

const row = (r: Partial<AnimEventReaction> & Pick<AnimEventReaction, 'event' | 'variant' | 'when' | 'role'>): AnimEventReaction => ({
  hold: false, delayMs: 0, durationMs: 0, shake: 0, beatMs: 0, ...r,
});

export const ANIM_EVENT_MAP: readonly AnimEventReaction[] = [
  // cd <dir>, cd ..
  row({ event: 'ROOM_TRANSITION', variant: 'hop', when: 'upwardPanelsSmashed < 3 and not viaSymlinkLoop', role: 'vibecoder', state: 'walk', hold: false, durationMs: ANIM_TRANSITION_MS, tween: 'x: run to the door (linear); y: + sin(t*PI) * 0.45 over the gutter; setState(idle) on landing', onomatopoeia: 'HOP!', color: '#06d6a0', beatMs: 210 }),
  row({ event: 'ROOM_TRANSITION', variant: 'hop', when: 'same', role: 'page', durationMs: ANIM_TRANSITION_MS, tween: 'camera slides to the new panel with easeOutBack; panel title and room dressing swap on landing' }),
  // cd ../../../
  row({ event: 'ROOM_TRANSITION', variant: 'panel_smash', when: 'upwardPanelsSmashed >= 3', role: 'vibecoder', state: 'attack', durationMs: 504, tween: 'y: + sin(t*PI) * 1.1 through three frames; strike beat = first frame breaks', shake: 1.5, onomatopoeia: 'PANEL SMASH x{n}!!', color: '#ffd166', beatMs: 250 }),
  row({ event: 'ROOM_TRANSITION', variant: 'panel_smash', when: 'same', role: 'page', durationMs: 504, tween: 'camera pulls back; frame shards fly (fx layer) at 250, 330, 410 ms' }),
  // cd through a symlink loop
  row({ event: 'ROOM_TRANSITION', variant: 'eloop', when: 'viaSymlinkLoop', role: 'vibecoder', state: 'hit', shake: 1.2, onomatopoeia: 'ELOOP! MIRROR TRAP!', color: '#4cc9f0' }),
  row({ event: 'ROOM_TRANSITION', variant: 'eloop', when: 'same', role: 'door', state: 'enraged', durationMs: 600, tween: 'door.loopback flares for 600 ms, then setState(idle); flood rises 18%' }),

  // ls -a, ls -la
  row({ event: 'LANTERN_REVEAL', variant: 'reveal', when: 'always', role: 'vibecoder', durationMs: ANIM_TRANSITION_MS, tween: 'lantern raise: lantern zone emissive 0.35 -> 1.6, light cone opens', onomatopoeia: 'LS -LA // REVEAL!', color: '#ffd166', beatMs: 80 }),
  row({ event: 'LANTERN_REVEAL', variant: 'reveal', when: 'always', role: 'revealed', state: 'revealed', delayMs: 80 }),

  // cd / rm on a 000 target
  row({ event: 'PERMISSION_DENIED_RATTLE', variant: 'rattle', when: 'always', role: 'subject', state: 'hit', durationMs: 320, tween: 'x: + sin(t*PI*10) * 0.06 (lock rattle); sparks at the lock socket', shake: 0.8, onomatopoeia: 'PERMISSION DENIED!', color: '#ef476f' }),

  // chmod -x <monster.bin>
  row({ event: 'INODE_MODE_CHANGED', variant: 'petrify', when: '(newMode & 0o111) === 0', role: 'subject', state: 'petrified', hold: true, onomatopoeia: 'CHMOD -X // PETRIFIED!', color: '#adb5bd' }),
  // chmod +rx <gate>, chmod 755
  row({ event: 'INODE_MODE_CHANGED', variant: 'open', when: '(newMode & 0o111) !== 0', role: 'subject', durationMs: ANIM_TRANSITION_MS, tween: 'y: + 0.7 * easeOutBack(t) (grille lifts); opacity 1 -> 0.35; led zone red -> green', shake: 0.5, onomatopoeia: 'CHMOD 755 // OPEN!', color: '#06d6a0', beatMs: 300 }),

  // mv heavy_plank.tar chasm/
  row({ event: 'OBJECT_MOVED', variant: 'bridge', when: 'formedBridge', role: 'subject', durationMs: ANIM_TRANSITION_MS, tween: 'x: slide to the gap with easeOutBack, lands flat as the bridge', shake: 0.6, onomatopoeia: 'MV -> BRIDGE FORMED!', color: '#ffd166', beatMs: 340 }),
  // > /dev/null
  row({ event: 'OBJECT_MOVED', variant: 'null', when: 'suckedIntoNull', role: 'door', durationMs: 650, tween: 'door.devnull scale 1 + sin(t*PI) * 0.45; the object shrinks into it (death state, no flash)', onomatopoeia: '/DEV/NULL VORTEX!', color: '#b5179e' }),
  row({ event: 'OBJECT_MOVED', variant: 'null', when: 'same', role: 'subject', state: 'death', durationMs: 650, tween: 'x, y: spiral into the drain while the death collapse plays' }),
  row({ event: 'OBJECT_MOVED', variant: 'moved', when: 'neither flag', role: 'subject', state: 'revealed', tween: 'pops in at its new place' }),

  // boss fork, cron restore
  row({ event: 'SYSTEM_HAND_SPAWN', variant: 'boss_fork', when: "reason === 'boss_fork'", role: 'source', state: 'attack', tween: 'boss.forkbomb throws its fork arms up on the strike beat' }),
  row({ event: 'SYSTEM_HAND_SPAWN', variant: 'boss_fork', when: 'same', role: 'hand', delayMs: 250, durationMs: 620, tween: '0-45%: drops in from y 3.1 (easeOutBack); 45-75%: scribbles, x + sin(t*40) * 0.08; 75-100%: withdraws', onomatopoeia: 'FORK() // DRAWN!', color: '#f4f1ea', beatMs: 530 }),
  row({ event: 'SYSTEM_HAND_SPAWN', variant: 'boss_fork', when: 'same', role: 'spawned', state: 'revealed', delayMs: 530 }),
  row({ event: 'SYSTEM_HAND_SPAWN', variant: 'cron_restore', when: "reason === 'cron_restore'", role: 'hand', durationMs: 620, tween: 'same three beats as boss_fork', onomatopoeia: 'CRON RESTORE!', color: '#f4f1ea', beatMs: 280 }),
  row({ event: 'SYSTEM_HAND_SPAWN', variant: 'cron_restore', when: 'same', role: 'spawned', state: 'revealed', delayMs: 280 }),

  // kill -STOP <pid>
  row({ event: 'PROC_SIGNALED', variant: 'frozen', when: "outcome === 'FROZEN'", role: 'subject', state: 'frozen', hold: true, onomatopoeia: 'SIGSTOP // FROZEN!', color: '#4cc9f0' }),
  // kill -15 <pid> on a process that traps it
  row({ event: 'PROC_SIGNALED', variant: 'enraged', when: "outcome === 'TRAPPED_ENRAGED'", role: 'subject', state: 'enraged', hold: true, shake: 1.3, onomatopoeia: 'SIGTERM TRAPPED!', color: '#ef476f' }),
  // kill -9 <pid>
  row({ event: 'PROC_SIGNALED', variant: 'killed', when: "outcome === 'KILLED'", role: 'subject', state: 'death', hold: true, shake: 1.6, onomatopoeia: 'KILL -9 // REAPED!', color: '#ffd166', beatMs: 120 }),
  row({ event: 'PROC_SIGNALED', variant: 'killed', when: 'same', role: 'children', state: 'death', hold: true, delayMs: 120 }),

  // ps, top
  row({ event: 'HUD_OVERLAY_TOGGLED', variant: 'xray', when: 'processes.length > 0', role: 'page', tween: 'PID plates pop over every process; parent-child links pulse; actors keep their state' }),
  row({ event: 'HUD_OVERLAY_TOGGLED', variant: 'xray_off', when: 'processes.length === 0', role: 'page', tween: 'plates and links removed' }),

  // cat <name>.sock
  row({ event: 'OBSTACLE_DIALOGUE_RENDERED', variant: 'speak', when: 'always', role: 'subject', durationMs: 160, tween: 'bubble pops with easeOutBack over door.socket; its LED eyes are tagged blink and keep going' }),
  // right answer > <name>.sock
  row({ event: 'PUZZLE_DOOR_RESOLVED', variant: 'solved', when: 'always', role: 'subject', state: 'revealed', onomatopoeia: 'SOCKET UNLOCKED ({n})!', color: '#06d6a0' }),
  row({ event: 'PUZZLE_DOOR_RESOLVED', variant: 'solved', when: 'always', role: 'door', delayMs: 200, durationMs: ANIM_TRANSITION_MS, tween: 'the unlocked door plays INODE_MODE_CHANGED / open' }),

  // the attacker lands a hit
  row({ event: 'PLAYER_DAMAGED', variant: 'damaged', when: 'always', role: 'source', state: 'attack', tween: 'the attacker named by sourceName plays its attack; the vibecoder reacts on its strike beat' }),
  row({ event: 'PLAYER_DAMAGED', variant: 'damaged', when: 'always', role: 'vibecoder', state: 'hit', delayMs: 250, shake: 1.1, onomatopoeia: '-{n} HP', color: '#ef476f', beatMs: 250 }),

  // floor exit
  row({ event: 'FLOOR_CLEARED', variant: 'cleared', when: 'always', role: 'page', durationMs: 900, tween: 'page turn to the next floor card', onomatopoeia: 'FLOOR CLEARED!', color: '#06d6a0' }),
  row({ event: 'FLOOR_CLEARED', variant: 'cleared', when: 'always', role: 'vibecoder', state: 'idle', tween: 'one hop in place (y + 0.3, 300 ms)' }),
];

/** Which variant of ANIM_EVENT_MAP a concrete event selects. */
export function animEventVariant(ev: KernelEvent): string {
  switch (ev.type) {
    case 'ROOM_TRANSITION':
      return ev.viaSymlinkLoop ? 'eloop' : ev.upwardPanelsSmashed >= 3 ? 'panel_smash' : 'hop';
    case 'LANTERN_REVEAL':
      return 'reveal';
    case 'PERMISSION_DENIED_RATTLE':
      return 'rattle';
    case 'INODE_MODE_CHANGED':
      return (ev.newMode & 0o111) === 0 ? 'petrify' : 'open';
    case 'OBJECT_MOVED':
      return ev.formedBridge ? 'bridge' : ev.suckedIntoNull ? 'null' : 'moved';
    case 'SYSTEM_HAND_SPAWN':
      return ev.reason;
    case 'PROC_SIGNALED':
      return ev.outcome === 'FROZEN' ? 'frozen' : ev.outcome === 'KILLED' ? 'killed' : 'enraged';
    case 'HUD_OVERLAY_TOGGLED':
      return ev.processes.length > 0 ? 'xray' : 'xray_off';
    case 'OBSTACLE_DIALOGUE_RENDERED':
      return 'speak';
    case 'PUZZLE_DOOR_RESOLVED':
      return 'solved';
    case 'PLAYER_DAMAGED':
      return 'damaged';
    case 'FLOOR_CLEARED':
      return 'cleared';
    default:
      // Campaign events (ENEMY_*, PICKUP_COLLECTED, FILE_*, ...) have no rows here yet; the renderer maps them.
      return ev.type.toLowerCase();
  }
}

/** The reactions (one per role) for a concrete event. */
export function animReactionsFor(ev: KernelEvent): AnimEventReaction[] {
  const variant = animEventVariant(ev);
  return ANIM_EVENT_MAP.filter((r) => r.event === ev.type && r.variant === variant);
}

export type AnimActorFlags = Pick<RoomActor, 'hidden' | 'petrified' | 'frozen' | 'alpha'>;

/** RoomActor flags -> the state an actor rests in, highest priority first. */
export const ANIM_ACTOR_FLAG_STATES: readonly { flag: string; state: AnimState; note: string }[] = [
  { flag: 'petrified', state: 'petrified', note: 'chmod -x: stone. Wins over everything: a statue cannot be frozen or hidden.' },
  { flag: 'frozen', state: 'frozen', note: 'SIGSTOP: ice. SIGCONT clears the flag and the actor resumes mid-pose.' },
  { flag: 'hidden', state: 'hidden', note: 'Not listed by plain ls. The stage also hides the Group; the state keeps the jitter off.' },
  { flag: 'alpha < 0.5', state: 'hidden', note: 'A lurking dotfile (alpha 0.04): drawn, barely. ls -a plays `revealed`.' },
];

/** The resting state for an actor's flags. Call it from syncRoom; one-shots (attack, hit) return here. */
export function animStateForActor(actor: AnimActorFlags, fallback: AnimState = 'idle'): AnimState {
  if (actor.petrified) return 'petrified';
  if (actor.frozen) return 'frozen';
  if (actor.hidden || (actor.alpha ?? 1) < 0.5) return 'hidden';
  return fallback;
}
