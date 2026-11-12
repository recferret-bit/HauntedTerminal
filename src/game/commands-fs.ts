import type { KernelEvent } from '../contracts/events.js';
import {
  busy, canUnlink, collectStep, cut, denied, find, findNamed, isCwdInside, push, target, unlink, vetoSubtree,
} from './runtime.js';
import { writeSocket } from './puzzle.js';
import { empty, out, splitPath, splitShortFlags, type Play } from './play.js';
import type { Step } from './shell.js';
import { absPath, hasExec, hasWrite, makeNode, resolve, type VNode } from './tree.js';

export function redirect(g: Play, node: VNode | null, path: string, data: string, append: boolean, argv: string[]): Step {
  if (node?.device === 'null' || path === '/dev/null') return dumpNull(g, argv);
  if (node?.kind === 'socket') return writeSocket(g, node, data);
  if (node?.kind === 'dir') return empty(1, `${path}: Is a directory\n`);
  if (node?.kind === 'file') {
    if (!hasWrite(node)) return denied(g, node, `${path}: Permission denied\n`, `> ${path}`);
    node.content = append ? node.content + data : data;
    target(g, node);
    return empty();
  }
  if (node) return empty(1, `${path}: cannot write\n`);
  const { dir, base } = splitPath(path);
  const parent = resolve(g.run.cwd, dir, true).node;
  if (!parent || parent.kind !== 'dir') return empty(1, `${path}: No such file or directory\n`);
  if (!hasWrite(parent) || !hasExec(parent)) return denied(g, parent, `${path}: Permission denied\n`, `> ${path}`);
  const created = makeNode(parent, base, 'file', 0o644);
  created.content = data;
  const events: KernelEvent[] = [];
  push(g, events, { type: 'FILE_CREATED', inodeId: created.id, name: base });
  return out('', events);
}

export function dumpNull(g: Play, argv: string[]): Step {
  const events: KernelEvent[] = [];
  if (argv.some((arg) => arg === 'chaos.stream' || arg.endsWith('/chaos.stream'))) {
    g.run.phase1 = true;
    const nul = find(g, '/dev/null');
    push(g, events, {
      type: 'OBJECT_MOVED',
      inodeId: findNamed(g, 'chaos.stream')?.id ?? 0,
      fromDir: g.run.cwd.id,
      toDir: nul?.id ?? 0,
      formedBridge: false,
      suckedIntoNull: true,
    });
  }
  return out('', events);
}

export function cmdTouch(g: Play, args: string[]): Step {
  const paths = args.filter((arg) => !arg.startsWith('-'));
  if (paths.length === 0) return empty(1, 'touch: missing file operand\n');
  const events: KernelEvent[] = [];
  for (const arg of paths) {
    const existing = resolve(g.run.cwd, arg, false).node;
    if (existing) continue;
    const { dir, base } = splitPath(arg);
    const parent = resolve(g.run.cwd, dir, true).node;
    if (!parent || parent.kind !== 'dir') return { stdout: '', stderr: `touch: cannot touch '${arg}': No such file or directory\n`, code: 1, events };
    if (!hasWrite(parent) || !hasExec(parent)) {
      const step = denied(g, parent, `touch: cannot touch '${arg}': Permission denied\n`, `touch ${arg}`);
      return { ...step, events: [...events, ...step.events] };
    }
    const node = makeNode(parent, base, 'file', 0o644);
    push(g, events, { type: 'FILE_CREATED', inodeId: node.id, name: base });
  }
  return out('', events);
}

