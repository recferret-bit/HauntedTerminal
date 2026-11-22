/** Tiny DOM builder for `src/ui` (which may not import `editor-core`, where `h()` lives). Text nodes only, never innerHTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  children: ReadonlyArray<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  for (const child of children) node.append(child);
  return node;
}

/** Restart a CSS animation by toggling its class. */
export function replayClass(node: HTMLElement, cls: string): void {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

/** Draws a model's portrait: the renderer's `drawPortrait`, injected by `src/play` because `src/ui` imports no three. */
export type DrawPortrait = (modelId: string, px: number) => HTMLCanvasElement;
