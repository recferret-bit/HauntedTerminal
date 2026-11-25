import '../contracts/migrate-storage.js';
import '../styles/hub.css';
import '../styles/manual-book.css';

import { resolveManualPageIndex } from '../game/manual-catalog.js';
import type { BookPage } from '../game/manual-types.js';
import { mountManualBook } from '../ui/manual-book.js';

function syncUrl(page: BookPage): void {
  const url = new URL(window.location.href);
  url.searchParams.set('page', String(page.index + 1));
  if (page.kind === 'command') {
    url.searchParams.set('cmd', page.entry.command);
  } else {
    url.searchParams.delete('cmd');
  }
  url.searchParams.delete('q');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

const mount = document.getElementById('manual-mount');
if (mount) {
  const params = new URLSearchParams(window.location.search);
  const cmd = params.get('cmd')?.trim() ?? '';
  const query = params.get('q')?.trim() ?? '';
  const pageParam = Number.parseInt(params.get('page') ?? '', 10);

  const initialQuery = cmd || query || undefined;
  const initialPage = initialQuery
    ? resolveManualPageIndex(initialQuery)
    : Number.isFinite(pageParam) && pageParam >= 1
      ? pageParam - 1
      : 0;

  mountManualBook(mount, {
    modal: false,
    initialQuery,
    initialPage,
    onPageChange: syncUrl,
  });
}
