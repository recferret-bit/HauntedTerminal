/**
 * Shared pure POSIX/Unix applet algorithms used by both Classic (`src/game/`) and Chapter (`src/chapters/`) shells.
 * Keeping parsing, regex/glob matching, permission algebra, and process signal parsing in one pure module
 * eliminates duplicate shell implementations and divergence bugs.
 */
import type { PosixSignal } from '../contracts/events.js';
import type { ProcRow } from './entities-types.js';

function escapeReg(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function globToRegExp(pattern: string): RegExp {
  const esc = pattern
    .split('')
    .map((ch) => (ch === '*' ? '.*' : ch === '?' ? '.' : escapeReg(ch)))
    .join('');
  return new RegExp(`^${esc}$`);
}

/** Split text into lines, stripping the single empty element produced by a trailing newline. */
function linesOf(text: string): string[] {
  if (!text) return [];
  const parts = text.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts;
}

/** Apply numeric octal (`644`) or symbolic comma-separated (`u+x,go-w`) `chmod` spec. */
export function applyChmodMode(current: number, spec: string): number | null {
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

export function wcStats(text: string): { lines: number; words: number; chars: number } {
  const lines = linesOf(text).length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { lines, words, chars: text.length };
}

export function formatWc(text: string, flags: string): string {
  const { lines, words, chars } = wcStats(text);
  const wantL = flags.includes('l');
  const wantW = flags.includes('w');
  const wantC = flags.includes('c') || flags.includes('m');
  if (!wantL && !wantW && !wantC) return `${lines} ${words} ${chars}\n`;
  const parts: number[] = [];
  if (wantL) parts.push(lines);
  if (wantW) parts.push(words);
  if (wantC) parts.push(chars);
  return `${parts.join(' ')}\n`;
}

export interface GrepSpec {
  hide: boolean;
  count: boolean;
  ignoreCase: boolean;
  invert: boolean;
  numbers: boolean;
  pattern: string;
  files: string[];
  /** `-r`: search directories recursively; every hit is named by its path. */
  recursive?: boolean;
}

export function parseGrepArgs(args: string[]): GrepSpec | { error: string } {
  let hide = false;
  let count = false;
  let ignoreCase = false;
  let invert = false;
  let numbers = false;
  let recursive = false;
  const positional: string[] = [];
  for (const arg of args) {
    if (arg.startsWith('-') && arg !== '-' && !arg.startsWith('--') && positional.length === 0) {
      if (arg.includes('h')) hide = true;
      if (arg.includes('c')) count = true;
      if (arg.includes('i')) ignoreCase = true;
      if (arg.includes('v')) invert = true;
      if (arg.includes('n')) numbers = true;
      if (arg.includes('r') || arg.includes('R')) recursive = true;
    } else {
      positional.push(arg);
    }
  }
  const pattern = positional[0];
  if (pattern === undefined || pattern === '') {
    return { error: 'usage: grep [-hcivnr] <pattern> [file...]\n' };
  }
  return { hide, count, ignoreCase, invert, numbers, pattern, files: positional.slice(1), recursive };
}

export function compileGrepRegex(pattern: string, ignoreCase: boolean): RegExp {
  const flags = ignoreCase ? 'i' : '';
  try {
    return new RegExp(pattern, flags);
  } catch {
    return new RegExp(escapeReg(pattern), flags);
  }
}

export function runGrepSources(
  sources: Array<{ name: string; text: string }>,
  spec: GrepSpec,
): { stdout: string; hits: number } {
  const rx = compileGrepRegex(spec.pattern, spec.ignoreCase);
  const hits: Array<{ name: string; line: string; n: number }> = [];
  for (const source of sources) {
    linesOf(source.text).forEach((line, index) => {
      if (rx.test(line) !== spec.invert) hits.push({ name: source.name, line, n: index + 1 });
    });
  }
  const named = !spec.hide && (spec.recursive === true || spec.files.length > 1);
  if (spec.count) {
    const body = named
      ? sources.map((source) => `${source.name}:${hits.filter((h) => h.name === source.name).length}`).join('\n')
      : String(hits.length);
    return { stdout: `${body}\n`, hits: hits.length };
  }
  if (hits.length === 0) return { stdout: '', hits: 0 };
  const body = hits.map((h) => `${named ? `${h.name}:` : ''}${spec.numbers ? `${h.n}:` : ''}${h.line}`).join('\n');
  return { stdout: `${body}\n`, hits: hits.length };
}

export interface CutSpec {
  delim: string;
  picks: Array<[number, number]>;
  files: string[];
}

function walkFlagArgs(args: string[], onArg: (arg: string, next: () => string | undefined) => void): void {
  for (let i = 0; i < args.length; i += 1) {
    onArg(args[i] ?? '', () => args[++i]);
  }
}

export function parseCutArgs(args: string[]): CutSpec | { error: string } {
  let delim = '\t';
  let fields = '1';
  const files: string[] = [];
  walkFlagArgs(args, (arg, next) => {
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
    else return { error: `cut: invalid field list '${fields}'\n` };
  }
  return { delim, picks, files };
}

export function applyCutText(text: string, spec: CutSpec): string {
  const rows = linesOf(text);
  const body = rows
    .map((line) => {
      if (!line.includes(spec.delim)) return line;
      const cols = line.split(spec.delim);
      return cols.filter((_, index) => spec.picks.some(([lo, hi]) => index + 1 >= lo && index + 1 <= hi)).join(spec.delim);
    })
    .join('\n');
  return body.length || rows.length ? `${body}\n` : '';
}

export function parseHeadTailArgs(
  args: string[],
  cmd: 'head' | 'tail',
): { n: number; files: string[] } | { error: string } {
  let n = 10;
  const files: string[] = [];
  walkFlagArgs(args, (arg, next) => {
    if (arg === '-n') n = Number(next() ?? '10');
    else if (/^-n\d+$/.test(arg)) n = Number(arg.slice(2));
    else if (/^-\d+$/.test(arg)) n = Number(arg.slice(1));
    else files.push(arg);
  });
  if (!Number.isFinite(n) || n < 0) return { error: `${cmd}: invalid number of lines\n` };
  return { n, files };
}

export function sliceHeadTail(text: string, cmd: 'head' | 'tail', n: number): string {
  const rows = linesOf(text);
  const sliced = cmd === 'head' ? rows.slice(0, n) : rows.slice(Math.max(0, rows.length - n));
  return sliced.length ? `${sliced.join('\n')}\n` : '';
}

export function reverseLines(text: string): string {
  const rows = linesOf(text).map((line) => [...line].reverse().join(''));
  return rows.length ? `${rows.join('\n')}\n` : '';
}

/** `s//x/`: an empty pattern. GNU sed has no previous expression to reuse here and refuses; so do we. */
export function emptySedPattern(script: string): boolean {
  return script.length >= 3 && script[0] === 's' && script[2] === script[1];
}

export const SED_EMPTY_PATTERN = 'sed: -e expression #1, char 0: no previous regular expression\n';

export function parseSedArgs(args: string[]): { inPlace: boolean; extended: boolean; rest: string[] } {
  let inPlace = false;
  let extended = false;
  const rest: string[] = [];
  for (const arg of args) {
    if (arg === '-i' || arg.startsWith('-i')) inPlace = true;
    else if (arg === '-E' || arg === '-r') extended = true;
    else if (arg === '-e') continue;
    else rest.push(arg);
  }
  return { inPlace, extended, rest };
}

export interface CompileSedOptions {
  extended?: boolean;
  escapeBasicQuantifiers?: boolean;
  supportBackrefs?: boolean;
}

export function compileSedScript(
  script: string,
  opts: CompileSedOptions = {},
): ((text: string) => string) | null {
  if (script[0] !== 's' || script.length < 4) return null;
  const delim = script[1] ?? '/';
  const parts: string[] = [];
  let cur = '';
  for (let i = 2; i < script.length; i += 1) {
    const ch = script[i] ?? '';
    if (ch === '\\' && script[i + 1] === delim) {
      cur += delim;
      i += 1;
    } else if (ch === '\\' && i + 1 < script.length && opts.escapeBasicQuantifiers) {
      cur += ch + (script[i + 1] ?? '');
      i += 1;
    } else if (ch === delim) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  if (parts.length < 3) return null;
  const [old = '', rawRepl = '', flags = ''] = parts;
  if (opts.escapeBasicQuantifiers && (parts.length > 3 || !/^[giI]*$/.test(flags))) return null;
  const global = flags.includes('g');
  const caseless = flags.includes('i') || flags.includes('I');
  const rxFlags = `${global ? 'g' : ''}${caseless ? 'i' : ''}${opts.supportBackrefs ? 'm' : ''}`;
  const jsPat = opts.escapeBasicQuantifiers && !opts.extended ? old.replace(/([+?(){}])/g, '\\$1') : old;
  let rx: RegExp;
  try {
    rx = new RegExp(jsPat, rxFlags);
  } catch {
    rx = new RegExp(escapeReg(old), rxFlags);
  }
  const repl = opts.supportBackrefs
    ? rawRepl.replace(/\$/g, '$$$$').replace(/\\(\d)/g, '$$$1').replace(/(^|[^\\])&/g, '$1$$&').replace(/\\&/g, '&')
    : rawRepl.replace(/\$/g, '$$$$');
  return (text) => linesOf(text).map((line) => line.replace(rx, repl)).join('\n') + (text.endsWith('\n') ? '\n' : '');
}

export function parseSignalToken(token: string | undefined): PosixSignal | null {
  if (!token) return 'SIGTERM';
  const name = token.replace(/^-/, '').toUpperCase().replace(/^SIG/, '');
  if (name === '9' || name === 'KILL') return 'SIGKILL';
  if (name === '15' || name === 'TERM') return 'SIGTERM';
  if (name === 'STOP' || name === '19' || name === '17' || name === '23') return 'SIGSTOP';
  if (name === 'CONT' || name === '18' || name === '19C') return 'SIGCONT';
  return null;
}

export type KillArgsResult =
  | { kind: 'list' }
  | { kind: 'run'; signal: PosixSignal; pids: number[] }
  | { kind: 'error'; code: number; error: string };

export function parseKillArgs(args: string[], usage: string, emptyCode = 2): KillArgsResult {
  if (args[0] === '-l' || args[0] === '-L') return { kind: 'list' };
  let signal: PosixSignal = 'SIGTERM';
  const pids: number[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (arg === '-s') {
      const tok = args[++i];
      const parsed = tok ? parseSignalToken(tok) : null;
      if (!parsed) return { kind: 'error', code: 1, error: `kill: ${tok ?? '-s'}: invalid signal specification\n` };
      signal = parsed;
    } else if (arg.startsWith('-')) {
      const parsed = parseSignalToken(arg);
      if (!parsed) return { kind: 'error', code: 1, error: `kill: ${arg}: invalid signal specification\n` };
      signal = parsed;
    } else {
      const pid = Number(arg);
      if (!Number.isInteger(pid)) return { kind: 'error', code: 1, error: `kill: ${arg}: arguments must be process IDs\n` };
      pids.push(pid);
    }
  }
  if (pids.length === 0) return { kind: 'error', code: emptyCode, error: usage };
  return { kind: 'run', signal, pids };
}

export interface PkillSpec {
  signal: PosixSignal;
  sigFlag: string;
  full: boolean;
  exact: boolean;
  ppid: number | null;
  pattern: string | null;
}

export function parsePkillArgs(args: string[]): ({ ok: true } & PkillSpec) | { ok: false; error: string } {
  let signal: PosixSignal = 'SIGTERM';
  let sigFlag = '-15';
  let full = false;
  let exact = false;
  let ppid: number | null = null;
  const patterns: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (arg === '--') {
      patterns.push(...args.slice(i + 1));
      break;
    }
    if (arg === '-s') {
      const tok = args[++i];
      const sig = tok ? parseSignalToken(tok) : null;
      if (!sig) return { ok: false, error: `pkill: ${tok ?? '-s'}: invalid signal\n` };
      signal = sig;
      sigFlag = `-${sig}`;
    } else if (arg === '-P' || (arg.startsWith('-P') && arg.length > 2)) {
      const raw = arg === '-P' ? args[++i] : arg.slice(2);
      const n = raw !== undefined && raw !== '' ? Number(raw) : NaN;
      if (!Number.isInteger(n) || n < 0) return { ok: false, error: `pkill: invalid parent process ID '${raw ?? ''}'\n` };
      ppid = n;
    } else if (/^-[fx]+$/.test(arg)) {
      if (arg.includes('f')) full = true;
      if (arg.includes('x')) exact = true;
    } else if (arg.startsWith('-')) {
      const sig = parseSignalToken(arg);
      if (!sig) return { ok: false, error: `pkill: ${arg}: invalid signal\n` };
      signal = sig;
      sigFlag = `-${sig}`;
    } else {
      patterns.push(arg);
    }
  }
  if (patterns.length > 1) return { ok: false, error: 'pkill: only one pattern can be provided\n' };
  const pattern = patterns[0] ?? null;
  if (pattern === null && ppid === null) return { ok: false, error: 'pkill: no matching criteria specified\n' };
  return { ok: true, signal, sigFlag, full, exact, ppid, pattern };
}

export function matchesPkill(proc: ProcRow, spec: PkillSpec): boolean {
  if (spec.ppid !== null && proc.ppid !== spec.ppid) return false;
  if (spec.pattern === null) return true;
  const hay = spec.full ? proc.name : (proc.name.split(/\s+/)[0] ?? proc.name);
  return spec.exact ? hay === spec.pattern : hay.includes(spec.pattern);
}

export const LS_FLAGS_LOCKED_MESSAGE =
  'ls: flags (-a, -l, -la, ...) require your Tube Transistor! Basic `ls [path]` shows visible files; recover the Tube Transistor to inspect hidden dotfiles and details.\n';

/** True when `ls` arguments contain any option flag (`-a`, `-A`, `-l`, `-la`, `--all`, etc.; bare `-` is a path). */
export function hasLsFlags(args: readonly string[]): boolean {
  return args.some((arg) => arg.startsWith('-') && arg.length > 1);
}

/** Longest-common-prefix completion formatter shared by both terminal shells. */
export function finishTabCompletion(
  line: string,
  lead: string,
  token: string,
  matches: string[],
): { line: string; matches: string[] } {
  if (matches.length === 0) return { line, matches };
  if (matches.length === 1) {
    const only = matches[0] ?? '';
    return { line: `${lead}${only}${only.endsWith('/') ? '' : ' '}`, matches };
  }
  let prefix = matches[0] ?? '';
  for (const item of matches) {
    while (prefix && !item.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return { line: `${lead}${prefix.length >= token.length ? prefix : token}`, matches };
}
