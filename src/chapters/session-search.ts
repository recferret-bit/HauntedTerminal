import { runGrepSources, type GrepSpec } from '../game/unix-applets.js';
import { formatTree, parseTreeArgs, recursiveGrepSources, type SearchWalk } from '../game/search-applets.js';
import type { Step } from '../game/shell.js';
import { absPath, hasExec, resolve } from '../game/tree.js';
import { isNodeHidden } from './script.js';
import { markDiscovered } from './session-rules.js';
import { emptyStep, okStep, type ChapterState } from './session-state.js';

/** What `tree` and `grep -r` may see in this level: rooms with `+x`, files with `+r`, nothing the script hides. */
function searchWalk(g: ChapterState): SearchWalk {
  return {
    canEnter: (node) => hasExec(node),
    canRead: (node) => node.kind === 'file' && (node.mode & 0o400) !== 0,
    hidden: (node) => isNodeHidden(g, node),
  };
}

/** `tree [-a] [-L n] [dir]`: the folder structure at a glance. `-a` (dot files) is gated like `ls -a` by the shell. */
export function cmdTree(g: ChapterState, args: string[]): Step {
  const spec = parseTreeArgs(args);
  if ('error' in spec) return emptyStep(1, spec.error);
  const res = resolve(g.rt.cwd, spec.path, false);
  if (!res.node) return emptyStep(1, `tree: ${spec.path}: ${res.error ?? 'No such file or directory'}\n`);
  const walk = searchWalk(g);
  markDiscovered(g, res.node);
  for (const found of recursiveGrepSources(res.node, spec.path, walk)) markDiscovered(g, found.node);
  for (const child of res.node.children.values()) if (!isNodeHidden(g, child)) markDiscovered(g, child);
  return okStep(formatTree(res.node, spec.path, spec, walk));
}

/** `grep -r PATTERN [dir|file...]`: every readable file below each path, hits named by path. */
export function cmdGrepRecursive(g: ChapterState, spec: GrepSpec): Step {
  const walk = searchWalk(g);
  const sources: Array<{ name: string; text: string }> = [];
  let stderr = '';
  for (const path of spec.files.length > 0 ? spec.files : ['.']) {
    const res = resolve(g.rt.cwd, path, false);
    if (!res.node || isNodeHidden(g, res.node)) {
      stderr += `grep: ${path}: No such file or directory\n`;
      continue;
    }
    for (const found of recursiveGrepSources(res.node, path, walk)) {
      g.rt.discoveredPaths.add(absPath(found.node));
      sources.push({ name: found.name, text: found.node.content });
    }
  }
  const { stdout, hits } = runGrepSources(sources, { ...spec, recursive: true });
  if (spec.count) return { stdout, stderr, code: hits > 0 ? 0 : 1, events: [] };
  if (hits === 0) return { stdout: '', stderr, code: stderr ? 2 : 1, events: [] };
  return { stdout, stderr, code: 0, events: [] };
}
