import { b, opt, sel, t, type Field } from '../chapter-editor/schema.js';
import { mark, num, optMark, panel, SHOT, VEC } from './schema-util.js';

export const SKIP_FIELDS: Field[] = [mark('before', 'Before'), mark('to', 'To')];

export const MANIFEST: Field[] = [
  t('id', 'Id', { mono: true, hint: 'must match the folder name' }),
  t('title', 'Title'),
  t('room', 'Room', { mono: true }),
  { type: 'color', key: 'background', label: 'Background' },
  num('pageCount', 'Page count', { step: 1 }),
  mark('end', 'End'),
  opt(b('holdAtEnd', 'Hold at end')),
  optMark('acceptsKeyFrom', 'Accepts key from'),
  opt(num('inputGraceMs', 'Input grace (ms)', { step: 1 })),
  opt(t('hero', 'Hero actor', { suggest: 'actors' })),
  opt({
    type: 'array',
    key: 'keyframes',
    label: 'Keyframe stills',
    item: { title: (k) => `${String(k.panel)} @ ${String(k.at)}`, fields: [t('panel', 'Panel', { suggest: 'panels', mono: true }), mark('at', 'At')] },
  }),
];

const ACTOR: Field[] = [
  t('id', 'Id', { mono: true }),
  t('model', 'Model', { suggest: 'models', mono: true }),
  opt(t('name', 'Name')),
  opt(sel('role', 'Role', ['hero', 'agent'])),
  opt({ type: 'numbers', key: 'look', label: 'Look (x, y)' }),
  opt(t('home', 'Home point', { suggest: 'points', mono: true })),
  opt(num('inX', 'In x')),
  opt({ type: 'numbers', key: 'to', label: 'To (x, y)' }),
  opt(num('scale', 'Scale')),
  opt(t('mock', 'Mock line')),
  opt(num('order', 'Order', { step: 1 })),
  opt(num('slot', 'Slot', { step: 1 })),
  opt(t('fling', 'Fling point', { suggest: 'points', mono: true })),
];

export const CAST: Field[] = [{
  type: 'array',
  key: 'actors',
  label: 'Actors',
  item: { fields: ACTOR, title: (a) => `${String(a.id)} (${String(a.model)})` },
}];

const PARTS: Field[] = [
  opt(t('glass', 'Glass part', { mono: true })),
  opt({ type: 'strings', key: 'code', label: 'Code parts (one per line)' }),
  opt(t('screen', 'Screen part', { mono: true })),
  opt(t('glassMaterial', 'Glass material', { mono: true })),
  opt(t('amberMaterial', 'Amber material', { mono: true })),
];

const RAIN: Field[] = [num('x', 'X'), num('y', 'Y'), num('w', 'W'), num('h', 'H'), num('z', 'Z')];

const BOLT: Field[] = [
  t('id', 'Id', { mono: true }),
  { type: 'object', key: 'from', label: 'From', fields: VEC },
  { type: 'object', key: 'to', label: 'To', fields: VEC },
  opt(sel('style', 'Style', ['bolt', 'comic'])),
  opt(num('seed', 'Seed', { step: 1 })),
];

const VORTEX: Field[] = [t('at', 'At point', { suggest: 'points', mono: true }), num('z', 'Z'), num('inset', 'Inset')];

export const SET: Field[] = [
  { type: 'record', key: 'points', label: 'Points', keyLabel: 'Name', value: VEC },
  opt({ type: 'object', key: 'monitor', label: 'Monitor', fields: [num('x', 'X'), num('y', 'Y'), num('w', 'W'), num('h', 'H')] }),
  opt({
    type: 'array',
    key: 'props',
    label: 'Props',
    item: {
      title: (p) => `${String(p.id)} ${String(p.model)}`,
      fields: [t('id', 'Id'), t('model', 'Model', { suggest: 'models', mono: true }), t('at', 'At point', { suggest: 'points', mono: true })],
    },
  }),
  opt({ type: 'object', key: 'parts', label: 'Parts', fields: PARTS }),
  opt({ type: 'object', key: 'rain', label: 'Rain', fields: RAIN }),
  opt({ type: 'array', key: 'bolts', label: 'Bolts', item: { fields: BOLT, title: (bolt) => String(bolt.id ?? 'bolt') } }),
  opt({ type: 'object', key: 'vortex', label: 'Vortex', fields: VORTEX }),
];

const PANEL: Field[] = [
  t('id', 'Id', { mono: true }),
  mark('at', 'At'),
  { type: 'numbers', key: 'landscape', label: 'Landscape (x, y, w, h)' },
  { type: 'numbers', key: 'portrait', label: 'Portrait (x, y, w, h)' },
];

export const PAGE: Field[] = [
  num('page', 'Page index', { step: 1 }),
  { type: 'array', key: 'panels', label: 'Panels', item: { fields: PANEL, title: (p) => String(p.id ?? 'panel') } },
];

export const SHOT_TRACK: Field[] = [
  panel(),
  { type: 'object', key: 'from', label: 'From', fields: SHOT },
  opt({ type: 'object', key: 'to', label: 'To', fields: SHOT }),
  opt({ type: 'strings', key: 'span', label: 'Span (two marks)', mark: true }),
  opt(sel('ease', 'Ease', ['linear', 'in', 'out', 'outBack'])),
  opt({ type: 'object', key: 'portrait', label: 'Portrait shot', fields: SHOT }),
  opt({ type: 'object', key: 'landscape', label: 'Landscape shot', fields: SHOT }),
];

const LABELS: Field[] = [t('rank', 'Rank'), t('time', 'Time'), t('commands', 'Commands'), t('shortcuts', 'Shortcuts'), t('press', 'Press')];

export const SPLASH: Field[] = [
  t('panel', 'Panel', { suggest: 'panels', mono: true }),
  t('title', 'Title'),
  mark('at', 'At'),
  mark('keyAt', 'Key at'),
  { type: 'object', key: 'caption', label: 'Caption', fields: [t('text', 'Text'), mark('from', 'From'), num('typeFor', 'Type for (seconds)')] },
  { type: 'record', key: 'rankColor', label: 'Rank colours', keyLabel: 'Rank', value: 'string' },
  { type: 'record', key: 'rankWord', label: 'Rank words', keyLabel: 'Rank', value: 'string' },
  { type: 'object', key: 'labels', label: 'Labels', fields: LABELS },
  t('emptyShortcuts', 'Empty shortcuts'),
  { type: 'color', key: 'fallbackBackground', label: 'Fallback background' },
];

export const MARKS: Field = { type: 'record', key: 'marks', label: 'Marks (seconds)', keyLabel: 'Name', value: 'number' };
