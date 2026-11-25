# CLAUDE.md

Instructions for Claude Code working in **Out Of Credits** (Vite 6, TypeScript 5 strict, Three.js 0.180, xterm.js 5). `.kiro/` is the single source of truth; follow `.kiro` principles, steering, specs, skills, and deterministic gates without duplicating or drifting from them.

## Always-On `.kiro` Steering

Claude Code imports the 8 always-on `.kiro/steering/*.md` files directly here, matching Kiro's startup context without copying their prose:

- @.kiro/steering/product.md
- @.kiro/steering/tech.md
- @.kiro/steering/structure.md
- @.kiro/steering/architecture.md
- @.kiro/steering/glossary.md
- @.kiro/steering/skills-map.md
- @.kiro/steering/spec-first.md
- @.kiro/steering/team.md

## How `.kiro` Principles Govern Work Here

Per `docs/kiro-best-practice.md`, never blur these five roles:

1. **Steering (`.kiro/steering/`) = Facts**: concise rules and exact domain terms (`glossary.md` — never invent synonyms).
2. **Specs (`.kiro/specs/<name>/`) = Capabilities**: system features and big refactors, never per-level or per-page content.
3. **Skills (`.kiro/skills/<name>/SKILL.md`) = Procedures**: 24 step-by-step workflows (`[WORKFLOW]`, `[ASSET PCG]`, `[LEVEL GEN]`) paired with deterministic scripts.
4. **Schemas & JSON Specs = Content Truth**: `chapters/<slug>/`, `comix/<slug>/`, and `scripts/harness/terminal-lab/*.lab.json` typed by `script-types.ts` / `types.ts` / `spec-types.ts` / `lab-types.ts` and union-keyed `schema*.ts` field tables so missing editor forms fail `tsc`.
5. **Hooks & Gates (`.kiro/hooks/`, `scripts/quality/`) = Enforcement**: zero-LLM Node scripts enforce pass/fail, not memory. `.kiro/settings/mcp.json` stays empty/minimal whenever offline `.mjs` scripts + skills suffice; team agents declare their MCP servers per agent in `scripts/harness/agents-build.mjs`; a feature's MCP server for others ships in its power (`.kiro/powers/<name>/`).

**Scope guard**: Kiroween ships **one chapter of about 11 levels**, all solvable headlessly with **0 deaths**. Never start a second chapter.

## On-Demand Context: `fileMatch` Steering & Skills

Do **not** preload conditional steering or skill files at startup; `Read` them on demand before touching their area:

| Before editing | `Read` conditional steering |
|---|---|
| `src/{procgen,shaders,renderer}/**` | `.kiro/steering/asset-pcg-rules.md` |
| `{chapters,src/chapters}/**` | `.kiro/steering/level-gen-rules.md` |
| `{chapters/**,src/chapters/**,src/chapter-editor/**,src/editor-core/**,src/play/**,src/ui/**,src/pages/**}` | `.kiro/steering/declarative-chapters.md` |
| `{comix/**,src/cinematic/**,src/comix-editor/**,src/editor-core/**}` | `.kiro/steering/declarative-comix.md` |
| `src/chapter-editor/**`, `src/editor-core/**`, `scripts/harness/lib/chapter-*.mjs`, `pages/chapter-editor.html` | `.kiro/steering/chapter-editor-rules.md` |
| `src/comix-editor/**`, `src/cinematic/**`, `src/editor-core/**`, `scripts/harness/lib/comix-*.mjs`, `pages/comix-editor.html` | `.kiro/steering/comix-editor-rules.md` |
| `src/terminal-lab/**`, `src/game/lab-*.ts`, `src/chapters/session-lab*.ts`, `scripts/harness/terminal-lab*`, `pages/terminal-lab.html` | `.kiro/steering/terminal-lab-rules.md` |

Before starting any task in a skill's domain, `Read` `.kiro/skills/<skill>/SKILL.md` first — never improvise rules a skill already defines:
- **Assets (`[ASSET PCG]`)**: always `Read` `.kiro/skills/credits-art-direction/SKILL.md` first, then the area skill (`procedural-kitbash-3d`, `procedural-malware-3d`, `procedural-rooms-3d`, `procedural-texture-synthesis`, `shader-texture-tuning`, `comic-lighting-and-lightning`, `procedural-animation-3d`, `procedural-malware-animation`, `procedural-particles-3d`, `ai-mesh-pipeline`), plus its validator (`model-geometry-validator`, `particle-effect-validator`) and `comic-panel-viewport-auditor`. Only `vibecoder.*` and `item.*` use human palette zones.
- **Chapters (`[LEVEL GEN]`)**: `chapter-architect-intake` -> `comix-story-drawer` -> `chapter-level-generator` -> `chapter-implementer` -> `chapter-editor`.
- **Animated 3D Comix (`[LEVEL GEN]`)**: `comix-architect-intake` -> `comix-sequence-generator` -> `comix-implementer` -> `comix-editor`.
- **Strict asset boundary**: LEVEL GEN references existing `ModelCatalog`, `RoomKind`, and `FxCatalog` IDs only; create missing assets via `[ASSET PCG]` first. Terminal Lab (`/terminal-lab`) and Laptop Lab (`/laptop-lab`) never write `chapters/` or `comix/`.

