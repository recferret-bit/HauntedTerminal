import { MECHANICS, ROOM_KINDS } from '../chapters/validate-pack.js';
import { AGENTS, ENEMY_FIELDS, FILE_FIELDS, MOODS, PATCH_FIELDS, PICKUP_FIELDS, RULE_VARIANTS, STEP_VARIANTS as SCRIPT_STEP_VARIANTS } from '../chapter-editor/schema.js';
import { b, n, opt, sel, t, type Field } from '../editor-core/schema.js';
import { KIRO_CORE_ORDER } from '../game/kiro.js';
import { LAB_FLOORS, type LabCond, type LabSetupKind, type LabStepKind } from './lab-types.js';

/**
 * Field tables of the lab script, the only description of what its forms and its import check accept.
 * Files, enemies, pickups and patches reuse the chapter editor's tables, so a lab edits them exactly like level data.
 */
/** The listed fields of a chapter table. `mode` becomes optional: the game defaults it (0644 for files, 0755 for dirs). */
const keep = (fields: Field[], keys: readonly string[]): Field[] =>
  fields.filter((f) => keys.includes(f.key)).map((f) => (f.key === 'mode' ? opt(f) : f));

const SAY_FIELDS: Field[] = [sel('agent', 'Agent', AGENTS), sel('mood', 'Mood', MOODS), t('text', 'Line', { rows: 3 }), opt(t('print', 'Also print', { mono: true, hint: '{text} is the line' }))];
const TAUNT_FIELDS: Field[] = [sel('mood', 'Mood', MOODS), t('text', 'Line', { rows: 2, hint: 'begins with the agent: CLOD: ..., GORK: ..., KIRO: ...' }), opt(t('print', 'Also print', { mono: true, hint: '{text} is the line' }))];

/** What a lab check watches. `ran`, `output`, `code` and `event` stay passed once seen; `file` and `riddle` are read live. */
export const COND_VARIANTS = (): Record<LabCond['kind'], Field[]> => ({
  ran: [t('pattern', 'A command line matching (text, or re:regex)', { mono: true })],
  output: [t('pattern', 'Some output matching (text, or re:regex)', { mono: true })],
  code: [n('code', 'Exit code'), opt(t('line', 'For a command line matching', { mono: true }))],
  event: [t('type', 'Event type', { mono: true, hint: 'ENEMY_KILLED, PICKUP_COLLECTED, PUZZLE_DOOR_RESOLVED ...' })],
  file: [t('path', 'Path', { mono: true, suggest: 'paths' }), opt(t('contains', 'Contains (text, or re:regex)', { mono: true })), opt(b('absent', 'Must not exist'))],
  riddle: [t('riddleId', 'Riddle id')],
});

export const SETUP_VARIANTS = (): Record<LabSetupKind, Field[]> => ({
  file: keep(FILE_FIELDS, ['path', 'mode', 'uid', 'questCritical', 'content']),
  dir: keep(FILE_FIELDS, ['path', 'mode', 'uid']),
  socket: keep(FILE_FIELDS, ['path', 'content', 'mode', 'uid']),
  enemy: ENEMY_FIELDS,
  pickup: PICKUP_FIELDS,
  patch: PATCH_FIELDS,
  prop: [
    t('id', 'Id'),
    t('model', 'Model', { suggest: 'models' }),
    n('x', 'Stage x (room spans about -1 to 5)', { step: 0.1 }),
    opt(n('y', 'Height above the floor', { step: 0.1 })),
    opt(t('label', 'Label')),
  ],
  npc: SAY_FIELDS,
  taunt: TAUNT_FIELDS,
  dialogue: SCRIPT_STEP_VARIANTS().dialogue,
  riddle: [
    t('id', 'Id'),
    t('path', 'Socket path', { mono: true, hint: 'a .sock file in the room' }),
    t('prompt', 'What the socket says', { rows: 3 }),
    t('answer', 'Accepted answer', { mono: true, hint: 'the exact text, or re:regex (re:/^(a|b)$/i for flags)' }),
    opt(t('speaker', 'Speaker name')),
    opt({ type: 'strings', key: 'hints', label: 'Hints, one per wrong answer (the last repeats)' }),
    opt(t('success', 'Said when solved')),
    opt(t('opens', 'Door it opens', { mono: true, suggest: 'paths', hint: 'a directory or file made readable when solved' })),
    opt({ type: 'strings', key: 'tokens', label: 'Commands the bubble highlights (one per line)' }),
  ],
  task: [t('id', 'Id'), { type: 'union', key: 'rule', label: 'Win rule', union: RULE_VARIANTS, tag: 'kind' }],
  check: [t('id', 'Id'), t('description', 'Checklist line', { rows: 2 }), { type: 'union', key: 'when', label: 'Passes when', union: COND_VARIANTS, tag: 'kind' }],
});

export function setupTitle(op: Record<string, unknown>): string {
  const what = op.path ?? op.id ?? op.agent ?? op.label ?? op.speaker ?? '';
  const extra = op.op === 'enemy' || op.op === 'pickup' ? ` (${String(op.type)})` : '';
  return `${String(op.op)} ${String(what)}${extra}`.trim();
}

/** The scene list as a form field: items are tagged by `op`. */
const SETUP: Field[] = [{ type: 'array', key: 'setup', label: 'Scene', item: { union: SETUP_VARIANTS, tag: 'op', title: setupTitle } }];

