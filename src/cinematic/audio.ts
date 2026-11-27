import type { AppBus, AppEvent, CineCue, LetterCue, MusicScene, MusicSurface } from '../contracts/app-bus.js';

export type CineLoopCue = Extract<AppEvent, { kind: 'loop' }>['cue'];

export function cineScene(surface: MusicSurface): MusicScene {
  return { surface, menu: false, reading: false, battle: 'none', lowHp: false, floorTheme: null, hub: false };
}

const CINE: Record<string, CineCue> = {
  thunder: 'thunder',
  distant: 'thunder-far',
  burst: 'burst',
  shatter: 'shatter',
  lightning: 'lightning',
};

/**
 * Cinematic cues go out on the app bus. The music and SFX orchestrators play the samples.
 * A muted or frozen playback passes no bus, so nothing is emitted. Sound never throws.
 */
export class CineAudio {
  private bus: AppBus | null;
  private paused = false;
  private activeLoops = new Set<CineLoopCue>();

  constructor(muted: boolean, bus: AppBus | null = null) {
    this.bus = muted ? null : bus;
  }

  get on(): boolean {
    return this.bus !== null;
  }

  private emit(cue: CineCue): void {
    this.bus?.emit({ kind: 'cine', cue });
  }

  loop(cue: CineLoopCue, on: boolean): void {
    if (on) this.activeLoops.add(cue);
    else this.activeLoops.delete(cue);
    this.bus?.emit({ kind: 'loop', cue, on });
  }

  rain(on: boolean): void {
    this.loop('rain_loop', on);
  }

  stopLoops(): void {
    for (const cue of [...this.activeLoops]) this.loop(cue, false);
  }

  key(): void {
    this.bus?.emit({ kind: 'key', key: 'press' });
  }

  thunder(): void {
    this.emit('thunder');
  }

  distantThunder(): void {
    this.emit('thunder-far');
  }

  burst(): void {
    this.emit('burst');
  }

  /** The pull into the machine. `reverse` is the outro; both play the zap sample. */
  zap(_seconds: number, _reverse = false): void {
    this.emit('zap');
  }

  shatter(): void {
    this.emit('shatter');
  }

  letter(letter: LetterCue): void {
    this.bus?.emit({ kind: 'letter', letter });
  }

  /** Named beats (`thunder`, `distant`) and the lightning strike. */
  cue(name: string): void {
    const cue = CINE[name];
    if (cue) this.emit(cue);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.bus?.emit({ kind: 'audio-hold', paused });
  }

  reset(): void {
    const hadRain = this.activeLoops.has('rain_loop');
    this.stopLoops();
    if (!hadRain) this.bus?.emit({ kind: 'loop', cue: 'rain_loop', on: false });
    if (this.paused) {
      // Clear any paused bed before releasing audio-hold so skipping while paused does not restart it.
      this.bus?.emit({ kind: 'scene', scene: cineScene('play') });
    }
    this.setPaused(false);
  }

  dispose(): void {
    this.reset();
    this.bus = null;
  }
}

/** A view of `audio` whose every method call swallows its own failure: sound must never end a cinematic. */
export function safeAudio(audio: CineAudio): CineAudio {
  return new Proxy(audio, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver) as unknown;
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        try {
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        } catch (err) {
          console.warn('[cinematic] audio failed', err);
          return undefined;
        }
      };
    },
  });
}
