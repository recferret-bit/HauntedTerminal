import { b, opt, t, type Field } from '../chapter-editor/schema.js';
import { mark, num, optMark } from './schema-util.js';

const actor = (): Field => t('actor', 'Actor', { suggest: 'actors' });
const point = (key: string, label: string): Field => t(key, label, { suggest: 'points', mono: true });

export const SEATED: Field[] = [
  actor(), mark('typingUntil', 'Typing until'), optMark('typingMidUntil', 'Typing mid until'),
  opt(num('typingMid', 'Typing mid')), opt(b('lantern', 'Lantern')),
];

export const SUCK: Field[] = [
  actor(), mark('from', 'From'), mark('to', 'To'), mark('hideAt', 'Hide at'),
  point('target', 'Target point'), point('home', 'Home point'),
  optMark('recoilAt', 'Recoil at'), opt(num('recoilDur', 'Recoil duration')), num('steps', 'Steps', { step: 1 }),
];

export const RAIN: Field[] = [mark('until', 'Until')];

export const MONITOR: Field[] = [
  mark('hideGlassAt', 'Hide glass at'), mark('hideCodeAt', 'Hide code at'),
  mark('vortexFrom', 'Vortex from'), mark('vortexUntil', 'Vortex until'),
  num('grow', 'Grow'), num('steps', 'Steps', { step: 1 }),
  mark('amberAt', 'Amber at'),
  { type: 'color', key: 'amberOn', label: 'Amber on' }, { type: 'color', key: 'amberOff', label: 'Amber off' },
  { type: 'pairs', key: 'glitch', label: 'Glitch windows (from, to)', mark: true },
  num('glitchHz', 'Glitch Hz', { step: 0.1 }),
  { type: 'strings', key: 'glitchColors', label: 'Glitch colours (one per line)' },
];

export const EMERGE: Field[] = [
  mark('showFrom', 'Show from'), mark('hideAt', 'Hide at'), mark('wakeAt', 'Wake at'), num('wakeDur', 'Wake duration'),
  mark('riseAt', 'Rise at'), num('riseDur', 'Rise duration'), num('stagger', 'Stagger'),
  mark('leanFrom', 'Lean from'), mark('leanTo', 'Lean to'),
  num('inScale', 'In scale'), num('awakeScale', 'Awake scale'), num('awakeSteps', 'Awake steps', { step: 1 }),
  num('inZ', 'In z'), num('outZ', 'Out z'), num('riseSteps', 'Rise steps', { step: 1 }), num('slump', 'Slump'),
];

export const FLIGHT: Field[] = [
  actor(), mark('from', 'From'), mark('to', 'To'),
  point('origin', 'Origin'), point('dest', 'Destination'),
  num('arc', 'Arc'), num('steps', 'Steps', { step: 1 }), num('originDy', 'Origin dy'),
];

export const FLING: Field[] = [
  mark('from', 'From'), mark('to', 'To'), num('stagger', 'Stagger'),
  point('origin', 'Origin'), num('originDy', 'Origin dy'), num('scale', 'Scale'),
  num('steps', 'Steps', { step: 1 }), mark('hideAt', 'Hide at'), num('z', 'Z'),
];

export const SCREEN_BLAZE: Field[] = [
  mark('until', 'Until'), point('anchor', 'Anchor'), num('calm', 'Calm'),
  mark('blinkUntil', 'Blink until'), num('blinkHz', 'Blink Hz', { step: 0.1 }),
  num('blinkBase', 'Blink base'), num('blinkAmp', 'Blink amp'),
];

export const BOLT_FLICKER: Field[] = [
  t('id', 'Bolt id', { mono: true }), mark('at', 'At'), num('dur', 'Duration'),
  num('hz', 'Hz', { step: 0.1 }), num('every', 'Every', { step: 1 }), num('skip', 'Skip', { step: 1 }),
  opt(num('settleAfter', 'Settle after')),
];

const SHAKE_WINDOW: Field[] = [mark('at', 'At'), num('dur', 'Duration'), num('amp', 'Amp')];

const PULL: Field[] = [
  mark('from', 'From'), mark('until', 'Until'), num('base', 'Base'), num('gain', 'Gain'),
  mark('spanFrom', 'Span from'), mark('spanTo', 'Span to'),
];

export const SHAKE: Field[] = [
  { type: 'array', key: 'windows', label: 'Windows', item: { fields: SHAKE_WINDOW, title: (w) => String(w.at ?? '') } },
  opt({ type: 'object', key: 'pull', label: 'Pull', fields: PULL }),
];

const FLASH_RULE: Field[] = [
  mark('from', 'From'), optMark('until', 'Until'), opt(num('dur', 'Duration')), opt(num('amp', 'Amp')),
  opt(num('hz', 'Hz', { step: 0.1 })), opt(num('add', 'Add')), opt(b('pull', 'Pull')), opt(num('pullGain', 'Pull gain')),
];

export const STAGE_FLASH: Field[] = [
  point('anchor', 'Anchor'),
  { type: 'array', key: 'rules', label: 'Rules', item: { fields: FLASH_RULE, title: (r) => String(r.from ?? '') } },
];

export const PIXELATE: Field[] = [
  mark('from', 'From'), mark('to', 'To'), num('base', 'Base'), num('gain', 'Gain'), num('steps', 'Steps', { step: 1 }),
];
