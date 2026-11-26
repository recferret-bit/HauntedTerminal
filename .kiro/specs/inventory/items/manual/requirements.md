# Interactive Terminal Field Manual Item & Book: requirements

Status: done (implemented from user request and Q3/Q4/Q5 review answers 2026-11-25; verified against all gates)

Capability: `manual` is both the 4th typed **Inventory** tool under `.kiro/specs/inventory/` (`item.manual`, `vibecoder.dev_manual`, carried from start alongside `terminal` in Chapter 1 and in `starterInventory()`) AND an interactive, searchable hardcover comic-book **Field Manual** (3D page flipping, chapter tabs, Table of Contents, instant multi-token search, live `chmod`/`kill`/shell calculators/explorers) covering every terminal command, flag, octal code (`755/644/444/000`), POSIX signal (`kill -9/-15/-STOP/-CONT`), and shell operator. Accessible in-game (`manual [query]`, `F1`, `#tty-manual-btn`), on Landing Home (`/`), from `/chapters.html` & `/dev.html`, and standalone at `pages/manual.html` (`/manual`, `/manual.html`).

## Requirements

### Inventory item & 3D procedural assets

1. THE SYSTEM SHALL register `'manual'` in `ITEM_IDS` and `ITEMS` (`src/contracts/inventory.ts`) as the 4th child inventory item alongside `'lantern'`, `'terminal'`, and `'laptop'`, with `model: 'item.manual'`, `heroModel: 'vibecoder.dev_manual'`, and zero `light` socket.
2. THE SYSTEM SHALL build `item.manual` in `src/procgen/archetypes/items/manual.ts` (wire `ITEM_BUILDERS.manual` in `src/procgen/archetypes/items.ts`) standing on `y = 0` within `itemMajor` (`0.25..0.6` units) with spine `handle` strap, `grip`/`label`/`fx`/`cover` sockets, hardcover boards (`pcb`), leather binding (`hair`), creamy `paper` page block, `hoodie` ribbon bookmark, and `phosphor` `>_` emblem within the 5-zone color budget when carried by `vibecoder.dev_manual` (auto-derived in `src/procgen/archetypes/vibecoder.ts`), emitting no oil-lantern light cone (`sockets.lantern` omitted).
3. THE SYSTEM SHALL include `'manual'` in `starterInventory()` defaults (`['lantern', 'terminal', 'manual']`), Chapter 1 `startItems` (`['terminal', 'manual']`), HUD `.items-strip` (`src/ui/items-strip.ts`), `inventory`/`inv`/`hold manual` commands, Tab completions, `grimoire` entries, `chapter-editor` item hints, and Field Manual command docs (`src/game/manual.ts`, `src/game/manual-cmds-nav.ts`).

### Book presentation & page flipping

4. THE SYSTEM SHALL render the interactive terminal manual styled as an open hardcover comic field book (`--paper`, `--paper-dot`, `--ink`, stitched center spine, page numbers, corner turn tabs, and die-cut side chapter tabs), showing a two-page spread on wide viewports (`> 880px`) and a single-page view on narrow viewports (`<= 880px`) with zero horizontal overflow.
5. WHEN the player or visitor flips forward or backward (via `Prev` / `Next` buttons, clickable corner turn tabs, Table of Contents links, side chapter tabs, `PageUp` / `PageDown`, or `ArrowLeft` / `ArrowRight` keys outside non-empty `#mb-search-input`), THE SYSTEM SHALL play a stepped/3D page-flipping animation across the spine (`prefers-reduced-motion: reduce` disables motion and swaps immediately), cloning the turning sheet side cleanly.
6. THE SYSTEM SHALL organize the book into an introductory Cover & Table of Contents spread, deep-dive interactive reference guides (`chmod` numbers, `kill` signals, shell operators & shortcuts, malware counterplay matrix), and dedicated reference pages for every terminal command, rendering inline code badges cleanly without raw markdown backticks.

### Complete command, flag & number coverage

