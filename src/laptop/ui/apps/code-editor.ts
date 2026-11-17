/**
 * A plain code editor for the laptop's apps: a textarea with a line-number gutter. Tab indents two
 * spaces, Shift+Tab outdents, Enter keeps the indent, Ctrl/Cmd+Enter runs.
 */
import { h } from '../../../editor-core/dom.js';

export interface CodeEditor {
  el: HTMLElement;
  value: string;
  focus(): void;
}

const INDENT = '  ';

/** Replaces the selection with `text` the way typing would, so undo still works. */
function typeText(area: HTMLTextAreaElement, text: string): void {
  area.focus();
  if (!document.execCommand('insertText', false, text)) area.setRangeText(text, area.selectionStart, area.selectionEnd, 'end');
}

function lineStart(text: string, at: number): number {
  return text.lastIndexOf('\n', at - 1) + 1;
}

function onKey(area: HTMLTextAreaElement, ev: KeyboardEvent, run: () => void): void {
  if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
    ev.preventDefault();
    run();
  } else if (ev.key === 'Tab' && ev.shiftKey) {
    ev.preventDefault();
    const start = lineStart(area.value, area.selectionStart);
    if (area.value.startsWith(INDENT, start)) {
      area.setSelectionRange(start, start + INDENT.length);
      typeText(area, '');
    }
  } else if (ev.key === 'Tab') {
    ev.preventDefault();
    typeText(area, INDENT);
  } else if (ev.key === 'Enter') {
    ev.preventDefault();
    const line = area.value.slice(lineStart(area.value, area.selectionStart), area.selectionStart);
    typeText(area, `\n${/^\s*/.exec(line)?.[0] ?? ''}`);
  }
}

export function createCodeEditor(opts: { label: string; onChange: (text: string) => void; onRun: () => void }): CodeEditor {
  const gutter = h('pre', { class: 'lt-gutter', 'aria-hidden': 'true' });
  const area = h('textarea', { class: 'lt-code', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': opts.label, wrap: 'off' });
  const el = h('div', { class: 'lt-editor' }, gutter, area);
  const numbers = (): void => {
    const n = area.value.split('\n').length;
    gutter.textContent = Array.from({ length: n }, (_, i) => String(i + 1)).join('\n');
    gutter.scrollTop = area.scrollTop;
  };
  area.addEventListener('input', () => { numbers(); opts.onChange(area.value); });
  area.addEventListener('scroll', () => { gutter.scrollTop = area.scrollTop; });
  area.addEventListener('keydown', (ev) => onKey(area, ev, opts.onRun));
  return {
    el,
    get value() { return area.value; },
    set value(text: string) { area.value = text; numbers(); },
    focus: () => area.focus(),
  };
}
