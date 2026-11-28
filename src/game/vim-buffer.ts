import type { VimState } from './vim-types.js';

export function splitVimLines(content: string): { lines: string[]; trailingNl: boolean } {
  if (!content) return { lines: [''], trailingNl: false };
  const trailingNl = content.endsWith('\n');
  const raw = content.split('\n');
  if (trailingNl && raw.length > 1) raw.pop();
  return { lines: raw.length > 0 ? raw : [''], trailingNl };
}

export function joinVimLines(lines: readonly string[], trailingNl: boolean): string {
  const joined = lines.join('\n');
  return trailingNl || (lines.length === 1 && lines[0] !== '') || lines.length > 1 ? `${joined}\n` : joined;
}

export function clampCursor(s: VimState): void {
  if (s.lines.length === 0) s.lines = [''];
  s.row = Math.max(0, Math.min(s.row, s.lines.length - 1));
  const lineLen = (s.lines[s.row] ?? '').length;
  const mode = s.modeMachine.state;
  const maxCol = mode === 'insert' || mode === 'replace' ? lineLen : Math.max(0, lineLen - 1);
  s.col = Math.max(0, Math.min(s.col, maxCol));
}

export function pushUndo(s: VimState): void {
  s.undoStack.push({
    lines: [...s.lines],
    trailingNl: s.trailingNl,
    row: s.row,
    col: s.col,
  });
  if (s.undoStack.length > 120) s.undoStack.shift();
  s.redoStack = [];
}

export function undoVim(s: VimState): boolean {
  const prev = s.undoStack.pop();
  if (!prev) {
    s.status = 'Already at oldest change';
    s.statusKind = 'info';
    return false;
  }
  s.redoStack.push({ lines: [...s.lines], trailingNl: s.trailingNl, row: s.row, col: s.col });
  s.lines = [...prev.lines];
  s.trailingNl = prev.trailingNl;
  s.row = prev.row;
  s.col = prev.col;
  s.dirty = true;
  clampCursor(s);
  s.status = '1 change undone';
  s.statusKind = 'info';
  return true;
}

export function redoVim(s: VimState): boolean {
  const next = s.redoStack.pop();
  if (!next) {
    s.status = 'Already at newest change';
    s.statusKind = 'info';
    return false;
  }
  s.undoStack.push({ lines: [...s.lines], trailingNl: s.trailingNl, row: s.row, col: s.col });
  s.lines = [...next.lines];
  s.trailingNl = next.trailingNl;
  s.row = next.row;
  s.col = next.col;
  s.dirty = true;
  clampCursor(s);
  s.status = '1 change redone';
  s.statusKind = 'info';
  return true;
}

function charClass(ch: string): 0 | 1 | 2 {
  if (!ch || /\s/.test(ch)) return 0;
  return /[A-Za-z0-9_]/.test(ch) ? 1 : 2;
}

function stepForward(lines: readonly string[], row: number, col: number): { row: number; col: number } | null {
  const line = lines[row] ?? '';
  if (col + 1 < line.length) return { row, col: col + 1 };
  if (row + 1 < lines.length) return { row: row + 1, col: 0 };
  return null;
}

function stepBackward(lines: readonly string[], row: number, col: number): { row: number; col: number } | null {
  if (col > 0) return { row, col: col - 1 };
  if (row > 0) {
    const prevLen = (lines[row - 1] ?? '').length;
    return { row: row - 1, col: Math.max(0, prevLen - 1) };
  }
  return null;
}

