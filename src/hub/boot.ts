import { sceneFor } from '../audio/music-for.js';
import { startPageAudio, type PageAudio } from '../audio/page.js';
import type { AppBus, MusicSurface } from '../contracts/app-bus.js';
import '../styles/hub.css';
import '../styles/landing.css';
import '../styles/hub-tabs.css';
import { hydrateFromDesktopSaveBundle } from '../chapters/portable-save.js';
import { wireExternalLinksForDesktop } from '../chapters/steam-bridge.js';
import { renderHubNav } from './nav.js';
import { renderWaitlistDialog } from './waitlist-dialog.js';
import { wireSteamWaitlist } from './waitlist.js';
import type { HubTabId } from './tabs.js';

/**
 * First thing every hub page does: the header, the Steam waitlist dialog (the header's Steam button opens it on every
 * page), then the waitlist wiring and desktop link handling. A saved pass redraws the current page.
 */
/** One bed for the whole landing: Home, Desktop, Achievements and Comix. */
const HUB_BED: Record<HubTabId, MusicSurface> = {
  home: 'title',
  desktop: 'title',
  achievements: 'title',
  comix: 'title',
};

let hubAudio: PageAudio | null = null;

export function hubBus(): AppBus | null {
  return hubAudio?.bus ?? null;
}

export function setHubMusic(tab: HubTabId): void {
  hubAudio?.bus.emit({ kind: 'scene', scene: sceneFor(HUB_BED[tab]) });
}

export function bootHubPage(current: HubTabId): void {
  hubAudio = startPageAudio(HUB_BED[current]);
  renderHubNav(current);
  if (document.getElementById('hub-header')) renderWaitlistDialog();
  wireSteamWaitlist(() => activeRefresh?.(), hubAudio.bus);
  wireExternalLinksForDesktop();
  installSaveListeners();
}

/** What redraws the page on screen when the save changes; the router sets it on every page it shows. */
let activeRefresh: (() => void) | null = null;
let listening = false;

/**
 * Redraw a page when the save changes elsewhere: another tab writes localStorage (`storage`), the page comes back from the
 * back-forward cache (`pageshow`), or the desktop shell hands over its save bundle at start. Only the page on screen
 * redraws: a page calls this when it is shown, and `clearRefresh` runs when it is replaced.
 */
export function refreshOnSaveChange(refresh: () => void): void {
  activeRefresh = refresh;
}

export function clearRefresh(): void {
  activeRefresh = null;
}

function installSaveListeners(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('storage', () => activeRefresh?.());
  window.addEventListener('pageshow', (ev) => {
    if (ev.persisted) activeRefresh?.();
  });
  void hydrateFromDesktopSaveBundle().then((hydrated) => {
    if (hydrated) activeRefresh?.();
  });
}
