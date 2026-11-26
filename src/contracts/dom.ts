/** Shared, layer-safe DOM builder primitives (contracts layer). Text nodes only, never innerHTML. */
type DomChild = Node | string | false | null | undefined;

export function dom<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Record<string, string | number | boolean | undefined>,
  children: ReadonlyArray<DomChild> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === false) continue;
      if (v === true) {
        node.setAttribute(k, '');
        if (k === 'checked') (node as unknown as HTMLInputElement).checked = true;
        if (k === 'disabled') (node as unknown as HTMLButtonElement).disabled = true;
      } else {
        node.setAttribute(k, String(v));
      }
    }
  }
  for (const child of children) {
    if (child !== false && child !== null && child !== undefined) node.append(child);
  }
  return node;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  children: ReadonlyArray<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) node.append(child);
  return node;
}

export function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** Restart a CSS animation by toggling its class. */
export function replayClass(node: HTMLElement, cls: string): void {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}
