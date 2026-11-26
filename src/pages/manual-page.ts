import { startPageAudio } from '../audio/page.js';
import { CHAPTER_MANIFESTS, isFieldManualAvailable } from '../chapters/catalog.js';
import '../contracts/migrate-storage.js';
import { installFullscreenKey } from '../chapters/fullscreen.js';
import { hydrateFromDesktopSaveBundle } from '../chapters/portable-save.js';
import '../styles/hub.css';
import '../styles/manual-book.css';

import { resolveManualPageIndex } from '../game/manual-catalog.js';
import type { BookPage } from '../game/manual-types.js';
import { mountManualBook, type ManualBook } from '../ui/manual-book.js';

function syncUrl(page: BookPage): void {
  const url = new URL(window.location.href);
  url.searchParams.set('page', String(page.index + 1));
  if (page.kind === 'command') {
    url.searchParams.set('cmd', page.entry.command);
  } else {
    url.searchParams.delete('cmd');
  }
  url.searchParams.delete('q');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function buildLockedCard(): HTMLElement {
  const card = document.createElement('section');
  card.id = 'manual-locked-panel';
  card.className = 'edition-card';

  const body = document.createElement('div');
  const top = document.createElement('div');
  top.className = 'door-card-top';
  const kicker = document.createElement('span');
  kicker.className = 'door-kicker orange';
  kicker.textContent = 'FIELD MANUAL // LOCKED';
  const sub = document.createElement('span');
  sub.textContent = 'Obtain at Server Hub #1';
  top.append(kicker, sub);

  const heading = document.createElement('h2');
  heading.textContent = 'Reach Server Hub #1 to Obtain the Unix Field Manual';

  const copy = document.createElement('p');
  copy.textContent =
    'You enter the machine empty-handed. Clear the opening sectors and reach Server Hub #1 so the Old Bearded Coder can hand you the hardcover Field Manual and Motherboard Map — unlocking ACH_FIELD_MANUAL, F1 in-game, and this standalone reference book.';

  body.append(top, heading, copy);

  const actions = document.createElement('div');
  actions.className = 'hero-cta-row';
  const first = CHAPTER_MANIFESTS[0];
  const playBtn = document.createElement('a');
  playBtn.className = 'comic-btn primary';
  playBtn.href = first ? `/play/${encodeURIComponent(first.id)}` : '/chapters.html';
  playBtn.textContent = 'Play Campaign to Unlock';

  const homeBtn = document.createElement('a');
  homeBtn.className = 'comic-btn paper';
  homeBtn.href = '/';
  homeBtn.textContent = 'Back to Home';

  actions.append(playBtn, homeBtn);
  card.append(body, actions);
  return card;
}

const mount = document.getElementById('manual-mount');
if (mount) {
  const pageAudio = startPageAudio('manual');
  let activeBook: ManualBook | null = null;

  const renderManualPage = (): void => {
    if (!isFieldManualAvailable()) {
      activeBook?.destroy();
      activeBook = null;
      mount.replaceChildren(buildLockedCard());
      return;
    }
    if (activeBook) return;
    mount.replaceChildren();
    const params = new URLSearchParams(window.location.search);
    const cmd = params.get('cmd')?.trim() ?? '';
    const query = params.get('q')?.trim() ?? '';
    const pageParam = Number.parseInt(params.get('page') ?? '', 10);

    const initialQuery = cmd || query || undefined;
    const initialPage = initialQuery
      ? resolveManualPageIndex(initialQuery)
      : Number.isFinite(pageParam) && pageParam >= 1
        ? pageParam - 1
        : 0;

    activeBook = mountManualBook(mount, {
      modal: false,
      initialQuery,
      initialPage,
      onPageChange: (page, turned, animated) => {
        syncUrl(page);
        if (animated) pageAudio.bus.emit(turned ? { kind: 'page' } : { kind: 'menu', action: 'move' });
      },
      onSearchDismiss: () => pageAudio.bus.emit({ kind: 'menu', action: 'move' }),
    });
  };

  renderManualPage();
  window.addEventListener('storage', renderManualPage);
  window.addEventListener('pageshow', (ev) => {
    if (ev.persisted) renderManualPage();
  });
  void hydrateFromDesktopSaveBundle().then((hydrated) => {
    if (hydrated) renderManualPage();
  });
}

// F11 toggles full screen on this page (spec .kiro/specs/fullscreen-mode/).
installFullscreenKey();
