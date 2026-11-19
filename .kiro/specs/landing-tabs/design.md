# Landing tabs: design

## Pieces

```
pages/desktop.html, pages/achievements.html, pages/comix.html   new entries: head (fonts preload, icon, title, description), <header id="hub-header">, <main class="hub-shell"> with the page's own markup, one <script type="module">
pages/index.html                      Home: loses the OS cards, the save bar, the trophy rack; header becomes <header id="hub-header">; #desktop-builds links point to /desktop.html
vite.config.ts                        build.rollupOptions.input: desktop, achievements, comix (the dev server serves pages/*.html as is)
src/hub/dom.ts                        el() (moved from hub.ts): DOM from text nodes, never innerHTML
src/hub/tabs.ts                       the header items as data: id, label, href, kind (tab | link | action), style
src/hub/nav.ts                        renderHubNav(current): fills #hub-header from tabs.ts; marks the current tab
src/hub/boot.ts                       bootHubPage(current): renderHubNav, wireExternalLinksForDesktop, Tauri save hydration hook
src/hub/hub.ts                        Home entry: hero telemetry, resume slot, waitlist (what stays after the moves)
src/hub/trophy-rack.ts                renderTrophyRack (moved from hub.ts)
src/hub/portable-saves.ts             wirePortableSaves (moved from hub.ts)
src/hub/page-achievements.ts          Achievements entry: boot + trophy rack + save bar + storage/pageshow refresh
src/hub/page-desktop.ts               Desktop Builds entry: boot only (the cards are static markup)
src/hub/page-comix.ts                 Comix entry: boot + renderComixTiles
src/hub/comix-tiles.ts                pure: buildComixTiles(manifests, progress, roadmap) -> tile models; renderComixTiles(host, tiles)
src/hub/roadmap.ts                    the locked placeholder list: chapters 2 to 5 (labels only)
src/styles/hub-tabs.css               active/current tab style, comix tiles, locked tile style
scripts/harness/hub-unit.mjs          unit check of buildComixTiles and tabs.ts through Vite SSR
scripts/desktop/landing-smoke.mjs     updated for the four pages (Req 15)
scripts/desktop/verify-desktop-bundle.mjs   required pages += desktop.html, achievements.html, comix.html
scripts/harness/visual/screens.json   screens `desktop`, `achievements`, `comix` (page: hub), four sizes
docs/qa/baselines/                    new baselines after the user's approval
.kiro/steering/{architecture,structure,tech}.md, AGENTS.md, CLAUDE.md   the new pages and files
```

All files stay under 600 lines and all functions under 130. `hub.ts` shrinks by the trophy rack and the save bar.

## How a page loads

1. Each tab page is its own Vite entry, so opening one loads that page's HTML and one script plus `hub.css`, `landing.css` and `hub-tabs.css`; nothing of the other tabs (Req 5).
2. The entry calls `bootHubPage('<tab>')` first. That renders the header into `#hub-header` synchronously, so `[data-open-waitlist]` on Home exists before `wireSteamWaitlist` runs, then calls `wireExternalLinksForDesktop()`.
3. The entry then renders its own content. Achievements: `renderTrophyRack` and `wirePortableSaves`, refreshed on `storage` and `pageshow` as Home does today. Comix: `renderComixTiles`. Desktop: nothing more (static cards).
4. Home keeps `bootstrapLandingFunnel`, minus the trophy rack and the save bar.

## The header

- `tabs.ts` is the one table: `home` (the brand link), `play` (link, `/play/<chapter>`), `steam` (action), `desktop`, `achievements`, `comix` (tabs), `chapters` (link, `/chapters.html`). The play link uses the first manifest's id from `CHAPTER_MANIFESTS`, so no chapter id is written in code.
- `nav.ts`: `renderHubNav(current)` builds `<nav class="hub-nav" aria-label="Primary Navigation">` with `el()`. The current tab gets `aria-current="page"` and the class `active`. The skip link and the brand are part of the module.
- `steam`: on `home` it is `<button data-open-waitlist="1">`, so the existing waitlist code finds it. On every other page it is `<a href="/?wishlist=1">` (Req 4). `waitlist.ts` is imported by `hub.ts` only, so the dialog code ships with Home only.

