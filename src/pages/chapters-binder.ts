import { ACHIEVEMENT_SPECS, presentAchievement, readAchievements } from '../chapters/achievements.js';
import { GRIMOIRE_ENTRIES, dossierOf, type MetagameStore } from '../chapters/catalog.js';
import { exportPortableSaveFile, importPortableSaveBundle } from '../chapters/portable-save.js';
import { esc } from './html-text.js';
import type { ChaptersPageEls, ChaptersViewState } from './chapters-page-model.js';

function renderAchievementsBinder(host: HTMLElement, state: ChaptersViewState, onRefresh: () => void): void {
  const store = readAchievements();
  const unlockedCount = Object.keys(store.unlocked).length;

  const bar = document.createElement('div');
  bar.className = 'workshop-flash';
  bar.style.display = 'flex';
  bar.style.flexWrap = 'wrap';
  bar.style.alignItems = 'center';
  bar.style.justifyContent = 'space-between';
  bar.style.gap = '8px';

  const summary = document.createElement('span');
  summary.textContent =
    state.workshopBanner && state.activeBinderTab === 'achievements'
      ? `${unlockedCount}/${ACHIEVEMENT_SPECS.length} LOCAL ACHIEVEMENTS UNLOCKED • ${state.workshopBanner}`
      : `${unlockedCount}/${ACHIEVEMENT_SPECS.length} LOCAL ACHIEVEMENTS UNLOCKED • 1:1 Steamworks API keys (ACH_*) ready for desktop & Auto-Cloud sync.`;

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.flexWrap = 'wrap';
  actions.style.gap = '8px';

  const expBtn = document.createElement('button');
  expBtn.type = 'button';
  expBtn.id = 'chapters-export-save-btn';
  expBtn.className = 'comic-btn paper';
  expBtn.textContent = 'Export Save (.json)';
  expBtn.onclick = async () => {
    const { savedPath } = await exportPortableSaveFile();
    state.bus?.emit({ kind: 'command', result: savedPath ? 'ok' : 'fail' });
    const label = savedPath ? savedPath.split(/[\\/]/).pop() ?? savedPath : '';
    state.workshopBanner = savedPath
      ? `Exported ${label}.`
      : 'Could not export save bundle to the Downloads directory.';
    onRefresh();
  };

  const impInput = document.createElement('input');
  impInput.type = 'file';
  impInput.id = 'chapters-import-save-input';
  impInput.accept = 'application/json,.json';
  impInput.hidden = true;

  const impBtn = document.createElement('button');
  impBtn.type = 'button';
  impBtn.id = 'chapters-import-save-btn';
  impBtn.className = 'comic-btn primary';
  impBtn.textContent = 'Import Save (.json)';
  impBtn.onclick = () => impInput.click();

  impInput.onchange = async () => {
    const file = impInput.files?.[0];
    impInput.value = '';
    if (!file) return;
    const res = importPortableSaveBundle(await file.text());
    state.bus?.emit({ kind: 'command', result: res.ok ? 'ok' : 'fail' });
    state.workshopBanner = res.message;
    onRefresh();
  };

  actions.append(expBtn, impBtn, impInput);
  bar.append(summary, actions);

  const cards = ACHIEVEMENT_SPECS.map((spec) => {
    const view = presentAchievement(spec, store);
    const card = document.createElement('article');
    card.className = 'binder-card';
    const top = document.createElement('div');
    top.className = 'level-card-top';
    const title = document.createElement('strong');
    title.style.fontFamily = 'var(--display)';
    title.style.fontSize = '15px';
    title.textContent = `${view.icon} ${view.title}`;
    const tag = document.createElement('span');
    tag.className = `mech-tag ${view.unlocked ? 'hub' : ''}`;
    tag.textContent = `${view.category}${view.unlocked ? ' • UNLOCKED' : ''}`;
    top.append(title, tag);

    const api = document.createElement('code');
    api.className = 'binder-syntax';
    api.textContent = view.steamApiName;

    const desc = document.createElement('p');
    desc.style.fontSize = '12px';
    desc.textContent = view.description;

    card.append(top, api, desc);
    return card;
  });

  host.replaceChildren(bar, ...cards);
}

export function renderBinder(
  els: ChaptersPageEls,
  state: ChaptersViewState,
  meta: MetagameStore,
  onRefresh: () => void,
): void {
  if (!els.binderContentEl) return;
  if (state.activeBinderTab === 'achievements') {
    renderAchievementsBinder(els.binderContentEl, state, onRefresh);
    return;
  }
  if (state.activeBinderTab === 'grimoire') {
    els.binderContentEl.innerHTML = GRIMOIRE_ENTRIES.map((g) => {
      const practiced = meta.usedCommands.includes(g.command.split(' ')[0]!);
      return `
            <article class="binder-card">
              <div class="level-card-top">
                <strong style="font-family:var(--display);font-size:16px;">${esc(g.command)}</strong>
                <span class="mech-tag">${esc(g.category)}${practiced ? ' [x]' : ''}</span>
              </div>
              <code class="binder-syntax">${esc(g.syntax)}</code>
              <p style="font-size:12px;"><strong>Linux Reality:</strong> ${esc(g.realWorld)}</p>
              <p style="font-size:12px;color:#0a5c44;"><strong>Comic Stage:</strong> ${esc(g.comicEffect)}</p>
            </article>
          `;
    }).join('');
    return;
  }
  const parodyBanner = `<div class="workshop-flash">◈ KIRO PARODY &amp; NON-AFFILIATION NOTICE: The "Big Four" (Anti-Gravy, Codec, Gork, Clod) are original fictional parody characters—no real AI brands are used or affiliated. Run <code>kiro disclaimer</code> in the terminal for details.</div>`;
  els.binderContentEl.innerHTML = parodyBanner + dossierOf(state.activeChapter).map((b) => {
    const seen = meta.seenMalware.includes(b.id);
    return `
            <article class="binder-card">
              <div class="level-card-top">
                <strong style="font-family:var(--display);font-size:15px;">${esc(b.name)}</strong>
                <span class="mech-tag ${b.role === 'BOSS' ? 'boss' : b.role === 'ALLY' ? 'hub' : ''}">${esc(b.role)}${seen ? ' • LOGGED' : ''}</span>
              </div>
              <code class="binder-syntax">${esc(b.model)}</code>
              <p style="font-size:12px;"><strong>Hardware Host:</strong> ${esc(b.hostHardware)}</p>
              <p style="font-size:12px;color:#8e1f4a;"><strong>Counterplay:</strong> ${esc(b.counterplay)}</p>
            </article>
          `;
  }).join('');
}