## Spec-First & Interactive Grilling in Claude Code

When a prompt may be a feature or big refactor, output the size-test verdict on line 1 (`Spec-first: yes/no — <reason>`). Unsure means **yes**.

- **Claude Code's built-in plan mode does NOT replace `.kiro/specs/<name>/`.** When a task qualifies under `.kiro/steering/spec-first.md`, stop coding, `Read` `.kiro/skills/feature-spec-grill/SKILL.md`, and check `.kiro/specs/` (or scaffold with `node .kiro/skills/feature-spec-grill/scripts/scaffold-spec.mjs <kebab-name> [--bugfix]`).
- **Grill interactively**: ask in rounds of at most 5 concrete questions (use `AskUserQuestion` when available), each with 2–4 options, a `(Recommended)` default, and a one-clause trade-off. Never silently assume or self-answer.
- **Record & gate**: move every user answer into `## Decisions` (`**A (user, YYYY-MM-DD):** ...`), keep unresolved questions as `- [ ]` under `## Open questions`, write EARS requirements (`WHEN / IF / WHILE ..., THE SYSTEM SHALL ...`), and wait for explicit user approval at every gate: `draft` -> `requirements-approved` -> `design-approved` -> `approved` -> `done`. Run `node scripts/quality/check-specs.mjs` after each spec edit.
- **Retroactive specs**: if code already exists without an approved spec, do not delete or extend it — document existing behavior as *(proposed, from code)*, list unapproved choices as `- [ ]` open questions, and grill until `approved`.

## Enforcing `.kiro/hooks/` Manually in Claude Code

`.kiro/hooks/*.json` do not fire automatically in Claude Code unless mirrored in `.claude/settings.json`. Enforce their guards and checks manually:

### Pre-Write Guards (`guard-chapter-files`, `guard-spec-first`)
- **Never edit generated outputs**: do not touch `src/chapters/generated/**` or `src/cinematic/generated/**`. Edit `chapters/` or `comix/` and run `generate-chapter.mjs` or `generate-comix.mjs`.
- **Never start new code without an approved spec**: do not create a new `src/<area>/` directory or a new `pages/*.html` page unless a `.kiro/specs/<name>/` spec naming that path has `Status: approved` or `done`.
- **Confirm architectural/vocabulary edits first**: before editing `scripts/quality/check-layers.mjs` or `vite.config.ts`, confirm the layer/page/route change with the user and keep `.kiro/steering/architecture.md` / `structure.md` in sync. Before extending a spec vocabulary, apply the **four-place rule** together in one change:
  - *Chapters*: `src/chapters/{types,script-types}.ts` + `src/chapters/script.ts` + `src/chapter-editor/schema.ts` + `src/chapters/validate-pack.ts` (and run `terminal-lab-unit.mjs`).
  - *Comix*: `src/cinematic/spec-types.ts` + `src/cinematic/` runtime + `src/comix-editor/schema*.ts` + `src/cinematic/simulate.ts` / `src/comix-editor/check.ts`.
  - *Terminal Lab*: `src/terminal-lab/lab-types.ts` + `src/chapters/session-lab-types.ts` + `lab-pack.ts` / `runner.ts` + `schema.ts` + `lab-check.ts` / `store.ts` + `catalog.ts` + fixture in `scripts/harness/terminal-lab/`.

### Post-Edit Checks (match `PostFileSave` / `PostFileCreate`)
- Edited `src/**/*.ts`: run `npx tsc --noEmit`.
- Edited `chapters/**/*.json`: run `node scripts/harness/generate-chapter.mjs --validate && node scripts/harness/generate-chapter.mjs --check`.
- Edited `comix/**/*.{json,md}`: run `node scripts/harness/validate-comix.mjs && node scripts/harness/generate-comix.mjs --validate && node scripts/harness/generate-comix.mjs --check`.
- Edited `scripts/harness/terminal-lab/*.lab.json`: run `node scripts/harness/terminal-lab.mjs --all`.
- Edited `src/`, `chapters/`, `comix/`, `pages/`, or `docs/` (`check-brands-on-save`): run `node scripts/quality/check-brands.mjs`.
- Created procedural assets (`src/procgen/**`): run the area's validator (`validate-model.mjs --all --strict`, `check-tags.mjs --all`, `particle-effect-validator`), `npm run quality:fingerprint`, and `comic-panel-viewport-auditor`.

