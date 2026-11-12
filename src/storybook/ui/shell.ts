import { el } from './dom.js';

/** The page skeleton: header bar, main column (gallery or inspector) and the control column. */
export interface Shell {
  root: HTMLElement;
  bar: HTMLElement;
  main: HTMLElement;
  side: HTMLElement;
  errors: HTMLElement;
  grid: HTMLElement;
}

export function buildShell(root: HTMLElement): Shell {
  const bar = el('header', 'lab-bar');
  const body = el('div', 'lab-body');
  const main = el('main', 'lab-main');
  const side = el('aside', 'lab-side');
  body.append(main, side);
  root.append(bar, body);
  return { root, bar, main, side, errors: el('div', 'lab-errors'), grid: el('div', 'lab-grid') };
}

/** One paragraph per error line; hidden when there are none. */
export function showErrors(box: HTMLElement, lines: string[]): void {
  box.replaceChildren(...lines.map((line) => el('p', '', line)));
  box.hidden = lines.length === 0;
}
