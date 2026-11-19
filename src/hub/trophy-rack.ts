import { ACHIEVEMENT_SPECS, presentAchievement, readAchievements } from '../chapters/achievements.js';
import { el } from './dom.js';

export type TrophyFilter = 'all' | 'unlocked' | 'locked';

export function renderTrophyRack(activeFilter: TrophyFilter, onFilter: (next: TrophyFilter) => void): void {
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
