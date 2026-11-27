import { ambientObjectField, ROOM_SOCKETS, transformFields } from '../editor-core/scene-fields.js';
import { alt, n, opt, sel, t, type Field } from '../editor-core/schema.js';

const stageHeroField = (): Field =>
  alt(
    'hero',
    'Hero placement (number = X, or object)',
    'number',
    [n('x', 'X', { step: 0.05 }), ...transformFields({ includeY: true })],
    { optional: true, defaultScalar: 1.5 },
  );

const stageEntryPortField = (): Field =>
  alt(
    'entryPort',
    'Entry port (false hides it)',
    'bool',
    [
      opt(t('label', 'Label')),
      opt(t('model', 'Model', { suggest: 'models' })),
      opt(n('x', 'X', { step: 0.05 })),
      opt(sel('socket', 'Room socket', ROOM_SOCKETS)),
      opt(t('sfx', 'Enter SFX cue', { suggest: 'sfx', mono: true })),
      ...transformFields({ includeY: true }),
    ],
    { optional: true, defaultScalar: false },
  );

const STAGE_SUBDIR_FIELDS: Field[] = [
  stageHeroField(),
  stageEntryPortField(),
  opt({ type: 'color', key: 'backdrop', label: 'Backdrop colour (#rrggbb)' }),
  ambientObjectField(),
  opt(t('music', 'Music cue override', { suggest: 'music', mono: true })),
  opt(t('sfx', 'Enter SFX cue', { suggest: 'sfx', mono: true })),
  opt(t('caption', 'Room caption override')),
];

const STAGE_FIELDS: Field[] = [
  stageHeroField(),
  stageEntryPortField(),
  {
    type: 'object',
    key: 'kiro',
    label: 'Kiro.d placement & transform override',
    optional: true,
    fields: [
      opt(n('x', 'X', { step: 0.05 })),
      opt(t('target', 'Anchor socket or entity', { mono: true })),
      opt(t('label', 'Stage label')),
      ...transformFields({ includeY: true }),
    ],
  },
  opt({ type: 'color', key: 'backdrop', label: 'Backdrop sky colour (#rrggbb)' }),
  ambientObjectField(),
  opt(t('music', 'Level music cue', { suggest: 'music', mono: true })),
  {
    type: 'object',
    key: 'sfx',
    label: 'Room SFX cues',
    optional: true,
    fields: [
      opt(t('enter', 'Enter room SFX', { suggest: 'sfx', mono: true })),
      opt(t('deny', 'Permission denied SFX', { suggest: 'sfx', mono: true })),
      opt(t('exit', 'Exit gate SFX', { suggest: 'sfx', mono: true })),
    ],
  },
  opt({
    type: 'record',
    key: 'subdirs',
    label: 'Subdirectory room overrides (key = cwd)',
    keyLabel: 'Directory path',
    value: STAGE_SUBDIR_FIELDS,
  }),
];

export const STAGE_OBJECT_FIELD: Field = {
  type: 'object',
  key: 'stage',
  label: 'Stage placement, backdrop, ambient & audio',
  optional: true,
  fields: STAGE_FIELDS,
};
