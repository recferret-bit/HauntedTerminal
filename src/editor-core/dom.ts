export type Rec = Record<string, unknown>;

type Attrs = Record<string, string | number | boolean | undefined | ((ev: Event) => void)>;
type Child = Node | string | null | undefined | false;

/** Tiny DOM element builder: `h('button', { class: 'btn', onclick: fn }, 'Save')`. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = String(value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

export const isRec = (v: unknown): v is Rec => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));

/** What identifies a control across a redraw: `data-focus-key`, else its `aria-label`, else its `id`. */
function focusKey(el: Element): string | null {
  return el.getAttribute('data-focus-key') ?? el.getAttribute('aria-label') ?? (el.id || null);
}

const byKey = (host: HTMLElement, key: string): HTMLElement | undefined =>
  [...host.querySelectorAll<HTMLElement>('[data-focus-key], [aria-label], [id]')].find((el) => focusKey(el) === key);

/**
 * Redraws `host` without dropping keyboard focus: the control that had focus (matched by `data-focus-key`, `aria-label`
 * or `id`) is focused again in the new DOM. `nextKey` moves focus to another key instead (a row that moved).
 */
export function redrawKeepingFocus(host: HTMLElement, render: () => void, nextKey?: string): void {
  const active = document.activeElement;
  const key = nextKey ?? (active instanceof HTMLElement && host.contains(active) ? focusKey(active) : null);
  render();
  if (key) byKey(host, key)?.focus();
}
