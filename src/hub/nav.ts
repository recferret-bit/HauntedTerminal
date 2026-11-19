import { el } from './dom.js';
import { HOME_HREF, hubItems, type HubItem, type HubTabId } from './tabs.js';

function renderItem(item: HubItem, current: HubTabId): HTMLElement {
  const cls = `comic-btn ${item.tone}`;
  if (item.kind === 'steam') {
    // On Home the waitlist code finds this button; on every other tab it is a link to Home's dialog.
    return current === 'home'
      ? el('button', { type: 'button', class: cls, 'data-open-waitlist': '1' }, item.label)
      : el('a', { class: cls, href: item.href }, item.label);
  }
  const isCurrent = item.kind === 'tab' && item.tab === current;
  return el('a', { class: isCurrent ? `${cls} active` : cls, href: item.href, 'aria-current': isCurrent ? 'page' : undefined }, item.label);
}

/** The shared header of the hub pages. Fills `#hub-header` (a `<header class="hub-header-wrap">`). */
export function renderHubNav(current: HubTabId, host: HTMLElement | null = document.getElementById('hub-header')): void {
  if (!host) return;
  host.replaceChildren(
    el('a', { class: 'skip-link', href: '#main-heading' }, 'Skip to main content'),
    el(
      'nav',
      { class: 'hub-nav', 'aria-label': 'Primary Navigation' },
      el(
        'a',
        { class: 'hub-brand', href: HOME_HREF, 'aria-current': current === 'home' ? 'page' : undefined },
        el('span', { class: 'hub-logo-badge' }, 'COMIX // TTY'),
        el('strong', {}, 'HAUNTED ', el('span', {}, 'TERMINAL')),
      ),
      el('div', { class: 'hub-nav-links' }, ...hubItems().map((item) => renderItem(item, current))),
    ),
  );
}
