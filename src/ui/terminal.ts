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

const TERM_FONT = '"IBM Plex Mono", ui-monospace, monospace';

/**
 * The terminal opens before its web font may have arrived; xterm then measures the fallback font's cells, and the rows
 * stay the wrong height after IBM Plex Mono loads (seen by the visual audit: 16 rows in one run, 18 in another). Once the
 * font is in, set the family again so xterm measures it, and refit.
 */
function remeasureWhenFontLoads(term: Terminal, fitAddon: FitAddon): void {
  if (typeof document === 'undefined' || !document.fonts) return;
  void document.fonts.load(`${term.options.fontSize ?? 13}px "IBM Plex Mono"`).then(() => {
    term.options.fontFamily = `${TERM_FONT} `; // a changed value is what makes xterm measure again
    term.options.fontFamily = TERM_FONT;
    try { fitAddon.fit(); } catch { /* hidden host */ }
  }, () => { /* offline without the font: the fallback stays */ });
}

function openTerm(host: HTMLElement): { term: Terminal; fitAddon: FitAddon } {
  const term = new Terminal({
    cursorBlink: true,
    cursorStyle: 'block',
    fontFamily: TERM_FONT,
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
  if (term.textarea) {
    // Chrome flags form fields without id/name; the helper textarea is xterm's keyboard input.
    term.textarea.name = 'terminal-input';
    if (!term.textarea.id) term.textarea.id = 'terminal-input';
  }
  try { fitAddon.fit(); } catch { /* hidden host */ }
  remeasureWhenFontLoads(term, fitAddon);
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
      st.cancelType?.();
      const tokens = text.replace(/\r?\n/g, '\r\n').match(/\x1b\[[0-9;?]*[A-Za-z]|\r\n|[\s\S]/gu) ?? [];
      if (tokens.length === 0) return Promise.resolve();
      st.typing = true;
      const frames = Math.max(1, Math.round(ms / 16));
      const per = Math.max(1, Math.ceil(tokens.length / frames));
      let i = 0;
      return new Promise<void>((resolve) => {
        let timer = 0;
        let cancelled = false;
        st.cancelType = () => {
          cancelled = true;
          window.clearTimeout(timer);
          st.typing = false;
          st.cancelType = null;
          resolve();
        };
        const step = () => {
          if (cancelled) return;
          st.term.write(tokens.slice(i, i + per).join(''));
          i += per;
          if (i < tokens.length) timer = window.setTimeout(step, 16);
          else {
            st.typing = false;
            st.cancelType = null;
            resolve();
          }
        };
        step();
      });
    },
    reset(banner?: string) {
      st.cancelType?.();
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
