---
name: laptop-lab
description: "[WORKFLOW] Test bench and developer workflow for the developer's laptop emulator (`/laptop-lab`, `src/laptop/`): lifecycle state machine, desktop apps (Quests, JS Pad Worker, Web Weaver sandboxed iframe, System Info), deterministic `Check` rules, Quest Check & `RunReport` Inspector card, `?state`/`?speed`/`?mute` URL parameters, `window.__laptop`, and headless `laptop-lab.mjs --verify` verification. Use whenever adding or tuning a laptop coding task, check rule, boot phase, desktop app, or inspecting `/laptop-lab`."
---

# Laptop Lab (`laptop-lab`)

**Category: WORKFLOW.** Owner: `laptop-designer` (`src/laptop/**`, `scripts/harness/props/laptop.mjs`). CSS lives in `src/styles/laptop*.css` (`lead-dev`), and `/play` in-game overlay wiring lives in `src/play/laptop.ts` (`lead-dev`). Orthogonal to `.kiro/specs/play-laptop-overlay/`, `.kiro/specs/laptop-rework/`, and `.kiro/specs/laptop-web-studio/`.

## Run It

```bash
npm start                                          # dev server on http://localhost:5400
# open http://localhost:5400/laptop-lab
# URL params: ?state=closed|opening|open|diving|booting|desktop|shutting|surfacing|closing
#             ?speed=0|0.4|0.5|1 (custom numeric >= 0 allowed; invalid defaults to 1)  ?mute=1
node scripts/harness/laptop-lab.mjs --list         # list all TASKS and check counts offline
node scripts/harness/laptop-lab.mjs --verify       # headless Chromium: ?speed sync + all 7 tasks (starter FAIL, solution PASS)
node scripts/harness/laptop-lab.mjs --verify --task js-add
```

## Workbench Capabilities (`/laptop-lab`)

- **Lifecycle Machine Controls**: Visualizes all 9 `LAPTOP_STATES`, triggers valid user events (`OPEN`, `CLOSE`, `POWER`), offers `Skip to desktop` (`jump('desktop')`), and keeps `<select>` speed synchronized with `?speed=` and `window.__laptop.setSpeed(n)`.
- **Live Input Mirror**: Displays real keyboard `ev.code` + held deck keys (`lt.view.keyboard.pressed()`) and live trackpad `(u, v)` + mouse button state (`L`/`R`).
- **Quest Check & `RunReport` Inspector (`src/laptop/lab/inspector.ts`)**: Live status badge (`IDLE`, `LOADED`, `RAN`, `PASS`, `FAIL`, `ERROR`, `LOOP GUARD`), `RunReport` metrics, stdout logs, runtime/timeout errors, individual `CheckResult[]` pass/fail rows, and quick `Test starter` / `Test solution` buttons for any task.
- **Typed Automation Handle (`window.__laptop: LaptopHandle`)**: Allows headless suites to drive `machine.send()`, `jump()`, `setSpeed()`, `runTask(id, files)`, `resetProgress()`, and inspect `desktop` / `ctx.progress()`.

## Safety & Determinism Boundaries

- Player code **never** executes in the host page realm: `jspad` (`mode: 'script'`) runs in a Web Worker after `guardLoops()`, and `weaver` (`mode: 'page'`) renders in a `sandbox="allow-scripts"` iframe.
- Lifecycle states follow the declarative `TRANSITIONS`, `PHASE_MS`, and `LOOKS` tables in `src/laptop/domain/machine.ts` (zero manual phase flags).
- Every `LaptopTask` in `src/laptop/domain/tasks.ts` must have a `starter` that fails at least one check and a `solution` that passes every check.
- Full schema and types: [references/laptop-schema.md](./references/laptop-schema.md).

## Gates

```bash
npm run quality
node scripts/harness/laptop-unit.mjs
node scripts/harness/laptop-lab.mjs --verify
node scripts/harness/property-tests.mjs --only laptop
node scripts/harness/laptop-lab-smoke.mjs --width 1280 --height 820
node scripts/harness/play-laptop-smoke.mjs --width 1280 --height 820
```
