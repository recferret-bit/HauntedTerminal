import { b, n, opt, sel, t, type Field } from '../chapter-editor/schema.js';
import { timeField as time, VEC3_FIELDS } from './schema-fields.js';
import { LETTER_VARIANTS, OVERLAY_VARIANTS, letterTitle } from './schema-letters.js';
import { BEAT_VARIANTS, FIXTURE_VARIANTS, TRACK_VARIANTS, beatTitle, trackTitle } from './schema-tracks.js';

/**
 * Schema tables driving `/comix-editor` forms and `src/comix-editor/check.ts` static validation.
 * Every tagged union in `src/cinematic/spec-types.ts` maps to a `Record<...['kind'], Field[]>` table so adding a
 * new spec capability without updating the editor fails `tsc` at compile time.
 */

const SHOT_FIELDS: Field[] = [
  n('x', 'Centre X', { step: 0.05 }),
  n('y', 'Centre Y', { step: 0.05 }),
  n('w', 'Width', { step: 0.1 }),
  n('h', 'Height', { step: 0.1 }),
];

export const COMIX_MANIFEST_FIELDS: Field[] = [
  t('title', 'Title'),
  t('subtitle', 'Subtitle', { rows: 2 }),
  t('summary', 'Summary', { rows: 4 }),
  opt(sel('role', 'Game role', ['opening', 'ending', 'interlude', 'standalone'])),
  sel('status', 'Status', ['playable', 'draft']),
  n('durationSec', 'Duration (seconds)', { step: 0.1 }),
  opt(b('holdAtEnd', 'Hold on final frame until key/click')),
  opt(time('acceptsKeyFrom', 'Accept dismiss key/click from')),
  opt(n('inputGraceMs', 'Input grace window (ms)', { step: 50 })),
  opt({ type: 'record', key: 'cues', label: 'Shared named cues (seconds)', keyLabel: 'CUE_NAME', value: 'number' }),
];

export const STAGE_INNER_FIELDS: Field[] = [
  t('room', 'Room model', { suggest: 'rooms', mono: true }),
  { type: 'color', key: 'background', label: 'Sky / stage background' },
  opt(b('clampToRoom', 'Clamp camera inside room shell', { defaultTrue: true })),
  { type: 'record', key: 'points', label: 'Named 3D landmarks', keyLabel: 'pointId', value: VEC3_FIELDS },
  opt({
    type: 'array',
    key: 'props',
    label: 'Set props',
    item: {
      title: (p) => `${String(p.id)} (${String(p.model)}) @ ${typeof p.at === 'string' ? p.at : 'vec3'}`,
      fields: [
        t('id', 'Prop id', { mono: true }),
        t('model', 'Model', { suggest: 'models', mono: true }),
        { type: 'textOrVec', key: 'at', label: 'Position' },
        opt(n('scale', 'Scale', { step: 0.05 })),
      ],
    },
  }),
  opt({
    type: 'array',
    key: 'fixtures',
    label: 'Stage fixtures (rain, bolts, vortex)',
    item: {
      union: FIXTURE_VARIANTS,
      title: (f) => `${String(f.kind)}: ${String(f.id ?? '')}`,
    },
  }),
];

export const COMIX_STAGE_FIELDS: Field[] = [
  { type: 'object', key: 'stage', label: '3D Stage & Landmarks', fields: STAGE_INNER_FIELDS },
];

export const COMIX_CAST_FIELDS: Field[] = [
  {
    type: 'array',
    key: 'cast',
    label: 'Cast actors',
    item: {
      title: (a) => `${String(a.id)} (${String(a.model)})${a.visible === false ? ' [starts hidden]' : ''}`,
      fields: [
        t('id', 'Actor id', { mono: true }),
        t('model', 'Catalog model', { suggest: 'models', mono: true }),
        opt(t('label', 'Display label')),
        opt({ type: 'textOrVec', key: 'at', label: 'Initial position' }),
        opt(n('scale', 'Initial scale', { step: 0.02 })),
        opt(n('rotationZ', 'Initial Z rotation (rad)', { step: 0.02 })),
        opt(b('visible', 'Visible at t = 0', { defaultTrue: true })),
        opt({ type: 'numbers', key: 'look', label: 'Initial look [x, y]' }),
      ],
    },
  },
];

export const PANEL_LETTERS_FIELD: Field = {
  type: 'array',
  key: 'letters',
  label: 'Panel lettering & cards',
  optional: true,
  item: { union: LETTER_VARIANTS, title: letterTitle, play: 'steps' },
};

