import type { KernelEvent } from '../contracts/events.js';
import type { World } from './entities.js';
import { labGoalsOf } from './lab-checks.js';
import type { ClassicLabFile, LabConfig, LabEntity, LabInjection, LabInspect, LabLevelState, LabNode } from './lab-types.js';
import { absPath, lookup, makeNode, type VNode } from './tree.js';

const CONTENT_LIMIT = 4000;

function toLabNode(node: VNode, path: string): LabNode {
  const out: LabNode = {
    id: node.id,
    name: node.name,
    path: path || '/',
    kind: node.kind,
    mode: node.mode,
    uid: node.uid,
  };
  if (node.kind === 'dir') {
    out.children = [...node.children.values()].map((c) => toLabNode(c, `${path}/${c.name}`));
  } else if (node.content) {
    out.content = node.content.length > CONTENT_LIMIT ? node.content.slice(0, CONTENT_LIMIT) : node.content;
  }
  return out;
}

function buildLabEntities(world: World, held: boolean): LabEntity[] {
  const out: LabEntity[] = world.enemies.map((e) => ({
    id: e.id,
    model: e.model,
    kind: e.boss ? 'boss' : 'enemy',
    target: e.name,
    state: world.stateOf(e),
    hp: e.dead ? 0 : e.hp,
    maxHp: e.maxHp,
    pid: e.pid ?? undefined,
    unseen: !e.revealed && !e.dead,
    clock: e.clock,
    every: world.cadence(e),
    attackIn: held ? null : world.ticksToTell(e),
  }));
  for (const p of world.pickups) {
    if (!p.collected) {
      out.push({ id: p.id, model: p.model, kind: 'pickup', target: p.name, state: 'idle', unseen: false });
    }
  }
  return out;
}

export function ensureLabDirChain(root: VNode, fullDirPath: string): VNode {
  const parts = fullDirPath.split('/').filter(Boolean);
  let cur = root;
  for (const part of parts) {
    let child = cur.children.get(part);
    if (!child) child = makeNode(cur, part, 'dir', 0o755);
    cur = child;
  }
  return cur;
}

export function splitLabParentAndName(fullPath: string): { parentPath: string; name: string } {
  const clean = fullPath.replace(/\/+$/, '');
  const idx = clean.lastIndexOf('/');
  if (idx <= 0) return { parentPath: '/', name: clean.slice(1) };
  return { parentPath: clean.slice(0, idx), name: clean.slice(idx + 1) };
}

export function placeLabFile(root: VNode, f: ClassicLabFile): VNode {
  if (f.kind === 'dir') {
    const dir = ensureLabDirChain(root, f.path);
    dir.mode = f.mode ?? 0o755;
    dir.uid = f.uid ?? 1000;
    return dir;
  }
  const { parentPath, name } = splitLabParentAndName(f.path);
  const parent = ensureLabDirChain(root, parentPath);
  const existing = parent.children.get(name);
  const node = existing && existing.kind === f.kind ? existing : makeNode(parent, name, f.kind, f.mode ?? 0o644);
  node.mode = f.mode ?? node.mode;
  node.uid = f.uid ?? 1000;
  if (f.questCritical !== undefined) node.questCritical = f.questCritical;
  if (f.content !== undefined) node.content = f.content;
  return node;
}

function checkInjectionProblem(world: World, root: VNode, what: LabInjection): string | null {
  const spawn = what.enemy ?? what.pickup;
  if (!spawn || (what.enemy && what.pickup)) return 'inject exactly one enemy or one pickup';
  if (world.enemies.some((e) => e.id === spawn.id) || world.pickups.some((p) => p.id === spawn.id)) {
    return `id "${spawn.id}" is already in the level`;
  }
  if (what.enemy?.pid !== undefined && world.enemyByPid(what.enemy.pid)) {
    return `pid ${what.enemy.pid} is already in use`;
  }
  const planned = new Set((what.files ?? []).map((f) => f.path));
  const needsFile = what.pickup !== undefined || what.enemy?.type !== 'zombie';
  if (needsFile && !planned.has(spawn.path) && lookup(root, spawn.path)?.kind !== 'file') {
    return `${spawn.path} is not a file`;
  }
  return null;
}

export function applyLabInjection(root: VNode, world: World, what: LabInjection): KernelEvent[] {
  const problem = checkInjectionProblem(world, root, what);
  if (problem) throw new Error(problem);
  const events: KernelEvent[] = [];
  for (const f of what.files ?? []) {
    if (lookup(root, f.path)) continue;
    const node = placeLabFile(root, f);
    events.push({ type: 'FILE_CREATED', inodeId: node.id, name: node.name });
  }
  const added = what.enemy ? world.addEnemy(what.enemy) : what.pickup ? world.addPickup(what.pickup) : null;
  if (added) events.push({ type: 'ENTITY_SPAWNED', entityId: added.id, model: added.model, reason: 'script' });
  world.sync(events);
  return events;
}

export interface BuildLabInspectArgs {
  levelId: string;
  root: VNode;
  cwd: VNode;
  world: World;
  hp: number;
  maxHp: number;
  enemiesLeft: number;
  held: boolean;
  lab: LabConfig | null;
  state: LabLevelState;
  socketInputs: ReadonlyMap<string, string>;
  filesRead: ReadonlySet<string>;
  checklist: ReadonlyArray<{ description: string; done: boolean }>;
}

export function buildLabInspect(args: BuildLabInspectArgs): LabInspect {
  const absorbed = { ...args.state.absorbed };
  return {
    levelId: args.levelId,
    cwd: absPath(args.cwd),
    hp: args.hp,
    maxHp: args.maxHp,
    enemiesLeft: args.enemiesLeft,
    absorbed,
    absorbedTotal: Object.values(absorbed).reduce((sum, n) => sum + n, 0),
    tree: toLabNode(args.root, ''),
    sockets: Object.fromEntries(args.socketInputs),
    filesRead: [...args.filesRead],
    entities: buildLabEntities(args.world, args.held),
    goals: labGoalsOf(args.lab, args.state, args.root, args.checklist),
  };
}
