/**
 * Shared `kiro` command orchestrator & crack stepper for both Classic (`src/game/puzzle.ts`)
 * and Chapter (`src/chapters/session-kiro.ts`) shells.
 */
import type { KernelEvent } from '../contracts/events.js';
import { type KiroCompanion, inspectTextWithKiro } from './kiro.js';
import type { Step } from './shell.js';
import { absPath, hasExec, lookup, modeString, resolve, type VNode } from './tree.js';

export interface KiroCommandHost {
  cwd: VNode;
  readMask: number;
  ramGb: number;
  weakNote?: string;
  checkAlreadyDecrypted?: boolean;
  noFileMessage: string;
  onAction(action: 'read' | 'cast', command: string, events: KernelEvent[]): void;
  onDenied(node: VNode, command: string, message: string): Step;
  loadCore(args: string[]): Step;
  scanRoom(): Step;
}

/** Advance active `kiro crack` countdown and unlock the target inode on completion. */
export function stepKiroCrackOnRoot(
  kiro: KiroCompanion,
  root: VNode,
  cwdPath: string,
  readMask: number,
  emit: (ev: KernelEvent) => void,
): { note: string; completed: boolean } {
  const adv = kiro.advanceCrack(cwdPath);
  for (const ev of adv.events) emit(ev);
  if (adv.completedTargetPath) {
    const node = lookup(root, adv.completedTargetPath);
    if (node && ((node.kind === 'dir' && !hasExec(node)) || (node.kind === 'file' && (node.mode & readMask) === 0))) {
      const old = node.mode;
      node.mode = node.kind === 'dir' ? 0o755 : 0o644;
      emit({ type: 'INODE_MODE_CHANGED', inodeId: node.id, oldMode: old, newMode: node.mode });
      emit({
        type: 'PUZZLE_DOOR_RESOLVED',
        socketInodeId: node.id,
        unlockedInodeId: node.id,
        solvedViaInput: 'kiro_crack',
      });
    }
    return { note: adv.note, completed: true };
  }
  return { note: adv.note, completed: false };
}

/** Shared `kiro` subcommand dispatcher used by both Classic and Chapter shells. */
export function runKiroCommand(
  host: KiroCommandHost,
  kiro: KiroCompanion,
  args: string[],
  stdin: string,
): Step {
  const sub = (args[0] ?? '').toLowerCase();
  const ok = (stdout: string, events: KernelEvent[] = []): Step => ({ stdout, stderr: '', code: 0, events });
  const fail = (stderr: string): Step => ({ stdout: '', stderr, code: 1, events: [] });

  if (!sub && stdin) {
    const events: KernelEvent[] = [];
    host.onAction('read', 'kiro', events);
    return ok(inspectTextWithKiro(stdin, 'stdin', kiro.activeCore), events);
  }
  if (!sub || sub === 'status' || sub === 'cores' || sub === 'list') {
    const events: KernelEvent[] = [];
    host.onAction('read', 'kiro', events);
    return ok((host.weakNote ?? '') + kiro.formatStatus(host.ramGb), events);
  }
  if (sub === 'load' || sub === 'pull' || sub === 'use' || sub === 'swap') return host.loadCore(args);
  if (sub === 'scan' || sub === 'sweep') return host.scanRoom();
  if (sub === 'crack' || sub === 'decrypt' || sub === 'hack') {
    const targetArg = args[1];
    if (!targetArg) return fail('kiro crack: specify a locked gate or encrypted file\n');
    const found = resolve(host.cwd, targetArg, false);
    if (!found.node) return fail(`kiro crack: ${targetArg}: No such file or directory\n`);
    const node = found.node;
    const fullPath = absPath(node);
    if (host.checkAlreadyDecrypted && kiro.isUnlocked(fullPath)) {
      return ok(`[KIRO.D] ${node.name} is already decrypted.\n`);
    }
    const isLocked = (node.kind === 'dir' && !hasExec(node)) || (node.kind === 'file' && (node.mode & host.readMask) === 0);
    if (!isLocked) return ok(`[KIRO.D] ${node.name} is already unlocked (${modeString(node)}).\n`);
    const events: KernelEvent[] = [];
    host.onAction('cast', `kiro crack ${node.name}`, events);
    const started = kiro.startCrack(absPath(host.cwd), node.name, fullPath);
    events.push(...started.events);
    return ok(started.stdout, events);
  }
  if (sub === 'inspect' || sub === 'audit') {
    const targetArg = args[1];
    if (!targetArg) return fail('kiro inspect: specify a file (or pipe via `cat <file> | kiro`)\n');
    const found = resolve(host.cwd, targetArg, true);
    if (!found.node) {
      if (found.denied) return host.onDenied(found.denied, `kiro inspect ${targetArg}`, `kiro inspect: ${targetArg}: Permission denied\n`);
      return fail(`kiro inspect: ${targetArg}: ${host.noFileMessage}\n`);
    }
    if (found.node.kind !== 'file') return fail(`kiro inspect: ${targetArg}: Not a regular file\n`);
    if ((found.node.mode & host.readMask) === 0) {
      return host.onDenied(found.node, `kiro inspect ${targetArg}`, `kiro inspect: ${targetArg}: Permission denied\n`);
    }
    const events: KernelEvent[] = [];
    host.onAction('read', `kiro inspect ${found.node.name}`, events);
    return ok(inspectTextWithKiro(found.node.content, found.node.name, kiro.activeCore), events);
  }
  if (sub === 'disclaimer' || sub === 'legal' || sub === 'brands') {
    const events: KernelEvent[] = [];
    host.onAction('read', `kiro ${sub}`, events);
    const res = kiro.formatDisclaimer();
    events.push(...res.events);
    return ok(res.stdout, events);
  }
  return fail(`kiro: unknown subcommand '${sub}'. Try: kiro | kiro scan | kiro load <core> | kiro crack <lock> | kiro disclaimer\n`);
}
