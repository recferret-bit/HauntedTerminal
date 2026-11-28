import type { RoomKind } from '../contracts/room-view.js';
import { ITEM_IDS, isItemId } from '../contracts/inventory.js';
import { BESTIARY, PICKUP_TYPES, type EnemyType, type PickupType } from '../game/bestiary.js';
import { KIRO_CORE_ORDER } from '../game/kiro.js';
import { allStrings, pidRefs, RESERVED_PIDS } from './pids.js';
import { isRec } from './record.js';
import { validateArgsPattern } from './script-locks.js';
import type { ChapterMechanic, ChapterPack, LevelSpec, ScriptCond, ScriptStep, WinRule } from './types.js';
import { checkActorKind, checkComixStory, checkMusicCue, checkSfxCue, checkSocket, checkStageSpec, checkTransform } from './validate-stage.js';

export interface PackIssue {
  severity: 'error' | 'warn';
  /** Level id, or `chapter` / `dialogs` / `comix`. */
  where: string;
  /** Editor tab that holds the fix. */
  tab: string;
  message: string;
}

export const ROOM_KINDS = ['desk', 'attic', 'crypt_entrance', 'crypt_hall', 'chasm', 'cell', 'lab_hall', 'catwalk', 'furnace', 'core', 'outro'] as const satisfies readonly RoomKind[];
export const MECHANICS = ['hub', 'terminal', 'html-css', 'terminal-code', 'docker-image', 'docker-compose', 'boss'] as const satisfies readonly ChapterMechanic[];
export const ENEMY_TYPES = ['virus', 'worm', 'trojan', 'bug', 'exploit', 'crack', 'ransomware', 'spyware', 'rootkit', 'zombie', 'forkbomb', 'kernel'] as const satisfies readonly EnemyType[];
export { PICKUP_TYPES };
const SPEAKERS: readonly string[] = ['clod', 'gork', 'codec', 'antigravy', 'kiro', 'dad'];
const KIRO_HIDE_WHEN = ['intro', 'exit_open', 'before_spawn'] as const;
const SIGNALS = ['SIGTERM', 'SIGKILL', 'SIGSTOP', 'SIGCONT'];

/** Compile-time proof that the lists above name every member of the game's unions: a new RoomKind or EnemyType breaks the build here. */
type Complete<Missing extends never> = Missing;
type AllListsComplete = [
  Complete<Exclude<RoomKind, (typeof ROOM_KINDS)[number]>>,
  Complete<Exclude<ChapterMechanic, (typeof MECHANICS)[number]>>,
  Complete<Exclude<EnemyType, (typeof ENEMY_TYPES)[number]>>,
  Complete<Exclude<PickupType, (typeof PICKUP_TYPES)[number]>>,
];
const assertAllListsComplete = (_proof?: AllListsComplete): void => {};

const baseName = (p: string): string => p.slice(p.lastIndexOf('/') + 1);

/** Everything a level's JSON points at, so a typo is an error instead of a silent no-op. */
class LevelCheck {
  readonly issues: PackIssue[] = [];
  readonly paths: Map<string, string>;
  readonly enemies: Set<string>;
  readonly sockets: Set<string>;
  readonly riddles: Set<string>;

  constructor(readonly spec: LevelSpec, readonly pack: ChapterPack) {
    this.paths = new Map(spec.files.map((f) => [f.path, f.kind]));
    this.enemies = new Set(spec.enemies.map((e) => e.id));
    this.sockets = new Set(spec.files.filter((f) => f.kind === 'socket').map((f) => baseName(f.path)));
    this.riddles = new Set((spec.riddles ?? []).map((r) => r.id));
  }

  add(severity: PackIssue['severity'], tab: string, message: string): void {
    this.issues.push({ severity, where: this.spec.id, tab, message });
  }

  needPath(tab: string, what: string, path: string, kind?: string): void {
    const found = this.paths.get(path);
    if (found === undefined) this.add('error', tab, `${what}: "${path}" is not in files[]`);
    else if (kind && found !== kind) this.add('error', tab, `${what}: "${path}" is a ${found}, expected a ${kind}`);
  }

  /** Entity ids any `spawn` step of this level's script creates. */
  spawnedIds(): Set<string> {
    const sc = this.spec.script;
    const all = [
      ...(sc?.arrival ?? []),
      ...(sc?.timed ?? []).flatMap((t) => t.steps),
      ...(sc?.triggers ?? []).flatMap((tr) => tr.steps),
      ...(sc?.onBossKill ?? []),
    ];
    return new Set(all.flatMap((s) => (s.kind === 'spawn' ? [s.entityId] : [])));
  }

