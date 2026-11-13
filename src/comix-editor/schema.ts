import type { Beat, Letter, PoseProgram } from '../cinematic/spec-types.js';
import type { ArrayItem, Field } from '../chapter-editor/schema.js';
import { AUDIO, ARCS, FX, FX_REPEAT, KEYS, LIGHTNING, LOOK, SHATTER, STATE } from './schema-beats.js';
import { CAST, MANIFEST, MARKS, PAGE, SET, SHOT_TRACK, SKIP_FIELDS, SPLASH } from './schema-files.js';
import {
  BRAIN, BUBBLE, CAPTION, CARD, CAST_BUBBLES, INVERT, LINES, MEME, PAGE_TURN, PANEL_FLASH, QUEUE, SFX, SFX_BURST, TAGS,
} from './schema-letters.js';
import {
  BOLT_FLICKER, EMERGE, FLIGHT, FLING, MONITOR, PIXELATE, RAIN, SCREEN_BLAZE, SEATED, SHAKE, STAGE_FLASH, SUCK,
} from './schema-poses.js';

/**
 * Field tables for `comix/<id>/`. A new letter, beat or pose kind is added in `spec-types.ts`, interpreted once
 * in `src/cinematic/`, and given a branch here. The `Record<...['kind']>` return type fails `tsc` until the form exists.
 */
export const LETTER_VARIANTS = (): Record<Letter['kind'], Field[]> => ({
  caption: CAPTION,
  meme: MEME,
  sfx: SFX,
  sfx_burst: SFX_BURST,
  bubble: BUBBLE,
  cast_bubbles: CAST_BUBBLES,
  queue: QUEUE,
  tags: TAGS,
  lines: LINES,
  brain: BRAIN,
  card: CARD,
  page_turn: PAGE_TURN,
  panel_flash: PANEL_FLASH,
  invert: INVERT,
});

export const BEAT_VARIANTS = (): Record<Beat['kind'], Field[]> => ({
  lightning: LIGHTNING,
  fx: FX,
  fx_repeat: FX_REPEAT,
  look: LOOK,
  audio: AUDIO,
  state: STATE,
  arcs: ARCS,
  keys: KEYS,
  shatter_cast: SHATTER,
});

export const POSE_VARIANTS = (): Record<PoseProgram['kind'], Field[]> => ({
  seated: SEATED,
  suck: SUCK,
  rain: RAIN,
  monitor: MONITOR,
  emerge: EMERGE,
  flight: FLIGHT,
  fling: FLING,
  screen_blaze: SCREEN_BLAZE,
  bolt_flicker: BOLT_FLICKER,
  shake: SHAKE,
  stage_flash: STAGE_FLASH,
  pixelate: PIXELATE,
});

export { SKIP_FIELDS };

function kindTitle(item: Record<string, unknown>): string {
  const text = item.text ?? item.title ?? item.actor ?? item.id ?? '';
  const bits = Array.isArray(text) ? text.join(' ') : String(text);
  return `${String(item.kind ?? '')} ${bits}`.replace(/\s+/g, ' ').trim().slice(0, 72);
}

const letterItem = (): ArrayItem => ({ union: LETTER_VARIANTS, title: kindTitle });
const beatItem = (): ArrayItem => ({ union: BEAT_VARIANTS, title: kindTitle });

export const POSES: Field[] = [{
  type: 'array',
  key: 'programs',
  label: 'Programs',
  item: { union: POSE_VARIANTS, title: kindTitle },
}];

export type ComixShape =
  | { root: 'object'; fields: Field[]; extra?: readonly string[] }
  | { root: 'record'; field: Field }
  | { root: 'list'; label: string; item: ArrayItem };

/** Which field table edits this spec path. `null` means JSON only. */
export function shapeFor(path: string): ComixShape | null {
  if (path.startsWith('pages/') && path.endsWith('.json')) return { root: 'object', fields: PAGE };
  switch (path) {
    case 'manifest.json':
      return { root: 'object', fields: MANIFEST, extra: ['skip'] };
    case 'marks.json':
      return { root: 'record', field: MARKS };
    case 'cast.json':
      return { root: 'object', fields: CAST };
    case 'set.json':
      return { root: 'object', fields: SET };
    case 'letters.json':
      return { root: 'list', label: 'Letters', item: letterItem() };
    case 'beats.json':
      return { root: 'list', label: 'Beats', item: beatItem() };
    case 'camera.json':
      return { root: 'list', label: 'Shots', item: { fields: SHOT_TRACK, title: (shot) => String(shot.panel ?? 'shot') } };
    case 'poses.json':
      return { root: 'object', fields: POSES };
    case 'splash.json':
      return { root: 'object', fields: SPLASH };
    default:
      return null;
  }
}
