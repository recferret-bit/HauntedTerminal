import { MANUAL_NAV_AND_FILES } from './manual-cmds-nav.js';
import { MANUAL_TEXT_AND_PROCS } from './manual-cmds-text.js';
import { MANUAL_TOOLS_AND_META } from './manual-cmds-meta.js';
import { MANUAL_GUIDES } from './manual-guides.js';
import type {
  BookPage,
  ManualCommandEntry,
  ManualSearchHit,
  ManualSectionId,
  ManualSectionInfo,
  ManualSkillFilter,
} from './manual-types.js';

export * from './manual-types.js';

export const MANUAL_COMMANDS: readonly ManualCommandEntry[] = [
  ...MANUAL_NAV_AND_FILES,
  ...MANUAL_TEXT_AND_PROCS,
  ...MANUAL_TOOLS_AND_META,
];

export { MANUAL_GUIDES };

const SECTION_ORDER: readonly { id: ManualSectionId; code: string; title: string; shortTitle: string }[] = [
  { id: 'cover', code: '00', title: 'Cover & Table of Contents', shortTitle: 'Index' },
  { id: 'guides', code: '01', title: 'Deep Guides & Calculators', shortTitle: 'Guides' },
  { id: 'look-move', code: '02', title: 'Look & Navigation', shortTitle: 'Look' },
  { id: 'files-perms', code: '03', title: 'Files & Permissions', shortTitle: 'Files' },
  { id: 'text-pipes', code: '04', title: 'Text & Streams', shortTitle: 'Text' },
  { id: 'procs-signals', code: '05', title: 'Processes & Signals', shortTitle: 'Kill/PS' },
  { id: 'code-tools', code: '06', title: 'Code, Docker & Kiro.d', shortTitle: 'Tools' },
  { id: 'game-meta', code: '07', title: 'Help, Hints & Meta', shortTitle: 'Meta' },
];

function buildPagesAndSections(): { pages: BookPage[]; sections: ManualSectionInfo[] } {
  const pages: BookPage[] = [
    { index: 0, kind: 'cover', section: 'cover', title: 'Terminal Field Manual' },
    { index: 1, kind: 'toc', section: 'cover', title: 'Table of Contents' },
  ];
  for (const guide of MANUAL_GUIDES) {
    pages.push({ index: pages.length, kind: 'guide', section: guide.section, title: guide.title, guide });
  }
  for (const sec of SECTION_ORDER) {
    if (sec.id === 'cover' || sec.id === 'guides') continue;
    for (const entry of MANUAL_COMMANDS) {
      if (entry.section === sec.id) {
        pages.push({ index: pages.length, kind: 'command', section: sec.id, title: entry.command, entry });
      }
    }
  }
  const sections: ManualSectionInfo[] = SECTION_ORDER.map((s) => {
    const first = pages.find((p) => p.section === s.id);
    return { ...s, startPage: first ? first.index : 0 };
  });
  return { pages, sections };
}

const BUILT = buildPagesAndSections();
export const BOOK_PAGES: readonly BookPage[] = BUILT.pages;
export const BOOK_SECTIONS: readonly ManualSectionInfo[] = BUILT.sections;

const SECTION_LABEL_MAP = Object.fromEntries(SECTION_ORDER.map((s) => [s.id, s.shortTitle])) as Record<ManualSectionId, string>;

export function findCommandDoc(name: string): ManualCommandEntry | undefined {
  const clean = name.trim().toLowerCase();
  return MANUAL_COMMANDS.find((c) => c.command === clean || c.aliases.includes(clean));
}

/** Format `rwxr-xr-x` and octal string (`755`) from a 0..0o777 permission mask. */
export function formatChmodPreview(modeBits: number): {
  octal: string;
  modeText: string;
  symbolic: string;
  ownerDigits: [number, number, number];
  summary: string;
} {
  const m = modeBits & 0o777;
  const u = (m >> 6) & 7;
  const g = (m >> 3) & 7;
  const o = m & 7;
  const triad = (n: number) => `${n & 4 ? 'r' : '-'}${n & 2 ? 'w' : '-'}${n & 1 ? 'x' : '-'}`;
  const sym = (n: number) => `${n & 4 ? 'r' : ''}${n & 2 ? 'w' : ''}${n & 1 ? 'x' : ''}`;
  const describe = (n: number): string => {
    if (n === 7) return 'read, write & exec';
    if (n === 6) return 'read & write';
    if (n === 5) return 'read & exec';
    if (n === 4) return 'read only';
    if (n === 3) return 'write & exec';
    if (n === 2) return 'write only';
    if (n === 1) return 'exec only';
    return 'no access';
  };
  return {
    octal: `${u}${g}${o}`,
    modeText: `-${triad(u)}${triad(g)}${triad(o)}`,
    symbolic: `u=${sym(u)},g=${sym(g)},o=${sym(o)}`,
    ownerDigits: [u, g, o],
    summary: `Owner: ${describe(u)} | Group: ${describe(g)} | Others: ${describe(o)}`,
  };
}

