# Code Review & Architectural Hardening Report (`/boost`)

- **Date**: 2026-11-26
- **Scope**: Quality, clean-architecture, state-machine, event-bus, static-analysis, test, and `.kiro/` agent-policy hardening pass (including skeptical review & verification) across Out Of Credits.
- **Overall Score**: **6.2 / 10 (Before) -> 8.8 / 10 (After)** — target `>= 8.0 / 10` achieved.

---

## 1. Executive Scorecard

| Dimension | Before | After | Key Evidence |
|---|---:|---:|---|
| KISS, DRY & Cohesion | 6.0 | **8.8** | Replaced large imperative `switch` shells with `CLASSIC_HANDLERS` and `CHAPTER_HANDLERS`; deduplicated VFS ancestry traversal via `isDescendantOrSelf`; added missing root/cwd/ancestor `rm` guard in `src/chapters/session-fs.ts`; extracted `metagame-data.ts` from `catalog.ts` (`591 -> 343` lines); consolidated socket metadata (`SOCKET_META`) and `visual-lab-panel` field lookup (`numField`); `0` `jscpd` clones across `494` files (`78,651` lines). |
| Clean Architecture & Boundaries | 7.5 | **8.9** | Strict inward dependency checks pass across `499` modules with `0` runtime cycles; zero chapter/level hardcoding (`quality:declarative`); zero dead exports/types/CSS under module-scoped dead-code scanning (`quality:deadcode`). |
| State Machines (`createStateMachine`) | 5.0 | **9.0** | Converted battle combat (`BATTLE_TRANSITIONS`), play lifecycle, companion cracks, agent tutorial, Esc menu, code editor, terminal-lab run control, chapter map (`CHAPTER_MAP_TRANSITIONS`), manual book (`MANUAL_BOOK_TRANSITIONS`), modal dialog (`NATIVE_MODAL_TRANSITIONS`), dialog box (`DIALOG_TRANSITIONS`), dialog socket (`DIALOG_SOCKET_TRANSITIONS`), visual lab (`VISUAL_LAB_TRANSITIONS`), and manual search drawer (`SEARCH_DRAWER_TRANSITIONS`) to explicit `TransitionTable` state machines. |
| Event Systems (`AppBus` / `PlayEventBus`) | 6.0 | **8.9** | Routed all 4 modal kinds (`manual`, `map`, `hint`, `menu`) through a single `PlayEventBus` `{ kind: 'modal', ... }` + `routeModalAction` subscriber (including `onInsertCommand`, Esc menu, `F1`, `F3`, HUD buttons, and shell requests) with `closeOtherModals`/`anyModalOpen` cleanup on ending/cinematics. |
| Dead Code & Strict Dependencies | 5.5 | **9.0** | Upgraded `check-deadcode.mjs` to scope `.mjs` symbol scanning per referenced TS module (and transitive `.mjs` helpers), distinguish side-effect imports from namespace usage, track `.kiro/skills/**/*.ts` examples via AST, and check CSS reachability transitively from `pages/*.html` and live `.ts` files (`499` modules, `22` stylesheets); removed 30+ stale exports/re-exports, 6 dead exported types, and dead helpers (`must`/`at` in `src/game/floors.ts`). Tightened `check-deps.mjs` across all 4 dependency blocks + lockfile `packages[""]` parity + `!locked` failures. |
| Static Analysis & `.kiro/` Tooling | 6.5 | **8.6** | Extended `eslint.config.mjs`, `package.json` `lint`/`quality:lint`, and `.kiro/hooks/static-analysis-on-save.json` to lint `scripts/harness/**/*.mjs`, enabled extra bug-catching ESLint rules, and aligned `.kiro/hooks/quality-chain-on-stop.json`. |
| Unit, Browser & Property Testing | 6.5 | **8.9** | Expanded `architecture-unit.mjs` (`14` tests), `gameplay.mjs` (`30` properties), and `terminal.mjs` (`28` properties) to `86` total fast-check properties (`seed 20261117`); fixed `fakeDom()` timer/interval cancellation in `kit.mjs` and replaced a duplicate assertion in `mountDialogOrchestrator` property tests with non-vacuous `socket_locked` chatter-open gating; verified all `13` unit/content suites and `8` headless Chrome smoke suites (`0` console/page errors). |
| Agent & `.kiro/` Governance | 6.0 | **8.0** | Updated `.kiro/agents/prompts/*.md` (including `laptop-designer.md`), `AGENTS.md`, `CLAUDE.md`, `.kiro/steering/{architecture,tech,team}.md`, and `scripts/harness/agents-build.mjs`; regenerated `.kiro/agents/*.json` within the 100k CLI character ceiling. Deducted 2.0 points because pre-existing root `skills/` files currently fail `quality:root` and `check-agents.mjs`. |

