import type { ScriptCond, ScriptStep } from '../chapters/types.js';
import { ITEM_IDS } from '../contracts/inventory.js';
import { b, n, opt, sel, t, type Field, type FieldBase } from '../editor-core/schema.js';
import { transformFields } from '../editor-core/scene-fields.js';

export const AGENTS = ['kiro', 'clod', 'gork', 'codec', 'antigravy'] as const;
export const MOODS = ['laugh', 'order', 'smug', 'annoyed'] as const;
const EMOTES = ['shock', 'confused', 'determined', 'relief', 'panic', 'shout'] as const;
const KIRO_ACTIONS = ['scan', 'load', 'crack_start', 'crack_step', 'crack_done', 'empower'] as const;

/** One entry per `kind` of the union, enforced by the type: adding a kind to the spec types fails the build until the form exists. */
export type Variants<K extends string> = Record<K, Field[]>;

export const COND_VARIANTS = (): Variants<ScriptCond['kind']> => ({
  ran_command: [
    t('name', 'Command', { mono: true, hint: 'first word the player typed, e.g. ls or ps' }),
    opt(t('flags', 'Option flags (* or short letters, e.g. la)', { mono: true })),
    opt(t('args', 'Args pattern (glob or re:...)', { mono: true })),
  ],
  file_absent: [t('path', 'Path', { suggest: 'paths', mono: true })],
  file_read: [t('path', 'Path', { suggest: 'paths', mono: true })],
  enemy_dead: [t('enemyId', 'Enemy id', { suggest: 'enemies' })],
  any_enemy_dead: [],
  core_loaded: [t('core', 'Core', { suggest: 'cores' })],
  has_item: [sel('item', 'Item', ITEM_IDS)],
  room_swept: [],
  tutorial_skipped: [],
  dialog_done: [],
  flag: [t('name', 'Flag name', { mono: true })],
  not: [{ type: 'union', key: 'of', label: 'Negated condition', union: COND_VARIANTS }],
  any: [{ type: 'array', key: 'of', label: 'Any of', item: { union: COND_VARIANTS, title: condTitle } }],
  all: [{ type: 'array', key: 'of', label: 'All of', item: { union: COND_VARIANTS, title: condTitle } }],
});

export function condTitle(c: Record<string, unknown>): string {
  const flags = c.kind === 'ran_command' && c.flags ? ` [${String(c.flags)}]` : '';
  const detail = c.name ?? c.path ?? c.enemyId ?? c.core ?? c.item
    ?? (Array.isArray(c.of) ? `${c.of.length} conditions` : c.of && typeof c.of === 'object' ? condTitle(c.of as Record<string, unknown>) : '');
  return `${String(c.kind)}${detail ? `: ${String(detail)}${flags}` : ''}`;
}

const TEXT_ROWS = 3;
export const STEP_VARIANTS = (): Variants<ScriptStep['kind']> => ({
  print: [t('text', 'Terminal text', { rows: 5, mono: true })],
  emote: [sel('emote', 'Emote', EMOTES), opt(t('text', 'Bubble text'))],
  spawn: [
    t('entityId', 'Entity id'),
    t('model', 'Model', { suggest: 'models' }),
    opt(sel('entrance', 'Entrance', ['appear', 'glide'])),
    opt(n('x', 'Stage X', { step: 0.05 })),
    opt(t('label', 'Stage label')),
    ...transformFields({ includeY: true }),
  ],
  despawn: [t('entityId', 'Entity id')],
  kiro_action: [sel('action', 'Action', KIRO_ACTIONS), t('core', 'Core'), t('message', 'Message', { rows: 2 })],
  say: [
    sel('agent', 'Agent', AGENTS),
    t('model', 'Model', { suggest: 'models' }),
    sel('mood', 'Mood', MOODS),
    t('text', 'Line', { rows: TEXT_ROWS }),
    opt(t('print', 'Also print', { mono: true, hint: '{text} is the line' })),
  ],
  taunt: [
    sel('mood', 'Mood', MOODS),
    opt(t('fallback', 'Fallback line', { rows: 2, hint: 'used when dialogs.json has no agentTaunt for this level' })),
    opt(t('print', 'Also print', { mono: true, hint: '{text} is the line' })),
  ],
  dialogue: [
    t('obstacleId', 'Obstacle id'),
    t('speaker', 'Speaker'),
    opt(t('portrait', 'Portrait sprite')),
    sel('mood', 'Mood', ['cryptic', 'hinting']),
    t('anchorSocket', 'Anchor socket', { suggest: 'sockets', mono: true }),
    t('text', 'Bubble text', { rows: 4 }),
    { type: 'strings', key: 'highlight', label: 'Highlighted commands (one per line)' },
    t('banner', 'Terminal banner'),
  ],
  tutorial_step: [n('step', 'Tutorial step (1-based)')],
  carry_item: [t('entityId', 'Carrier (kiro or a spawned entity id)'), sel('item', 'Item', ITEM_IDS)],
  give_item: [sel('item', 'Item', ITEM_IDS), opt(t('from', 'Giver (kiro or a spawned entity id)'))],
  take_item: [sel('item', 'Item', ITEM_IDS)],
  fly_to: [
    t('entityId', 'Flier (kiro or a spawned entity id)'),
    t('target', 'Target (hero, home, or a socket or entity name)', { suggest: 'sockets', mono: true }),
    opt(b('hold', 'Hover beside the target afterwards')),
    opt(n('ms', 'Flight time in ms (default 2400)', { step: 100 })),
  ],
  wait: [n('sec', 'Seconds to wait before the next steps', { step: 1 })],
  sfx: [t('cue', 'SFX cue id', { suggest: 'sfx', mono: true })],
  fx: [
    t('preset', 'FX preset id', { suggest: 'fx', mono: true }),
    opt(n('x', 'Stage X', { step: 0.05 })),
    opt(n('y', 'Stage Y above floor', { step: 0.05 })),
    opt(t('text', 'Override onomatopoeia word')),
  ],
  music: [opt(t('cue', 'Music cue id (empty = restore level default)', { suggest: 'music', mono: true }))],
  dialog_box: [
    sel('speaker', 'Speaker', ['vibecoder', 'dad', ...AGENTS]),
    t('text', 'Line', { rows: TEXT_ROWS }),
    opt(n('holdSec', 'Hold seconds after the text (default 12)', { step: 0.5 })),
  ],
  set_flag: [t('name', 'Flag name', { mono: true })],
});

function stepTitle(s: Record<string, unknown>): string {
  const text = s.text ?? s.message ?? s.entityId ?? s.name ?? s.preset ?? s.cue ?? s.step ?? s.mood ?? '';
  return `${String(s.kind)}: ${String(text).replace(/\s+/g, ' ').slice(0, 70)}`;
}

export const stepsField = (key: string, label: string, extra: Partial<FieldBase> = {}): Field => ({
  type: 'array',
  key,
  label,
  ...extra,
  item: { union: STEP_VARIANTS, title: stepTitle, play: 'steps' },
});
