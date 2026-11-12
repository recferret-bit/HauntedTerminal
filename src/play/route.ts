/** What `/play/<chapter>/<level>` (or `/play/<chapter>/floor/<n>`) names. Flags stay on the query string. */
export interface PlayRoute {
  chapter: string;
  level?: string;
  floor: number;
  search: URLSearchParams;
}

/**
 * Chapter and level come from the path. `/play/chapter-01-kiroween/level-01-tutorial`.
 * A query string still supplies anything the path omits, and the mode flags (`nointro`, `dev`, `chaos`, `tactical`, `seed`, `intro`).
 */
export function readPlayRoute(pathname: string, search: string): PlayRoute {
  const params = new URLSearchParams(search);
  const parts = pathname.split('/').filter(Boolean);
  let chapter = params.get('chapter') ?? '';
  let level = params.get('level') ?? undefined;
  let floor = Number(params.get('floor') ?? '0');
  if (parts[0] === 'play' && parts[1]) {
    chapter = decodeURIComponent(parts[1]);
    if (parts[2] === 'floor' && parts[3]) floor = Number(parts[3]);
    else if (parts[2]) level = decodeURIComponent(parts[2]);
  }
  if (!Number.isFinite(floor)) floor = 0;
  return { chapter, level, floor, search: params };
}