**Weighted Average**: **8.8 / 10**

---

## 2. Concrete Architectural Findings Resolved

### A. KISS, DRY, and Modular Gameplay Orchestrators
1. **Table-Driven Shell Command Dispatch (`src/game/session-shell.ts`, `src/chapters/session-shell.ts`)**
   - *Before*: Large imperative `switch` statements in shell dispatchers pushed `dispatchCommand` near the 130-line function limit and mixed parsing with control flow.
   - *After*: Replaced with declarative lookup maps (`CLASSIC_HANDLERS` and exported `CHAPTER_HANDLERS: Readonly<Record<string, ChapterHandler>>`) binding direct handler functions (avoiding boilerplate wrapper arrows so `jscpd` remains at `0` clones).
2. **Unified VFS Ancestry Check (`src/game/tree.ts`, `src/game/commands-fs.ts`, `src/game/runtime.ts`, `src/chapters/session-fs.ts`)**
   - *Before*: Three separate parent-pointer walks (`while (inside)`, `isWithin`, `isCwdInside`) duplicated descendant containment checks. Also had single-line pass-through wrappers (`applyMode` in `src/game/commands-fs.ts`, `sedScript` in `src/game/commands-text.ts`).
   - *After*: Extracted pure `isDescendantOrSelf(node: VNode, ancestor: VNode): boolean` in `src/game/tree.ts`, removed all three duplicates, and called `applyChmodMode` / `compileSedScript` directly.
3. **Catalog Cohesion Split (`src/chapters/catalog.ts`, `src/chapters/metagame-data.ts`), Socket/Field Tables (`src/game/puzzle.ts`, `src/ui/visual-lab-panel.ts`), and VFS `rm` Safety (`src/chapters/session-fs.ts`)**
   - *Before*: `src/chapters/catalog.ts` reached 591 lines mixing pack types with static dossier/perk/grimoire data; `src/game/puzzle.ts` repeated four parallel `if`-chains over socket names; `src/ui/visual-lab-panel.ts` duplicated `switch` accessors (`pixelField`/`crtField`); `src/chapters/session-fs.ts` lacked a root/`cwd`/ancestor check in `cmdRm` (`rm -r ..` could unlink active ancestors).
   - *After*: Extracted static metagame data into `src/chapters/metagame-data.ts` (reducing `catalog.ts` to 343 lines), consolidated socket metadata into `SOCKET_META`, replaced `pixelField`/`crtField` with typed `numField`, and added `isDescendantOrSelf(g.rt.cwd, res.node)` refusal in `cmdRm`.

