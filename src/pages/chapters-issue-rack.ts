import { CHAPTER_MANIFESTS, type ChapterProgressStore } from '../chapters/catalog.js';
import { esc } from './html-text.js';
import type { ChaptersPageEls, ChaptersViewState } from './chapters-page-model.js';

export function renderIssueRack(
  els: ChaptersPageEls,
  state: ChaptersViewState,
  progress: ChapterProgressStore,
  rerender: () => void,
): void {
  els.rackEl.innerHTML = CHAPTER_MANIFESTS.map((chap) => {
    const isSelected = chap.id === state.activeChapter.id;
    const clearedInChap = Object.keys(progress[chap.id] ?? {}).length;
    return `
        <button type="button" class="issue-tab ${isSelected ? 'active' : ''}" data-chapter-id="${esc(chap.id)}">
          <div class="issue-tab-head">
            <span class="issue-badge">${esc(chap.badge)}</span>
            <span class="issue-status ${chap.status}">${chap.status === 'playable' ? 'PLAYABLE' : 'ROADMAP SPEC'}</span>
          </div>
          <h3>${esc(chap.title)}</h3>
          <small>${esc(chap.subtitle)}</small>
          <small>${chap.levels.length} levels${clearedInChap > 0 ? ` • ${clearedInChap}/${chap.levels.length} cleared` : ''}</small>
        </button>
      `;
  }).join('');

  els.rackEl.querySelectorAll<HTMLButtonElement>('.issue-tab').forEach((btn) => {
    btn.onclick = () => {
      const nextChap = CHAPTER_MANIFESTS.find((c) => c.id === btn.dataset.chapterId);
      if (!nextChap) return;
      state.activeChapter = nextChap;
      state.activeLevel = nextChap.levels[0]!;
      rerender();
    };
  });
}