  needEnemy(tab: string, what: string, id: string): void {
    if (!this.enemies.has(id)) this.add('error', tab, `${what}: enemy "${id}" is not in enemies[]`);
  }

  cond(tab: string, what: string, c: ScriptCond): void {
    switch (c.kind) {
      case 'ran_command': {
        if (!c.name.trim()) this.add('error', tab, `${what}: ran_command command name is empty`);
        const err = validateArgsPattern(c.args);
        if (err) this.add('error', tab, `${what}: ran_command.args ${err}`);
        break;
      }
      case 'file_absent':
      case 'file_read':
        this.needPath(tab, what, c.path, 'file');
        break;
      case 'enemy_dead':
        this.needEnemy(tab, what, c.enemyId);
        break;
      case 'has_item':
        if (!isItemId(c.item)) this.add('error', tab, `${what}: unknown item "${c.item}" (${ITEM_IDS.join(', ')})`);
        break;
      case 'flag':
        if (!c.name.trim()) this.add('error', tab, `${what}: flag name is empty`);
        break;
      case 'laptop_tasks_done':
        if (!Array.isArray(c.tasks) || c.tasks.length === 0 || c.tasks.some((t) => !t.trim())) {
          this.add('error', tab, `${what}: laptop_tasks_done needs non-empty task ids`);
        }
        break;
      case 'not':
        this.cond(tab, `${what}.not`, c.of);
        break;
      case 'any':
      case 'all':
        if (c.of.length === 0) this.add('warn', tab, `${what}: empty ${c.kind} condition`);
        c.of.forEach((x) => this.cond(tab, what, x));
        break;
      default:
        break;
    }
  }

  steps(what: string, steps: ScriptStep[]): void {
    const tut = this.spec.script?.tutorial;
    for (const s of steps) {
      if (s.kind === 'dialogue' && !this.sockets.has(s.anchorSocket)) {
        this.add('warn', 'script', `${what}: dialogue anchors on "${s.anchorSocket}", which is not a socket here`);
      }
      if (s.kind === 'tutorial_step' && (!tut || s.step < 1 || s.step > tut.steps.length)) {
        this.add('error', 'script', `${what}: tutorial_step ${s.step} does not exist`);
      }
      if (s.kind === 'dialog_box') {
        if (!s.text.trim()) this.add('error', 'script', `${what}: dialog_box has no text`);
        if (s.holdSec !== undefined && !(s.holdSec > 0)) this.add('error', 'script', `${what}: dialog_box holdSec must be above 0`);
        if (s.speaker !== 'vibecoder' && !SPEAKERS.includes(s.speaker)) this.add('error', 'script', `${what}: dialog_box speaker "${s.speaker}" is not vibecoder or an agent`);
      }
      if (s.kind === 'spawn') {
        if (!s.entityId.trim()) {
          this.add('error', 'script', `${what}: spawn missing entityId`);
        }
        if (s.entrance !== undefined && s.entrance !== 'appear' && s.entrance !== 'glide') {
          this.add('error', 'script', `${what}: spawn entrance "${String(s.entrance)}" must be appear or glide`);
        }
        checkTransform((sev, tab, msg) => this.add(sev, tab, msg), 'script', `${what}: spawn`, s);
      }
      if (s.kind === 'despawn' && !s.entityId.trim()) {
        this.add('error', 'script', `${what}: despawn missing entityId`);
      }
      if (s.kind === 'fx') {
        if (!s.preset.trim()) this.add('error', 'script', `${what}: fx missing preset id`);
        if (s.x !== undefined && !Number.isFinite(s.x)) this.add('error', 'script', `${what}: fx.x must be finite`);
        if (s.y !== undefined && !Number.isFinite(s.y)) this.add('error', 'script', `${what}: fx.y must be finite`);
      }
      if (s.kind === 'carry_item' || s.kind === 'give_item') {
        if (!isItemId(s.item)) this.add('error', 'script', `${what}: unknown item "${String(s.item)}" (${ITEM_IDS.join(', ')})`);
        const who = s.kind === 'carry_item' ? s.entityId : s.from;
        if (who !== undefined && who !== 'kiro' && !this.spawnedIds().has(who)) {
          this.add('warn', 'script', `${what}: "${who}" is not kiro and no spawn step in this level creates it`);
        }
      }
      if (s.kind === 'take_item' && !isItemId(s.item)) this.add('error', 'script', `${what}: unknown item "${String(s.item)}" (${ITEM_IDS.join(', ')})`);
      if (s.kind === 'wait' && !(s.sec > 0)) this.add('error', 'script', `${what}: wait seconds must be above 0`);
      if (s.kind === 'fly_to') {
        if (s.entityId !== 'kiro' && !this.spawnedIds().has(s.entityId)) {
          this.add('warn', 'script', `${what}: "${s.entityId}" is not kiro and no spawn step in this level creates it`);
        }
        if (s.target !== 'hero' && s.target !== 'home' && !this.sockets.has(s.target) && !this.spawnedIds().has(s.target)) {
          this.add('warn', 'script', `${what}: fly_to target "${s.target}" is not hero, home, a socket here or a spawned entity`);
        }
        if (s.ms !== undefined && !(s.ms > 0)) this.add('error', 'script', `${what}: fly_to ms must be above 0`);
      }
      if (s.kind === 'taunt' && !s.fallback && !this.pack.dialogs?.levels[this.spec.id]?.agentTaunt) {
        this.add('warn', 'script', `${what}: taunt step has no dialog agentTaunt and no fallback, so it says nothing`);
      }
      if (s.kind === 'sfx') checkSfxCue((sev, tab, msg) => this.add(sev, tab, msg), 'script', `${what}: sfx`, s.cue);
      if (s.kind === 'music') checkMusicCue((sev, tab, msg) => this.add(sev, tab, msg), 'script', `${what}: music`, s.cue ?? undefined, true);
      if (s.kind === 'set_flag' && !s.name.trim()) this.add('error', 'script', `${what}: set_flag name is empty`);
    }
  }
}

