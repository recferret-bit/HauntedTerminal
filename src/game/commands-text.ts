import type { KernelEvent } from '../contracts/events.js';
import { BESTIARY, PICKUP_INFO } from './bestiary.js';
import { readSocket } from './puzzle.js';
import { bump, denied, target } from './runtime.js';
import { empty, escapeReg, linesOf, out, type Play } from './play.js';

function walkArgs(args: string[], on: (arg: string, next: () => string | undefined) => void): void {
  for (let i = 0; i < args.length; i++) on(args[i] ?? '', () => args[++i]);
}
import type { Step } from './shell.js';
import { hasWrite, resolve } from './tree.js';

export function cmdCat(g: Play, args: string[], stdin: string): Step {
  if (args.length === 0) return out(stdin);
  let text = '';
  const events: KernelEvent[] = [];
  for (const arg of args) {
    const found = resolve(g.run.cwd, arg, true);
    if (!found.node) return { stdout: text, stderr: `cat: ${arg}: No such file or directory\n`, code: 1, events };
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
      return { stdout: text, stderr: `cat: ${arg}: Permission denied${why}\n`, code: 1, events };
    }
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

export function textFrom(g: Play, args: string[], stdin: string, applet: string): { text: string; error?: string } {
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
    text += node.content;
  }
  return { text };
}

export function cmdGrep(g: Play, args: string[], stdin: string): Step {
  let hide = false;
  let count = false;
  let insensitive = false;
  let invert = false;
  let numbers = false;
  const rest: string[] = [];
  for (const arg of args) {
    if (arg.startsWith('-') && arg !== '-' && !arg.startsWith('--') && rest.length === 0) {
      if (arg.includes('h')) hide = true;
      if (arg.includes('c')) count = true;
      if (arg.includes('i')) insensitive = true;
      if (arg.includes('v')) invert = true;
      if (arg.includes('n')) numbers = true;
    } else rest.push(arg);
  }
  const pattern = rest[0];
  if (pattern === undefined) return empty(2, 'usage: grep [-hcivn] <pattern> [file...]\n');
  let rx: RegExp;
  try { rx = new RegExp(pattern, insensitive ? 'i' : ''); }
  catch { rx = new RegExp(escapeReg(pattern), insensitive ? 'i' : ''); }
  const files = rest.slice(1);
  const sources: Array<{ name: string; text: string }> = [];
  let stderr = '';
  if (files.length === 0) sources.push({ name: '', text: stdin });
  else {
    for (const file of files) {
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
      sources.push({ name: file, text: node.content });
    }
  }
  const hits: Array<{ name: string; line: string; n: number }> = [];
  for (const source of sources) {
    linesOf(source.text).forEach((line, index) => {
      if (rx.test(line) !== invert) hits.push({ name: source.name, line, n: index + 1 });
    });
  }
  const named = !hide && files.length > 1;
  if (count) {
    const body = named
      ? sources.map((source) => `${source.name}:${hits.filter((hit) => hit.name === source.name).length}`).join('\n')
      : String(hits.length);
    return { stdout: `${body}\n`, stderr, code: hits.length ? 0 : 1, events: [] };
  }
  if (hits.length === 0) return { stdout: '', stderr, code: stderr ? 2 : 1, events: [] };
  const body = hits.map((hit) => `${named ? `${hit.name}:` : ''}${numbers ? `${hit.n}:` : ''}${hit.line}`).join('\n');
  return { stdout: `${body}\n`, stderr, code: 0, events: [] };
}

export function cmdWc(g: Play, args: string[], stdin: string): Step {
  const flags = args.filter((arg) => arg.startsWith('-') && arg !== '-').join('');
  const files = args.filter((arg) => !arg.startsWith('-') || arg === '-');
  const got = textFrom(g, files, stdin, 'wc');
  if (got.error) return empty(1, got.error);
  const text = got.text;
  let lines = text.split('\n').length - 1;
  if (text.length > 0 && !text.endsWith('\n')) lines += 1;
  if (text.length === 0) lines = 0;
  const words = text.split(/\s+/).filter(Boolean).length;
  const chars = text.length;
  const want = { l: flags.includes('l'), w: flags.includes('w'), c: flags.includes('c') || flags.includes('m') };
  if (!want.l && !want.w && !want.c) return out(`${lines} ${words} ${chars}\n`);
  const parts: number[] = [];
  if (want.l) parts.push(lines);
  if (want.w) parts.push(words);
  if (want.c) parts.push(chars);
  return out(`${parts.join(' ')}\n`);
}

