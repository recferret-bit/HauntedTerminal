import { startPageAudio } from '../audio/page.js';
import type { AppBus } from '../contracts/app-bus.js';
import '../contracts/migrate-storage.js';
import { installFullscreenKey } from '../chapters/fullscreen.js';
import '../styles/hub.css';
import { CHAPTER_MANIFESTS, readChapterProgress } from '../chapters/catalog.js';
import { hydrateFromDesktopSaveBundle } from '../chapters/portable-save.js';
import { wireExternalLinksForDesktop, wireSteamWishlistLink } from '../chapters/steam-bridge.js';
import type { ChapterLevelSummary, ChapterManifest } from '../chapters/types.js';
import { renderIssueRack } from './chapters-issue-rack.js';
import { renderLevelDossier, renderLevelGrid } from './chapters-level-grid.js';
import type { ChaptersPageEls, ChaptersViewState } from './chapters-page-model.js';
import { syncChaptersUrl } from './chapters-page-model.js';
import { captureActiveFocusSelector, renderMetagame, restoreActiveFocus } from './chapters-workshop.js';

function pageEls(): ChaptersPageEls {
  return {
    rackEl: document.getElementById('issue-rack')!,
    gridEl: document.getElementById('level-grid')!,
    dossierEl: document.getElementById('level-dossier')!,
    headingEl: document.getElementById('selected-issue-heading')!,
    subtitleEl: document.getElementById('selected-issue-subtitle')!,
    summaryCountEl: document.getElementById('chapters-summary-count')!,
    scrapPillEl: document.getElementById('scrap-counter-pill'),
    workshopEl: document.getElementById('workshop-rack'),
    binderContentEl: document.getElementById('binder-content'),
    tabGrimoireBtn: document.getElementById('tab-grimoire') as HTMLButtonElement | null,
    tabBestiaryBtn: document.getElementById('tab-bestiary') as HTMLButtonElement | null,
    tabAchievementsBtn: document.getElementById('tab-achievements') as HTMLButtonElement | null,
    metagameSummaryEl: document.getElementById('metagame-summary'),
  };
}

function renderChapters(els: ChaptersPageEls, state: ChaptersViewState): void {
  const focusSel = captureActiveFocusSelector();
  const progress = readChapterProgress();
  syncChaptersUrl(state);
  els.headingEl.textContent = `2. ${state.activeChapter.badge}: ${state.activeChapter.title} — Exact Level Select`;
  els.subtitleEl.textContent = `${state.activeChapter.levels.length} Sectors • Client: ${state.activeChapter.clientName} • Mentor: ${state.activeChapter.allyNpc.id}`;
  const rerender = () => renderChapters(els, state);
  renderIssueRack(els, state, progress, rerender);
  renderLevelGrid(els, state, progress, rerender);
  renderLevelDossier(els, state, progress, rerender);
  renderMetagame(els, state, rerender);
  restoreActiveFocus(focusSel);
}

function bootstrapChaptersPage(bus: AppBus): void {
  const els = pageEls();
  const params = new URLSearchParams(window.location.search);
  const activeChapter: ChapterManifest =
    CHAPTER_MANIFESTS.find((c) => c.id === params.get('chapter')) ??
    CHAPTER_MANIFESTS[0]!;
  const activeLevel: ChapterLevelSummary =
    activeChapter.levels.find((l) => l.id === params.get('level')) ?? activeChapter.levels[0]!;
  const state: ChaptersViewState = {
    activeChapter,
    activeLevel,
    launchChaos: params.get('chaos') === '1',
    activeBinderTab:
      params.get('tab') === 'bestiary'
        ? 'bestiary'
        : params.get('tab') === 'achievements'
          ? 'achievements'
          : 'grimoire',
    workshopBanner: '',
    bus,
  };
  const playableCount = CHAPTER_MANIFESTS.filter((c) => c.status === 'playable').length;
  els.summaryCountEl.textContent = `${CHAPTER_MANIFESTS.length} Issues Cataloged (${playableCount} Playable Now, ${CHAPTER_MANIFESTS.length - playableCount} Full Roadmap Specs)`;

  if (els.tabGrimoireBtn) {
    els.tabGrimoireBtn.onclick = () => {
      state.activeBinderTab = 'grimoire';
      syncChaptersUrl(state);
      renderMetagame(els, state);
    };
  }
  if (els.tabBestiaryBtn) {
    els.tabBestiaryBtn.onclick = () => {
      state.activeBinderTab = 'bestiary';
      syncChaptersUrl(state);
      renderMetagame(els, state);
    };
  }
  if (els.tabAchievementsBtn) {
    els.tabAchievementsBtn.onclick = () => {
      state.activeBinderTab = 'achievements';
      syncChaptersUrl(state);
      renderMetagame(els, state);
    };
  }
  wireExternalLinksForDesktop();
  wireSteamWishlistLink(document.getElementById('chapters-wishlist-link') as HTMLAnchorElement | null);
  renderChapters(els, state);
  window.addEventListener('storage', () => renderChapters(els, state));
  window.addEventListener('pageshow', (ev) => {
    if (ev.persisted) renderChapters(els, state);
  });
  void hydrateFromDesktopSaveBundle().then((hydrated) => {
    if (hydrated) renderChapters(els, state);
  });
}

const pageAudio = startPageAudio('level-select');
bootstrapChaptersPage(pageAudio.bus);

// F11 toggles full screen on this page (spec .kiro/specs/fullscreen-mode/).
installFullscreenKey();
