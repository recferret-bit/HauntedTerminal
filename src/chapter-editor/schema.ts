import type { WinRule } from '../chapters/types.js';
import { ENEMY_TYPES, MECHANICS, PICKUP_TYPES, ROOM_KINDS } from '../chapters/validate-pack.js';
import {
  b,
  n,
  opt,
  sel,
  t,
  type Field,
} from '../editor-core/schema.js';
import { ROOM_SOCKETS, transformFields } from '../editor-core/scene-fields.js';
import { KIRO_CORE_ORDER } from '../game/kiro.js';
import { AGENTS, COND_VARIANTS, condTitle, MOODS, STEP_VARIANTS, stepsField, type Variants } from './schema-script.js';
import { STAGE_OBJECT_FIELD } from './schema-stage.js';

/**
 * The editor is driven by these tables, not by per-chapter code. A new spec field is: one line in
 * `src/chapters/script-types.ts` (or types.ts), one interpreter branch in `script.ts`, one entry here.
 */
export { AGENTS, MOODS, STEP_VARIANTS };
export type { Field };

// ---- level --------------------------------------------------------------------------------------------------------

export const OVERVIEW: Field[] = [
  t('title', 'Title'),
  t('summary', 'Summary (the objective line)', { rows: 5 }),
  t('cwd', 'Start directory', { mono: true }),
  sel('roomKind', 'Room', ROOM_KINDS),
  sel('floorTheme', 'Floor theme', [1, 2, 3, 4, 5]),
  opt(n('roomSeed', 'Room seed (varies background hardware & Kiroween details)', { step: 1 })),
  sel('mechanic', 'Mechanic', MECHANICS),
  opt(t('exitDir', 'Exit gate (cd into it to advance)', { suggest: 'paths', mono: true })),
  opt(t('exitCommand', 'Exit command (final level)', { mono: true })),
  STAGE_OBJECT_FIELD,
];

/** Fields of one entry of `files[]`, `enemies[]`, `pickups[]` and `patches[]`; the Terminal Lab builds its setup forms from them. */
const appearTail = (sfxKey: string, sfxLabel: string): Field[] => [
  opt(t(sfxKey, sfxLabel, { suggest: 'sfx', mono: true })),
  opt({ type: 'union', key: 'appearWhen', label: 'Appears when (hidden until this holds)', union: COND_VARIANTS }),
  ...transformFields({ includeY: true }),
];

export const FILE_FIELDS: Field[] = [
  t('path', 'Path', { mono: true }),
  sel('kind', 'Kind', ['file', 'dir', 'socket']),
  n('mode', 'Mode (octal)', { octal: true }),
  opt(n('uid', 'Owner uid')),
  opt(b('questCritical', 'Quest critical (restored if deleted)')),
  opt(t('content', 'Content', { rows: 8, mono: true })),
  opt(n('x', 'Stage X', { step: 0.05 })),
  opt(t('model', 'Stage model', { suggest: 'models' })),
  opt(sel('socket', 'Room socket', ROOM_SOCKETS)),
  opt(t('label', 'Stage label')),
  ...appearTail('sfx', 'SFX cue override'),
];

export const ENEMY_FIELDS: Field[] = [
  t('id', 'Id'),
  sel('type', 'Type', ENEMY_TYPES),
  t('path', 'File', { suggest: 'paths', mono: true }),
  opt(n('pid', 'PID (marker; random each load, text writes {pid:<id>})')),
  opt(n('ppid', 'PPID')),
  opt(b('hidden', 'Starts hidden (dotfile)')),
  opt(t('port', 'Port dir (worm)', { suggest: 'paths', mono: true })),
  opt(t('buffer', 'Buffer (exploit)', { suggest: 'paths', mono: true })),
  opt(t('helps', 'Helps enemy (crack)', { suggest: 'enemies' })),
  opt({ type: 'strings', key: 'showIn', label: 'Also shown in subdirs (one path per line)' }),
  opt(n('x', 'Stage X', { step: 0.05 })),
  opt(t('model', 'Override model', { suggest: 'models' })),
  opt(sel('socket', 'Room socket', ROOM_SOCKETS)),
  opt(t('label', 'Stage label')),
  opt(t('attackSfx', 'Attack SFX override', { suggest: 'sfx', mono: true })),
  ...appearTail('killSfx', 'Kill SFX override'),
];

