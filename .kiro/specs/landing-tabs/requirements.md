# Landing tabs: requirements

Status: done (requirements, design and tasks approved by the user 2026-11-18; all tasks done 2026-11-18)

Capability: The landing page (`/`, `pages/index.html`) has too much content on one page. Starting request (user, 2026-11-18): make the header tabs the way into the content, with each tab holding its own content; remove the achievements section from the landing and give it its own subpage that opens only when its tab is clicked; rework the "6-Page Comix" tab into a tab named "Comix" whose content is a selection of comixes by chapter, each with progress, all shown, the open ones clickable (the player goes inside), the rest rendered but disabled. This spec is **step one** of a larger landing slimming: only the tab structure, the Achievements subpage and the Comix tab; trimming the remaining content comes later.

Facts from the code (2026-11-18): the header has six links (`Play Free Demo`, `Steam Coming Soon` which opens the waitlist dialog, `Desktop Builds` (an anchor), `Achievements` (an anchor), `6-Page Comix` (`/comic.html?chapter=<slug>`), `Chapters & Workshop` (`/chapters.html`)). The page has 526 lines of HTML: hero, funnel steps, edition comparison, desktop builds, save portability bar, trophy rack, "why it works" and FAQ, entry doors, parody notice and the waitlist dialog. Chapter data comes from `CHAPTER_MANIFESTS` (one chapter, `status: 'playable' | 'spec'`) and `readChapterProgress()` (levels cleared per chapter).

## Requirements

### Tabs and header

1. THE SYSTEM SHALL render one shared header from `src/hub/nav.ts` on `/`, `/desktop.html`, `/achievements.html` and `/comix.html`, with the items `Play Free Demo`, `Steam Coming Soon`, `Desktop Builds`, `Achievements`, `Comix` and `Chapters & Workshop`. (Q1, Q9)
2. WHILE a tab page is open, THE SYSTEM SHALL mark its own tab as the current one (`aria-current="page"`) and style it as active. Home is the tab of the brand link and of `/`. (Q1)
3. THE header items `Desktop Builds`, `Achievements` and `Comix` SHALL be links to `/desktop.html`, `/achievements.html` and `/comix.html`; `Chapters & Workshop` SHALL stay a link to `/chapters.html`; `Play Free Demo` SHALL stay a link into the game. (Q1, Q2, Q7)
4. WHEN `Steam Coming Soon` is clicked on any hub page (`/`, `/desktop.html`, `/achievements.html`, `/comix.html`), THE SYSTEM SHALL open the waitlist dialog in place, without navigating. The dialog is rendered by `src/hub/waitlist-dialog.ts` on every hub page. `/?wishlist=1` still opens it on Home. (Q8, changed by the user 2026-11-21)
5. WHEN a tab page loads, THE SYSTEM SHALL load only that page's content and scripts, not those of the other tabs. (Q2)
6. `chapters.html` and `comic.html` SHALL keep their own headers and layout. (Q9)

### Achievements page

7. WHEN `/achievements.html` opens, THE SYSTEM SHALL show the local achievements trophy rack (filters, counts, `ACH_*` keys, progress) and the save export/import bar with the same behavior and element ids as on Home today. (Q6)
8. THE `/` page SHALL NOT contain the trophy rack or the save export/import bar, and its `Achievements` item SHALL no longer be an anchor. (Q6)

### Desktop Builds page

9. WHEN `/desktop.html` opens, THE SYSTEM SHALL show the three OS download cards (macOS, Windows, Linux) as today. (Q6)
10. THE `/` page SHALL NOT contain the OS download cards; the hero SHALL NOT have the `Play Free Demo in Browser`, `Wishlist on Steam` and `Tagged Desktop Builds` buttons (removed by the user 2026-11-21; the header has the same actions), only the resume link when a save exists. (Q6)

### Comix page

