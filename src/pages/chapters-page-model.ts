import type { AppBus } from '../contracts/app-bus.js';
import type { ChapterLevelSummary, ChapterManifest } from '../chapters/types.js';

export interface ChaptersViewState {
  activeChapter: ChapterManifest;
  activeLevel: ChapterLevelSummary;
  launchChaos: boolean;
  activeBinderTab: 'grimoire' | 'bestiary' | 'achievements';
  workshopBanner: string;
  bus?: AppBus;
}

export interface ChaptersPageEls {
  rackEl: HTMLElement;
  gridEl: HTMLElement;
  dossierEl: HTMLElement;
  headingEl: HTMLElement;
  subtitleEl: HTMLElement;
  summaryCountEl: HTMLElement;
  scrapPillEl: HTMLElement | null;
  workshopEl: HTMLElement | null;
  binderContentEl: HTMLElement | null;
  tabGrimoireBtn: HTMLButtonElement | null;
  tabBestiaryBtn: HTMLButtonElement | null;
  tabAchievementsBtn: HTMLButtonElement | null;
  metagameSummaryEl: HTMLElement | null;
}

export function syncChaptersUrl(state: ChaptersViewState): void {
  const q = new URLSearchParams();
  q.set('chapter', state.activeChapter.id);
  q.set('level', state.activeLevel.id);
  if (state.launchChaos) q.set('chaos', '1');
  if (state.activeBinderTab !== 'grimoire') q.set('tab', state.activeBinderTab);
  window.history.replaceState(null, '', `/chapters.html?${q.toString()}`);
}
