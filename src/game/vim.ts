import {
  applyInsertChar,
  clampCursor,
  deleteSpan,
  enterInsertAt,
  findCharOnLine,
  findSearchMatch,
  indentLines,
  joinVimLines,
  moveMotion,
  pasteYank,
  performOperatorMotion,
  pushUndo,
  redoVim,
  splitVimLines,
  stepInsertNav,
  undoVim,
} from './vim-buffer.js';
import { runExCommand } from './vim-ex.js';
import {
  createVimModeMachine,
  type VimCliResult,
  type VimIo,
  type VimOpenPayload,
  type VimState,
  type VimStepOutcome,
} from './vim-types.js';

export function createVimState(payload: VimOpenPayload): VimState {
  const split = splitVimLines(payload.content);
  const startRow = Math.max(0, Math.min(split.lines.length - 1, (payload.startLine ?? 1) - 1));
  const state: VimState = {
    path: payload.path,
    lines: split.lines,
    trailingNl: split.trailingNl,
    row: startRow,
    col: payload.startCol ?? 0,
    scrollRow: 0,
    readOnly: payload.readOnly,
    isNewFile: payload.isNewFile ?? false,
    dirty: false,
    showNumbers: payload.showNumbers ?? true,
    pendingKey: '',
    countBuf: '',
    yankBuf: '',
    yankLinewise: false,
    exBuf: '',
    searchBuf: '',
    searchForward: true,
    searchPattern: payload.searchPattern ?? '',
    searchHighlight: Boolean(payload.searchPattern),
    visualAnchor: null,
    status: payload.readOnly
      ? `"${payload.path || '[No Name]'}" [readonly] ${split.lines.length}L`
      : payload.isNewFile
        ? `"${payload.path}" [New File]`
        : `"${payload.path || '[No Name]'}" ${split.lines.length}L`,
    statusKind: 'info',
    lastFind: null,
    lastChange: null,
    insertCapture: null,
    undoStack: [],
    redoStack: [],
    modeMachine: createVimModeMachine(),
  };
  clampCursor(state);
  return state;
}

const KEY_ALIASES: Record<string, string> = {
  Escape: '\x1b', Enter: '\r', Backspace: '\x7f', Tab: '\t',
  ArrowUp: '\x1b[A', ArrowDown: '\x1b[B', ArrowRight: '\x1b[C', ArrowLeft: '\x1b[D',
  Home: '\x1b[H', End: '\x1b[F', Delete: '\x1b[3~', PageUp: '\x1b[5~', PageDown: '\x1b[6~',
  '\x1bOA': '\x1b[A', '\x1bOB': '\x1b[B', '\x1bOC': '\x1b[C', '\x1bOD': '\x1b[D',
  '\x1bOH': '\x1b[H', '\x1bOF': '\x1b[F',
};

function normalizeKey(raw: string): string {
  return KEY_ALIASES[raw] ?? raw;
}

function exitToNormal(s: VimState): void {
  const prevMode = s.modeMachine.state;
  if ((prevMode === 'insert' || prevMode === 'replace') && s.insertCapture) {
    s.lastChange = {
      kind: 'insert-seq',
      cmd: s.insertCapture.entryCmd,
      inserted: s.insertCapture.typed,
    };
    s.insertCapture = null;
    if (s.col > 0) s.col -= 1;
  }
  s.modeMachine.send('EXIT_TO_NORMAL');
  s.pendingKey = '';
  s.countBuf = '';
  s.visualAnchor = null;
  s.exBuf = '';
  s.searchBuf = '';
  if (prevMode === 'insert' || prevMode === 'replace' || prevMode === 'visual' || prevMode === 'visual-line') {
    s.status = '';
    s.statusKind = 'info';
  }
  clampCursor(s);
}

