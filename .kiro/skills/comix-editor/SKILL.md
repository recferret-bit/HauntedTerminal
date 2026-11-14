---
name: comix-editor
description: "[LEVEL GEN] Step 4 of animated 3D Comix generation (human review, visual scrubbing, and tuning). The Comix Editor (`/comix-editor`) navigates connected `comix/<slug>/` sequences and pages, renders a 2D Landscape/Portrait Page Layout Mini-Map, edits every manifest, stage, cast, panel, camera, letter, beat, and track with schema-driven forms, scrubs and freezes the live 3D `/cinematic.html` player on the unsaved draft, runs static + 60fps simulation checks, and saves conflict-safely back to `comix/`. Use whenever tuning a comix visually, working on `src/comix-editor/`, or adding a new declarative Comix capability."
---

# Comix Editor (`comix-editor`)

**Category: LEVEL GEN**, the interactive review & tuning studio paired with `comix-implementer`. Contract: `.kiro/steering/declarative-comix.md`.

## Run It

```bash
npm start                                         # dev server on http://localhost:5173
# open http://localhost:5173/comix-editor
# deep links:
#   /comix-editor/intro/manifest?tab=stage
#   /comix-editor/intro/page-01-desk-storm?tab=panels
node scripts/harness/comix-editor-smoke.mjs       # headless Chrome smoke test across UI, preview & dev API
```

Saving requires the dev server (`/api/comix`, a Vite serve-only plugin). In production builds, `/comix-editor` opens read-only from `src/cinematic/generated/catalog-data.ts`.

---

## What Each Target & Tab Edits

### Sequence Setup (`Comix & Stage` -> `comix.manifest.json`)
| Tab | Controls |
| :--- | :--- |
| **Manifest** | Title, subtitle, summary, `role` (`opening` / `ending` / `interlude` / `standalone`), `status` (`playable` / `draft`), `durationSec`, `holdAtEnd`, `acceptsKeyFrom`, `inputGraceMs`, shared `cues`, **Skip Policy** (`"end"` vs stepped `[{ before, to }]`), and **Connected Pages** summary table (`Open →`, `Sync summaries from page specs`) |
| **Stage & Set** | `stage.room` (`ModelCatalog` datalist), sky `background`, `clampToRoom`, named 3D `points`, static `props`, and animated `fixtures` (`rain`, `bolt`, `vortex`) |
| **Cast** | `cast[]` actors (`id`, `model` datalist, initial `at`, `scale`, `rotationZ`, `visible`, `look`) |
| **JSON** | Raw `comix.manifest.json` with live parse validation & formatting |
| **Check** | Static schema/catalog/cue checks (click any issue to jump to its tab) + **Simulate 60fps Timeline** button |

### Connected Pages (`01 ...`, `02 ...` -> `pages/page-XX-<slug>/page.spec.json`)
| Tab | Controls |
| :--- | :--- |
| **Overview & Cues** | Page `title`, `summary`, `[from, until]` window, page-local `cues`, 3D page-flip `turn`, and full-page `overlays` (`title_card`) |
| **Panels & Camera** | **2D Landscape & Portrait Page Layout Mini-Map** (click any panel box to freeze the live 3D preview at that panel!) + `panels[]` layout rects, `snapshotAt`, and orthographic camera shots (`from`, `to`, `span`, `ease`, `portrait`) |
| **Letters** | Grouped per panel with `▶ Jump` buttons: `caption`, `banner`, `sfx`, `sfx_seq`, `bubble`, `label_tag`, `prompt_list`, `glitch_text`, `tier_stack`, `panel_flash`, `invert`, `stats_card` |
| **Beats & Tracks** | Page-wide continuous `tracks[]` + per-panel discrete `beats[]` and continuous `tracks[]`. Clicking `▶` on any item jumps the 3D preview straight to that beat/track's timestamp |
| **JSON / Check** | Raw `page.spec.json` editor and page-scoped + full-reel 60fps verification |

### Game-Engine Workspace Layout, Draggable/Resizable Docks & Viewport Zoom
The editor follows a game-engine workstation layout with the **Comix Viewport** centered on a dark stage mat:
- **Left Outliner (`[`):** Sequence Setup + Connected Pages (`◀` collapse button, `⠿` drag grip).
- **Center Viewport Stage:** Toolbar (`Page` zoom `Fit` / `40%–250%`, `Scene` orthographic zoom `0.25×–6.0×`, `↺ Reset Cam`, `📷 Apply Shot`, `⛶ Focus`) + centered `/cinematic.html` iframe (clean unobstructed page without duplicate in-page pause/skip buttons; holds on the final frame when playback reaches `durationSec`).
  - **Direct Comix View resize:** Drag the left edge, right edge, bottom edge, or bottom-right corner handle on the preview frame (`Shift` locks aspect ratio; Arrow keys resize when focused; `Enter` / `Home` / double-click handle or `Fit` returns to auto-fit).
  - **Mouse wheel** over the viewport zooms the 3D scene camera around the cursor; **drag** (left-drag when frozen/paused, or Alt+drag / middle-drag anytime) pans the 3D scene camera; **`📷 Apply Shot`** writes the framed `{ x, y, w, h }` back to `camera.portrait` (in Portrait mode), `camera.to` (second half of an animated camera span), or `camera.from`.
  - **`Ctrl/Cmd + Wheel`** scales the comic page canvas itself (`40%–250%`), with 2D scrolling/panning on the stage mat.
  - **Bidirectional element selection:** Click any 2D panel, 2D letter/overlay (`[data-comix-sel-kind]`), or 3D cast actor / prop / fixture directly in the Viewport (via DOM hit-test + orthographic 3D raycast / `Box3` fallback in `src/cinematic/editor-select.ts`) to draw the `.htc-sel-box` marquee, display the stage-bar `◎` selection pill, open the Right Inspector if hidden, route to the owning tab, expand `<details class="item is-selected">`, and scroll into view. Conversely, clicking or focusing any Inspector element, `.panel-sec`, or `.layout-box` highlights it in the Viewport and seeks to its visibility window if hidden while preserving focused inputs.
