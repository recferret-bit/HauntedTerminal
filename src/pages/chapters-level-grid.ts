import { buildPlayUrl, getChapterLevels, type ChapterProgressStore, type LevelClearRecord } from '../chapters/catalog.js';
import type { ChapterManifest } from '../chapters/types.js';
import { esc } from './html-text.js';
import type { ChaptersPageEls, ChaptersViewState } from './chapters-page-model.js';

export function renderLevelGrid(
  els: ChaptersPageEls,
  state: ChaptersViewState,
  progress: ChapterProgressStore,
  rerender: () => void,
): void {
  els.gridEl.innerHTML = state.activeChapter.levels
    .map((lvl) => {
      const isSelected = lvl.id === state.activeLevel.id;
      const rec = progress[state.activeChapter.id]?.[lvl.id];
      const stars = '★'.repeat(lvl.difficulty) + '☆'.repeat(5 - lvl.difficulty);
      return `
          <button type="button" class="level-card ${isSelected ? 'active' : ''}" data-level-id="${esc(lvl.id)}">
            <div>
              <div class="level-card-top">
                <span class="level-num">LVL ${String(lvl.index).padStart(2, '0')}</span>
                <span class="mech-tag ${esc(lvl.mechanic)}">${esc(lvl.mechanicLabel)}</span>
              </div>
              <h4>${esc(lvl.title)}</h4>
              <div class="level-cwd">${esc(lvl.cwd)}</div>
            </div>
            <div class="level-card-foot">
              <span title="Difficulty ${lvl.difficulty}/5">${stars}</span>
              ${
                rec?.cleared
                  ? `<span class="rank-pill">RANK ${esc(rec.bestRank)}${rec.chaosCleared ? ' ⚡' : ''}</span>`
                  : `<span>${lvl.enemies.length ? `${lvl.enemies.length} threat(s)` : 'Safe Zone'}</span>`
              }
            </div>
          </button>
        `;
    })
    .join('');

  els.gridEl.querySelectorAll<HTMLButtonElement>('.level-card').forEach((btn) => {
    btn.onclick = () => {
      const nextLvl = state.activeChapter.levels.find((l) => l.id === btn.dataset.levelId);
      if (!nextLvl) return;
      state.activeLevel = nextLvl;
      rerender();
    };
  });
}

function comixStripHtml(chapter: ChapterManifest): string {
  if (!chapter.comix) return '';
  return `
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:11px;">
            <strong style="color:var(--yellow);">COMIX STORY PAGES (${chapter.comix.pageCount})</strong>
            <a href="/comic.html?chapter=${encodeURIComponent(chapter.id)}" style="color:var(--teal);">Open Full Reader →</a>
          </div>
          <div class="comix-strip-thumbs">
            ${Array.from({ length: chapter.comix.pageCount }, (_, i) => {
              const p = i + 1;
              const pad = String(p).padStart(2, '0');
              return `<a href="/comic.html?chapter=${encodeURIComponent(chapter.id)}&page=${p}" title="Read Page ${p}"><img src="/comix/${encodeURIComponent(chapter.id)}/page-${pad}.png" alt="Page ${p}" /></a>`;
            }).join('')}
          </div>
        </div>
      `;
}

function personalBestHtml(rec: LevelClearRecord | undefined): string {
  if (!rec?.cleared) return '';
  return `
        <div class="pb-banner">
          <strong>SECTOR RECORD:</strong> Rank <b>${esc(rec.bestRank)}</b> • ${rec.bestCommands} cmd(s) • ${rec.bestTimeSec}s${rec.chaosCleared ? ' • ⚡ Chaos Contract Cleared' : ''}
        </div>
      `;
}

