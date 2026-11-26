import { buildPlayUrl, getChapterLevels, type ChapterProgressStore, type LevelClearRecord } from '../chapters/catalog.js';
import type { ChapterManifest } from '../chapters/types.js';
import { dom } from '../ui/dom-lite.js';
import type { ChaptersPageEls, ChaptersViewState } from './chapters-page-model.js';

export function renderLevelGrid(
  els: ChaptersPageEls,
  state: ChaptersViewState,
  progress: ChapterProgressStore,
  rerender: () => void,
): void {
  els.gridEl.replaceChildren(
    ...state.activeChapter.levels.map((lvl) => {
      const isSelected = lvl.id === state.activeLevel.id;
      const rec = progress[state.activeChapter.id]?.[lvl.id];
      const stars = '*'.repeat(lvl.difficulty) + '-'.repeat(5 - lvl.difficulty);
      const footStat = rec?.cleared
        ? dom('span', { class: 'rank-pill' }, [`RANK ${rec.bestRank}${rec.chaosCleared ? ' !' : ''}`])
        : dom('span', {}, [lvl.enemies.length ? `${lvl.enemies.length} threat(s)` : 'Safe Zone']);
      const btn = dom(
        'button',
        { type: 'button', class: `level-card ${isSelected ? 'active' : ''}`.trim(), 'data-level-id': lvl.id },
        [
          dom('div', {}, [
            dom('div', { class: 'level-card-top' }, [
              dom('span', { class: 'level-num' }, [`LVL ${String(lvl.index).padStart(2, '0')}`]),
              dom('span', { class: `mech-tag ${lvl.mechanic}` }, [lvl.mechanicLabel]),
            ]),
            dom('h4', {}, [lvl.title]),
            dom('div', { class: 'level-cwd' }, [lvl.cwd]),
          ]),
          dom('div', { class: 'level-card-foot' }, [
            dom('span', { title: `Difficulty ${lvl.difficulty}/5` }, [stars]),
            footStat,
          ]),
        ],
      );
      btn.onclick = () => {
        state.activeLevel = lvl;
        rerender();
      };
      return btn;
    }),
  );
}

function comixStripNode(chapter: ChapterManifest): HTMLElement | null {
  if (!chapter.comix) return null;
  const thumbs = Array.from({ length: chapter.comix.pageCount }, (_, i) => {
    const p = i + 1;
    const pad = String(p).padStart(2, '0');
    return dom('a', { href: `/comic.html?chapter=${encodeURIComponent(chapter.id)}&page=${p}`, title: `Read Page ${p}` }, [
      dom('img', { src: `/comix/${encodeURIComponent(chapter.id)}/page-${pad}.png`, alt: `Page ${p}` }),
    ]);
  });
  return dom('div', {}, [
    dom('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:11px;' }, [
      dom('strong', { style: 'color:var(--yellow);' }, [`COMIX STORY PAGES (${chapter.comix.pageCount})`]),
      dom('a', { href: `/comic.html?chapter=${encodeURIComponent(chapter.id)}`, style: 'color:var(--teal);' }, ['Open Full Reader >']),
    ]),
    dom('div', { class: 'comix-strip-thumbs' }, thumbs),
  ]);
}

function personalBestNode(rec: LevelClearRecord | undefined): HTMLElement | null {
  if (!rec?.cleared) return null;
  return dom('div', { class: 'pb-banner' }, [
    dom('strong', {}, ['SECTOR RECORD:']),
    ' Rank ',
    dom('b', {}, [rec.bestRank]),
    ` • ${rec.bestCommands} cmd(s) • ${rec.bestTimeSec}s${rec.chaosCleared ? ' • Chaos Contract Cleared' : ''}`,
  ]);
}