export function cmdRm(g: Play, args: string[]): Step {
  const parsed = splitShortFlags(args);
  const force = parsed.flags.includes('f');
  const recursive = parsed.flags.includes('r') || parsed.flags.includes('R');
  const paths = parsed.paths;
  if (paths.length === 0) return force ? empty() : empty(1, 'rm: missing operand\n');
  const events: KernelEvent[] = [];
  let stderr = '';
  let code = 0;
  for (const path of paths) {
    const found = resolve(g.run.cwd, path, false);
    const node = found.node;
    if (!node) {
      if (!force) {
        stderr += `rm: cannot remove '${path}': No such file or directory\n`;
        code = 1;
      }
      continue;
    }
    if (node === g.run.root || node === g.run.cwd || !node.parent) {
      stderr += `rm: refusing to remove '${path}'\n`;
      code = 1;
      continue;
    }
    if (node.kind === 'dir' && !recursive) {
      stderr += `rm: cannot remove '${path}': Is a directory (use rm -r)\n`;
      code = 1;
      continue;
    }
    if (node.device === 'null') continue;
    if (!canUnlink(g, node)) {
      push(g, events, { type: 'PERMISSION_DENIED_RATTLE', targetId: node.id, command: `rm ${path}` });
      stderr += `rm: cannot remove '${path}': Permission denied\n`;
      code = 1;
      continue;
    }
    target(g, node);
    if (busy(g, node)) {
      push(g, events, { type: 'PERMISSION_DENIED_RATTLE', targetId: node.id, command: `rm ${path}` });
      stderr += `rm: cannot remove '${path}': Device or resource busy (the way on depends on it)\n`;
      code = 1;
      continue;
    }
    const veto = vetoSubtree(g, node, events);
    if (veto) {
      push(g, events, { type: 'PERMISSION_DENIED_RATTLE', targetId: node.id, command: `rm ${path}` });
      stderr += `rm: ${veto}\n`;
      code = 1;
      continue;
    }
    if (isCwdInside(g, node)) {
      stderr += `rm: refusing to remove '${path}': you are standing in it\n`;
      code = 1;
      continue;
    }
    if (node.name === 'chaos.stream') g.run.phase1 = true;
    const entityId = g.run.world.entityOf(node.id);
    unlink(g, node);
    push(g, events, { type: 'FILE_REMOVED', inodeId: node.id, name: node.name, entityId });
  }
  return { stdout: '', stderr, code, events };
}

