import { MUSIC_IDS, SFX_IDS, type MusicId, type SfxId } from '../contracts/audio-cues.js';

/** Sample ids. `scripts/harness/audio-unit.mjs` checks these against `public/sfx` and `public/music`. */
export { MUSIC_IDS, SFX_IDS, type MusicId, type SfxId };

const MUSIC_ONCE = new Set<MusicId>(['rank_card', 'cine_intro', 'cine_outro']);

/** No bed is split. Each looping cue is one file, crossfaded at the join by the player. */
export const MUSIC_SPLIT: Partial<Record<MusicId, { bed: string; intro: string }>> = {};

export function musicLoops(id: MusicId): boolean {
  return !MUSIC_ONCE.has(id);
}

export function musicAsset(id: MusicId): { bed: string; intro?: string } {
  return MUSIC_SPLIT[id] ?? { bed: id };
}

export function sampleUrl(group: 'sfx' | 'music', id: string): string | null {
  if (!/^[a-z0-9_]+$/.test(id)) return null;
  return `/${group}/${id}.mp3`;
}
