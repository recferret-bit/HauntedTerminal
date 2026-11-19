import { ACHIEVEMENT_SPECS, readAchievements } from '../chapters/achievements.js';
import { CHAPTER_MANIFESTS, buildPlayUrl, readChapterProgress, readMetagame } from '../chapters/catalog.js';
import { countClearedSectors } from '../chapters/portable-save.js';
import { isTauriDesktop, querySteamStatus } from '../chapters/steam-bridge.js';
import { bootHubPage, refreshOnSaveChange } from './boot.js';
import { el } from './dom.js';
import { readWaitlistEntry, wireSteamWaitlist } from './waitlist.js';

function findNextUnclearLevel(): { url: string; label: string } | null {
  const manifest = CHAPTER_MANIFESTS[0];
  if (!manifest) return null;
  const progress = readChapterProgress()[manifest.id] ?? {};
  const clearedIds = Object.keys(progress).filter((id) => progress[id]?.cleared);
  if (clearedIds.length === 0) return null;
  const next = manifest.levels.find((l) => !progress[l.id]?.cleared) ?? manifest.levels[manifest.levels.length - 1];
  if (!next) return null;
  return {
    url: buildPlayUrl(manifest.id, next, true),
    label: `Continue Sector ${String(next.index).padStart(2, '0')} (${clearedIds.length}/${manifest.levels.length} Cleared) >`,
  };
}

function renderHeroTelemetry(runtimeLabel: string): void {
  const strip = document.getElementById('hero-telemetry-strip');
  if (!strip) return;
  const manifest = CHAPTER_MANIFESTS[0];
  const totalLevels = manifest?.levels.length ?? 11;
  const cleared = countClearedSectors(readChapterProgress());
  const unlocked = Object.keys(readAchievements().unlocked).length;
  const scrap = readMetagame().scrap;
  const waitlist = readWaitlistEntry();

  const chips: HTMLElement[] = [
    el('span', { class: 'telemetry-chip' }, 'Demo Progress: ', el('strong', {}, `${cleared}/${totalLevels} Sectors`)),
    el('span', { class: 'telemetry-chip' }, 'Local Trophies: ', el('strong', {}, `${unlocked}/${ACHIEVEMENT_SPECS.length} ACH_*`)),
    el('span', { class: 'telemetry-chip' }, 'Silicon Scrap: ', el('strong', {}, String(scrap))),
    el('span', { class: 'telemetry-chip' }, 'Runtime: ', el('strong', {}, runtimeLabel)),
  ];
  if (waitlist) {
    chips.push(el('span', { class: 'telemetry-chip' }, 'Steam Alert: ', el('strong', {}, `${waitlist.platform.toUpperCase()} SAVED`)));
  }
  strip.replaceChildren(...chips);

  const resumeSlot = document.getElementById('hero-resume-slot');
  if (resumeSlot) {
    const resume = findNextUnclearLevel();
    resumeSlot.replaceChildren(
      ...(resume ? [el('a', { class: 'comic-btn paper cta-lg', href: resume.url }, resume.label)] : []),
    );
  }
}

function bootstrapLandingFunnel(): void {
  bootHubPage('home');
  if (!document.getElementById('steam-funnel')) return;
  let runtimeLabel = isTauriDesktop() ? 'Tauri Desktop' : 'WebGL + Offline Fonts';

  const refresh = (): void => {
    renderHeroTelemetry(runtimeLabel);
  };

  refresh();
  wireSteamWaitlist(() => refresh());

  refreshOnSaveChange(refresh);

  void querySteamStatus().then((st) => {
    if (st.tauri) {
      runtimeLabel = st.steamRunning
        ? `Tauri + ${st.steamDeck ? 'Steam Deck' : 'Steamworks'} (App ${st.appId ?? 'Dev'})`
        : 'Tauri Desktop (Offline)';
      refresh();
    }
  });
}

bootstrapLandingFunnel();
