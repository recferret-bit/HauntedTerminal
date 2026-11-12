import type { LabOptions, TabId } from '../domain/options.js';
import { TAB_IDS } from '../domain/options.js';
import { modelCategories, tabCount } from '../subjects/catalog-items.js';
import { button, el, pressedButton } from './dom.js';

export interface TopBarHooks {
  /** Link target for the current options with `change` applied. */
  href(change: Partial<LabOptions>): string;
  set(key: 'inspect' | 'tab' | 'category', value: string | null): void;
}

function mast(hooks: TopBarHooks): HTMLAnchorElement {
  const link = el('a', 'lab-mast');
  link.href = hooks.href({ inspect: null });
  link.append(el('b', '', 'HAUNTED '), el('span', '', 'TERMINAL'));
  link.onclick = (ev) => {
    ev.preventDefault();
    hooks.set('inspect', null);
  };
  return link;
}

/** Inspecting one item: the way back to the gallery it came from. Esc does the same. */
function back(hooks: TopBarHooks): HTMLButtonElement {
  const btn = button('lab-back', '← Back', () => hooks.set('inspect', null));
  btn.title = 'Back to the gallery (Esc)';
  btn.setAttribute('aria-label', 'Back to the gallery');
  return btn;
}

function tabs(opts: LabOptions, hooks: TopBarHooks): HTMLElement {
  const nav = el('nav', 'lab-tabs');
  for (const tab of TAB_IDS) {
    nav.append(pressedButton('lab-tab', `${tab} ${tabCount(tab)}`, opts.tab === tab, () => pick(hooks, 'tab', tab)));
  }
  return nav;
}

function pick(hooks: TopBarHooks, key: 'tab' | 'category', value: TabId | string): void {
  hooks.set('inspect', null);
  hooks.set(key, value);
}

function categoryChips(opts: LabOptions, hooks: TopBarHooks): HTMLElement {
  const nav = el('nav', 'lab-chips');
  if (opts.tab !== 'models') return nav;
  const chip = (name: string, label: string): void => {
    nav.append(pressedButton('lab-chip', label, opts.category === name, () => pick(hooks, 'category', name)));
  };
  chip('all', 'all');
  for (const { name, count } of modelCategories()) chip(name, `${name} ${count}`);
  return nav;
}

function note(opts: LabOptions): HTMLElement {
  return el('p', 'lab-bar-note', opts.inspect
    ? 'Left / right: previous / next. Esc or Back: gallery.'
    : 'Orthographic, camera on −z, +x is screen-left. Click a panel to inspect.');
}

/** The header: masthead, tabs, category chips and the one-line hint. */
export function buildTopBar(opts: LabOptions, hooks: TopBarHooks): HTMLElement[] {
  return [mast(hooks), ...(opts.inspect ? [back(hooks)] : []), tabs(opts, hooks), categoryChips(opts, hooks), note(opts)];
}
