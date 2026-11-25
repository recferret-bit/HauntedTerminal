import { BOOK_PAGES, BOOK_SECTIONS, MANUAL_COMMANDS, MANUAL_GUIDES, resolveManualPageIndex } from '../game/manual-catalog.js';
import type { BookPage, ManualCommandEntry, ManualGuideEntry } from '../game/manual-types.js';
import { el } from './dom-lite.js';
import { btn, commandBar, highlightedFragment, inlineCodeFragment, type BookActions } from './manual-book-dom.js';
import { renderManualWidget } from './manual-book-widgets.js';

function pageChrome(page: BookPage, side: 'left' | 'right', body: HTMLElement, canTurn: boolean, onTurn: () => void): HTMLElement {
  const num = String(page.index + 1).padStart(2, '0');
  const head = el('header', 'mb-page-head', [
    el('span', 'mb-page-sec', [page.section.toUpperCase()]),
    el('span', 'mb-page-num', [`PAGE ${num}`]),
  ]);
  const sheet = el('article', `mb-page mb-page-${side}`, [head, body]);
  if (canTurn) {
    const corner = btn(
      side === 'left' ? '◀' : '▶',
      `mb-corner mb-corner-${side}`,
      onTurn,
      side === 'left' ? 'Flip to previous page' : 'Flip to next page',
    );
    sheet.append(corner);
  }
  return sheet;
}

function renderCoverPage(actions: BookActions): HTMLElement {
  const body = el('div', 'mb-page-body mb-cover-body');
  const starterLinks = el('div', 'mb-quick-chips', [
    btn('chmod Numbers (755/644)', 'mb-chip-btn', () => actions.onNavigatePage(resolveManualPageIndex('guide-chmod-numbers'))),
    btn('kill -9 Signals', 'mb-chip-btn', () => actions.onNavigatePage(resolveManualPageIndex('guide-kill-signals'))),
    btn('Shell | > && Guide', 'mb-chip-btn', () => actions.onNavigatePage(resolveManualPageIndex('guide-shell-syntax'))),
    btn('Malware Counterplay', 'mb-chip-btn', () => actions.onNavigatePage(resolveManualPageIndex('guide-malware-matrix'))),
  ]);
  body.append(
    el('div', 'mb-cover-badge', ['ISSUE #1 // UNIX & CODE FIELD HANDBOOK']),
    el('h2', 'mb-cover-title', ['OUT OF CREDITS']),
    el('h3', 'mb-cover-sub', ['INTERACTIVE TERMINAL FIELD MANUAL']),
    el('p', 'mb-cover-lead', [
      'Every Unix command, flag, octal permission number, POSIX signal, Docker instruction, and Kiro Ghost verb in one searchable book — built for absolute beginners, developers, and speedrunners.',
    ]),
    el('div', 'mb-cover-stats', [
      el('div', 'mb-stat-card', [el('strong', '', [String(MANUAL_COMMANDS.length)]), el('span', '', ['Commands Covered'])]),
      el('div', 'mb-stat-card', [el('strong', '', [String(MANUAL_GUIDES.length)]), el('span', '', ['Interactive Guides'])]),
      el('div', 'mb-stat-card', [el('strong', '', [String(BOOK_PAGES.length)]), el('span', '', ['Book Pages'])]),
    ]),
    el('div', 'mb-cover-block', [el('h4', '', ['Jump Straight To Essential Guides']), starterLinks]),
    el('div', 'mb-cover-tips', [
      el('p', '', [inlineCodeFragment('Tip: Press `/` anytime to search flags (`-9`, `-rf`, `-i`), numbers (`755`, `644`, `000`), or tasks (`hidden files`, `replace text`).')]),
      el('p', '', ['Use Arrow Left / Right or click the page corners to flip pages.']),
    ]),
  );
  return body;
}

