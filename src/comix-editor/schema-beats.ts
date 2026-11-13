import { b, opt, sel, t, type Field } from '../chapter-editor/schema.js';
import { mark, num } from './schema-util.js';

const at = (): Field => mark('at', 'At');
const point = (): Field => t('point', 'Point', { suggest: 'points', mono: true });

export const LIGHTNING: Field[] = [
  at(),
  { type: 'textOrVec', key: 'point', label: 'Point (name or vector)' },
  num('power', 'Power'), num('flash', 'Flash'),
  opt(sel('audio', 'Audio', ['thunder', 'distant'])),
];

export const FX: Field[] = [
  at(), t('preset', 'Preset', { mono: true }), point(),
  opt(num('z', 'Z')), opt(num('dy', 'dy')), num('seed', 'Seed', { step: 1 }),
  opt(num('scale', 'Scale')), opt(t('text', 'Text')),
];

export const FX_REPEAT: Field[] = [
  at(), num('step', 'Step (seconds)'), num('count', 'Count', { step: 1 }),
  t('preset', 'Preset', { mono: true }), point(),
  opt(num('z', 'Z')), num('seed', 'Seed', { step: 1 }), opt(num('scale', 'Scale')),
];

export const LOOK: Field[] = [
  at(),
  opt(t('actor', 'Actor', { suggest: 'actors' })),
  opt(sel('role', 'Role', ['hero', 'agent'])),
  num('x', 'Look x'), num('y', 'Look y'),
];

export const AUDIO: Field[] = [
  at(),
  sel('cue', 'Cue', ['rain_on', 'rain_off', 'thunder', 'burst', 'shatter', 'zap']),
  opt(num('seconds', 'Seconds')),
  opt(b('reverse', 'Reverse')),
];

export const STATE: Field[] = [at(), t('actor', 'Actor', { suggest: 'actors' }), t('state', 'State', { mono: true })];

export const ARCS: Field[] = [at(), num('step', 'Step (seconds)'), num('count', 'Count', { step: 1 }), num('y', 'Y'), num('z', 'Z'), num('flash', 'Flash')];

export const KEYS: Field[] = [mark('from', 'From'), mark('until', 'Until'), num('hz', 'Hz', { step: 0.1 }), num('chance', 'Chance')];

export const SHATTER: Field[] = [
  at(), t('fxFirst', 'First fx', { mono: true }), t('fxRest', 'Rest fx', { mono: true }),
  num('seed', 'Seed', { step: 1 }), num('scale', 'Scale'), num('lift', 'Lift'), num('z', 'Z'),
];
