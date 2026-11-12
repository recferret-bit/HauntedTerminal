/**
 * A tiny WebAudio synth for the cinematics: rain, key clatter, thunder, a glass burst, the teleport
 * zap and the shatter. No samples. Never created when muted; every call is a no-op without a context.
 */
export class CineAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private rainGain: GainNode | null = null;
  private rainSrc: AudioBufferSourceNode | null = null;

  constructor(muted: boolean) {
    if (muted) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      void this.ctx.resume().catch(() => {});
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      let seed = 1234567;
      for (let i = 0; i < len; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        data[i] = (seed / 0x7fffffff) * 2 - 1;
      }
    } catch {
      this.ctx = null;
    }
  }

  get on(): boolean {
    return !!this.ctx && this.ctx.state !== 'closed';
  }

  private src(loop = false): AudioBufferSourceNode | null {
    if (!this.ctx || !this.noise) return null;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    return s;
  }

  private env(peak: number, attack: number, decay: number, at = 0): GainNode | null {
    if (!this.ctx || !this.master) return null;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime + at;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.master);
    return g;
  }

  private filtered(type: BiquadFilterType, freq: number, q: number, out: AudioNode): BiquadFilterNode | null {
    if (!this.ctx) return null;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(out);
    return f;
  }

  rain(on: boolean): void {
    if (!this.ctx || !this.master) return;
    if (on && !this.rainSrc) {
      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.value = 0.0001;
      this.rainGain.gain.exponentialRampToValueAtTime(0.09, this.ctx.currentTime + 1.2);
      this.rainGain.connect(this.master);
      const f = this.filtered('bandpass', 1800, 0.6, this.rainGain);
      this.rainSrc = this.src(true);
      if (this.rainSrc && f) {
        this.rainSrc.connect(f);
        this.rainSrc.start();
      }
    } else if (!on && this.rainSrc && this.rainGain) {
      const t = this.ctx.currentTime;
      this.rainGain.gain.cancelScheduledValues(t);
      this.rainGain.gain.setValueAtTime(this.rainGain.gain.value, t);
      this.rainGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      this.rainSrc.stop(t + 0.7);
      this.rainSrc = null;
    }
  }

  key(): void {
    const g = this.env(0.22, 0.002, 0.045);
    const s = this.src();
    if (!g || !s) return;
    const f = this.filtered('bandpass', 2600 + Math.random() * 1600, 2.5, g);
    if (!f) return;
    s.connect(f);
    s.start(0, Math.random());
    s.stop(this.ctx!.currentTime + 0.08);
  }

  thunder(): void {
    if (!this.ctx) return;
    // The crack...
    const crack = this.env(0.9, 0.004, 0.25);
    const s1 = this.src();
    const f1 = crack && this.filtered('highpass', 1200, 0.7, crack);
    if (s1 && f1) {
      s1.connect(f1);
      s1.start();
      s1.stop(this.ctx.currentTime + 0.4);
    }
    // ...and the long roll.
    const roll = this.env(1.0, 0.03, 2.6);
    const s2 = this.src(true);
    const f2 = roll && this.filtered('lowpass', 260, 0.9, roll);
    if (s2 && f2 && roll) {
      f2.frequency.setValueAtTime(700, this.ctx.currentTime);
      f2.frequency.exponentialRampToValueAtTime(90, this.ctx.currentTime + 2.4);
      s2.connect(f2);
      s2.start();
      s2.stop(this.ctx.currentTime + 2.8);
    }
  }

  distantThunder(): void {
    if (!this.ctx) return;
    const roll = this.env(0.25, 0.15, 1.8);
    const s = this.src(true);
    const f = roll && this.filtered('lowpass', 160, 0.8, roll);
    if (s && f) {
      s.connect(f);
      s.start();
      s.stop(this.ctx.currentTime + 2.1);
    }
  }

  burst(): void {
    if (!this.ctx) return;
    const g = this.env(0.7, 0.003, 0.5);
    const s = this.src();
    const f = g && this.filtered('highpass', 2400, 0.5, g);
    if (s && f) {
      s.connect(f);
      s.start();
      s.stop(this.ctx.currentTime + 0.6);
    }
    this.tone('square', 90, 40, 0.35, 0.5);
  }

  /** The pull into the machine: a rising sweep. `reverse` falls instead (the outro). */
  zap(seconds: number, reverse = false): void {
    if (!this.ctx) return;
    this.tone('sawtooth', reverse ? 1800 : 70, reverse ? 60 : 1900, 0.18, seconds);
    this.tone('square', reverse ? 900 : 35, reverse ? 30 : 950, 0.08, seconds);
  }

  shatter(): void {
    if (!this.ctx) return;
    for (let i = 0; i < 5; i++) {
      const g = this.env(0.25, 0.002, 0.18, i * 0.05);
      const s = this.src();
      const f = g && this.filtered('bandpass', 3000 + i * 900, 4, g);
      if (s && f) {
        s.connect(f);
        s.start(this.ctx.currentTime + i * 0.05);
        s.stop(this.ctx.currentTime + i * 0.05 + 0.25);
      }
    }
  }

  private tone(type: OscillatorType, from: number, to: number, peak: number, seconds: number): void {
    if (!this.ctx) return;
    const g = this.env(peak, 0.02, seconds);
    if (!g) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    const t = this.ctx.currentTime;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + seconds);
    o.connect(g);
    o.start(t);
    o.stop(t + seconds + 0.05);
  }

  /** Pause / continue: the whole graph stops and resumes where it was. */
  setPaused(paused: boolean): void {
    if (!this.ctx || this.ctx.state === 'closed') return;
    void (paused ? this.ctx.suspend() : this.ctx.resume()).catch(() => {});
  }

  dispose(): void {
    const ctx = this.ctx;
    this.ctx = null;
    this.rainSrc = null;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
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
