import { playBed, type BedHandle } from './bed-loop.js';
import type { MusicId, SfxId } from './catalog.js';
import { musicAsset, musicLoops, sampleUrl } from './catalog.js';
import { SOUND_SOURCES, TYPING_MIN_INTERVAL_MS, TYPING_SOUND_SOURCES } from './limits.js';
import { pickCappedSlot } from './voices.js';

/** One-shot cues capped to `TYPING_SOUND_SOURCES` simultaneous voices. */
export const TYPING_SFX: ReadonlySet<SfxId> = new Set<SfxId>([
  'key_press',
  'key_press_2',
  'key_press_3',
  'key_backspace',
  'key_backspace_2',
  'key_enter',
  'tab_complete',
]);

/** Rapid-typing cues rate-limited to `TYPING_MIN_INTERVAL_MS`. `key_enter` and `tab_complete` always play. */
const THROTTLED_TYPING_SFX: ReadonlySet<SfxId> = new Set<SfxId>([
  'key_press',
  'key_press_2',
  'key_press_3',
  'key_backspace',
  'key_backspace_2',
]);

const KEY_VARIANTS: Partial<Record<SfxId, readonly SfxId[]>> = {
  key_press: ['key_press', 'key_press_2', 'key_press_3'],
  key_backspace: ['key_backspace', 'key_backspace_2'],
};

const KEY_RATES = [1.0, 1.045, 0.96, 1.02, 0.975, 1.06, 0.945] as const;
const KEY_GAINS = [0.9, 0.84, 0.94, 0.87, 0.92] as const;

/** Active windows (seconds) trimmed from leading and trailing silence so keystrokes feel instant and free slots cleanly. */
const SFX_TRIM: Partial<Record<SfxId, { offset: number; duration: number }>> = {
  key_press: { offset: 0.105, duration: 0.215 },
  key_press_2: { offset: 0.098, duration: 0.185 },
  key_press_3: { offset: 0.045, duration: 0.28 },
  key_backspace: { offset: 0.085, duration: 0.22 },
  key_backspace_2: { offset: 0.085, duration: 0.15 },
};

export interface AudioGraph {
  readonly live: boolean;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  play(id: SfxId): void;
  loop(id: SfxId, on: boolean): void;
  bed(id: MusicId | null): void;
  hold(paused: boolean): void;
  dispose(): void;
}

const SILENT: AudioGraph = {
  live: false,
  setMuted() {},
  setVolume() {},
  play() {},
  loop() {},
  bed() {},
  hold() {},
  dispose() {},
};

type Loader = (group: 'sfx' | 'music', id: string) => Promise<AudioBuffer | null>;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

function makeLoader(ctx: AudioContext): Loader {
  const cache = new Map<string, Promise<AudioBuffer | null>>();
  return (group, id) => {
    const url = sampleUrl(group, id);
    if (!url) return Promise.resolve(null);
    const hit = cache.get(url);
    if (hit) return hit;
    const pending = fetch(url)
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(res.statusText))))
      .then((raw) => ctx.decodeAudioData(raw))
      .catch((err: unknown) => {
        console.warn('[audio] sample failed', url, err);
        return null;
      });
    cache.set(url, pending);
    return pending;
  };
}

interface VoiceSlot {
  node: AudioBufferSourceNode;
  amp: GainNode;
}

function spawnVoice(
  ctx: AudioContext,
  master: GainNode,
  buffer: AudioBuffer,
  gain: number,
  loop: boolean,
  offset = 0,
  duration?: number,
  rate = 1,
): VoiceSlot {
  const node = ctx.createBufferSource();
  const amp = ctx.createGain();
  amp.gain.value = gain;
  node.buffer = buffer;
  node.loop = loop;
  if (rate !== 1 && node.playbackRate) node.playbackRate.value = rate;
  node.connect(amp).connect(master);
  if (!loop && duration !== undefined) node.start(0, offset, duration);
  else if (offset > 0) node.start(0, offset);
  else node.start();
  return { node, amp };
}

