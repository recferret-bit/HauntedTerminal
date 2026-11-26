# Architecture hardening: design

Status: see requirements.md

Written 2026-11-26 from commit 1905207 and the working tree of that day; every path below was checked in the code.

## 1. Gate chain (req 1-9, 25)

`npm run quality` (`package.json` `scripts.quality`) runs, stopping at the first failure:

| # | Script | File | Checks |
|---|---|---|---|
| 0 | `tsc --noEmit` | `tsconfig.json` | strict plus `noImplicitReturns`, `noImplicitOverride`, `useUnknownInCatchVariables`, `forceConsistentCasingInFileNames` (req 7) |
| 1 | `quality:deps` | `scripts/quality/check-deps.mjs` | exact semver in all four dependency sections, lockfile root equals `package.json` (req 2, 3) |
| 2 | `quality:lint` | `scripts/quality/eslint.config.mjs` | ESLint over `src`, `scripts/{quality,hooks,desktop,mcp,harness}`, `social/media`, `.kiro/powers` (req 4); `lint` delegates to it |
| 3 | `quality:root` | `check-root.mjs` | repository root layout |
| 4 | `quality:size` | `check-size.mjs src scripts/desktop` | 600 lines per file, 130 per function |
| 5 | `quality:layers` | `check-layers.mjs` | import direction per layer |
| 6 | `quality:cycles` | `check-cycles.mjs` | runtime import cycles in `src/**/*.ts`, no allowlist (req 5) |
| 7 | `quality:deadcode` | `check-deadcode.mjs` | unreachable modules, unused exports and types, unreferenced CSS; allowlist `brand.ts`, `procgen/index.ts` (req 6) |
| 8 | `quality:declarative` | `check-declarative.mjs` | no chapter, level or comix ids in `src/` |
| 9 | `quality:specs` | `check-specs.mjs` | spec statuses, decisions, open questions |
| 10 | `quality:dup` | `jscpd` | zero clones (4 lines, 35 tokens) |
| 11 | `quality:agents` | `check-agents.mjs`, `agents-unit.mjs`, `audio-gen-unit.mjs`, `social-unit.mjs` | agent table, hooks, ownership (req 23) |
| 12 | `quality:legacy-name` | `check-legacy-name.mjs` | old project name |
| 13 | `quality:brands` | `check-brands.mjs` | no real AI brand names |
| 14 | `quality:mcp` | `forge-unit.mjs` | MCP tools |
| 15 | `quality:props` | `property-tests.mjs` | 87 properties |

Not in the chain: `npm run test` (req 10, a manual convenience), `quality:fingerprint` (a refactor check, req 22) and the smoke suites.

Two report-only hooks run the same checks outside the chain, each printing a `FAILED (report-only)` line per failing step and exiting 0: `.kiro/hooks/static-analysis-on-save.json` (PostFileSave on `src/**/*.ts` and `scripts/{quality,hooks,desktop,mcp,harness}/**/*.mjs`: `quality:lint`, cycles, layers, size; 60 s) and `.kiro/hooks/quality-chain-on-stop.json` (Stop: `tsc`, deps, lint, size, layers, cycles, deadcode, declarative, dup, legacy-name, brands; 90 s). Both are the user's files.

## 2. Components (req 13-21)

- `src/contracts/state-machine.ts`: `TransitionTable<S, E>`, `nextMachineState`, `reachableStates`, `createStateMachine` (`can`, `send`, `reset`, `subscribe`). Pure. A convention, not a gate.
- `src/contracts/dom.ts`: `dom`, `el`, `setText`, `replayClass`. Touches `document`; the one exception in `contracts/` (decision 8). `src/editor-core/dom.ts` holds the separate `h()`.
- `src/play/events.ts`: `PlayEventBus` (`createPlayBus`, 11 event kinds, modal actions through `routeModalAction`). `src/play/lifecycle.ts`: `createPlayLifecycle` over `PLAY_PHASE_TRANSITIONS` plus `PauseReason`s, `derive` gives clock pause, storm pause, shell block and HUD visibility.
- Shells: `CLASSIC_HANDLERS` (`src/game/session-shell.ts`) and `CHAPTER_HANDLERS` (`src/chapters/session-shell.ts`); shared services `src/game/unix-applets.ts`, `src/game/kiro-commands.ts` (`runKiroCommand`), `src/game/tree.ts` (`isDescendantOrSelf`). Both `cmdRm` implementations (`src/game/commands-fs.ts`, `src/chapters/session-fs.ts`) refuse the root, a parentless node, the cwd and its ancestors with the same message (req 20).
- `src/chapters/metagame-data.ts`: static metagame tables, re-exported by `catalog.ts`.

### State machine tables

| Table | File |
|---|---|
| `BATTLE_TRANSITIONS` (stepped with `nextMachineState`) | `src/game/battle.ts` |
| `KIRO_CRACK_TRANSITIONS`, `TUTORIAL_TRANSITIONS` | `src/game/kiro.ts`, `src/game/agents.ts` |
| `PLAY_PHASE_TRANSITIONS` | `src/play/lifecycle.ts` |
| `ESC_MENU_TRANSITIONS`, `CHAPTER_MAP_TRANSITIONS`, `MANUAL_BOOK_TRANSITIONS`, `SEARCH_DRAWER_TRANSITIONS`, `NATIVE_MODAL_TRANSITIONS` | `src/ui/{esc-menu,chapter-map,manual-book,manual-book-search,modal-dialog}.ts` |
| `DIALOG_TRANSITIONS`, `DIALOG_SOCKET_TRANSITIONS` | `src/ui/{dialog-box,dialog-orchestrator}.ts` |
| `VISUAL_LAB_TRANSITIONS` | `src/ui/visual-lab-panel.ts` |
| `EDITOR_TRANSITIONS`, `RUN_TRANSITIONS` (module-private tables) | `src/ui/code-editor.ts`, `src/terminal-lab/run-control.ts` |

The laptop keeps its own `TRANSITIONS` record (`src/laptop/domain/machine.ts`), outside this spec.

## 3. Ownership (req 23)

`lead-dev` writes `scripts/harness/{hub-unit,classic-unit,architecture-unit}.mjs` (`agents-build.mjs` line of `lead-dev`, the `lead-dev` row of `team-rules.md`, `OWNED` in `check-agents.mjs`). The generated `.kiro/agents/lead-dev.json` is rebuilt with `node scripts/harness/agents-build.mjs`. The gate scripts and the two hooks have no agent owner.

## 4. Test pyramid

1. Static: `tsc`, ESLint, the gate scripts above (seconds, deterministic).
2. Unit, Node through Vite SSR: `classic-unit.mjs` (17 tests), `architecture-unit.mjs` (14), plus the other suites in `npm run test` (req 10).
3. Properties: `property-tests.mjs` (fast-check, fixed seed). The state-machine, bus and shell-agreement properties live in `props/gameplay-fsm.mjs`, `props/terminal-ui.mjs` and `props/terminal.mjs` (req 24).
4. Whole level: `generate-chapter.mjs --verify` (0 deaths), `generate-comix.mjs --verify`.
5. Browser: the smoke suites in headless Chrome (not part of this spec's gates).
6. Behaviour lock for refactors: `quality:fingerprint` byte-identical to the tree before (req 22).

## 5. Decisions about the design

None open: the placement questions (`dom.ts`, `PlayEventBus`, the cycle scope, the allowlist) are decisions 5, 6, 8 and 12 in `requirements.md`.