function findWordTarget(
  lines: readonly string[],
  startRow: number,
  startCol: number,
  kind: 'w' | 'b' | 'e',
): { row: number; col: number } {
  let row = startRow;
  let col = startCol;
  const lineAt = (r: number) => lines[r] ?? '';
  if (kind === 'w') {
    const line = lineAt(row);
    const cls = charClass(line[col] ?? '');
    if (cls !== 0) {
      while (col < line.length && charClass(line[col] ?? '') === cls) col += 1;
    }
    while (row < lines.length) {
      const cur = lineAt(row);
      while (col < cur.length && /\s/.test(cur[col] ?? '')) col += 1;
      if (col < cur.length) return { row, col };
      if (row + 1 >= lines.length) return { row, col: Math.max(0, cur.length - 1) };
      row += 1;
      col = 0;
      if (lineAt(row).length === 0) return { row, col: 0 };
    }
    return { row, col: 0 };
  }
  if (kind === 'e') {
    const next = stepForward(lines, row, col);
    if (!next) return { row, col };
    row = next.row;
    col = next.col;
    while (row < lines.length && /\s/.test((lineAt(row)[col] ?? '') || ' ')) {
      const moved = stepForward(lines, row, col);
      if (!moved) return { row, col };
      row = moved.row;
      col = moved.col;
    }
    const line = lineAt(row);
    const cls = charClass(line[col] ?? '');
    while (col + 1 < line.length && charClass(line[col + 1] ?? '') === cls) col += 1;
    return { row, col };
  }
  const prev = stepBackward(lines, row, col);
  if (!prev) return { row: 0, col: 0 };
  row = prev.row;
  col = prev.col;
  while (/\s/.test((lineAt(row)[col] ?? '') || ' ') && (row > 0 || col > 0)) {
    const moved = stepBackward(lines, row, col);
    if (!moved) break;
    row = moved.row;
    col = moved.col;
    if (lineAt(row).length === 0) return { row, col: 0 };
  }
  const line = lineAt(row);
  const cls = charClass(line[col] ?? '');
  if (cls !== 0) {
    while (col > 0 && charClass(line[col - 1] ?? '') === cls) col -= 1;
  }
  return { row, col };
}

function findBracketMatch(lines: readonly string[], row: number, col: number): { row: number; col: number } | null {
  const pairs: Record<string, { mate: string; dir: 1 | -1 }> = {
    '(': { mate: ')', dir: 1 },
    ')': { mate: '(', dir: -1 },
    '[': { mate: ']', dir: 1 },
    ']': { mate: '[', dir: -1 },
    '{': { mate: '}', dir: 1 },
    '}': { mate: '{', dir: -1 },
  };
  const line = lines[row] ?? '';
  let c = col;
  if (!pairs[line[c] ?? '']) {
    for (let i = col; i < line.length; i += 1) {
      if (pairs[line[i] ?? '']) {
        c = i;
        break;
      }
    }
  }
  const open = line[c] ?? '';
  const spec = pairs[open];
  if (!spec) return null;
  let depth = 0;
  let r = row;
  let idx = c;
  while (r >= 0 && r < lines.length) {
    const ch = (lines[r] ?? '')[idx];
    if (ch === open) depth += 1;
    else if (ch === spec.mate) {
      depth -= 1;
      if (depth === 0) return { row: r, col: idx };
    }
    const moved = spec.dir === 1 ? stepForward(lines, r, idx) : stepBackward(lines, r, idx);
    if (!moved) break;
    r = moved.row;
    idx = moved.col;
  }
  return null;
}

export function findCharOnLine(
  line: string,
  col: number,
  ch: string,
  forward: boolean,
  till: boolean,
): number | null {
  if (forward) {
    for (let i = col + 1; i < line.length; i += 1) {
      if (line[i] === ch) return till ? Math.max(col, i - 1) : i;
    }
    return null;
  }
  for (let i = col - 1; i >= 0; i -= 1) {
    if (line[i] === ch) return till ? Math.min(line.length - 1, i + 1) : i;
  }
  return null;
}

export function findSearchMatch(
  lines: readonly string[],
  fromRow: number,
  fromCol: number,
  pattern: string,
  forward: boolean,
): { row: number; col: number } | null {
  if (!pattern) return null;
  const total = lines.length;
  if (total === 0) return null;
  if (forward) {
    for (let off = 0; off <= total; off += 1) {
      const r = (fromRow + off) % total;
      const line = lines[r] ?? '';
      const start = off === 0 ? fromCol + 1 : 0;
      const idx = line.indexOf(pattern, start);
      if (idx >= 0) return { row: r, col: idx };
    }
    const curIdx = (lines[fromRow] ?? '').indexOf(pattern, 0);
    return curIdx >= 0 ? { row: fromRow, col: curIdx } : null;
  }
  for (let off = 0; off <= total; off += 1) {
    const r = (fromRow - off + total) % total;
    const line = lines[r] ?? '';
    const limit = off === 0 ? fromCol - 1 : line.length;
    if (limit < 0) continue;
    const idx = line.lastIndexOf(pattern, limit);
    if (idx >= 0) return { row: r, col: idx };
  }
  const wrapIdx = (lines[fromRow] ?? '').lastIndexOf(pattern);
  return wrapIdx >= 0 ? { row: fromRow, col: wrapIdx } : null;
}

