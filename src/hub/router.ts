import { clearRefresh, setHubMusic } from './boot.js';
import { mount as mountAchievements } from './page-achievements.js';
import { mount as mountComix } from './page-comix.js';
import { mount as mountDesktop } from './page-desktop.js';
import { mount as mountHome } from './hub.js';
import { markCurrentTab } from './nav.js';
import { TAB_PATHS, tabOfPath, type HubTabId } from './tabs.js';
import { syncSteamCtaLabels } from './waitlist.js';

/**
 * Tab switching without a page load. The four hub pages share one header and one script. Once the first page is up,
 * the other three pages are fetched and kept; a click on a tab swaps the page content in place (the header and the
 * waitlist dialog never move), updates the URL and mounts the new page. Anything that goes wrong falls back to a normal
 * navigation. Spec: .kiro/specs/landing-tabs/.
 */
const MOUNT: Record<HubTabId, () => void> = { home: mountHome, desktop: mountDesktop, achievements: mountAchievements, comix: mountComix };
/** The parts of a hub page that change from tab to tab: everything in `<body>` after the header. */
const CONTENT = 'body > main, body > footer.hub-footer-wrap';

const pages = new Map<HubTabId, Document>();
let current: HubTabId;
/** The newest switch; an older one still waiting for its page gives up. */
let latest = 0;

async function fetchPage(tab: HubTabId): Promise<Document> {
  const cached = pages.get(tab);
  if (cached) return cached;
  const res = await fetch(TAB_PATHS[tab], { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${TAB_PATHS[tab]}: ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  pages.set(tab, doc);
  return doc;
}

function swapContent(doc: Document): void {
  document.querySelectorAll(CONTENT).forEach((node) => node.remove());
  let anchor: Element | null = document.getElementById('hub-header');
  doc.querySelectorAll(CONTENT).forEach((node) => {
    const copy = document.importNode(node, true) as Element;
    anchor?.after(copy);
    anchor = copy;
  });
  document.title = doc.title;
  const description = doc.querySelector('meta[name="description"]')?.getAttribute('content');
  if (description) document.querySelector('meta[name="description"]')?.setAttribute('content', description);
}

function show(tab: HubTabId, doc: Document): void {
  clearRefresh();
  swapContent(doc);
  markCurrentTab(tab);
  current = tab;
  setHubMusic(tab);
  syncSteamCtaLabels();
  window.scrollTo(0, 0);
  MOUNT[tab]();
}

/** Switch to a tab. Instant when its page is already fetched; a failure becomes a normal navigation. */
async function go(tab: HubTabId, push: boolean): Promise<void> {
  const mine = ++latest;
  if (tab === current) return;
  try {
    const doc = pages.get(tab) ?? (await fetchPage(tab));
    if (mine !== latest) return;
    if (push) history.pushState(null, '', TAB_PATHS[tab]);
    show(tab, doc);
  } catch {
    location.assign(TAB_PATHS[tab]);
  }
}

/** The tab a plain left click on this link opens, or null when the browser should handle it. */
function tabOfClick(ev: MouseEvent): HubTabId | null {
  if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return null;
  const a = ev.target instanceof Element ? ev.target.closest('a[href]') : null;
  if (!a || (a.getAttribute('target') ?? '_self') !== '_self' || a.hasAttribute('download')) return null;
  const url = new URL(a.getAttribute('href') ?? '', location.href);
  return url.origin === location.origin && !url.search && !url.hash ? tabOfPath(url.pathname) : null;
}

/** Fetch every page in the background once the first one is drawn (the one on screen too: it is a tab to come back to). */
function preloadAll(): void {
  const run = (): void => {
    for (const tab of Object.keys(TAB_PATHS) as HubTabId[]) void fetchPage(tab).catch(() => {});
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1500 });
  else setTimeout(run, 200);
}

/** Mount the page already in the document and take over the tab links. */
export function startHubRouter(first: HubTabId): void {
  current = first;
  MOUNT[first]();
  document.addEventListener('click', (ev) => {
    const tab = tabOfClick(ev);
    if (!tab) return;
    ev.preventDefault();
    void go(tab, true);
  });
  window.addEventListener('popstate', () => {
    const tab = tabOfPath(location.pathname);
    if (tab) void go(tab, false);
    else location.reload();
  });
  preloadAll();
}
