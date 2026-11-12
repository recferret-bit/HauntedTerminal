import type { ScriptCond, ScriptStep, WinRule } from '../chapters/types.js';
import { ENEMY_TYPES, MECHANICS, PICKUP_TYPES, ROOM_KINDS } from '../chapters/validate-pack.js';
import { KIRO_CORE_ORDER } from '../game/kiro.js';

/**
 * The editor is driven by these tables, not by per-chapter code. A new spec field is: one line in
 * `src/chapters/script-types.ts` (or types.ts), one interpreter branch in `script.ts`, one entry here.
 */
export type Option = string | number;

interface Base {
  key: string;
  label: string;
  hint?: string;
  /** The key may be absent; clearing the control removes it from the JSON. */
  optional?: boolean;
}

export interface ArrayItem {
  /** Plain object items. */
  fields?: Field[];
  /** Items tagged by `kind`; the variants are looked up lazily so a condition can contain conditions. */
  union?: () => Record<string, Field[]>;
  /** One-line title of a collapsed item. */
  title: (item: Record<string, unknown>, index: number) => string;
  /** Lets the editor play this item in the preview ("steps" = a script step). */
  play?: 'steps';
}

export type Field =
  | (Base & { type: 'text'; rows?: number; suggest?: 'models' | 'paths' | 'sockets' | 'enemies' | 'rooms' | 'cores'; mono?: boolean })
  | (Base & { type: 'number'; step?: number; octal?: boolean })
  | (Base & { type: 'bool' })
  | (Base & { type: 'select'; options: readonly Option[] })
  | (Base & { type: 'strings'; rows?: number })
  | (Base & { type: 'numbers' })
  | (Base & { type: 'color' })
  | (Base & { type: 'array'; item: ArrayItem })
  | (Base & { type: 'object'; fields: Field[] })
  | (Base & { type: 'record'; value: Field[] | 'string' | 'strings'; keyLabel: string })
  | (Base & { type: 'union'; union: () => Record<string, Field[]> });

const t = (key: string, label: string, extra: Partial<Extract<Field, { type: 'text' }>> = {}): Field => ({ type: 'text', key, label, ...extra });
const n = (key: string, label: string, extra: Partial<Extract<Field, { type: 'number' }>> = {}): Field => ({ type: 'number', key, label, ...extra });
const b = (key: string, label: string, extra: Partial<Base> = {}): Field => ({ type: 'bool', key, label, ...extra });
const sel = (key: string, label: string, options: readonly Option[], extra: Partial<Base> = {}): Field => ({ type: 'select', key, label, options, ...extra });
const opt = <F extends Field>(f: F): F => ({ ...f, optional: true });

export const AGENTS = ['kiro', 'clod', 'gork', 'codec', 'antigravy'] as const;
export const MOODS = ['laugh', 'order', 'smug', 'annoyed'] as const;
const EMOTES = ['shock', 'confused', 'determined', 'relief', 'panic'] as const;
const KIRO_ACTIONS = ['scan', 'load', 'crack_start', 'crack_step', 'crack_done'] as const;

// ---- conditions and script steps ---------------------------------------------------------------------------------

/** One entry per `kind` of the union, enforced by the type: adding a kind to the spec types fails the build until the form exists. */
type Variants<K extends string> = Record<K, Field[]>;

export const COND_VARIANTS = (): Variants<ScriptCond['kind']> => ({
  ran_command: [t('name', 'Command', { mono: true, hint: 'first word the player typed, e.g. ls or ps' })],
  file_absent: [t('path', 'Path', { suggest: 'paths', mono: true })],
  file_read: [t('path', 'Path', { suggest: 'paths', mono: true })],
  enemy_dead: [t('enemyId', 'Enemy id', { suggest: 'enemies' })],
  any_enemy_dead: [],
  core_loaded: [t('core', 'Core', { suggest: 'cores' })],
  tutorial_skipped: [],
  any: [{ type: 'array', key: 'of', label: 'Any of', item: { union: COND_VARIANTS, title: condTitle } }],
  all: [{ type: 'array', key: 'of', label: 'All of', item: { union: COND_VARIANTS, title: condTitle } }],
});