export function cmdCut(g: Play, args: string[], stdin: string): Step {
  let delim = '\t';
  let fields = '1';
  const files: string[] = [];
  walkArgs(args, (arg, next) => {
    if (arg === '-d') delim = next() || '\t';
    else if (arg.startsWith('-d')) delim = arg.slice(2) || '\t';
    else if (arg === '-f') fields = next() ?? '1';
    else if (arg.startsWith('-f')) fields = arg.slice(2);
    else files.push(arg);
  });
  const picks: Array<[number, number]> = [];
  for (const part of fields.split(',')) {
    const range = /^(\d*)-(\d*)$/.exec(part);
    if (range) picks.push([Number(range[1] || 1), range[2] ? Number(range[2]) : Number.POSITIVE_INFINITY]);
    else if (/^\d+$/.test(part)) picks.push([Number(part), Number(part)]);
    else return empty(1, `cut: invalid field list '${fields}'\n`);
  }
  const got = textFrom(g, files, stdin, 'cut');
  if (got.error) return empty(1, got.error);
  const body = linesOf(got.text).map((line) => {
    if (!line.includes(delim)) return line;
    const cols = line.split(delim);
    return cols.filter((_, index) => picks.some(([lo, hi]) => index + 1 >= lo && index + 1 <= hi)).join(delim);
  }).join('\n');
  return out(body.length || linesOf(got.text).length ? `${body}\n` : '');
}

export function cmdRev(g: Play, args: string[], stdin: string): Step {
  const got = textFrom(g, args.filter((arg) => arg !== '-'), stdin, 'rev');
  if (got.error) return empty(1, got.error);
  const rows = linesOf(got.text).map((line) => [...line].reverse().join(''));
  return out(rows.length ? `${rows.join('\n')}\n` : '');
}

export function sedScript(_g: Play, script: string): ((text: string) => string) | null {
  if (script[0] !== 's' || script.length < 4) return null;
  const delim = script[1] ?? '/';
  const parts: string[] = [];
  let cur = '';
  for (let i = 2; i < script.length; i++) {
    const ch = script[i] ?? '';
    if (ch === '\\' && script[i + 1] === delim) {
      cur += delim;
      i += 1;
    } else if (ch === delim) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  if (parts.length < 3) return null;
  const [old = '', replacement = '', flags = ''] = parts;
  const global = flags.includes('g');
  const caseless = flags.includes('i') || flags.includes('I');
  let rx: RegExp;
  try { rx = new RegExp(old, `${global ? 'g' : ''}${caseless ? 'i' : ''}m`); }
  catch { rx = new RegExp(escapeReg(old), `${global ? 'g' : ''}${caseless ? 'i' : ''}m`); }
  const repl = replacement.replace(/\$/g, '$$$$').replace(/\\(\d)/g, '$$$1').replace(/(^|[^\\])&/g, '$1$$&').replace(/\\&/g, '&');
  return (text) => linesOf(text).map((line) => line.replace(rx, repl)).join('\n') + (text.endsWith('\n') ? '\n' : '');
}

export function cmdSed(g: Play, args: string[], stdin: string): Step {
  let inplace = false;
  const rest: string[] = [];
  for (const arg of args) {
    if (arg === '-i' || arg === '-e' || arg === '-E' || arg === '-r') inplace = inplace || arg === '-i';
    else rest.push(arg);
  }
  const script = rest[0];
  if (!script) return empty(1, 'sed: missing script\n');
  const apply = sedScript(g, script);
  if (!apply) return empty(1, `sed: -e expression #1: unknown command (only s/old/new/[g] is supported)\n`);
  const files = rest.slice(1);
  if (inplace) {
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
  let count = 10;
  const files: string[] = [];
  walkArgs(args, (arg, next) => {
    if (arg === '-n') count = Number(next() ?? '10');
    else if (/^-n\d+$/.test(arg)) count = Number(arg.slice(2));
    else if (/^-\d+$/.test(arg)) count = Number(arg.slice(1));
    else files.push(arg);
  });
  if (!Number.isFinite(count) || count < 0) return empty(1, `${head ? 'head' : 'tail'}: invalid number of lines\n`);
  const got = textFrom(g, files, stdin, head ? 'head' : 'tail');
  if (got.error) return empty(1, got.error);
  const rows = linesOf(got.text);
  const slice = head ? rows.slice(0, count) : rows.slice(Math.max(0, rows.length - count));
  return out(slice.length ? `${slice.join('\n')}\n` : '');
}
