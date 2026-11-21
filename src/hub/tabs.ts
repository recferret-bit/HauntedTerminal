import { CHAPTER_MANIFESTS } from '../chapters/catalog.js';

/**
 * The header of the hub pages as one table (spec .kiro/specs/landing-tabs/). `tab` items are pages of the landing and
 * can be the current one; `link` items leave it; the `steam` action opens the waitlist dialog on Home and links to it
 * from every other page.
 */
export type HubTabId = 'home' | 'desktop' | 'achievements' | 'comix';

export type HubItemKind = 'tab' | 'link' | 'steam';

export interface HubItem {
  id: string;
  label: string;
  href: string;
  kind: HubItemKind;
  /** The `comic-btn` colour class. */
  tone: 'primary' | 'teal' | 'paper' | 'steam-cta';
  /** Set for tab items: the page they open. */
  tab?: HubTabId;
}

export const HOME_HREF = '/';
export const WISHLIST_HREF = '/?wishlist=1';

/** The game entry: the first chapter of the catalog (no chapter id is written in code). */
function playHref(): string {
  const first = CHAPTER_MANIFESTS[0];
  return first ? `/play/${encodeURIComponent(first.id)}` : '/chapters.html';
}

export function hubItems(): HubItem[] {
  return [
    { id: 'play', label: 'Play Free Demo', href: playHref(), kind: 'link', tone: 'primary' },
    { id: 'steam', label: 'Steam Coming Soon', href: WISHLIST_HREF, kind: 'steam', tone: 'steam-cta' },
    { id: 'desktop', label: 'Desktop Builds', href: '/desktop.html', kind: 'tab', tone: 'teal', tab: 'desktop' },
    { id: 'achievements', label: 'Achievements', href: '/achievements.html', kind: 'tab', tone: 'paper', tab: 'achievements' },
    { id: 'comix', label: 'Comix', href: '/comix.html', kind: 'tab', tone: 'paper', tab: 'comix' },
    { id: 'chapters', label: 'Chapters & Workshop', href: '/chapters.html', kind: 'link', tone: 'paper' },
  ];
}
