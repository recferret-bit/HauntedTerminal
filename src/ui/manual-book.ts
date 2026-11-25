import { BOOK_PAGES, BOOK_SECTIONS, resolveManualPageIndex, tokenizeSearchQuery } from '../game/manual-catalog.js';
import type { BookPage } from '../game/manual-types.js';
import { el } from './dom-lite.js';
import { btn, inlineCodeFragment, type BookActions } from './manual-book-dom.js';
import { renderBookPage } from './manual-book-render.js';
import { createSearchPanel, type SearchPanel } from './manual-book-search.js';

export interface ManualBookOptions {
  /** True inside /play modal (shows Insert buttons & Close button); false on /manual.html. */
  modal?: boolean;
  initialQuery?: string;
  initialPage?: number;
  onInsertCommand?(command: string): void;
  onClose?(): void;
  onPageChange?(page: BookPage, turned: boolean, animated: boolean): void;
  onSearchDismiss?(): void;
}

export interface ManualBook {
  open(queryOrPage?: string | number): void;
  close(): void;
  isOpen(): boolean;
  goToPage(index: number, animate?: boolean): void;
  search(query: string): void;
  currentPage(): BookPage;
  destroy(): void;
}

const SINGLE_PAGE_WIDTH = 880;
const FLIP_MS = 380;

function isReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function isSpreadMode(): boolean {
  return typeof window === 'undefined' ? true : window.innerWidth > SINGLE_PAGE_WIDTH;
}

function alignedStart(idx: number): number {
  const clamped = Math.max(0, Math.min(BOOK_PAGES.length - 1, idx));
  return isSpreadMode() ? clamped - (clamped % 2) : clamped;
}

function cloneSheetFace(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
  clone.querySelectorAll('.mb-corner, .mb-corner-row').forEach((node) => node.remove());
  return clone;
}

function playFlipLeaf(
  flipHost: HTMLElement,
  dir: 'next' | 'prev',
  turningEl: HTMLElement | null,
  turnScroll: number,
  backEl: HTMLElement | null,
): number {
  flipHost.replaceChildren();
  if (!turningEl || isReducedMotion()) return 0;
  const leaf = el('div', `mb-flip-leaf flip-${dir}`);
  const frontClone = cloneSheetFace(turningEl);
  const front = el('div', 'mb-flip-face mb-flip-front', [frontClone]);
  const backFace = el('div', 'mb-flip-face mb-flip-back');
  if (backEl) backFace.append(cloneSheetFace(backEl));
  leaf.append(front, backFace);
  flipHost.append(leaf);
  frontClone.scrollTop = turnScroll;
  return window.setTimeout(() => flipHost.replaceChildren(), FLIP_MS + 30);
}

function handleBookKeydown(
  e: KeyboardEvent,
  modalMode: boolean,
  searchPanel: SearchPanel,
  onClose: () => void,
  onStep: (delta: -1 | 1) => void,
  onSearchDismiss?: () => void,
): void {
  const active = document.activeElement;
  const inText = active instanceof HTMLInputElement && active.type !== 'checkbox';
  const emptySearch = inText && active.id === 'mb-search-input' && active.value === '';
  if (e.key === 'Escape') {
    if (searchPanel.isResultsOpen()) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      searchPanel.closeResults();
      onSearchDismiss?.();
      return;
    }
    if (modalMode) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      onClose();
    }
    return;
  }
  if (e.key === '/' && !inText && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    searchPanel.focusInput(true);
    return;
  }
  if (e.key === 'PageUp' || ((!inText || emptySearch) && e.key === 'ArrowLeft')) {
    e.preventDefault();
    onStep(-1);
  } else if (e.key === 'PageDown' || ((!inText || emptySearch) && e.key === 'ArrowRight')) {
    e.preventDefault();
    onStep(1);
  }
}

