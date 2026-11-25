import type { MusicId, SfxId } from './catalog.js';
import { musicAsset, musicLoops, sampleUrl } from './catalog.js';
import { SOUND_SOURCES } from './limits.js';
import { pickSlot } from './voices.js';

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

function spawn(
  ctx: AudioContext,
  master: GainNode,
  buffer: AudioBuffer,
  gain: number,
  loop: boolean,
  offset = 0,
): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  const amp = ctx.createGain();
  amp.gain.value = gain;
  src.buffer = buffer;
  src.loop = loop;
  src.connect(amp).connect(master);
  if (offset > 0) src.start(0, offset);
  else src.start();
  return src;
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

function makeSlots(ctx: AudioContext, master: GainNode, count: number, load: Loader, alive: () => boolean): Slots {
  let seq = 0;
  let held = false;
  const order = Array.from({ length: count }, () => -1);
  const voices: (AudioBufferSourceNode | null)[] = Array.from({ length: count }, () => null);
  const loops = new Map<string, LoopEntry>();
  const loopOn = new Set<string>();
  const loopPos = new Map<string, number>();

  const startLoop = (id: string): void => {
    void load('sfx', id).then((buffer) => {
      if (!buffer || !alive() || ctx.state === 'closed' || held || !loopOn.has(id) || loops.has(id)) return;
      const gain = id === 'rain_loop' ? 0.22 : id === 'lap_fan' ? 0.28 : 0.35;
      const offset = buffer.duration > 0 ? (loopPos.get(id) ?? 0) % buffer.duration : 0;
      const node = spawn(ctx, master, buffer, gain, true, offset);
      loops.set(id, { node, buffer, startedAt: ctx.currentTime, pos: offset });
    });
  };

  return {
    play(id) {
      void load('sfx', id).then((buffer) => {
        if (!buffer || !alive() || ctx.state === 'closed') return;
        const slot = pickSlot(order);
        stopAt(voices[slot]);
        const src = spawn(ctx, master, buffer, 0.9, false);
        voices[slot] = src;
        order[slot] = ++seq;
        src.onended = () => {
          if (voices[slot] !== src) return;
          voices[slot] = null;
          order[slot] = -1;
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
      loopOn.clear();
      loopPos.clear();
      for (const entry of loops.values()) stopAt(entry.node);
      loops.clear();
      for (let i = 0; i < voices.length; i += 1) {
        stopAt(voices[i]);
        voices[i] = null;
        order[i] = -1;
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

function fadeOutGain(
  ctx: AudioContext,
  fading: GainNode | null,
  old: AudioBufferSourceNode | null,
  oldIntro: AudioBufferSourceNode | null,
): void {
  if (!fading) return;
  const t = ctx.currentTime;
  fading.gain.cancelScheduledValues(t);
  fading.gain.setValueAtTime(Math.max(0.0001, fading.gain.value), t);
  fading.gain.linearRampToValueAtTime(0.0001, t + 0.25);
  stopAt(old, t + 0.26);
  stopAt(oldIntro, t + 0.26);
}

function makeBed(ctx: AudioContext, master: GainNode, load: Loader, alive: () => boolean): Bed {
  let bedId: MusicId | null = null;
  let held = false;
  let active: BedRun | null = null;
  let bedGain: GainNode | null = null;
  let bedSrc: AudioBufferSourceNode | null = null;
  let introSrc: AudioBufferSourceNode | null = null;

  const startRun = (run: BedRun, fadeSec: number): void => {
    if (!alive() || ctx.state === 'closed' || held || bedId !== run.id) return;
    const introDur = run.introBuffer ? run.introBuffer.duration : 0;
    if (!run.looping && run.startPos >= introDur + run.bedBuffer.duration) return;
    const amp = ctx.createGain();
    const t = ctx.currentTime;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(0.55, t + fadeSec);
    amp.connect(master);
    const src = ctx.createBufferSource();
    src.buffer = run.bedBuffer;
    src.loop = run.looping;
    src.connect(amp);
    let lead: AudioBufferSourceNode | null = null;
    if (run.introBuffer && run.startPos < introDur) {
      lead = ctx.createBufferSource();
      lead.buffer = run.introBuffer;
      lead.connect(amp);
      lead.start(t, run.startPos);
      src.start(t + Math.max(0, introDur - run.startPos));
    } else {
      let offset = Math.max(0, run.startPos - introDur);
      if (run.looping && run.bedBuffer.duration > 0) offset %= run.bedBuffer.duration;
      src.start(t, offset);
    }
    run.startedAt = t;
    bedGain = amp;
    bedSrc = src;
    introSrc = lead;
  };

  return {
    set(id) {
      if (id === bedId) return;
      bedId = id;
      active = null;
      const fading = bedGain;
      const old = bedSrc;
      const oldIntro = introSrc;
      bedGain = null;
      bedSrc = null;
      introSrc = null;
      if (ctx.state === 'closed' || !alive()) return;
      fadeOutGain(ctx, fading, old, oldIntro);
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
        if (active && (bedSrc || introSrc)) {
          active.startPos += Math.max(0, ctx.currentTime - active.startedAt);
        }
        stopAt(bedSrc);
        stopAt(introSrc);
        if (bedGain) {
          const t = ctx.currentTime;
          bedGain.gain.cancelScheduledValues(t);
          bedGain.gain.setValueAtTime(0, t);
        }
        bedGain = null;
        bedSrc = null;
        introSrc = null;
        return;
      }
      if (active && active.id === bedId && alive() && ctx.state !== 'closed') {
        startRun(active, 0.04);
      }
    },
    stopAll() {
      bedId = null;
      active = null;
      stopAt(bedSrc);
      stopAt(introSrc);
      bedGain = null;
      bedSrc = null;
      introSrc = null;
    },
  };
}

/** One context, a pool of one-shot voices, loop slots, and a crossfaded music bed. */
export function createGraph(sources = SOUND_SOURCES): AudioGraph {
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
  const slots = makeSlots(ctx, master, Math.max(1, Math.floor(sources)), load, alive);
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