## The Comix tiles

- `buildComixTiles(manifests, progress, roadmap)` returns `{ kind: 'open' | 'locked', key, title, badge, subtitle, progress?: { cleared, total }, readHref?, playHref? }[]`. A manifest with `status === 'playable'` gives an open tile; any other status gives a locked tile; then the roadmap entries give locked tiles. Cleared is the count of levels with `cleared: true` in `readChapterProgress()[chapter.id]` (not the key count the chapter rack uses, because a record could exist without being cleared).
- `readHref` is `/comic.html?chapter=<id>`, `playHref` is `/play/<id>`, both from the manifest id.
- `renderComixTiles(host, tiles)`: an open tile is an `<article class="comix-tile open">` with a heading, the progress as text and a `<progress>`, and two `comic-btn` links. A locked tile is `<article class="comix-tile locked" aria-disabled="true">` with a label and "LOCKED"; it has no `<a>` or `<button>`, so it is not focusable (Req 13).
- `roadmap.ts` exports `ROADMAP_CHAPTER_NUMBERS = [2, 3, 4, 5]`; the label is `CHAPTER <n>`. It sits in `src/hub/`, not in `chapters/` (Q4). The numbers are the existing "Chapters 2–5" roadmap, not chapter ids, so `quality:declarative` is unaffected.

## Decisions

- **Header rendered by JS, not copied into four HTML files.** This is Q9's one shared module. A Vite HTML transform would avoid the one-frame empty header and work without JavaScript, but it changes the build for every page; the game needs JavaScript anyway, so JS rendering wins. The header is the first thing the entry does, before any other work.
- **Separate Vite entries, not one page with `?tab=`.** Q2. The cost is three small HTML files with a repeated `<head>`; the gain is that nothing of another tab loads.
- **`.html` URLs.** Q7: they match `/chapters.html` and `/comic.html` and need no Netlify or desktop route rewrites.
- **The waitlist is not duplicated.** Q8: other tabs link to `/?wishlist=1`, which `waitlist.ts` already handles. Known limitation: after the live Steam cutover, the label on the three other tabs keeps saying "Steam Coming Soon" (its link still lands on Home, which then opens the store URL). Fixing it would pull `waitlist.ts` into every page; it is not part of this step.
- **`el()` moves to `src/hub/dom.ts`.** Home, nav and the tiles all need it, and a third copy would fail `quality:dup`.
- **`desktop.html` has static cards.** The three OS cards are plain markup moved as they are; it needs no data, so `page-desktop.ts` only boots the header.
- **Chapters and the reader keep their headers** (Req 6, Q9), so their layouts are not touched in this step.

## Layers and gates

- No layer change: `hub/` already may import `contracts/` and `chapters/`; the new files import only those. `check-layers.mjs` stays.
- `vite.config.ts` changes (three inputs): the spec-first guard asks before that edit; this spec names it.
- New pages: `pages/desktop.html`, `pages/achievements.html`, `pages/comix.html` need an approved spec first (this one, at `approved`). `check-root`: pages stay in `pages/`.
- `scripts/desktop/verify-desktop-bundle.mjs` lists the required pages; it gains the three new ones. `desktop-unit.mjs` and the Tauri templates do not list pages.
- Ownership: `src/hub/`, `src/styles/`, `.kiro/steering/`, `AGENTS.md` and `CLAUDE.md` are `lead-dev`'s; `pages/`, `vite.config.ts`, `scripts/desktop/` and `scripts/harness/visual/` are infrastructure, so these changes are made by the user's main session, as in the earlier hub edits. `check-agents.mjs` owner rules are unchanged: `scripts/harness/hub-unit.mjs` is under `scripts/`, which is infrastructure.
- Fingerprint: not affected (no asset change). `quality:declarative`: the tiles name no chapter or level.
- Visual audit: three new screens and four Home baselines to approve; Home gets shorter, so its `size-changed` diffs are expected.