function condTitle(c: Record<string, unknown>): string {
  const detail = c.name ?? c.path ?? c.enemyId ?? c.core ?? (Array.isArray(c.of) ? `${c.of.length} conditions` : '');
  return `${String(c.kind)}${detail ? `: ${String(detail)}` : ''}`;
}

const TEXT_ROWS = 3;
export const STEP_VARIANTS = (): Variants<ScriptStep['kind']> => ({
  print: [t('text', 'Terminal text', { rows: 5, mono: true })],
  emote: [sel('emote', 'Emote', EMOTES), opt(t('text', 'Bubble text'))],
  spawn: [t('entityId', 'Entity id'), t('model', 'Model', { suggest: 'models' })],
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
});

function stepTitle(s: Record<string, unknown>): string {
  const text = s.text ?? s.message ?? s.entityId ?? s.step ?? s.mood ?? '';
  return `${String(s.kind)}: ${String(text).replace(/\s+/g, ' ').slice(0, 70)}`;
}

const stepsField = (key: string, label: string, extra: Partial<Base> = {}): Field => ({
  type: 'array',
  key,
  label,
  ...extra,
  item: { union: STEP_VARIANTS, title: stepTitle, play: 'steps' },
});

// ---- level --------------------------------------------------------------------------------------------------------

export const OVERVIEW: Field[] = [
  t('title', 'Title'),
  t('summary', 'Summary (the objective line)', { rows: 5 }),
  t('cwd', 'Start directory', { mono: true }),
  sel('roomKind', 'Room', ROOM_KINDS),
  sel('floorTheme', 'Floor theme', [1, 2, 3, 4, 5]),
  sel('mechanic', 'Mechanic', MECHANICS),
  opt(t('exitDir', 'Exit gate (cd into it to advance)', { suggest: 'paths', mono: true })),
  opt(t('exitCommand', 'Exit command (final level)', { mono: true })),
];

export const FILES: Field[] = [
  {
    type: 'array',
    key: 'files',
    label: 'Files, directories and sockets',
    item: {
      title: (f) => `${String(f.kind)} ${String(f.path)}${f.questCritical ? ' *' : ''}`,
      fields: [
        t('path', 'Path', { mono: true }),
        sel('kind', 'Kind', ['file', 'dir', 'socket']),
        n('mode', 'Mode (octal)', { octal: true }),
        opt(n('uid', 'Owner uid')),
        opt(b('questCritical', 'Quest critical (restored if deleted)')),
        opt(t('content', 'Content', { rows: 8, mono: true })),
      ],
    },
  },
];

export const ENTITIES: Field[] = [
  {
    type: 'array',
    key: 'enemies',
    label: 'Enemies',
    item: {
      title: (e) => `${String(e.id)} (${String(e.type)}) ${String(e.path)}`,
      fields: [
        t('id', 'Id'),
        sel('type', 'Type', ENEMY_TYPES),
        t('path', 'File', { suggest: 'paths', mono: true }),
        opt(n('pid', 'PID')),
        opt(n('ppid', 'PPID')),
        opt(b('hidden', 'Starts hidden (dotfile)')),
        opt(t('port', 'Port dir (worm)', { suggest: 'paths', mono: true })),
        opt(t('buffer', 'Buffer (exploit)', { suggest: 'paths', mono: true })),
        opt(t('helps', 'Helps enemy (crack)', { suggest: 'enemies' })),
      ],
    },
  },
  {
    type: 'array',
    key: 'pickups',
    label: 'Pickups',
    item: {
      title: (p) => `${String(p.id)} (${String(p.type)}) ${String(p.path)}`,
      fields: [t('id', 'Id'), sel('type', 'Type', PICKUP_TYPES), t('path', 'File', { suggest: 'paths', mono: true }), opt(b('locked', 'Starts encrypted'))],
    },
  },
  {
    type: 'array',
    key: 'patches',
    label: 'Patch chips (one-click fixes in the code editor)',
    item: {
      title: (p) => `${String(p.label)} → ${String(p.file)}`,
      fields: [t('file', 'File name'), t('label', 'Label'), t('find', 'Find', { rows: 2, mono: true }), t('replace', 'Replace', { rows: 2, mono: true })],
    },
  },
];