function nextKeyStyle(id: SfxId, step: number): { cue: SfxId; rate: number; gain: number } {
  const variants = KEY_VARIANTS[id];
  if (!variants) return { cue: id, rate: 1, gain: 0.9 };
  return {
    cue: variants[step % variants.length] ?? id,
    rate: KEY_RATES[step % KEY_RATES.length] ?? 1,
    gain: KEY_GAINS[step % KEY_GAINS.length] ?? 0.9,
  };
}

function stopAt(node: AudioBufferSourceNode | null | undefined, when?: number): void {
  if (!node) return;
  try {
    if (when === undefined) node.stop();
    else node.stop(when);
  } catch {
    // The node already ended.
  }
}

function rampOut(amp: GainNode, at: number, sec: number): void {
  amp.gain.cancelScheduledValues(at);
  amp.gain.setValueAtTime(Math.max(0.0001, amp.gain.value), at);
  amp.gain.linearRampToValueAtTime(0.0001, at + sec);
}

function stopVoice(ctx: AudioContext, voice: VoiceSlot | null | undefined, fadeSec = 0): void {
  if (!voice) return;
  if (fadeSec > 0 && ctx.state === 'running') {
    const t = ctx.currentTime;
    rampOut(voice.amp, t, fadeSec);
    stopAt(voice.node, t + fadeSec + 0.005);
    return;
  }
  stopAt(voice.node);
}

interface LoopEntry {
  node: AudioBufferSourceNode;
  buffer: AudioBuffer;
  startedAt: number;
  pos: number;
}

interface Slots {
  play(id: SfxId): void;
  loop(id: SfxId, on: boolean): void;
  hold(paused: boolean): void;
  stopAll(): void;
}

function makeSlots(
  ctx: AudioContext,
  master: GainNode,
  count: number,
  typingCap: number,
  typingMinIntervalSec: number,
  load: Loader,
  alive: () => boolean,
): Slots {
  let seq = 0;
  let held = false;
  let lastTypingAt = -Infinity;
  let pressStep = 0;
  let backStep = 0;
  const order = Array.from({ length: count }, () => -1);
  const typingSlots = Array.from({ length: count }, () => false);
  const voices: (VoiceSlot | null)[] = Array.from({ length: count }, () => null);
  const loops = new Map<string, LoopEntry>();
  const loopOn = new Set<string>();
  const loopPos = new Map<string, number>();

  const startLoop = (id: string): void => {
    void load('sfx', id).then((buffer) => {
      if (!buffer || !alive() || ctx.state === 'closed' || held || !loopOn.has(id) || loops.has(id)) return;
      const gain = id === 'rain_loop' ? 0.22 : id === 'lap_fan' ? 0.28 : 0.35;
      const offset = buffer.duration > 0 ? (loopPos.get(id) ?? 0) % buffer.duration : 0;
      const { node } = spawnVoice(ctx, master, buffer, gain, true, offset);
      loops.set(id, { node, buffer, startedAt: ctx.currentTime, pos: offset });
    });
  };

  return {
    play(id) {
      if (typingMinIntervalSec > 0 && THROTTLED_TYPING_SFX.has(id)) {
        const now = ctx.currentTime;
        if (now - lastTypingAt < typingMinIntervalSec) return;
        lastTypingAt = now;
      }
      const step = id === 'key_press' ? pressStep++ : id === 'key_backspace' ? backStep++ : 0;
      const { cue, rate, gain } = nextKeyStyle(id, step);
      void load('sfx', cue).then((buffer) => {
        if (!buffer || !alive() || ctx.state === 'closed') return;
        const isTyping = TYPING_SFX.has(cue);
        const slot = pickCappedSlot(order, typingSlots, isTyping, typingCap);
        stopVoice(ctx, voices[slot], 0.012);
        const trim = SFX_TRIM[cue];
        const offset = trim && buffer.duration > trim.offset + 0.05 ? trim.offset : 0;
        const duration = trim && buffer.duration > offset + trim.duration ? trim.duration : undefined;
        const voice = spawnVoice(ctx, master, buffer, gain, false, offset, duration, rate);
        voices[slot] = voice;
        order[slot] = ++seq;
        typingSlots[slot] = isTyping;
        voice.node.onended = () => {
          if (voices[slot] !== voice) return;
          voices[slot] = null;
          order[slot] = -1;
          typingSlots[slot] = false;
        };
      });
    },
    loop(id, on) {
      if (!on) {
        loopOn.delete(id);
        loopPos.delete(id);
        stopAt(loops.get(id)?.node);
        loops.delete(id);
        return;
      }
      if (loopOn.has(id)) return;
      loopOn.add(id);
      if (!held) startLoop(id);
    },
    hold(paused) {
      if (paused === held) return;
      held = paused;
      if (paused) {
        for (const [id, entry] of loops) {
          const dur = entry.buffer.duration || 0;
          const raw = entry.pos + Math.max(0, ctx.currentTime - entry.startedAt);
          loopPos.set(id, dur > 0 ? raw % dur : 0);
          stopAt(entry.node);
        }
        loops.clear();
        return;
      }
      for (const id of loopOn) startLoop(id);
    },
    stopAll() {
      lastTypingAt = -Infinity;
      pressStep = 0;
      backStep = 0;
      loopOn.clear();
      loopPos.clear();
      for (const entry of loops.values()) stopAt(entry.node);
      loops.clear();
      for (let i = 0; i < voices.length; i += 1) {
        stopVoice(ctx, voices[i]);
        voices[i] = null;
        order[i] = -1;
        typingSlots[i] = false;
      }
    },
  };
}