function checkRule(c: LevelCheck, rule: WinRule, i: number): void {
  const what = `winRules[${i}] ${rule.kind}`;
  switch (rule.kind) {
    case 'read_file':
    case 'file_absent':
    case 'file_contains':
    case 'kiro_decrypted':
      c.needPath('rules', what, rule.path);
      break;
    case 'dir_accessible':
      c.needPath('rules', what, rule.path, 'dir');
      break;
    case 'talk_ally':
      if (!c.sockets.has(rule.socket)) c.add('error', 'rules', `${what}: socket "${rule.socket}" is not in files[]`);
      break;
    case 'riddle_solved':
      if (!c.riddles.has(rule.riddleId)) c.add('error', 'rules', `${what}: riddle "${rule.riddleId}" is not in riddles[]`);
      break;
    case 'kiro_loaded':
      if (!KIRO_CORE_ORDER.some((k) => k === rule.core)) c.add('error', 'rules', `${what}: unknown core "${rule.core}" (${KIRO_CORE_ORDER.join(', ')})`);
      break;
    case 'enemy_neutralized':
      c.needEnemy('rules', what, rule.enemyId);
      break;
    case 'html_css_valid':
      c.needPath('rules', what, rule.htmlPath, 'file');
      c.needPath('rules', what, rule.cssPath, 'file');
      break;
    case 'cart_js_valid':
    case 'payment_js_valid':
      c.needPath('rules', what, rule.jsPath, 'file');
      break;
    case 'laptop_tasks_done':
      if (!Array.isArray(rule.tasks) || rule.tasks.length === 0 || rule.tasks.some((t) => !t.trim())) {
        c.add('error', 'rules', `${what}: empty laptop task id list`);
      }
      break;
    case 'docker_compose_healthy':
      if (!Array.isArray(rule.services) || rule.services.length === 0 || rule.services.some((s) => !s.trim())) {
        c.add('error', 'rules', `${what}: empty compose services list`);
      }
      break;
    case 'boss_defeated':
      c.needEnemy('rules', what, rule.bossId);
      c.needPath('rules', what, rule.streamPath, 'file');
      c.needPath('rules', what, rule.anchorPath, 'file');
      if (!c.sockets.has(rule.verifySocket)) c.add('error', 'rules', `${what}: socket "${rule.verifySocket}" is not in files[]`);
      break;
    default:
      break;
  }
  if (!rule.description.trim()) c.add('warn', 'rules', `${what}: empty description (it is the player's checklist line)`);
}

