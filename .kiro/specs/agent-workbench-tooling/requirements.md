# Agent workbench tooling: requirements

Status: done (delegated approval by user 2026-11-27; verified and closed 2026-11-27)

Capability: upgrades all six editor and test-bench domains (`terminal`, `laptop`, `chapters`, `comix`, `fx`, `sfx/audio`) and exposes every tool, workbench route, CLI command, configuration schema, and `credits-forge` MCP capability cleanly to the `.kiro` Crew agents (`lead-dev`, `terminal-designer`, `laptop-designer`, `comix-designer`, `chapters-designer`, `artist`, `sound-designer`, `smm-agent`, `qa`). Fixes live workbench bugs, adds `/audio-lab` (`pages/audio-lab.html`, `src/audio-lab/`) plus `audio-gen.mjs inspect`, upgrades `/storybook.html?tab=fx` into an interactive FX workbench with real `validateFxPreset` metrics, adds a Quest Check & `RunReport` Inspector card plus headless `laptop-lab.mjs --verify` CLI for `/laptop-lab`, brings `credits-forge` and CLI runners to full domain parity with strict per-tool writer fences, and packages exhaustive configuration schemas inside `skill://` skills and `references/*.md` files.

## Requirements

### 1. Audio Lab workbench (`/audio-lab`) and offline `audio-gen.mjs inspect`
1. THE SYSTEM SHALL provide a browser workbench page `pages/audio-lab.html` served at `/audio-lab` (`vite.config.ts`, linked from `pages/dev.html`) backed by `src/audio-lab/`, keeping audio tuning tables (`SFX_TRIM`, `LOOP_GAINS`, `KEY_RATES`, `KEY_GAINS`) exported from `src/audio/config.ts` so `src/audio/engine.ts` stays within the 600-line file cap.
2. WHEN `/audio-lab` opens, THE SYSTEM SHALL render an interactive soundboard over all `SFX_IDS` and `MUSIC_IDS` (with variant playback), a waveform viewer with `SFX_TRIM` offset/duration scrubber (A/B comparing raw vs trimmed playback), a `LOOP_TAKES` and `LOOP_GAINS` mixer, a `MusicScene` and `AppBus` event tester, and a typed `window.__audioLab` automation handle.
3. WHEN `node scripts/harness/audio-gen.mjs inspect [<cue>...|--all]` runs, THE SYSTEM SHALL compute offline acoustic metrics (`duration`, peak dBFS via `ffmpeg` `volumedetect` when present, `SFX_TRIM` window comparison, manifest metadata, and list row alignment) without making ElevenLabs API calls.

### 2. Storybook FX INFO bugfix & interactive FX workbench (`/storybook.html?tab=fx`)
4. WHEN inspecting an FX preset in `/storybook.html?tab=fx&inspect=<id>`, THE SYSTEM SHALL compute and display real `FxSubjectInfo` telemetry from `validateFxPreset` (layers, particles, triangles, area `P/S/A`, `dE`, min chunk px, simulated bounds, `durationMs`, `stepFps`, `trigger`, `onomatopoeia`, `shake`/`flash`, `light`), SHALL NOT mislabel FX presets as `'texture / uMap on a comic material'`, and SHALL expose `fxInfo` on `window.__storybook.stats().subject` and in `scripts/harness/screenshot-lab.mjs`.
5. WHILE inspecting an FX preset in `/storybook.html`, THE SYSTEM SHALL provide interactive FX controls—stepped `12fps` frame scrubber (`0..fxTotalMs`), `Play`/`Pause`/`Step` frame controls, per-layer visibility toggles, and custom onomatopoeia preview text—without mutating declarative preset definitions in `src/procgen/fx/presets*.ts`.