function replayLastChange(s: VimState): void {
  const last = s.lastChange;
  if (!last) return;
  if (last.kind === 'insert-seq') {
    const entry = last.cmd ?? 'i';
    if (entry === 'i' || entry === 'I' || entry === 'a' || entry === 'A' || entry === 'o' || entry === 'O' || entry === 'R') {
      enterInsertAt(s, entry);
      for (const ch of last.inserted ?? '') applyInsertChar(s, ch, entry === 'R');
      s.modeMachine.send('EXIT_TO_NORMAL');
      s.insertCapture = null;
      if (s.col > 0) s.col -= 1;
      clampCursor(s);
      s.status = '';
    }
    return;
  }
  if (last.cmd) executeNormalAction(s, last.cmd, last.count ?? 1, last.arg, false);
}

function executeNormalAction(
  s: VimState,
  cmd: string,
  count: number,
  arg: string | undefined,
  recordChange: boolean,
): void {
  const times = Math.max(1, count);
  const line = s.lines[s.row] ?? '';
  if (cmd === 'x' || cmd === '\x1b[3~') {
    if (line.length === 0) return;
    const end = Math.min(line.length - 1, s.col + times - 1);
    deleteSpan(s, s.row, s.col, s.row, end, false, false);
    if (recordChange) s.lastChange = { kind: 'normal', cmd: 'x', count };
    return;
  }
  if (cmd === 'X') {
    if (s.col <= 0) return;
    const start = Math.max(0, s.col - times);
    deleteSpan(s, s.row, start, s.row, s.col - 1, false, false);
    if (recordChange) s.lastChange = { kind: 'normal', cmd: 'X', count };
    return;
  }
  if (cmd === 'r' && arg && arg.length === 1 && arg >= ' ') {
    if (s.col >= line.length) return;
    pushUndo(s);
    const end = Math.min(line.length, s.col + times);
    s.lines[s.row] = line.slice(0, s.col) + arg.repeat(end - s.col) + line.slice(end);
    s.col = end - 1;
    s.dirty = true;
    clampCursor(s);
    if (recordChange) s.lastChange = { kind: 'normal', cmd: 'r', count, arg };
    return;
  }
  if (cmd === 's') {
    const nonEmpty = line.length > 0;
    if (nonEmpty) deleteSpan(s, s.row, s.col, s.row, Math.min(line.length - 1, s.col + times - 1), false, false);
    enterInsertAt(s, 'i', nonEmpty);
    return;
  }
  if (cmd === 'S') {
    performOperatorMotion(s, 'c', 'c', count);
    return;
  }
  if (cmd === 'D') {
    performOperatorMotion(s, 'd', '$', 1);
    if (recordChange) s.lastChange = { kind: 'normal', cmd: 'D', count: 1 };
    return;
  }
  if (cmd === 'C') {
    performOperatorMotion(s, 'c', '$', 1);
    return;
  }
  if (cmd === 'Y') {
    performOperatorMotion(s, 'y', 'y', count);
    return;
  }
  if (cmd === 'p' || cmd === 'P') {
    for (let i = 0; i < times; i += 1) pasteYank(s, cmd === 'P');
    if (recordChange) s.lastChange = { kind: 'normal', cmd, count };
    return;
  }
  if (cmd === 'J') {
    if (s.row + 1 >= s.lines.length) return;
    pushUndo(s);
    for (let i = 0; i < times && s.row + 1 < s.lines.length; i += 1) {
      const a = s.lines[s.row] ?? '';
      const b = (s.lines[s.row + 1] ?? '').trimStart();
      s.col = a.length;
      s.lines.splice(s.row, 2, a && b ? `${a} ${b}` : `${a}${b}`);
      s.dirty = true;
    }
    clampCursor(s);
    if (recordChange) s.lastChange = { kind: 'normal', cmd: 'J', count };
    return;
  }
  if (cmd === '>>' || cmd === '<<') {
    indentLines(s, s.row, s.row + times - 1, cmd === '<<');
    if (recordChange) s.lastChange = { kind: 'normal', cmd, count };
    return;
  }
  const opMatch = /^([dcy])(d|c|y|w|e|b|\$|0|G|gg)$/.exec(cmd);
  if (opMatch) {
    performOperatorMotion(s, opMatch[1] as 'd' | 'c' | 'y', opMatch[2]!, count);
    if (recordChange && (opMatch[1] === 'd')) s.lastChange = { kind: 'normal', cmd, count };
  }
}