function checkScript(c: LevelCheck): void {
  const script = c.spec.script;
  if (!script) return;
  if (script.openingSec !== undefined && !(script.openingSec >= 0)) c.add('error', 'script', 'script.openingSec must be 0 or more');
  if (script.arrival) c.steps('script.arrival', script.arrival);
  if (script.onBossKill) c.steps('script.onBossKill', script.onBossKill);
  script.timed?.forEach((t, i) => {
    if (!(t.afterSec >= 0)) c.add('error', 'script', `script.timed[${i}]: afterSec must be 0 or more`);
    if (t.steps.length === 0) c.add('warn', 'script', `script.timed[${i}] has no steps`);
    if (t.unless) c.cond('script', `script.timed[${i}].unless`, t.unless);
    c.steps(`script.timed[${i}]`, t.steps);
  });
  script.triggers?.forEach((tr, i) => {
    if (tr.steps.length === 0) c.add('warn', 'script', `script.triggers[${i}] has no steps`);
    c.cond('script', `script.triggers[${i}].when`, tr.when);
    c.steps(`script.triggers[${i}]`, tr.steps);
  });
  script.locks?.forEach((l, i) => {
    if (!l.command.trim()) c.add('error', 'script', `script.locks[${i}]: command is empty`);
    const err = validateArgsPattern(l.args);
    if (err) c.add('error', 'script', `script.locks[${i}].args: ${err}`);
    if (!l.message.trim()) c.add('warn', 'script', `script.locks[${i}]: empty message, the player gets no hint`);
    c.cond('script', `script.locks[${i}].until`, l.until);
  });
  if (script.holdEnemiesUntil) c.cond('script', 'script.holdEnemiesUntil', script.holdEnemiesUntil);
  const tut = script.tutorial;
  if (tut) {
    if (tut.steps.length === 0) c.add('error', 'script', 'script.tutorial has no steps');
    tut.steps.forEach((s, i) => {
      const last = i === tut.steps.length - 1;
      if (!last && !s.doneWhen?.length) c.add('error', 'script', `tutorial step ${i + 1} has no doneWhen, so it never completes`);
      s.doneWhen?.forEach((d) => c.cond('script', `tutorial step ${i + 1}`, d));
    });
    if (tut.hide) {
      c.needEnemy('script', 'tutorial.hide', tut.hide.enemyId);
      if (![...c.paths.keys()].some((p) => baseName(p) === tut.hide?.node)) {
        c.add('error', 'script', `tutorial.hide: node "${tut.hide.node}" is not in files[]`);
      }
      c.cond('script', 'tutorial.hide.revealWhen', tut.hide.revealWhen);
    }
  }
  for (const [from, to] of Object.entries(script.signalAliases ?? {})) {
    if (!SIGNALS.includes(from) || !SIGNALS.includes(String(to))) c.add('error', 'script', `signalAliases ${from} -> ${String(to)}: use ${SIGNALS.join(', ')}`);
  }
  const b = script.bullying;
  if (b && (b.lines.length === 0 || b.every < 1)) c.add('error', 'script', 'script.bullying needs lines[] and every >= 1');
  const k = script.kiro;
  for (const w of k?.hideWhen ?? []) {
    if (!KIRO_HIDE_WHEN.some((x) => x === w)) c.add('error', 'script', `kiro.hideWhen "${String(w)}" must be one of ${KIRO_HIDE_WHEN.join(', ')}`);
  }
  if (k?.hideWhen?.includes('before_spawn') && !(script.timed ?? []).concat([{ afterSec: 0, steps: script.arrival ?? [] }]).some((t) => t.steps.some((st) => st.kind === 'spawn' && st.entityId === 'kiro'))) {
    c.add('error', 'script', 'kiro.hideWhen has before_spawn, but no arrival or timed step spawns "kiro": he would never appear');
  }
  const kiroRule = c.spec.winRules.find((r) => r.kind === 'kiro_loaded');
  if (k?.reactions) {
    for (const core of Object.keys(k.reactions)) {
      if (!kiroRule || kiroRule.kind !== 'kiro_loaded' || kiroRule.core !== core) {
        c.add('warn', 'script', `kiro.reactions["${core}"] never fires: no kiro_loaded rule wants "${core}"`);
      }
    }
  }
  if ((k?.wrongCoreLine || k?.reactions) && !kiroRule) c.add('warn', 'script', 'kiro hub lines set, but the level has no kiro_loaded win rule');
}