function buildTabsRail(onPickPage: (startPage: number) => void): {
  rail: HTMLElement;
  buttons: Map<string, HTMLButtonElement>;
} {
  const rail = el('nav', 'mb-tabs-rail');
  rail.setAttribute('aria-label', 'Manual Sections');
  const buttons = new Map<string, HTMLButtonElement>();
  for (const sec of BOOK_SECTIONS) {
    const b = btn(`${sec.code} ${sec.shortTitle}`, 'mb-tab-btn', () => onPickPage(sec.startPage));
    buttons.set(sec.id, b);
    rail.append(b);
  }
  return { rail, buttons };
}

function buildStandaloneLink(): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'mb-nav-btn mb-link-btn';
  link.href = '/manual.html';
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Full Page ↗';
  return link;
}

function renderSpreadNodes(
  start: number,
  spread: boolean,
  tokens: readonly string[],
  actions: BookActions,
  stepPage: (delta: -1 | 1) => void,
): { nodes: HTMLElement[]; hasPrev: boolean; hasNext: boolean; label: string; active: Set<string> } {
  const leftPage = BOOK_PAGES[start]!;
  const rightPage = spread ? BOOK_PAGES[start + 1] : undefined;
  const hasPrev = start > 0;
  const hasNext = spread ? start + 2 < BOOK_PAGES.length : start + 1 < BOOK_PAGES.length;
  const nodes: HTMLElement[] = [renderBookPage(leftPage, 'left', tokens, actions, spread && hasPrev, () => stepPage(-1))];
  if (rightPage) {
    nodes.push(renderBookPage(rightPage, 'right', tokens, actions, hasNext, () => stepPage(1)));
  } else if (!spread && (hasPrev || hasNext)) {
    const cornerRow = el('div', 'mb-corner-row');
    if (hasPrev) cornerRow.append(btn('◀', 'mb-corner mb-corner-left', () => stepPage(-1), 'Flip to previous page'));
    if (hasNext) cornerRow.append(btn('▶', 'mb-corner mb-corner-right', () => stepPage(1), 'Flip to next page'));
    nodes[0]!.append(cornerRow);
  }
  const label = rightPage ? `PAGES ${start + 1}–${start + 2} / ${BOOK_PAGES.length}` : `PAGE ${start + 1} / ${BOOK_PAGES.length}`;
  const active = new Set<string>([leftPage.section, ...(rightPage ? [rightPage.section] : [])]);
  return { nodes, hasPrev, hasNext, label, active };
}

function isInsideElement(ev: Event, container: HTMLElement): boolean {
  const path = typeof ev.composedPath === 'function' ? ev.composedPath() : [];
  if (path.includes(container)) return true;
  return ev.target instanceof Node && container.contains(ev.target);
}

function blurIfInside(container: HTMLElement): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && container.contains(active)) active.blur();
}

function bindOutsideDismiss(
  searchAnchor: HTMLElement,
  isActive: () => boolean,
  onDismiss: () => void,
): () => void {
  const onPointerOrClick = (ev: Event): void => {
    if (!isActive() || isInsideElement(ev, searchAnchor)) return;
    onDismiss();
    blurIfInside(searchAnchor);
  };
  document.addEventListener('pointerdown', onPointerOrClick);
  document.addEventListener('click', onPointerOrClick);
  return () => {
    document.removeEventListener('pointerdown', onPointerOrClick);
    document.removeEventListener('click', onPointerOrClick);
  };
}