function stepSearchPrompt(s: VimState, key: string): void {
  if (key === '\x1b' || key === '\x03') {
    exitToNormal(s);
    s.status = '';
    return;
  }
  if (key === '\r' || key === '\n') {
    const pat = s.searchBuf || s.searchPattern;
    exitToNormal(s);
    if (!pat) return;
    s.searchPattern = pat;
    s.searchHighlight = true;
    const hit = findSearchMatch(s.lines, s.row, s.col, pat, s.searchForward);
    if (!hit) {
      s.status = `E486: Pattern not found: ${pat}`;
      s.statusKind = 'error';
      return;
    }
    s.row = hit.row;
    s.col = hit.col;
    clampCursor(s);
    s.status = `${s.searchForward ? '/' : '?'}${pat}`;
    s.statusKind = 'info';
    return;
  }
  if (key === '\x7f' || key === '\b') {
    if (s.searchBuf.length === 0) exitToNormal(s);
    else s.searchBuf = s.searchBuf.slice(0, -1);
    return;
  }
  if (key.length === 1 && key >= ' ') s.searchBuf += key;
}

function stepExPrompt(s: VimState, key: string, io?: VimIo): { outcome: VimStepOutcome; savedPath: string | null; message?: string } {
  if (key === '\x1b' || key === '\x03') {
    exitToNormal(s);
    s.status = '';
    return { outcome: 'continue', savedPath: null };
  }
  if (key === '\r' || key === '\n') {
    const cmd = s.exBuf;
    exitToNormal(s);
    const res = runExCommand(s, cmd, io);
    s.status = res.message;
    s.statusKind = res.isError ? 'error' : 'info';
    return { outcome: res.outcome, savedPath: res.savedPath, message: res.message };
  }
  if (key === '\x7f' || key === '\b') {
    if (s.exBuf.length === 0) exitToNormal(s);
    else s.exBuf = s.exBuf.slice(0, -1);
    return { outcome: 'continue', savedPath: null };
  }
  if (key.length === 1 && key >= ' ') s.exBuf += key;
  return { outcome: 'continue', savedPath: null };
}

function consumeCountDigit(s: VimState, key: string): boolean {
  if (/^[1-9]$/.test(key) || (key === '0' && s.countBuf.length > 0)) {
    s.countBuf += key;
    return true;
  }
  return false;
}

function stepVisualMode(s: VimState, key: string): void {
  if (key === '\x1b' || key === '\x03' || (key === 'v' && s.modeMachine.state === 'visual') || (key === 'V' && s.modeMachine.state === 'visual-line')) {
    exitToNormal(s);
    return;
  }
  const count = s.countBuf ? Number(s.countBuf) : 0;
  if (consumeCountDigit(s, key)) return;
  if (key === 'g' && s.pendingKey === '') {
    s.pendingKey = 'g';
    return;
  }
  const motionKey = s.pendingKey === 'g' && key === 'g' ? 'gg' : key;
  s.pendingKey = '';
  if (moveMotion(s, motionKey, count)) {
    s.countBuf = '';
    return;
  }
  s.countBuf = '';
  const anchor = s.visualAnchor ?? { row: s.row, col: s.col };
  const linewise = s.modeMachine.state === 'visual-line';
  if (key === 'd' || key === 'x' || key === 'y' || key === 'c' || key === 's') {
    deleteSpan(s, anchor.row, anchor.col, s.row, s.col, linewise, key === 'y');
    exitToNormal(s);
    if (key === 'c' || key === 's') enterInsertAt(s, linewise ? 'O' : 'i', true);
    else if (key === 'y') s.status = 'yanked selection';
    return;
  }
  if (key === '>' || key === '<') {
    indentLines(s, anchor.row, s.row, key === '<');
    exitToNormal(s);
  }
}

