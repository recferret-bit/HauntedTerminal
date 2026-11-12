import type { Terminal } from '@xterm/xterm';
import { colourise } from './terminal-colour.js';
import type { ShellHooks } from './terminal-types.js';

const PROMPT_HOST = 'dev@haunted';
/** Clear screen + scrollback in the write stream (term.clear() is immediate and would race buffered writes). */
export const CLEAR = '\x1b[2J\x1b[3J\x1b[H';

export interface LineState {
  term: Terminal;
  hooks: ShellHooks;
  buffer: string;
  cursor: number;
  cursorRow: number;
  promptShown: boolean;
  blocked: boolean;
  history: string[];
  historyAt: number;
  draft: string;
  queue: Array<{ line: string; echoed: boolean; done: () => void }>;
  draining: boolean;
  pendingTail: string | null;
  typing: boolean;
}

/** Visible width of a string (ANSI stripped, every code point is one cell). */
function visibleLength(s: string): number {
  return [...s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')].length;
}

export function createLineState(term: Terminal, hooks: ShellHooks): LineState {
  return {
    term,
    hooks,
    buffer: '',
    cursor: 0,
    cursorRow: 0,
    promptShown: false,
    blocked: false,
    history: [],
    historyAt: -1,
    draft: '',
    queue: [],
    draining: false,
    pendingTail: null,
    typing: false,
  };
}

function promptText(st: LineState): { text: string; width: number } {
  const p = st.hooks.prompt();
  const colour = p.gold ? '\x1b[1;93m' : '\x1b[1;38;5;208m';
  const text = `${colour}${PROMPT_HOST}\x1b[0m:\x1b[1;96m${p.cwd}\x1b[0m${p.gold ? '\x1b[1;93m$\x1b[0m' : '$'} `;
  return { text, width: visibleLength(`${PROMPT_HOST}:${p.cwd}$ `) };
}

/** Move the cursor back to the start of the prompt and erase everything below. */
export function eraseInput(st: LineState): string {
  if (!st.promptShown) return '';
  return `${st.cursorRow > 0 ? `\x1b[${st.cursorRow}A` : ''}\r\x1b[J`;
}

/** Draw prompt + buffer from the current position (column 0) and place the cursor at `cursor`. */
export function drawInput(st: LineState): string {
  const cols = Math.max(1, st.term.cols);
  const p = promptText(st);
  let out = p.text + st.buffer;
  const end = p.width + [...st.buffer].length;
  // At the exact right edge xterm holds a pending wrap: force it so the row maths stay true.
  if (end > 0 && end % cols === 0) out += ' \r';
  const endRow = Math.floor(end / cols);
  const target = p.width + [...st.buffer.slice(0, st.cursor)].length;
  const tRow = Math.floor(target / cols);
  const tCol = target % cols;
  if (endRow > tRow) out += `\x1b[${endRow - tRow}A`;
  out += '\r';
  if (tCol > 0) out += `\x1b[${tCol}C`;
  st.cursorRow = tRow;
  st.promptShown = true;
  return out;
}

export function redraw(st: LineState): void {
  st.term.write(eraseInput(st) + drawInput(st));
}

export function newPrompt(st: LineState): void {
  st.cursorRow = 0;
  st.promptShown = false;
  st.term.write(drawInput(st));
}

export function printAbove(st: LineState, text: string): void {
  if (!text) return;
  let body = text.replace(/\r?\n/g, '\r\n');
  if (!body.endsWith('\r\n')) body += '\r\n';
  if (st.promptShown) st.term.write(eraseInput(st) + body + drawInput(st));
  else st.term.write(body);
}

/** Leave the input line (cursor to end of input, newline), so output can follow. */
export function commitInputLine(st: LineState): void {
  if (!st.promptShown) return;
  st.cursor = st.buffer.length;
  st.term.write(`${eraseInput(st)}${drawInput(st)}\r\n`);
  st.promptShown = false;
  st.cursorRow = 0;
}

/** Run one line. `echoed`: the Enter handler already left it on screen. */
export function runLine(st: LineState, line: string, echoed: boolean): void {
  if (!echoed) {
    st.buffer = line;
    st.cursor = line.length;
    if (st.promptShown) redraw(st);
    else newPrompt(st);
    commitInputLine(st);
  }
  st.buffer = '';
  st.cursor = 0;
  if (line.trim() && st.history[st.history.length - 1] !== line) st.history.push(line);
  if (st.history.length > 500) st.history.shift();
  st.historyAt = -1;
  st.draft = '';
  let res: { output: string; clear?: boolean; stderr?: string };
  try {
    res = st.hooks.run(line);
  } catch (err) {
    console.error(err);
    res = { output: `\x1b[1;31mkernel: ${(err as Error).message}\x1b[0m\n` };
  }
  if (res.clear) st.term.write(CLEAR);
  if (res.output) {
    let body = colourise(res.output, res.stderr).replace(/\r?\n/g, '\r\n');
    if (!body.endsWith('\r\n')) body += '\r\n';
    st.term.write(body);
  }
  if (!st.blocked && !st.promptShown) newPrompt(st);
}

export function drain(st: LineState): void {
  if (st.draining) return;
  st.draining = true;
  try {
    while (!st.blocked && st.queue.length > 0) {
      const next = st.queue.shift()!;
      runLine(st, next.line, next.echoed);
      next.done();
    }
  } finally {
    st.draining = false;
  }
  if (!st.blocked && st.queue.length === 0 && st.pendingTail !== null) {
    const tail = st.pendingTail;
    st.pendingTail = null;
    if (!st.promptShown) newPrompt(st);
    setBuffer(st, tail);
  }
}

export function enqueue(st: LineState, line: string, echoed = false): Promise<void> {
  return new Promise((resolve) => {
    st.queue.push({ line, echoed, done: resolve });
    drain(st);
  });
}

export function setBuffer(st: LineState, next: string, at = next.length): void {
  st.buffer = next;
  st.cursor = Math.max(0, Math.min(next.length, at));
  redraw(st);
}
