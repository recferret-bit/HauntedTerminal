# Interactive Terminal Field Manual Item & Book: design

## Pieces

```
src/contracts/inventory.ts            Adds 'manual' to ITEM_IDS & ITEMS descriptor (item.manual, vibecoder.dev_manual)
src/game/inventory.ts                 starterInventory() includes 'manual' (['lantern', 'terminal', 'manual'])
src/procgen/archetypes/items/manual.ts Procedural 3D item.manual (hardcover book + spine strap + bookmark + phosphor badge)
src/procgen/archetypes/items.ts       ITEM_BUILDERS.manual -> buildManual (auto-wires vibecoder.dev_manual in vibecoder.ts)
.kiro/skills/credits-art-direction/references/world-lexicon.md Documents item.manual & vibecoder.dev_manual briefs
chapters/chapter-01-kiroween/chapter.manifest.json Chapter 1 startItems includes "manual" alongside "terminal"
src/chapters/types.ts, catalog.ts,    Inventory/hold comments, GRIMOIRE_ENTRIES, chapter-editor field hints updated
  src/chapter-editor/schema.ts
src/ui/items-strip.ts                 Renders 4th HUD slot for item.manual automatically from ITEM_IDS
pages/manual.html, public/_redirects  Standalone Field Manual entry page (/manual & /manual.html; offline WOFF2 fonts)
pages/index.html, src/styles/landing.css Exposes /manual.html on Home (.tty-mini-card, Chapter 1 Demo card, #entry-doors wide card)
pages/chapters.html, pages/dev.html   Add links to /manual.html
pages/play.html                       Adds #tty-manual-btn in #tty-bar and #manual-book-modal container
vite.config.ts                        Adds build.rollupOptions.input.manual -> pages/manual.html
scripts/desktop/verify-desktop-bundle.mjs Verifies dist/manual.html is present in offline desktop bundle
src/game/manual-types.ts              Pure TS interfaces for commands, flags, guides, book pages, search hits
src/game/manual-cmds-nav.ts           Look, Gear (incl. manual), Files & Permissions command docs
src/game/manual-cmds-text.ts          Text Streams, Processes & Signals command docs (grep/sed/cut/wc/ps/kill -9/pkill)
src/game/manual-cmds-meta.ts          Code, Docker, Kiro Ghost, Help & Metagame command docs (notes non-pausing timer)
src/game/manual-guides.ts             Deep-dive guides (chmod, kill signals, shell operators, malware index) & page builder
src/game/manual-catalog.ts            Combined catalog, searchManual() ranking engine, resolveManualPageIndex(), formatManualTerminalReply()
src/game/manual.ts                    Registers 'manual' in COMMANDS, MAN, helpText, and runManual()
src/game/session.ts, runtime.ts       Classic shell 'manual' execution, consumeManualRequest(), Tab completion
src/chapters/session-shell.ts,        Chapter shell 'manual' execution, consumeManualRequest(), Tab completion
  session-flow.ts, chapter-session.ts, session-state.ts
src/terminal-lab/commands.ts          Registers 'manual' in GROUPS['Help & game'] and EXAMPLES
src/ui/manual-book-dom.ts             Safe text-node DOM helpers, highlightText(), copyToClipboard()
src/ui/manual-book-widgets.ts         Interactive chmod Permission Calculator, kill Signal Tester, Shell Operator Explorer
src/ui/manual-book-render.ts          Book spread/page renderer (cover, TOC, guides, command pages, malware index)
src/ui/manual-book-search.ts          Live search input, filter pills, ranked results dropdown with safe <mark> highlights
src/ui/manual-book.ts                 Book controller: spread/single-page state, 3D page-flipping animation, keyboard/corner nav
src/ui/terminal-types.ts,             Adds Shell.setInput(text) to prefill prompt buffer safely
  terminal.ts, terminal-draw.ts
src/play/state.ts, input.ts, loop.ts, In-game manual modal wiring (blocks shell input while open WITHOUT PauseReason; closes on outro)
  outro.ts
src/pages/manual-page.ts              Standalone /manual.html entry with URL query sync (?cmd=, ?q=, ?page=)
src/styles/manual-book.css            1995 Comix Zone hardcover book, spine, 3D page-flip animations, responsive layout
src/styles/game.css                   Styles for #tty-manual-btn in #tty-bar
scripts/harness/agents-build.mjs      Owns manual-*.ts under terminal-designer + manual item/book resources; regenerates .kiro/agents/*.json
scripts/quality/check-layers.mjs      Allows src/pages/ to import src/ui/ (inward DAG)
scripts/harness/props/{terminal,gameplay,sessions}.mjs Property checks for manual catalog/search/chmod + 4-item starter inventory
scripts/harness/manual-unit.mjs,      Unit & CDP smoke suites covering book UI, live battle clock, landing links, hold manual
  manual-smoke.mjs, laptop-unit.mjs, landing-smoke.mjs
```

## Decisions

- **Unified inventory child item.** `manual` uses the same single `ITEMS` descriptor table (`src/contracts/inventory.ts`) as `lantern`, `terminal`, and `laptop`. `item.manual` omits `sockets.light`, reuses `hair` leather strap and `hoodie` ribbon alongside `pcb` teal boards + neutral `paper`/`ink` + emissive `phosphor` badge so `vibecoder.dev_manual` fits `MODEL_RULES.color.maxZones = 5`.
- **No battle timer pause on manual modal (`Q4`).** `PauseReason` excludes `'manual'`. `openManualModal()` opens `#manual-book-modal` first, then calls `play.syncPause()`, which blocks `play.shell` whenever `play.reasons` has a blocking reason OR `Boolean(play.manualBook?.isOpen())` — keeping the 30s battle clock and game tick loop running while preventing keystrokes inside the book from entering xterm. `beginEnding()` closes `#manual-book-modal` so outro never renders underneath it.
- **Book spread model & 3D flip leaf.** Every guide and command compiles into `BookPage[]`: wide viewports (`> 880px`) display `[even, odd]` pages across a stitched spine; narrow viewports (`<= 880px`) flip one sheet at a time. `.mb-flip-leaf` clones turning/arriving sheet faces cleanly without blocking rapid clicks, and all dynamic search/code DOM uses `createTextNode` / `inlineCodeFragment` / `highlightedFragment` (zero `innerHTML`).
- **Landing links without disturbing navigation assertions (`Q3`).** Home (`pages/index.html`) exposes `/manual.html` prominently in three places: an interactive terminal line inside the above-the-fold `.tty-mini-card`, a teal CTA button inside the Chapter 1 Demo `.edition-card`, and a full-width `.door-card-wide` inside `#entry-doors`, preserving `#hub-header`'s 6 items and `.hero-copy .hero-cta-row`.

## Layers and gates

- Layer rule update: `src/pages/` imports `src/ui/` (`scripts/quality/check-layers.mjs` and `.kiro/steering/architecture.md`; `ui/` never imports `pages/`).
- Fingerprint: intentional addition of `item.manual` and `vibecoder.dev_manual` (`npm run quality:fingerprint` diff documented).
- Gates: `npm run quality`, `npm run build`, `npm run desktop:verify`, `validate-model.mjs --all --strict`, `check-tags.mjs --all`, `manual-unit.mjs`, `manual-smoke.mjs`, `laptop-unit.mjs`, `landing-smoke.mjs`, `battle-unit.mjs`, `terminal-lab-unit.mjs`, `terminal-lab-smoke.mjs --width 1280 --height 820`, `generate-chapter.mjs --verify`, `playthrough.mjs --ticks 3`.
