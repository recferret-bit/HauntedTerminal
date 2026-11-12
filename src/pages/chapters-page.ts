import '../styles/hub.css';
import { CHAPTER_MANIFESTS, readChapterProgress } from '../chapters/catalog.js';
import type { ChapterLevelSummary, ChapterManifest } from '../chapters/types.js';
import { renderIssueRack } from './chapters-issue-rack.js';
import { renderLevelDossier, renderLevelGrid } from './chapters-level-grid.js';
import type { ChaptersPageEls, ChaptersViewState } from './chapters-page-model.js';
import { syncChaptersUrl } from './chapters-page-model.js';
import { renderMetagame } from './chapters-workshop.js';

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
    metagameSummaryEl: document.getElementById('metagame-summary'),
  };
}

function renderChapters(els: ChaptersPageEls, state: ChaptersViewState): void {
  const progress = readChapterProgress();
  syncChaptersUrl(state);
  els.headingEl.textContent = `2. ${state.activeChapter.badge}: ${state.activeChapter.title} — Exact Level Select`;
  els.subtitleEl.textContent = `${state.activeChapter.levels.length} Sectors • Client: ${state.activeChapter.clientName} • Mentor: ${state.activeChapter.allyNpc.id}`;
  const rerender = () => renderChapters(els, state);
  renderIssueRack(els, state, progress, rerender);
  renderLevelGrid(els, state, progress, rerender);
  renderLevelDossier(els, state, progress, rerender);
  renderMetagame(els, state);
}

function bootstrapChaptersPage(): void {
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
    launchTactical: params.get('tactical') === '1',
    launchChaos: params.get('chaos') === '1',
    activeBinderTab: params.get('tab') === 'bestiary' ? 'bestiary' : 'grimoire',
    workshopBanner: '',
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
  renderChapters(els, state);
}

bootstrapChaptersPage();