function checkLevel(spec: LevelSpec, pack: ChapterPack, winnable: boolean): PackIssue[] {
  const c = new LevelCheck(spec, pack);
  if (!spec.cwd.startsWith('/')) c.add('error', 'overview', `cwd "${spec.cwd}" must be absolute`);
  if (!ROOM_KINDS.some((k) => k === spec.roomKind)) c.add('error', 'overview', `unknown roomKind "${spec.roomKind}"`);
  if (![1, 2, 3, 4, 5].includes(spec.floorTheme)) c.add('error', 'overview', `floorTheme ${spec.floorTheme} must be 1..5`);
  if (!(MECHANICS as readonly string[]).includes(spec.mechanic)) c.add('error', 'overview', `unknown mechanic "${spec.mechanic}"`);
  if (spec.roomSeed !== undefined && (!Number.isFinite(spec.roomSeed) || spec.roomSeed < 1)) {
    c.add('error', 'overview', 'roomSeed must be a finite number >= 1');
  }
  if (winnable && !spec.exitDir && !spec.exitCommand) c.add('error', 'overview', 'set exitDir (a gate to cd into) or exitCommand (e.g. exit)');
  if (spec.exitDir) c.needPath('overview', 'exitDir', spec.exitDir, 'dir');

  const add = (sev: PackIssue['severity'], tab: string, msg: string): void => c.add(sev, tab, msg);
  const seen = new Set<string>();
  for (const f of spec.files) {
    if (!f.path.startsWith('/')) c.add('error', 'files', `file path "${f.path}" must be absolute`);
    if (seen.has(f.path)) c.add('error', 'files', `duplicate file path "${f.path}"`);
    seen.add(f.path);
    checkTransform(add, 'files', `file "${f.path}"`, f);
    checkSocket(add, 'files', `file "${f.path}"`, f.socket);
    checkSfxCue(add, 'files', `file "${f.path}".sfx`, f.sfx);
    if (f.appearWhen) c.cond('files', `file "${f.path}".appearWhen`, f.appearWhen);
  }
  for (const e of spec.enemies) {
    if (!ENEMY_TYPES.some((t) => t === e.type)) c.add('error', 'entities', `enemy "${e.id}": unknown type "${e.type}"`);
    // A zombie is a bare process: its path is the room it haunts.
    c.needPath('entities', `enemy "${e.id}"`, e.path, e.type === 'zombie' ? 'dir' : 'file');
    if (e.helps) c.needEnemy('entities', `enemy "${e.id}" helps`, e.helps);
    if (e.appearWhen) c.cond('entities', `enemy "${e.id}".appearWhen`, e.appearWhen);
    checkTransform(add, 'entities', `enemy "${e.id}"`, e);
    checkSocket(add, 'entities', `enemy "${e.id}"`, e.socket);
    checkSfxCue(add, 'entities', `enemy "${e.id}".attackSfx`, e.attackSfx);
    checkSfxCue(add, 'entities', `enemy "${e.id}".killSfx`, e.killSfx);
  }
  for (const p of spec.pickups) {
    c.needPath('entities', `pickup "${p.id}"`, p.path, 'file');
    if (p.appearWhen) c.cond('entities', `pickup "${p.id}".appearWhen`, p.appearWhen);
    if (p.dropFromX !== undefined && !Number.isFinite(p.dropFromX)) c.add('error', 'entities', `pickup "${p.id}".dropFromX must be finite`);
    if (p.dropFromY !== undefined && !Number.isFinite(p.dropFromY)) c.add('error', 'entities', `pickup "${p.id}".dropFromY must be finite`);
    checkTransform(add, 'entities', `pickup "${p.id}"`, p);
    checkSocket(add, 'entities', `pickup "${p.id}"`, p.socket);
    checkSfxCue(add, 'entities', `pickup "${p.id}".sfx`, p.sfx);
  }
  for (const p of spec.patches) {
    if (![...c.paths.keys()].some((f) => baseName(f) === p.file)) c.add('error', 'entities', `patch "${p.label}": file "${p.file}" is not in files[]`);
  }
  (spec.generate ?? []).forEach((gen, idx) => {
    const what = `generate[${idx}]`;
    if (gen.kind !== 'tree') c.add('error', 'files', `${what}: unknown kind "${String(gen.kind)}" (tree)`);
    if (!gen.root?.startsWith('/')) c.add('error', 'files', `${what}: root "${String(gen.root)}" must be an absolute path`);
    if (!Number.isInteger(gen.folders) || gen.folders < 1) c.add('error', 'files', `${what}: folders must be a whole number of at least 1`);
    if (!Number.isInteger(gen.hiddenFiles) || gen.hiddenFiles < 0) c.add('error', 'files', `${what}: hiddenFiles must be a whole number, 0 or more`);
    if (!gen.seed?.trim()) c.add('error', 'files', `${what}: seed is empty`);
  });
  const riddleIds = new Set<string>();
  (spec.riddles ?? []).forEach((r, idx) => {
    if (!r.id?.trim()) c.add('error', 'entities', `riddles[${idx}]: missing riddle id`);
    else if (riddleIds.has(r.id)) c.add('error', 'entities', `duplicate riddle id "${r.id}"`);
    else riddleIds.add(r.id);
    c.needPath('entities', `riddle "${r.id || idx}"`, r.path, 'socket');
    if (r.opens) c.needPath('entities', `riddle "${r.id || idx}" opens`, r.opens);
    if (!r.prompt?.trim()) c.add('error', 'entities', `riddle "${r.id || idx}": prompt is empty`);
    if (!r.answer?.trim()) c.add('error', 'entities', `riddle "${r.id || idx}": answer is empty`);
  });
  const propIds = new Set<string>();
  (spec.props ?? []).forEach((p, idx) => {
    if (!p.id?.trim()) c.add('error', 'entities', `props[${idx}]: missing prop id`);
    else if (propIds.has(p.id)) c.add('error', 'entities', `duplicate prop id "${p.id}"`);
    else propIds.add(p.id);
    if (!p.model?.trim()) c.add('error', 'entities', `prop "${p.id || idx}": missing model id`);
    if (!Number.isFinite(p.x)) c.add('error', 'entities', `prop "${p.id || idx}": x must be finite`);
    if (p.cwd !== undefined && !p.cwd.startsWith('/')) c.add('error', 'entities', `prop "${p.id || idx}".cwd: must be absolute`);
    checkTransform(add, 'entities', `prop "${p.id || idx}"`, p);
    checkSocket(add, 'entities', `prop "${p.id || idx}"`, p.socket);
    checkActorKind(add, 'entities', `prop "${p.id || idx}".kind`, p.kind);
    checkSfxCue(add, 'entities', `prop "${p.id || idx}".sfx`, p.sfx);
  });
  checkStageSpec(add, spec.stage);

  if (winnable && spec.winRules.length === 0) c.add('error', 'rules', 'a level needs at least one win rule');
  spec.winRules.forEach((r, i) => checkRule(c, r, i));
  for (const rule of spec.winRules) {
    const critical = rule.kind === 'read_file' || rule.kind === 'file_contains'
      ? [rule.path]
      : rule.kind === 'payment_js_valid'
        ? [rule.jsPath]
        : [];
    for (const path of critical) {
      if (c.paths.get(path) === 'file' && !spec.files.find((f) => f.path === path)?.questCritical) {
        c.add('warn', 'files', `"${path}" is needed by a win rule but not questCritical, so deleting it soft-locks the level`);
      }
    }
  }

  const last = spec.solutionCommands[spec.solutionCommands.length - 1] ?? '';
  if (!winnable) {
    /* a test level (the Terminal Lab) has no solution to check */
  } else if (spec.solutionCommands.length === 0) c.add('error', 'rules', 'solutionCommands is empty');
  else if (spec.exitDir && last !== `cd ${baseName(spec.exitDir)}`) c.add('warn', 'rules', `the solution should end with "cd ${baseName(spec.exitDir)}"`);
  else if (!spec.exitDir && spec.exitCommand && last !== spec.exitCommand) c.add('warn', 'rules', `the solution should end with "${spec.exitCommand}"`);

  checkScript(c);
  const dialog = pack.dialogs?.levels[spec.id];
  checkPids(c, dialog, winnable);
  if (pack.dialogs && !dialog) c.add('warn', 'dialogs', 'no entry in dialogs.json (banner, hints, taunt, completion)');
  if (dialog && dialog.hankRungs.length !== 3) c.add('error', 'dialogs', 'hankRungs needs exactly 3 hints');
  return c.issues;
}