function deployControlsHtml(state: ChaptersViewState, playFastUrl: string, playFullIntroUrl: string): string {
  if (state.activeChapter.status !== 'playable') {
    return `
            <div style="padding:10px;border:2px dashed var(--yellow);background:#191428;font-size:12px;color:#e8dfc9;">
              <strong>Full Steam Expansion Spec Ready:</strong> Use <code>chapter-architect-intake</code> +
              <code>chapter-implementer</code> to generate and compile this issue's playable rooms &amp; Comix!
            </div>
          `;
  }
  const toggles = `
                  <label class="tactical-toggle-row">
                    <input type="checkbox" id="dossier-tactical" ${state.launchTactical ? 'checked' : ''} />
                    <span>Launch in <strong>Tactical Mode</strong> (turn-based clock while reading/editing)</span>
                  </label>
                  <label class="tactical-toggle-row">
                    <input type="checkbox" id="dossier-chaos" ${state.launchChaos ? 'checked' : ''} />
                    <span><strong>Chaos Contract (<code>cron_chaos</code>)</strong> — randomized PIDs &amp; +25 Silicon Scrap</span>
                  </label>
                `;
  const introLink =
    state.activeLevel.index === 1
      ? `<a class="comic-btn paper" href="${esc(playFullIntroUrl)}">With Cinematic Intro</a>`
      : '';
  return `
            ${toggles}
            <div style="display:flex;flex-wrap:wrap;gap:10px;">
              <a id="deploy-fast-btn" class="comic-btn primary" href="${esc(playFastUrl)}" style="flex:1;">
                Deploy To Level ${String(state.activeLevel.index).padStart(2, '0')} →
              </a>
              ${introLink}
            </div>
          `;
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
  const playOpts = { tactical: state.launchTactical, chaos: state.launchChaos };
  const playFastUrl = buildPlayUrl(chapter.id, level, true, playOpts);
  const playFullIntroUrl = buildPlayUrl(chapter.id, level, false, { ...playOpts, intro: level.index > 1 });

  els.dossierEl.innerHTML = `
      <span class="caption-tag">${esc(chapter.badge)} // LEVEL ${String(level.index).padStart(2, '0')} OF ${String(chapter.levels.length).padStart(2, '0')}</span>
      <h3>${esc(level.title)}</h3>
      <p style="font-size:12.5px;color:#d8d0c1;">
        ${esc(fullSpec?.summary ?? chapter.summary)}
      </p>
      ${personalBestHtml(rec)}

      <dl class="dossier-meta">
        <dt>Directory</dt><dd><code>${esc(level.cwd)}</code></dd>
        <dt>Room Set</dt><dd><code>room.${esc(level.roomKind)}</code></dd>
        <dt>Mechanic</dt><dd>${esc(level.mechanicLabel)}</dd>
        <dt>Ally Spirit</dt><dd>${esc(chapter.allyNpc.name)}</dd>
        <dt>Issue Boss</dt><dd>${esc(chapter.boss.name)} (<code>PID ${chapter.boss.pid}</code>)</dd>
      </dl>

      <div>
        <div style="font-size:11px;color:#9e95b5;margin-bottom:5px;font-weight:600;">TEACHES / SHELL TOOLS</div>
        <div class="chip-list">
          ${level.teaches.map((t) => `<span class="code-chip">${esc(t)}</span>`).join('')}
        </div>
      </div>

      <div>
        <div style="font-size:11px;color:#9e95b5;margin-bottom:5px;font-weight:600;">ACTIVE THREATS</div>
        <div class="chip-list">
          ${
            level.enemies.length > 0
              ? level.enemies.map((e) => `<span class="enemy-chip">malware.${esc(e)}</span>`).join('')
              : `<span class="code-chip">0 hostiles (Sanctuary Safe Zone)</span>`
          }
        </div>
      </div>

      ${deployControlsHtml(state, playFastUrl, playFullIntroUrl)}

      ${comixStripHtml(chapter)}
    `;

  const tacInput = els.dossierEl.querySelector<HTMLInputElement>('#dossier-tactical');
  if (tacInput) {
    tacInput.onchange = () => {
      state.launchTactical = tacInput.checked;
      rerender();
    };
  }
  const chaosInput = els.dossierEl.querySelector<HTMLInputElement>('#dossier-chaos');
  if (chaosInput) {
    chaosInput.onchange = () => {
      state.launchChaos = chaosInput.checked;
      rerender();
    };
  }
}
