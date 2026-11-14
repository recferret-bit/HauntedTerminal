import { n, opt, t, type Field } from '../editor-core/schema.js';

export const timeField = (key: string, label: string): Field =>
  t(key, label, { mono: true, suggest: 'marks', hint: 'sec, +offset, or CUE+0.2' });

export const ptRefField = (key: string, label: string): Field => ({
  type: 'textOrVec',
  key,
  label,
});

export const colorField = (key: string, label: string): Field => ({
  type: 'color',
  key,
  label,
});

export const VEC3_FIELDS: Field[] = [
  n('x', 'X', { step: 0.05 }),
  n('y', 'Y', { step: 0.05 }),
  n('z', 'Z', { step: 0.05 }),
];

export const ACTOR_WINDOW_FIELDS: Field[] = [
  t('actor', 'Actor id', { suggest: 'actors', mono: true }),
  timeField('from', 'From'),
  opt(timeField('until', 'Until')),
];

export const FX_TARGET_FIELDS: Field[] = [
  t('preset', 'FX preset', { suggest: 'fx', mono: true }),
  ptRefField('point', 'Target point'),
  opt({ type: 'object', key: 'offset', label: 'World offset', fields: VEC3_FIELDS }),
  opt(n('seed', 'Seed')),
  opt(n('scale', 'Scale', { step: 0.05 })),
];
