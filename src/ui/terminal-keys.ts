import {
  CLEAR, commitInputLine, drain, drawInput, enqueue, eraseInput, newPrompt, printAbove, redraw, setBuffer,
  type LineState,
} from './terminal-draw.js';

function wordStart(st: LineState, from: number): number {
  let i = from;
  while (i > 0 && st.buffer[i - 1] === ' ') i--;
  while (i > 0 && st.buffer[i - 1] !== ' ') i--;
  return i;
}

function wordEnd(st: LineState, from: number): number {
  let i = from;
  while (i < st.buffer.length && st.buffer[i] === ' ') i++;
  while (i < st.buffer.length && st.buffer[i] !== ' ') i++;
  return i;
}

function showMatches(st: LineState, matches: string[]): void {
  const cols = Math.max(20, st.term.cols);
  const width = Math.max(...matches.map((m) => m.length)) + 2;
  const perRow = Math.max(1, Math.floor(cols / width));
  const rows = Math.ceil(matches.length / perRow);
  const lines: string[] = [];
  // Column-major, like bash.
  for (let r = 0; r < rows; r++) {
    let row = '';
    for (let c = 0; c < perRow; c++) {
      const m = matches[c * rows + r];
      if (m !== undefined) row += m.padEnd(width);
    }
    lines.push(row.trimEnd());
  }
  printAbove(st, lines.join('\n'));
}

function complete(st: LineState): void {
  const before = st.buffer.slice(0, st.cursor);
  const after = st.buffer.slice(st.cursor);
  let done: { line: string; matches: string[] };
  try {
    done = st.hooks.complete(before);
  } catch (err) {
    console.error(err);
    return;
  }
  if (done.matches.length === 0) {
    st.term.write('\x07');
    return;
  }
  if (done.matches.length > 1 && done.line === before) showMatches(st, done.matches);
  let line = done.line;
  // A unique match that is not a directory gets a trailing space, like bash.
  if (done.matches.length === 1 && !line.endsWith('/') && !line.endsWith(' ') && !after.startsWith(' ')) line += ' ';
  setBuffer(st, line + after, line.length);
}

function historyMove(st: LineState, dir: -1 | 1): void {
  if (st.history.length === 0) return;
  if (dir < 0) {
    if (st.historyAt === -1) {
      st.draft = st.buffer;
      st.historyAt = st.history.length - 1;
    } else if (st.historyAt > 0) st.historyAt -= 1;
    else return;
    setBuffer(st, st.history[st.historyAt] ?? '');
    return;
  }
  if (st.historyAt === -1) return;
  if (st.historyAt < st.history.length - 1) {
    st.historyAt += 1;
    setBuffer(st, st.history[st.historyAt] ?? '');
  } else {
    st.historyAt = -1;
    setBuffer(st, st.draft);
  }
}

function strip(text: string): string {
  return text.replace(/\x1b\[20[01]~/g, '').replace(/\t/g, ' ').replace(/[\x00-\x1f\x7f]/g, '');
}

function insertText(st: LineState, data: string): void {
  if (data.startsWith('\x1b') && !data.startsWith('\x1b[200~')) {
    // Several keys in one chunk (key repeat, automation): split into single sequences.
    const keys = data.match(/\x1b\[[0-9;]*[A-Za-z~]|\x1bO[A-Za-z]|\x1b[bf]|[^\x1b]+/g);
    if (keys && keys.length > 1) keys.forEach((k) => handleKey(st, k));
    return;
  }
  // Paste (or fast typing) may hold several lines: each complete line runs, the tail stays in the input.
  if (/[\r\n]/.test(data)) {
    const parts = data.replace(/\x1b\[20[01]~/g, '').split(/\r\n|\r|\n/);
    const lines = [st.buffer.slice(0, st.cursor) + (parts[0] ?? ''), ...parts.slice(1, -1)];
    const tail = (parts[parts.length - 1] ?? '') + st.buffer.slice(st.cursor);
    st.buffer = '';
    st.cursor = 0;
    redraw(st);
    if (tail) st.pendingTail = strip(tail);
    // Queue every line first, then drain once, so the tail is restored only after the last line.
    for (const line of lines) st.queue.push({ line: strip(line), echoed: false, done: () => {} });
    drain(st);
    return;
  }
  const clean = strip(data);
  if (clean) setBuffer(st, st.buffer.slice(0, st.cursor) + clean + st.buffer.slice(st.cursor), st.cursor + clean.length);
}

export function handleKey(st: LineState, data: string): void {
  switch (data) {
    case '\r': {
      const line = st.buffer;
      commitInputLine(st);
      st.buffer = '';
      st.cursor = 0;
      void enqueue(st, line, true);
      return;
    }
    case '\x7f':
    case '\b':
      if (st.cursor > 0) setBuffer(st, st.buffer.slice(0, st.cursor - 1) + st.buffer.slice(st.cursor), st.cursor - 1);
      return;
    case '\x1b[3~':
    case '\x04':
      if (st.cursor < st.buffer.length) setBuffer(st, st.buffer.slice(0, st.cursor) + st.buffer.slice(st.cursor + 1), st.cursor);
      return;
    case '\t':
      complete(st);
      return;
    case '\x03':
      st.cursor = st.buffer.length;
      st.term.write(`${eraseInput(st)}${drawInput(st)}\x1b[0m^C\r\n`);
      st.promptShown = false;
      st.buffer = '';
      st.cursor = 0;
      st.historyAt = -1;
      newPrompt(st);
      return;
    case '\x0c':
      st.term.write(eraseInput(st) + CLEAR);
      st.promptShown = false;
      newPrompt(st);
      return;
    case '\x01':
    case '\x1b[H':
    case '\x1bOH':
    case '\x1b[1~':
      setBuffer(st, st.buffer, 0);
      return;
    case '\x05':
    case '\x1b[F':
    case '\x1bOF':
    case '\x1b[4~':
      setBuffer(st, st.buffer, st.buffer.length);
      return;
    case '\x15':
      setBuffer(st, st.buffer.slice(st.cursor), 0);
      return;
    case '\x0b':
      setBuffer(st, st.buffer.slice(0, st.cursor), st.cursor);
      return;
    case '\x17': {
      const from = wordStart(st, st.cursor);
      setBuffer(st, st.buffer.slice(0, from) + st.buffer.slice(st.cursor), from);
      return;
    }
    case '\x1b[D':
      if (st.cursor > 0) setBuffer(st, st.buffer, st.cursor - 1);
      return;
    case '\x1b[C':
      if (st.cursor < st.buffer.length) setBuffer(st, st.buffer, st.cursor + 1);
      return;
    case '\x1b[1;5D':
    case '\x1b[1;3D':
    case '\x1bb':
      setBuffer(st, st.buffer, wordStart(st, st.cursor));
      return;
    case '\x1b[1;5C':
    case '\x1b[1;3C':
    case '\x1bf':
      setBuffer(st, st.buffer, wordEnd(st, st.cursor));
      return;
    case '\x1b[A':
      historyMove(st, -1);
      return;
    case '\x1b[B':
      historyMove(st, 1);
      return;
    default:
      break;
  }
  insertText(st, data);
}