### B. Heavy State Machine Adoption (`src/contracts/state-machine.ts`)
1. **Turn-Based Combat Orchestrator (`src/game/battle.ts`)**: Backed by exported `BATTLE_TRANSITIONS` (`idle | intro | player | enemy`) with explicit turn-timer, hold, and agent-taunt invariants verified by `battle-unit.mjs` and property tests.
2. **Gameplay & Editor Lifecycle FSMs**: `PlayLifecycle` (`PLAY_PHASE_TRANSITIONS` in `src/play/lifecycle.ts`, wired on `Play` in `src/play/state.ts`), `KiroCompanion` crack FSM, `AgentDirector` tutorial FSM, `EscMenu` (`ESC_MENU_TRANSITIONS`), `CodeEditor` (`EDITOR_TRANSITIONS` in `src/ui/code-editor.ts`), and `TerminalLab` `RunControl` (`RUN_TRANSITIONS` in `src/terminal-lab/run-control.ts`) all run on `createStateMachine`.
3. **UI & Search Orchestrators Converted**:
   - `src/ui/chapter-map.ts`: `confirmOpen`/boolean tracking replaced with `CHAPTER_MAP_TRANSITIONS` (`closed | browsing | confirming`) + `createChapterMapMachine`.
   - `src/ui/manual-book.ts`: boolean `opened` replaced with `MANUAL_BOOK_TRANSITIONS` (`closed | open`) + `createManualBookMachine`.
   - `src/ui/modal-dialog.ts`: boolean `open` replaced with `NATIVE_MODAL_TRANSITIONS` (`closed | open`) + `createNativeModalMachine`.
   - `src/ui/dialog-orchestrator.ts`: boolean `socketOpen` replaced with `DIALOG_SOCKET_TRANSITIONS` (`free | socket_locked`) + `createDialogSocketMachine`.
   - `src/ui/visual-lab-panel.ts`: `open`/`dead` booleans replaced with `VISUAL_LAB_TRANSITIONS` (`closed | open | destroyed`) + `createVisualLabMachine`.
   - `src/ui/manual-book-search.ts`: paired `drawerOpen`/`allowFocusOpen` booleans replaced with `SEARCH_DRAWER_TRANSITIONS` (`closed | suppressed | open`) + `createSearchDrawerMachine`.
   - `src/ui/dialog-box.ts`: exported `DIALOG_TRANSITIONS`, `DialogPhase`, and `DialogTransition` for direct table inspection and property verification.

### C. Event-Driven Interactions (`AppBus` & `PlayEventBus`)
- *Before*: Keyboard shortcuts (`F1`, `F3`), HUD controls (`onHint`, `onMap`, `#tty-manual-btn`), `onInsertCommand`, and `outro.ts` ending cleanup mutated modal toggles directly instead of emitting events, duplicating `menu` toggle handling between `src/play/input.ts` and `src/play/menu.ts`.
- *After*: `PlayEvent` (`src/play/events.ts`) routes all 4 modal kinds (`manual`, `map`, `hint`, `menu`) through one `routeModalAction(modalTarget, ev)` listener in `src/play/input.ts` (including guarded `openMenuModal`), `onInsertCommand` emits `{ kind: 'modal', modal: 'manual', action: 'close' }`, and `beginEnding` in `src/play/outro.ts` invokes `closeOtherModals(play)` + `play.codeEditor?.close()`.

### D. Dead Code, Strict Dependency Pinning & Static Analysis Chain
1. **Scoped Dead Code Gate (`scripts/quality/check-deadcode.mjs`)**: Upgraded `check-deadcode.mjs` so `.mjs` symbol references only count toward TS modules actually referenced by those `.mjs` scripts (with transitive `.mjs` import and `export *` propagation), `import './side-effect'` no longer masks exports, `.kiro/skills/**/*.ts` AST imports are respected, and CSS reachability is traced transitively from `pages/*.html`, `vite.config.ts`, and reachable `.ts` modules. Removed dead exported types (`BestiaryDossierEntry`, `SpriteArchetype`, `BoardTheme`, `Option`, `Phase`, `RoomId`), dead internal exports (`objectShape` re-export, `blankOf`/`remapArrayPaths` re-exports, `b`/`n`/`opt`/`sel`/`t`, `settle`, `getComixPack`/`getComixManifest`, `transition`/`advance`/`owner`, `collect`, `textureUrl`, `clock`, `POWER_ON_MS`, `Command`, `INTRO_LAYOUT`, `buildIntroRoom`, `ROOM_DEFS`, `TEXTURE_ENTRIES`, `DESIGN_LEFT`/`DESIGN_RIGHT`/`floorForKind`), dead `must`/`at`/`resolve` in `src/game/floors.ts`, and re-exported `ACTOR_BAND`/`BAND_ZONES` via `src/procgen/index.ts`.
2. **Strict Library Version Gate (`scripts/quality/check-deps.mjs`)**: Expanded from 2 dependency blocks to all 4 (`dependencies`, `devDependencies`, `optionalDependencies`, `peerDependencies`), added strict `package-lock.json` `packages[""]` parity validation (`name`, `version`, exact pinned keys/versions, no stale extras), and changed `!locked` from silent skip to hard failure.
3. **Extended ESLint & `.kiro/` Quality Chain (`scripts/quality/eslint.config.mjs`, `package.json`, `.kiro/hooks/`)**: Included `scripts/harness/**/*.mjs` in both `lint` / `quality:lint` and `.kiro/hooks/static-analysis-on-save.json`; enabled `no-self-compare`, `no-unreachable-loop`, `no-constant-binary-expression`, `default-case-last`, `no-useless-rename`, and `object-shorthand`; aligned `.kiro/hooks/quality-chain-on-stop.json` with the full static gate sequence.

