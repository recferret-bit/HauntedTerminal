import { isSfxId, type SfxId } from './audio-cues.js';
import type { KernelEvent } from './events.js';

export type MusicSurface =
  | 'title'
  | 'level-select'
  | 'manual'
  | 'achievements'
  | 'comic'
  | 'play'
  | 'laptop'
  | 'lab'
  | 'cine-intro'
  | 'cine-outro'
  | 'rank';

export type MusicBattle = 'none' | 'fight' | 'boss';

/** What the music orchestrator needs. Built by the page, not by the sample player. */
export interface MusicScene {
  surface: MusicSurface;
  /** Esc menu is open. The clock and the turn timer keep running. */
  menu: boolean;
  /** Field manual is open. */
  reading: boolean;
  battle: MusicBattle;
  /** HUD low HP: hp > 0 and hp / maxHp <= 0.3. */
  lowHp: boolean;
  /** Level spec floor theme, 1..5. Null off the play surface. */
  floorTheme: 1 | 2 | 3 | 4 | 5 | null;
  /** Level mechanic is `hub`. */
  hub: boolean;
  /** Optional MusicId override declared by the active level config. */
  music?: string;
}

export type LaptopAction =
  | 'open' | 'close' | 'post' | 'disk' | 'ready' | 'trackpad'
  | 'run' | 'loop-guard' | 'shutdown' | 'key'
  | 'solved' | 'check-fail' | 'win-open' | 'win-min' | 'win-close';

export type LoopCue = 'rain_loop' | 'low_hp_loop' | 'lap_fan' | 'dad_typing_loop' | 'dad_smoke_loop';

const LOOP_SET = new Set<string>(['rain_loop', 'low_hp_loop', 'lap_fan', 'dad_typing_loop', 'dad_smoke_loop']);

export function isLoopCue(cue: string): cue is LoopCue | SfxId {
  return LOOP_SET.has(cue) || isSfxId(cue);
}

export type CineCue = 'thunder' | 'thunder-far' | 'burst' | 'zap' | 'shatter' | 'lightning' | 'boot';

export type LetterCue = 'slam' | 'bubble' | 'caption' | 'glitch' | 'flash' | 'invert' | 'shake' | 'pixel';

export type AppEvent =
  | { kind: 'kernel'; event: KernelEvent }
  | { kind: 'pointer'; surface: string; id: string }
  | { kind: 'key'; key: 'press' | 'enter' | 'backspace' | 'tab' }
  | { kind: 'command'; result: 'ok' | 'fail' | 'locked' }
  | { kind: 'scene'; scene: MusicScene }
  | { kind: 'menu'; action: 'open' | 'close' | 'move' }
  | { kind: 'restart'; step: 'arm' | 'go' }
  | { kind: 'manual'; open: boolean }
  | { kind: 'timer'; secondsLeft: number }
  | { kind: 'laptop'; action: LaptopAction }
  | { kind: 'loop'; cue: LoopCue | SfxId; on: boolean }
  | { kind: 'cine'; cue: CineCue }
  | { kind: 'letter'; letter: LetterCue }
  | { kind: 'dialog'; speaker: string }
  | { kind: 'page' }
  | { kind: 'sfx'; cue: string }
  | { kind: 'music'; cue: string | null }
  | { kind: 'audio-hold'; paused: boolean };

/** Mute and volume, forwarded from the session onto the sample graph. */
export interface SoundSink {
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
}

export interface AppBus {
  emit(event: AppEvent): void;
  subscribe(fn: (event: AppEvent) => void): () => void;
  /** Newest last, capped. A later analytics subscriber can read or listen. */
  recent(): readonly AppEvent[];
}

const RECENT_CAP = 200;

export function createAppBus(): AppBus {
  const listeners = new Set<(event: AppEvent) => void>();
  const log: AppEvent[] = [];
  return {
    emit(event) {
      log.push(event);
      if (log.length > RECENT_CAP) log.shift();
      for (const fn of listeners) fn(event);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    recent() {
      return log.slice();
    },
  };
}

/** Publish each kernel event once. A missing bus (a bare test double) is silent. */
export function publishKernel(bus: AppBus | undefined, events: readonly KernelEvent[]): void {
  if (!bus || events.length === 0) return;
  for (const event of events) bus.emit({ kind: 'kernel', event });
}
