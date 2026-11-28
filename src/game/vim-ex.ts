import { absPath, hasWrite, makeNode, resolve, type VNode } from './tree.js';
import { clampCursor, findSearchMatch, joinVimLines, pushUndo, splitVimLines } from './vim-buffer.js';
import type { VimIo, VimState, VimStepOutcome } from './vim-types.js';

export interface ExExecResult {
  outcome: VimStepOutcome;
  message: string;
  isError: boolean;
  savedPath: string | null;
}

function resolveExAddress(tok: string, curRow: number, total: number): number | null {
  if (tok === '.') return curRow;
  if (tok === '$') return Math.max(0, total - 1);
  if (/^\d+$/.test(tok)) {
    const n = Number(tok);
    return n <= 0 ? 0 : Math.min(Math.max(0, total - 1), n - 1);
  }
  return null;
}

function parseExRange(raw: string, curRow: number, total: number): { start: number; end: number; rest: string } {
  const trimmed = raw.trim();
  if (trimmed.startsWith('%')) {
    return { start: 0, end: Math.max(0, total - 1), rest: trimmed.slice(1).trim() };
  }
  const m = /^(\.|\$|\d+)(?:\s*,\s*(\.|\$|\d+))?\s*(.*)$/.exec(trimmed);
  if (!m) return { start: curRow, end: curRow, rest: trimmed };
  const a1 = resolveExAddress(m[1]!, curRow, total);
  if (a1 === null) return { start: curRow, end: curRow, rest: trimmed };
  const a2 = m[2] ? resolveExAddress(m[2], curRow, total) : a1;
  if (a2 === null) return { start: curRow, end: curRow, rest: trimmed };
  return {
    start: Math.min(a1, a2),
    end: Math.max(a1, a2),
    rest: (m[3] ?? '').trim(),
  };
}

function parseDelimSegment(text: string, from: number, delim: string): { value: string; next: number; closed: boolean } {
  let out = '';
  let i = from;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '\\' && i + 1 < text.length) {
      const nx = text[i + 1]!;
      if (nx === delim) {
        out += delim;
        i += 2;
        continue;
      }
      out += ch + nx;
      i += 2;
      continue;
    }
    if (ch === delim) return { value: out, next: i + 1, closed: true };
    out += ch;
    i += 1;
  }
  return { value: out, next: i, closed: false };
}

function expandSubReplacement(template: string, match: string): string {
  let out = '';
  for (let i = 0; i < template.length; i += 1) {
    const ch = template[i]!;
    if (ch === '\\' && i + 1 < template.length) {
      const nx = template[i + 1]!;
      if (nx === 'n') out += '\n';
      else if (nx === 't') out += '\t';
      else if (nx === '&' || nx === '\\') out += nx;
      else out += `\\${nx}`;
      i += 1;
    } else if (ch === '&') {
      out += match;
    } else {
      out += ch;
    }
  }
  return out;
}

function compileSearchRx(pat: string, flags: string): RegExp {
  const rxFlags = (flags.includes('g') ? 'g' : '') + (flags.includes('i') ? 'i' : '');
  try {
    return new RegExp(pat, rxFlags);
  } catch {
    return new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), rxFlags);
  }
}