interface BedRun {
  id: MusicId;
  bedBuffer: AudioBuffer;
  introBuffer: AudioBuffer | null;
  startedAt: number;
  startPos: number;
  looping: boolean;
}

interface Bed {
  set(id: MusicId | null): void;
  hold(paused: boolean): void;
  stopAll(): void;
}

function fadeOutGain(ctx: AudioContext, fading: GainNode | null, handle: BedHandle | null): void {
  if (!fading && !handle) return;
  const t = ctx.currentTime;
  if (fading) rampOut(fading, t, 0.25);
  handle?.stop(t + 0.26);
}

function makeBed(ctx: AudioContext, master: GainNode, load: Loader, alive: () => boolean): Bed {
  let bedId: MusicId | null = null;
  let held = false;
  let active: BedRun | null = null;
  let bedGain: GainNode | null = null;
  let handle: BedHandle | null = null;

  const startRun = (run: BedRun, fadeSec: number): void => {
    if (!alive() || ctx.state === 'closed' || held || bedId !== run.id) return;
    const introDur = run.introBuffer ? run.introBuffer.duration : 0;
    if (!run.looping && run.startPos >= introDur + run.bedBuffer.duration) return;
    const amp = ctx.createGain();
    const t = ctx.currentTime;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(0.55, t + fadeSec);
    amp.connect(master);
    handle = playBed({
      ctx,
      dest: amp,
      bed: run.bedBuffer,
      intro: run.introBuffer,
      startPos: run.startPos,
      looping: run.looping,
      still: () => alive() && !held && bedId === run.id,
    });
    run.startedAt = t;
    bedGain = amp;
  };

  return {
    set(id) {
      if (id === bedId) return;
      bedId = id;
      active = null;
      const fading = bedGain;
      const old = handle;
      bedGain = null;
      handle = null;
      if (ctx.state === 'closed' || !alive()) return;
      fadeOutGain(ctx, fading, old);
      if (!id) return;
      const wanted = id;
      const asset = musicAsset(wanted);
      void Promise.all([
        load('music', asset.bed),
        asset.intro ? load('music', asset.intro) : Promise.resolve(null),
      ]).then(([buffer, intro]) => {
        if (!buffer || !alive() || ctx.state === 'closed' || bedId !== wanted) return;
        active = {
          id: wanted,
          bedBuffer: buffer,
          introBuffer: intro,
          startedAt: ctx.currentTime,
          startPos: 0,
          looping: musicLoops(wanted),
        };
        if (!held) startRun(active, 0.25);
      });
    },
    hold(paused) {
      if (paused === held) return;
      held = paused;
      if (paused) {
        if (active && handle) active.startPos = handle.position(ctx.currentTime);
        handle?.stop();
        handle = null;
        if (bedGain) {
          const t = ctx.currentTime;
          bedGain.gain.cancelScheduledValues(t);
          bedGain.gain.setValueAtTime(0, t);
        }
        bedGain = null;
        return;
      }
      if (active && active.id === bedId && alive() && ctx.state !== 'closed') {
        startRun(active, 0.04);
      }
    },
    stopAll() {
      bedId = null;
      active = null;
      handle?.stop();
      handle = null;
      bedGain = null;
    },
  };
}

