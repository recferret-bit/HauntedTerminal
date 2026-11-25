import type { SoundSink } from '../contracts/app-bus.js';

/** Kept so older call sites still type-check. Playback is the SFX orchestrator, not this object. */
export type SfxCue =
  | 'page' | 'lightning' | 'gate' | 'stone' | 'type' | 'kill' | 'hop' | 'denied' | 'reveal' | 'flood';

export interface Sfx {
  /** No-op. Samples play from app events, not from cue names. */
  play(cue: SfxCue): void;
  setMuted(muted: boolean): void;
  /** Master volume 0 to 1. */
  setVolume(volume: number): void;
  /** Attach the sample graph. Pushes the mute and volume already chosen. */
  bind(sink: SoundSink | null): void;
}

export function createSfx(): Sfx {
  let sink: SoundSink | null = null;
  let muted = false;
  let volume = 1;
  const push = (): void => {
    sink?.setMuted(muted);
    sink?.setVolume(volume);
  };
  return {
    play() {},
    bind(next) {
      sink = next;
      push();
    },
    setMuted(next) {
      muted = next;
      sink?.setMuted(next);
    },
    setVolume(next) {
      volume = Math.min(1, Math.max(0, Number.isFinite(next) ? next : 1));
      sink?.setVolume(volume);
    },
  };
}
