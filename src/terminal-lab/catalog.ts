import '../procgen/index.js';
import { ModelCatalog } from '../procgen/core/catalog.js';
import { MODEL_CATEGORIES, type ModelCategory } from '../procgen/core/types.js';
import { BESTIARY, PICKUP_INFO, type EnemyType, type PickupType } from '../game/bestiary.js';
import { baseName } from '../game/tree.js';
import { AGENTS, RULE_VARIANTS } from '../chapter-editor/schema.js';
import type { WinRule } from '../chapters/types.js';
import { DEFAULT_PROP_X } from './lab-pack.js';
import { CART_JS, COMPOSE_YML, DOCKERFILE, SERVER_JS, STOREFRONT_CSS, STOREFRONT_HTML } from './templates.js';
import type { LabCond, LabScript, LabSetupOp } from './lab-types.js';

/** One thing the Scene dock can place. `make` reads the lab so ids, pids and positions never collide. */
export interface PaletteEntry {
  group: string;
  id: string;
  label: string;
  hint: string;
  /** The ops to add, the first being the thing itself. A patch chip also brings the file it patches. */
  make(script: LabScript): LabSetupOp[];
}

export interface PaletteGroup {
  group: string;
  entries: PaletteEntry[];
}

/** Model categories the lab can place as a prop. Rooms are the Room form; effects are fired from the Console. */
const PROP_CATEGORIES: readonly ModelCategory[] = MODEL_CATEGORIES.filter((c) => c !== 'room' && c !== 'fx');

/** Where each enemy type lives by default, so a freshly placed one is playable without editing. Complete over `EnemyType` by type. */
const ENEMY_DEFAULTS: Record<EnemyType, { file: string; pid?: number; hidden?: boolean; inPort?: boolean; buffer?: string }> = {
  virus: { file: 'virus.exe', pid: 1 },
  worm: { file: 'worm.bin', inPort: true },
  trojan: { file: 'token_skimmer.bin' },
  bug: { file: 'prod.py' },
  exploit: { file: 'port_hijack.bin', buffer: 'proxy.buf' },
  crack: { file: 'keygen.exe', pid: 1 },
  ransomware: { file: 'ransom.exe', pid: 1 },
  spyware: { file: '.spycam', hidden: true },
  rootkit: { file: '.poltergeist.lock', hidden: true, pid: 1 },
  zombie: { file: '', pid: 1 },
  forkbomb: { file: 'fork.bomb', pid: 1 },
  kernel: { file: 'overlord.ko', pid: 1 },
};

const PICKUP_FILES: Record<PickupType, string> = { energy: 'energy.cell', ram: 'ram_16gb.dimm', ssd: 'ssd_256gb.img', tube_transistor: 'tube_transistor', laptop: 'laptop', tensor_gpu: 'tensor_gpu', vram_module: 'vram.mod' };

const usedIds = (script: LabScript): Set<string> => new Set(script.setup.flatMap((op) => ('id' in op ? [op.id] : [])));
const usedPaths = (script: LabScript): Set<string> => new Set(script.setup.flatMap((op) => ('path' in op ? [op.path] : [])));

function freshId(script: LabScript, base: string): string {
  const taken = usedIds(script);
  for (let i = 1; ; i += 1) {
    const id = `${base}-${i}`;
    if (!taken.has(id)) return id;
  }
}

