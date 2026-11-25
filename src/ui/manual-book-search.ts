import { searchManual, tokenizeSearchQuery } from '../game/manual-catalog.js';
import type { ManualSearchHit, ManualSkillFilter } from '../game/manual-types.js';
import { el } from './dom-lite.js';
import { btn, inlineCodeFragment } from './manual-book-dom.js';

export const SKILL_FILTERS: ReadonlyArray<{ id: ManualSkillFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'beginner', label: 'Beginner' },
  { id: 'flags-numbers', label: 'Flags & Numbers' },
  { id: 'combat', label: 'Combat' },
  { id: 'files', label: 'Files' },
  { id: 'text', label: 'Text' },
  { id: 'procs', label: 'Kill / PS' },
  { id: 'code-docker', label: 'Code & Docker' },
  { id: 'game', label: 'Kiro & Game' },
];

const SUGGESTIONS = ['chmod', '644', 'kill -9', 'ls -a', 'grep', 'sed -i', 'docker'];

export interface SearchPanel {
  barEl: HTMLElement;
  resultsEl: HTMLElement;
  focusInput(openDrawer?: boolean): void;
  setQuery(query: string, openDrawer?: boolean): void;
  setFilter(filter: ManualSkillFilter): void;
  isResultsOpen(): boolean;
  closeResults(): void;
}

function buildEmptySearchView(query: string, onPick: (suggestion: string) => void): HTMLElement {
  const chips = el('div', 'mb-quick-chips');
  for (const s of SUGGESTIONS) chips.append(btn(s, 'mb-chip-btn', () => onPick(s)));
  return el('div', 'mb-search-empty', [
    el('p', '', [`No manual entries match "${query.trim()}". Try one of these:`]),
    chips,
  ]);
}

function buildSearchHitRow(
  hit: ManualSearchHit,
  tokens: readonly string[],
  onSelect: (hit: ManualSearchHit) => void,
): HTMLButtonElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'mb-hit-item';
  row.append(
    el('div', 'mb-hit-top', [
      el('strong', 'mb-hit-title', [inlineCodeFragment(hit.title, tokens)]),
      el('span', 'mb-hit-meta', [`${hit.sectionLabel} · p.${hit.pageIndex + 1}`]),
    ]),
    el('div', 'mb-hit-badge', [inlineCodeFragment(hit.badge, tokens)]),
    el('p', 'mb-hit-snip', [inlineCodeFragment(hit.snippet, tokens)]),
  );
  row.addEventListener('click', () => onSelect(hit));
  return row;
}

function buildFilterButtons(onPick: (id: ManualSkillFilter) => void): {
  row: HTMLElement;
  buttons: Map<ManualSkillFilter, HTMLButtonElement>;
} {
  const row = el('div', 'mb-filter-row');
  const buttons = new Map<ManualSkillFilter, HTMLButtonElement>();
  for (const f of SKILL_FILTERS) {
    const b = btn(f.label, `mb-filter-pill${f.id === 'all' ? ' active' : ''}`, () => onPick(f.id));
    buttons.set(f.id, b);
    row.append(b);
  }
  return { row, buttons };
}

function createSearchInput(): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'mb-search-input';
  input.id = 'mb-search-input';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = 'Search commands, flags (-9, -rf), numbers (755, 644), concepts... (/)';
  input.setAttribute('aria-label', 'Search terminal commands, flags, and guides');
  return input;
}

function wireSearchInputEvents(
  input: HTMLInputElement,
  handlers: {
    onPointerDown(): void;
    onInput(): void;
    onFocus(): void;
    onEnter(): boolean;
  },
): void {
  input.addEventListener('pointerdown', handlers.onPointerDown);
  input.addEventListener('input', handlers.onInput);
  input.addEventListener('focus', handlers.onFocus);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && handlers.onEnter()) e.preventDefault();
  });
}

function renderSearchDrawerBody(
  resultsEl: HTMLElement,
  hits: readonly ManualSearchHit[],
  query: string,
  tokens: readonly string[],
  onPickSuggestion: (s: string) => void,
  onPickHit: (hit: ManualSearchHit) => void,
): void {
  if (hits.length === 0) {
    resultsEl.replaceChildren(buildEmptySearchView(query, onPickSuggestion));
    return;
  }
  const list = el('div', 'mb-hit-list');
  for (const hit of hits.slice(0, 18)) list.append(buildSearchHitRow(hit, tokens, onPickHit));
  resultsEl.replaceChildren(list);
}

