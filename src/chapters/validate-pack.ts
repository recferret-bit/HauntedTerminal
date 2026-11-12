import type { RoomKind } from '../contracts/room-view.js';
import { BESTIARY, type EnemyType, type PickupType } from '../game/bestiary.js';
import { KIRO_CORE_ORDER } from '../game/kiro.js';
import { isRec } from './record.js';
import type { ChapterMechanic, ChapterPack, LevelSpec, ScriptCond, ScriptStep, WinRule } from './types.js';

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
export const PICKUP_TYPES = ['energy', 'ram', 'ssd'] as const satisfies readonly PickupType[];
const SIGNALS = ['SIGTERM', 'SIGKILL', 'SIGSTOP', 'SIGCONT'];

/** Compile-time proof that the lists above name every member of the game's unions: a new RoomKind or EnemyType breaks the build here. */
type Complete<Missing extends never> = Missing;
export type AllListsComplete = [
  Complete<Exclude<RoomKind, (typeof ROOM_KINDS)[number]>>,
  Complete<Exclude<ChapterMechanic, (typeof MECHANICS)[number]>>,
  Complete<Exclude<EnemyType, (typeof ENEMY_TYPES)[number]>>,
  Complete<Exclude<PickupType, (typeof PICKUP_TYPES)[number]>>,
];

const baseName = (p: string): string => p.slice(p.lastIndexOf('/') + 1);

/** Everything a level's JSON points at, so a typo is an error instead of a silent no-op. */
class LevelCheck {
  readonly issues: PackIssue[] = [];
  readonly paths: Map<string, string>;
  readonly enemies: Set<string>;
  readonly sockets: Set<string>;

  constructor(readonly spec: LevelSpec, readonly pack: ChapterPack) {
    this.paths = new Map(spec.files.map((f) => [f.path, f.kind]));
    this.enemies = new Set(spec.enemies.map((e) => e.id));
    this.sockets = new Set(spec.files.filter((f) => f.kind === 'socket').map((f) => baseName(f.path)));
  }

  add(severity: PackIssue['severity'], tab: string, message: string): void {
    this.issues.push({ severity, where: this.spec.id, tab, message });
  }

  needPath(tab: string, what: string, path: string, kind?: string): void {
    const found = this.paths.get(path);
    if (found === undefined) this.add('error', tab, `${what}: "${path}" is not in files[]`);
    else if (kind && found !== kind) this.add('error', tab, `${what}: "${path}" is a ${found}, expected a ${kind}`);
  }

  needEnemy(tab: string, what: string, id: string): void {
    if (!this.enemies.has(id)) this.add('error', tab, `${what}: enemy "${id}" is not in enemies[]`);
  }

