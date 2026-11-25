/** Crossfade at a looping bed's join. Hides MP3 padding and a short seam. */
const XFADE_SEC = 0.12;

export interface BedHandle {
  stop(when?: number): void;
  /** Seconds from the start of this play, added to the position it resumed at. */
  position(now: number): number;
}

interface PlayBedOptions {
  ctx: AudioContext;
  dest: AudioNode;
  bed: AudioBuffer;
  intro: AudioBuffer | null;
  startPos: number;
  looping: boolean;
  still: () => boolean;
}

interface Voice {
  src: AudioBufferSourceNode;
  end: number;
  join: number;
}

function stopNode(node: AudioBufferSourceNode, when?: number): void {
  try {
    if (when === undefined) node.stop();
    else node.stop(when);
  } catch {
    // The node already ended.
  }
}

/** One pass of a buffer. Looping passes fade out so the next pass can overlap. */
function arm(
  ctx: AudioContext,
  dest: AudioNode,
  buffer: AudioBuffer,
  when: number,
  offset: number,
  fadeIn: number,
  looping: boolean,
): Voice {
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buffer;
  src.connect(gain);
  gain.connect(dest);
  const dur = Math.max(0.05, buffer.duration);
  const off = ((offset % dur) + dur) % dur;
  const remain = Math.max(0.05, dur - off);
  const x = looping ? Math.min(XFADE_SEC, remain / 3) : 0;
  const end = when + remain;
  const join = end - x;
  src.start(when, off);
  src.stop(end + (looping ? 0 : 0.05));
  const level = gain.gain;
  if (fadeIn > 0) {
    level.setValueAtTime(0.0001, when);
    level.linearRampToValueAtTime(1, when + fadeIn);
  } else {
    level.setValueAtTime(1, when);
  }
  if (looping && x > 0) {
    level.setValueAtTime(1, Math.max(when + fadeIn, join));
    level.linearRampToValueAtTime(0.0001, end);
  }
  return { src, end, join };
}

/**
 * Plays a bed. Looping beds do not use `AudioBufferSourceNode.loop`: decoded
 * MP3 padding clicks at that join. Each pass fades out over the last 120 ms
 * while the next pass fades in on the audio clock.
 */
export function playBed(opts: PlayBedOptions): BedHandle {
  const { ctx, dest, bed, intro, looping, still } = opts;
  const startedAt = ctx.currentTime;
  const origin = opts.startPos;
  const nodes: AudioBufferSourceNode[] = [];
  let timer = 0;
  let stopped = false;

  const chain = (when: number, offset: number, fadeIn: number): void => {
    if (stopped || !still()) return;
    const voice = arm(ctx, dest, bed, when, offset, fadeIn, looping);
    nodes.push(voice.src);
    if (!looping) return;
    const waitMs = Math.max(0, (voice.join - ctx.currentTime - 0.05) * 1000);
    timer = globalThis.setTimeout(() => chain(voice.join, 0, XFADE_SEC), waitMs);
  };

  const introDur = intro?.duration ?? 0;
  if (intro && origin < introDur) {
    const lead = arm(ctx, dest, intro, startedAt, origin, 0, false);
    nodes.push(lead.src);
    chain(startedAt + (introDur - origin), 0, 0);
  } else if (looping || Math.max(0, origin - introDur) < bed.duration) {
    chain(startedAt, Math.max(0, origin - introDur), 0);
  }

  return {
    stop(when) {
      stopped = true;
      if (timer) globalThis.clearTimeout(timer);
      timer = 0;
      for (const node of nodes) stopNode(node, when);
    },
    position(now) {
      return origin + Math.max(0, now - startedAt);
    },
  };
}