### 3. Laptop Lab bugfixes, Quest Check & RunReport Inspector, and headless CLI
6. THE SYSTEM SHALL fix `?speed=` URL parsing and UI synchronization in `src/laptop/lab/lab-page.ts` and `.kiro/steering/tech.md` (normalizing finite non-negative speed values, rejecting `NaN`/negative inputs cleanly back to `1`, supporting `1`, `0.5`, `0.4`, and `0` presets, and syncing `<select>` when `setSpeed` is called), SHALL replace untyped `window.__laptop` casts in `src/laptop/main.ts` with a typed `Window.__laptop` declaration, and SHALL remain strictly orthogonal to `.kiro/specs/play-laptop-overlay/` and `.kiro/specs/laptop-web-studio/`.
7. WHEN `/laptop-lab` renders, THE SYSTEM SHALL include a Quest Check & `RunReport` Inspector card showing live pass/fail rule breakdown (`CheckResult[]`), stdout/logs, loop-guard hits, and quick starter/solution actions, and SHALL provide a headless `node scripts/harness/laptop-lab.mjs --verify` CLI testing all seven `TASKS` (confirming starter code fails and solution code passes in Worker JS and headless Chrome DOM checks).

### 4. CLI parity & full `credits-forge` domain MCP parity with per-tool writer fences
8. THE SYSTEM SHALL add `--format` (canonical `stringifyChapterJson` formatting) to `scripts/harness/generate-chapter.mjs`, add `--validate` and `--from-level <chapter>/<level>` to `scripts/harness/terminal-lab.mjs`, and parameterize `scripts/harness/lib/comix-compile.mjs` (`rootDir`, `catalogFile`) so tests and MCP tools operate on temporary directories safely.
9. THE SYSTEM SHALL expand `scripts/mcp/credits-forge/{tools,server}.mjs` with richer `FxCatalog` metadata in `list_assets`, chapter pack file tools (`get_chapter_file`, `validate_chapter`, `write_chapter_file`), comix tools (`list_comix`, `get_comix`, `validate_comix`, `write_comix`), and Terminal Lab tools (`list_labs`, `get_lab`, `validate_lab`, `run_lab`, `write_lab`), each enforcing canonical formatting, schema/runtime/simulation/0-death gates, and `baseEtag` conflict protection before atomic disk writes and catalog recompilation.
10. THE SYSTEM SHALL enforce per-tool MCP writer fences in `scripts/quality/agent-mcp.mjs`, `scripts/harness/agents-build.mjs`, and `scripts/harness/agents-unit.mjs`: `chapters-designer` alone writes levels/chapter files, `comix-designer` alone writes comix files, `terminal-designer` alone writes `.lab.json` files, `artist` receives read-only `list_assets`, and `qa` receives all read/validate/solve/sim/run tools across domains with zero write tools.

### 5. Configuration schemas in `skill://` skills, prompt sync & docs
11. THE SYSTEM SHALL ship `.kiro/skills/laptop-lab/` (`[WORKFLOW]`), `.kiro/skills/terminal-lab/` (`[WORKFLOW]`), and updated configuration schema `references/*.md` docs across `chapter-editor`, `comix-editor`, `procedural-particles-3d`, `comic-panel-viewport-auditor`, and `sfx-and-music-pipeline`—keeping `file://` resources under CLI caps (`LEAD_HEADROOM >= 15,000`).
12. THE SYSTEM SHALL regenerate `.kiro/agents/*.json` via `scripts/harness/agents-build.mjs`, update all nine prompts in `.kiro/agents/prompts/*.md` plus `.kiro/steering/{architecture,structure,tech,skills-map,team}.md`, `AGENTS.md`, `CLAUDE.md`, and `pages/dev.html`, and run `npm run agents:install` so Kiro CLI / Crew agents receive accurate workbench tools and configuration schemas.

## Out of scope

- Multi-chapter expansion beyond Kiroween's single chapter, new ElevenLabs audio generation (`--generate` spending credits), or modifying the committed visual baselines under `docs/qa/baselines/`.
- Changes overlapping `.kiro/specs/play-laptop-overlay/` or `.kiro/specs/laptop-web-studio/` (virtual disk `FILES.EXE`, `BROWSER.EXE`, `/room` mount, or `/play` laptop overlay).
- Embedding procedural geometry, shaders, or FX definitions inside declarative chapter, comix, or lab JSON files.

