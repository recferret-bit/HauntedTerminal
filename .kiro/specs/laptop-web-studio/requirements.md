# Laptop Web Studio, Virtual Disk & Browser: requirements

Status: draft

Capability: upgrades the developer's retro clamshell laptop (`src/laptop/`, building on `.kiro/specs/inventory/items/laptop/`) into a multi-file web studio and retro browser available both in `/laptop-lab` and in-game on `/play` (when carrying `item.laptop`). Adds a shared `HAUNTED/OS` virtual disk with nested folders and multiple file types (`.html`, `.css`, `.js`, `.json`, `.svg`, `.txt`), a desktop `Files` (`FILES.EXE`) manager plus an in-editor file-tree sidebar, a dynamic (~150 ms debounced) sandboxed HTML/CSS/JS page emulator that resolves relative `<link>`, `<script src>`, `<img>`, `<a href>`, and `fetch()` across virtual folders with live HTML/CSS/JS/404 diagnostics (Problems/Console dock, editor gutter markers, dismissible preview error banner), a single-page retro `Browser` (`BROWSER.EXE`) app (`local://<folder>/...`), and an in-game `/play` clamshell overlay (`laptop [path]`, `.item-slot.item-laptop`, `F4`) with a live `/room` mount and battle turn-timer hold.

## Requirements

### Virtual disk, folders & multi-file persistence

1. THE SYSTEM SHALL provide a pure `HAUNTED/OS` virtual filesystem (`LaptopFs` in `src/laptop/domain/`) supporting nested folders and UTF-8 text files across `.html`, `.css`, `.js`, `.json`, `.svg`, and `.txt`, with deterministic path normalization and create-folder, create-file, read, write, rename, move, and delete operations, while rejecting root-escaping `..` segments, duplicate sibling names, and invalid path characters.
2. WHEN the laptop runs with persistence enabled, THE SYSTEM SHALL load and auto-save virtual disk changes to `localStorage` under `<slug>:laptop-fs:v1` (defensively parsing untrusted JSON without throwing and falling back to clean defaults on corrupt input); WHILE `storageKey` is `null` or `/play` runs in `preview` (`?draft=1` / `?preview=1`) or `terminalLab` (`?lab=1`), THE SYSTEM SHALL keep virtual disk mutations in memory only without writing `localStorage`.
3. WHEN a fresh laptop virtual disk is initialized or reset, THE SYSTEM SHALL seed `/sites/` with two multi-file starter sites (a multi-page `/sites/welcome/` site linking HTML, CSS, JS, and SVG, and an interactive `/sites/data-demo/` site using `fetch('./items.json')`), `/scratch/` for scratch scripts and pages, and `/quests/<task-id>/` mapped to the 7 `TASKS` (`starter` and saved `drafts`) so every quest remains runnable via `runTask(id, files)` and browsable at `local://quests/<task-id>/`.

### Desktop Files app & in-editor file tree

4. THE SYSTEM SHALL register `files` (`FILES.EXE`, title `'Files'`) and `browser` (`BROWSER.EXE`, title `'Browser'`) in `APPS` and `APP_ORDER` alongside `quests`, `jspad`, `weaver`, and `sysinfo`, with desktop icons, Start menu entries, and desktop context-menu entries whose default window sizes clamp cleanly inside `SCREEN` (`640x452`).
5. WHEN the user opens `Files` (`FILES.EXE`) or uses the collapsible file-tree sidebar in `Web Weaver` or `JS Pad`, THE SYSTEM SHALL allow browsing nested folders, creating folders and files, renaming and deleting user entries, saving (`Ctrl/Cmd+S` plus automatic save on edit with a saved/dirty indicator), and opening any file in its matching editor or launching `.html` / site folders directly in `Browser`.

### Dynamic live-while-typing HTML/CSS/JS emulation

6. WHILE the user types in `Web Weaver`, THE SYSTEM SHALL debounce live page rendering (~150 ms after the last edit, plus immediate execution on `Ctrl/Cmd+Enter` or `Run`), cancelling any superseded in-flight render on the same `PreviewSlot` so typing never flashes `STOPPED_PAGE` or stale errors.
7. WHEN `Web Weaver` or `Browser` renders an HTML file from the laptop virtual disk, THE SYSTEM SHALL execute inside an opaque-origin `sandbox="allow-scripts"` iframe, support both full HTML documents (`<!doctype html>` / `<html>` / `<head>` / `<body>`) and HTML body fragments, and resolve relative and root-relative virtual paths against the laptop disk for `<link rel="stylesheet" href="...">`, `<script src="...">` (in document order with per-file loop-guard instrumentation), `<img src="...">` (safe `data:` URLs for `.svg` assets), `fetch()` (`200` / `404` responses from virtual `.json`, `.txt`, `.html`, `.css`, and `.svg` files), and `<a href="...">` navigation.