function buildBookChrome(opts: {
  modalMode: boolean;
  searchPanel: SearchPanel;
  onStep: (delta: -1 | 1) => void;
  onGoTo: (page: number) => void;
  onClose: () => void;
}) {
  const spreadHost = el('div', 'mb-spread');
  const flipHost = el('div', 'mb-flip-layer');
  const pageCountEl = el('span', 'mb-page-counter');
  const searchAnchor = el('div', 'mb-search-anchor', [opts.searchPanel.barEl, opts.searchPanel.resultsEl]);
  const dismissSearch = (): void => {
    opts.searchPanel.closeResults();
    blurIfInside(searchAnchor);
  };
  const prevBtn = btn('← Prev', 'mb-nav-btn', () => { dismissSearch(); opts.onStep(-1); }, 'Previous page (Left Arrow)');
  const nextBtn = btn('Next →', 'mb-nav-btn', () => { dismissSearch(); opts.onStep(1); }, 'Next page (Right Arrow)');
  const tocBtn = btn('Index', 'mb-nav-btn mb-toc-btn', () => { dismissSearch(); opts.onGoTo(1); }, 'Jump to Table of Contents');
  const tabs = buildTabsRail((startPage) => { dismissSearch(); opts.onGoTo(startPage); });
  const standaloneLink = opts.modalMode ? buildStandaloneLink() : null;
  const headerRight = el('div', 'mb-head-actions', [tocBtn, prevBtn, pageCountEl, nextBtn]);
  if (standaloneLink) headerRight.append(standaloneLink, btn('Close (Esc)', 'mb-nav-btn mb-close-btn', opts.onClose));
  const spine = el('div', 'mb-spine', [el('i', ''), el('i', ''), el('i', '')]);
  const toastEl = el('div', 'mb-toast hidden');
  const tip = opts.modalMode
    ? 'Shortcuts: `/` Search · `← / →` Flip Page · `Esc` Close'
    : 'Shortcuts: `/` Search · `← / →` Flip Page · `Esc` Dismiss Search';
  const bookShell = el('div', opts.modalMode ? 'mb-book-shell mb-is-modal' : 'mb-book-shell mb-is-standalone', [
    el('header', 'mb-header', [el('div', 'mb-brand', [el('span', 'mb-brand-tag', ['OUT OF CREDITS']), el('strong', '', ['TERMINAL FIELD MANUAL'])]), headerRight]),
    searchAnchor,
    el('div', 'mb-cover-frame', [tabs.rail, el('div', 'mb-book-paper', [spreadHost, spine, flipHost])]),
    el('footer', 'mb-footer', [el('span', 'mb-foot-tip', [inlineCodeFragment(tip)]), toastEl]),
  ]);
  bookShell.tabIndex = -1;
  return { bookShell, searchAnchor, spreadHost, flipHost, spine, prevBtn, nextBtn, pageCountEl, standaloneLink, tabs, toastEl };
}