function stepNormalMode(s: VimState, key: string): void {
  if (key === '\x1b' || key === '\x03') {
    s.pendingKey = '';
    s.countBuf = '';
    return;
  }
  const count = s.countBuf ? Number(s.countBuf) : 0;
  const times = Math.max(1, count);

  if (s.pendingKey === 'r' || s.pendingKey === 'f' || s.pendingKey === 'F' || s.pendingKey === 't' || s.pendingKey === 'T') {
    const op = s.pendingKey;
    s.pendingKey = '';
    s.countBuf = '';
    if (op === 'r') {
      executeNormalAction(s, 'r', count, key, true);
      return;
    }
    const forward = op === 'f' || op === 't';
    const till = op === 't' || op === 'T';
    s.lastFind = { ch: key, forward, till };
    const col = findCharOnLine(s.lines[s.row] ?? '', s.col, key, forward, till);
    if (col !== null) s.col = col;
    return;
  }

  if (s.pendingKey) {
    if ((s.pendingKey === 'd' || s.pendingKey === 'c' || s.pendingKey === 'y') && consumeCountDigit(s, key)) return;
    if ((s.pendingKey === 'd' || s.pendingKey === 'c' || s.pendingKey === 'y') && key === 'g') {
      s.pendingKey = `${s.pendingKey}g`;
      return;
    }
    const seq = `${s.pendingKey}${key}`;
    s.pendingKey = '';
    s.countBuf = '';
    if (seq === 'gg') moveMotion(s, 'gg', count);
    else executeNormalAction(s, seq, count, undefined, true);
    return;
  }

  if (consumeCountDigit(s, key)) return;

  if (key === 'g' || key === 'd' || key === 'c' || key === 'y' || key === '>' || key === '<' || key === 'r' || key === 'f' || key === 'F' || key === 't' || key === 'T') {
    s.pendingKey = key;
    return;
  }

  s.countBuf = '';
  if (moveMotion(s, key, count)) return;

  if (key === ';' || key === ',') {
    if (!s.lastFind) return;
    const forward = key === ';' ? s.lastFind.forward : !s.lastFind.forward;
    const col = findCharOnLine(s.lines[s.row] ?? '', s.col, s.lastFind.ch, forward, s.lastFind.till);
    if (col !== null) s.col = col;
    return;
  }
  if (key === 'i' || key === 'I' || key === 'a' || key === 'A' || key === 'o' || key === 'O' || key === 'R') {
    enterInsertAt(s, key);
    return;
  }
  if (key === 'v' || key === 'V') {
    s.visualAnchor = { row: s.row, col: s.col };
    s.modeMachine.send(key === 'V' ? 'ENTER_VISUAL_LINE' : 'ENTER_VISUAL');
    s.status = key === 'V' ? '-- VISUAL LINE --' : '-- VISUAL --';
    s.statusKind = 'info';
    return;
  }
  if (key === ':') {
    s.exBuf = '';
    s.modeMachine.send('ENTER_COMMAND');
    return;
  }
  if (key === '/' || key === '?') {
    s.searchForward = key === '/';
    s.searchBuf = '';
    s.modeMachine.send('ENTER_SEARCH');
    return;
  }
  if (key === 'n' || key === 'N') {
    if (!s.searchPattern) return;
    const dir = key === 'n' ? s.searchForward : !s.searchForward;
    const hit = findSearchMatch(s.lines, s.row, s.col, s.searchPattern, dir);
    if (!hit) {
      s.status = `E486: Pattern not found: ${s.searchPattern}`;
      s.statusKind = 'error';
      return;
    }
    s.row = hit.row;
    s.col = hit.col;
    clampCursor(s);
    return;
  }
  if (key === 'u') {
    for (let i = 0; i < times; i += 1) undoVim(s);
    return;
  }
  if (key === '\x12') {
    for (let i = 0; i < times; i += 1) redoVim(s);
    return;
  }
  if (key === '.') {
    replayLastChange(s);
    return;
  }
  executeNormalAction(s, key, count, undefined, true);
}