### HTML, CSS, JS & 404 live error diagnostics

8. WHEN validating and rendering code in `Web Weaver`, `JS Pad`, or `Browser`, THE SYSTEM SHALL produce structured diagnostics (`file`, `line`, `col`, `severity`, `source: 'html' | 'css' | 'js' | 'network'`, `message`) covering:
   - HTML structure errors (mismatched closing tags, unclosed non-void tags, malformed tag syntax);
   - CSS syntax and declaration errors (unbalanced `{ }` blocks, unclosed comments/strings, and invalid `property: value` declarations rejected by the CSS parser);
   - JavaScript syntax errors (`SyntaxError` with file and line), uncaught runtime exceptions, unhandled promise rejections, `console.error` / `console.warn`, and loop-guard stops (`__lg`);
   - Missing virtual asset references (`404` when `<link href>`, `<script src>`, `<img src>`, or `fetch()` references a path absent from the laptop virtual disk).
9. WHEN diagnostics are present in `Web Weaver` or `JS Pad`, THE SYSTEM SHALL list them in the bottom Problems / Console dock (where clicking a diagnostic focuses its file and line), highlight offending line numbers in the `CodeEditor` gutter, and display a compact dismissible error banner in the preview pane without wiping out the partial DOM render.

### Simple retro Browser app (`BROWSER.EXE`)

10. WHEN the user opens `Browser` (`BROWSER.EXE`) or triggers `"Open in Browser"` from `Web Weaver` or `Files`, THE SYSTEM SHALL render a single-page retro browser featuring an address bar (`local://home`, `local://sites/<slug>/`, `local://quests/<id>/`, `local://room/...`, resolving folder URLs to `index.html`), `Back`, `Forward`, `Reload`, and `Home` navigation buttons, a `local://home` directory listing all site folders on disk, clickable `<a href="...">` in-page link navigation that updates history and the address bar while blocking external network URLs, automatic live reload when open site files change on disk, and a toggleable bottom Console / Errors bar with an error-count badge.

### In-game `/play` Laptop Mode overlay & live `/room` mount

11. WHEN the player on `/play` runs `laptop [path|url]`, clicks the `.item-slot.item-laptop` HUD inventory slot, or presses `F4`, IF `'laptop'` is in `snapshot.inventory.items`, THEN THE SYSTEM SHALL open/toggle the Laptop Mode clamshell overlay over the stage (playing the lid-open + boot sequence on first open of the session and resuming `'desktop'` directly thereafter, opening any requested path or URL), hold the 30-second battle turn timer via `session.holdTurnTimer('laptop', true)`, block terminal input while open, and close on `Escape` or the overlay `Close` button while releasing `holdTurnTimer('laptop', false)` and restoring terminal focus; IF `'laptop'` is not carried, THEN `laptop` SHALL exit `1` with `"You are not carrying 'laptop'."` and `F4` / slot click SHALL not open the overlay.
12. WHILE Laptop Mode is open inside `/play` on a chapter session, THE SYSTEM SHALL mount a live `/room` directory on the laptop virtual disk mirroring the current room's editable files so saving `/room/<file>` in `Web Weaver` or `JS Pad` writes through `session.saveEditableFile(fileName, content)`, applies the resulting game events and snapshot, and lets `Web Weaver` and `Browser` render `/room/index.html` with its sibling `/room/*.css` and `/room/*.js` files.
13. THE SYSTEM SHALL register `laptop` across `COMMANDS` (`src/game/manual.ts`), `helpText`, `MAN`, `MANUAL_TOOLS_AND_META` (Interactive Field Manual), both classic and chapter shells (`consumeLaptopRequest()`), Tab completion, `src/terminal-lab/commands.ts` (`ungrouped()` stays empty), and `scripts/harness/props/terminal.mjs`, and SHALL update `scripts/quality/check-layers.mjs` and `.kiro/steering/architecture.md` together so `play/` may import `laptop/`.

## Out of scope

- Real external internet fetches or navigating `Browser` / `Web Weaver` to remote `http(s)://` origins (offline & desktop bundle safety).
- Multi-tab browser strip inside `BROWSER.EXE` (single-page browser with history chosen for the `640x480` screen).
- Binary raster image uploads or pixel paint tools on the laptop disk (UTF-8 text and `.svg` files only).
- Opening Laptop Mode on `/play` before `item.laptop` is carried in inventory.

