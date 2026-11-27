import { MUSIC_IDS, SFX_IDS, type MusicId, type SfxId } from '../audio/catalog.js';
import {
  DEFAULT_LOOP_GAIN,
  KEY_VARIANTS,
  LOOP_CUE_IDS,
  LOOP_GAINS,
  SFX_TRIM,
  SPEECH_SFX,
  TAUNT_VARIANTS,
  TYPING_SFX,
  type SfxTrimWindow,
} from '../audio/config.js';
import { LOOP_TAKES } from '../audio/loop-takes.js';

export type CueGroup = 'sfx' | 'music';
export type AudioFilterId = 'all' | 'trimmed' | 'voice' | 'loop' | 'typing' | 'music';

export interface AudioCueItem {
  id: string;
  group: CueGroup;
  trimmed: boolean;
  loop: boolean;
  voice: boolean;
  typing: boolean;
  variants: readonly string[];
}

export const AUDIO_FILTERS: ReadonlyArray<{ id: AudioFilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'trimmed', label: 'SFX_TRIM' },
  { id: 'voice', label: 'Voices' },
  { id: 'loop', label: 'Loops' },
  { id: 'typing', label: 'Typing' },
  { id: 'music', label: 'Music' },
];

const LOOP_SET = new Set<string>(LOOP_CUE_IDS);
const VARIANT_MAP = new Map<string, readonly string[]>();

for (const list of [...Object.values(KEY_VARIANTS), ...Object.values(TAUNT_VARIANTS), ...Object.values(LOOP_TAKES)]) {
  if (!list?.length) continue;
  for (const id of list) VARIANT_MAP.set(id, list);
}

export function buildCatalogItems(): AudioCueItem[] {
  const sfx: AudioCueItem[] = SFX_IDS.map((id) => ({
    id,
    group: 'sfx',
    trimmed: Boolean(SFX_TRIM[id]),
    loop: LOOP_SET.has(id) || id.includes('_loop'),
    voice: SPEECH_SFX.has(id),
    typing: TYPING_SFX.has(id),
    variants: VARIANT_MAP.get(id) ?? [id],
  }));
  const music: AudioCueItem[] = MUSIC_IDS.map((id) => ({
    id,
    group: 'music',
    trimmed: false,
    loop: id !== 'rank_card' && id !== 'cine_intro' && id !== 'cine_outro',
    voice: false,
    typing: false,
    variants: [id],
  }));
  return [...sfx, ...music];
}

export function filterCatalogItems(
  items: readonly AudioCueItem[],
  filter: AudioFilterId,
  query: string,
): AudioCueItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (filter === 'trimmed' && !item.trimmed) return false;
    if (filter === 'voice' && !item.voice) return false;
    if (filter === 'loop' && !item.loop) return false;
    if (filter === 'typing' && !item.typing) return false;
    if (filter === 'music' && item.group !== 'music') return false;
    return q ? item.id.toLowerCase().includes(q) : true;
  });
}

export function isSfxId(id: string): id is SfxId {
  return (SFX_IDS as readonly string[]).includes(id);
}

export function isMusicId(id: string): id is MusicId {
  return (MUSIC_IDS as readonly string[]).includes(id);
}

export function defaultTrimFor(id: string): SfxTrimWindow {
  if (isSfxId(id) && SFX_TRIM[id]) return { ...SFX_TRIM[id]! };
  return { offset: 0 };
}

export function defaultLoopGainFor(id: SfxId): number {
  return LOOP_GAINS[id] ?? DEFAULT_LOOP_GAIN;
}

export function formatTrimSnippet(id: string, trim: SfxTrimWindow): string {
  const off = Math.max(0, Math.round(trim.offset * 1000) / 1000);
  if (trim.duration !== undefined && trim.duration > 0) {
    const dur = Math.round(trim.duration * 1000) / 1000;
    return `${id}: { offset: ${off}, duration: ${dur} },`;
  }
  return `${id}: { offset: ${off} },`;
}