/**
 * Random PIDs (spec `random-pids`): a `{pid:<id>}` must name an enemy of this level that has a rolled `pid`, and the number
 * a spec gives an enemy must not be written out in the level's text or its dialogs (it changes on every load).
 */
function checkPids(c: LevelCheck, dialog: unknown, winnable: boolean): void {
  const rolled = new Map(c.spec.enemies.filter((e) => e.pid !== undefined && !RESERVED_PIDS.includes(e.pid)).map((e) => [e.id, e.pid as number]));
  for (const id of new Set(pidRefs([c.spec, dialog]))) {
    if (!rolled.has(id)) c.add('error', 'enemies', `{pid:${id}} names no enemy of this level that has a pid to roll`);
  }
  if (!winnable) return;
  const text = allStrings([c.spec, dialog]);
  for (const [id, pid] of rolled) {
    const hit = text.find((s) => new RegExp(`(?<![\\d.])${pid}(?![\\d])`).test(s));
    if (hit) c.add('error', 'enemies', `"${hit.slice(0, 50)}" writes PID ${pid} of ${id} as a number; write {pid:${id}} (the PID is random on every load)`);
  }
}

export interface ValidateOptions {
  /** False skips what only a shippable level needs (an exit, a win rule, a solution): a Terminal Lab level has none. Default true. */
  winnable?: boolean;
}

