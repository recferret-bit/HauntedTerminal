import '../styles/hub.css';
import '../styles/landing.css';
import '../styles/hub-tabs.css';
import { hydrateFromDesktopSaveBundle } from '../chapters/portable-save.js';
import { wireExternalLinksForDesktop } from '../chapters/steam-bridge.js';
import { renderHubNav } from './nav.js';
import type { HubTabId } from './tabs.js';

/** First thing every hub page does: the header (so Home's waitlist button exists before the waitlist is wired), then desktop link handling. */
export function bootHubPage(current: HubTabId): void {
  renderHubNav(current);
  wireExternalLinksForDesktop();
}

/**
 * Redraw a page when the save changes elsewhere: another tab writes localStorage (`storage`), the page comes back from the
 * back-forward cache (`pageshow`), or the desktop shell hands over its save bundle at start.
 */
export function refreshOnSaveChange(refresh: () => void): void {
  window.addEventListener('storage', () => refresh());
  window.addEventListener('pageshow', (ev) => {
    if (ev.persisted) refresh();
  });
  void hydrateFromDesktopSaveBundle().then((hydrated) => {
    if (hydrated) refresh();
  });
}