const DESC = t('description', 'Checklist line shown to the player', { rows: 2 });
export const RULE_VARIANTS = (): Variants<WinRule['kind']> => ({
  read_file: [t('path', 'Path', { suggest: 'paths', mono: true }), DESC],
  talk_ally: [t('socket', 'Socket name', { suggest: 'sockets', mono: true }), DESC],
  file_absent: [t('path', 'Path', { suggest: 'paths', mono: true }), DESC],
  file_contains: [t('path', 'Path', { suggest: 'paths', mono: true }), t('pattern', 'Pattern', { mono: true }), DESC],
  dir_accessible: [t('path', 'Path', { suggest: 'paths', mono: true }), DESC],
  kiro_decrypted: [t('path', 'Path', { suggest: 'paths', mono: true }), DESC],
  kiro_loaded: [sel('core', 'Core', KIRO_CORE_ORDER), DESC],
  enemy_neutralized: [t('enemyId', 'Enemy id', { suggest: 'enemies' }), DESC],
  html_css_valid: [t('htmlPath', 'HTML path', { suggest: 'paths', mono: true }), t('cssPath', 'CSS path', { suggest: 'paths', mono: true }), DESC],
  cart_js_valid: [t('jsPath', 'JS path', { suggest: 'paths', mono: true }), DESC],
  docker_image_running: [t('imageTag', 'Image tag', { mono: true }), n('port', 'Port'), DESC],
  docker_compose_healthy: [{ type: 'strings', key: 'services', label: 'Services (one per line)' }, DESC],
  boss_defeated: [
    t('bossId', 'Boss enemy id', { suggest: 'enemies' }),
    t('streamPath', 'Stream to drain', { suggest: 'paths', mono: true }),
    t('verifySocket', 'Verify socket', { suggest: 'sockets', mono: true }),
    t('expectedToken', 'Expected token', { mono: true }),
    t('anchorPath', 'Anchor file', { suggest: 'paths', mono: true }),
    t('anchorPattern', 'Anchor pattern', { mono: true }),
    DESC,
  ],
});

export const RULES: Field[] = [
  {
    type: 'array',
    key: 'winRules',
    label: 'Win rules (all must hold to open the exit)',
    item: { union: RULE_VARIANTS, title: (r) => `${String(r.kind)}: ${String(r.description ?? '').slice(0, 80)}` },
  },
  { type: 'strings', key: 'solutionCommands', label: 'Canonical solution (one command per line; the headless check types these)', rows: 10 },
];

// ---- script -------------------------------------------------------------------------------------------------------

const KIRO_REACTION: Field[] = [
  { type: 'object', key: 'foe', label: 'Foe line', fields: [sel('agent', 'Agent', AGENTS), t('model', 'Model', { suggest: 'models' }), t('text', 'Line', { rows: 2 })] },
  t('kiro', 'Kiro line', { rows: 2 }),
  t('banner', 'Terminal banner', { rows: 5, mono: true, hint: '{foe} {kiro} {gguf} are filled in' }),
];