/** Static checks over the draft. The headless playthrough (`solvePack`) covers behaviour; this covers references. */
export function validatePack(pack: ChapterPack, { winnable = true }: ValidateOptions = {}): PackIssue[] {
  assertAllListsComplete();
  const issues: PackIssue[] = [];
  const ids = new Set<string>();
  pack.levels.forEach((spec, i) => {
    if (ids.has(spec.id)) issues.push({ severity: 'error', where: 'chapter', tab: 'manifest', message: `duplicate level id "${spec.id}"` });
    ids.add(spec.id);
    if (spec.index !== i + 1) issues.push({ severity: 'error', where: spec.id, tab: 'overview', message: `index ${spec.index} should be ${i + 1}` });
    issues.push(...checkLevel(spec, pack, winnable));
  });
  for (const s of pack.manifest.levels) {
    const spec = pack.levels.find((l) => l.id === s.id);
    if (!spec) {
      issues.push({ severity: 'error', where: 'chapter', tab: 'manifest', message: `manifest level "${s.id}" has no spec` });
      continue;
    }
    for (const key of ['title', 'cwd', 'roomKind', 'floorTheme', 'mechanic'] as const) {
      if (s[key] !== spec[key]) {
        issues.push({ severity: 'warn', where: s.id, tab: 'overview', message: `manifest summary "${key}" differs from the spec (Save refreshes it)` });
      }
    }
  }
  const boss = pack.levels.find((l) => l.mechanic === 'boss');
  if (boss && !pack.manifest.boss.cameoModel) {
    issues.push({ severity: 'warn', where: 'chapter', tab: 'manifest', message: 'boss level without boss.cameoModel: no supervisor on stage' });
  }
  const manifestItems: Array<[string, readonly string[] | undefined]> = [
    ['startItems', pack.manifest.startItems],
    ...(pack.manifest.grants ?? []).map((g, i): [string, readonly string[] | undefined] => [`grants[${i}].items`, g.items]),
  ];
  for (const [where, items] of manifestItems) {
    for (const item of items ?? []) {
      if (!isItemId(item)) issues.push({ severity: 'error', where: 'chapter', tab: 'manifest', message: `${where}: unknown item "${item}" (${ITEM_IDS.join(', ')})` });
    }
    if (items && new Set(items).size !== items.length) {
      issues.push({ severity: 'warn', where: 'chapter', tab: 'manifest', message: `${where}: lists an item twice` });
    }
  }
  const seenFirst = new Set<string>();
  pack.manifest.onFirstPickup?.forEach((fp, i) => {
    if (!(PICKUP_TYPES as readonly string[]).includes(fp.pickup)) {
      issues.push({ severity: 'error', where: 'chapter', tab: 'manifest', message: `onFirstPickup[${i}]: unknown pickup "${String(fp.pickup)}"` });
    } else if (seenFirst.has(fp.pickup)) {
      issues.push({ severity: 'warn', where: 'chapter', tab: 'manifest', message: `onFirstPickup[${i}]: duplicate entry for "${fp.pickup}"` });
    } else {
      seenFirst.add(fp.pickup);
    }
    if (fp.steps.length === 0) {
      issues.push({ severity: 'warn', where: 'chapter', tab: 'manifest', message: `onFirstPickup[${i}] has no steps` });
    }
    for (const s of fp.steps) {
      if (s.kind === 'dialog_box') {
        if (!s.text.trim()) issues.push({ severity: 'error', where: 'chapter', tab: 'manifest', message: `onFirstPickup[${i}]: dialog_box has no text` });
        if (s.speaker !== 'vibecoder' && !SPEAKERS.includes(s.speaker)) {
          issues.push({ severity: 'error', where: 'chapter', tab: 'manifest', message: `onFirstPickup[${i}]: unknown dialog_box speaker "${s.speaker}"` });
        }
      }
    }
  });
  const manifestAdd = (sev: PackIssue['severity'], tab: string, msg: string): void => {
    issues.push({ severity: sev, where: 'chapter', tab, message: msg });
  };
  checkTransform(manifestAdd, 'manifest', 'boss.cameoTransform', pack.manifest.boss.cameoTransform);
  (pack.manifest.outro?.actors ?? []).forEach((a, i) => checkTransform(manifestAdd, 'manifest', `outro.actors[${i}]`, a));
  checkComixStory(issues, pack.comix);
  return issues;
}

