export type SfxCue =
  | 'page' | 'lightning' | 'gate' | 'stone' | 'type' | 'kill' | 'hop' | 'denied' | 'reveal' | 'flood';

export interface Sfx {
  play(cue: SfxCue): void;
  setMuted(muted: boolean): void;
}

export function createSfx(): Sfx {
  let muted = false;
  let ctx: AudioContext | null = null;

  const context = (): AudioContext | null => {
    if (muted) return null;
    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null;
    if (!ctx) ctx = new window.AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  };

  const tone = (freq: number, dur: number, type: OscillatorType, gain: number, slide = 0) => {
    const audio = context();
    if (!audio) return;
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audio.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), audio.currentTime + dur);
    amp.gain.setValueAtTime(gain, audio.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
    osc.connect(amp);
    amp.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + dur + 0.02);
  };

  return {
    setMuted(next) { muted = next; },
    play(cue) {
      if (cue === 'hop') tone(520, 0.12, 'square', 0.05, 180);
      else if (cue === 'page') tone(180, 0.18, 'sawtooth', 0.04, -80);
      else if (cue === 'lightning') { tone(90, 0.35, 'sawtooth', 0.08, -50); tone(740, 0.08, 'square', 0.04); }
      else if (cue === 'gate') tone(110, 0.22, 'square', 0.06, 40);
      else if (cue === 'stone') tone(70, 0.28, 'triangle', 0.07, -20);
      else if (cue === 'kill') tone(160, 0.2, 'sawtooth', 0.07, -100);
      else if (cue === 'denied') tone(90, 0.14, 'square', 0.05);
      else if (cue === 'reveal') tone(660, 0.1, 'triangle', 0.04, 200);
      else if (cue === 'flood') tone(200, 0.25, 'sine', 0.05, -60);
      else tone(800, 0.04, 'square', 0.03);
    },
  };
}