/** Clock and enemy fire: switched from the top bar, not the settings form. */
const RUN_SWITCHES: Field[] = [
  sel('clock', 'Clock', ['manual', 'live'], { hint: 'manual: the world moves on commands and Tick only. live: one tick per second.' }),
  sel('enemyFire', 'Enemy fire', ['live', 'hold'], { hint: 'live: enemies attack, hits are absorbed. hold: enemies that deal damage hold fire (ransomware and fork bombs still act).' }),
];

/** The lab settings form (shown when nothing is selected). */
export const SETTINGS: Field[] = [
  t('title', 'Title'),
  opt(sel('driver', 'Driver', ['chapter', 'classic'], { hint: 'default (chapter): synthetic chapter room. classic: classic floor 1–5 (src/game/session.ts).' })),
  {
    type: 'object',
    key: 'room',
    label: 'Room',
    fields: [
      sel('roomKind', 'Room', ROOM_KINDS),
      sel('floorTheme', 'Floor theme', LAB_FLOORS),
      sel('mechanic', 'Mechanic', MECHANICS),
      t('cwd', 'Start directory', { mono: true }),
      t('title', 'Level title'),
      t('summary', 'Goal line', { rows: 2 }),
    ],
  },
  {
    type: 'object',
    key: 'player',
    label: 'Player',
    fields: [n('ram', 'RAM (GB, steps of 16)'), n('ssd', 'SSD (GB, steps of 256)'), sel('core', 'Kiro core', ['', ...KIRO_CORE_ORDER])],
  },
];

// ---- steps ------------------------------------------------------------------------------------------------------

/** What a step checks. Every key is optional; all given keys must hold. */
const EXPECT_FIELDS: Field[] = [
  opt(n('code', 'Exit code')),
  opt(t('stdout', 'Output contains (text, or re:regex)', { mono: true })),
  opt(t('stderr', 'Errors contain (text, or re:regex)', { mono: true })),
  opt({ type: 'strings', key: 'events', label: 'Events that must happen (one per line)' }),
  opt({ type: 'strings', key: 'noEvents', label: 'Events that must not happen (one per line)' }),
  opt(t('cwd', 'Working directory is', { mono: true, suggest: 'paths' })),
  opt(n('enemiesLeft', 'Enemies left')),
  opt({ type: 'object', key: 'absorbed', label: 'Damage absorbed by this step', fields: [opt(n('min', 'At least')), opt(n('max', 'At most'))] }),
  opt({
    type: 'object',
    key: 'file',
    label: 'A file',
    fields: [t('path', 'Path', { mono: true, suggest: 'paths' }), opt(t('contains', 'Contains (text, or re:regex)', { mono: true })), opt(b('absent', 'Must not exist'))],
  }),
];
const EXPECT: Field = opt({ type: 'object', key: 'expect', label: 'Expect', fields: EXPECT_FIELDS });
const NOTE: Field = opt(t('note', 'Note'));

export const STEP_VARIANTS = (): Record<LabStepKind, Field[]> => {
  const variants: Record<LabStepKind, Field[]> = {
    run: [t('line', 'Command line', { mono: true }), EXPECT],
    tick: [opt(n('n', 'Ticks (default 1)')), EXPECT],
    emit: [{ type: 'json', key: 'event', label: 'Event (JSON, as the stage receives it)', rows: 7 }],
    inject: [
      opt({ type: 'object', key: 'enemy', label: 'Enemy to add', fields: ENEMY_FIELDS }),
      opt({ type: 'object', key: 'pickup', label: 'Pickup to add', fields: PICKUP_FIELDS }),
    ],
    say: SAY_FIELDS,
    taunt: TAUNT_FIELDS,
    dialogue: SCRIPT_STEP_VARIANTS().dialogue,
    check: [t('id', 'Task, check or riddle id'), opt(sel('is', 'Must be', ['pass', 'fail']))],
    wait: [n('ms', 'Milliseconds')],
    expect: [{ type: 'object', key: 'expect', label: 'Expect', fields: EXPECT_FIELDS }],
  };
  return Object.fromEntries(Object.entries(variants).map(([k, v]) => [k, [...v, NOTE]])) as Record<LabStepKind, Field[]>;
};

export function stepTitle(step: Record<string, unknown>): string {
  switch (step.op) {
    case 'run':
      return `$ ${String(step.line ?? '')}`;
    case 'tick':
      return Number(step.n ?? 1) > 1 ? `tick x${String(step.n)}` : 'tick';
    case 'emit':
      return `emit ${String((step.event as { type?: unknown } | undefined)?.type ?? '?')}`;
    case 'say':
      return `say ${String(step.agent)}`;
    case 'taunt':
      return `taunt ${String(step.text ?? '').slice(0, 24)}`;
    case 'dialogue':
      return `dialogue ${String(step.speaker ?? '')}`;
    case 'check':
      return `check ${String(step.id ?? '')}${step.is === 'fail' ? ' is fail' : ''}`;
    case 'wait':
      return `wait ${String(step.ms)} ms`;
    default:
      return String(step.op);
  }
}

export const STEPS: Field[] = [{ type: 'array', key: 'steps', label: 'Script', item: { union: STEP_VARIANTS, tag: 'op', title: stepTitle } }];

/** Every key of a lab script the import check knows. */
export const LAB_FIELDS: Field[] = [t('id', 'Id', { mono: true }), ...SETTINGS, ...RUN_SWITCHES, ...SETUP, ...STEPS];