export const PANEL_BEATS_FIELD: Field = {
  type: 'array',
  key: 'beats',
  label: 'Discrete beats (FX, lightning, look, state, audio)',
  optional: true,
  item: { union: BEAT_VARIANTS, title: beatTitle, play: 'steps' },
};

export const PANEL_TRACKS_FIELD: Field = {
  type: 'array',
  key: 'tracks',
  label: 'Continuous tracks (motion, rig, tint, light, shake)',
  optional: true,
  item: { union: TRACK_VARIANTS, title: trackTitle, play: 'steps' },
};

export const PAGE_TRACKS_FIELD: Field = {
  type: 'array',
  key: 'tracks',
  label: 'Page-wide continuous tracks',
  optional: true,
  item: { union: TRACK_VARIANTS, title: trackTitle, play: 'steps' },
};

export const PANEL_CORE_FIELDS: Field[] = [
  t('id', 'Panel id', { mono: true }),
  t('title', 'Panel title'),
  time('from', 'Cut in at'),
  time('until', 'Until'),
  opt(time('snapshotAt', 'Freeze snapshot keyframe at')),
  {
    type: 'object',
    key: 'layout',
    label: 'Page rect [x, y, w, h] in 0..1',
    fields: [
      { type: 'numbers', key: 'landscape', label: 'Landscape [x, y, w, h]' },
      { type: 'numbers', key: 'portrait', label: 'Portrait [x, y, w, h]' },
    ],
  },
  {
    type: 'object',
    key: 'camera',
    label: 'Orthographic world camera shot',
    fields: [
      { type: 'object', key: 'from', label: 'Start shot', fields: SHOT_FIELDS },
      opt({ type: 'object', key: 'to', label: 'End shot (pan/zoom)', fields: SHOT_FIELDS }),
      opt({ type: 'strings', key: 'span', label: 'Pan/zoom span [start, end] (2 lines)', rows: 2 }),
      opt(sel('ease', 'Camera ease', ['linear', 'in', 'out', 'outBack'])),
      opt({ type: 'object', key: 'portrait', label: 'Portrait shot override', fields: SHOT_FIELDS }),
    ],
  },
];

export const PAGE_OVERVIEW_FIELDS: Field[] = [
  t('title', 'Page title'),
  t('summary', 'Page summary', { rows: 3 }),
  n('from', 'Page start (s)', { step: 0.1 }),
  n('until', 'Page end (s)', { step: 0.1 }),
  opt({ type: 'record', key: 'cues', label: 'Page named cues (seconds)', keyLabel: 'CUE_NAME', value: 'number' }),
  opt({
    type: 'object',
    key: 'turn',
    label: 'Page-turn 3D flip transition',
    fields: [
      time('from', 'Turn starts at'),
      time('to', 'Turn completes at'),
      sel('ease', 'Turn ease', ['in', 'quad']),
    ],
  }),
  opt({
    type: 'array',
    key: 'overlays',
    label: 'Full-page overlays (title cards)',
    item: {
      union: OVERLAY_VARIANTS,
      title: (o) => `${String(o.kind)}: ${String(o.title ?? '')} @ ${String(o.at ?? '')}`,
      play: 'steps',
    },
  }),
];

export const PAGE_PANELS_FIELDS: Field[] = [
  {
    type: 'array',
    key: 'panels',
    label: 'Panels on this page',
    item: {
      title: (p, i) => `${i + 1}. ${String(p.id ?? '')} — ${String(p.title ?? '')} (${String(p.from ?? '')} → ${String(p.until ?? '')})`,
      fields: PANEL_CORE_FIELDS,
      play: 'steps',
    },
  },
];

export const ALL_MANIFEST_FIELDS: Field[] = [
  ...COMIX_MANIFEST_FIELDS,
  ...COMIX_STAGE_FIELDS,
  ...COMIX_CAST_FIELDS,
];

export const ALL_PANEL_FIELDS: Field[] = [
  ...PANEL_CORE_FIELDS,
  PANEL_LETTERS_FIELD,
  PANEL_BEATS_FIELD,
  PANEL_TRACKS_FIELD,
];

export const ALL_PAGE_FIELDS: Field[] = [
  ...PAGE_OVERVIEW_FIELDS,
  PAGE_TRACKS_FIELD,
  {
    type: 'array',
    key: 'panels',
    label: 'Panels',
    item: {
      title: (p) => String(p.id ?? ''),
      fields: ALL_PANEL_FIELDS,
    },
  },
];