export function mountManualBook(host: HTMLElement, options: ManualBookOptions = {}): ManualBook {
  const modalMode = Boolean(options.modal);
  let opened = !modalMode;
  let currentIndex = Math.max(0, Math.min(BOOK_PAGES.length - 1, options.initialPage ?? 0));
  let tokens: string[] = [];
  let flipTimer = 0;
  let toastTimer = 0;
  let shell!: ReturnType<typeof buildBookChrome>;

  const notify = (msg: string): void => {
    shell.toastEl.textContent = msg;
    shell.toastEl.classList.remove('hidden');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => shell.toastEl.classList.add('hidden'), 1600);
  };

  const actions: BookActions = {
    canInsert: Boolean(options.onInsertCommand),
    onInsert: (cmd) => options.onInsertCommand?.(cmd),
    onNavigatePage: (idx) => goToPage(idx),
    onJumpCommand: (cmd) => { tokens = []; goToPage(resolveManualPageIndex(cmd)); },
    onNotify: notify,
  };

  const searchPanel = createSearchPanel({
    onSelectHit(hit, hitTokens) {
      tokens = [...hitTokens];
      goToPage(hit.pageIndex);
      shell.bookShell.focus({ preventScroll: true });
    },
    onHighlightTokens(nextTokens) { tokens = [...nextTokens]; paintPages(); },
  });

  shell = buildBookChrome({ modalMode, searchPanel, onStep: (d) => stepPage(d), onGoTo: (p) => goToPage(p), onClose: () => close() });
  host.replaceChildren(shell.bookShell);

  function stepPage(delta: -1 | 1): void {
    searchPanel.closeResults();
    const base = alignedStart(currentIndex);
    const next = Math.max(0, Math.min(BOOK_PAGES.length - 1, base + delta * (isSpreadMode() ? 2 : 1)));
    if (next !== base) goToPage(next);
  }

  function paintPages(): void {
    const spread = isSpreadMode();
    const start = alignedStart(currentIndex);
    shell.spreadHost.classList.toggle('single', !spread);
    shell.spine.classList.toggle('hidden', !spread);
    const view = renderSpreadNodes(start, spread, tokens, actions, stepPage);
    shell.spreadHost.replaceChildren(...view.nodes);
    shell.prevBtn.disabled = !view.hasPrev;
    shell.nextBtn.disabled = !view.hasNext;
    shell.pageCountEl.textContent = view.label;
    if (shell.standaloneLink) shell.standaloneLink.href = `/manual.html?page=${start + 1}`;
    for (const [id, b] of shell.tabs.buttons) b.classList.toggle('active', view.active.has(id));
  }

  function goToPage(targetIdx: number, animate = true): void {
    searchPanel.closeResults();
    const spread = isSpreadMode();
    const prevStart = alignedStart(currentIndex);
    const clamped = Math.max(0, Math.min(BOOK_PAGES.length - 1, targetIdx));
    const nextStart = alignedStart(clamped);
    const forward = nextStart > prevStart;
    const turnSel = forward ? (spread ? '.mb-page-right' : '.mb-page') : (spread ? '.mb-page-left' : '.mb-page');
    const prevTurning = animate && nextStart !== prevStart ? shell.spreadHost.querySelector<HTMLElement>(turnSel) : null;
    const turnScroll = prevTurning?.scrollTop ?? 0;
    currentIndex = clamped;
    paintPages();
    const backSel = forward ? (spread ? '.mb-page-left' : null) : (spread ? '.mb-page-right' : null);
    const arrivingBack = backSel ? shell.spreadHost.querySelector<HTMLElement>(backSel) : null;
    window.clearTimeout(flipTimer);
    flipTimer = prevTurning && nextStart !== prevStart ? playFlipLeaf(shell.flipHost, forward ? 'next' : 'prev', prevTurning, turnScroll, arrivingBack) : 0;
    options.onPageChange?.(BOOK_PAGES[currentIndex]!, nextStart !== prevStart, animate);
  }

  function open(queryOrPage?: string | number): void {
    opened = true;
    host.classList.remove('hidden');
    searchPanel.closeResults();
    if (typeof queryOrPage === 'number') goToPage(queryOrPage, false);
    else if (typeof queryOrPage === 'string' && queryOrPage.trim()) {
      const q = queryOrPage.trim();
      tokens = tokenizeSearchQuery(q);
      searchPanel.setQuery(q, false);
      goToPage(resolveManualPageIndex(q), false);
    } else paintPages();
    window.setTimeout(() => { if (opened) shell.bookShell.focus({ preventScroll: true }); }, 0);
  }

  function close(): void {
    if (!modalMode || !opened) return;
    opened = false;
    searchPanel.closeResults();
    host.classList.add('hidden');
    options.onClose?.();
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (opened) handleBookKeydown(e, modalMode, searchPanel, close, stepPage, options.onSearchDismiss);
  };
  const onResize = (): void => { if (opened) paintPages(); };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', onResize);
  const unbindOutside = bindOutsideDismiss(shell.searchAnchor, () => opened && searchPanel.isResultsOpen(), () => searchPanel.closeResults());

  if (options.initialQuery) {
    const q = options.initialQuery.trim();
    tokens = tokenizeSearchQuery(q);
    searchPanel.setQuery(q, false);
    currentIndex = resolveManualPageIndex(q);
  }
  paintPages();

  return {
    open, close,
    isOpen: () => opened,
    goToPage: (idx, anim = true) => goToPage(idx, anim),
    search: (q) => searchPanel.setQuery(q),
    currentPage: () => BOOK_PAGES[currentIndex]!,
    destroy: () => {
      window.clearTimeout(flipTimer); window.clearTimeout(toastTimer);
      window.removeEventListener('keydown', onKeyDown, true); window.removeEventListener('resize', onResize);
      unbindOutside();
      host.replaceChildren();
    },
  };
}