/** Find the book page index for a command, alias, flag, number, or search query. */
export function resolveManualPageIndex(query: string): number {
  const raw = query.trim();
  const clean = raw.toLowerCase();
  if (!clean) return 0;
  const exactCmd = BOOK_PAGES.find(
    (p) => p.kind === 'command' && (p.entry.command.toLowerCase() === clean || p.entry.aliases.includes(clean)),
  );
  if (exactCmd) return exactCmd.index;
  const exactGuide = BOOK_PAGES.find((p) => p.kind === 'guide' && p.guide.id.toLowerCase() === clean);
  if (exactGuide) return exactGuide.index;
  const hits = searchManual(raw);
  return hits[0]?.pageIndex ?? 0;
}

const SEARCH_STOP_WORDS = new Set([
  'what', 'is', 'are', 'the', 'for', 'to', 'a', 'an', 'how', 'do', 'does', 'in', 'on', 'of', 'with', 'and', 'or', 'mean', 'means', 'specific', 'any',
]);

function rawSearchTokens(query: string): string[] {
  const raw = query.trim().split(/\s+/).filter(Boolean);
  if (raw.length <= 1) return raw;
  const meaningful = raw.filter((tok) => !SEARCH_STOP_WORDS.has(tok.toLowerCase()));
  return meaningful.length > 0 ? meaningful : raw;
}

export function tokenizeSearchQuery(query: string): string[] {
  return rawSearchTokens(query).map((tok) => tok.toLowerCase());
}

function scoreTokens(
  tokens: string[],
  rawTokens: string[],
  haystacks: Array<{ text: string; weight: number }>,
): { score: number; matched: string[] } {
  let score = 0;
  const matched = new Set<string>();
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i]!;
    const rawTok = rawTokens[i] ?? tok;
    const hasUpper = rawTok !== tok;
    const boundary = tok.length <= 4 && /^[a-z0-9_-]+$/.test(tok)
      ? new RegExp(`(?:^|[^a-z0-9])${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9])`)
      : null;
    let best = 0;
    for (const h of haystacks) {
      const low = h.text.toLowerCase();
      let pts = 0;
      if (low === tok) pts = h.weight * 3;
      else if (low.split(/\s+/).includes(tok)) pts = Math.round(h.weight * 1.6);
      else if (boundary && boundary.test(low)) pts = Math.round(h.weight * 1.4);
      else if (low.includes(tok)) pts = tok.length <= 2 ? Math.round(h.weight * 0.45) : h.weight;
      if (pts > 0 && hasUpper && (h.text === rawTok || h.text.split(/\s+/).includes(rawTok))) {
        pts += Math.round(h.weight * 1.5);
      }
      best = Math.max(best, pts);
    }
    if (best > 0) {
      score += best;
      matched.add(tok);
    }
  }
  if (tokens.length > 1 && matched.size === tokens.length) score += 60;
  return { score, matched: [...matched] };
}

function scoreCommandPage(page: Extract<BookPage, { kind: 'command' }>, tokens: string[], rawTokens: string[]): ManualSearchHit | null {
  const e = page.entry;
  const flagBlob = e.flags.map((f) => `${f.flag} ${f.alias ?? ''} ${f.meaning} ${f.detail ?? ''} ${f.example ?? ''}`).join(' ');
  const exampleBlob = e.examples.map((ex) => `${ex.command} ${ex.outcome}`).join(' ');
  const { score, matched } = scoreTokens(tokens, rawTokens, [
    { text: e.command, weight: 100 },
    ...e.aliases.map((a) => ({ text: a, weight: 90 })),
    ...e.flags.map((f) => ({ text: f.flag, weight: 80 })),
    ...e.flags.flatMap((f) => (f.alias ? [{ text: f.alias, weight: 65 }] : [])),
    { text: e.keywords.join(' '), weight: 45 },
    { text: e.summary, weight: 35 },
    { text: flagBlob, weight: 28 },
    { text: `${e.realWorld} ${e.inGame} ${e.pitfalls.join(' ')}`, weight: 18 },
    { text: exampleBlob, weight: 15 },
  ]);
  if (score <= 0) return null;
  const hitFlag = e.flags.find((f) => tokens.some((t) => `${f.flag} ${f.alias ?? ''} ${f.meaning}`.toLowerCase().includes(t)));
  const snippet = hitFlag ? `${hitFlag.flag}: ${hitFlag.meaning}` : e.summary;
  return {
    pageIndex: page.index,
    title: e.command,
    kind: 'command',
    sectionLabel: SECTION_LABEL_MAP[e.section],
    badge: e.aliases.length ? `${e.command} (${e.aliases.join(', ')})` : e.syntax,
    snippet,
    matchedTokens: matched,
    score,
    entry: e,
  };
}