export const PICKUP_FIELDS: Field[] = [
  t('id', 'Id'),
  sel('type', 'Type', PICKUP_TYPES),
  t('path', 'File', { suggest: 'paths', mono: true }),
  opt(b('locked', 'Starts encrypted')),
  opt(t('model', 'Override pickup model', { suggest: 'models' })),
  opt(n('x', 'Stage X', { step: 0.05 })),
  opt(sel('socket', 'Room socket', ROOM_SOCKETS)),
  opt(t('label', 'Stage label')),
  opt(t('sfx', 'Pickup SFX override', { suggest: 'sfx', mono: true })),
  ...transformFields({ includeY: true }),
  opt(n('dropFromX', 'Drop from X (launch origin)', { step: 0.05 })),
  opt(n('dropFromY', 'Drop from Y (launch height)', { step: 0.05 })),
  opt({ type: 'union', key: 'appearWhen', label: 'Appears when (drops onto ground)', union: COND_VARIANTS }),
];

export const PROP_FIELDS: Field[] = [
  t('id', 'Id'),
  t('model', 'Model', { suggest: 'models' }),
  n('x', 'Stage x (room spans about -1 to 5)', { step: 0.1 }),
  opt(sel('socket', 'Room socket', ROOM_SOCKETS)),
  opt(sel('kind', 'Actor kind', ['prop', 'npc', 'door', 'pickup', 'enemy', 'boss', 'vibecoder'])),
  opt(t('label', 'Label')),
  opt(t('sfx', 'SFX cue override', { suggest: 'sfx', mono: true })),
  opt(t('cwd', 'Only visible in cwd', { mono: true, suggest: 'paths' })),
  ...transformFields({ includeY: true }),
];

export const PATCH_FIELDS: Field[] = [t('file', 'File name'), t('label', 'Label'), t('find', 'Find', { rows: 2, mono: true }), t('replace', 'Replace', { rows: 2, mono: true })];

export const RIDDLE_FIELDS: Field[] = [
  t('id', 'Id'),
  t('path', 'Socket path', { mono: true, suggest: 'paths', hint: 'a .sock file in the room' }),
  t('prompt', 'What the socket says', { rows: 3 }),
  t('answer', 'Accepted answer', { mono: true, hint: 'the exact text, or re:regex (re:/^(a|b)$/i for flags)' }),
  opt(t('speaker', 'Speaker name')),
  opt({ type: 'strings', key: 'hints', label: 'Hints, one per wrong answer (the last repeats)' }),
  opt(t('success', 'Said when solved')),
  opt(t('opens', 'Door it opens', { mono: true, suggest: 'paths', hint: 'a directory or file made readable when solved' })),
  opt({ type: 'strings', key: 'tokens', label: 'Commands the bubble highlights (one per line)' }),
];

const GENERATE_FIELDS: Field[] = [
  sel('kind', 'Kind', ['tree']),
  t('root', 'Root directory', { mono: true, suggest: 'paths', hint: 'the decoy folders grow under it (it is created when missing)' }),
  n('folders', 'Decoy folders (at least)'),
  n('hiddenFiles', 'Hidden decoy files (dot files)'),
  t('seed', 'Seed', { mono: true, hint: 'same seed, same tree' }),
];

export const FILES: Field[] = [
  {
    type: 'array',
    key: 'files',
    label: 'Files, directories and sockets',
    item: { title: (f) => `${String(f.kind)} ${String(f.path)}${f.questCritical ? ' *' : ''}`, fields: FILE_FIELDS },
  },
];

export const ENTITIES: Field[] = [
  {
    type: 'array',
    key: 'enemies',
    label: 'Enemies',
    item: { title: (e) => `${String(e.id)} (${String(e.type)}) ${String(e.path)}`, fields: ENEMY_FIELDS },
  },
  {
    type: 'array',
    key: 'pickups',
    label: 'Pickups',
    item: { title: (p) => `${String(p.id)} (${String(p.type)}) ${String(p.path)}`, fields: PICKUP_FIELDS },
  },
  {
    type: 'array',
    key: 'patches',
    label: 'Patch chips (one-click fixes in the code editor)',
    item: { title: (p) => `${String(p.label)} → ${String(p.file)}`, fields: PATCH_FIELDS },
  },
  opt({
    type: 'array',
    key: 'generate',
    label: 'Generated decoy folder trees (hide a file in 100+ folders)',
    item: { title: (g) => `${String(g.kind)} ${String(g.root)} (${String(g.folders)} folders)`, fields: GENERATE_FIELDS },
  }),
  opt({
    type: 'array',
    key: 'riddles',
    label: 'Talking-socket riddles (cat <sock>, echo <answer> > <sock>)',
    item: { title: (r) => `${String(r.id)} (${String(r.path)})`, fields: RIDDLE_FIELDS },
  }),
  opt({
    type: 'array',
    key: 'props',
    label: 'Stage props (hardware & Kiroween dressing)',
    item: { title: (p) => `${String(p.id)} (${String(p.model)})`, fields: PROP_FIELDS },
  }),
];