function runSubstitute(s: VimState, start: number, end: number, expr: string): ExExecResult {
  const body = expr.replace(/^s(?:ubstitute)?/, '');
  const delim = body[0];
  if (!delim || /[A-Za-z0-9\s\\]/.test(delim)) {
    return { outcome: 'continue', message: 'E471: Argument required', isError: true, savedPath: null };
  }
  const patSeg = parseDelimSegment(body, 1, delim);
  const repSeg = patSeg.closed ? parseDelimSegment(body, patSeg.next, delim) : { value: '', next: patSeg.next, closed: false };
  const flags = repSeg.closed ? body.slice(repSeg.next).trim() : '';
  const pattern = patSeg.value || s.searchPattern;
  if (!pattern) {
    return { outcome: 'continue', message: 'E35: No previous regular expression', isError: true, savedPath: null };
  }
  const rx = compileSearchRx(pattern, flags);
  pushUndo(s);
  let totalSubs = 0;
  let changedLines = 0;
  let firstChangedRow = s.row;
  const newLines: string[] = [];
  for (let r = 0; r < s.lines.length; r += 1) {
    const line = s.lines[r] ?? '';
    if (r < start || r > end) {
      newLines.push(line);
      continue;
    }
    let lineSubs = 0;
    const replaced = line.replace(rx, (m) => {
      lineSubs += 1;
      return expandSubReplacement(repSeg.value, m);
    });
    if (lineSubs > 0) {
      if (changedLines === 0) firstChangedRow = newLines.length;
      changedLines += 1;
      totalSubs += lineSubs;
      newLines.push(...replaced.split('\n'));
    } else {
      newLines.push(line);
    }
  }
  if (totalSubs === 0) {
    s.undoStack.pop();
    if (flags.includes('e')) return { outcome: 'continue', message: '', isError: false, savedPath: null };
    return { outcome: 'continue', message: `E486: Pattern not found: ${pattern}`, isError: true, savedPath: null };
  }
  s.lines = newLines;
  s.row = Math.min(firstChangedRow, s.lines.length - 1);
  s.col = 0;
  s.dirty = true;
  clampCursor(s);
  const msg = `${totalSubs} substitution${totalSubs === 1 ? '' : 's'} on ${changedLines} line${changedLines === 1 ? '' : 's'}`;
  return { outcome: 'continue', message: msg, isError: false, savedPath: null };
}

function writeBuffer(s: VimState, targetArg: string, force: boolean, io?: VimIo): { ok: boolean; message: string; savedPath: string | null } {
  const target = targetArg || s.path;
  if (!target) return { ok: false, message: 'E32: No file name', savedPath: null };
  if (s.readOnly && !force && target === s.path) {
    return { ok: false, message: "E45: 'readonly' option is set (add ! to override)", savedPath: null };
  }
  if (!io) return { ok: false, message: 'E482: No filesystem write handler', savedPath: null };
  const text = joinVimLines(s.lines, s.trailingNl);
  const res = io.write(target, text);
  if (!res.ok) return { ok: false, message: res.error, savedPath: null };
  s.path = target;
  s.dirty = false;
  s.isNewFile = false;
  const bytes = text.length;
  const lineCount = s.lines.length;
  const baseMsg = `"${target}" ${lineCount}L, ${bytes}B written`;
  return { ok: true, message: res.message ? `${baseMsg} (${res.message})` : baseMsg, savedPath: target };
}

function runSetOption(s: VimState, args: string[]): ExExecResult {
  if (args.length === 0) {
    return {
      outcome: 'continue',
      message: `${s.showNumbers ? 'number' : 'nonumber'} ${s.readOnly ? 'readonly' : 'noreadonly'}`,
      isError: false,
      savedPath: null,
    };
  }
  for (const rawOpt of args) {
    const opt = rawOpt.toLowerCase();
    if (opt === 'nu' || opt === 'number') s.showNumbers = true;
    else if (opt === 'nonu' || opt === 'nonumber') s.showNumbers = false;
    else if (opt === 'nu!' || opt === 'number!') s.showNumbers = !s.showNumbers;
    else if (opt === 'ro' || opt === 'readonly') s.readOnly = true;
    else if (opt === 'noro' || opt === 'noreadonly') s.readOnly = false;
    else if (opt === 'hlsearch' || opt === 'hls') s.searchHighlight = true;
    else if (opt === 'nohlsearch' || opt === 'nohls') s.searchHighlight = false;
    else {
      return { outcome: 'continue', message: `E518: Unknown option: ${rawOpt}`, isError: true, savedPath: null };
    }
  }
  return { outcome: 'continue', message: '', isError: false, savedPath: null };
}

