import type { LetterNodes } from './letters-build.js';
import type { ComixWorld } from './reel.js';

function crossed(prev: number, t: number, at: number): boolean {
  return prev < at && t >= at;
}

/** One-shot letter and camera cues as the timeline crosses their start. */
export function cueComixAudio(world: ComixWorld, letters: LetterNodes, t: number): void {
  const prev = world.prev;
  const sound = world.sound;
  for (const row of letters.captions) if (crossed(prev, t, row.node.t0)) sound.letter('caption');
  for (const row of letters.sfx) if (crossed(prev, t, row.node.t0)) sound.letter('slam');
  for (const seq of letters.sfxSeqs) for (const node of seq.nodes) if (crossed(prev, t, node.t0)) sound.letter('slam');
  for (const row of letters.bubbles) if (crossed(prev, t, row.node.t0)) sound.letter('bubble');
  for (const row of letters.glitches) if (crossed(prev, t, row.from)) sound.letter('glitch');
  for (const row of letters.flashes) if (crossed(prev, t, row.at)) sound.letter('flash');
  for (const row of letters.inverts) if (crossed(prev, t, row.at)) sound.letter('invert');
  for (const tr of world.timeline.tracks) {
    if (!crossed(prev, t, tr.from)) continue;
    if (tr.spec.kind === 'camera_shake') sound.letter('shake');
    else if (tr.spec.kind === 'pixelate') sound.letter('pixel');
  }
}