function firstNonBlankCol(line: string): number {
  const m = /\S/.exec(line);
  return m ? m.index : 0;
}

export function moveMotion(s: VimState, key: string, count: number): boolean {
  const times = Math.max(1, count);
  const line = () => s.lines[s.row] ?? '';
  switch (key) {
    case 'h':
    case '\x1b[D':
      s.col = Math.max(0, s.col - times);
      return true;
    case 'l':
    case '\x1b[C':
      s.col += times;
      clampCursor(s);
      return true;
    case 'j':
    case '\x1b[B':
      s.row = Math.min(s.lines.length - 1, s.row + times);
      clampCursor(s);
      return true;
    case 'k':
    case '\x1b[A':
      s.row = Math.max(0, s.row - times);
      clampCursor(s);
      return true;
    case '0':
    case '\x1b[H':
    case '\x1b[1~':
      s.col = 0;
      return true;
    case '^':
      s.col = firstNonBlankCol(line());
      return true;
    case '$':
    case '\x1b[F':
    case '\x1b[4~':
      s.row = Math.min(s.lines.length - 1, s.row + times - 1);
      s.col = Math.max(0, (s.lines[s.row] ?? '').length - 1);
      return true;
    case 'G':
      s.row = count > 0 ? Math.min(s.lines.length - 1, Math.max(0, count - 1)) : s.lines.length - 1;
      s.col = firstNonBlankCol(line());
      return true;
    case 'gg':
      s.row = count > 0 ? Math.min(s.lines.length - 1, Math.max(0, count - 1)) : 0;
      s.col = firstNonBlankCol(line());
      return true;
    case 'w':
    case 'b':
    case 'e': {
      for (let i = 0; i < times; i += 1) {
        const pos = findWordTarget(s.lines, s.row, s.col, key);
        s.row = pos.row;
        s.col = pos.col;
      }
      clampCursor(s);
      return true;
    }
    case '%': {
      const m = findBracketMatch(s.lines, s.row, s.col);
      if (m) {
        s.row = m.row;
        s.col = m.col;
      }
      return true;
    }
    case '\x1b[5~':
    case '\x15':
      s.row = Math.max(0, s.row - 10 * times);
      clampCursor(s);
      return true;
    case '\x1b[6~':
    case '\x04':
      s.row = Math.min(s.lines.length - 1, s.row + 10 * times);
      clampCursor(s);
      return true;
    default:
      return false;
  }
}

export function deleteSpan(
  s: VimState,
  r0: number,
  c0: number,
  r1: number,
  c1: number,
  linewise: boolean,
  yankOnly: boolean,
): void {
  const [sr, sc, er, ec] =
    r0 < r1 || (r0 === r1 && c0 <= c1) ? [r0, c0, r1, c1] : [r1, c1, r0, c0];
  if (linewise) {
    const slice = s.lines.slice(sr, er + 1);
    s.yankBuf = slice.join('\n');
    s.yankLinewise = true;
    if (yankOnly) return;
    pushUndo(s);
    s.lines.splice(sr, slice.length);
    if (s.lines.length === 0) s.lines = [''];
    s.row = Math.min(sr, s.lines.length - 1);
    s.col = firstNonBlankCol(s.lines[s.row] ?? '');
    s.dirty = true;
    clampCursor(s);
    return;
  }
  s.yankLinewise = false;
  if (sr === er) {
    const line = s.lines[sr] ?? '';
    const end = Math.min(line.length, ec + 1);
    s.yankBuf = line.slice(sc, end);
    if (yankOnly) return;
    pushUndo(s);
    s.lines[sr] = line.slice(0, sc) + line.slice(end);
    s.row = sr;
    s.col = sc;
    s.dirty = true;
    clampCursor(s);
    return;
  }
  const head = (s.lines[sr] ?? '').slice(0, sc);
  const tail = (s.lines[er] ?? '').slice(ec + 1);
  const mid = [
    (s.lines[sr] ?? '').slice(sc),
    ...s.lines.slice(sr + 1, er),
    (s.lines[er] ?? '').slice(0, ec + 1),
  ];
  s.yankBuf = mid.join('\n');
  if (yankOnly) return;
  pushUndo(s);
  s.lines.splice(sr, er - sr + 1, `${head}${tail}`);
  s.row = sr;
  s.col = sc;
  s.dirty = true;
  clampCursor(s);
}

