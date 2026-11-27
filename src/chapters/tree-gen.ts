import { ensureLabDirChain } from '../game/lab-support.js';
import { lookup, makeNode, type VNode } from '../game/tree.js';
import { seededRandom } from './pids.js';
import type { LevelTreeGenerate } from './types.js';

const FOLDER_WORDS = ['cache', 'logs', 'tmp', 'old', 'backup', 'assets', 'drivers', 'firmware', 'sector', 'page', 'swap', 'blocks', 'data', 'mirror', 'index', 'queue', 'ring', 'spool', 'stash', 'dump'];
const HIDDEN_WORDS = ['cache', 'swp', 'old', 'history', 'bak', 'lock', 'trash', 'tmp'];
const MAX_DEPTH = 7;

/** The same seed always draws the same numbers (a headless run and the game build the same tree). */
function stream(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return seededRandom(h);
}

/**
 * Grows `gen.folders` decoy folders (nested up to 7 levels) and `gen.hiddenFiles` dot files under `gen.root`, which is
 * created when missing. Names carry a running number, so they never clash with each other; a clash with a file the level
 * spec placed is skipped. The level's own files (the real target and its clue trail) are placed by `files`, not here.
 */
export function growTree(root: VNode, gen: LevelTreeGenerate): void {
  ensureLabDirChain(root, gen.root);
  const top = lookup(root, gen.root);
  if (!top || top.kind !== 'dir') return;
  const draw = stream(gen.seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(draw() * items.length)] as T;
  const dirs: Array<{ node: VNode; depth: number }> = [{ node: top, depth: 0 }];
  for (let i = 1; i <= gen.folders; i += 1) {
    const open = dirs.filter((d) => d.depth < MAX_DEPTH);
    const parent = pick(open);
    const name = `${pick(FOLDER_WORDS)}_${String(i).padStart(3, '0')}`;
    if (parent.node.children.has(name)) continue;
    const node = makeNode(parent.node, name, 'dir', 0o755);
    dirs.push({ node, depth: parent.depth + 1 });
    if (i % 3 === 0) makeNode(node, 'notes.txt', 'file', 0o644).content = 'Nothing useful in here. Keep looking.\n';
  }
  for (let k = 1; k <= gen.hiddenFiles; k += 1) {
    const where = pick(dirs).node;
    const name = `.${pick(HIDDEN_WORDS)}_${String(k).padStart(2, '0')}`;
    if (where.children.has(name)) continue;
    makeNode(where, name, 'file', 0o644).content = 'a leftover dot file: nothing useful here\n';
  }
}