export function cmdMv(g: Play, args: string[]): Step {
  const paths = args.filter((arg) => !arg.startsWith('-'));
  if (paths.length < 2) return empty(1, 'mv: missing destination file operand\n');
  const srcPath = paths[0] ?? '';
  const destPath = paths[paths.length - 1] ?? '';
  const src = resolve(g.run.cwd, srcPath, false).node;
  if (!src || !src.parent) return empty(1, `mv: cannot stat '${srcPath}': No such file or directory\n`);
  if (!canUnlink(g, src)) return denied(g, src, `mv: cannot move '${srcPath}': Permission denied\n`, `mv ${srcPath}`);
  const events: KernelEvent[] = [];
  target(g, src);
  if (busy(g, src) && !(src.questCritical)) {
    return denied(g, src, `mv: cannot move '${srcPath}': Device or resource busy (the way on depends on it)\n`, `mv ${srcPath}`);
  }
  if (destPath === '~' || destPath === '~/' || destPath === '$HOME' || destPath === '/home/dev' || destPath === '/home/dev/') {
    const pickup = g.run.world.pickupByInode(src.id);
    if (pickup) return collectStep(g, pickup, src, srcPath);
    if (!find(g, '/home/dev')) return empty(1, `mv: '${destPath}': your home is outside the machine (only pickups fit in your pockets)\n`);
  }
  const dest = resolve(g.run.cwd, destPath, true).node;
  if (dest?.device === 'null') {
    const veto = vetoSubtree(g, src, events);
    if (veto) return { stdout: '', stderr: `mv: ${veto}\n`, code: 1, events };
    if (src.name === 'chaos.stream') g.run.phase1 = true;
    const entityId = g.run.world.entityOf(src.id);
    push(g, events, {
      type: 'OBJECT_MOVED', inodeId: src.id, fromDir: src.parent.id, toDir: dest.id, formedBridge: false, suckedIntoNull: true,
    });
    unlink(g, src);
    push(g, events, { type: 'FILE_REMOVED', inodeId: src.id, name: src.name, entityId });
    return out('', events);
  }
  if (g.run.world.enemyByInode(src.id)) {
    return empty(1, `mv: '${srcPath}': it clings to its room. rm it, or mv it to /dev/null.\n`);
  }
  let folder = dest;
  let name = src.name;
  if (!dest || dest.kind !== 'dir') {
    const split = splitPath(destPath);
    name = split.base;
    folder = resolve(g.run.cwd, split.dir, true).node;
  }
  if (!folder || folder.kind !== 'dir') return empty(1, `mv: cannot move '${srcPath}' to '${destPath}': No such file or directory\n`);
  if (!hasWrite(folder) || !hasExec(folder)) return denied(g, folder, `mv: cannot move '${srcPath}' to '${destPath}': Permission denied\n`, `mv ${srcPath}`);
  let inside: VNode | null = folder;
  while (inside) {
    if (inside === src) return empty(1, `mv: cannot move '${srcPath}' into itself\n`);
    inside = inside.parent;
  }
  const previous = folder.children.get(name);
  if (previous === src) return empty();
  if (previous) {
    const veto = vetoSubtree(g, previous, events);
    if (veto) return { stdout: '', stderr: `mv: ${veto}\n`, code: 1, events };
    unlink(g, previous);
    push(g, events, { type: 'FILE_REMOVED', inodeId: previous.id, name: previous.name, entityId: g.run.world.entityOf(previous.id) });
  }
  const from = src.parent.id;
  const renamed = name !== src.name;
  unlink(g, src);
  src.name = name;
  src.parent = folder;
  folder.children.set(name, src);
  const bridged = src.name === 'heavy_plank.tar' && absPath(folder).includes('/chasm');
  push(g, events, {
    type: 'OBJECT_MOVED', inodeId: src.id, fromDir: from, toDir: folder.id, formedBridge: bridged, suckedIntoNull: false,
  });
  if (renamed) push(g, events, { type: 'FILE_CREATED', inodeId: src.id, name, entityId: g.run.world.entityOf(src.id) });
  return out(bridged ? 'The plank spans the gap.\n' : '', events);
}

export function cmdCp(g: Play, args: string[]): Step {
  const paths = args.filter((arg) => !arg.startsWith('-'));
  if (paths.length < 2) return empty(1, 'cp: missing destination file operand\n');
  const srcPath = paths[0] ?? '';
  const src = resolve(g.run.cwd, srcPath, true).node;
  if (!src) return empty(1, `cp: cannot stat '${srcPath}': No such file or directory\n`);
  if (src.kind === 'dir') return empty(1, `cp: -r not specified; omitting directory '${srcPath}'\n`);
  if (src.kind === 'socket' || src.device) return empty(1, `cp: '${srcPath}': not a regular file\n`);
  if ((src.mode & 0o444) === 0) return denied(g, src, `cp: cannot open '${srcPath}' for reading: Permission denied\n`, `cp ${srcPath}`);
  if (g.run.world.pickupByInode(src.id)) return empty(1, `cp: '${srcPath}': copy-protected (pickups do not duplicate)\n`);
  const destPath = paths[paths.length - 1] ?? '';
  const dest = resolve(g.run.cwd, destPath, true).node;
  if (dest?.kind === 'dir') {
    if (!hasWrite(dest) || !hasExec(dest)) return denied(g, dest, `cp: cannot create '${destPath}/${src.name}': Permission denied\n`, `cp ${srcPath}`);
    const existing = dest.children.get(src.name);
    if (existing && existing.kind === 'file') {
      if (!hasWrite(existing)) return denied(g, existing, `cp: cannot create '${destPath}/${src.name}': Permission denied\n`, `cp ${srcPath}`);
      existing.content = src.content;
      return empty();
    }
    if (existing) return empty(1, `cp: cannot overwrite '${destPath}/${src.name}'\n`);
    const copy = makeNode(dest, src.name, 'file', src.mode);
    copy.content = src.content;
    const events: KernelEvent[] = [];
    push(g, events, { type: 'FILE_CREATED', inodeId: copy.id, name: copy.name });
    return out('', events);
  }
  return redirect(g, dest, destPath, src.content, false, ['cp', srcPath]);
}

