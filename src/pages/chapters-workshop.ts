import { ACHIEVEMENT_SPECS, readAchievements } from '../chapters/achievements.js';
import {
  dossierOf,
  RIG_PERKS,
  purchaseOrTogglePerk,
  readMetagame,
  type MetagameStore,
} from '../chapters/catalog.js';
import { forwardSteamAchievement } from '../chapters/steam-bridge.js';
import { dom } from '../ui/dom-lite.js';
import { renderBinder } from './chapters-binder.js';
import type { ChaptersPageEls, ChaptersViewState } from './chapters-page-model.js';

function renderWorkshop(els: ChaptersPageEls, state: ChaptersViewState, meta: MetagameStore): void {
  if (!els.workshopEl) return;
  const flash = state.workshopBanner ? dom('div', { class: 'workshop-flash' }, [state.workshopBanner]) : null;
  const cards = RIG_PERKS.map((perk) => {
    const owned = meta.unlockedPerks.includes(perk.id);
    const active = meta.activePerks.includes(perk.id);
    const canBuy = meta.scrap >= perk.costScrap;
    const btnLabel = !owned
      ? `Install (${perk.costScrap} Scrap)`
      : active
        ? 'Active in ~/.bashrc (Disable)'
        : 'Disabled (Enable)';
    const btn = dom(
      'button',
      {
        type: 'button',
        class: `comic-btn ${active ? 'teal' : owned || canBuy ? 'primary' : 'paper'} perk-action-btn`,
        'data-perk-id': perk.id,
      },
      [btnLabel],
    );
    btn.onclick = () => {
      const res = purchaseOrTogglePerk(perk.id);
      for (const ev of res.unlockedAchievements ?? []) {
        void forwardSteamAchievement(ev.steamApiName);
        state.bus?.emit({ kind: 'kernel', event: ev });
      }
      if (!res.unlockedAchievements?.length) {
        state.bus?.emit({ kind: 'command', result: res.ok ? 'ok' : 'fail' });
      }
      const achSuffix =
        res.unlockedAchievements && res.unlockedAchievements.length > 0
          ? ` [* Trophy Unlocked: ${res.unlockedAchievements.map((a) => `${a.title} (${a.steamApiName})`).join(', ')}]`
          : '';
      state.workshopBanner = `${res.message}${achSuffix}`;
      renderMetagame(els, state);
    };
    return dom('article', { class: `perk-card ${active ? 'active' : ''}`.trim() }, [
      dom('div', {}, [
        dom('div', { class: 'level-card-top' }, [
          dom('span', { class: `door-kicker ${active ? 'teal' : ''}`.trim() }, [
            owned ? (active ? 'EQUIPPED' : 'OWNED') : `${perk.costScrap} SCRAP`,
          ]),
          dom('code', { style: 'font-size:11px;' }, [perk.bashrcLine]),
        ]),
        dom('h4', { style: 'margin-top:6px;font-family:var(--display);font-size:16px;' }, [perk.title]),
        dom('p', { style: 'font-size:12px;color:#3d3630;margin-top:4px;' }, [perk.effectSummary]),
      ]),
      btn,
    ]);
  });
  els.workshopEl.replaceChildren(...(flash ? [flash, ...cards] : cards));
}

export function captureActiveFocusSelector(): string | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  if (active.id) return `#${CSS.escape(active.id)}`;
  for (const attr of ['data-perk-id', 'data-level-id', 'data-chapter-id']) {
    const val = active.getAttribute(attr);
    if (val) return `[${attr}="${CSS.escape(val)}"]`;
  }
  return null;
}

export function restoreActiveFocus(selector: string | null): void {
  if (!selector) return;
  document.querySelector<HTMLElement>(selector)?.focus();
}

export function renderMetagame(els: ChaptersPageEls, state: ChaptersViewState, onFullRefresh?: () => void): void {
  const focusSel = captureActiveFocusSelector();
  const meta = readMetagame();
  if (els.scrapPillEl) {
    els.scrapPillEl.textContent = `${meta.scrap} SILICON SCRAP`;
  }
  const achCount = Object.keys(readAchievements().unlocked).length;
  if (els.metagameSummaryEl) {
    els.metagameSummaryEl.textContent = `${meta.scrap} Silicon Scrap • ${achCount}/${ACHIEVEMENT_SPECS.length} Trophies • ${meta.activePerks.length}/${RIG_PERKS.length} ~/.bashrc Perks Active • ${meta.usedCommands.length} Commands Practiced • ${meta.seenMalware.length}/${dossierOf(state.activeChapter).length} Entities Logged`;
  }
  if (els.tabGrimoireBtn && els.tabBestiaryBtn) {
    els.tabGrimoireBtn.className = `comic-btn ${state.activeBinderTab === 'grimoire' ? 'teal' : 'paper'}`;
    els.tabBestiaryBtn.className = `comic-btn ${state.activeBinderTab === 'bestiary' ? 'teal' : 'paper'}`;
    els.tabGrimoireBtn.setAttribute('aria-pressed', String(state.activeBinderTab === 'grimoire'));
    els.tabBestiaryBtn.setAttribute('aria-pressed', String(state.activeBinderTab === 'bestiary'));
  }
  if (els.tabAchievementsBtn) {
    els.tabAchievementsBtn.className = `comic-btn ${state.activeBinderTab === 'achievements' ? 'teal' : 'paper'}`;
    els.tabAchievementsBtn.setAttribute('aria-pressed', String(state.activeBinderTab === 'achievements'));
  }
  renderWorkshop(els, state, meta);
  renderBinder(els, state, meta, onFullRefresh ?? (() => renderMetagame(els, state)));
  restoreActiveFocus(focusSel);
}
