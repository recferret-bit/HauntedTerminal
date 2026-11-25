import { el } from './dom-lite.js';

export interface BookActions {
  canInsert: boolean;
  onInsert(command: string): void;
  onNavigatePage(pageIndex: number): void;
  onJumpCommand(command: string): void;
  onNotify?(message: string): void;
}

export function btn(
  label: string,
  className: string,
  onClick: (ev: MouseEvent) => void,
  title?: string,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

function buildMatchedFragment(
  text: string,
  rx: RegExp,
  onPlain: (chunk: string) => Node | string,
  onMatch: (match: RegExpMatchArray) => Node,
): DocumentFragment {
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of text.matchAll(rx)) {
    const idx = m.index ?? 0;
    if (idx > last) frag.append(onPlain(text.slice(last, idx)));
    frag.append(onMatch(m));
    last = idx + m[0].length;
  }
  if (last < text.length) frag.append(onPlain(text.slice(last)));
  return frag;
}

/** Build text with safe `<mark>` spans for matched search tokens (never innerHTML). */
export function highlightedFragment(text: string, tokens: readonly string[]): DocumentFragment {
  const clean = tokens.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) {
    const frag = document.createDocumentFragment();
    frag.append(text);
    return frag;
  }
  const escaped = clean.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return buildMatchedFragment(
    text,
    new RegExp(`(${escaped.join('|')})`, 'gi'),
    (chunk) => chunk,
    (m) => {
      const mark = document.createElement('mark');
      mark.className = 'mb-mark';
      mark.textContent = m[0];
      return mark;
    },
  );
}

/** Parse inline backtick spans safely into `<code>` elements while preserving search `<mark>` highlights. */
export function inlineCodeFragment(text: string, tokens: readonly string[] = []): DocumentFragment {
  if (!text.includes('`')) return highlightedFragment(text, tokens);
  return buildMatchedFragment(
    text,
    /`([^`]+)`/g,
    (chunk) => highlightedFragment(chunk, tokens),
    (m) => {
      const code = document.createElement('code');
      code.className = 'mb-inline-code';
      code.append(highlightedFragment(m[1] ?? '', tokens));
      return code;
    },
  );
}

export async function copyCommandText(text: string, trigger: HTMLButtonElement, onNotify?: (msg: string) => void): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  } catch {
    // Clipboard may be blocked in headless or restricted contexts; still update button label cleanly.
  }
  const prev = trigger.textContent ?? 'Copy';
  trigger.textContent = 'Copied!';
  trigger.classList.add('copied');
  onNotify?.(`Copied: ${text}`);
  window.setTimeout(() => {
    trigger.textContent = prev;
    trigger.classList.remove('copied');
  }, 1100);
}

/** Command pill row with Copy and optional in-game Insert button. */
export function commandBar(command: string, actions: BookActions, compact = false): HTMLElement {
  const code = el('code', 'mb-cmd-code', [command]);
  const copyBtn = btn('Copy', 'mb-mini-btn', () => void copyCommandText(command, copyBtn, actions.onNotify), 'Copy command to clipboard');
  const btns = el('span', 'mb-cmd-btns', [copyBtn]);
  if (actions.canInsert) {
    btns.append(
      btn('Insert', 'mb-mini-btn mb-insert-btn', () => actions.onInsert(command), 'Place command onto terminal prompt'),
    );
  }
  return el('div', compact ? 'mb-cmd-bar compact' : 'mb-cmd-bar', [code, btns]);
}
