import type { KernelEvent } from '../contracts/events.js';
import { BESTIARY, PICKUP_INFO } from './bestiary.js';
import { readSocket } from './puzzle.js';
import { bump, denied, push, target } from './runtime.js';
import { empty, out, type Play } from './play.js';
import type { Step } from './shell.js';
import { formatTree, parseTreeArgs, recursiveGrepSources, type SearchWalk } from './search-applets.js';
import { absPath, hasExec, hasWrite, resolve } from './tree.js';
import {
  SED_EMPTY_PATTERN,
  applyCutText,
  compileSedScript,
  emptySedPattern,
  formatWc,
  type GrepSpec,
  parseCutArgs,
  parseGrepArgs,
  parseHeadTailArgs,
  parseSedArgs,
  reverseLines,
  runGrepSources,
  sliceHeadTail,
} from './unix-applets.js';

export function cmdCat(g: Play, args: string[], stdin: string): Step {
  if (args.length === 0) return out(stdin);
  let text = '';
  const events: KernelEvent[] = [];
  for (const arg of args) {
    const found = resolve(g.run.cwd, arg, true);
    if (!found.node) {
      if (found.denied) push(g, events, { type: 'PERMISSION_DENIED_RATTLE', targetId: found.denied.id, command: `cat ${arg}` });
      return { stdout: text, stderr: `cat: ${arg}: ${found.denied ? 'Permission denied' : 'No such file or directory'}\n`, code: 1, events };
    }
    const node = found.node;
    if (node.kind === 'dir') return { stdout: text, stderr: `cat: ${arg}: Is a directory\n`, code: 1, events };
    if (node.kind === 'socket') {
      const step = readSocket(g, node);
      text += step.stdout;
      events.push(...step.events);
      continue;
    }
    if (node.device === 'null') continue;
    if ((node.mode & 0o444) === 0) {
      const pickup = g.run.world.pickupByInode(node.id);
      const why = pickup ? ` (encrypted: chmod 644 ${arg})` : '';
      push(g, events, { type: 'PERMISSION_DENIED_RATTLE', targetId: node.id, command: `cat ${arg}` });
      return { stdout: text, stderr: `cat: ${arg}: Permission denied${why}\n`, code: 1, events };
    }
    g.run.filesRead.add(absPath(node));
    const enemy = g.run.world.enemyByInode(node.id);
    const pickup = g.run.world.pickupByInode(node.id);
    if (enemy) {
      target(g, node);
      text += `${node.content.replace(/\n$/, '')}\n`;
      text += `strings: ${BESTIARY[enemy.type].weakness}\n`;
      continue;
    }
    if (pickup) {
      text += PICKUP_INFO[pickup.type].blurb;
      bump(g, 'read', pickup.id);
      continue;
    }
    text += node.content;
    if (text && !text.endsWith('\n')) text += '\n';
  }
  return out(text, events);
}

export function cmdEcho(_g: Play, args: string[]): Step {
  const noNewline = args[0] === '-n';
  const words = noNewline ? args.slice(1) : args;
  return out(`${words.join(' ')}${noNewline ? '' : '\n'}`);
}

function textFrom(g: Play, args: string[], stdin: string, applet: string): { text: string; error?: string } {
  if (args.length === 0) return { text: stdin };
  let text = '';
  for (const arg of args) {
    if (arg === '-') {
      text += stdin;
      continue;
    }
    const node = resolve(g.run.cwd, arg, true).node;
    if (!node) return { text: '', error: `${applet}: ${arg}: No such file or directory\n` };
    if (node.kind === 'dir') return { text: '', error: `${applet}: ${arg}: Is a directory\n` };
    if ((node.mode & 0o444) === 0) return { text: '', error: `${applet}: ${arg}: Permission denied\n` };
    g.run.filesRead.add(absPath(node));
    text += node.content;
  }
  return { text };
}

/** The result of a grep over `sources`: exit 0 on a hit, 1 on none, 2 when a path was missing too. */
function grepStep(sources: Array<{ name: string; text: string }>, spec: GrepSpec, stderr: string): Step {
  const { stdout, hits } = runGrepSources(sources, spec);
  if (spec.count) return { stdout, stderr, code: hits ? 0 : 1, events: [] };
  if (hits === 0) return { stdout: '', stderr, code: stderr ? 2 : 1, events: [] };
  return { stdout, stderr, code: 0, events: [] };
}

