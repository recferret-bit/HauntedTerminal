import type { Terminal } from '@xterm/xterm';
import { createVimState, stepVimKey } from '../game/vim.js';
import type { VimIo, VimOpenPayload, VimState } from '../game/vim-types.js';

export interface VimUiHooks {
  onSave(path: string, content: string): { ok: true; message?: string } | { ok: false; error: string };
  onRead?(path: string): { ok: true; content: string; exists: boolean } | { ok: false; error: string };
  onExit(pendingOutput?: string): void;
}

export interface VimController {
  onData(data: string): void;
  render(): void;
  close(): void;
}

const ESC = String.fromCharCode(0x1b);
const BRACKETED_PASTE_RX = new RegExp(`${ESC}\\[20[01]~`, 'g');
const VIM_TOKEN_RX = new RegExp(`${ESC}\\[[0-9;]*[A-Za-z~]|${ESC}O[A-Za-z]|${ESC}|[\\s\\S]`, 'gu');

function tokenizeVimInput(data: string): string[] {
  const clean = data.replace(BRACKETED_PASTE_RX, '');
  return clean.match(VIM_TOKEN_RX) ?? [];
}

function visualBounds(s: VimState): { sr: number; sc: number; er: number; ec: number; linewise: boolean } | null {
  const mode = s.modeMachine.state;
  if ((mode !== 'visual' && mode !== 'visual-line') || !s.visualAnchor) return null;
  const a = s.visualAnchor;
  const forward = a.row < s.row || (a.row === s.row && a.col <= s.col);
  return {
    sr: forward ? a.row : s.row,
    sc: forward ? a.col : s.col,
    er: forward ? s.row : a.row,
    ec: forward ? s.col : a.col,
    linewise: mode === 'visual-line',
  };
}

function isCellSelected(
  row: number,
  col: number,
  vis: { sr: number; sc: number; er: number; ec: number; linewise: boolean } | null,
): boolean {
  if (!vis || row < vis.sr || row > vis.er) return false;
  if (vis.linewise) return true;
  if (vis.sr === vis.er) return col >= vis.sc && col <= vis.ec;
  if (row === vis.sr) return col >= vis.sc;
  if (row === vis.er) return col <= vis.ec;
  return true;
}

function renderLineSegment(
  line: string,
  row: number,
  colStart: number,
  width: number,
  vis: { sr: number; sc: number; er: number; ec: number; linewise: boolean } | null,
  searchPattern: string,
): string {
  const sliceEnd = Math.min(line.length, colStart + width);
  const pat = searchPattern;
  const matchSet = new Set<number>();
  if (pat) {
    let from = Math.max(0, colStart - pat.length);
    while (from < sliceEnd) {
      const idx = line.indexOf(pat, from);
      if (idx < 0 || idx >= sliceEnd) break;
      for (let k = idx; k < idx + pat.length; k += 1) matchSet.add(k);
      from = idx + Math.max(1, pat.length);
    }
  }
  let out = '';
  for (let c = colStart; c < sliceEnd; c += 1) {
    const ch = line[c] ?? ' ';
    if (isCellSelected(row, c, vis)) out += `\x1b[7m${ch}\x1b[27m`;
    else if (matchSet.has(c)) out += `\x1b[30;43m${ch}\x1b[0m`;
    else out += ch;
  }
  return out;
}

function modeBadge(mode: VimState['modeMachine']['state']): string {
  switch (mode) {
    case 'insert':
      return ' INSERT ';
    case 'replace':
      return ' REPLACE ';
    case 'visual':
      return ' VISUAL ';
    case 'visual-line':
      return ' V-LINE ';
    case 'command':
      return ' COMMAND ';
    case 'search':
      return ' SEARCH ';
    default:
      return ' NORMAL ';
  }
}