## Decisions

- **Q1:** Where should these Laptop Mode upgrades run in this spec?
  **A (user, 2026-11-26):** Both `/laptop-lab` and `/play` — upgrade `src/laptop/` and also let the player open the laptop desktop overlay inside `/play` when carrying the laptop.
- **Q2:** How should folders and files be organized and saved on the laptop?
  **A (user, 2026-11-26):** Shared laptop virtual disk + in-editor file tree + desktop `Files` app — nested folders & files (`.html`, `.css`, `.js`, `.json`, `.svg`, `.txt`) auto-saved to `localStorage`.
- **Q3:** How should the dynamic page renderer emulate HTML, CSS, and JS while typing?
  **A (user, 2026-11-26):** Full virtual site emulation (~150 ms live debounce) — support full HTML docs or fragments, and resolve relative `<link>`, `<script src>`, `<img>`, `<a href>`, and `fetch()` from laptop folders inside `sandbox="allow-scripts"`.
- **Q4:** How should HTML, CSS, and JS errors be surfaced while typing?
  **A (user, 2026-11-26):** Problems/Console dock + editor error gutter markers + dismissible preview error banner — report HTML tag mismatches, CSS brace/property errors, JS syntax/runtime errors, loop-guard stops, and missing-file 404s with `file:line`.
- **Q5:** What should the new Browser app on the laptop desktop include?
  **A (user, 2026-11-26):** Single-page retro `Browser` (`BROWSER.EXE`) — URL bar (`local://site/index.html`), `Back`/`Forward`/`Reload`/`Home`, clickable `<a href>` navigation, Home directory of saved sites, live reload on save, and a toggleable console/error bar.
- **Q6:** How should the player open and close Laptop Mode inside `/play`?
  **A (user, 2026-11-26):** Command `laptop [path]`, clicking `.item-laptop` in HUD, and `F4` (when carrying `laptop`) — opens clamshell overlay over stage, holds battle turn timer (`holdTurnTimer('laptop', true)`), boots once then resumes desktop, closes on `Esc` or Close button.
- **Q7:** How should the laptop's virtual disk interact with level files when opened inside `/play`?
  **A (user, 2026-11-26):** Persistent laptop disk (`/sites`, `/scratch` in `localStorage`) + live `/room` mount in `/play` — `/sites` shares saved projects across `/laptop-lab` and `/play`, and `/room/<file>` lets Web Weaver edit & save the current level room's editable files too.
- **Q8:** What starter folders should appear on the laptop disk, and how should Quests integrate with it?
  **A (user, 2026-11-26):** Seed `/sites/` with 2 multi-file starter sites + mount the 7 quests under `/quests/<id>/` — gives ready-to-browse multi-page/`fetch` demos on Home, preserves deterministic Quest checks, and lets Browser open quests too.

## Open questions

## Verification

- Spec & brand gates: `node scripts/quality/check-specs.mjs` and `npm run quality:brands`.
- Laptop domain & runtime unit suite: `node scripts/harness/laptop-unit.mjs` (virtual disk CRUD, path normalization & traversal rejection, `localStorage` persistence & corrupt-JSON fallback, HTML/CSS/JS/404 diagnostics, relative `<link>`/`<script src>`/`<img>`/`fetch()` bundling, Browser URL router & history, all 7 quest checks).
- Property-based tests: `node scripts/harness/property-tests.mjs --only laptop,terminal,chapters,gameplay` (virtual disk invariants, Browser history invariants, `laptop` shell command properties).
- Laptop Lab headless Chrome E2E: `node scripts/harness/laptop-lab-smoke.mjs` (at `1600x950` and `--width 1280 --height 820`: folder & file creation, persistence across reload, `FILES.EXE`, live typing preview & HTML/CSS/JS/404 gutter + dock + banner diagnostics, `BROWSER.EXE` Home directory, URL navigation, `<a href>` clicks, `fetch()`, and all 7 quests).
- `/play` & Manual gates: `node scripts/harness/manual-unit.mjs`, `node scripts/harness/manual-smoke.mjs` (refusal before carrying `laptop`, opening via `laptop` command / `.item-slot.item-laptop` / `F4` when carried, `holdTurnTimer('laptop', true)`, `/room` write-through to `saveEditableFile`), `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/generate-chapter.mjs --verify --ticks 3`.
- Full project gates: `npm run quality` and `npm run build`.