function deployControlsNodes(
  state: ChaptersViewState,
  playFastUrl: string,
  playFullIntroUrl: string,
  rerender: () => void,
): HTMLElement[] {
  if (state.activeChapter.status !== 'playable') {
    return [
      dom('div', { style: 'padding:10px;border:2px dashed var(--yellow);background:#191428;font-size:12px;color:#e8dfc9;' }, [
        dom('strong', {}, ['Full Steam Expansion Spec Ready:']),
        ' Use ',
        dom('code', {}, ['chapter-architect-intake']),
        ' + ',
        dom('code', {}, ['chapter-implementer']),
        " to generate and compile this issue's playable rooms & Comix!",
      ]),
    ];
  }
  const chaosInput = dom('input', { type: 'checkbox', id: 'dossier-chaos', checked: state.launchChaos });
  chaosInput.onchange = () => {
    state.launchChaos = chaosInput.checked;
    rerender();
  };
  const toggleRow = dom('label', { class: 'launch-toggle-row' }, [
    chaosInput,
    dom('span', {}, [
      dom('strong', {}, ['Chaos Contract (', dom('code', {}, ['cron_chaos']), ')']),
      ' — randomized PIDs & +25 Silicon Scrap',
    ]),
  ]);
  const introLink = state.activeLevel.index === 1
    ? dom('a', { class: 'comic-btn paper', href: playFullIntroUrl }, ['With Cinematic Intro'])
    : null;
  const actions = dom('div', { style: 'display:flex;flex-wrap:wrap;gap:10px;' }, [
    dom('a', { id: 'deploy-fast-btn', class: 'comic-btn primary', href: playFastUrl, style: 'flex:1;' }, [
      `Deploy To Level ${String(state.activeLevel.index).padStart(2, '0')} >`,
    ]),
    introLink,
  ]);
  return [toggleRow, actions];
}

export function renderLevelDossier(
  els: ChaptersPageEls,
  state: ChaptersViewState,
  progress: ChapterProgressStore,
  rerender: () => void,
): void {
  const chapter = state.activeChapter;
  const level = state.activeLevel;
  const fullSpec = getChapterLevels(chapter.id).find((s) => s.id === level.id);
  const rec = progress[chapter.id]?.[level.id];
  const playOpts = { chaos: state.launchChaos };
  const playFastUrl = buildPlayUrl(chapter.id, level, true, playOpts);
  const playFullIntroUrl = buildPlayUrl(chapter.id, level, false, { ...playOpts, intro: level.index > 1 });

  const teachesChips = level.teaches.map((t) => dom('span', { class: 'code-chip' }, [t]));
  const threatChips = level.enemies.length > 0
    ? level.enemies.map((e) => dom('span', { class: 'enemy-chip' }, [`malware.${e}`]))
    : [dom('span', { class: 'code-chip' }, ['0 hostiles (Sanctuary Safe Zone)'])];

  els.dossierEl.replaceChildren(
    ...[
      dom('span', { class: 'caption-tag' }, [
        `${chapter.badge} // LEVEL ${String(level.index).padStart(2, '0')} OF ${String(chapter.levels.length).padStart(2, '0')}`,
      ]),
      dom('h3', {}, [level.title]),
      dom('p', { style: 'font-size:12.5px;color:#d8d0c1;' }, [fullSpec?.summary ?? chapter.summary]),
      personalBestNode(rec),
      dom('dl', { class: 'dossier-meta' }, [
        dom('dt', {}, ['Directory']), dom('dd', {}, [dom('code', {}, [level.cwd])]),
        dom('dt', {}, ['Room Set']), dom('dd', {}, [dom('code', {}, [`room.${level.roomKind}`])]),
        dom('dt', {}, ['Mechanic']), dom('dd', {}, [level.mechanicLabel]),
        dom('dt', {}, ['Ally Spirit']), dom('dd', {}, [chapter.allyNpc.name]),
        dom('dt', {}, ['Issue Boss']), dom('dd', {}, [`${chapter.boss.name} (`, dom('code', {}, [`PID ${chapter.boss.pid}`]), ')']),
      ]),
      dom('div', {}, [
        dom('div', { style: 'font-size:11px;color:#9e95b5;margin-bottom:5px;font-weight:600;' }, ['TEACHES / SHELL TOOLS']),
        dom('div', { class: 'chip-list' }, teachesChips),
      ]),
      dom('div', {}, [
        dom('div', { style: 'font-size:11px;color:#9e95b5;margin-bottom:5px;font-weight:600;' }, ['ACTIVE THREATS']),
        dom('div', { class: 'chip-list' }, threatChips),
      ]),
      ...deployControlsNodes(state, playFastUrl, playFullIntroUrl, rerender),
      comixStripNode(chapter),
    ].filter((x): x is HTMLElement => x !== null),
  );
}
