# Inventory and Laptop Lab: design

Status: done

## Procgen (ASSET PCG)

- `src/procgen/archetypes/items/{lantern,laptop}.ts`: item builders, each with a `grip` socket (and `light` for the lantern). `items.ts` registers them.
- `src/procgen/archetypes/vibecoder.ts`: `buildDev(id, label, item)` and `holdItem()` move the item's grip to the hand, tag its parts with the holding arm's swing, put `handle` parts behind the hand. `HELD_VARIANTS` registers one developer per item.
- `MODEL_CATEGORIES` gains `item`; `MODEL_RULES` gains its budget and `sizes.itemMajor` (0.25 to 0.6); the semantic and read checks treat `item` like the vibecoder for human zones and like a pickup for glow share.

## Game

- `src/game/inventory.ts`: pure `Inventory`, `ITEMS` (item, model, hero model), `giveItem`, `holdItem`, `heroModel`, `inventoryCommand`, `runInventory`.
- `Run.inventory` (classic) and `ChapterState.inventory` (chapter); `SceneFacts.held` sets the hero actor's model in `buildRoom`.

## Laptop (`src/laptop/`), layers inward

| Layer | Files | May import |
|---|---|---|
| `domain/` | `machine` (transition table, phase times, looks, `createMachine` with an injected clock), `desktop` (window reducer), `apps`, `run` (request/report types), `checks` (`requestFor`, `judge`), `tasks`, `keyboard`, `boot` (`bootFrame(t)`), `geometry` (sizes, `framing`), `progress` | nothing |
| `runtime/` | `bridge` (sandbox-side source), `runner` (Worker / sandboxed iframe), `sound` (WebAudio) | domain |
| `ui/` | `laptop-view` (CSS 3D body), `keyboard-view`, `trackpad-view`, `boot-view`, `desktop-view`, `apps/*` (one `workbench` for both code apps), `palette` (zones to CSS vars), `laptop.ts` (`mountLaptop`) | domain, runtime, editor-core, procgen/core |
| `lab/`, `main.ts` | the `/laptop-lab` page | laptop, editor-core |

Styles: `src/styles/laptop.css` (sizes from `geometryVars()`, colours from `paletteVars()`, phase times as `--t-<state>`), `src/styles/laptop-lab.css`. Page: `pages/laptop-lab.html`, route `/laptop-lab` in `vite.config.ts`.

## Loop protection for page code (Req 9, decision Q7)

- `src/laptop/runtime/loop-guard.ts`, pure: `guardLoops(source): string`. A small scanner walks the source and skips comments, strings, template literals (with nested `${}`) and regex literals (a `/` after an operator, `(`, `,`, `=`, `return` and so on starts a regex). For each `while (cond)` it writes `while (__lg(N) && (cond))`; for each `for (a; b; c)` it writes `for (a; __lg(N) && (b); c)`, or `__lg(N)` when `b` is empty; a `do ... while` is covered by its `while`. `for...in` and `for...of` are left alone, since they end when the collection does. `N` is the loop's 1-based line in the player's file. Code the scanner cannot read safely (an unbalanced bracket) is returned unchanged, and the page then runs with only the watchdog.
- `bridge.ts` defines `__lg(line)` in the page: the first call in a task notes the time and schedules a reset for the next task; when one task has looped for more than `LOOP_BUDGET_MS` (1000 ms) it throws `RangeError: the loop on line N ran for over 1 s, so it was stopped`. The error reaches the console through the existing error capture. Event handlers (a click) get a fresh budget.
- `runner.ts` page runs pass `guardLoops(files.js)`; the checker's own probe code is not guarded. On the 2.5 s timeout a page run also sets the preview to a short "stopped: the page ran too long" document, which ends its scripts.
- JS Pad keeps the Worker and its terminate; no guard there.
- Tests: `laptop-unit.mjs` covers the transform (loops in strings, comments, regexes and templates untouched; `for`, `for (;;)`, `while`, `do-while`, nested loops; line numbers; unbalanced input unchanged; guarded code still parses with `new Function`). `laptop-lab-smoke.mjs` runs `while (true) {}` and `for (;;) {}` in Web Weaver, and expects the line-numbered error, a responsive page, and that the next run works.
