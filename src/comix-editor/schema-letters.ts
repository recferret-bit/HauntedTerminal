import { b, opt, sel, t, type Field } from '../chapter-editor/schema.js';
import { mark, num, optMark, panel } from './schema-util.js';

const sfxPlace = (): Record<'frac' | 'point', Field[]> => ({
  frac: [num('x', 'X'), num('y', 'Y'), num('size', 'Size')],
  point: [t('point', 'Point', { suggest: 'points', mono: true }), num('dx', 'dx'), num('dy', 'dy'), num('size', 'Size')],
});

const bubbleFrac: Field[] = [
  num('x', 'X'), num('y', 'Y'), num('w', 'Width'),
  num('fontH', 'Font height'), num('fontW', 'Font width'), num('minFont', 'Min font', { step: 1 }),
  opt(num('fontOfMin', 'Font of min side')),
  opt(num('yFloor', 'Y floor')),
  opt(num('wChars', 'Width in characters', { step: 1 })),
  t('tail', 'Tail actor', { suggest: 'actors' }),
  num('tailLift', 'Tail lift'), num('tailZ', 'Tail z'),
  opt(sel('tailFrom', 'Tail from', ['live', 'point'])),
  opt(t('tailPoint', 'Tail point', { suggest: 'points', mono: true })),
];

const bubbleFollow: Field[] = [
  t('actor', 'Actor', { suggest: 'actors' }),
  num('lift', 'Lift'), num('z', 'Z'), num('x', 'X'), num('y', 'Y'),
  num('wChars', 'Width in characters', { step: 1 }),
  num('fontScale', 'Font scale'),
  num('tailDx', 'Tail dx'), num('tailDy', 'Tail dy'),
  num('minXChars', 'Min x characters', { step: 1 }),
  num('fontH', 'Font height'), num('fontW', 'Font width'), num('minFont', 'Min font', { step: 1 }),
];

const bubblePlace = (): Record<'frac' | 'follow', Field[]> => ({ frac: bubbleFrac, follow: bubbleFollow });

const place = (union: () => Record<string, Field[]>): Field => ({ type: 'union', key: 'place', label: 'Place', tag: 'mode', union });

export const CAPTION: Field[] = [
  panel(), t('text', 'Text', { rows: 2 }), mark('from', 'From'), num('typeFor', 'Type for (seconds)'),
  opt(b('mono', 'Monospace')), opt(sel('anchor', 'Anchor', ['bottom'])), opt(t('maxWidth', 'Max width')),
];

export const MEME: Field[] = [panel(), t('text', 'Text', { rows: 2 }), mark('at', 'At'), sel('edge', 'Edge', ['top', 'bottom'])];

export const SFX: Field[] = [
  panel(), t('text', 'Text'), mark('at', 'At'), num('hold', 'Hold'),
  { type: 'color', key: 'color', label: 'Colour' }, num('tilt', 'Tilt', { step: 0.1 }),
  opt(t('only', 'Only while panel', { suggest: 'panels', mono: true })),
  opt(b('keep', 'Keep last place on other panels')),
  place(sfxPlace),
];

export const SFX_BURST: Field[] = [
  panel(), { type: 'strings', key: 'words', label: 'Words (one per line)' },
  mark('from', 'From'), num('step', 'Step (seconds)'), num('hold', 'Hold'), opt(num('lastHold', 'Last hold')),
  { type: 'color', key: 'color', label: 'Colour' }, { type: 'numbers', key: 'tilts', label: 'Tilts (comma separated)' },
  t('point', 'Point', { suggest: 'points', mono: true }),
  num('dx', 'dx'), num('dy', 'dy'), num('dxStep', 'dx step'), num('dyStep', 'dy step'),
  num('dxMod', 'dx mod', { step: 1 }), num('dyMod', 'dy mod', { step: 1 }), num('size', 'Size'),
  opt(t('only', 'Only while panel', { suggest: 'panels', mono: true })), opt(b('keep', 'Keep last place')),
];

export const BUBBLE: Field[] = [
  panel(), t('text', 'Text', { rows: 2 }), mark('at', 'At'), optMark('until', 'Until'),
  sel('style', 'Style', ['speech', 'shout', 'thought']),
  opt({ type: 'color', key: 'fill', label: 'Fill' }),
  opt(t('only', 'Only while panel', { suggest: 'panels', mono: true })),
  place(bubblePlace),
];

export const CAST_BUBBLES: Field[] = [
  panel(), mark('at', 'At'), mark('step', 'Step (mark)'), mark('until', 'Until'),
  num('width', 'Width'), num('x0', 'x0'), num('xStep', 'x step'), num('yEven', 'Y even'), num('yOdd', 'Y odd'),
  num('fontH', 'Font height'), num('fontW', 'Font width'), num('minFont', 'Min font', { step: 1 }), num('headLift', 'Head lift'),
];

export const QUEUE: Field[] = [
  panel(), t('title', 'Title'), num('base', 'Base number', { step: 1 }), mark('from', 'From'), num('every', 'Every (seconds)'),
  { type: 'strings', key: 'prompts', label: 'Prompts (one per line)', rows: 6 },
];

export const TAGS: Field[] = [panel(), mark('from', 'From'), num('step', 'Step (seconds)'), num('dy', 'dy'), num('z', 'Z')];

export const LINES: Field[] = [
  panel(), mark('from', 'From'), num('step', 'Step (seconds)'),
  { type: 'strings', key: 'texts', label: 'Lines (one per line)', rows: 4 },
  opt(b('jitter', 'Jitter')),
];

const BRAIN_ROW: Field[] = [t('who', 'Who'), t('what', 'What'), t('bg', 'Background', { hint: 'colour or CSS gradient' }), num('glow', 'Glow', { step: 1 })];

export const BRAIN: Field[] = [
  panel(), mark('from', 'From'), num('step', 'Step (seconds)'),
  { type: 'array', key: 'rows', label: 'Rows', item: { fields: BRAIN_ROW, title: (row) => `${String(row.who)}: ${String(row.what)}` } },
];

export const CARD: Field[] = [
  mark('at', 'At'), t('title', 'Title'), t('path', 'Path', { mono: true }),
  mark('typeFrom', 'Type from'), mark('typeTo', 'Type to'), mark('fadeFrom', 'Fade from'), mark('fadeTo', 'Fade to'),
];

export const PAGE_TURN: Field[] = [num('page', 'Page index', { step: 1 }), mark('from', 'From'), mark('to', 'To'), sel('ease', 'Ease', ['in', 'quad'])];

export const PANEL_FLASH: Field[] = [
  panel(), mark('at', 'At'), num('dur', 'Duration'), num('opacity', 'Opacity'),
  opt(num('fade', 'Fade extra')), opt(num('fadeFrom', 'Fade from opacity')),
  opt(b('hold', 'Hold at full opacity')), opt(t('only', 'Only while panel', { suggest: 'panels', mono: true })),
];

export const INVERT: Field[] = [panel(), mark('at', 'At'), num('from', 'From (seconds)'), num('to', 'To (seconds)')];