const DESC = t('description', 'Checklist line shown to the player', { rows: 2 });
export const RULE_VARIANTS = (): Variants<WinRule['kind']> => ({
  read_file: [t('path', 'Path', { suggest: 'paths', mono: true }), DESC],
  talk_ally: [t('socket', 'Socket name', { suggest: 'sockets', mono: true }), DESC],
  riddle_solved: [t('riddleId', 'Riddle id'), DESC],
  file_absent: [t('path', 'Path', { suggest: 'paths', mono: true }), DESC],
  file_contains: [t('path', 'Path', { suggest: 'paths', mono: true }), t('pattern', 'Pattern', { mono: true }), DESC],
  dir_accessible: [t('path', 'Path', { suggest: 'paths', mono: true }), DESC],
  kiro_decrypted: [t('path', 'Path', { suggest: 'paths', mono: true }), DESC],
  kiro_loaded: [sel('core', 'Core', KIRO_CORE_ORDER), DESC],
  enemy_neutralized: [t('enemyId', 'Enemy id', { suggest: 'enemies' }), DESC],
  html_css_valid: [t('htmlPath', 'HTML path', { suggest: 'paths', mono: true }), t('cssPath', 'CSS path', { suggest: 'paths', mono: true }), DESC],
  cart_js_valid: [t('jsPath', 'JS path', { suggest: 'paths', mono: true }), DESC],
  payment_js_valid: [t('jsPath', 'Payment JS path', { suggest: 'paths', mono: true }), DESC],
  laptop_tasks_done: [{ type: 'strings', key: 'tasks', label: 'Laptop task ids (one per line)' }, DESC],
  docker_image_running: [t('imageTag', 'Image tag', { mono: true }), n('port', 'Port'), DESC],
  docker_compose_healthy: [{ type: 'strings', key: 'services', label: 'Services (one per line)' }, opt(b('floating', 'Floating code sheets in mid-air')), DESC],
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
  t('kiro', 'Kiro.d line', { rows: 2 }),
  t('banner', 'Terminal banner', { rows: 5, mono: true, hint: '{foe} {kiro} {gguf} are filled in' }),
];

export const SCRIPT: Field[] = [
  opt(n('openingSec', 'Opening conversation seconds (locks terminal until finished or skipped; then Big Four taunt / battle begins)', { step: 1 })),
  stepsField('arrival', 'Arrival (runs once on entering)', { optional: true }),
  {
    type: 'array',
    key: 'timed',
    label: 'Timed (fires once, N seconds after the level starts)',
    optional: true,
    item: {
      title: (e) => `after ${String(e.afterSec)}s: ${Array.isArray(e.steps) ? e.steps.length : 0} step(s)`,
      fields: [n('afterSec', 'After seconds'), { type: 'union', key: 'unless', label: 'Skip when this holds', union: COND_VARIANTS, optional: true }, stepsField('steps', 'Steps')],
    },
  },
  {
    type: 'array',
    key: 'triggers',
    label: 'Triggers (fire once per level load when a condition holds)',
    optional: true,
    item: {
      title: (tr) => `when ${condTitle((tr.when ?? {}) as Record<string, unknown>)}: ${Array.isArray(tr.steps) ? tr.steps.length : 0} step(s)`,
      fields: [{ type: 'union', key: 'when', label: 'When', union: COND_VARIANTS }, stepsField('steps', 'Steps')],
    },
  },
  {
    type: 'array',
    key: 'locks',
    label: 'Locked commands (refused until a condition holds)',
    optional: true,
    item: {
      title: (l) => {
        const flags = l.flags ? ` [${String(l.flags)}]` : '';
        const args = l.args !== undefined && l.args !== '' ? ` (${String(l.args)})` : '';
        return `${String(l.command)}${flags}${args}: ${String(l.message).slice(0, 60)}`;
      },
      fields: [
        t('command', 'Command (first word)', { mono: true }),
        opt(t('flags', 'Option flags (* or short letters, e.g. la)', { mono: true })),
        opt(t('args', 'Args pattern (glob or re:...)', { mono: true })),
        opt(b('freeAction', 'Free action (0 battle turns)')),
        { type: 'union', key: 'until', label: 'Unlocked when', union: COND_VARIANTS },
        t('message', 'Refusal text', { rows: 2 }),
      ],
    },
  },
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
      opt(t('label', 'Terminal label', { hint: 'e.g. KIRO.D TUTORIAL' })),
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
    label: 'Kiro.d daemon',
    optional: true,
    fields: [
      opt(sel('stage', 'On stage', ['show', 'crack_only', 'hidden'])),
      opt({ type: 'strings', key: 'hideWhen', label: 'Hide while (intro / exit_open / before_spawn, one per line)' }),
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
    fields: [
      t('id', 'Id'),
      t('name', 'Name'),
      t('processName', 'Process'),
      n('pid', 'PID'),
      t('model', 'Model', { suggest: 'models' }),
      opt(t('cameoModel', 'Cameo supervisor model', { suggest: 'models' })),
      opt(t('cameoLabel', 'Cameo stage label')),
      opt({
        type: 'object',
        key: 'cameoTransform',
        label: 'Cameo placement & transform',
        fields: [opt(n('x', 'X', { step: 0.05 })), opt(t('label', 'Label')), ...transformFields({ includeY: true })],
      }),
    ],
  },
  { type: 'strings', key: 'mechanicsSummary', label: 'Mechanics summary (one per line)', rows: 6 },
  {
    type: 'array',
    key: 'grants',
    label: 'Grants when a level is entered directly (cumulative)',
    optional: true,
    item: {
      title: (g) => `after level ${String(g.afterLevel)}: ${[g.ram ? `+${String(g.ram)}GB RAM` : '', g.ssd ? `+${String(g.ssd)}GB SSD` : '', g.core ? `core ${String(g.core)}` : ''].filter(Boolean).join(', ')}`,
      fields: [n('afterLevel', 'After level'), opt(n('ram', 'RAM GB')), opt(n('ssd', 'SSD GB')), opt(n('vram', 'VRAM charges')), opt(t('core', 'Kiro.d core', { suggest: 'cores' })), opt({ type: 'strings', key: 'items', label: 'Items (tube_transistor, terminal, laptop, manual, map, tensor_gpu, vram_module; one per line)' })],
    },
  },
  opt({ type: 'strings', key: 'startItems', label: 'Items he carries at the start (default tube_transistor, terminal; one per line)' }),
  {
    type: 'array',
    key: 'onFirstPickup',
    label: 'First-time pickup dialogs (run once per session on first pickup of each type)',
    optional: true,
    item: {
      title: (fp) => `first ${String(fp.pickup)}: ${Array.isArray(fp.steps) ? fp.steps.length : 0} step(s)`,
      fields: [sel('pickup', 'Pickup type', PICKUP_TYPES), stepsField('steps', 'Steps')],
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
        item: {
          title: (a) => `${String(a.id)} (${String(a.model)})`,
          fields: [t('id', 'Id'), t('model', 'Model', { suggest: 'models' }), t('label', 'Label'), n('x', 'X', { step: 0.05 }), ...transformFields({ includeY: true })],
        },
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
        opt({ type: 'color', key: 'backdrop', label: 'Backdrop sky colour (#rrggbb)' }),
        opt(t('room', 'Room', { suggest: 'rooms' })),
        opt(t('caption', 'Caption', { rows: 2 })),
        {
          type: 'array',
          key: 'cast',
          label: 'Cast',
          item: {
            title: (c) => `${String(c.model)} @ ${String(c.x)}`,
            fields: [t('model', 'Model', { suggest: 'models' }), n('x', 'X', { step: 0.02 }), opt(sel('view', 'View', ['front', 'side', 'top'])), ...transformFields({ includeY: true })],
          },
        },
        opt({
          type: 'array',
          key: 'props',
          label: 'Stage props',
          item: {
            title: (c) => `${String(c.model)} @ ${String(c.x)}`,
            fields: [opt(t('id', 'Id')), t('model', 'Model', { suggest: 'models' }), n('x', 'X', { step: 0.02 }), opt(sel('view', 'View', ['front', 'side', 'top'])), ...transformFields({ includeY: true })],
          },
        }),
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
          fields: [t('text', 'Lettering'), n('x', 'X', { step: 0.02 }), n('y', 'Y', { step: 0.02 }), { type: 'color', key: 'color', label: 'Colour' }, opt(t('cue', 'Audio SFX cue', { suggest: 'sfx', mono: true }))],
        },
      ],
    },
  },
];
