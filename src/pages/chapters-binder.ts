import { GRIMOIRE_ENTRIES, dossierOf, type MetagameStore } from '../chapters/catalog.js';
import { esc } from './html-text.js';
import type { ChaptersPageEls, ChaptersViewState } from './chapters-page-model.js';

export function renderBinder(els: ChaptersPageEls, state: ChaptersViewState, meta: MetagameStore): void {
  if (!els.binderContentEl) return;
  if (state.activeBinderTab === 'grimoire') {
    els.binderContentEl.innerHTML = GRIMOIRE_ENTRIES.map((g) => {
      const practiced = meta.usedCommands.includes(g.command.split(' ')[0]!);
      return `
            <article class="binder-card">
              <div class="level-card-top">
                <strong style="font-family:var(--display);font-size:16px;">${esc(g.command)}</strong>
                <span class="mech-tag">${esc(g.category)}${practiced ? ' ✓' : ''}</span>
              </div>
              <code class="binder-syntax">${esc(g.syntax)}</code>
              <p style="font-size:12px;"><strong>Linux Reality:</strong> ${esc(g.realWorld)}</p>
              <p style="font-size:12px;color:#0a5c44;"><strong>Comic Stage:</strong> ${esc(g.comicEffect)}</p>
            </article>
          `;
    }).join('');
    return;
  }
  els.binderContentEl.innerHTML = dossierOf(state.activeChapter).map((b) => {
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