/** One context, a pool of one-shot voices, loop slots, and a crossfaded music bed. */
export function createGraph(
  sources = SOUND_SOURCES,
  typingSources = TYPING_SOUND_SOURCES,
  typingMinIntervalMs = TYPING_MIN_INTERVAL_MS,
): AudioGraph {
  const ctx = context();
  if (!ctx) return SILENT;
  const master = ctx.createGain();
  master.connect(ctx.destination);
  let muted = false;
  let volume = 1;
  let closed = false;
  let held = false;
  const alive = (): boolean => !closed;
  const load = makeLoader(ctx);
  const poolSize = Math.max(1, Math.floor(sources));
  const typingCap = Math.min(poolSize, Math.max(1, Math.floor(typingSources)));
  const typingMinIntervalSec = Math.max(0, typingMinIntervalMs) / 1000;
  const slots = makeSlots(ctx, master, poolSize, typingCap, typingMinIntervalSec, load, alive);
  const bed = makeBed(ctx, master, load, alive);
  const apply = (): void => {
    master.gain.value = muted ? 0 : volume;
  };
  let unlocked = typeof window === 'undefined';
  const unbindUnlock = (): void => {
    if (unlocked || typeof window === 'undefined') return;
    unlocked = true;
    for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) {
      window.removeEventListener(ev, onUnlock, true);
    }
  };
  const resume = (): void => {
    if (ctx.state === 'running') {
      unbindUnlock();
      return;
    }
    if (ctx.state === 'suspended') {
      void ctx.resume().then(() => {
        if (ctx.state === 'running') unbindUnlock();
      }).catch(() => {});
    }
  };
  const onUnlock = (): void => {
    resume();
  };
  if (typeof window !== 'undefined' && ctx.state === 'suspended') {
    for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) {
      window.addEventListener(ev, onUnlock, { capture: true, passive: true });
    }
  }
  const syncGain = (nextMuted: boolean, nextVol: number): void => {
    muted = nextMuted;
    volume = Number.isFinite(nextVol) ? Math.min(1, Math.max(0, nextVol)) : 1;
    apply();
  };
  return {
    live: true,
    setMuted: (next) => syncGain(next, volume),
    setVolume: (next) => syncGain(muted, next),
    play(id) {
      resume();
      slots.play(id);
    },
    loop(id, on) {
      if (on && !held) resume();
      slots.loop(id, on);
    },
    bed(id) {
      if (id && !held) resume();
      bed.set(id);
    },
    hold(paused) {
      if (ctx.state === 'closed') return;
      held = paused;
      if (!paused) resume();
      slots.hold(paused);
      bed.hold(paused);
    },
    dispose() {
      closed = true;
      unbindUnlock();
      slots.stopAll();
      bed.stopAll();
      if (ctx.state !== 'closed') void ctx.close().catch(() => {});
    },
  };
}
