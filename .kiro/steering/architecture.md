# Architecture rules

Code follows clean architecture: dependencies point inward, and the rules are enforced by scripts, not by memory.

## Layers (inner to outer)

```
contracts/            pure types shared by game and tools (events, room view)
procgen/core          domain: palette, rng, types, catalogs, pixel buffers. No three.
procgen/geometry      shape -> geometry, software raster (three math only)
procgen/kit, textures, archetypes, fx, anim, validate
                      content and rules as plain data and pure functions
procgen/runtime       adapters: comic materials, ink shells, animator, FX emitter. Only layer that imports shaders/
shaders/              GLSL materials and post passes. Imports nothing from procgen
storybook/            storybook: domain <- subjects <- stage <- ui <- app (entry: storybook/storybook.ts)
assets/               optional PNG albedo loader (three). No other src imports.
game/                 world, VFS, shell, session. Three-free. Room view types come from contracts.
chapters/             level runtime. Imports game and contracts. generated/ is compiled data.
renderer/             comic stage. Three, procgen, shaders, assets. Not the game rules.
cinematic/            generic 3D comix runtime. Three, procgen, shaders. generated/ is compiled data.
editor-core/          shared workstation framework for spec editors: schema form builder, schema walker, HTTP/etag baseline tracker, dock layout, workspace persistence, resizable viewport stage, the game preview shell and play frame (`game-preview.ts`, `play-frame.ts`), the console dock, and chrome helpers (contracts only).
comix-editor/         /comix-editor. editor-core, cinematic, procgen. Player runs in an iframe.
ui/                   terminal, HUD, editor, shader dock. No three import of its own.
sandbox/              dev inspector. Talks to the stage through its public methods.
pages/                chapter select and comic reader scripts.
chapter-editor/       /editor. contracts, editor-core, game, chapters, procgen. No game rules of its own; the game runs in an iframe.
terminal-lab/         /terminal-lab. contracts, editor-core, chapter-editor (field tables, suggest), game, chapters, procgen. Builds a throwaway pack from a lab script (or imports a chapter level read-only) and plays it in the game iframe with in-page session swaps; no game rules of its own. What it needs from the game is one generic session option, `lab?: LabConfig` on `ChapterSession` and classic `createSession`, plus read-only `inspect()`, `labTick()` and `inject()` (`src/game/lab-*.ts`, `src/chapters/session-lab*.ts`).
laptop/               /laptop-lab. domain/ (pure: lifecycle state machine, desktop reducer, tasks and checks, keyboard, boot, geometry, progress) <- runtime/ (Worker and sandboxed-iframe runner, loop guard, WebAudio) <- ui/ (editor-core, procgen/core palette) <- lab/. No three; no game rules. Player code never runs in the page's own realm.
hub/                  front-door funnel entry (`pages/index.html`). Imports contracts and chapters; no three.
play/                 play page composition. Wires the outer layers. main.ts only starts it.
main.ts               loads the play page. Imports play/ and styles only.
```

Exact allowed imports live in `scripts/quality/check-layers.mjs`. Change the rules there if the architecture changes, in the same commit.

## Hard limits

- No source file over 600 lines. No function over 130 lines. Split by responsibility, not by line count. `src/chapters/generated/` and `src/cinematic/generated/` are compiled data and are outside the size gate; regenerate them, do not hand-edit them.
- No duplicated blocks (`jscpd`, 4 lines / 35 tokens). Extract the shared helper into the innermost layer that both callers may import. `src/chapters/generated/` and `src/cinematic/generated/` are compiled data and are excluded.
- KISS: plain functions and data tables before classes; no indirection that only exists to survive a missing module.
- No `any`.

## Gates (run before saying a change is done)

- `npm run quality` : typecheck, root layout, size, layers, declarative (no chapter, level, or comix page named in code), specs (every spec has a valid `Status:`, no open questions past `draft`, every new `src/<area>/` or page is named by an approved spec; `spec-first.md`), duplicates, agents (`check-agents.mjs`: the team agents match their table and every source file has one owner), brands (`quality:brands` / `check-brands.mjs`: no real AI agent brand names in tracked files), properties (`property-tests.mjs`: fast-check properties per feature, fixed seed).
- `node scripts/harness/generate-chapter.mjs --verify` : compile chapters, static spec checks, 0-death headless playthrough.
- `node scripts/harness/generate-comix.mjs --verify` & `node scripts/harness/validate-comix.mjs` : compile comix sequences, static + connected-folder checks, 60fps headless timeline simulation.
- `node scripts/harness/editor-unit-test.mjs`, `node scripts/harness/editor-smoke.mjs` & `node scripts/harness/comix-editor-smoke.mjs` : unit/corner-case suite + chapter and comix editors in headless Chrome.
- `npm run quality:fingerprint` : hashes of every model, texture and FX (specs, validator reports, rasters, meshes, poses). Refactors must leave it byte-identical; for intended asset changes, diff it and explain the change.
- `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/terminal-lab-api-test.mjs`, `node scripts/harness/terminal-lab.mjs --all` & `node scripts/harness/terminal-lab-smoke.mjs` : Terminal Lab unit/API/headless-run suites and the lab in headless Chrome (1600x950 and 1280x820 with `--width 1280 --height 820`).
- `node scripts/harness/laptop-unit.mjs` & `node scripts/harness/laptop-lab-smoke.mjs` : laptop domain, loop guard and inventory units, and the Laptop Lab in headless Chrome with real key and mouse input (1600x950 and `--width 1280 --height 820`).
- Storybook: `node scripts/harness/screenshot-lab.mjs --selftest`.