function reloadOrOpenFile(s: VimState, arg: string, force: boolean, io?: VimIo): ExExecResult {
  if (s.dirty && !force) {
    return { outcome: 'continue', message: 'E37: No write since last change (add ! to override)', isError: true, savedPath: null };
  }
  if (!io) return { outcome: 'continue', message: 'E482: No filesystem read handler', isError: true, savedPath: null };
  const target = arg || s.path;
  if (!target) return { outcome: 'continue', message: 'E32: No file name', isError: true, savedPath: null };
  const res = io.read(target);
  if (!res.ok) return { outcome: 'continue', message: res.error, isError: true, savedPath: null };
  const split = splitVimLines(res.content);
  s.path = target;
  s.lines = split.lines;
  s.trailingNl = split.trailingNl;
  s.isNewFile = !res.exists;
  s.dirty = false;
  s.row = 0;
  s.col = 0;
  s.undoStack = [];
  s.redoStack = [];
  clampCursor(s);
  return {
    outcome: 'continue',
    message: `"${target}" ${res.exists ? `${s.lines.length}L` : '[New File]'}`,
    isError: false,
    savedPath: null,
  };
}

export function runExCommand(s: VimState, rawCmd: string, io?: VimIo): ExExecResult {
  const trimmed = rawCmd.replace(/^:+/, '').trim();
  if (!trimmed) return { outcome: 'continue', message: '', isError: false, savedPath: null };

  if (trimmed.startsWith('/') || trimmed.startsWith('?')) {
    const forward = trimmed.startsWith('/');
    const pat = trimmed.slice(1);
    if (!pat) return { outcome: 'continue', message: 'E35: No previous regular expression', isError: true, savedPath: null };
    s.searchForward = forward;
    s.searchPattern = pat;
    s.searchHighlight = true;
    const hit = findSearchMatch(s.lines, s.row, s.col, pat, forward);
    if (!hit) return { outcome: 'continue', message: `E486: Pattern not found: ${pat}`, isError: true, savedPath: null };
    s.row = hit.row;
    s.col = hit.col;
    clampCursor(s);
    return { outcome: 'continue', message: `${forward ? '/' : '?'}${pat}`, isError: false, savedPath: null };
  }

  if (/^\d+$/.test(trimmed) || trimmed === '$') {
    const row = trimmed === '$' ? Math.max(0, s.lines.length - 1) : Math.min(s.lines.length - 1, Math.max(1, Number(trimmed)) - 1);
    s.row = row;
    s.col = 0;
    clampCursor(s);
    return { outcome: 'continue', message: `line ${s.row + 1}`, isError: false, savedPath: null };
  }

  const ranged = parseExRange(trimmed, s.row, s.lines.length);
  if (/^s(?:ubstitute)?[^A-Za-z0-9\s\\]/.test(ranged.rest)) {
    return runSubstitute(s, ranged.start, ranged.end, ranged.rest);
  }
  if (ranged.rest === 'd' || ranged.rest === 'delete') {
    pushUndo(s);
    s.yankBuf = s.lines.slice(ranged.start, ranged.end + 1).join('\n');
    s.yankLinewise = true;
    s.lines.splice(ranged.start, ranged.end - ranged.start + 1);
    if (s.lines.length === 0) s.lines = [''];
    s.row = Math.min(ranged.start, s.lines.length - 1);
    s.col = 0;
    s.dirty = true;
    clampCursor(s);
    return { outcome: 'continue', message: `${ranged.end - ranged.start + 1} line(s) deleted`, isError: false, savedPath: null };
  }

  const m = /^([A-Za-z]+)(!?)(?:\s+(.*))?$/.exec(trimmed);
  if (!m) {
    return { outcome: 'continue', message: `E492: Not an editor command: ${trimmed}`, isError: true, savedPath: null };
  }
  const verb = m[1]!.toLowerCase();
  const force = m[2] === '!';
  const arg = (m[3] ?? '').trim();

  if (verb === 'w' || verb === 'write') {
    const w = writeBuffer(s, arg, force, io);
    return { outcome: w.ok ? 'saved' : 'continue', message: w.message, isError: !w.ok, savedPath: w.savedPath };
  }
  if (verb === 'q' || verb === 'quit' || verb === 'qa' || verb === 'qall') {
    if (s.dirty && !force) {
      return { outcome: 'continue', message: 'E37: No write since last change (add ! to override)', isError: true, savedPath: null };
    }
    return { outcome: 'quit', message: '', isError: false, savedPath: null };
  }
  const isX = verb === 'x' || verb === 'xit' || verb === 'xa' || verb === 'xall';
  if (isX || verb === 'wq' || verb === 'wqa' || verb === 'wqall') {
    if (isX && !s.dirty && !arg) return { outcome: 'quit', message: '', isError: false, savedPath: null };
    const w = writeBuffer(s, arg, force, io);
    return { outcome: w.ok ? 'saved-quit' : 'continue', message: w.message, isError: !w.ok, savedPath: w.savedPath };
  }
  if (verb === 'e' || verb === 'edit') return reloadOrOpenFile(s, arg, force, io);
  if (verb === 'set' || verb === 'se') return runSetOption(s, arg ? arg.split(/\s+/) : []);
  if (verb === 'noh' || verb === 'nohlsearch') {
    s.searchHighlight = false;
    return { outcome: 'continue', message: '', isError: false, savedPath: null };
  }
  if (verb === 'h' || verb === 'help') {
    return {
      outcome: 'continue',
      message: 'i/a/o Insert | Esc Normal | :w Save | :q Quit | :wq Save+Quit | :%s/a/b/g Sub | / Search | u Undo',
      isError: false,
      savedPath: null,
    };
  }
  return { outcome: 'continue', message: `E492: Not an editor command: ${trimmed}`, isError: true, savedPath: null };
}