export function stepVimKey(
  s: VimState,
  rawKey: string,
  io?: VimIo,
): { outcome: VimStepOutcome; savedPath: string | null; message?: string } {
  const key = normalizeKey(rawKey);
  const mode = s.modeMachine.state;
  if (mode === 'command') return stepExPrompt(s, key, io);
  if (mode === 'search') {
    stepSearchPrompt(s, key);
    return { outcome: 'continue', savedPath: null };
  }
  if (mode === 'insert' || mode === 'replace') {
    if (key === '\x1b' || key === '\x03') {
      exitToNormal(s);
      return { outcome: 'continue', savedPath: null };
    }
    if (!stepInsertNav(s, key)) {
      applyInsertChar(s, key, mode === 'replace');
      if (s.insertCapture) s.insertCapture.typed += key;
    }
    return { outcome: 'continue', savedPath: null };
  }
  if (mode === 'visual' || mode === 'visual-line') {
    stepVisualMode(s, key);
    return { outcome: 'continue', savedPath: null };
  }
  stepNormalMode(s, key);
  return { outcome: 'continue', savedPath: null };
}

export function runVimCli(args: string[], io: VimIo): VimCliResult {
  const exCmds: string[] = [];
  let readOnly = false;
  let startLine = 1;
  let fileArg = '';
  let endOpts = false;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]!;
    if (!endOpts && a === '--') {
      endOpts = true;
      continue;
    }
    if (!endOpts && a === '-c') {
      const next = args[i + 1];
      if (!next) return { kind: 'error', code: 1, stderr: 'vim: option requires an argument -- c\n' };
      exCmds.push(next);
      i += 1;
      continue;
    }
    if (!endOpts && a.startsWith('+') && a.length > 1) {
      const rest = a.slice(1);
      if (/^\d+$/.test(rest)) startLine = Number(rest);
      else exCmds.push(rest);
      continue;
    }
    if (!endOpts && a.startsWith('-') && a.length > 1) {
      for (const ch of a.slice(1)) {
        if (ch === 'R') readOnly = true;
        else if (ch === 'n') continue;
        else return { kind: 'error', code: 1, stderr: `vim: unrecognized option '-${ch}'\n` };
      }
      continue;
    }
    if (!fileArg) fileArg = a;
    else return { kind: 'error', code: 1, stderr: `vim: unexpected extra operand '${a}'\n` };
  }

  let content = '';
  let isNewFile = true;
  if (fileArg) {
    const readRes = io.read(fileArg);
    if (!readRes.ok) return { kind: 'error', code: 1, stderr: `${readRes.error}\n` };
    content = readRes.content;
    isNewFile = !readRes.exists;
  }

  const state = createVimState({ path: fileArg, content, readOnly, startLine, isNewFile });
  let saved = false;
  let savedPath: string | null = null;
  const outLines: string[] = [];
  const errLines: string[] = [];
  let exited = false;

  for (const cmd of exCmds) {
    const res = runExCommand(state, cmd, io);
    if (res.savedPath) {
      saved = true;
      savedPath = res.savedPath;
    }
    if (res.message) {
      if (res.isError) errLines.push(res.message);
      else outLines.push(res.message);
    }
    if (res.outcome === 'quit' || res.outcome === 'saved-quit') {
      exited = true;
      break;
    }
  }

  if (exited) {
    return {
      kind: 'headless',
      code: errLines.length > 0 && !saved ? 1 : 0,
      stdout: outLines.length > 0 ? `${outLines.join('\n')}\n` : '',
      stderr: errLines.length > 0 ? `${errLines.join('\n')}\n` : '',
      saved,
      savedPath,
    };
  }

  return {
    kind: 'open',
    payload: {
      path: state.path,
      content: joinVimLines(state.lines, state.trailingNl),
      readOnly: state.readOnly,
      startLine: state.row + 1,
      startCol: state.col,
      showNumbers: state.showNumbers,
      isNewFile: state.isNewFile,
      searchPattern: state.searchHighlight ? state.searchPattern : undefined,
    },
    warning: errLines[0],
  };
}

export { createVfsVimIo } from './vim-ex.js';
