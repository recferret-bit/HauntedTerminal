/**
 * The deck's keyboard: one element per key of `KEY_ROWS`. `press` / `release` take real
 * `KeyboardEvent.code`s, so the page's own keyboard drives it; a mouse press on a key works too.
 */
import { h } from '../../editor-core/dom.js';
import { deckKeyFor, KEY_ROWS } from '../domain/keyboard.js';

export interface KeyboardView {
  el: HTMLElement;
  /** Presses the deck key for a real key code; false when the deck has no such key or it is already down. */
  press(code: string): boolean;
  release(code: string): void;
  releaseAll(): void;
  pressed(): string[];
}

export function createKeyboard(onKey: (code: string, down: boolean) => void): KeyboardView {
  const keys = new Map<string, HTMLElement>();
  const down = new Set<string>();
  const rows = KEY_ROWS.map((row, i) =>
    h('div', { class: `lt-row${i === 0 ? ' fn' : ''}` }, ...row.map((k) => {
      const cap = h('span', { class: `lt-key${k.label.length > 1 ? ' word' : ''}`, 'data-code': k.code, style: `--w:${k.w}` }, h('i', {}, k.label));
      keys.set(k.code, cap);
      return cap;
    })),
  );
  const el = h('div', { class: 'lt-keys' }, ...rows);

  const view: KeyboardView = {
    el,
    press(code) {
      const deck = deckKeyFor(code);
      if (!deck || down.has(deck)) return false;
      down.add(deck);
      keys.get(deck)?.classList.add('down');
      onKey(deck, true);
      return true;
    },
    release(code) {
      const deck = deckKeyFor(code);
      if (!deck || !down.delete(deck)) return;
      keys.get(deck)?.classList.remove('down');
      onKey(deck, false);
    },
    releaseAll() {
      for (const code of [...down]) view.release(code);
    },
    pressed: () => [...down],
  };

  let capsTimer = 0;

  el.addEventListener('pointerdown', (ev) => {
    const code = (ev.target as HTMLElement).closest<HTMLElement>('.lt-key')?.dataset.code;
    if (!code) return;
    ev.preventDefault();
    if (code === 'CapsLock') {
      view.release('CapsLock');
      view.press('CapsLock');
      window.clearTimeout(capsTimer);
      capsTimer = window.setTimeout(() => view.release('CapsLock'), 120);
      return;
    }
    view.press(code);
    const up = (): void => { view.release(code); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointerup', up);
  });
  return view;
}
