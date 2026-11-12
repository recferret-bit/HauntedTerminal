/** Create an element with an optional class and text. The one DOM helper of the lab. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export const fmt = (n: number, digits = 2): string => n.toFixed(digits);

/** A `type="button"` with a click handler. */
export function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const btn = el('button', className, text);
  btn.type = 'button';
  btn.onclick = onClick;
  return btn;
}

/** A toggle-style button whose state is carried by `aria-pressed`. */
export function pressedButton(className: string, text: string, pressed: boolean, onClick: () => void): HTMLButtonElement {
  const btn = button(className, text, onClick);
  btn.setAttribute('aria-pressed', String(pressed));
  return btn;
}
