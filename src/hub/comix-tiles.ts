import type { ChapterProgressStore } from '../chapters/catalog.js';
import type { ChapterManifest } from '../chapters/types.js';
import { el } from './dom.js';
import { ROADMAP_CHAPTER_NUMBERS, roadmapLabel } from './roadmap.js';

/** One tile of the Comix page. An `open` tile has a progress and links; a `locked` tile has neither. */
export interface ComixTile {
  kind: 'open' | 'locked';
  key: string;
  title: string;
  badge: string;
  subtitle: string;
  progress?: { cleared: number; total: number };
  readHref?: string;
  playHref?: string;
}

type ManifestView = Pick<ChapterManifest, 'id' | 'title' | 'subtitle' | 'badge' | 'status'> & { levels: readonly unknown[] };

function clearedCount(progress: ChapterProgressStore, chapterId: string): number {
  return Object.values(progress[chapterId] ?? {}).filter((rec) => rec.cleared).length;
}

/**
 * A playable chapter gives an open tile with its progress; a chapter of any other status gives a locked tile; then the
 * roadmap numbers give locked tiles. Pure: the manifests, the saved progress and the roadmap come in as arguments.
 */
export function buildComixTiles(
  manifests: readonly ManifestView[],
  progress: ChapterProgressStore,
  roadmap: readonly number[] = ROADMAP_CHAPTER_NUMBERS,
): ComixTile[] {
  const fromManifests = manifests.map<ComixTile>((m) =>
    m.status === 'playable'
      ? {
          kind: 'open',
          key: m.id,
          title: m.title,
          badge: m.badge,
          subtitle: m.subtitle,
          progress: { cleared: clearedCount(progress, m.id), total: m.levels.length },
          readHref: `/comic.html?chapter=${encodeURIComponent(m.id)}`,
          playHref: `/play/${encodeURIComponent(m.id)}`,
        }
      : { kind: 'locked', key: m.id, title: m.title, badge: m.badge, subtitle: m.subtitle },
  );
  const fromRoadmap = roadmap.map<ComixTile>((n) => ({
    kind: 'locked',
    key: `roadmap-${n}`,
    title: roadmapLabel(n),
    badge: 'ROADMAP',
    subtitle: 'Coming with the Steam edition.',
  }));
  return [...fromManifests, ...fromRoadmap];
}

function renderTile(tile: ComixTile): HTMLElement {
  const top = el('div', { class: 'comix-tile-top' }, el('span', { class: 'door-kicker' }, tile.badge));
  const heading = [top, el('h3', {}, tile.title), el('p', {}, tile.subtitle)];
  if (tile.kind === 'locked') {
    top.append(el('span', { class: 'comix-tile-lock' }, 'LOCKED'));
    return el('article', { class: 'comix-tile locked', 'aria-disabled': 'true', 'data-tile': tile.key }, el('div', {}, ...heading));
  }
  const p = tile.progress ?? { cleared: 0, total: 0 };
  return el(
    'article',
    { class: 'comix-tile open', 'data-tile': tile.key },
    el('div', {}, ...heading),
    el(
      'div',
      { class: 'comix-tile-progress' },
      el('span', {}, `${p.cleared}/${p.total} levels cleared`),
      el('progress', { max: String(p.total), value: String(p.cleared), 'aria-label': `${p.cleared} of ${p.total} levels cleared` }),
    ),
    el(
      'div',
      { class: 'comix-tile-actions' },
      el('a', { class: 'comic-btn teal', href: tile.readHref ?? '#' }, 'Read'),
      el('a', { class: 'comic-btn primary', href: tile.playHref ?? '#' }, 'Play'),
    ),
  );
}

/** Fills `host` with one tile per entry. Locked tiles contain no link or button, so they cannot take focus. */
export function renderComixTiles(host: HTMLElement, tiles: readonly ComixTile[]): void {
  host.replaceChildren(...tiles.map(renderTile));
}