function renderTocPage(actions: BookActions): HTMLElement {
  const body = el('div', 'mb-page-body mb-toc-body');
  body.append(el('h3', 'mb-section-h', ['TABLE OF CONTENTS']));

  for (const sec of BOOK_SECTIONS) {
    if (sec.id === 'cover') continue;
    const items = BOOK_PAGES.filter((p) => p.section === sec.id);
    const group = el('div', 'mb-toc-group');
    const secHead = btn(`${sec.code} // ${sec.title}`, 'mb-toc-sec-btn', () => actions.onNavigatePage(sec.startPage));
    group.append(secHead);
    const chips = el('div', 'mb-toc-links');
    for (const p of items) {
      const label = p.kind === 'guide' ? p.guide.title.split('(')[0]!.replace(/`/g, '').trim() : p.title;
      chips.append(btn(`${label} · p.${p.index + 1}`, 'mb-toc-link', () => actions.onNavigatePage(p.index)));
    }
    group.append(chips);
    body.append(group);
  }
  return body;
}

function renderGuidePage(guide: ManualGuideEntry, tokens: readonly string[], actions: BookActions): HTMLElement {
  const body = el('div', 'mb-page-body mb-guide-body');
  body.append(
    el('span', 'mb-kicker', ['DEEP DIVE GUIDE']),
    el('h3', 'mb-cmd-title', [inlineCodeFragment(guide.title, tokens)]),
    el('p', 'mb-cmd-summary', [inlineCodeFragment(guide.subtitle, tokens)]),
    el('p', 'mb-prose', [inlineCodeFragment(guide.intro, tokens)]),
  );
  if (guide.widget) body.append(renderManualWidget(guide.widget, actions));

  const rowsWrap = el('div', 'mb-flag-list');
  for (const r of guide.rows) {
    const row = el('div', 'mb-flag-item');
    row.append(
      el('div', 'mb-flag-top', [
        el('code', 'mb-flag-tok', [highlightedFragment(r.token, tokens)]),
        el('strong', 'mb-flag-mean', [inlineCodeFragment(r.title, tokens)]),
      ]),
      el('p', 'mb-flag-det', [inlineCodeFragment(`${r.summary} ${r.detail}`, tokens)]),
    );
    if (r.example) row.append(commandBar(r.example, actions, true));
    rowsWrap.append(row);
  }
  body.append(rowsWrap);

  if (guide.takeaways.length > 0) {
    body.append(
      el('div', 'mb-pitfalls', [
        el('h4', '', ['Key Takeaways']),
        el('ul', '', guide.takeaways.map((t) => el('li', '', [inlineCodeFragment(t, tokens)]))),
      ]),
    );
  }
  return body;
}

function renderCommandPage(entry: ManualCommandEntry, tokens: readonly string[], actions: BookActions): HTMLElement {
  const body = el('div', 'mb-page-body mb-cmd-body');
  const titleRow = el('div', 'mb-cmd-head', [
    el('h3', 'mb-cmd-title', [highlightedFragment(entry.command, tokens)]),
    el('span', `mb-avail ${entry.availability}`, [entry.availability === 'both' ? 'ALL MODES' : 'CHAPTER SHELL']),
  ]);
  body.append(titleRow);

  if (entry.aliases.length > 0) {
    body.append(el('div', 'mb-aliases', [`Aliases: ${entry.aliases.join(', ')}`]));
  }
  body.append(
    el('div', 'mb-syntax-box', [el('code', '', [highlightedFragment(entry.syntax, tokens)])]),
    el('p', 'mb-cmd-summary', [inlineCodeFragment(entry.summary, tokens)]),
    el('div', 'mb-dual-cols', [
      el('div', 'mb-info-box', [el('h4', '', ['Real-World Unix']), el('p', '', [inlineCodeFragment(entry.realWorld, tokens)])]),
      el('div', 'mb-info-box mb-info-game', [el('h4', '', ['In Out Of Credits']), el('p', '', [inlineCodeFragment(entry.inGame, tokens)])]),
    ]),
  );

  if (entry.widget) body.append(renderManualWidget(entry.widget, actions));

  if (entry.flags.length > 0) {
    const flagsBox = el('section', 'mb-flags-sec', [el('h4', 'mb-subhead', ['Flags, Numbers & Options'])]);
    const list = el('div', 'mb-flag-list');
    for (const f of entry.flags) {
      const item = el('div', 'mb-flag-item');
      const top = el('div', 'mb-flag-top', [
        el('span', `mb-flag-kind kind-${f.kind}`, [f.kind.toUpperCase()]),
        el('code', 'mb-flag-tok', [highlightedFragment(f.flag, tokens)]),
      ]);
      if (f.alias) top.append(el('span', 'mb-flag-alias', [`(${f.alias})`]));
      item.append(top, el('p', 'mb-flag-mean', [inlineCodeFragment(f.meaning, tokens)]));
      if (f.detail) item.append(el('p', 'mb-flag-det', [inlineCodeFragment(f.detail, tokens)]));
      if (f.example) item.append(commandBar(f.example, actions, true));
      list.append(item);
    }
    flagsBox.append(list);
    body.append(flagsBox);
  }

  if (entry.examples.length > 0) {
    const exSec = el('section', 'mb-examples-sec', [el('h4', 'mb-subhead', ['Practical Examples'])]);
    for (const ex of entry.examples) {
      const card = el('div', 'mb-ex-card', [
        commandBar(ex.command, actions),
        el('p', 'mb-ex-out', [inlineCodeFragment(ex.outcome, tokens)]),
      ]);
      exSec.append(card);
    }
    body.append(exSec);
  }

  if (entry.pitfalls.length > 0) {
    body.append(
      el('div', 'mb-pitfalls', [
        el('h4', '', ['Common Pitfalls & Tips']),
        el('ul', '', entry.pitfalls.map((p) => el('li', '', [inlineCodeFragment(p, tokens)]))),
      ]),
    );
  }

  if (entry.related.length > 0) {
    const relRow = el('div', 'mb-related', [el('span', '', ['Related: '])]);
    for (const r of entry.related) {
      relRow.append(btn(r, 'mb-rel-btn', () => actions.onJumpCommand(r)));
    }
    body.append(relRow);
  }
  return body;
}

export function renderBookPage(
  page: BookPage,
  side: 'left' | 'right',
  tokens: readonly string[],
  actions: BookActions,
  canTurn: boolean,
  onTurn: () => void,
): HTMLElement {
  let body: HTMLElement;
  if (page.kind === 'cover') body = renderCoverPage(actions);
  else if (page.kind === 'toc') body = renderTocPage(actions);
  else if (page.kind === 'guide') body = renderGuidePage(page.guide, tokens, actions);
  else body = renderCommandPage(page.entry, tokens, actions);
  return pageChrome(page, side, body, canTurn, onTurn);
}
