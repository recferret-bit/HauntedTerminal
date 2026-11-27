import type { KernelEvent } from '../contracts/events.js';
import { BESTIARY, type EnemyType } from '../game/bestiary.js';
import { createBattle } from '../game/battle.js';
import { applyLabInjection } from '../game/lab-support.js';
import { absPath, lookup } from '../game/tree.js';
import type { TickResult } from '../game/types.js';
import { snapshot } from './session-snapshot.js';
import type { ChapterState } from './session-state.js';

function normalizeDirPath(baseCwd: string, raw: string): string {
  const combined = raw.startsWith('/') ? raw : `${baseCwd === '/' ? '' : baseCwd}/${raw}`;
  const out: string[] = [];
  for (const seg of combined.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return `/${out.join('/')}`;
}

/** Room directories authored for this level (omits decoy trees generated dynamically by `level.generate`). */
export function listEditorDirs(g: ChapterState): string[] {
  const dirs: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string): void => {
    const p = normalizeDirPath(g.rt.spec.cwd, raw);
    if (seen.has(p)) return;
    const node = lookup(g.rt.root, p);
    if (node?.kind === 'dir') {
      seen.add(p);
      dirs.push(p);
    }
  };
  add(g.rt.spec.cwd);
  for (const f of g.rt.spec.files) {
    if (f.kind === 'dir') add(f.path);
  }
  for (const key of Object.keys(g.rt.spec.stage?.subdirs ?? {})) {
    add(key);
  }
  return dirs;
}

export function setEditorPreviewOptions(
  g: ChapterState,
  opts: { showHidden?: boolean },
): TickResult {
  if (opts.showHidden !== undefined) g.editorShowHidden = opts.showHidden;
  return { output: '', events: [], snapshot: snapshot(g) };
}

export function setEditorCwd(g: ChapterState, cwd: string): TickResult {
  const target = normalizeDirPath(g.rt.spec.cwd, cwd);
  const node = lookup(g.rt.root, target);
  if (!node || node.kind !== 'dir') {
    return { output: '', events: [], snapshot: snapshot(g) };
  }
  const fromDir = g.rt.cwd.id;
  g.rt.cwd = node;
  const toPath = absPath(node);
  const events: KernelEvent[] = fromDir === node.id
    ? []
    : [{
        type: 'ROOM_TRANSITION',
        fromDir,
        toDir: node.id,
        toPath,
        upwardPanelsSmashed: 0,
        viaSymlinkLoop: false,
      }];
  return { output: '', events, snapshot: snapshot(g) };
}

const TEST_ENEMY_SLOTS = [1.6, 1.0, 2.2, 0.4, 2.8] as const;

export function injectEditorEnemy(g: ChapterState, rawType: string, x?: number): TickResult | null {
  if (!(rawType in BESTIARY)) return null;
  const type = rawType as EnemyType;
  const cwdPath = absPath(g.rt.cwd);
  let seq = 1;
  while (g.rt.world.get(`test_${type}_${seq}`)) seq += 1;
  const id = `test_${type}_${seq}`;
  const spawnX = x ?? TEST_ENEMY_SLOTS[(seq - 1) % TEST_ENEMY_SLOTS.length]!;
  const filePath = type === 'zombie' ? cwdPath : `${cwdPath === '/' ? '' : cwdPath}/.test_${id}`;
  const events = applyLabInjection(g.rt.root, g.rt.world, {
    ...(type !== 'zombie'
      ? { files: [{ path: filePath, kind: 'file', mode: 0o755, content: `# BUG: editor test ${type}\n` }] }
      : {}),
    enemy: {
      id,
      type,
      path: filePath,
      pid: g.rt.world.nextPid++,
      x: spawnX,
      label: `test:${type}`,
    },
  });
  return { output: '', events, snapshot: snapshot(g) };
}

export function killAllEditorEnemies(g: ChapterState): { count: number; result: TickResult } {
  const events: KernelEvent[] = [];
  let count = 0;
  for (const e of g.rt.world.enemies) {
    if (e.id.startsWith('test_')) {
      const node = g.rt.world.file(e);
      if (node?.parent) node.parent.children.delete(node.name);
      e.inode = null;
    }
    if (e.dead) {
      e.deathTicks = 2;
      continue;
    }
    const zone = g.rt.world.zone(e);
    e.dead = true;
    e.hp = 0;
    e.deathTicks = 2;
    e.deathZone = zone;
    count += 1;
    events.push({
      type: 'ENEMY_KILLED',
      entityId: e.id,
      model: e.model,
      how: 'SIGKILL',
    });
  }
  if (count > 0 && g.rt.world.enemies.every((e) => e.dead)) {
    g.battle = createBattle();
  }
  return { count, result: { output: '', events, snapshot: snapshot(g) } };
}