7. THE SYSTEM SHALL cover every command listed in `COMMANDS` (`src/game/manual.ts`) and `CHAPTER_COMMANDS` (`src/chapters/session-state.ts`)—excluding only chapter-declared dynamic ally names—plus documented aliases (`.`, `inv`, `logout`, `nano`, `vim`, `code`, `docker-compose`, `dossier`, `rig`, `ach`, `trophies`).
8. FOR EACH command, THE SYSTEM SHALL document its syntax, plain-English summary, every supported flag/option/subcommand with clear explanations (noting classic vs chapter shell behavior where they differ), real-world Linux context, in-game effects, common pitfalls, related commands, and practical examples.
9. THE SYSTEM SHALL explain numeric and signal mechanics deeply for users of all skill levels, including:
   - `kill` / `pkill`: why `-9` (`SIGKILL`) cannot be caught or ignored and terminates child-spawning processes (`forkbomb`, `virus`), vs `-15` (`SIGTERM` default, polite/trappable), `-STOP` (`-19`/`-17`/`-23`, freeze `STAT=T`), `-CONT` (`-18`, resume), `-l`/`-L`, and why other signals like `-1`/`-2` are rejected by this kernel;
   - `chmod`: 3-digit octal permission math (`4 = read`, `2 = write`, `1 = execute`, across `Owner / Group / Others`), specific numbers (`755`, `644`, `600`, `700`, `777`, `555`, `444`, `400`, `000`), symbolic syntax (`[ugoa]*[+-=][rwx]*`), and classic vs chapter `-R`/`-v` behavior.

### Live search & filters

10. WHILE the book is open, THE SYSTEM SHALL provide a live search input (shortcut `/`) and category/skill filter chips (`All`, `Beginner`, `Flags & Numbers`, `Combat`, `Files`, `Text`, `Kill / PS`, `Code & Docker`, `Kiro & Game`).
11. WHEN the user types a query (command name, alias, flag like `-9`, `-P`, or `-rf`, octal number like `644` or `755`, signal name like `SIGKILL`, or plain-English concept like `hidden files` or `replace text`), THE SYSTEM SHALL rank matching pages cleanly (preserving flag casing like `-P` vs `-p` and prioritizing `sed` for `replace text`), highlight matching terms using safe DOM text nodes (`<mark>`, never `innerHTML`), and flip straight to any selected hit. Clicking navigation buttons (`Index`, `← Prev`, `Next →`, chapter tabs) or clicking anywhere outside `.mb-search-anchor` SHALL dismiss the search results drawer and blur search focus cleanly, and the `PAGE 01` Cover and `PAGE 02` Table of Contents (plus its corner turn button) SHALL fit without vertical scroll clipping on `1024x768`, `1280x820`, and `1440x900` desktop viewports.
12. IF a query has no matches, THEN THE SYSTEM SHALL display a clear empty-state message with clickable suggested queries without throwing or corrupting the current page.

### Interactive tools, live combat clock & landing access

13. THE SYSTEM SHALL include interactive learning widgets embedded directly on the relevant book pages:
    - an interactive `chmod` Permission Calculator (`r/w/x` toggles for `u/g/o`, direct 3-digit octal input `000`–`777`, preset buttons `755`/`644`/`600`/`700`/`444`/`400`/`000`/`777`, live octal math & symbolic `u=,g=,o=` breakdown, `ls -l` mode string, `0..7` digit legend, and plain-English explanation);
    - an interactive `kill` Signal Tester (`-15`, `-9`, `-STOP`, `-CONT` showing trapability, child process impact, and malware reactions);
    - an interactive Shell Operator & Pipeline Explorer (`|`, `>`, `>>`, `&&`, `||`, `;`, `* / ?`, `{a,b}`, `~`).
14. THE SYSTEM SHALL register `manual` in `COMMANDS`, both shells (`src/game/session.ts`, `src/chapters/session-shell.ts`; the classic dispatch is now `CLASSIC_HANDLERS` in `src/game/session-shell.ts`, 2026-11-26), Tab completion (`manual <topic>`), `helpText`, `MAN`, and `src/terminal-lab/commands.ts` (`ungrouped()` stays empty).
15. WHEN the player runs `manual [query]` on `/play` (outside `?lab=1` headless/iframe runners), clicks `#tty-manual-btn` in `#tty-bar`, or presses `F1`, THE SYSTEM SHALL open the Manual Book modal (`#manual-book-modal`) over the play screen, jump to `[query]` if provided (keeping the search results drawer closed), block terminal keystrokes (`play.shell.setBlocked(true)`) while open WITHOUT pausing the game clock or the 30-second battle turn timer (and closing automatically on `beginEnding`), allow immediate `ArrowLeft`/`ArrowRight` page turning, and close cleanly on `Escape` or Close button restoring terminal focus. In `?lab=1` iframe sessions, `manual` SHALL print its terminal summary without auto-blocking the lab command queue (`F1` / `#tty-manual-btn` remain available, and lab session swaps close the modal).
16. WHEN the player clicks `Insert` on an example or calculator inside the in-game modal, THE SYSTEM SHALL close the book, unblock terminal input, place the command onto the terminal prompt buffer (`Shell.setInput`) without auto-executing it, and focus the terminal; `Copy` SHALL copy commands to clipboard everywhere.
17. THE SYSTEM SHALL expose standalone offline-ready `pages/manual.html` (`/manual` via `public/_redirects` and `/manual.html`) wired in `vite.config.ts` (`src/pages/manual-page.ts`, `?cmd=`, `?q=`, `?page=`, bundled `.woff2` fonts, checked by `npm run desktop:verify`), linked prominently on Landing Home (`pages/index.html` inside `.tty-mini-card`, the Chapter 1 Demo `.edition-card`, and a full-width `#entry-doors` `.door-card-wide`), as well as `pages/chapters.html` and `pages/dev.html`, while preserving `#hub-header`'s 6 shared tabs (`src/hub/tabs.ts`) and `.hero-copy .hero-cta-row`.