export const SCRIPT: Field[] = [
  stepsField('arrival', 'Arrival (runs once on entering)', { optional: true }),
  opt(t('allySpeaker', 'Ally name in hints (hank / dad)')),
  opt(b('safe', 'Safe room (no damage, enemies hold fire)')),
  opt({ type: 'union', key: 'holdEnemiesUntil', label: 'Freeze enemy ticks until', union: COND_VARIANTS }),
  opt({ type: 'record', key: 'signalAliases', label: 'Signal rewrites (SIGTERM -> SIGKILL)', keyLabel: 'Signal', value: 'string' }),
  {
    type: 'object',
    key: 'tutorial',
    label: 'Tutorial cards',
    optional: true,
    fields: [
      opt(t('label', 'Terminal label', { hint: 'e.g. KIRO TUTORIAL' })),
      sel('agent', 'Speaker', AGENTS),
      t('model', 'Speaker model', { suggest: 'models' }),
      opt(t('skipText', '`tutorial skip` reply', { rows: 3, mono: true })),
      {
        type: 'array',
        key: 'steps',
        label: 'Steps',
        item: {
          title: (s, i) => `${i + 1}. ${String(s.command)}`,
          fields: [
            t('prompt', 'Prompt', { rows: 2 }),
            t('command', 'Command to type', { mono: true }),
            t('doneText', 'Spoken when done', { rows: 3 }),
            { type: 'array', key: 'doneWhen', label: 'Done when any of (omit on the last step)', optional: true, item: { union: COND_VARIANTS, title: condTitle } },
          ],
        },
      },
      {
        type: 'object',
        key: 'hide',
        label: 'Hidden enemy',
        optional: true,
        fields: [
          t('enemyId', 'Enemy id', { suggest: 'enemies' }),
          t('node', 'File name', { mono: true }),
          t('model', 'Model', { suggest: 'models' }),
          { type: 'union', key: 'revealWhen', label: 'Revealed when', union: COND_VARIANTS },
        ],
      },
    ],
  },
  {
    type: 'object',
    key: 'bullying',
    label: 'Recurring taunts',
    optional: true,
    fields: [
      n('after', 'Start after N commands'),
      n('every', 'Then every N commands'),
      sel('mood', 'Mood', MOODS),
      t('print', 'Terminal text', { mono: true, rows: 2, hint: '{text} is the line' }),
      {
        type: 'array',
        key: 'lines',
        label: 'Lines (picked in rotation)',
        item: { title: (l) => `${String(l.agent)}: ${String(l.text).slice(0, 70)}`, fields: [sel('agent', 'Agent', AGENTS), t('text', 'Line', { rows: 2 })] },
      },
    ],
  },
  {
    type: 'object',
    key: 'kiro',
    label: 'Kiro companion',
    optional: true,
    fields: [
      opt(sel('stage', 'On stage', ['show', 'crack_only', 'hidden'])),
      opt({ type: 'strings', key: 'hideWhen', label: 'Hide while (intro / exit_open, one per line)' }),
      opt(t('label', 'Stage label')),
      opt({ type: 'object', key: 'labelLoaded', label: 'Label once a core is loaded', fields: [{ type: 'strings', key: 'cores', label: 'Cores (one per line)' }, t('label', 'Label')] }),
      opt(b('weak', 'Weak: runs the tiny core (ps and kiro status show it)')),
      opt(t('weakUntilCore', 'Weak until this core is loaded', { suggest: 'cores' })),
      opt(t('weakNote', 'Weak note above `kiro status`', { rows: 2, mono: true })),
      opt(t('loadRefusal', '`kiro load` refusal', { rows: 3, mono: true })),
      opt(t('wrongCoreLine', 'Wrong core reply', { rows: 3, mono: true, hint: '{core} is the wanted core' })),
      opt({ type: 'record', key: 'coreAliases', label: 'Other names that count as a core', keyLabel: 'Core', value: 'strings' }),
      opt({ type: 'record', key: 'reactions', label: 'Reactions per core', keyLabel: 'Core', value: KIRO_REACTION }),
    ],
  },
  stepsField('onBossKill', 'When PID 1 dies', { optional: true }),
];

// ---- dialogs ------------------------------------------------------------------------------------------------------

export const DIALOG_ENTRY: Field[] = [
  t('banner', 'Level banner', { rows: 2 }),
  { type: 'strings', key: 'hankRungs', label: 'Hints (exactly 3, escalating; one per line)', rows: 6 },
  opt(t('agentTaunt', 'Arrival taunt', { rows: 3 })),
  opt(t('completion', 'Completion line', { rows: 3 })),
];

export const DIALOG_CAST: Field[] = [
  { type: 'record', key: 'cast', label: 'Speakers', keyLabel: 'Id', value: [t('displayName', 'Name'), { type: 'color', key: 'color', label: 'Colour' }] },
];

// ---- chapter ------------------------------------------------------------------------------------------------------