- **Bottom Timeline & Transport Dock (`\`):** `⠿` drag grip, `▶ Play Full` (live playhead syncs scrubber & active jump/sheet highlights in real time), `⏸ Freeze`, `◀ Panel` / `Panel ▶`, `📱 Portrait` / `🖥 Landscape`, `0.05s` scrubber, and quick-jump chips (`⊟`, page/panel chips automatically jump past earlier page-turn transitions).
- **Right Inspector (`]`):** `⠿` drag grip, roving-tabindex ARIA tablist (`ArrowLeft`/`ArrowRight`/`Home`/`End`), forms, interactive **2D Landscape/Portrait sheet** (highlights active preview panel, click to preview, drag or `Alt+Arrows` to reposition `[x, y]`, drag corner or `Alt+Shift+Arrows` to resize `[w, h]`), raw JSON, and 60fps verifier (`▶` collapse button).
- **Splitters, Drag-to-Float & Side Swapping:** Drag the seams between left/right/bottom docks and the stage (or use Arrow keys on focused splitters; double-click to reset). Drag any dock's `⠿` grip (or header bar) to undock it into an 8-way edge/corner resizable floating window, drag to screen edges (`left`/`right`/`bottom`) to re-dock or swap `Pages ↔ Inspector` (preserving each panel's width), click `📌` (or double-click `⠿`) to dock, or click **`↺ Layout`** to reset all dock positions, sizes, and viewport fit.
- **All UI Hidable / Focus Mode (`` ` ``):** Every dock (`Top`, `Pages`, `Inspector`, `Timeline`, `Chips`, `Bar`) toggles individually from the top bar or inline close buttons and persists in `localStorage['ht-comix-editor-ui']`. Focus mode (`⛶ Focus`) hides all chrome and opens a floating `☰ Restore UI` pill in the stage corner.
- **Conflict-safe saving:** Every file carries an `etag`. Saving (`Ctrl/Cmd+S` for active file, `Ctrl/Cmd+Shift+S` for all dirty files) calls `model.syncSummaries()`, writes changed JSON canonically via `stringifyComixJson`, and recompiles `src/cinematic/generated/catalog-data.ts`. Stale writes return `409` without overwriting disk.

---

## Code Map (`src/comix-editor/` + `src/editor-core/`)

| File | Responsibility |
| :--- | :--- |
| `src/editor-core/*` | Shared workstation layer: `dom.ts`, `schema.ts`, `form.ts`, `form-state.ts`, `schema-check.ts`, `http.ts`, `file-tracker.ts`, `drag.ts`, `dock-state.ts`, `dock-layout.ts`, `workspace.ts`, `view-resizer.ts`, `viewport-stage.ts`, `chrome.ts` |
| `schema.ts`, `schema-letters.ts`, `schema-tracks.ts`, `schema-fields.ts` | Exhaustive `Field[]` tables keyed by every tagged union in `src/cinematic/spec-types.ts` (a new `kind` without a form fails `tsc`) |
| `check.ts` | Static validator (`objectShape` + `ModelCatalog`/`FxCatalog` refs + panel rect bounds + cue & timeline continuity + `simulateComixPack`) |
| `model.ts` | `BasePackModel` + `FileBaselineTracker`, `syncSummaries()`, identity-safe `replace()`, per-file dirty tracking & `etag` conflict state |
| `sheet-drag.ts` | 2D Landscape/Portrait sheet panel box pointer drag/resize and `Alt+Arrow` keyboard nudging |
| `preview.ts`, `preview-bars.ts` | Center `/cinematic.html` viewport (`ViewportStageController`), Page/Scene zoom + Apply Shot, live playhead sync, `.cx-sel-pill`, and bottom transport/scrubber/jump dock (`timelineEl`) |
| `selection.ts` | Bidirectional routing (`routeForElement`, `resolveSelectionFromPath`), `visibilityJumpForElement` seeking, and focus-safe `syncInspectorSelectionDom` |
| `panes.ts`, `chrome.ts`, `app.ts` | Top bar (zero redirect links), outliner, roving ARIA tablist, interactive 2D Page Layout Mini-Map, skip editor, JSON pane, 60fps simulator UI, selection wiring & `window.__comixEditor` hook (`selectedElement`, `selectElement`, `pickViewportElement`) |

Node side: `scripts/harness/lib/comix-api.mjs` + `editor-api-common.mjs` (dev API), `comix-compile.mjs`, `comix-json.mjs`, `scripts/harness/editor-unit-test.mjs`, and `scripts/harness/comix-editor-smoke.mjs`.

---

## Adding a New Comix Spec Capability (4 Places Together)

1. Type it in `src/cinematic/spec-types.ts`.
2. Interpret it generically once in `src/cinematic/` (`tracks.ts`, `beats.ts`, or `letters-build.ts` / `letters-draw.ts`) + `timeline.ts`.
3. Add its form fields in `src/comix-editor/schema*.ts`.
4. Validate its invariants in `src/cinematic/simulate.ts` / `src/comix-editor/check.ts`.
5. Run `node .kiro/skills/comix-implementer/scripts/verify-comix.mjs`, `node scripts/harness/editor-unit-test.mjs`, `node scripts/harness/comix-editor-smoke.mjs`, and `npm run quality`.
