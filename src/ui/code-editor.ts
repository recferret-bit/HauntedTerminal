import type { EditorOpenPayload } from '../chapters/chapter-session.js';
import type { LevelPatchChip } from '../chapters/types.js';
import { escHtml } from '../renderer/html-escape.js';

export interface CodeEditorHandlers {
  onSave(fileName: string, content: string): void;
  onClose(): void;
  onLayoutChange(): void;
}

export interface CodeEditor {
  open(payload: EditorOpenPayload): void;
  close(): void;
  isOpen(): boolean;
}

const EDITOR_HTML = `
    <div class="ce-bar">
      <div class="ce-title">
        <span class="ce-dot"></span>
        <span id="ce-filename">EDIT // file</span>
        <small id="ce-status"></small>
      </div>
      <div class="ce-actions">
        <button type="button" id="ce-save" class="ce-btn ce-btn-save" title="Save & Apply (Ctrl+S / Cmd+S)">SAVE &amp; APPLY</button>
        <button type="button" id="ce-close" class="ce-btn" title="Close Editor (Esc)">CLOSE</button>
      </div>
    </div>
    <div id="ce-chips" class="ce-chips hidden"></div>
    <div class="ce-body">
      <pre id="ce-gutter" class="ce-gutter" aria-hidden="true">1</pre>
      <textarea id="ce-textarea" class="ce-textarea" spellcheck="false" autocomplete="off" autocapitalize="off"></textarea>
    </div>
  `;

interface EditorState {
  handlers: CodeEditorHandlers;
  fileEl: HTMLElement;
  statusEl: HTMLElement;
  chipsEl: HTMLElement;
  gutterEl: HTMLElement;
  area: HTMLTextAreaElement;
  currentName: string;
  currentPatches: LevelPatchChip[];
  opened: boolean;
}

function syncGutter(st: EditorState): void {
  const count = Math.max(1, st.area.value.split('\n').length);
  st.gutterEl.textContent = Array.from({ length: count }, (_, i) => String(i + 1)).join('\n');
}

function triggerSave(st: EditorState, badge = 'SAVED'): void {
  if (!st.opened || !st.currentName) return;
  st.handlers.onSave(st.currentName, st.area.value);
  st.statusEl.textContent = badge;
  st.statusEl.classList.add('flash');
  window.setTimeout(() => st.statusEl.classList.remove('flash'), 1400);
  renderChips(st);
}

function renderChips(st: EditorState): void {
  if (st.currentPatches.length === 0) {
    st.chipsEl.classList.add('hidden');
    st.chipsEl.innerHTML = '';
    return;
  }
  st.chipsEl.classList.remove('hidden');
  st.chipsEl.innerHTML =
    `<span class="ce-chip-k">QUICK PATCHES:</span>` +
    st.currentPatches
      .map((chip, idx) => {
        const applied = !st.area.value.includes(chip.find) && st.area.value.includes(chip.replace);
        return `<button type="button" class="ce-chip ${applied ? 'applied' : ''}" data-idx="${idx}">${applied ? '✓ ' : '+ '}${escHtml(chip.label)}</button>`;
      })
      .join('');

  st.chipsEl.querySelectorAll<HTMLButtonElement>('.ce-chip').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.idx ?? '-1');
      const chip = st.currentPatches[idx];
      if (!chip) return;
      if (st.area.value.includes(chip.find)) {
        const prevScroll = st.area.scrollTop;
        const matchIdx = st.area.value.indexOf(chip.find);
        st.area.value = st.area.value.replace(chip.find, chip.replace);
        syncGutter(st);
        renderChips(st);
        const caret = Math.max(0, matchIdx);
        st.area.setSelectionRange(caret, caret);
        st.area.scrollTop = prevScroll;
        st.gutterEl.scrollTop = prevScroll;
        triggerSave(st, 'PATCH APPLIED');
      }
    };
  });
}

function openEditor(st: EditorState, pane: HTMLElement, dock: HTMLElement, payload: EditorOpenPayload): void {
  st.opened = true;
  st.currentName = payload.name;
  st.currentPatches = payload.patches;
  st.fileEl.textContent = `EDIT // ${payload.name}`;
  st.statusEl.textContent = 'Ctrl+S saves';
  pane.classList.remove('hidden');
  dock.classList.add('editor-open');
  st.area.value = payload.content;
  syncGutter(st);
  renderChips(st);
  st.area.setSelectionRange(0, 0);
  st.area.scrollTop = 0;
  st.gutterEl.scrollTop = 0;
  st.handlers.onLayoutChange();
  window.requestAnimationFrame(() => {
    st.area.focus({ preventScroll: true });
    st.area.setSelectionRange(0, 0);
    st.area.scrollTop = 0;
    st.gutterEl.scrollTop = 0;
  });
}

function bindEditor(st: EditorState, pane: HTMLElement, dock: HTMLElement): void {
  pane.querySelector<HTMLButtonElement>('#ce-save')!.onclick = () => triggerSave(st, 'SAVED');
  pane.querySelector<HTMLButtonElement>('#ce-close')!.onclick = () => closeEditorPane(st, pane, dock);
  st.area.addEventListener('input', () => {
    st.statusEl.textContent = 'UNSAVED *';
    syncGutter(st);
    renderChips(st);
  });
  st.area.addEventListener('scroll', () => {
    st.gutterEl.scrollTop = st.area.scrollTop;
  });
  st.area.addEventListener('keydown', (e) => onEditorKey(st, pane, dock, e));
}

function closeEditorPane(st: EditorState, pane: HTMLElement, dock: HTMLElement): void {
  if (!st.opened) return;
  st.opened = false;
  pane.classList.add('hidden');
  dock.classList.remove('editor-open');
  st.handlers.onLayoutChange();
  st.handlers.onClose();
}

function onEditorKey(st: EditorState, pane: HTMLElement, dock: HTMLElement, e: KeyboardEvent): void {
  const area = st.area;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    e.stopPropagation();
    triggerSave(st, 'SAVED');
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeEditorPane(st, pane, dock);
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = area.selectionStart;
    const end = area.selectionEnd;
    area.value = `${area.value.slice(0, start)}  ${area.value.slice(end)}`;
    area.selectionStart = area.selectionEnd = start + 2;
    syncGutter(st);
  }
}

export function mountCodeEditor(
  pane: HTMLElement,
  dock: HTMLElement,
  handlers: CodeEditorHandlers,
): CodeEditor {
  pane.innerHTML = EDITOR_HTML;
  const st: EditorState = {
    handlers,
    fileEl: pane.querySelector<HTMLElement>('#ce-filename')!,
    statusEl: pane.querySelector<HTMLElement>('#ce-status')!,
    chipsEl: pane.querySelector<HTMLElement>('#ce-chips')!,
    gutterEl: pane.querySelector<HTMLElement>('#ce-gutter')!,
    area: pane.querySelector<HTMLTextAreaElement>('#ce-textarea')!,
    currentName: '',
    currentPatches: [],
    opened: false,
  };
  bindEditor(st, pane, dock);
  return {
    open: (payload) => openEditor(st, pane, dock, payload),
    close: () => closeEditorPane(st, pane, dock),
    isOpen: () => st.opened,
  };
}