export const MANIFEST: Field[] = [
  t('title', 'Title'),
  t('subtitle', 'Subtitle', { rows: 2 }),
  t('badge', 'Badge'),
  sel('status', 'Status', ['playable', 'spec']),
  n('estimatedMinutes', 'Estimated minutes'),
  t('clientName', 'Client'),
  t('summary', 'Summary', { rows: 5 }),
  { type: 'object', key: 'allyNpc', label: 'Ally', fields: [t('id', 'Id (`dad.tty` makes `dad` a command)'), t('name', 'Name'), t('role', 'Role', { rows: 3 }), t('model', 'Model', { suggest: 'models' }), t('paletteFamily', 'Palette family')] },
  {
    type: 'object',
    key: 'boss',
    label: 'Boss',
    fields: [t('id', 'Id'), t('name', 'Name'), t('processName', 'Process'), n('pid', 'PID'), t('model', 'Model', { suggest: 'models' }), opt(t('cameoModel', 'Cameo supervisor model', { suggest: 'models' })), opt(t('cameoLabel', 'Cameo stage label'))],
  },
  { type: 'strings', key: 'mechanicsSummary', label: 'Mechanics summary (one per line)', rows: 6 },
  {
    type: 'array',
    key: 'grants',
    label: 'Grants when a level is entered directly (cumulative)',
    optional: true,
    item: {
      title: (g) => `after level ${String(g.afterLevel)}: ${[g.ram ? `+${String(g.ram)}GB RAM` : '', g.ssd ? `+${String(g.ssd)}GB SSD` : '', g.core ? `core ${String(g.core)}` : ''].filter(Boolean).join(', ')}`,
      fields: [n('afterLevel', 'After level'), opt(n('ram', 'RAM GB')), opt(n('ssd', 'SSD GB')), opt(t('core', 'Kiro core', { suggest: 'cores' }))],
    },
  },
  {
    type: 'array',
    key: 'dossier',
    label: 'Codex cards this chapter adds (bestiary command and binder)',
    optional: true,
    item: {
      title: (d) => `${String(d.role)} ${String(d.name)}`,
      fields: [t('id', 'Id'), t('name', 'Name'), t('model', 'Model', { suggest: 'models' }), sel('role', 'Role', ['ALLY', 'MALWARE', 'BOSS']), t('hostHardware', 'Host hardware', { rows: 3 }), t('counterplay', 'Counterplay', { rows: 3 })],
    },
  },
  {
    type: 'object',
    key: 'outro',
    label: 'Outro',
    optional: true,
    fields: [
      t('caption', 'Closing caption', { rows: 2 }),
      stepsField('finale', 'Finale (runs on the final exit; {rank} {commands} {scrap} {scrapTotal})', { optional: true }),
      {
        type: 'array',
        key: 'actors',
        label: 'Closing actors',
        optional: true,
        item: { title: (a) => `${String(a.id)} (${String(a.model)})`, fields: [t('id', 'Id'), t('model', 'Model', { suggest: 'models' }), t('label', 'Label'), n('x', 'X', { step: 0.05 })] },
      },
    ],
  },
];

// ---- comic --------------------------------------------------------------------------------------------------------

export const COMIX_PAGE: Field[] = [
  n('pageNumber', 'Page number'),
  t('title', 'Title'),
  {
    type: 'array',
    key: 'panels',
    label: 'Panels',
    item: {
      title: (p) => `${String(p.id)}${p.caption ? ` — ${String(p.caption).slice(0, 50)}` : ''}`,
      fields: [
        t('id', 'Id'),
        { type: 'numbers', key: 'rect', label: 'Rect x, y, w, h (0..1)' },
        { type: 'color', key: 'bgHex', label: 'Background' },
        opt(t('room', 'Room', { suggest: 'rooms' })),
        opt(t('caption', 'Caption', { rows: 2 })),
        {
          type: 'array',
          key: 'cast',
          label: 'Cast',
          item: {
            title: (c) => `${String(c.model)} @ ${String(c.x)}`,
            fields: [t('model', 'Model', { suggest: 'models' }), n('x', 'X', { step: 0.02 }), opt(n('scale', 'Scale', { step: 0.02 })), opt(sel('view', 'View', ['front', 'side', 'top']))],
          },
        },
        {
          type: 'array',
          key: 'bubbles',
          label: 'Bubbles',
          optional: true,
          item: {
            title: (bb) => `${String(bb.speaker)}: ${String(bb.text).slice(0, 60)}`,
            fields: [t('speaker', 'Speaker'), sel('style', 'Style', ['normal', 'shout', 'whisper']), t('text', 'Text', { rows: 2 }), n('x', 'X', { step: 0.02 }), n('y', 'Y', { step: 0.02 })],
          },
        },
        {
          type: 'object',
          key: 'sfx',
          label: 'Sound effect',
          optional: true,
          fields: [t('text', 'Lettering'), n('x', 'X', { step: 0.02 }), n('y', 'Y', { step: 0.02 }), { type: 'color', key: 'color', label: 'Colour' }],
        },
      ],
    },
  },
];
