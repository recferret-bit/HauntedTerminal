import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import type { VimOpenPayload } from '../game/vim-types.js';
import { createLineState, drain, enqueue, newPrompt, printAbove, setBuffer, writeRunOutput, type LineState } from './terminal-draw.js';
import { handleKey } from './terminal-keys.js';
import type { Shell, ShellHooks } from './terminal-types.js';
import { mountTerminalVim, type VimController, type VimUiHooks } from './terminal-vim.js';

/**
 * The shell line editor on top of xterm.js: prompt, cursor editing, history, Tab completion, paste,
 * async output printed above the input line, and an input gate while the game is paused.
 * It knows nothing about the game; main.ts passes callbacks.
 */
export type { Shell, ShellHooks } from './terminal-types.js';
export { colourise } from './terminal-colour.js';

const TERM_FONT = '"IBM Plex Mono", ui-monospace, monospace';
const ESC = String.fromCharCode(0x1b);
const TYPE_TOKENS_RX = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]|\\r\\n|[\\s\\S]`, 'gu');

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

function syncInputTabStop(st: LineState, gate: { available: boolean; dialogLocked: boolean }): void {
  const ta = st.term.textarea;
  if (!ta) return;
  const interactive = gate.available && !gate.dialogLocked && !st.blocked;
  ta.tabIndex = interactive ? 0 : -1;
  ta.setAttribute('aria-disabled', String(!interactive));
  if (!interactive && typeof document !== 'undefined' && document.activeElement === ta) {
    st.term.blur();
  }
}

function runTypeOut(st: LineState, text: string, ms: number): Promise<void> {
  st.cancelType?.();
  const tokens = text.replace(/\r?\n/g, '\r\n').match(TYPE_TOKENS_RX) ?? [];
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
}

interface ShellGate {
  available: boolean;
  dialogLocked: boolean;
  activeVim: VimController | null;
  pendingAbove: string[];
  inRun: boolean;
  deferredVim: { payload: VimOpenPayload; hooks: VimUiHooks } | null;
  st: LineState | null;
}

function mountVimNow(st: LineState, gate: ShellGate, payload: VimOpenPayload, hooks: VimUiHooks): void {
  gate.activeVim?.close();
  gate.activeVim = mountTerminalVim(st.term, payload, {
    onSave: hooks.onSave,
    onRead: hooks.onRead,
    onExit(pendingOutput) {
      gate.activeVim = null;
      const buffered = gate.pendingAbove.splice(0);
      for (const line of buffered) printAbove(st, line);
      hooks.onExit(pendingOutput);
      if (!st.blocked && !st.promptShown) newPrompt(st);
      if (!st.blocked) drain(st);
    },
  });
}

function shellApi(
  st: LineState,
  fitAddon: FitAddon,
  panel: HTMLElement,
  gate: ShellGate,
): Shell {
  syncInputTabStop(st, gate);
  return {
    term: st.term,
    submit: (line: string) => enqueue(st, line),
    printAbove: (text: string) => {
      if (gate.activeVim) {
        if (text) gate.pendingAbove.push(text);
        return;
      }
      printAbove(st, text);
    },
    setBlocked(next: boolean) {
      if (next === st.blocked) return;
      st.blocked = next;
      syncInputTabStop(st, gate);
      if (!st.blocked && !gate.activeVim) {
        drain(st);
        if (!st.promptShown && st.queue.length === 0) newPrompt(st);
      }
    },
    get blocked() {
      return st.blocked;
    },
    busy: () => st.blocked || st.queue.length > 0 || st.draining || st.typing || gate.activeVim !== null,
    typeOut: (text: string, ms: number) => runTypeOut(st, text, ms),
    reset(banner?: string) {
      gate.activeVim?.close();
      gate.activeVim = null;
      gate.deferredVim = null;
      gate.pendingAbove.length = 0;
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
    setInput(text: string) {
      if (gate.dialogLocked) return;
      if (!st.blocked && !gate.activeVim && st.queue.length === 0 && !st.draining) {
        if (!st.promptShown) newPrompt(st);
        setBuffer(st, text);
      } else {
        st.pendingTail = text;
      }
    },
    fit() {
      try {
        fitAddon.fit();
        gate.activeVim?.render();
      } catch { /* host hidden */ }
    },
    openVim(payload, hooks) {
      if (gate.inRun) {
        gate.deferredVim = { payload, hooks };
        return;
      }
      mountVimNow(st, gate, payload, hooks);
    },
    isVimOpen() {
      return gate.activeVim !== null;
    },
    setAvailable(on: boolean, pop = true) {
      if (on === gate.available) return;
      gate.available = on;
      panel.classList.toggle('tty-unavailable', !on);
      syncInputTabStop(st, gate);
      if (!on) {
        st.term.blur();
        return;
      }
      if (pop) {
        panel.classList.remove('tty-popin');
        void panel.offsetWidth;
        panel.classList.add('tty-popin');
      }
      try { fitAddon.fit(); } catch { /* host hidden */ }
      if (!gate.dialogLocked && !st.blocked) st.term.focus();
    },
    get available() {
      return gate.available;
    },
    setDialogLocked(on: boolean) {
      if (on === gate.dialogLocked) return;
      gate.dialogLocked = on;
      panel.classList.toggle('tty-dialog-locked', on);
      syncInputTabStop(st, gate);
      if (on) st.term.blur();
      else if (gate.available && !st.blocked) st.term.focus();
    },
    get dialogLocked() {
      return gate.dialogLocked;
    },
    focus: () => {
      if (gate.available && !gate.dialogLocked && !st.blocked) st.term.focus();
    },
    blur: () => st.term.blur(),
  };
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock']);

export function mountShell(host: HTMLElement, hooks: ShellHooks): Shell {
  const { term, fitAddon } = openTerm(host);
  const gate: ShellGate = {
    available: true,
    dialogLocked: false,
    activeVim: null,
    pendingAbove: [],
    inRun: false,
    deferredVim: null,
    st: null,
  };
  const wrappedHooks: ShellHooks = {
    ...hooks,
    run(line) {
      gate.inRun = true;
      gate.deferredVim = null;
      try {
        const res = hooks.run(line);
        const req = (gate as ShellGate).deferredVim;
        if (req && gate.st) {
          gate.deferredVim = null;
          writeRunOutput(gate.st, res);
          mountVimNow(gate.st, gate, req.payload, req.hooks);
          return { output: '' };
        }
        return res;
      } finally {
        gate.inRun = false;
      }
    },
  };
  const st = createLineState(term, wrappedHooks);
  gate.st = st;
  st.isModalOpen = () => gate.activeVim !== null;
  const panel = host.closest<HTMLElement>('#terminal-bezel') ?? host;
  if (!panel.querySelector('.tty-dialog-lock-note')) {
    const lockNote = document.createElement('div');
    lockNote.className = 'tty-dialog-lock-note';
    lockNote.textContent = 'CONVERSATION IN PROGRESS — Finish listening or click "Skip Dialog »" on stage to unlock terminal';
    panel.appendChild(lockNote);
  }
  let keyRepeat = false;
  term.attachCustomKeyEventHandler((ev) => {
    // Track keydown/keyup repeat; skip keypress so WebKit's keypress.repeat=false never masks a held key.
    if (!MODIFIER_KEYS.has(ev.key)) {
      if (ev.type === 'keydown') keyRepeat = ev.repeat;
      else if (ev.type === 'keyup') keyRepeat = false;
    }
    return true;
  });
  if (term.textarea) {
    const clearRepeat = (): void => { keyRepeat = false; };
    term.textarea.addEventListener('blur', clearRepeat);
    term.textarea.addEventListener('paste', clearRepeat);
  }
  term.onData((data) => {
    if (st.blocked || !gate.available || gate.dialogLocked) return;
    if (gate.activeVim) {
      gate.activeVim.onData(data);
      return;
    }
    handleKey(st, data, keyRepeat);
  });
  return shellApi(st, fitAddon, panel, gate);
}
