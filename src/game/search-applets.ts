/**
 * `tree` and `grep -r`: the two ways to look through a big folder structure at once, shared by the Classic and
 * Chapter shells. Pure: the shell says which nodes it may enter, read or show (permissions, script-hidden nodes).
 */
import type { VNode } from './tree.js';

/** What a shell lets the walk see. */
export interface SearchWalk {
  /** A directory the walk may open (it has `+x`). */
  canEnter: (node: VNode) => boolean;
  /** A file the walk may read. */
  canRead: (node: VNode) => boolean;
  /** A node the shell hides entirely (a script-hidden enemy file, a pickup that has not dropped). */
  hidden: (node: VNode) => boolean;
}

export interface TreeSpec {
  /** `-a`: list dot files and dot directories. */
  all: boolean;
  /** `-L n`: stop `n` levels down (0: no limit). */
  maxDepth: number;
  path: string;
}

export function parseTreeArgs(args: readonly string[]): TreeSpec | { error: string } {
  const spec: TreeSpec = { all: false, maxDepth: 0, path: '.' };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (arg === '-a') spec.all = true;
    else if (arg === '-L') {
      const n = Number(args[++i]);
      if (!Number.isInteger(n) || n < 1) return { error: 'tree: Invalid level, must be a positive integer\n' };
      spec.maxDepth = n;
    } else if (arg.startsWith('-') && arg !== '-') return { error: `tree: Invalid argument \`${arg}'.\nusage: tree [-a] [-L level] [directory]\n` };
    else spec.path = arg;
  }
  return spec;
}

export const TREE_FLAGS_LOCKED_MESSAGE =
  'tree: -a requires your Tube Transistor! Plain `tree [dir]` shows the visible folders; recover the Tube Transistor to see dot files.\n';

/** `tree -a` needs the same lantern as `ls -a`. */
export function treeWantsHidden(args: readonly string[]): boolean {
  return args.includes('-a');
}

const sorted = (dir: VNode): VNode[] => [...dir.children.values()].sort((a, b) => a.name.localeCompare(b.name));

/** The `tree` picture of `top` (shown as `label`) with the closing count line. */
export function formatTree(top: VNode, label: string, spec: TreeSpec, walk: SearchWalk): string {
  const lines = [label];
  let dirs = 0;
  let files = 0;
  const visit = (dir: VNode, prefix: string, depth: number): void => {
    const kids = sorted(dir).filter((n) => !walk.hidden(n) && (spec.all || !n.name.startsWith('.')));
    kids.forEach((node, i) => {
      const last = i === kids.length - 1;
      const open = node.kind === 'dir' && walk.canEnter(node);
      lines.push(`${prefix}${last ? '└── ' : '├── '}${node.name}${node.kind === 'dir' && !open ? ' [error opening dir]' : ''}`);
      if (node.kind === 'dir') {
        dirs += 1;
        if (open && (spec.maxDepth === 0 || depth < spec.maxDepth)) visit(node, `${prefix}${last ? '    ' : '│   '}`, depth + 1);
      } else {
        files += 1;
      }
    });
  };
  if (top.kind === 'dir' && walk.canEnter(top)) visit(top, '', 1);
  return `${lines.join('\n')}\n\n${dirs} ${dirs === 1 ? 'directory' : 'directories'}, ${files} ${files === 1 ? 'file' : 'files'}\n`;
}

/** Every readable file under `top` (dot files included, like `grep -r`), named as `label/relative/path`. */
export function recursiveGrepSources(top: VNode, label: string, walk: SearchWalk): Array<{ name: string; node: VNode }> {
  if (top.kind !== 'dir') return walk.canRead(top) ? [{ name: label, node: top }] : [];
  const found: Array<{ name: string; node: VNode }> = [];
  const base = label.replace(/\/$/, '');
  const visit = (dir: VNode, rel: string): void => {
    for (const node of sorted(dir)) {
      if (walk.hidden(node)) continue;
      const name = `${base}/${rel}${node.name}`;
      if (node.kind === 'dir') {
        if (walk.canEnter(node)) visit(node, `${rel}${node.name}/`);
      } else if (walk.canRead(node)) {
        found.push({ name, node });
      }
    }
  };
  if (walk.canEnter(top)) visit(top, '');
  return found;
}
