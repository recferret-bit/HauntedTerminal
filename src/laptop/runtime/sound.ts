/**
 * Tiny WebAudio sounds for the laptop: key clicks, the trackpad button, the POST beep and the disk
 * chatter while it boots. Synthesised on the fly (no files); silent until the first user gesture, as
 * browsers require, and whenever `muted`.
 */
export interface LaptopSound {
  muted: boolean;
  key(down: boolean): void;
  button(): void;
  beep(): void;
  disk(ms: number): void;
}

export function createLaptopSound(): LaptopSound {
  let ctx: AudioContext | null = null;
  const audio = (): AudioContext | null => {
    if (sound.muted || typeof AudioContext === 'undefined') return null;
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  };

  /** A short burst of filtered noise: the body of every click. */
  const noise = (at: number, ms: number, freq: number, gain: number): void => {
    const a = audio();
    if (!a) return;
    const len = Math.max(1, Math.floor((a.sampleRate * ms) / 1000));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const src = a.createBufferSource();
    src.buffer = buf;
    const band = a.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq;
    band.Q.value = 1.2;
    const g = a.createGain();
    g.gain.value = gain;
    src.connect(band).connect(g).connect(a.destination);
    src.start(a.currentTime + at);
  };

  const sound: LaptopSound = {
    muted: false,
    key: (down) => noise(0, down ? 28 : 18, down ? 2600 : 1800, down ? 0.5 : 0.25),
    button: () => { noise(0, 22, 1400, 0.55); noise(0.07, 16, 1900, 0.3); },
    beep() {
      const a = audio();
      if (!a) return;
      const osc = a.createOscillator();
      const g = a.createGain();
      osc.type = 'square';
      osc.frequency.value = 880;
      g.gain.setValueAtTime(0.06, a.currentTime);
      g.gain.setValueAtTime(0, a.currentTime + 0.16);
      osc.connect(g).connect(a.destination);
      osc.start();
      osc.stop(a.currentTime + 0.2);
    },
    disk(ms) {
      // Seek chatter: irregular ticks, the sound of a 540 MB drive finding its sectors.
      for (let t = 0; t < ms; t += 40 + Math.random() * 110) noise(t / 1000, 12, 900 + Math.random() * 900, 0.18);
    },
  };
  return sound;
}
