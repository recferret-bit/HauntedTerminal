import { ACHIEVEMENT_SPECS, readAchievements } from '../chapters/achievements.js';
import { CHAPTER_MANIFESTS, buildPlayUrl, isFieldManualAvailable, readChapterProgress, readMetagame } from '../chapters/catalog.js';
import { countClearedSectors } from '../chapters/portable-save.js';
import { isTauriDesktop, querySteamStatus } from '../chapters/steam-bridge.js';
import { refreshOnSaveChange } from './boot.js';
import { el } from './dom.js';
import { readWaitlistEntry } from './waitlist.js';

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
  const progress = readChapterProgress();
  const cleared = countClearedSectors(progress);
  const store = readAchievements();
  const unlocked = Object.keys(store.unlocked).length;
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
  renderManualGates(isFieldManualAvailable(store, progress));
}

function renderManualGates(open: boolean): void {
  const tty = document.getElementById('home-manual-tty');
  if (tty) {
    tty.replaceWith(
      open
        ? el(
            'a',
            { id: 'home-manual-tty', class: 'tty-mini-line tty-mini-link', href: '/manual.html' },
            el('b', {}, '$ manual -9'),
            ' -> ',
            el('em', {}, 'Open Field Manual Book (flags, chmod, search)'),
          )
        : el(
            'span',
            { id: 'home-manual-tty', class: 'tty-mini-line' },
            el('b', {}, '$ manual -9'),
            ' -> ',
            el('em', {}, '[LOCKED] Obtain Field Manual at Server Hub #1'),
          ),
    );
  }
  const demoSlot = document.getElementById('home-manual-demo-slot');
  if (demoSlot) {
    demoSlot.replaceChildren(...(open ? [el('a', { class: 'comic-btn teal', href: '/manual.html' }, 'Field Manual')] : []));
  }
  const door = document.getElementById('home-manual-door-slot');
  if (door) {
    door.replaceWith(
      open
        ? el(
            'a',
            { id: 'home-manual-door-slot', class: 'door-card door-card-wide', href: '/manual.html' },
            el(
              'div',
              {},
              el('div', { class: 'door-card-top' }, el('span', { class: 'door-kicker teal' }, 'FIELD MANUAL // F1'), el('span', {}, 'Page-Flipping Book')),
              el('h3', {}, 'Interactive Unix Terminal Field Manual'),
              el(
                'p',
                {},
                'Flip through every command, flag (',
                el('code', {}, 'kill -9'),
                ', ',
                el('code', {}, 'rm -rf'),
                '), live ',
                el('code', {}, 'chmod'),
                ' octal/symbolic calculator (',
                el('code', {}, '755'),
                '/',
                el('code', {}, '644'),
                '/',
                el('code', {}, '000'),
                '), regex pattern helper, and instant search — also carried in-game as your ',
                el('code', {}, 'manual'),
                ' inventory item (',
                el('code', {}, 'hold manual'),
                ' or press ',
                el('code', {}, 'F1'),
                ').',
              ),
            ),
            el('span', { class: 'door-go' }, 'Open Field Manual Book'),
          )
        : el(
            'div',
            { id: 'home-manual-door-slot', class: 'door-card door-card-wide', 'aria-disabled': 'true' },
            el(
              'div',
              {},
              el('div', { class: 'door-card-top' }, el('span', { class: 'door-kicker' }, 'FIELD MANUAL // LOCKED'), el('span', {}, 'Obtain at Server Hub #1')),
              el('h3', {}, 'Interactive Unix Terminal Field Manual'),
              el(
                'p',
                {},
                'Reach Server Hub #1 in Chapter 1 so the Old Bearded Coder hands you the hardcover Field Manual & Motherboard Map — unlocking this standalone book, ',
                el('code', {}, 'F1'),
                ' in-game, and ',
                el('code', {}, 'ACH_FIELD_MANUAL'),
                '.',
              ),
            ),
            el('span', { class: 'door-go' }, 'Locked — Reach Server Hub #1'),
          ),
    );
  }
}

let runtimeLabel = isTauriDesktop() ? 'Tauri Desktop' : 'WebGL + Offline Fonts';

/** Home: the hero telemetry and resume slot, redrawn when the save or the waitlist pass changes. */
export function mount(): void {
  if (!document.getElementById('steam-funnel')) return;
  const refresh = (): void => renderHeroTelemetry(runtimeLabel);
  refresh();
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
