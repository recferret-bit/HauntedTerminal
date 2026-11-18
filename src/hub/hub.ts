import '../styles/hub.css';
import '../styles/landing.css';
import {
  ACHIEVEMENT_SPECS,
  presentAchievement,
  readAchievements,
} from '../chapters/achievements.js';
import {
  CHAPTER_MANIFESTS,
  buildPlayUrl,
  readChapterProgress,
  readMetagame,
} from '../chapters/catalog.js';
import {
  countClearedSectors,
  exportPortableSaveFile,
  hydrateFromDesktopSaveBundle,
  importPortableSaveBundle,
} from '../chapters/portable-save.js';
import { isTauriDesktop, querySteamStatus, wireExternalLinksForDesktop } from '../chapters/steam-bridge.js';
import { readWaitlistEntry, wireSteamWaitlist } from './waitlist.js';

type Child = Node | string | null | undefined | false;
type TrophyFilter = 'all' | 'unlocked' | 'locked';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined | ((ev: Event) => void)> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = String(v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

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

function renderTrophyRack(activeFilter: TrophyFilter, onFilter: (next: TrophyFilter) => void): void {
  const host = document.getElementById('achievements-rack-host');
  if (!host) return;
  const focusedKey =
    document.activeElement instanceof HTMLElement && host.contains(document.activeElement)
      ? document.activeElement.getAttribute('data-focus-key')
      : null;

  const store = readAchievements();
  const views = ACHIEVEMENT_SPECS.map((s) => presentAchievement(s, store));
  const unlockedCount = views.filter((v) => v.unlocked).length;
  const pct = Math.round((unlockedCount / ACHIEVEMENT_SPECS.length) * 100);
  const filtered = views.filter((v) =>
    activeFilter === 'unlocked' ? v.unlocked : activeFilter === 'locked' ? !v.unlocked : true,
  );

  const filterBar = el(
    'div',
    { class: 'binder-tabs', role: 'group', 'aria-label': 'Filter local achievements' },
    ...(['all', 'unlocked', 'locked'] as const).map((f) => {
      const count = f === 'all' ? views.length : f === 'unlocked' ? unlockedCount : views.length - unlockedCount;
      return el(
        'button',
        {
          type: 'button',
          class: `comic-btn ${activeFilter === f ? 'teal' : 'paper'}`,
          'aria-pressed': activeFilter === f ? 'true' : 'false',
          'data-focus-key': `ach-filter-${f}`,
          onclick: () => onFilter(f),
        },
        `${f.toUpperCase()} (${count})`,
      );
    }),
  );

  const progressEl = el('progress', {
    class: 'ach-progress',
    max: String(ACHIEVEMENT_SPECS.length),
    value: String(unlockedCount),
    'aria-label': `${unlockedCount} of ${ACHIEVEMENT_SPECS.length} local achievements unlocked`,
  });

  const meter = el(
    'div',
    { class: 'ach-meter-wrap' },
    filterBar,
    progressEl,
    el('strong', {}, `${unlockedCount}/${ACHIEVEMENT_SPECS.length} Unlocked (${pct}%)`),
  );

  const cards = el(
    'div',
    { class: 'trophy-grid' },
    ...(filtered.length > 0
      ? filtered.map((v) =>
          el(
            'article',
            { class: `trophy-card ${v.unlocked ? 'unlocked' : 'locked'}` },
            el(
              'div',
              {},
              el(
                'div',
                { class: 'trophy-top' },
                el('span', { class: 'trophy-icon-badge', 'aria-hidden': 'true' }, v.icon),
                el('span', { class: `mech-tag ${v.unlocked ? 'hub' : ''}` }, `${v.category} • ${v.unlocked ? 'UNLOCKED' : 'LOCKED'}`),
              ),
              el('h3', { class: 'trophy-title' }, v.title),
              el('p', { class: 'trophy-desc' }, v.description),
            ),
            el(
              'div',
              { class: 'trophy-foot' },
              el('code', { class: 'trophy-api-key' }, v.steamApiName),
              el(
                'span',
                {},
                v.unlocked && v.unlockedAt
                  ? `Unlocked ${new Date(v.unlockedAt).toISOString().slice(0, 10)}`
                  : 'Steamworks 1:1 Ready',
              ),
            ),
          ),
        )
      : [el('p', { class: 'trophy-empty' }, 'No achievements in this filter yet — launch the browser demo and run `ls -la` or `kill -9`!')]),
  );

  host.replaceChildren(meter, cards);
  if (focusedKey) {
    host.querySelector<HTMLElement>(`[data-focus-key="${focusedKey}"]`)?.focus();
  }
}

function wirePortableSaves(refreshAll: () => void): void {
  const exportBtn = document.getElementById('export-save-btn') as HTMLButtonElement | null;
  const importBtn = document.getElementById('import-save-btn') as HTMLButtonElement | null;
  const importInput = document.getElementById('import-save-input') as HTMLInputElement | null;
  const feedback = document.getElementById('save-portability-feedback');

  const showFeedback = (msg: string, isErr = false): void => {
    if (!feedback) return;
    feedback.hidden = false;
    feedback.classList.toggle('err', isErr);
    feedback.textContent = msg;
  };

  if (exportBtn) {
    exportBtn.onclick = async () => {
      const { bundle, savedPath } = await exportPortableSaveFile('haunted-terminal-save.json');
      if (!savedPath) {
        showFeedback('Could not export save bundle to the Downloads directory.', true);
        return;
      }
      const unlocked = Object.keys(bundle.achievements.unlocked).length;
      const fileLabel = savedPath.split(/[\\/]/).pop() ?? savedPath;
      showFeedback(`Exported ${fileLabel} (${unlocked}/${ACHIEVEMENT_SPECS.length} ACH_* trophies & campaign progress).`);
    };
  }

  if (importBtn && importInput) {
    importBtn.onclick = () => importInput.click();
    importInput.onchange = async () => {
      const file = importInput.files?.[0];
      importInput.value = '';
      if (!file) return;
      const text = await file.text();
      const res = importPortableSaveBundle(text);
      showFeedback(res.message, !res.ok);
      if (res.ok) refreshAll();
    };
  }
}

function bootstrapLandingFunnel(): void {
  if (!document.getElementById('steam-funnel')) return;
  let filter: TrophyFilter = 'all';
  let runtimeLabel = isTauriDesktop() ? 'Tauri Desktop' : 'WebGL + Offline Fonts';

  const refresh = (): void => {
    renderHeroTelemetry(runtimeLabel);
    renderTrophyRack(filter, (next) => {
      filter = next;
      refresh();
    });
  };

  refresh();
  wireExternalLinksForDesktop();
  wirePortableSaves(refresh);
  wireSteamWaitlist(() => refresh());

  window.addEventListener('storage', () => refresh());
  window.addEventListener('pageshow', (ev) => {
    if (ev.persisted) refresh();
  });

  void hydrateFromDesktopSaveBundle().then((hydrated) => {
    if (hydrated) refresh();
  });

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