### E. Unit Tests, Property-Based Tests & Agent Governance
1. **Unit & Property Tests**:
   - `scripts/harness/architecture-unit.mjs`: Covers `CHAPTER_MAP_TRANSITIONS`, `MANUAL_BOOK_TRANSITIONS`, `NATIVE_MODAL_TRANSITIONS` (+ `createNativeModal` focus restoration), `DIALOG_TRANSITIONS`, `DIALOG_SOCKET_TRANSITIONS` (+ `mountDialogOrchestrator`), `VISUAL_LAB_TRANSITIONS`, `SEARCH_DRAWER_TRANSITIONS`, `isDescendantOrSelf`, `CHAPTER_HANDLERS`, `PlayEventBus` modal routing across all 4 modal kinds, and `ChapterSession` `cmdRm` root/cwd/ancestor refusal (`14` tests passing).
   - `scripts/harness/props/gameplay.mjs`: Added 3 fast-check properties (`BATTLE_TRANSITIONS` + `battle.ts` state/timer/hold invariants, `AppBus` FIFO order + `200`-entry cap + `publishKernel`, `PlayEventBus` delivery & unsubscribe isolation) — `30` properties total.
   - `scripts/harness/props/terminal.mjs` & `scripts/harness/props/kit.mjs`: Fixed `fakeDom()` to support cancelable `setTimeout`/`clearTimeout`/`setInterval`/`clearInterval`, added non-vacuous `(active.priority ?? 'script') !== 'chatter'` enforcement when new lines open under `socket_locked`, and verified all 8 UI `TransitionTable` machines — `28` properties total.
2. **Agent & Steering Policy**:
   - Updated `.kiro/agents/prompts/laptop-designer.md` plus `team-rules.md`, `lead-dev.md`, `terminal-designer.md`, `chapters-designer.md`, `comix-designer.md`, `artist.md`, `qa.md`, `.kiro/steering/{architecture,tech,team}.md`, `AGENTS.md`, `CLAUDE.md`, and `scripts/harness/agents-build.mjs`, regenerating `.kiro/agents/*.json` within the 100k CLI character ceiling.

---

## 3. Verified Execution Record

### Static Gates & Build
- `npx tsc --noEmit` -> **PASS** (exit 0)
- `npm run quality:deps` -> **PASS** (`dependency version gate OK`)
- `npm run quality:lint` -> **PASS** (`eslint -c scripts/quality/eslint.config.mjs src scripts/quality scripts/hooks scripts/desktop scripts/mcp scripts/harness`, 0 errors/warnings)
- `npm run quality:size` -> **PASS** (`size gate OK`)
- `npm run quality:layers` -> **PASS** (`layer gate OK`)
- `npm run quality:cycles` -> **PASS** (`cycles gate OK (499 modules, 0 runtime cycles)`)
- `npm run quality:deadcode` -> **PASS** (`deadcode gate OK (499 modules reachable, 22 stylesheets used, 0 dead exports/types)`)
- `npm run quality:declarative` -> **PASS** (`declarative gate OK`)
- `npm run quality:specs` -> **PASS** (`spec gate OK (38 specs)`)
- `npm run quality:dup` -> **PASS** (`Found 0 clones` across `494` files / `78,651` lines / `692,309` tokens)
- `npm run quality:legacy-name` -> **PASS** (`legacy name gate OK`)
- `npm run quality:brands` -> **PASS** (`brand gate OK`, 0 violations)
- `npm run quality:mcp` -> **PASS** (`forge unit: 12 tests passed`)
- `npm run quality:props` -> **PASS** (`property-tests PASS: 86 properties, seed 20261117, 100 runs max each`)
- `node scripts/harness/agents-build.mjs --check` & `node scripts/harness/agents-unit.mjs` -> **PASS** (`agents unit: 18 tests passed`)
- `npm run build` -> **PASS** (`546 modules transformed`, built in `2.08s`)