export function applyMode(_g: Play, current: number, spec: string): number | null {
  if (/^[0-7]{1,4}$/.test(spec)) return Number.parseInt(spec, 8) & 0o7777;
  let mode = current;
  for (const clause of spec.split(',')) {
    const match = /^([ugoa]*)([+\-=])([rwx]*)$/.exec(clause);
    if (!match) return null;
    const who = match[1] || 'a';
    const op = match[2];
    let bits = 0;
    for (const ch of match[3] ?? '') bits |= ch === 'r' ? 4 : ch === 'w' ? 2 : 1;
    const shifts = new Set<number>();
    for (const flag of who) {
      if (flag === 'u' || flag === 'a') shifts.add(6);
      if (flag === 'g' || flag === 'a') shifts.add(3);
      if (flag === 'o' || flag === 'a') shifts.add(0);
    }
    for (const shift of shifts) {
      if (op === '+') mode |= bits << shift;
      else if (op === '-') mode &= ~(bits << shift);
      else mode = (mode & ~(7 << shift)) | (bits << shift);
    }
  }
  return mode;
}

export function cmdChmod(g: Play, args: string[]): Step {
  const rest = args.filter((arg) => arg !== '-R' && arg !== '-v');
  if (rest.length < 2) return empty(1, 'chmod: missing operand\n');
  const spec = rest[0] ?? '';
  const events: KernelEvent[] = [];
  let stderr = '';
  let code = 0;
  for (const path of rest.slice(1)) {
    const node = resolve(g.run.cwd, path, true).node;
    if (!node || node.device === 'null') {
      stderr += `chmod: cannot access '${path}': No such file or directory\n`;
      code = 1;
      continue;
    }
    const next = applyMode(g, node.mode, spec);
    if (next === null) return { stdout: '', stderr: `chmod: invalid mode: '${spec}'\n`, code: 1, events };
    target(g, node);
    const veto = g.run.world.vetoChmod(node);
    if (veto) {
      push(g, events, { type: 'PERMISSION_DENIED_RATTLE', targetId: node.id, command: `chmod ${spec} ${path}` });
      stderr += `chmod: changing permissions of '${path}': ${veto.slice(veto.indexOf(':') + 2)}\n`;
      code = 1;
      continue;
    }
    const old = node.mode;
    node.mode = next;
    push(g, events, { type: 'INODE_MODE_CHANGED', inodeId: node.id, oldMode: old, newMode: next });
    if (node.name === 'iron_gate' && (old & 0o111) === 0 && hasExec(node) && !g.run.archivistSolved) {
      cut(g, 'floor2-chmod-skip');
    }
  }
  return { stdout: '', stderr, code, events };
}

export function cmdLn(g: Play, args: string[]): Step {
  const rest = args.filter((arg) => arg !== '-s' && arg !== '-sf' && arg !== '-f');
  if (!args.some((arg) => arg.startsWith('-s')) || rest.length < 2) return empty(1, 'ln: usage: ln -s <target> <name>\n');
  const target = rest[0] ?? '';
  const name = rest[1] ?? '';
  const { dir, base } = splitPath(name);
  const parent = resolve(g.run.cwd, dir, true).node;
  if (!parent || parent.kind !== 'dir') return empty(1, `ln: failed to create symbolic link '${name}': No such file or directory\n`);
  if (!hasWrite(parent)) return denied(g, parent, `ln: failed to create symbolic link '${name}': Permission denied\n`, `ln -s ${target} ${name}`);
  if (parent.children.has(base)) return empty(1, `ln: failed to create symbolic link '${name}': File exists\n`);
  const node = makeNode(parent, base, 'symlink', 0o777);
  node.link = target;
  const events: KernelEvent[] = [];
  push(g, events, { type: 'FILE_CREATED', inodeId: node.id, name: base });
  return out('', events);
}