export function createVfsVimIo(opts: {
  cwd: () => VNode;
  isHidden?: (node: VNode) => boolean;
  onRead?: (abs: string) => void;
  onWrite?: (abs: string, node: VNode, created: boolean) => string | undefined;
}): VimIo {
  const resolveParent = (raw: string): { parent: VNode; name: string } | { error: string } => {
    const clean = raw.replace(/\/+$/, '');
    if (!clean || raw.endsWith('/')) return { error: `${raw}: Illegal file name` };
    const cut = clean.lastIndexOf('/');
    const dirExpr = cut < 0 ? '.' : cut === 0 ? '/' : clean.slice(0, cut);
    const name = cut < 0 ? clean : clean.slice(cut + 1);
    const parent = resolve(opts.cwd(), dirExpr, true).node;
    if (!parent || parent.kind !== 'dir' || opts.isHidden?.(parent)) return { error: `${raw}: No such directory` };
    return { parent, name };
  };

  return {
    read(target) {
      const res = resolve(opts.cwd(), target, true);
      if (res.node && opts.isHidden?.(res.node)) return { ok: false, error: `${target}: No such file or directory` };
      if (res.node) {
        if (res.node.kind !== 'file') return { ok: false, error: `${target}: Is a directory` };
        if ((res.node.mode & 0o400) === 0) return { ok: false, error: `${target}: Permission denied` };
        opts.onRead?.(absPath(res.node));
        return { ok: true, content: res.node.content, exists: true };
      }
      const p = resolveParent(target);
      return 'error' in p ? { ok: false, error: p.error } : { ok: true, content: '', exists: false };
    },
    write(target, content) {
      const existing = resolve(opts.cwd(), target, true).node;
      if (existing) {
        if (opts.isHidden?.(existing)) return { ok: false, error: `${target}: No such file or directory` };
        if (existing.kind !== 'file') return { ok: false, error: `${target}: Is a directory` };
        if (!hasWrite(existing)) return { ok: false, error: `${target}: Permission denied (read-only)` };
        existing.content = content;
        const abs = absPath(existing);
        opts.onRead?.(abs);
        return { ok: true, message: opts.onWrite?.(abs, existing, false) };
      }
      const p = resolveParent(target);
      if ('error' in p) return { ok: false, error: p.error };
      if (!hasWrite(p.parent)) return { ok: false, error: `${target}: Permission denied` };
      const created = makeNode(p.parent, p.name, 'file', 0o644);
      created.content = content;
      const abs = absPath(created);
      opts.onRead?.(abs);
      return { ok: true, message: opts.onWrite?.(abs, created, true) };
    },
  };
}
