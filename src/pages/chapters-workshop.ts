import {
  dossierOf,
  RIG_PERKS,
  purchaseOrTogglePerk,
  readMetagame,
  type MetagameStore,
} from '../chapters/catalog.js';
import { esc } from './html-text.js';
import { renderBinder } from './chapters-binder.js';
import type { ChaptersPageEls, ChaptersViewState } from './chapters-page-model.js';

function renderWorkshop(els: ChaptersPageEls, state: ChaptersViewState, meta: MetagameStore): void {
  if (!els.workshopEl) return;
  els.workshopEl.innerHTML =
    (state.workshopBanner ? `<div class="workshop-flash">${esc(state.workshopBanner)}</div>` : '') +
    RIG_PERKS.map((perk) => {
      const owned = meta.unlockedPerks.includes(perk.id);
      const active = meta.activePerks.includes(perk.id);
      const canBuy = meta.scrap >= perk.costScrap;
      const btnLabel = !owned
        ? `Install (${perk.costScrap} Scrap)`
        : active
          ? 'Active in ~/.bashrc (Disable)'
          : 'Disabled (Enable)';
      return `
            <article class="perk-card ${active ? 'active' : ''}">
              <div>
                <div class="level-card-top">
                  <span class="door-kicker ${active ? 'teal' : ''}">${owned ? (active ? 'EQUIPPED' : 'OWNED') : `${perk.costScrap} SCRAP`}</span>
                  <code style="font-size:11px;">${esc(perk.bashrcLine)}</code>
                </div>
                <h4 style="margin-top:6px;font-family:var(--display);font-size:16px;">${esc(perk.title)}</h4>
                <p style="font-size:12px;color:#3d3630;margin-top:4px;">${esc(perk.effectSummary)}</p>
              </div>
              <button
                type="button"
                class="comic-btn ${active ? 'teal' : owned || canBuy ? 'primary' : 'paper'} perk-action-btn"
                data-perk-id="${esc(perk.id)}"
              >
                ${esc(btnLabel)}
              </button>
            </article>
          `;
    }).join('');

  els.workshopEl.querySelectorAll<HTMLButtonElement>('.perk-action-btn').forEach((btn) => {
    btn.onclick = () => {
      const res = purchaseOrTogglePerk(btn.dataset.perkId ?? '');
      state.workshopBanner = res.message;
      renderMetagame(els, state);
    };
  });
}

export function renderMetagame(els: ChaptersPageEls, state: ChaptersViewState): void {
  const meta = readMetagame();
  if (els.scrapPillEl) {
    els.scrapPillEl.textContent = `⚙ ${meta.scrap} SILICON SCRAP`;
  }
  if (els.metagameSummaryEl) {
    els.metagameSummaryEl.textContent = `${meta.scrap} Silicon Scrap • ${meta.activePerks.length}/${RIG_PERKS.length} ~/.bashrc Perks Active • ${meta.usedCommands.length} Commands Practiced • ${meta.seenMalware.length}/${dossierOf(state.activeChapter).length} Entities Logged`;
  }
  if (els.tabGrimoireBtn && els.tabBestiaryBtn) {
    els.tabGrimoireBtn.className = `comic-btn ${state.activeBinderTab === 'grimoire' ? 'teal' : 'paper'}`;
    els.tabBestiaryBtn.className = `comic-btn ${state.activeBinderTab === 'bestiary' ? 'teal' : 'paper'}`;
  }
  renderWorkshop(els, state, meta);
  renderBinder(els, state, meta);
}