export function cmdGrep(g: Play, args: string[], stdin: string): Step {
  const spec = parseGrepArgs(args);
  if ('error' in spec) return empty(2, spec.error);
  if (spec.recursive) return grepRecursive(g, spec);
  const sources: Array<{ name: string; text: string }> = [];
  let stderr = '';
  if (spec.files.length === 0) sources.push({ name: '', text: stdin });
  else {
    for (const file of spec.files) {
      const node = resolve(g.run.cwd, file, true).node;
      if (!node) {
        stderr += `grep: ${file}: No such file or directory\n`;
        continue;
      }
      if (node.kind === 'dir') {
        stderr += `grep: ${file}: Is a directory\n`;
        continue;
      }
      if ((node.mode & 0o444) === 0) {
        stderr += `grep: ${file}: Permission denied\n`;
        continue;
      }
      target(g, node);
      g.run.filesRead.add(absPath(node));
      sources.push({ name: file, text: node.content });
    }
  }
  return grepStep(sources, spec, stderr);
}

export function cmdWc(g: Play, args: string[], stdin: string): Step {
  const flags = args.filter((arg) => arg.startsWith('-') && arg !== '-').join('');
  const files = args.filter((arg) => !arg.startsWith('-') || arg === '-');
  const got = textFrom(g, files, stdin, 'wc');
  if (got.error) return empty(1, got.error);
  return out(formatWc(got.text, flags));
}

export function cmdCut(g: Play, args: string[], stdin: string): Step {
  const spec = parseCutArgs(args);
  if ('error' in spec) return empty(1, spec.error);
  const got = textFrom(g, spec.files, stdin, 'cut');
  if (got.error) return empty(1, got.error);
  return out(applyCutText(got.text, spec));
}

export function cmdRev(g: Play, args: string[], stdin: string): Step {
  const got = textFrom(g, args.filter((arg) => arg !== '-'), stdin, 'rev');
  if (got.error) return empty(1, got.error);
  return out(reverseLines(got.text));
}

export function cmdSed(g: Play, args: string[], stdin: string): Step {
  const { inPlace, rest } = parseSedArgs(args);
  const script = rest[0];
  if (!script) return empty(1, 'sed: missing script\n');
  if (emptySedPattern(script)) return empty(1, SED_EMPTY_PATTERN);
  const apply = compileSedScript(script, { supportBackrefs: true });
  if (!apply) return empty(1, `sed: -e expression #1: unknown command (only s/old/new/[g] is supported)\n`);
  const files = rest.slice(1);
  if (inPlace) {
    if (files.length === 0) return empty(1, 'sed: no input files\n');
    for (const file of files) {
      const node = resolve(g.run.cwd, file, true).node;
      if (!node || node.kind !== 'file') return empty(1, `sed: can't read ${file}: No such file or directory\n`);
      if (!hasWrite(node) || (node.mode & 0o444) === 0) return denied(g, node, `sed: couldn't edit ${file}: Permission denied\n`, `sed -i ${file}`);
      target(g, node);
      node.content = apply(node.content);
    }
    return empty();
  }
  const got = textFrom(g, files, stdin, 'sed');
  if (got.error) return empty(1, got.error);
  const next = apply(got.text);
  return out(next.endsWith('\n') || next.length === 0 ? next : `${next}\n`);
}

export function cmdHeadTail(g: Play, args: string[], stdin: string, head: boolean): Step {
  const cmd = head ? 'head' : 'tail';
  const spec = parseHeadTailArgs(args, cmd);
  if ('error' in spec) return empty(1, spec.error);
  const got = textFrom(g, spec.files, stdin, cmd);
  if (got.error) return empty(1, got.error);
  return out(sliceHeadTail(got.text, cmd, spec.n));
}

/** What `tree` and `grep -r` may see in a classic floor: rooms with `+x` and files with `+r`. */
const CLASSIC_WALK: SearchWalk = {
  canEnter: (node) => hasExec(node),
  canRead: (node) => node.kind === 'file' && (node.mode & 0o444) !== 0,
  hidden: () => false,
};

/** `tree [-a] [-L n] [dir]`: the folder structure at a glance (`-a` is gated like `ls -a` by the shell). */
export function cmdTree(g: Play, args: string[]): Step {
  const spec = parseTreeArgs(args);
  if ('error' in spec) return empty(1, spec.error);
  const found = resolve(g.run.cwd, spec.path, false);
  if (!found.node) return empty(1, `tree: ${spec.path}: No such file or directory\n`);
  return out(formatTree(found.node, spec.path, spec, CLASSIC_WALK));
}

/** `grep -r PATTERN [path...]`: every readable file below each path, hits named by path. */
function grepRecursive(g: Play, spec: GrepSpec): Step {
  const sources: Array<{ name: string; text: string }> = [];
  let stderr = '';
  for (const path of spec.files.length > 0 ? spec.files : ['.']) {
    const node = resolve(g.run.cwd, path, false).node;
    if (!node) {
      stderr += `grep: ${path}: No such file or directory\n`;
      continue;
    }
    for (const hit of recursiveGrepSources(node, path, CLASSIC_WALK)) sources.push({ name: hit.name, text: hit.node.content });
  }
  return grepStep(sources, spec, stderr);
}