export function indentLines(s: VimState, r0: number, r1: number, outdent: boolean): void {
  const lo = Math.max(0, Math.min(r0, r1));
  const hi = Math.min(s.lines.length - 1, Math.max(r0, r1));
  pushUndo(s);
  for (let r = lo; r <= hi; r += 1) {
    const line = s.lines[r] ?? '';
    s.lines[r] = outdent ? line.replace(/^ {1,2}|^\t/, '') : line.length > 0 ? `  ${line}` : line;
  }
  s.row = lo;
  s.col = firstNonBlankCol(s.lines[lo] ?? '');
  s.dirty = true;
  clampCursor(s);
}

export function pasteYank(s: VimState, before: boolean): void {
  if (!s.yankBuf && !s.yankLinewise) return;
  pushUndo(s);
  if (s.yankLinewise) {
    const chunk = s.yankBuf.split('\n');
    const at = before ? s.row : s.row + 1;
    s.lines.splice(at, 0, ...chunk);
    s.row = at;
    s.col = firstNonBlankCol(s.lines[s.row] ?? '');
    s.dirty = true;
    clampCursor(s);
    return;
  }
  const line = s.lines[s.row] ?? '';
  const at = before ? s.col : Math.min(line.length, s.col + 1);
  const parts = s.yankBuf.split('\n');
  if (parts.length === 1) {
    s.lines[s.row] = line.slice(0, at) + parts[0]! + line.slice(at);
    s.col = Math.max(0, at + parts[0]!.length - 1);
  } else {
    const last = parts[parts.length - 1]!;
    const merged = [
      line.slice(0, at) + parts[0]!,
      ...parts.slice(1, -1),
      last + line.slice(at),
    ];
    s.lines.splice(s.row, 1, ...merged);
    s.row += merged.length - 1;
    s.col = Math.max(0, last.length - 1);
  }
  s.dirty = true;
  clampCursor(s);
}

export function applyInsertChar(s: VimState, ch: string, replaceMode: boolean): void {
  const line = s.lines[s.row] ?? '';
  if (ch === '\r' || ch === '\n') {
    const before = line.slice(0, s.col);
    const after = line.slice(s.col);
    s.lines.splice(s.row, 1, before, after);
    s.row += 1;
    s.col = 0;
    s.dirty = true;
    return;
  }
  if (ch === '\x7f' || ch === '\b') {
    if (s.col > 0) {
      s.lines[s.row] = line.slice(0, s.col - 1) + line.slice(s.col);
      s.col -= 1;
      s.dirty = true;
    } else if (s.row > 0) {
      const prev = s.lines[s.row - 1] ?? '';
      s.lines.splice(s.row - 1, 2, `${prev}${line}`);
      s.row -= 1;
      s.col = prev.length;
      s.dirty = true;
    }
    return;
  }
  if (ch === '\t') ch = '  ';
  if (ch.length !== 1 && ch !== '  ') return;
  if (replaceMode && s.col < line.length && ch.length === 1) {
    s.lines[s.row] = line.slice(0, s.col) + ch + line.slice(s.col + 1);
  } else {
    s.lines[s.row] = line.slice(0, s.col) + ch + line.slice(s.col);
  }
  s.col += ch.length;
  s.dirty = true;
}

export function enterInsertAt(s: VimState, kind: 'i' | 'I' | 'a' | 'A' | 'o' | 'O' | 'R', skipUndo = false): void {
  if (!skipUndo) pushUndo(s);
  const line = s.lines[s.row] ?? '';
  if (kind === 'I') s.col = firstNonBlankCol(line);
  else if (kind === 'a') s.col = Math.min(line.length, s.col + (line.length > 0 ? 1 : 0));
  else if (kind === 'A') s.col = line.length;
  else if (kind === 'o') {
    s.lines.splice(s.row + 1, 0, '');
    s.row += 1;
    s.col = 0;
    s.dirty = true;
  } else if (kind === 'O') {
    s.lines.splice(s.row, 0, '');
    s.col = 0;
    s.dirty = true;
  }
  s.modeMachine.send(kind === 'R' ? 'ENTER_REPLACE' : 'ENTER_INSERT');
  s.insertCapture = { entryCmd: kind, typed: '' };
  s.status = kind === 'R' ? '-- REPLACE --' : '-- INSERT --';
  s.statusKind = 'info';
  clampCursor(s);
}