export function createSearchPanel(opts: {
  onSelectHit(hit: ManualSearchHit, queryTokens: readonly string[]): void;
  onHighlightTokens(tokens: readonly string[]): void;
}): SearchPanel {
  let query = '';
  let filter: ManualSkillFilter = 'all';
  let drawerOpen = false;
  let allowFocusOpen = true;

  const input = createSearchInput();
  const clearBtn = btn('×', 'mb-search-clear hidden', () => {
    query = '';
    filter = 'all';
    input.value = '';
    drawerOpen = false;
    allowFocusOpen = true;
    opts.onHighlightTokens([]);
    renderResults();
    input.focus();
  }, 'Clear search');

  const countBadge = el('span', 'mb-search-count');
  const filters = buildFilterButtons((id) => {
    filter = id;
    drawerOpen = id !== 'all' || query.trim().length > 0;
    renderResults();
  });

  const barEl = el('div', 'mb-search-bar', [
    el('div', 'mb-search-box', [el('span', 'mb-search-ico', ['SEARCH']), input, countBadge, clearBtn]),
    filters.row,
  ]);
  const resultsEl = el('div', 'mb-search-results hidden');
  resultsEl.setAttribute('role', 'region');
  resultsEl.setAttribute('aria-label', 'Search results');

  const activeTokens = (): string[] => tokenizeSearchQuery(query);
  const pickHit = (hit: ManualSearchHit): void => {
    allowFocusOpen = false;
    drawerOpen = false;
    resultsEl.classList.add('hidden');
    input.blur();
    opts.onSelectHit(hit, activeTokens());
  };

  function renderResults(): void {
    for (const [id, b] of filters.buttons) b.classList.toggle('active', id === filter);
    clearBtn.classList.toggle('hidden', !query && filter === 'all');

    const tokens = activeTokens();
    opts.onHighlightTokens(tokens);
    if ((tokens.length === 0 && filter === 'all') || !drawerOpen) {
      resultsEl.classList.add('hidden');
      countBadge.textContent = '';
      return;
    }

    const hits = searchManual(query, filter);
    countBadge.textContent = `${hits.length} hit${hits.length === 1 ? '' : 's'}`;
    resultsEl.classList.remove('hidden');
    renderSearchDrawerBody(resultsEl, hits, query, tokens, (s) => {
      query = s;
      filter = 'all';
      input.value = s;
      drawerOpen = true;
      renderResults();
    }, pickHit);
  }

  wireSearchInputEvents(input, {
    onPointerDown: () => {
      allowFocusOpen = true;
      if (!drawerOpen && document.activeElement === input && (query.trim().length > 0 || filter !== 'all')) {
        drawerOpen = true;
        renderResults();
      }
    },
    onInput: () => {
      allowFocusOpen = true;
      query = input.value;
      drawerOpen = query.trim().length > 0 || filter !== 'all';
      renderResults();
    },
    onFocus: () => {
      if (allowFocusOpen && (query.trim().length > 0 || filter !== 'all')) {
        drawerOpen = true;
        renderResults();
      }
    },
    onEnter: () => {
      const hits = searchManual(query, filter);
      if (hits.length === 0) return false;
      pickHit(hits[0]!);
      return true;
    },
  });

  return {
    barEl,
    resultsEl,
    focusInput: (openDrawer = true) => {
      allowFocusOpen = openDrawer;
      input.focus();
      input.select();
    },
    setQuery: (next, openDrawer = true) => {
      query = next;
      input.value = next;
      allowFocusOpen = openDrawer;
      drawerOpen = openDrawer && (next.trim().length > 0 || filter !== 'all');
      renderResults();
    },
    setFilter: (next) => {
      filter = next;
      drawerOpen = next !== 'all' || query.trim().length > 0;
      renderResults();
    },
    isResultsOpen: () => drawerOpen && !resultsEl.classList.contains('hidden'),
    closeResults: () => {
      allowFocusOpen = false;
      drawerOpen = false;
      resultsEl.classList.add('hidden');
    },
  };
}