### Unit, Playthrough, Asset & Headless Chrome Smoke Suites
- `npm run test` -> **PASS** across all 13 suites (`classic-unit` 16, `architecture-unit` 14, `battle-unit` 14, `audio-unit` 24, `editor-unit-test` 11 suites, `terminal-lab-unit` 67 checks, `laptop-unit` 23 tests, `manual-unit` 9 tests, `hub-unit` 12 tests, `legacy-keys-unit`, `desktop-unit` 6 suites, `generate-chapter --verify` 11 levels / 65 cmds / 0 deaths, `generate-comix --verify` 2 sequences / 5 pages / 0 errors)
- `node scripts/harness/playthrough.mjs --ticks 3` -> **PASS** (`ended true, floor 5, hp 128, deaths 0, commands 67, rank A`)
- `npm run quality:fingerprint` -> **PASS** (exit 0)
- `node scripts/harness/smoke.mjs` -> **PASS** (`256x206, filled 23766px, 6 meshes`)
- `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --strict` -> **PASS** (`77 models: 77 ok, 0 failed, 0 errors, 0 warnings`)
- `node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all` -> **PASS** (`77 models, 0 errors, 7 warnings`)
- Headless Chrome suites:
  - `node scripts/harness/manual-smoke.mjs` -> **PASS** (`manual smoke OK`)
  - `node scripts/harness/terminal-lab-smoke.mjs` -> **PASS** (`terminal lab smoke OK`)
  - `node scripts/harness/play-browser.mjs --nointro` -> **PASS** (`final phase stats, floor 5, hp 170/170, rank S, 65 commands, 88 s`)
  - `node scripts/harness/laptop-lab-smoke.mjs` -> **PASS** (`laptop lab smoke OK`)
  - `node scripts/harness/audio-smoke.mjs` -> **PASS** (`audio-smoke OK`)
  - `node scripts/desktop/landing-smoke.mjs` -> **PASS** (`PASS landing-smoke`)
  - `node scripts/harness/editor-smoke.mjs` -> **PASS** (`chapter editor smoke OK`)
  - `node scripts/harness/comix-editor-smoke.mjs` -> **PASS** (`comix editor smoke OK`)

---

## 4. Open / Residual Issues Observed

1. **Pre-Existing Untracked `skills/` Directory (`quality:root` & `check-agents.mjs` Exit 1)**
   - *Details*: `scripts/quality/check-root.mjs` (`1 root violation(s): skills/`) and `scripts/quality/check-agents.mjs` (`agent gate FAILED (21)`, reporting `skills/elevenlabs-*/SKILL.md` plus 16 more unclassified files) fail exclusively due to the pre-existing `skills/` tree at repository root. Kept untouched as outside this refactor scope; resolving requires moving/classifying those files into `.kiro/skills/` or `OWNED`/`INFRA` in `check-agents.mjs`.
2. **Full-Screen Visual Diff Baseline Suite (`visual-audit.mjs`) Not Run**
   - *Details*: Functional UI layout and geometry were checked across all 8 browser smoke suites, `validate-model`, and `quality:fingerprint`, while pixel-diff regression against `docs/qa/baselines/` via `scripts/harness/visual-audit.mjs` was not executed in this pass.
3. **Kiro CLI Resource Headroom on `lead-dev`**
   - *Details*: `lead-dev` stays close to the 100,000-character CLI `file://` resource cap enforced by `check-agents.mjs`. Future additions to `AGENTS.md` or always-on `.kiro/steering/*.md` should remain concise or replace prose rather than appending unbounded text.
