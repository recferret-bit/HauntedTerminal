import { CHAPTER_MANIFESTS, type ChapterProgressStore } from '../chapters/catalog.js';
import { dom } from '../ui/dom-lite.js';
import type { ChaptersPageEls, ChaptersViewState } from './chapters-page-model.js';

export function renderIssueRack(
  els: ChaptersPageEls,
  state: ChaptersViewState,
  progress: ChapterProgressStore,
  rerender: () => void,
): void {
  els.rackEl.replaceChildren(
    ...CHAPTER_MANIFESTS.map((chap) => {
      const isSelected = chap.id === state.activeChapter.id;
      const clearedInChap = Object.keys(progress[chap.id] ?? {}).length;
      const btn = dom(
        'button',
        { type: 'button', class: `issue-tab ${isSelected ? 'active' : ''}`.trim(), 'data-chapter-id': chap.id },
        [
          dom('div', { class: 'issue-tab-head' }, [
            dom('span', { class: 'issue-badge' }, [chap.badge]),
            dom('span', { class: `issue-status ${chap.status}` }, [chap.status === 'playable' ? 'PLAYABLE' : 'ROADMAP SPEC']),
          ]),
          dom('h3', {}, [chap.title]),
          dom('small', {}, [chap.subtitle]),
          dom('small', {}, [
            `${chap.levels.length} levels${clearedInChap > 0 ? ` • ${clearedInChap}/${chap.levels.length} cleared` : ''}`,
          ]),
        ],
      );
      btn.onclick = () => {
        state.activeChapter = chap;
        state.activeLevel = chap.levels[0]!;
        rerender();
      };
      return btn;
    }),
  );
}
