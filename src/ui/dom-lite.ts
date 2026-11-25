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

export function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** Restart a CSS animation by toggling its class. */
export function replayClass(node: HTMLElement, cls: string): void {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

/** Number of stepped head animation frames per character portrait. */
export const PORTRAIT_FRAMES = 4;

/** Doom/Quake-style HP face states (`0` = healthiest .. `4` = critical/KO, `'ouch'` = transient hit). */
export type HeroFaceTier = 0 | 1 | 2 | 3 | 4 | 'ouch';

/** Maps current/max HP to one of five Doom/Quake-style expression tiers (`0` healthy -> `4` critical). */
export function heroFaceTierForHp(hp: number, maxHp: number): 0 | 1 | 2 | 3 | 4 {
  const r = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  return r >= 0.8 ? 0 : r >= 0.6 ? 1 : r >= 0.4 ? 2 : r >= 0.2 ? 3 : 4;
}

/** Draws a model's portrait (with optional frame `0..PORTRAIT_FRAMES - 1` and optional HP face tier): injected by `src/play`. */
export type DrawPortrait = (modelId: string, px: number, frame?: number, faceTier?: HeroFaceTier) => HTMLCanvasElement;