function scoreGuidePage(page: Extract<BookPage, { kind: 'guide' }>, tokens: string[], rawTokens: string[]): ManualSearchHit | null {
  const g = page.guide;
  const rowBlob = g.rows.map((r) => `${r.token} ${r.title} ${r.summary} ${r.detail}`).join(' ');
  const { score, matched } = scoreTokens(tokens, rawTokens, [
    { text: g.title, weight: 65 },
    ...g.rows.map((r) => ({ text: r.token, weight: 75 })),
    { text: g.keywords.join(' '), weight: 50 },
    { text: `${g.subtitle} ${g.intro}`, weight: 30 },
    { text: `${rowBlob} ${g.takeaways.join(' ')}`, weight: 20 },
  ]);
  if (score <= 0) return null;
  const hitRow = g.rows.find((r) => tokens.some((t) => `${r.token} ${r.title} ${r.summary}`.toLowerCase().includes(t)));
  return {
    pageIndex: page.index,
    title: g.title,
    kind: 'guide',
    sectionLabel: SECTION_LABEL_MAP[g.section],
    badge: 'DEEP GUIDE',
    snippet: hitRow ? `${hitRow.token} — ${hitRow.summary}` : g.subtitle,
    matchedTokens: matched,
    score,
    guide: g,
  };
}

/**
 * Search across all commands, aliases, flags (-9, -rf), octal numbers (755, 644), guides, and explanations.
 * Never throws on punctuation or empty input; returns hits sorted by descending relevance.
 */
export function searchManual(query: string, filter: ManualSkillFilter = 'all'): ManualSearchHit[] {
  const rawTokens = rawSearchTokens(query);
  const tokens = rawTokens.map((t) => t.toLowerCase());
  const matchesFilter = (filters: readonly ManualSkillFilter[]) => filter === 'all' || filters.includes(filter);

  if (tokens.length === 0) {
    if (filter === 'all') return [];
    const filtered: ManualSearchHit[] = [];
    for (const page of BOOK_PAGES) {
      if (page.kind === 'guide' && matchesFilter(page.guide.filters)) {
        filtered.push({
          pageIndex: page.index,
          title: page.guide.title,
          kind: 'guide',
          sectionLabel: SECTION_LABEL_MAP[page.section],
          badge: 'DEEP GUIDE',
          snippet: page.guide.subtitle,
          matchedTokens: [],
          score: 50,
          guide: page.guide,
        });
      } else if (page.kind === 'command' && matchesFilter(page.entry.filters)) {
        filtered.push({
          pageIndex: page.index,
          title: page.entry.command,
          kind: 'command',
          sectionLabel: SECTION_LABEL_MAP[page.section],
          badge: page.entry.syntax,
          snippet: page.entry.summary,
          matchedTokens: [],
          score: 40,
          entry: page.entry,
        });
      }
    }
    return filtered;
  }

  const hits: ManualSearchHit[] = [];
  for (const page of BOOK_PAGES) {
    if (page.kind === 'command' && matchesFilter(page.entry.filters)) {
      const hit = scoreCommandPage(page, tokens, rawTokens);
      if (hit) hits.push(hit);
    } else if (page.kind === 'guide' && matchesFilter(page.guide.filters)) {
      const hit = scoreGuidePage(page, tokens, rawTokens);
      if (hit) hits.push(hit);
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.pageIndex - b.pageIndex);
}

/** Terminal output when the player runs `manual [query]` (also gives useful CLI text in headless sessions). */
export function formatManualTerminalReply(query: string): string {
  const clean = query.trim();
  if (!clean) {
    return '[MANUAL] Opened Interactive Terminal Field Manual (F1 / Esc closes; Tab completes topics).\n';
  }
  const pageIdx = resolveManualPageIndex(clean);
  const page = BOOK_PAGES[pageIdx];
  const hits = searchManual(clean).slice(0, 3);
  if (!page || (page.index === 0 && hits.length === 0)) {
    return `[MANUAL] Opened Field Manual search for "${clean}" (0 exact entries — try chmod, kill -9, ls, grep, sed).\n`;
  }
  if (page.kind === 'command') {
    const e = page.entry;
    const flagsLine = e.flags.length ? `  Flags: ${e.flags.map((f) => f.flag).join('  ')}\n` : '';
    return `[MANUAL -> ${e.command}] ${e.summary}\n  Syntax: ${e.syntax}\n${flagsLine}`;
  }
  if (page.kind === 'guide') {
    return `[MANUAL -> ${page.guide.title}] ${page.guide.subtitle}\n`;
  }
  return `[MANUAL] Opened Interactive Field Manual.\n`;
}
