import { isRec as isRecord, type Rec } from '../chapters/record.js';

export type { Rec };

type Attrs = Record<string, string | number | boolean | undefined | ((ev: Event) => void)>;
type Child = Node | string | null | undefined | false;

/** Tiny element builder: `h('button', { class: 'btn', onclick: fn }, 'Save')`. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
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

export const isRec = isRecord;

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