function freshPath(script: LabScript, dir: string, name: string): string {
  const taken = usedPaths(script);
  const dot = name.lastIndexOf('.') > 0 ? name.lastIndexOf('.') : name.length;
  for (let i = 0; ; i += 1) {
    const candidate = `${dir}/${i === 0 ? name : `${name.slice(0, dot)}_${i + 1}${name.slice(dot)}`}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function freshPid(script: LabScript): number {
  const pids = script.setup.flatMap((op) => (op.op === 'enemy' && op.pid ? [op.pid] : []));
  return Math.max(4000, ...pids) + 1;
}

function freeX(script: LabScript): number {
  const taken = script.setup.flatMap((op) => (op.op === 'prop' ? [op.x] : []));
  return DEFAULT_PROP_X.find((x) => taken.every((t) => Math.abs(t - x) >= 0.5)) ?? DEFAULT_PROP_X[taken.length % DEFAULT_PROP_X.length]!;
}

function enemyEntry(type: EnemyType): PaletteEntry {
  const d = ENEMY_DEFAULTS[type];
  const info = BESTIARY[type];
  return {
    group: 'Enemies',
    id: `enemy.${type}`,
    label: type,
    hint: info.weakness,
    make(script) {
      const cwd = script.room.cwd;
      const pid = d.pid ? freshPid(script) : undefined;
      if (type === 'crack') {
        const existingWorm = script.setup.find(
          (op): op is Extract<LabSetupOp, { op: 'enemy' }> => op.op === 'enemy' && op.type === 'worm' && Boolean(op.port),
        );
        const crackPath = freshPath(script, cwd, d.file);
        const crackId = freshId(script, type);
        if (existingWorm && existingWorm.port) {
          const hasPortDir = script.setup.some((op) => op.op === 'dir' && op.path === existingWorm.port);
          return [
            { op: 'enemy', id: crackId, type, path: crackPath, ...(pid ? { pid, ppid: 1 } : {}), helps: existingWorm.id },
            ...(hasPortDir ? [] : [{ op: 'dir' as const, path: existingWorm.port, mode: 0 }]),
          ];
        }
        const wormId = freshId(script, 'worm');
        const wormPort = freshPath(script, cwd, 'port_445');
        const wormPid = (pid ?? 4000) + 1;
        return [
          { op: 'enemy', id: crackId, type, path: crackPath, ...(pid ? { pid, ppid: 1 } : {}), helps: wormId },
          { op: 'enemy', id: wormId, type: 'worm', path: `${wormPort}/worm.bin`, pid: wormPid, ppid: 1, port: wormPort },
          { op: 'dir', path: wormPort, mode: 0 },
        ];
      }
      const port = d.inPort ? freshPath(script, cwd, 'port_445') : undefined;
      const dir = port ?? cwd;
      return [
        {
          op: 'enemy',
          id: freshId(script, type),
          type,
          path: type === 'zombie' ? cwd : freshPath(script, dir, d.file),
          ...(pid ? { pid, ppid: 1 } : {}),
          ...(d.hidden ? { hidden: true } : {}),
          ...(port ? { port } : {}),
          ...(d.buffer ? { buffer: freshPath(script, cwd, d.buffer) } : {}),
        },
      ];
    },
  };
}

function pickupEntry(type: PickupType): PaletteEntry {
  return {
    group: 'Pickups',
    id: `pickup.${type}`,
    label: type,
    hint: PICKUP_INFO[type].blurb.split('\n')[1] ?? '',
    make: (script) => [{ op: 'pickup', id: freshId(script, type), type, path: freshPath(script, script.room.cwd, PICKUP_FILES[type]) }],
  };
}

const FILE_ENTRIES: PaletteEntry[] = [
  { group: 'Files', id: 'file', label: 'file', hint: 'A text file you can cat, grep and edit.', make: (s) => [{ op: 'file', path: freshPath(s, s.room.cwd, 'notes.txt'), content: 'hello\n' }] },
  { group: 'Files', id: 'dir', label: 'directory', hint: 'A door to another room.', make: (s) => [{ op: 'dir', path: freshPath(s, s.room.cwd, 'folder') }] },
  { group: 'Files', id: 'socket', label: 'socket', hint: 'A talking door: write the answer with echo ... > name.sock.', make: (s) => [{ op: 'socket', path: freshPath(s, s.room.cwd, 'gate.sock'), content: 'Say the word.' }] },
  { group: 'Files', id: 'patch', label: 'patch chip', hint: 'A one-click find and replace in the code editor.', make(s) {
      const path = freshPath(s, s.room.cwd, 'buggy.txt');
      const name = baseName(path);
      return [{ op: 'patch', file: name, label: 'Fix it', find: 'bug', replace: 'fixed' }, { op: 'file', path, content: 'a bug lives here\n' }];
    },
  },
];

const NPC_ENTRIES: PaletteEntry[] = AGENTS.map((agent) => ({
  group: 'NPCs',
  id: `npc.${agent}`,
  label: agent,
  hint: 'An agent cameo that speaks when the level starts.',
  make: () => [{ op: 'npc', agent, mood: 'smug', text: `${agent.toUpperCase()}: "Test line."` }],
}));

const NPC_EXTRA: PaletteEntry[] = [
  {
    group: 'NPCs',
    id: 'npc.taunt',
    label: 'taunt',
    hint: 'The level taunt, spoken by the agent the line starts with.',
    make: () => [{ op: 'taunt', mood: 'laugh', text: 'CLOD: "Try the other door."' }],
  },
  {
    group: 'NPCs',
    id: 'npc.dialogue',
    label: 'bubble on a socket',
    hint: 'A speech bubble anchored on a socket, with highlighted commands.',
    make(s) {
      const path = freshPath(s, s.room.cwd, 'speaker.sock');
      const name = baseName(path);
      return [
        { op: 'dialogue', obstacleId: freshId(s, 'bubble'), speaker: 'Speaker', mood: 'cryptic', anchorSocket: name, text: 'Read the log. Count the failures.', highlight: ['cat', 'grep'], banner: '[ Speaker // COMIX_CLASSIC ]' },
        { op: 'socket', path, content: 'Read the log. Count the failures.' },
      ];
    },
  },
];

const riddleOps = (s: LabScript, base: string, prompt: string, answer: string, hints: string[], extra: LabSetupOp[]): LabSetupOp[] => {
  const path = freshPath(s, s.room.cwd, 'gate.sock');
  const vault = freshPath(s, s.room.cwd, 'vault');
  return [
    { op: 'riddle', id: freshId(s, base), path, prompt, answer, speaker: 'Gate', hints, opens: vault, tokens: ['cat', 'echo'] },
    { op: 'dir', path: vault, mode: 0 },
    ...extra,
  ];
};

const RIDDLE_ENTRIES: PaletteEntry[] = [
  {
    group: 'Riddles',
    id: 'riddle.count',
    label: 'count the lines',
    hint: 'grep | wc -l into a socket (the first floor puzzle).',
    make: (s) =>
      riddleOps(s, 'riddle-count', 'Count every FATAL line in server.log and write the number here.', '3', ['Wrong. The log is in this room.', 'grep FATAL server.log', 'Pipe it into wc -l and redirect the number here.'], [
        { op: 'file', path: freshPath(s, s.room.cwd, 'server.log'), content: 'ok\nFATAL disk\nok\nFATAL net\nFATAL fan\n' },
      ]),
  },
  {
    group: 'Riddles',
    id: 'riddle.reverse',
    label: 'cut and reverse',
    hint: 'cut | rev into a socket (the valve puzzle).',
    make: (s) =>
      riddleOps(s, 'riddle-reverse', 'boiler.dump hides PASS=. Cut the value out, reverse it, and write it here.', 'FEDCBA', ['boiler.dump contains PASS=.', 'cut -d= -f2', 'rev that value into this socket.'], [
        { op: 'file', path: freshPath(s, s.room.cwd, 'boiler.dump'), content: 'TEMP=900\nPASS=ABCDEF\nVALVE=closed\n' },
      ]),
  },
  {
    group: 'Riddles',
    id: 'riddle.regex',
    label: 'any of several answers',
    hint: 'The accepted answer is a regular expression (re:/.../i).',
    make: (s) => riddleOps(s, 'riddle-regex', 'Name a color of the rainbow.', 're:/^(red|orange|yellow|green|blue|indigo|violet)$/i', ['Think of a rainbow.'], []),
  },
];

/** Starting scene for each win rule kind. Typed over every `WinRule` kind, so a new kind cannot ship without a template. */
const TASK_TEMPLATES: Record<WinRule['kind'], (s: LabScript, id: string) => LabSetupOp[]> = {
  read_file: (s, id) => {
    const path = freshPath(s, s.room.cwd, 'briefing.txt');
    return [{ op: 'file', path, content: 'Read me.\n' }, { op: 'task', id, rule: { kind: 'read_file', path, description: 'Read the briefing (cat briefing.txt)' } }];
  },
  talk_ally: (s, id) => {
    const path = freshPath(s, s.room.cwd, 'ally.sock');
    return [{ op: 'socket', path }, { op: 'task', id, rule: { kind: 'talk_ally', socket: baseName(path), description: 'Talk to the ally (cat ally.sock)' } }];
  },
  riddle_solved: (s, id) => {
    const path = freshPath(s, s.room.cwd, 'riddle.sock');
    const riddleId = freshId(s, 'riddle');
    return [
      { op: 'riddle', id: riddleId, path, prompt: 'Speak the hidden dotfile name.', answer: '.secret_rune', speaker: 'Gate', hints: ['Run ls -la to inspect dotfiles.'], tokens: ['ls', 'echo'] },
      { op: 'file', path: freshPath(s, s.room.cwd, '.secret_rune'), content: 'rune\n' },
      { op: 'task', id, rule: { kind: 'riddle_solved', riddleId, description: 'Solve the socket riddle' } },
    ];
  },
  file_absent: (s, id) => {
    const path = freshPath(s, s.room.cwd, 'junk.tmp');
    return [{ op: 'file', path, content: 'junk\n' }, { op: 'task', id, rule: { kind: 'file_absent', path, description: 'Remove junk.tmp' } }];
  },
  file_contains: (s, id) => {
    const path = freshPath(s, s.room.cwd, 'app.conf');
    return [{ op: 'file', path, content: 'MODE=broken\n' }, { op: 'task', id, rule: { kind: 'file_contains', path, pattern: 'MODE=ok', description: "Fix app.conf: sed -i 's/broken/ok/' app.conf" } }];
  },
  dir_accessible: (s, id) => {
    const path = freshPath(s, s.room.cwd, 'locked_dir');
    return [{ op: 'dir', path, mode: 0 }, { op: 'task', id, rule: { kind: 'dir_accessible', path, description: 'Open locked_dir (chmod 755 locked_dir)' } }];
  },
  kiro_decrypted: (s, id) => {
    const path = freshPath(s, s.room.cwd, 'sealed.dat');
    return [{ op: 'file', path, mode: 0, content: 'sealed\n' }, { op: 'task', id, rule: { kind: 'kiro_decrypted', path, description: 'Have Kiro.d decrypt sealed.dat (kiro crack sealed.dat)' } }];
  },
  kiro_loaded: (_s, id) => [{ op: 'task', id, rule: { kind: 'kiro_loaded', core: 'qwen', description: 'Load the qwen core into Kiro.d (kiro load qwen)' } }],
  enemy_neutralized: (s, id) => {
    const enemy = ENEMY_ENTRY_VIRUS.make(s)[0] as Extract<LabSetupOp, { op: 'enemy' }>;
    return [enemy, { op: 'task', id, rule: { kind: 'enemy_neutralized', enemyId: enemy.id, description: `Stop ${enemy.id} (ps, then kill)` } }];
  },
  html_css_valid: (s, id) => {
    const html = freshPath(s, s.room.cwd, 'index.html');
    const css = freshPath(s, s.room.cwd, 'storefront.css');
    return [
      { op: 'file', path: html, content: STOREFRONT_HTML },
      { op: 'file', path: css, content: STOREFRONT_CSS },
      { op: 'task', id, rule: { kind: 'html_css_valid', htmlPath: html, cssPath: css, description: 'Fix the page: show the grid, enable the checkout button' } },
    ];
  },
  cart_js_valid: (s, id) => {
    const path = freshPath(s, s.room.cwd, 'cart.js');
    return [{ op: 'file', path, content: CART_JS }, { op: 'task', id, rule: { kind: 'cart_js_valid', jsPath: path, description: 'Fix cart.js so it adds numbers, not strings' } }];
  },
  docker_image_running: (s, id) => [
    { op: 'file', path: freshPath(s, s.room.cwd, 'Dockerfile'), content: DOCKERFILE },
    { op: 'file', path: freshPath(s, s.room.cwd, 'server.js'), content: SERVER_JS },
    { op: 'task', id, rule: { kind: 'docker_image_running', imageTag: 'byterig-web:1.0', port: 3000, description: 'Fix the Dockerfile, build byterig-web:1.0 and run it on port 3000' } },
  ],
  docker_compose_healthy: (s, id) => [
    { op: 'file', path: freshPath(s, s.room.cwd, 'docker-compose.yml'), content: COMPOSE_YML },
    { op: 'task', id, rule: { kind: 'docker_compose_healthy', services: ['nginx', 'website', 'payment'], description: 'Fix docker-compose.yml and bring the stack up healthy' } },
  ],
  boss_defeated: (s, id) => {
    const cwd = s.room.cwd;
    const boss = ENEMY_ENTRY_KERNEL.make(s)[0] as Extract<LabSetupOp, { op: 'enemy' }>;
    const stream = freshPath(s, cwd, 'chaos.stream');
    const verify = freshPath(s, cwd, 'wakeup.sock');
    const anchor = freshPath(s, cwd, 'anchor.conf');
    return [
      boss,
      { op: 'file', path: stream, content: 'noise\n' },
      { op: 'socket', path: verify },
      { op: 'file', path: anchor, content: 'player_trapped=true\n' },
      {
        op: 'task',
        id,
        rule: {
          kind: 'boss_defeated', bossId: boss.id, streamPath: stream, verifySocket: baseName(verify), expectedToken: 'LIGHTNING_777',
          anchorPath: anchor, anchorPattern: 'player_trapped=false', description: 'Drain the stream, feed the token to wakeup.sock, rewrite the anchor, kill the boss',
        },
      },
    ];
  },
};

const ENEMY_ENTRY_VIRUS = enemyEntry('virus');
const ENEMY_ENTRY_KERNEL = enemyEntry('kernel');

const taskEntry = (kind: WinRule['kind']): PaletteEntry => ({
  group: 'Tasks',
  id: `task.${kind}`,
  label: kind.replace(/_/g, ' '),
  hint: `A win rule of the game (${kind}): it joins the checklist, and its scene comes with it.`,
  make: (s) => TASK_TEMPLATES[kind](s, freshId(s, `task-${kind.replace(/_/g, '-')}`)),
});

const CHECK_TEMPLATES: Array<{ id: string; label: string; hint: string; description: string; when: LabCond }> = [
  { id: 'ran', label: 'a command ran', hint: 'Passes once a command line matching the text was typed.', description: 'Run ls', when: { kind: 'ran', pattern: 'ls' } },
  { id: 'output', label: 'some output', hint: 'Passes once any command printed text matching the pattern.', description: 'See the word FATAL on screen', when: { kind: 'output', pattern: 'FATAL' } },
  { id: 'code', label: 'an exit code', hint: 'Passes once a command ended with the exit code.', description: 'Make a command fail with exit code 1', when: { kind: 'code', code: 1 } },
  { id: 'event', label: 'an event', hint: 'Passes once the game emitted an event of that type.', description: 'Kill something (ENEMY_KILLED)', when: { kind: 'event', type: 'ENEMY_KILLED' } },
  { id: 'file', label: 'a file', hint: 'Passes while the file exists, contains the text, or is absent.', description: 'notes.txt says done', when: { kind: 'file', path: '/lab/notes.txt', contains: 'done' } },
];

const CHECK_ENTRIES: PaletteEntry[] = CHECK_TEMPLATES.map((c) => ({
  group: 'Checks',
  id: `check.${c.id}`,
  label: c.label,
  hint: c.hint,
  make: (s) => [{ op: 'check', id: freshId(s, `check-${c.id}`), description: c.description, when: structuredClone(c.when) }],
}));

function propEntry(model: string, category: ModelCategory): PaletteEntry {
  return {
    group: `Props: ${category}`,
    id: `prop.${model}`,
    label: model.slice(model.indexOf('.') + 1),
    hint: `Visual only: ${model}`,
    make: (script) => [{ op: 'prop', id: freshId(script, model.replace('.', '-')), model, x: freeX(script) }],
  };
}

/** Every placeable object, grouped for the Scene dock. Read from the game's catalogs, never typed by hand. */
export function paletteGroups(): PaletteGroup[] {
  const enemies = (Object.keys(BESTIARY) as EnemyType[]).map(enemyEntry);
  const pickups = (Object.keys(PICKUP_INFO) as PickupType[]).map(pickupEntry);
  const props = PROP_CATEGORIES.flatMap((category) =>
    ModelCatalog.list(category).length === 0 ? [] : [{ group: `Props: ${category}`, entries: ModelCatalog.list(category).map((m) => propEntry(m.id, category)) }],
  );
  return [
    { group: 'Enemies', entries: enemies },
    { group: 'Pickups', entries: pickups },
    { group: 'Files', entries: FILE_ENTRIES },
    { group: 'NPCs', entries: [...NPC_ENTRIES, ...NPC_EXTRA] },
    { group: 'Riddles', entries: RIDDLE_ENTRIES },
    { group: 'Tasks', entries: (Object.keys(RULE_VARIANTS()) as Array<WinRule['kind']>).map(taskEntry) },
    { group: 'Checks', entries: CHECK_ENTRIES },
    ...props,
  ];
}

/** Ids the game has that the palette must offer; the unit test compares them with `paletteGroups()`. */
export function expectedPaletteIds(): string[] {
  return [
    ...Object.keys(BESTIARY).map((t) => `enemy.${t}`),
    ...Object.keys(PICKUP_INFO).map((t) => `pickup.${t}`),
    ...PROP_CATEGORIES.flatMap((c) => ModelCatalog.list(c).map((m) => `prop.${m.id}`)),
    ...AGENTS.map((a) => `npc.${a}`),
    ...['npc.taunt', 'npc.dialogue', ...RIDDLE_ENTRIES.map((e) => e.id), ...CHECK_ENTRIES.map((e) => e.id)],
    ...Object.keys(RULE_VARIANTS()).map((k) => `task.${k}`),
  ];
}
