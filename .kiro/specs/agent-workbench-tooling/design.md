# Agent workbench tooling: design

Status: see requirements.md

## Layer, Page & Ownership Footprints

- **New layer:** `src/audio-lab/` (`deps: ['contracts', 'audio', 'editor-core']`, `three: false`) added to `scripts/quality/check-layers.mjs` and `.kiro/steering/architecture.md`, owned by `sound-designer` in `scripts/harness/agents-build.mjs`. Styles live in `src/audio-lab/audio-lab.css` so ownership stays cleanly under `src/audio-lab/**`.
- **New page & route:** `pages/audio-lab.html` added to `vite.config.ts` (`/audio-lab` route in `playPaths()` and `build.rollupOptions.input.audioLab`), linked from `pages/dev.html`, documented in `.kiro/steering/{structure,tech}.md` and `AGENTS.md`.
- **Shared audio config extraction:** `src/audio/config.ts` holds `SFX_TRIM`, `LOOP_GAINS`, `KEY_RATES`, `KEY_GAINS`, and `KeyTrim` metadata, imported by `src/audio/engine.ts` (keeping `engine.ts` safely under 600 lines) and `src/audio-lab/`.
- **Offline audio & laptop verification CLIs:**
  - `scripts/harness/audio-gen.mjs inspect` + `scripts/harness/lib/audio-gen-inspect.mjs`: reads `src/audio/config.ts`, manifests, `docs/audio/{SFX,MUSIC}_LIST.md`, and optionally probes MP3 durations / peak dBFS via `ffmpeg` `volumedetect` / `silencedetect` without calling ElevenLabs.
  - `scripts/harness/laptop-lab.mjs --verify`: verifies all 7 `TASKS` via Worker-compatible JS runner (`runJs`) and headless Chrome DOM checks for Web Weaver quests (starter code fails, solution code passes). Classified as infrastructure alongside `terminal-lab.mjs` in `check-agents.mjs`.
  - `scripts/harness/audio-lab-unit.mjs` and `scripts/harness/audio-lab-smoke.mjs`: owned by `sound-designer` (matches `audio-[^/]+\.mjs` in `check-agents.mjs`).

## Storybook FX Workbench (`src/storybook/`, `scripts/harness/screenshot-lab.mjs`)

- Add `FxSubjectInfo` to `src/storybook/subjects/types.ts` populated from `validateFxPreset(preset)` in `src/storybook/subjects/fx-subject.ts`.
- Fix `src/storybook/ui/inspect-info.ts` so `subject.kind === 'fx'` renders `FxSubjectInfo` (`trigger`, `moment`, `anchor`, `durationMs`, `stepFps`, layers/particles/tris budgets, P/S/A split, `dE`, min px, bounds, `shake`/`flash`, `light`, issues) cleanly instead of falling through to the texture fallback.
- Add `FxControlState` (`playing`, `tMs`, `hiddenLayers`, `wordOverride`) wired cleanly between `src/storybook/ui/controls.ts` / `inspect-view.ts`, `LabApp`, `LabState`, and `fx-subject.ts` using `createFxEmitter` (`seek`, `text` override, layer group toggling by `layerName`), updating `window.__storybook` (`fxInfo`, `setFxTime`, `stepFx`, `setFxLayers`, `setFxWord`).
- Update `scripts/harness/screenshot-lab.mjs` to log FX catalog counts and `stats.subject?.fxInfo` telemetry when inspecting an FX preset.

## Laptop Lab Workbench (`src/laptop/`)

- Normalize `?speed=` via `parseLabSpeed(raw)` (`finite && >= 0`, defaulting invalid/`NaN`/empty values to `1`), add `0.5` alongside `1`, `0.4`, and `0` in the `<select>`, and synchronize `<select>.value` on `lt.setSpeed(...)`.
- Add `declare global { interface Window { __laptop?: LaptopHandle } }` cleanly in `src/laptop/main.ts` (removing the double `unknown` cast).
- Add a Quest Check & `RunReport` Inspector card in `src/laptop/lab/` observing task check execution (`RunReport`, `CheckResult[]`, console output, loop-guard status, starter/solution quick test buttons) strictly orthogonal to `src/play/laptop.ts` and `laptop-web-studio`.

## CLI & `credits-forge` Full Parity (`scripts/mcp/credits-forge/`, `scripts/quality/agent-mcp.mjs`, `scripts/harness/`)

- Parameterize `scripts/harness/lib/comix-compile.mjs` (`rootDir`, `catalogFile`) matching `chapter-compile.mjs`.
- Add `--format` to `scripts/harness/generate-chapter.mjs` and `--validate` + `--from-level <chapter>/<level>` to `scripts/harness/terminal-lab.mjs`.
- Expand `scripts/mcp/credits-forge/{tools,server}.mjs` cleanly (splitting helpers if needed so all files stay `<= 600` lines and functions `<= 130` lines):
  - Enriched `list_assets` FX entries (`family`, `moment`, `when`, `durationMs`, `stepFps`, `loop`, `fullPanel`, `shake`, `flash`, `anchor`, `word`, `layerCount`, `particleCount`).
  - Chapter pack tools: `get_chapter_file`, `validate_chapter`, `write_chapter_file`.
  - Comix tools: `list_comix`, `get_comix`, `validate_comix`, `write_comix`.
  - Terminal Lab tools: `list_labs`, `get_lab`, `validate_lab`, `run_lab`, `write_lab`.
- Enforce `WRITER_TOOLS` per-tool writer fences in `scripts/quality/agent-mcp.mjs` and `scripts/harness/agents-unit.mjs`.

## Skills, References, Prompts & Docs

- Add `.kiro/skills/laptop-lab/{SKILL.md,references/laptop-schema.md}` (`[WORKFLOW]`) and `.kiro/skills/terminal-lab/{SKILL.md,references/lab-schema.md}` (`[WORKFLOW]`).
- Add/refresh schema references in `.kiro/skills/chapter-editor/references/chapter-schema.md`, `.kiro/skills/comix-editor/references/comix-schema.md`, `.kiro/skills/sfx-and-music-pipeline/references/audio-config-schema.md`, `.kiro/skills/procedural-particles-3d/references/fx-schema.md`, and `.kiro/skills/comic-panel-viewport-auditor/references/storybook-url-params.md`.
- Update `scripts/harness/agents-build.mjs`, regenerate `.kiro/agents/*.json`, refresh `.kiro/agents/prompts/*.md` and `.kiro/steering/{architecture,structure,tech,skills-map,team}.md` + `AGENTS.md` + `CLAUDE.md` + `pages/dev.html`, keeping `lead-dev` `file://` headroom `>= 15,000` chars.