// ---- asset references --------------------------------------------------------------------------------------------

/** Keys whose string value must be a registered model id (`room` only inside the comic: `room.attic`). */
const MODEL_KEYS = new Set(['model', 'cameoModel']);

function walkModels(value: unknown, where: string, tab: string, has: (id: string) => boolean, out: PackIssue[], inComix: boolean): void {
  if (Array.isArray(value)) {
    value.forEach((v) => walkModels(v, where, tab, has, out, inComix));
    return;
  }
  if (!isRec(value)) return;
  for (const [key, v] of Object.entries(value)) {
    const isModel = MODEL_KEYS.has(key) || (inComix && key === 'room');
    if (isModel && typeof v === 'string') {
      if (!has(v)) out.push({ severity: 'error', where, tab, message: `unknown asset "${v}" (${key}); pick an id from the model catalog` });
    } else {
      walkModels(v, where, tab, has, out, inComix);
    }
  }
}

function walkFx(value: unknown, where: string, tab: string, hasFx: (id: string) => boolean, out: PackIssue[]): void {
  if (Array.isArray(value)) {
    value.forEach((v) => walkFx(v, where, tab, hasFx, out));
    return;
  }
  if (!isRec(value)) return;
  if (value.kind === 'fx' && typeof value.preset === 'string' && !hasFx(value.preset)) {
    out.push({ severity: 'error', where, tab, message: `unknown fx preset "${value.preset}"; pick an id from the FX catalog` });
  }
  for (const v of Object.values(value)) walkFx(v, where, tab, hasFx, out);
}

/**
 * Every model, room and FX id a chapter mentions must exist. `hasModel` and `hasFx` are passed in from the asset layer
 * (`ModelCatalog.has` / `FxCatalog.has`) so the chapters layer stays free of procgen.
 */
export function assetIssues(pack: ChapterPack, hasModel: (id: string) => boolean, hasFx?: (id: string) => boolean): PackIssue[] {
  const out: PackIssue[] = [];
  walkModels(pack.manifest, 'chapter', 'manifest', hasModel, out, false);
  if (hasFx) walkFx(pack.manifest, 'chapter', 'manifest', hasFx, out);
  for (const level of pack.levels) {
    walkModels(level.files, level.id, 'files', hasModel, out, false);
    walkModels(level.stage, level.id, 'overview', hasModel, out, false);
    walkModels(level.script, level.id, 'script', hasModel, out, false);
    if (hasFx) walkFx(level.script, level.id, 'script', hasFx, out);
    walkModels(level.props, level.id, 'entities', hasModel, out, false);
    walkModels(level.pickups, level.id, 'entities', hasModel, out, false);
    for (const e of level.enemies) {
      const model = e.model ?? BESTIARY[e.type]?.model;
      if (!model || !hasModel(model)) out.push({ severity: 'error', where: level.id, tab: 'entities', message: `enemy "${e.id}": invalid model "${String(model)}"` });
    }
  }
  walkModels(pack.comix, 'comix', 'comic', hasModel, out, true);
  return out;
}