export function mountTerminalVim(term: Terminal, payload: VimOpenPayload, hooks: VimUiHooks): VimController {
  const state = createVimState(payload);
  const savedOutputs: string[] = [];
  let closed = false;

  const io: VimIo = {
    read(path) {
      if (hooks.onRead) return hooks.onRead(path);
      return { ok: false, error: `${path}: reload unavailable` };
    },
    write(path, content) {
      const res = hooks.onSave(path, content);
      if (res.ok && res.message) savedOutputs.push(res.message.replace(/\n+$/, ''));
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    },
  };

  let scrollCol = 0;

  const render = (): void => {
    if (closed) return;
    const rows = Math.max(4, term.rows);
    const cols = Math.max(20, term.cols);
    const textRows = Math.max(1, rows - 2);
    if (state.row < state.scrollRow) state.scrollRow = state.row;
    if (state.row >= state.scrollRow + textRows) state.scrollRow = state.row - textRows + 1;

    const gutterWidth = state.showNumbers ? Math.max(4, String(state.lines.length).length + 2) : 0;
    const textWidth = Math.max(8, cols - gutterWidth);
    if (state.col < scrollCol) scrollCol = state.col;
    if (state.col >= scrollCol + textWidth) scrollCol = state.col - textWidth + 1;

    const vis = visualBounds(state);
    const pat = state.searchHighlight ? state.searchPattern : '';
    let buf = '\x1b[?25l\x1b[H';

    for (let r = 0; r < textRows; r += 1) {
      const lineIdx = state.scrollRow + r;
      buf += `\x1b[${r + 1};1H\x1b[2K`;
      if (lineIdx < state.lines.length) {
        if (gutterWidth > 0) {
          const numStr = String(lineIdx + 1).padStart(gutterWidth - 2, ' ');
          const activeLine = lineIdx === state.row;
          buf += `${activeLine ? '\x1b[1;33m' : '\x1b[2;33m'}${numStr} \x1b[0m `;
        }
        buf += renderLineSegment(state.lines[lineIdx] ?? '', lineIdx, scrollCol, textWidth, vis, pat);
      } else {
        buf += '\x1b[36m~\x1b[0m';
      }
    }

    const mode = state.modeMachine.state;
    const fileLabel = `${state.path || '[No Name]'}${state.dirty ? ' [+]' : ''}${state.readOnly ? ' [RO]' : ''}`;
    const posLabel = `Ln ${state.row + 1}/${state.lines.length}, Col ${state.col + 1}`;
    const badge = modeBadge(mode);
    const midSpace = Math.max(1, cols - badge.length - fileLabel.length - posLabel.length - 3);
    const statusBar = `${badge} ${fileLabel}${' '.repeat(midSpace)}${posLabel} `.slice(0, cols).padEnd(cols, ' ');
    buf += `\x1b[${rows - 1};1H\x1b[2K\x1b[1;30;48;5;208m${statusBar}\x1b[0m`;

    buf += `\x1b[${rows};1H\x1b[2K`;
    let curRow = state.row - state.scrollRow + 1;
    let curCol = gutterWidth + (state.col - scrollCol) + 1;
    if (mode === 'command' || mode === 'search') {
      const prefix = mode === 'command' ? ':' : state.searchForward ? '/' : '?';
      const line = `${prefix}${mode === 'command' ? state.exBuf : state.searchBuf}`.slice(0, cols);
      buf += line;
      curRow = rows;
      curCol = Math.min(cols, line.length + 1);
    } else if (state.status) {
      const colCode = state.statusKind === 'error' ? '\x1b[1;91m' : '\x1b[36m';
      buf += `${colCode}${state.status.slice(0, cols)}\x1b[0m`;
    }

    buf += `\x1b[${Math.max(1, curRow)};${Math.max(1, curCol)}H\x1b[?25h`;
    term.write(buf);
  };

  const close = (): void => {
    if (closed) return;
    closed = true;
    term.write('\x1b[?1049l\x1b[?25h');
  };

  term.write('\x1b[?1049h\x1b[?25h');
  render();

  return {
    render,
    close,
    onData(data: string) {
      if (closed) return;
      for (const tok of tokenizeVimInput(data)) {
        const res = stepVimKey(state, tok, io);
        if (res.outcome === 'quit' || res.outcome === 'saved-quit') {
          close();
          hooks.onExit(savedOutputs.length > 0 ? savedOutputs.join('\n') : undefined);
          return;
        }
      }
      render();
    },
  };
}
