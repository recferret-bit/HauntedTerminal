import type { Rec } from './dom.js';
import type { Field } from './schema.js';

/** Callbacks and state shared across schema-driven forms. */
export interface FormCtx {
  /** Names for `suggest` datalists (`models`, `paths`, `actors`, ...). */
  suggest(name: string): string[];
  /** A value changed in place. */
  changed(): void;
  /** The shape changed (item added, kind switched): draw the form again. */
  restructure(): void;
  /** Preview/play one step or beat/letter in the live viewport. */
  playStep?(step: Rec): void;
  /** Active selected element `itemPath` in the form (optional). */
  selectedPath?: string;
  /** Notify host when the user selects an element in the form (optional). */
  selectPath?(path: string, item: Rec): void;
  /** Remap or clear the host's active `selectedPath` when an array/record item moves or is removed. */
  remapSelection?(mapPath: (curPath: string) => string | null): void;
  /** Paths of `<details>` blocks that are open, kept across redraws. */
  open: Set<string>;
}

export function bindOpenDetails(details: HTMLDetailsElement, itemPath: string, open: Set<string>): void {
  details.addEventListener('toggle', () => {
    if (!details.isConnected) return;
    if (details.open) open.add(itemPath);
    else open.delete(itemPath);
  });
}

export function bindSelectableItem(details: HTMLDetailsElement, itemPath: string, item: Rec, ctx: FormCtx): void {
  details.dataset.itemPath = itemPath;
  if (ctx.selectedPath === itemPath) details.classList.add('is-selected');
  if (!ctx.selectPath) return;
  const pick = (e: Event): void => {
    if ((e.target as HTMLElement | null)?.closest('.item-tools')) return;
    e.stopPropagation();
    ctx.selectPath?.(itemPath, item);
  };
  details.addEventListener('click', pick);
  details.addEventListener('focusin', pick);
}

const cssEsc = (value: string): string =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&');

/**
 * Syncs `.is-selected` highlights and `<details open>` state across an Inspector pane in place
 * without rebuilding form controls or interrupting focused inputs.
 */
export function syncSelectedDetailsDom(
  paneEl: HTMLElement,
  selectedPath: string | null,
  scrollIntoView = false,
): HTMLDetailsElement | null {
  let activeDetails: HTMLDetailsElement | null;
  activeDetails = null;
  for (const el of paneEl.querySelectorAll<HTMLDetailsElement>('details[data-item-path]')) {
    const match = selectedPath !== null && el.dataset.itemPath === selectedPath;
    el.classList.toggle('is-selected', match);
    if (match) {
      el.open = true;
      activeDetails = el;
    }
  }
  if (scrollIntoView && activeDetails) {
    activeDetails.scrollIntoView({ block: 'nearest' });
  } else if (scrollIntoView && selectedPath) {
    const fallback = paneEl.querySelector<HTMLElement>(`[data-item-path="${cssEsc(selectedPath)}"]`);
    fallback?.scrollIntoView({ block: 'nearest' });
  }
  return activeDetails;
}

/** Remaps a single path key when an array at `basePath` is reordered, duplicated, or spliced. */
export function remapSinglePath(
  key: string,
  basePath: string,
  mapIdx: (idx: number) => number | null,
): string | null {
  const prefix = `${basePath}[`;
  if (!key.startsWith(prefix)) return key;
  const close = key.indexOf(']', prefix.length);
  const idx = close > prefix.length ? Number(key.slice(prefix.length, close)) : Number.NaN;
  if (!Number.isInteger(idx)) return key;
  const mapped = mapIdx(idx);
  return mapped === null ? null : `${prefix}${mapped}]${key.slice(close + 1)}`;
}

/**
 * Remaps `open` `<details>` path keys when an array at `basePath` is reordered, duplicated, or spliced.
 */
export function remapArrayPaths(
  open: Set<string>,
  basePath: string,
  mapIdx: (idx: number) => number | null,
): void {
  const next = new Set<string>();
  for (const key of open) {
    const mapped = remapSinglePath(key, basePath, mapIdx);
    if (mapped !== null) next.add(mapped);
  }
  open.clear();
  for (const k of next) open.add(k);
}

function defaultFor(f: Field): unknown {
  switch (f.type) {
    case 'text':
      return '';
    case 'number':
      return 0;
    case 'bool':
      return Boolean(f.defaultTrue);
    case 'select':
      return f.options[0];
    case 'strings':
    case 'numbers':
    case 'pairs':
    case 'array':
      return [];
    case 'textOrVec':
      return '';
    case 'color':
      return '#000000';
    case 'object':
      return blankOf(f.fields);
    case 'record':
      return {};
    case 'union': {
      const variants = f.union();
      return blankUnion(variants, Object.keys(variants)[0] ?? '');
    }
  }
}

/** A new object with every required field at its default. */
export function blankOf(fields: Field[]): Rec {
  const out: Rec = {};
  for (const f of fields) if (!f.optional) out[f.key] = defaultFor(f);
  return out;
}

export function blankUnion(variants: Record<string, Field[]>, kind: string, tag = 'kind'): Rec {
  return { [tag]: kind, ...blankOf(variants[kind] ?? []) };
}