## Decisions

- **Q1 (SFX / Music workbench tooling):**
  **A (user delegated, 2026-11-27):** Add both browser `/audio-lab` (`pages/audio-lab.html` + `src/audio-lab/`) and offline `audio-gen.mjs inspect` CLI — interactive soundboard, waveform + `SFX_TRIM` scrubber, `LOOP_TAKES`/`LOOP_GAINS` mixer, `MusicScene` & `AppBus` tester, `window.__audioLab`, plus headless acoustic metrics; adds a new dev page/layer (`src/audio-lab/` owned by `sound-designer`).
- **Q2 (FX inspection and controls in `/storybook.html?tab=fx`):**
  **A (user delegated, 2026-11-27):** Fix the false `'texture / uMap'` INFO bug, wire `validateFxPreset` metrics (`fxInfo`) into UI + `window.__storybook` + `screenshot-lab.mjs`, and add interactive FX controls (`12fps` frame scrubber, Play/Pause/Step, per-layer toggles, custom onomatopoeia text preview) — active FX workbench while keeping presets declarative in TS.
- **Q3 (`credits-forge` MCP & CLI parity across Crew agents):**
  **A (user delegated, 2026-11-27):** Full domain parity in `credits-forge` + CLI flags — add Chapter pack file tools (`manifest`/`dialogs`/`comix.spec`), Comix tools (`list`/`get`/`validate`+60fps-sim/`write`), Terminal Lab tools (`list`/`get`/`run`/`write`), richer FX metadata in `list_assets` (also granted to `artist`), per-tool writer fences in `agent-mcp.mjs`, plus `--format`/`--validate`/`--from-level` CLI flags; larger MCP surface tested in `forge-unit.mjs`.
- **Q4 (Laptop Lab tooling):**
  **A (user delegated, 2026-11-27):** Ship a new `laptop-lab` skill + schema reference, type `window.__laptop`, fix `?speed=` drift, and add a Quest Check & `RunReport` Inspector card in `/laptop-lab` plus a headless `laptop-lab.mjs --verify` CLI — full quest/sandbox visibility while staying strictly orthogonal to `play-laptop-overlay` and `laptop-web-studio`.
- **Q5 (Configuration knowledge packaging & delegated spec-first approval):**
  **A (user delegated, 2026-11-27):** Put exhaustive configuration schemas in `skill://` skills + `references/*.md` (zero `file://` character-cap cost), fix all live bugs + stale prompt/skill drift, and treat these answers as delegated approval to author the Kiro spec and implement & verify everything end-to-end.

## Open questions

None (all decisions finalized and delegated 2026-11-27).

## Verification

- `node scripts/quality/check-specs.mjs`
- `npm run quality` (`tsc --noEmit`, `quality:deps`, `quality:lint`, `quality:root`, `quality:size`, `quality:layers`, `quality:cycles`, `quality:deadcode`, `quality:declarative`, `quality:specs`, `quality:dup`, `quality:agents`, `quality:brands`, `quality:mcp`, `quality:props`)
- `npm run test` & `npm run build` & `npm run quality:fingerprint`
- Feature gates: `audio-gen-unit.mjs`, `audio-gen.mjs --check`, `audio-gen.mjs inspect`, `audio-unit.mjs`, `audio-lab-unit.mjs`, `audio-lab-smoke.mjs`, `audio-smoke.mjs`, `screenshot-lab.mjs --selftest`, `validate-particles.mjs --all --strict`, `laptop-unit.mjs`, `laptop-lab.mjs --verify`, `laptop-lab-smoke.mjs`, `play-laptop-smoke.mjs`, `terminal-lab-unit.mjs`, `terminal-lab-api-test.mjs`, `terminal-lab.mjs --all`, `terminal-lab-smoke.mjs`, `editor-unit-test.mjs`, `editor-smoke.mjs`, `comix-editor-smoke.mjs`, `forge-unit.mjs`, `agents-unit.mjs`, `verify-chapter.mjs`, `verify-comix.mjs`, `npm run agents:install`, `npm run crew:check`.