const INSERT_NAV_KEYS = new Set([
  '\x1b[A', '\x1b[B', '\x1b[C', '\x1b[D',
  '\x1b[H', '\x1b[1~', '\x1b[F', '\x1b[4~',
  '\x1b[5~', '\x1b[6~',
]);

export function stepInsertNav(s: VimState, key: string): boolean {
  if (key === '\x1b[3~') {
    const line = s.lines[s.row] ?? '';
    if (s.col < line.length) {
      s.lines[s.row] = line.slice(0, s.col) + line.slice(s.col + 1);
      s.dirty = true;
    } else if (s.row + 1 < s.lines.length) {
      s.lines.splice(s.row, 2, `${line}${s.lines[s.row + 1] ?? ''}`);
      s.dirty = true;
    }
    return true;
  }
  if (INSERT_NAV_KEYS.has(key)) {
    moveMotion(s, key, 1);
    if (key === '\x1b[F' || key === '\x1b[4~') s.col = (s.lines[s.row] ?? '').length;
    return true;
  }
  return key.startsWith('\x1b') && key.length > 1;
}

export function performOperatorMotion(s: VimState, op: 'd' | 'c' | 'y', motion: string, count: number): void {
  const times = Math.max(1, count);
  const startRow = s.row;
  const startCol = s.col;
  if (motion === op) {
    const endRow = Math.min(s.lines.length - 1, startRow + times - 1);
    const prevLen = s.lines.length;
    deleteSpan(s, startRow, 0, endRow, 0, true, op === 'y');
    if (op === 'c') {
      if (startRow > 0 || endRow < prevLen - 1) {
        const at = endRow === prevLen - 1 ? s.lines.length : startRow;
        s.lines.splice(at, 0, '');
        s.row = at;
      }
      s.col = 0;
      enterInsertAt(s, 'i', true);
    }
    return;
  }
  if (motion === 'w' || motion === 'e' || motion === 'b') {
    let r = startRow;
    let c = startCol;
    let stalled = false;
    let crossedOnLast = false;
    for (let i = 0; i < times; i += 1) {
      const target = findWordTarget(s.lines, r, c, motion);
      crossedOnLast = target.row > r;
      if (target.row === r && target.col === c) stalled = true;
      r = target.row;
      c = target.col;
    }
    if (motion === 'b') {
      if (r === startRow && c >= startCol) return;
      deleteSpan(s, r, c, startRow, startCol > 0 ? startCol - 1 : -1, false, op === 'y');
    } else {
      if (motion === 'w') {
        const ln = s.lines[r] ?? '';
        const atLast = r === s.lines.length - 1 && c === Math.max(0, ln.length - 1);
        const wordAtLast = atLast && c > 0 && /\S/.test(ln[c] ?? '')
          && (/\s/.test(ln[c - 1] ?? '') || /\w/.test(ln[c] ?? '') !== /\w/.test(ln[c - 1] ?? ''));
        if (!stalled && (!atLast || wordAtLast)) {
          if (crossedOnLast || (r > startRow && c === 0)) {
            r -= 1;
            c = Math.max(0, (s.lines[r] ?? '').length - 1);
          } else if (c > startCol || r > startRow) c -= 1;
        }
      }
      deleteSpan(s, startRow, startCol, r, c, false, op === 'y');
    }
  } else if (motion === '$') {
    const line = s.lines[startRow] ?? '';
    deleteSpan(s, startRow, startCol, startRow, Math.max(0, line.length - 1), false, op === 'y');
  } else if (motion === '0') {
    if (startCol > 0) deleteSpan(s, startRow, 0, startRow, startCol - 1, false, op === 'y');
  } else if (motion === 'G' || motion === 'gg') {
    const endRow = count > 0
      ? Math.min(s.lines.length - 1, Math.max(0, count - 1))
      : motion === 'gg' ? 0 : s.lines.length - 1;
    deleteSpan(s, startRow, 0, endRow, 0, true, op === 'y');
  } else {
    return;
  }
  if (op === 'c' && s.modeMachine.state === 'normal') {
    s.modeMachine.send('ENTER_INSERT');
    s.insertCapture = { entryCmd: 'i', typed: '' };
    s.status = '-- INSERT --';
    s.statusKind = 'info';
    clampCursor(s);
  }
}