11. WHEN `/comix.html` opens, THE SYSTEM SHALL show one tile per chapter of `CHAPTER_MANIFESTS` (the chapter's story issue) followed by locked placeholder tiles `CHAPTER 2` to `CHAPTER 5`, from a small data list in `src/hub/`, not from `chapters/`. (Q3, Q4)
12. THE tile of a chapter whose `status` is `playable` SHALL be open: it shows the chapter title, badge and subtitle, the progress `N/<levels> levels cleared` from `readChapterProgress()`, a `Read` link to `/comic.html?chapter=<id>` and a `Play` link to `/play/<id>`. (Q3, Q5)
13. THE locked placeholder tiles SHALL be rendered, visible and marked disabled (`aria-disabled="true"`, no links, not focusable as links), show their label, and carry no chapter content. A chapter in `CHAPTER_MANIFESTS` with `status` other than `playable` SHALL render the same way. (Q4, Q5)
14. THE Comix page SHALL name no chapter or level in code; open and locked tiles come from the manifests and the placeholder list. (declarative rule)

### Tests and audit

15. THE `landing-smoke.mjs` check SHALL verify each moved piece on its new page: the trophy rack and the export/import bar on `/achievements.html`, the OS cards on `/desktop.html`, the open and locked Comix tiles with progress and a non-clickable locked tile on `/comix.html`, and that none of them is on `/`. (Q10)
16. THE visual audit's screen list SHALL include `/achievements.html`, `/desktop.html` and `/comix.html` (four sizes each); the baselines of Home change and are approved by the user. (Q10)
17. THE change SHALL keep `npm run quality`, `npm run build`, `desktop:verify` and `desktop-unit.mjs` green, including the font and offline checks (no external URLs). (Q10)

17. WHEN a hub page is shown, THE SYSTEM SHALL fetch the other hub pages in the background, and WHEN a tab link (`/`, `/desktop.html`, `/achievements.html`, `/comix.html`) is clicked, THE SYSTEM SHALL swap the page content in the same document without a page load, keep the header and the waitlist dialog in place, update the URL and the title, and support Back and Forward. IF a page is not fetched yet or the fetch fails, THE SYSTEM SHALL wait for it or fall back to a normal navigation. (changed by the user 2026-11-21: tab switching must be instant)

## Out of scope

- Trimming the content left on Home (hero, funnel steps, edition comparison, "why it works", FAQ, entry doors, parody notice). That is the next step.
- Chapter 2 to 5 content, real titles for the locked tiles, or any second chapter (Kiroween scope).
- Reading progress inside the comic reader (pages read), unlocking comix pages by level progress, and the 3D intro and outro as tiles.
- A new header on `chapters.html` and `comic.html`, clean URLs and Netlify rewrites for the new pages.
- Changes to the game, the chapter data or the waitlist behavior.

## Decisions

- **Q1:** Which header items become tabs with content?
  **A (user delegated, 2026-11-18):** Four tabs with content: Home, Desktop Builds, Achievements, Comix. `Chapters & Workshop` stays a link to its existing page. `Play Free Demo` stays a button into the game. `Steam Coming Soon` stays a button that opens the waitlist dialog.
- **Q2:** How are tabs routed?
  **A (user delegated, 2026-11-18):** Separate pages sharing one header module; each opens only when clicked and loads only its own content; deep links work.
- **Q3:** What does the Comix tab show?
  **A (user delegated, 2026-11-18):** One tile per chapter for its 6-page story issue, opening in the existing reader (`/comic.html?chapter=<slug>`). The 3D intro and outro stay in the game.
- **Q4:** What are the disabled tiles with one chapter shipped?
  **A (user delegated, 2026-11-18):** Fixed locked placeholders labelled "CHAPTER 2" to "CHAPTER 5", from a small data list in the hub (not in `chapters/`); visible, not clickable, no chapter content behind them.
- **Q5:** What does a tile's progress mean, and what opens it?
  **A (user delegated, 2026-11-18):** Game progress for that chapter ("N/11 levels cleared", from `readChapterProgress()`); a tile is open when its chapter is playable; "Read" goes to the reader and "Play" to the game.

- **Q6:** What moves where in this step?
  **A (user delegated, 2026-11-18):** The Achievements page gets the trophy rack and the save export/import bar. The Desktop Builds page gets the three OS download cards. Home keeps everything else (hero, funnel steps, edition comparison, "why it works" and FAQ, entry doors, parody notice). The `#desktop-builds` and `#achievements-showcase` anchors are removed and links to them point to the new pages.
- **Q7:** URL names of the new pages?
  **A (user delegated, 2026-11-18):** `/achievements.html`, `/comix.html`, `/desktop.html` (no rewrites needed).
- **Q8:** How does `Steam Coming Soon` open the waitlist on the other tabs?
  **A (user delegated, 2026-11-18):** On the other tab pages it is a link to `/?wishlist=1`, which already opens the dialog on Home. One copy of the dialog and its code.
- **Q9:** Which pages share the new header?
  **A (user delegated, 2026-11-18):** Only the four tab pages, through one `src/hub/nav.ts` module with the active tab marked. `chapters.html` and the comic reader keep their own headers in this step.
- **Q10:** Verification for the new pages?
  **A (user delegated, 2026-11-18):** Update `landing-smoke.mjs` for each moved piece on its new page; add the three new pages to the visual audit's screens (baselines at four sizes); Home baselines change and the user approves them.

## Open questions



## Verification

- Req 1-6: `landing-smoke.mjs` loads the four tab pages and checks the header items, the current-tab mark and the Steam button on each page, and that the dialog exists on every hub page and opens in place; a unit check on `src/hub/nav.ts`.
- Req 7-10: `landing-smoke.mjs` (trophy rack and export/import on `/achievements.html`, OS cards on `/desktop.html`, none on `/`, no `#desktop-builds` link left).
- Req 11-14: `landing-smoke.mjs` on `/comix.html` (one open tile with progress, four locked tiles, locked tiles not links), `npm run quality:declarative`.
- Req 15-17: `landing-smoke.mjs`, `visual-audit.mjs --selftest`, a full `visual-audit.mjs` run (Home diffs listed and opened), `npm run quality`, `npm run build`, `npm run desktop:verify`, `node scripts/desktop/desktop-unit.mjs`.