### Pre-Completion Gates (match `Stop` hooks & `architecture.md`)
Always run before declaring work done (plus targeted suites for areas touched):
- `npm run quality` (`tsc --noEmit`, `quality:root`, `quality:size`, `quality:layers`, `quality:declarative`, `quality:specs`, `quality:dup`, `quality:agents`, `quality:brands`, `quality:mcp`, `quality:props`)
- `node scripts/quality/check-specs.mjs --report`
- `node scripts/harness/generate-chapter.mjs --check && node scripts/harness/generate-comix.mjs --check`
- When chapters, comix, editors, labs, laptop, or assets changed, run the corresponding verifiers:
  - Chapters/editors: `node scripts/harness/generate-chapter.mjs --verify`, `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`, `node scripts/harness/editor-unit-test.mjs`, `node scripts/harness/editor-smoke.mjs`
  - Battles (turn-based combat, `src/game/battle.ts`; no real-time damage, no Tactical Mode): `node scripts/harness/battle-unit.mjs`, `node scripts/harness/property-tests.mjs --only gameplay`, `node scripts/harness/playthrough.mjs --ticks 3`. Spec: `.kiro/specs/turn-based-battles/`
  - Comix/editor: `node .kiro/skills/comix-implementer/scripts/verify-comix.mjs`, `node scripts/harness/comix-editor-smoke.mjs`
  - Terminal Lab: `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/terminal-lab-api-test.mjs`, `node scripts/harness/terminal-lab.mjs --all`, `node scripts/harness/terminal-lab-smoke.mjs` (1600x950 and `--width 1280 --height 820`)
  - Interactive Field Manual (`/manual`, `F1`, `manual`): `node scripts/harness/manual-unit.mjs`, `node scripts/harness/manual-smoke.mjs`. Spec: `.kiro/specs/inventory/items/manual/`
  - Laptop Lab: `node scripts/harness/laptop-unit.mjs`, `node scripts/harness/laptop-lab-smoke.mjs` (1600x950 and `--width 1280 --height 820`)
  - Landing tabs: `node scripts/harness/hub-unit.mjs` and `node scripts/desktop/landing-smoke.mjs` (Home, Desktop Builds, Achievements, Comix pages). Spec: `.kiro/specs/landing-tabs/`
  - Visual audit (qa): `node scripts/harness/visual-audit.mjs` (`--screens`, `--sizes`, `--selftest`; report only, exit 1 = flags to explain); baselines in `docs/qa/baselines/` are approved by a person only (`--update`). Spec: `.kiro/specs/qa-visual-audit/`
  - MCP: `node scripts/harness/forge-unit.mjs` (`npm run quality:mcp`); `node scripts/harness/mcp-probe.mjs` (manual, real Kiro CLI)
  - Deploy (power `credits-ship`): `node .kiro/powers/credits-ship/skills/ship/scripts/ship.mjs preview`, then `prod` only after the user's explicit yes; follow `.kiro/powers/credits-ship/skills/ship/SKILL.md`
  - Release (powers `credits-release`, `credits-tauri-local`): `node .kiro/powers/credits-release/skills/release/scripts/release.mjs release <version>` prints a plan, `--yes` runs the gates and pushes tag `v<version>`; `node .kiro/powers/credits-tauri-local/skills/tauri-local/scripts/tauri-local.mjs` builds a local, unversioned Tauri app. The user's command only; follow each `SKILL.md`
  - Assets/storybook: `npm run quality:fingerprint` (byte-identical on refactors; diff and explain intended changes) and `node scripts/harness/screenshot-lab.mjs --selftest`

## Shell, Code & Co-Editing Rules

- **Background dev server only**: use `npm start`, `npm stop`, `npm restart`, `npm run status`, or `STACK_PORT=5174 npm start` (prefer `STACK_PORT=` over `--port`). Never run foreground `npm run dev` (it blocks the shell).
- **Co-editing specs safely**: `/editor` and `/comix-editor` use etag `409` conflict protection. Read spec JSON from disk immediately before editing, change only fields named by the task, and format via canonical writers (`stringifyChapterJson` in `scripts/harness/lib/chapter-json.mjs`, `stringifyComixJson` in `scripts/harness/lib/comix-json.mjs`, `scripts/harness/lib/lab-json.mjs`) so no-op saves change zero bytes.
- **Hard limits & safety**: inward layer imports only (`scripts/quality/check-layers.mjs`), `<= 600` lines/file, `<= 130` lines/function, `0` `jscpd` duplicate clones, no `any`, plain functions and data tables before classes, DOM built via `h()` (never `innerHTML`), live redraws preserving focus (`redrawKeepingFocus`), player code isolated in Workers or `sandbox="allow-scripts"` iframes, and dev APIs restricted to localhost + same-origin + `baseEtag`.
- **Clean root & hygiene**: keep root limited to tool configs, `.github/`, `.kiro/`, `AGENTS.md`, `CLAUDE.md`, `README.md`, and `LICENSE` (update `scripts/quality/check-root.mjs` and `.kiro/steering/structure.md` together if changed). Pin exact dependency versions, report only checks you actually ran, and commit only when asked.
