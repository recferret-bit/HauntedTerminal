import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { createLineState, drain, enqueue, newPrompt, printAbove, type LineState } from './terminal-draw.js';
import { handleKey } from './terminal-keys.js';
import type { Shell, ShellHooks } from './terminal-types.js';

/**
 * The shell line editor on top of xterm.js: prompt, cursor editing, history, Tab completion, paste,
 * async output printed above the input line, and an input gate while the game is paused.
 * It knows nothing about the game; main.ts passes callbacks.
 */
export type { Shell, ShellHooks } from './terminal-types.js';
export { colourise } from './terminal-colour.js';

function openTerm(host: HTMLElement): { term: Terminal; fitAddon: FitAddon } {
  const term = new Terminal({
    cursorBlink: true,
    cursorStyle: 'block',
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
    fontSize: 13,
    lineHeight: 1.05,
    scrollback: 1000,
    allowProposedApi: false,
    theme: {
      background: '#07080a',
      foreground: '#f2f4f7',
      cursor: '#ff6a13',
      cursorAccent: '#07080a',
      selectionBackground: '#ff6a1344',
      black: '#07080a',
      brightYellow: '#ffd166',
      yellow: '#ff8a3d',
      cyan: '#5b8cff',
      brightCyan: '#7fd8ff',
      green: '#06d6a0',
      red: '#ef476f',
      brightRed: '#ff5c7a',
      magenta: '#9b5de5',
    },
  });
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(host);
  try { fitAddon.fit(); } catch { /* hidden host */ }
  return { term, fitAddon };
}

function shellApi(st: LineState, fitAddon: FitAddon): Shell {
  return {
    term: st.term,
    submit: (line: string) => enqueue(st, line),
    printAbove: (text: string) => printAbove(st, text),
    setBlocked(next: boolean) {
      if (next === st.blocked) return;
      st.blocked = next;
      if (!st.blocked) {
        drain(st);
        if (!st.promptShown && st.queue.length === 0) newPrompt(st);
      }
    },
    get blocked() {
      return st.blocked;
    },
    busy: () => st.blocked || st.queue.length > 0 || st.draining || st.typing,
    typeOut(text: string, ms: number) {
      const tokens = text.replace(/\r?\n/g, '\r\n').match(/\x1b\[[0-9;?]*[A-Za-z]|\r\n|[\s\S]/gu) ?? [];
      if (tokens.length === 0) return Promise.resolve();
      st.typing = true;
      const frames = Math.max(1, Math.round(ms / 16));
      const per = Math.max(1, Math.ceil(tokens.length / frames));
      let i = 0;
      return new Promise<void>((resolve) => {
        const step = () => {
          st.term.write(tokens.slice(i, i + per).join(''));
          i += per;
          if (i < tokens.length) window.setTimeout(step, 16);
          else {
            st.typing = false;
            resolve();
          }
        };
        step();
      });
    },
    reset(banner?: string) {
      st.term.reset();
      st.promptShown = false;
      st.cursorRow = 0;
      st.buffer = '';
      st.cursor = 0;
      st.historyAt = -1;
      st.queue.splice(0).forEach((item) => item.done());
      st.pendingTail = null;
      if (banner) st.term.write(banner.replace(/\r?\n/g, '\r\n') + '\r\n');
      if (!st.blocked) newPrompt(st);
    },
    fit() {
      try {
        fitAddon.fit();
      } catch { /* host hidden */ }
    },
    focus: () => st.term.focus(),
    blur: () => st.term.blur(),
  };
}

export function mountShell(host: HTMLElement, hooks: ShellHooks): Shell {
  const { term, fitAddon } = openTerm(host);
  const st = createLineState(term, hooks);
  term.onData((data) => {
    if (st.blocked) return;
    handleKey(st, data);
  });
  return shellApi(st, fitAddon);
}
