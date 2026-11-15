import { isInspectorTab, type InspectorTab } from './inspector-panel.js';

/** `/terminal-lab/<lab-id>?tab=<tab>` (or `?from=<chapterId>/<levelId>[&draft=1]` to import a chapter level). */
export interface LabRoute {
  labId: string | null;
  tab: InspectorTab;
  fromLevel: string | null;
  draft: boolean;
}

export function readRoute(): LabRoute {
  const id = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] ?? '');
  const params = new URLSearchParams(location.search);
  const tab = params.get('tab');
  const from = params.get('from');
  return {
    labId: id || null,
    tab: isInspectorTab(tab) ? tab : 'object',
    fromLevel: from ? from : null,
    draft: params.get('draft') === '1',
  };
}

/** Writes the route. `replace` for the first visit and for tab changes, a history entry for opening another lab. */
export function syncRoute(route: { labId: string; tab: InspectorTab }, replace: boolean): void {
  const url = `/terminal-lab/${encodeURIComponent(route.labId)}?tab=${route.tab}`;
  if (`${location.pathname}${location.search}` === url) return;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
}