## Out of scope

- Changing `#hub-header`'s 6 landing tab items (`src/hub/tabs.ts`) or `.hero-copy .hero-cta-row` hero play CTAs.
- Adding new gameplay levels or modifying existing `man <cmd>` exit codes/output contracts tested by `terminal-lab-unit.mjs`.
- Executing arbitrary user shell lines inside `/manual.html` (the standalone page offers calculators and explorers rather than a full game VFS session).

## Decisions

- **Q1:** Worktree and branch isolation?
  **A (user, 2026-11-25):** Create a new git worktree and branch from `main` (`agent/terminal-manual`), leaving existing worktrees untouched.
- **Q2:** Core format and features of the terminal manual?
  **A (user, 2026-11-25):** An interactive terminal manual styled as a book with page flipping, search, covering all terminal commands, all flags, and deep explanations (e.g. `-9` for `kill`, specific numbers for `chmod`) to bring real value for any kind of users.
- **Q3:** Placement, landing availability, and inventory integration?
  **A (user, 2026-11-25):** Make the interactive Field Manual available on the landing page (`pages/index.html` via `.tty-mini-card`, Chapter 1 Demo card, and `#entry-doors` alongside `/manual` & `/manual.html`), AND in the game as an additional inventory item (`manual`, `item.manual`, `vibecoder.dev_manual`, HUD `.items-strip` slot, `inventory`/`hold manual`, carried by default) under `.kiro/specs/inventory/items/manual/` (retiring standalone `.kiro/specs/terminal-manual/` (now `.kiro/specs/inventory/items/manual/`)). Keep `#hub-header` at its 6 tabs and `.hero-copy .hero-cta-row` untouched.
- **Q4:** Battle timer pause & Insert behavior?
  **A (user, 2026-11-25):** Opening the manual modal does NOT pause the battle turn timer (remove `PauseReason = 'manual'`; still block xterm input while open so book keys/search never leak into the shell); `Insert` places the command onto the terminal prompt without auto-executing.
- **Q5:** Architecture & ownership split (`lead-dev`, `terminal-designer`, `chapters-designer`, `artist`)?
  **A (user, 2026-11-25):** Confirmed `ok` (`src/contracts/`, `src/play/`, `src/pages/`, `src/hub/`, `src/styles/`, `pages/` under `lead-dev`/infra; `src/game/manual*.ts` & `src/ui/` under `terminal-designer`; `src/procgen/archetypes/items/manual.ts` under `artist`; `src/game/inventory.ts`, `chapters/`, `src/chapters/` under `chapters-designer`).

## Open questions

## Verification

- Unit suites: `node scripts/harness/manual-unit.mjs`, `node scripts/harness/laptop-unit.mjs`, `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/battle-unit.mjs`, `node scripts/harness/hub-unit.mjs`, `npm run desktop:test`.
- Asset validators: `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs item.manual vibecoder.dev_manual --seeds 4 --strict`, `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --strict`, `node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all`, `npm run quality:fingerprint`.
- Browser & chapter E2E: `node scripts/harness/manual-smoke.mjs` (book UI, search, calculators, non-pausing battle timer with live countdown while modal open, `hold manual`, 4-item `.items-strip` non-overlap at `1024x768` & `1280x820`, `Escape` focus return, `390x844` layout), `node scripts/desktop/landing-smoke.mjs`, `node scripts/harness/generate-chapter.mjs --verify`, `node scripts/harness/playthrough.mjs --ticks 3`, `node scripts/harness/terminal-lab-smoke.mjs --width 1280 --height 820`.
- Project gates: `npm run quality` (`tsc --noEmit`, `quality:root`, `quality:size`, `quality:layers`, `quality:declarative`, `quality:specs`, `quality:dup`, `quality:agents`, `quality:brands`, `quality:mcp`, `quality:props`), `npm run build`, `npm run desktop:verify`.
