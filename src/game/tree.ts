export type NodeKind = 'file' | 'dir' | 'symlink' | 'device' | 'socket';

export interface VNode {
  id: number;
  name: string;
  kind: NodeKind;
  mode: number;
  uid: number;
  content: string;
  parent: VNode | null;
  children: Map<string, VNode>;
  link?: string;
  questCritical?: boolean;
  device?: 'null';
}

let nextId = 1;

export function resetIds(): void {
  nextId = 1;
}

function nid(): number {
  const id = nextId;
  nextId += 1;
  return id;
}

export function makeNode(
  parent: VNode | null,
  name: string,
  kind: NodeKind,
  mode: number,
): VNode {
  const node: VNode = {
    id: nid(),
    name,
    kind,
    mode,
    uid: 1000,
    content: '',
    parent,
    children: new Map(),
  };
  if (parent) parent.children.set(name, node);
  return node;
}

export function makeRoot(): VNode {
  resetIds();
  const root = makeNode(null, '', 'dir', 0o755);
  const dev = makeNode(root, 'dev', 'dir', 0o755);
  const nul = makeNode(dev, 'null', 'device', 0o666);
  nul.device = 'null';
  nul.uid = 0;
  return root;
}

export function absPath(node: VNode): string {
  const parts: string[] = [];
  let cursor: VNode | null = node;
  while (cursor && cursor.parent) {
    parts.push(cursor.name);
    cursor = cursor.parent;
  }
  return `/${parts.reverse().join('/')}`;
}

export function modeString(node: VNode): string {
  const kind = node.kind === 'dir' ? 'd' : node.kind === 'symlink' ? 'l' : node.kind === 'socket' ? 's' : '-';
  const bit = (mask: number, ch: string) => ((node.mode & mask) !== 0 ? ch : '-');
  return kind
    + bit(0o400, 'r') + bit(0o200, 'w') + bit(0o100, 'x')
    + bit(0o040, 'r') + bit(0o020, 'w') + bit(0o010, 'x')
    + bit(0o004, 'r') + bit(0o002, 'w') + bit(0o001, 'x');
}

export interface Resolved {
  node: VNode | null;
  error?: string;
  denied?: VNode;
  loop?: boolean;
}

function rootOf(node: VNode): VNode {
  let cursor = node;
  while (cursor.parent) cursor = cursor.parent;
  return cursor;
}

export function resolve(cwd: VNode, path: string, follow: boolean, depth = 0): Resolved {
  if (depth > 16) return { node: null, loop: true, error: 'Too many levels of symbolic links' };
  const root = rootOf(cwd);
  const start = path.startsWith('/') ? root : cwd;
  const parts = path.split('/').filter((part) => part !== '' && part !== '.');
  let cursor = start;

  const followLink = (link: VNode): Resolved | null => {
    if (!link.link) return { node: null, loop: true, error: 'Too many levels of symbolic links' };
    const next = resolve(link.parent ?? root, link.link, true, depth + 1);
    if (next.loop || !next.node) return next;
    cursor = next.node;
    return null;
  };

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? '';
    if (part === '..') {
      if (cursor.parent) cursor = cursor.parent;
      continue;
    }
    if (cursor.kind !== 'dir') return { node: null, error: `Not a directory: ${absPath(cursor)}` };
    if ((cursor.mode & 0o111) === 0) return { node: null, denied: cursor, error: `Permission denied: ${absPath(cursor)}` };
    const child = cursor.children.get(part);
    if (!child) return { node: null, error: `No such file or directory: ${path}` };
    const last = i === parts.length - 1;
    if (child.kind === 'symlink' && follow) {
      const jumped = followLink(child);
      if (jumped) return jumped;
      if (!last && cursor.kind !== 'dir') return { node: null, error: `Not a directory: ${path}` };
      continue;
    }
    cursor = child;
  }
  if (follow && cursor.kind === 'symlink') {
    const jumped = followLink(cursor);
    if (jumped) return jumped;
  }
  return { node: cursor };
}

/** Absolute path lookup that ignores permissions and does not follow symlinks (for the game's own bookkeeping). */
export function lookup(root: VNode, path: string): VNode | null {
  let cursor: VNode | null = root;
  for (const part of path.split('/').filter((piece) => piece && piece !== '.')) {
    if (!cursor) return null;
    cursor = part === '..' ? cursor.parent ?? cursor : cursor.children.get(part) ?? null;
  }
  return cursor;
}

export function walk(node: VNode, visit: (node: VNode) => void): void {
  visit(node);
  for (const child of node.children.values()) walk(child, visit);
}

export function findId(root: VNode, id: number): VNode | null {
  if (root.id === id) return root;
  for (const child of root.children.values()) {
    const found = findId(child, id);
    if (found) return found;
  }
  return null;
}

export function hasExec(node: VNode): boolean {
  return (node.mode & 0o111) !== 0;
}

export function hasWrite(node: VNode): boolean {
  return (node.mode & 0o222) !== 0;
}

export function parentDir(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut <= 0 ? '/' : path.slice(0, cut);
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
