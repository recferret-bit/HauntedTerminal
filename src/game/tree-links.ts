import type { KernelEvent } from '../contracts/events.js';
import { empty, out, splitPath } from './play.js';
import type { Step } from './shell.js';
import { absPath, baseName, hasWrite, makeNode, resolve, type VNode } from './tree.js';

export function runReadlink(
  cwd: VNode,
  root: VNode,
  args: string[],
  isHidden?: (node: VNode) => boolean,
): Step {
  const full = args.includes('-f');
  const path = args.find((arg) => !arg.startsWith('-'));
  if (!path) return empty(1, 'readlink: missing operand\n');
  const found = resolve(cwd, path, full);
  if (found.loop) return empty(1, `readlink: ${path}: Too many levels of symbolic links\n`);
  if (found.denied) return empty(1, `readlink: ${path}: Permission denied\n`);
  if (!found.node || isHidden?.(found.node)) return empty(1, `readlink: ${path}: No such file or directory\n`);
  if (full) return out(`${absPath(found.node)}\n`);
  if (found.node.kind !== 'symlink' || !found.node.link) return empty(1, `readlink: ${path}: not a symlink\n`);
  const loops = found.node.link === absPath(found.node.parent ?? root);
  return out(`${found.node.link}\n`, [], 0, loops ? `readlink: ${path} points back at this room. A trap.\n` : '');
}

export function runLn(
  cwd: VNode,
  args: string[],
  emitEvent?: (ev: KernelEvent, events: KernelEvent[]) => void,
): Step {
  const badFlag = args.find((arg) => arg.startsWith('-') && arg !== '-' && !/^-[sf]+$/.test(arg));
  if (badFlag) return empty(1, 'ln: usage: ln -s [-f] <target> <name>\n');
  const hasSym = args.some((arg) => /^-[sf]*s[sf]*$/.test(arg));
  const force = args.some((arg) => /^-[sf]*f[sf]*$/.test(arg));
  const rest = args.filter((arg) => !/^-[sf]+$/.test(arg));
  if (!hasSym || rest.length < 2) return empty(1, 'ln: usage: ln -s <target> <name>\n');
  const target = rest[0] ?? '';
  const name = rest[1] ?? '';
  if (!target || !name) return empty(1, `ln: failed to create symbolic link '${name}': No such file or directory\n`);

  const events: KernelEvent[] = [];
  const emit = emitEvent ?? ((ev: KernelEvent, list: KernelEvent[]) => { list.push(ev); });
  const trailingSlash = name.length > 1 && name.endsWith('/');
  const dest = resolve(cwd, name, true);
  let parent: VNode | null;
  let linkName: string;

  if (dest.node?.kind === 'dir') {
    parent = dest.node;
    linkName = baseName(target.replace(/\/+$/, ''));
    if (!linkName || linkName === '.' || linkName === '..') {
      return empty(1, `ln: failed to create symbolic link '${name}': File exists\n`);
    }
  } else {
    if (trailingSlash) {
      const reason = dest.node ? 'Not a directory' : 'No such file or directory';
      return empty(1, `ln: failed to create symbolic link '${name}': ${reason}\n`);
    }
    const { dir, base } = splitPath(name);
    if (!base || base === '.' || base === '..' || base.includes('/')) {
      return empty(1, `ln: failed to create symbolic link '${name}': File exists\n`);
    }
    const parentRes = resolve(cwd, dir, true);
    if (parentRes.denied) {
      emit({ type: 'PERMISSION_DENIED_RATTLE', targetId: parentRes.denied.id, command: `ln -s ${target} ${name}` }, events);
      return { stdout: '', stderr: `ln: failed to create symbolic link '${name}': Permission denied\n`, code: 1, events };
    }
    parent = parentRes.node;
    linkName = base;
  }

  if (!parent || parent.kind !== 'dir') {
    return empty(1, `ln: failed to create symbolic link '${name}': No such file or directory\n`);
  }
  if (!hasWrite(parent)) {
    emit({ type: 'PERMISSION_DENIED_RATTLE', targetId: parent.id, command: `ln -s ${target} ${name}` }, events);
    return { stdout: '', stderr: `ln: failed to create symbolic link '${name}': Permission denied\n`, code: 1, events };
  }
  const existing = parent.children.get(linkName);
  if (existing) {
    if (!force || existing.kind === 'dir' || existing.kind === 'socket' || existing.questCritical) {
      return empty(1, `ln: failed to create symbolic link '${name}': File exists\n`);
    }
    parent.children.delete(linkName);
    existing.parent = null;
  }
  const node = makeNode(parent, linkName, 'symlink', 0o777);
  node.link = target;
  emit({ type: 'FILE_CREATED', inodeId: node.id, name: linkName }, events);
  return out('', events);
}