  cond(tab: string, what: string, c: ScriptCond): void {
    switch (c.kind) {
      case 'file_absent':
      case 'file_read':
        this.needPath(tab, what, c.path, 'file');
        break;
      case 'enemy_dead':
        this.needEnemy(tab, what, c.enemyId);
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
      if (s.kind === 'taunt' && !s.fallback && !this.pack.dialogs?.levels[this.spec.id]?.agentTaunt) {
        this.add('warn', 'script', `${what}: taunt step has no dialog agentTaunt and no fallback, so it says nothing`);
      }
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
      c.needPath('rules', what, rule.jsPath, 'file');
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
  if (script.arrival) c.steps('script.arrival', script.arrival);
  if (script.onBossKill) c.steps('script.onBossKill', script.onBossKill);
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

function checkLevel(spec: LevelSpec, pack: ChapterPack): PackIssue[] {
  const c = new LevelCheck(spec, pack);
  if (!spec.cwd.startsWith('/')) c.add('error', 'overview', `cwd "${spec.cwd}" must be absolute`);
  if (!ROOM_KINDS.some((k) => k === spec.roomKind)) c.add('error', 'overview', `unknown roomKind "${spec.roomKind}"`);
  if (![1, 2, 3, 4, 5].includes(spec.floorTheme)) c.add('error', 'overview', `floorTheme ${spec.floorTheme} must be 1..5`);
  if (!(MECHANICS as readonly string[]).includes(spec.mechanic)) c.add('error', 'overview', `unknown mechanic "${spec.mechanic}"`);
  if (!spec.exitDir && !spec.exitCommand) c.add('error', 'overview', 'set exitDir (a gate to cd into) or exitCommand (e.g. exit)');
  if (spec.exitDir) c.needPath('overview', 'exitDir', spec.exitDir, 'dir');

  const seen = new Set<string>();
  for (const f of spec.files) {
    if (!f.path.startsWith('/')) c.add('error', 'files', `file path "${f.path}" must be absolute`);
    if (seen.has(f.path)) c.add('error', 'files', `duplicate file path "${f.path}"`);
    seen.add(f.path);
  }
  for (const e of spec.enemies) {
    if (!ENEMY_TYPES.some((t) => t === e.type)) c.add('error', 'entities', `enemy "${e.id}": unknown type "${e.type}"`);
    c.needPath('entities', `enemy "${e.id}"`, e.path, 'file');
    if (e.helps) c.needEnemy('entities', `enemy "${e.id}" helps`, e.helps);
  }
  for (const p of spec.pickups) c.needPath('entities', `pickup "${p.id}"`, p.path, 'file');
  for (const p of spec.patches) {
    if (![...c.paths.keys()].some((f) => baseName(f) === p.file)) c.add('error', 'entities', `patch "${p.label}": file "${p.file}" is not in files[]`);
  }

  if (spec.winRules.length === 0) c.add('error', 'rules', 'a level needs at least one win rule');
  spec.winRules.forEach((r, i) => checkRule(c, r, i));
  for (const rule of spec.winRules) {
    const critical = rule.kind === 'read_file' || rule.kind === 'file_contains' ? [rule.path] : [];
    for (const path of critical) {
      if (c.paths.get(path) === 'file' && !spec.files.find((f) => f.path === path)?.questCritical) {
        c.add('warn', 'files', `"${path}" is needed by a win rule but not questCritical, so deleting it soft-locks the level`);
      }
    }
  }

  const last = spec.solutionCommands[spec.solutionCommands.length - 1] ?? '';
  if (spec.solutionCommands.length === 0) c.add('error', 'rules', 'solutionCommands is empty');
  else if (spec.exitDir && last !== `cd ${baseName(spec.exitDir)}`) c.add('warn', 'rules', `the solution should end with "cd ${baseName(spec.exitDir)}"`);
  else if (!spec.exitDir && spec.exitCommand && last !== spec.exitCommand) c.add('warn', 'rules', `the solution should end with "${spec.exitCommand}"`);

  checkScript(c);
  const dialog = pack.dialogs?.levels[spec.id];
  if (pack.dialogs && !dialog) c.add('warn', 'dialogs', 'no entry in dialogs.json (banner, hints, taunt, completion)');
  if (dialog && dialog.hankRungs.length !== 3) c.add('error', 'dialogs', 'hankRungs needs exactly 3 hints');
  return c.issues;
}

/** Static checks over the draft. The headless playthrough (`solvePack`) covers behaviour; this covers references. */
export function validatePack(pack: ChapterPack): PackIssue[] {
  const issues: PackIssue[] = [];
  const ids = new Set<string>();
  pack.levels.forEach((spec, i) => {
    if (ids.has(spec.id)) issues.push({ severity: 'error', where: 'chapter', tab: 'manifest', message: `duplicate level id "${spec.id}"` });
    ids.add(spec.id);
    if (spec.index !== i + 1) issues.push({ severity: 'error', where: spec.id, tab: 'overview', message: `index ${spec.index} should be ${i + 1}` });
    issues.push(...checkLevel(spec, pack));
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

/**
 * Every model and room id a chapter mentions must exist. `hasModel` is the asset layer's `ModelCatalog.has`,
 * passed in so the chapters layer stays free of procgen.
 */
export function assetIssues(pack: ChapterPack, hasModel: (id: string) => boolean): PackIssue[] {
  const out: PackIssue[] = [];
  walkModels(pack.manifest, 'chapter', 'manifest', hasModel, out, false);
  for (const level of pack.levels) {
    walkModels(level.script, level.id, 'script', hasModel, out, false);
    for (const e of level.enemies) {
      const model = BESTIARY[e.type]?.model;
      if (!model || !hasModel(model)) out.push({ severity: 'error', where: level.id, tab: 'entities', message: `enemy "${e.id}": no model for type "${e.type}"` });
    }
  }
  walkModels(pack.comix, 'comix', 'comic', hasModel, out, true);
  return out;
}
