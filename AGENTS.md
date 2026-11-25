# AGENTS.md

Out Of Credits: a web game (Vite 6, TypeScript 5 strict, Three.js 0.180, xterm.js 5) with 1995 *Comix Zone* visuals where a terminal is the only input (unix commands and code).

- **Premise**: lightning pulls a developer inside his own computer; he is human, everything else is the machine.
- **Kiroween scope**: ships **one chapter of about 11 levels** (default: 1 tutorial, 6 task levels, 3 hubs, 1 boss). Do not start a second chapter. Every level must clear headlessly with **0 deaths**.
- **Combat is turn based** (no real-time damage, no Tactical Mode): a battle intro (an agent of the big four taunts, Kiro advises, FIGHT!), the player always acts first, every non-empty Enter is one action answered by one enemy turn, and a 30-second turn timer. One orchestrator, `src/game/battle.ts`. Spec: `.kiro/specs/turn-based-battles/`.

## Kiro Architecture Principles ("Roles Don't Blur")

Per `docs/kiro-best-practice.md`, project knowledge and enforcement live in `.kiro/` with strict separation of concerns:

- **Facts -> `.kiro/steering/`**: short, non-overlapping context rules and exact vocabulary (`glossary.md` — never invent synonyms). Do not bloat steering with long-form design docs (`docs/`) or copy-pasted schemas.
- **Capabilities -> `.kiro/specs/<name>/`**: system features and big refactors (`requirements.md` or `bugfix.md` in EARS syntax, `design.md`, `tasks.md`), never per-level or per-page content.
- **Procedures -> `.kiro/skills/<skill>/SKILL.md`**: 24 workflow and authoring skills tagged `[WORKFLOW]`, `[ASSET PCG]`, or `[LEVEL GEN]`, paired with deterministic validator scripts.
- **Truth -> Declarative JSON & Exhaustive Schemas**: `chapters/<slug>/`, `comix/<slug>/`, and `scripts/harness/terminal-lab/*.lab.json` are typed against `src/chapters/{types,script-types}.ts`, `src/cinematic/spec-types.ts`, and `src/terminal-lab/lab-types.ts`, with union-keyed `schema*.ts` field tables so missing editor forms fail `tsc`. `src/chapters/generated/` and `src/cinematic/generated/` are compiled outputs — never hand-edit.
- **Enforcement -> `.kiro/hooks/` & `scripts/quality/`**: deterministic, zero-LLM Node scripts enforce architectural, declarative, size, root, and spec gates rather than relying on memory or prose. `.kiro/settings/mcp.json` stays minimal/empty whenever offline `.mjs` scripts and skills suffice; an MCP server a team agent uses is declared per agent in `scripts/harness/agents-build.mjs` (`MCP_SERVERS`, each agent's `mcp`), and one a feature ships to others goes in its power (`.kiro/powers/<name>/mcp.json`).

## Read First: Steering Map

**Always-on steering** (loaded automatically in Kiro; read upfront in other agents):
`.kiro/steering/product.md`, `tech.md`, `structure.md`, `architecture.md`, `glossary.md`, `skills-map.md`, `spec-first.md`, `team.md` (the agent team and the property tests).

**Path-scoped steering (`inclusion: fileMatch`)** — read before touching matching paths:

| When touching | Read steering |
|---|---|
| `src/{procgen,shaders,renderer}/**` | `.kiro/steering/asset-pcg-rules.md` |
| `{chapters,src/chapters}/**` | `.kiro/steering/level-gen-rules.md` |
| `{chapters/**,src/chapters/**,src/chapter-editor/**,src/editor-core/**,src/play/**,src/ui/**,src/pages/**}` | `.kiro/steering/declarative-chapters.md` |
| `{comix/**,src/cinematic/**,src/comix-editor/**,src/editor-core/**}` | `.kiro/steering/declarative-comix.md` |
| `src/chapter-editor/**`, `src/editor-core/**`, `scripts/harness/lib/chapter-*.mjs`, `pages/chapter-editor.html` | `.kiro/steering/chapter-editor-rules.md` |
| `src/comix-editor/**`, `src/cinematic/**`, `src/editor-core/**`, `scripts/harness/lib/comix-*.mjs`, `pages/comix-editor.html` | `.kiro/steering/comix-editor-rules.md` |
| `src/terminal-lab/**`, `src/game/lab-*.ts`, `src/chapters/session-lab*.ts`, `scripts/harness/terminal-lab*`, `pages/terminal-lab.html` | `.kiro/steering/terminal-lab-rules.md` |

## New Features and Big Refactors: Spec First

Follow `.kiro/steering/spec-first.md` and skill `feature-spec-grill` (`.kiro/skills/feature-spec-grill/SKILL.md`).

- **State the size-test verdict on line 1** (`Spec-first: yes/no, <reason>`). When unsure, it qualifies (**yes**).
- **Qualifies**: any new player/dev command, mechanic, item, page, mode, lab, or UI surface; any new `src/<area>/`, `pages/*.html`, layer rule, route, model category, or dependency; any vocabulary, `src/contracts/`, save-data, or security-boundary change; any rework, redesign, rewrite, migration, or multi-layer behavior change.
- **Does not qualify**: clear-behavior bug fixes, tuned values, content inside an existing vocabulary, a single asset made via its skill, or docs.
- **Workflow**:
  1. **Stop — write zero source code.** Resume an existing `.kiro/specs/<name>/` or scaffold one with `node .kiro/skills/feature-spec-grill/scripts/scaffold-spec.mjs <kebab-name> [--bugfix]`.
  2. **Grill** in rounds of at most 5 concrete questions, each offering 2–4 options with one `(Recommended)` default and a one-clause trade-off. Never guess or self-answer; move every user answer into `## Decisions` (`**A (user, YYYY-MM-DD):** ...`) and track unresolved items as `- [ ]` under `## Open questions`.
  3. **Gate sequentially with explicit user approval**: write EARS requirements (`WHEN / IF / WHILE ..., THE SYSTEM SHALL ...`), then progress `draft` -> `requirements-approved` -> `design-approved` -> `approved` -> `done`. Silence is not approval. Run `node scripts/quality/check-specs.mjs` after each spec edit.
  4. **Retroactive specs**: if code was written before its spec, do not delete or keep extending it — document existing behavior as *(proposed, from code)*, list unapproved choices under `## Open questions`, and grill until `approved`.
- **Enforced by**: `guard-spec-first` (`scripts/hooks/guard-spec-first.mjs`, blocking new `src/<area>/` and `pages/*.html` without an approved spec) and `npm run quality:specs`.

## Skill Categories & Pipelines

Read the matching `.kiro/skills/<skill>/SKILL.md` before working in its area; never improvise rules a skill already defines (`.kiro/steering/skills-map.md`):

- **`[WORKFLOW]`**: `feature-spec-grill` — runs first for any qualifying feature or big refactor and chooses which asset/level skills execute the tasks.
- **`[ASSET PCG]`** (procedural models, rooms, textures, shaders, lighting, animation, particles):
  - Read `credits-art-direction` **first**, then the area creator skill: `procedural-kitbash-3d`, `procedural-malware-3d`, `procedural-rooms-3d`, `procedural-texture-synthesis`, `shader-texture-tuning`, `comic-lighting-and-lightning`, `procedural-animation-3d`, `procedural-malware-animation`, `procedural-particles-3d`, or `ai-mesh-pipeline`.
  - Pair every change with its deterministic validator (`model-geometry-validator`, `particle-effect-validator`, `check-tags.mjs`, `npm run quality:fingerprint`) and a visual QA pass (`comic-panel-viewport-auditor`). Stay inside the single palette and fixed cel light (no smooth gradients, extra Three.js lights, shadow maps, or bloom); only `vibecoder.*` and `item.*` use human palette zones.
- **`[LEVEL GEN]`** (ordered pipelines; each step consumes the previous output):
  - *Chapters & Levels (`chapters/<slug>/`)*: `chapter-architect-intake` -> `comix-story-drawer` -> `chapter-level-generator` -> `chapter-implementer` (`verify-chapter.mjs`) -> `chapter-editor` (`/editor`).
  - *Animated 3D Comix (`comix/<slug>/`)*: `comix-architect-intake` -> `comix-sequence-generator` -> `comix-implementer` (`verify-comix.mjs`) -> `comix-editor` (`/comix-editor`).
- **Strict Boundary**: LEVEL GEN specs reference existing `ModelCatalog`, `RoomKind`, and `FxCatalog` IDs only — never embed geometry, shaders, or particles in level or comix specs. Missing assets require an `[ASSET PCG]` pass first. **Terminal Lab** (`/terminal-lab`) and **Laptop Lab** (`/laptop-lab`) are test benches/emulators, not content categories, and never write `chapters/` or `comix/`.

## Declarative Content, Four-Place Rule & Co-Editing Care

- **Zero hardcoded content**: engine code may never name a chapter, level, level index (`spec.index === N`), or comix sequence/page (`npm run quality:declarative`).
- **Four-place vocabulary rule** (one coordinated change, guarded by `guard-chapter-files`):
  - *Chapters*: (1) types (`src/chapters/{types,script-types}.ts`), (2) interpreter (`src/chapters/script.ts`), (3) exhaustive editor forms (`src/chapter-editor/schema.ts`), (4) pack checks (`src/chapters/validate-pack.ts`). Also run `terminal-lab-unit.mjs` since Terminal Lab reuses chapter-editor field tables.
  - *Comix*: (1) `src/cinematic/spec-types.ts`, (2) runtime in `src/cinematic/`, (3) `src/comix-editor/schema*.ts`, (4) `src/cinematic/simulate.ts` + `src/comix-editor/check.ts`.
  - *Terminal Lab*: `src/terminal-lab/lab-types.ts` + `src/chapters/session-lab-types.ts`, `lab-pack.ts` / `runner.ts`, `schema.ts`, `lab-check.ts` / `store.ts`, `catalog.ts` (if placeable), and a fixture in `scripts/harness/terminal-lab/`.
- **Co-editing care**: humans tune in `/editor` and `/comix-editor` with etag `409` conflict protection. Read spec JSON files from disk immediately before editing, patch only the fields named by the task (never overwrite human edits from templates), and format with canonical writers (`scripts/harness/lib/chapter-json.mjs` -> `stringifyChapterJson`, `scripts/harness/lib/comix-json.mjs` -> `stringifyComixJson`, `scripts/harness/lib/lab-json.mjs`) so untouched saves change zero bytes.

## Clean Architecture, Hard Limits & Repository Layout

- **Inward layers** (enforced by `scripts/quality/check-layers.mjs`): dependencies point inward (`contracts` -> `procgen` / `game` -> `chapters` / `renderer` / `cinematic` / `editor-core` -> editors / labs / `ui` / `play` -> `main.ts`). Update `check-layers.mjs` and `.kiro/steering/architecture.md` in the same commit when changing layers.
- **Hard limits**: `<= 600` lines/file, `<= 130` lines/function (split by responsibility), `0` duplicate blocks (`jscpd`, 4 lines / 35 tokens), strict TypeScript with **no `any`**, KISS (plain functions and data tables before classes). (`src/chapters/generated/` and `src/cinematic/generated/` are excluded compiled data.)
- **Workstation & runtime safety**: build DOM with `h()` (text nodes, never `innerHTML`), preserve focus on live redraws (`redrawKeepingFocus`), keep player code isolated in Workers or `sandbox="allow-scripts"` iframes, and keep dev APIs restricted to local Host, same Origin, whitelisted paths, atomic writes, and `baseEtag` `409` checks.
- **Clean root** (`npm run quality:root` / `scripts/quality/check-root.mjs`): HTML entry pages go in `pages/` (the Vite root; e.g., `pages/storybook.html` -> `/storybook.html`) plus `vite.config.ts`, docs in `docs/`, tooling in `scripts/`, workflows in `.github/`, source in `src/`. Only tool configs, `AGENTS.md`, `CLAUDE.md`, `README.md`, and `LICENSE` sit at the root. Update `check-root.mjs` and `.kiro/steering/structure.md` together if root entries change.

## Commands & Verification Gates

- **Stack**: `npm start` (background Vite on `http://localhost:5400`, waits until ready; log at `scripts/harness/out/stack/stack.log`), `npm stop`, `npm restart`, `npm run status`, `STACK_PORT=5174 npm start` (prefer `STACK_PORT=` over `--port`). Never run foreground `npm run dev` from an agent shell.
- **Chapters & Chapter Editor (`/editor`)**: `node scripts/harness/generate-chapter.mjs` (`--validate`, `--check`, `--verify`; `--ticks N` = N clock seconds and N-1 forced enemy turns per command), `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`, `node scripts/harness/editor-unit-test.mjs`, `node scripts/harness/editor-smoke.mjs`.
- **Battles (turn-based combat)**: `node scripts/harness/battle-unit.mjs` (the orchestrator and the chapter session's battles), `node scripts/harness/property-tests.mjs --only gameplay` (battle properties), `node scripts/harness/playthrough.mjs --ticks 3` (classic floors). Spec: `.kiro/specs/turn-based-battles/`.
- **App bus, SFX and music** (`src/contracts/app-bus.ts`, `src/audio/`): `node scripts/harness/audio-unit.mjs`. Every `public/sfx` and `public/music` cue is mapped. The one-shot pool defaults to 10. Spec: `.kiro/specs/app-events-audio/`.
- **Comix & Comix Editor (`/comix-editor`)**: `node scripts/harness/generate-comix.mjs` (`--validate`, `--check`, `--verify`), `node scripts/harness/validate-comix.mjs`, `node .kiro/skills/comix-implementer/scripts/verify-comix.mjs`, `node scripts/harness/comix-editor-smoke.mjs`.
- **Terminal Lab (`/terminal-lab`)**: `node scripts/harness/terminal-lab.mjs --all` (`--run <file>`, `--transcript`), `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/terminal-lab-api-test.mjs`, `node scripts/harness/terminal-lab-smoke.mjs` (also `--width 1280 --height 820`). Spec: `.kiro/specs/inventory/items/terminal/`.
- **Interactive Field Manual (`/manual`, `F1`, `manual`)**: `node scripts/harness/manual-unit.mjs`, `node scripts/harness/manual-smoke.mjs`. Spec: `.kiro/specs/inventory/items/manual/`.
- **Chapter Motherboard Map (`#chapter-map-dialog`, `#hud-map`, `F3`, `map`)**: `node scripts/harness/manual-unit.mjs`, `node scripts/harness/manual-smoke.mjs`, `node scripts/harness/laptop-unit.mjs`. Item `item.map` / `vibecoder.dev_map`. Spec: `.kiro/specs/inventory/items/map/`.
- **Laptop Lab (`/laptop-lab`)**: `node scripts/harness/laptop-unit.mjs`, `node scripts/harness/laptop-lab-smoke.mjs` (also `--width 1280 --height 820`). Spec: `.kiro/specs/inventory/items/laptop/`.
- **Assets & Storybook (`/storybook.html`)**: `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --strict`, `node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all`, `node scripts/harness/screenshot-lab.mjs --selftest`, `npm run quality:fingerprint` (must remain byte-identical on refactors; diff and explain intended asset changes).
- **Desktop & Steamworks (`scripts/desktop/`, `.github/workflows/desktop-release.yml`)**: `npm run desktop:test` (`desktop-unit.mjs`), `npm run desktop:generate` (`generate-tauri-steam.mjs`, writes git-ignored `src-tauri/`), `npm run desktop:verify` (`verify-desktop-bundle.mjs`, verifies zero external CDNs, bundled `.woff2` fonts, and 1:1 `ACH_*` sync), `npm run desktop:build` (`--dry-run`, `--portable-only`, `--steam --app-id <id>`). Specs: `.kiro/specs/steam-launch-funnel/`, `.kiro/specs/steamworks-store-release/` (open partner/store questions). Playbook: `docs/STEAM_RELEASE_PLAYBOOK.md`.
- **Deploy (power `credits-ship`, `.kiro/powers/credits-ship/`)**: `node .kiro/powers/credits-ship/skills/ship/scripts/ship.mjs preview` (gates, draft deploy to Netlify, the chapter played on the preview URL), `prod` only after the user's explicit yes (refuses a build that was not the played preview), `--dry-run`, `--selftest`. The user's command only: every team agent's shell denies it. Spec: `.kiro/specs/netlify-deploy-power/`.
- **Landing tabs (`pages/{index,desktop,achievements,comix}.html`, `src/hub/`)**: `node scripts/harness/hub-unit.mjs` (comix tile model, header table), `node scripts/desktop/landing-smoke.mjs` (the four pages in headless Chrome: header, moved pieces, locked tiles, waitlist on Home only). Spec: `.kiro/specs/landing-tabs/`.
- **Visual audit (qa)**: `node scripts/harness/visual-audit.mjs` (every player-facing screen at 1600x950, 1280x820, 1920x1080 and 1024x768: seeded, storm off, play screens on a stepped game clock so runs repeat; filmstrips, throttled frame timing, detectors and a diff against `docs/qa/baselines/`; `--screens`, `--sizes` (scoped runs merge), `--selftest`). Exit 1 means flags to explain; report only, not part of `npm run quality`. Only a person approves baselines (`--update <screen>[@<WxH>]`; every team agent's shell denies it). Owner: `lead-dev`. Spec: `.kiro/specs/qa-visual-audit/`.
- **Release (powers `credits-release`, `credits-tauri-local`)**: `node .kiro/powers/credits-release/skills/release/scripts/release.mjs release <version>` (plan only; `--yes` runs the gates, pushes tag `v<version>` and makes the Netlify preview; `--dry-run`, `--selftest`), `node .kiro/powers/credits-tauri-local/skills/tauri-local/scripts/tauri-local.mjs` (local unversioned Tauri build, `--no-open`, `--dry-run`, `--selftest`). The user's command only: every team agent's shell denies them. Spec: `.kiro/specs/release-tags-power/`.
- **MCP (`credits-forge`, Chrome DevTools)**: `node scripts/harness/forge-unit.mjs` (`npm run quality:mcp`: the six forge tools on a temporary copy, the real server over stdio, a `write_level` property), `node scripts/harness/mcp-probe.mjs` (manual: real Kiro CLI turns for `qa` and `chapters-designer`; needs Chrome and model credits). Server: `scripts/mcp/credits-forge/`. `qa` alone has Chrome DevTools MCP (headless, no JS evaluation, localhost and `*.netlify.app` only, plus `devtools-url-guard`); `chapters-designer` alone has `write_level`. Spec: `.kiro/specs/mcp-devtools-and-forge/`.
- **Project-wide**: `npm run quality` (`tsc --noEmit`, `quality:root`, `quality:size`, `quality:layers`, `quality:declarative`, `quality:specs`, `quality:dup`, `quality:agents`, `quality:brands`, `quality:mcp`, `quality:props`), `npm run build`, `npm run preview`.

- **Property-based tests**: `node scripts/harness/property-tests.mjs` (`--only terminal,laptop,comix,chapters,gameplay`, `--seed`, `--runs`); fast-check, fixed seed, part of `npm run quality`. A failure prints a shrunk counterexample and its seed; keep each fixed counterexample in the property's `examples`. Spec: `.kiro/specs/property-based-tests/`.

## Agent Team (`.kiro/agents/`)

Seven custom agents tune the game: `lead-dev` (orchestrator, entry point, the only one that commits: `agent/<task>` branches, never `main`), `terminal-designer`, `laptop-designer`, `comix-designer`, `chapters-designer`, `artist` and `qa` (writes reports to `docs/qa/`). Each writes only its own paths and runs only an allow-listed shell: an `fs_write` deny fence, a shell allow-list written as allow plus catch-all deny, the `agent-shell-guard` PreToolUse hook (redirects, git history, `main`) and the `agent-scope` SessionStart/Stop hooks. Every agent loads `.kiro/agents/prompts/team-rules.md`; `.kiro/steering/team.md` tells every other agent (IDE, Crew, Claude Code) the same. Never edit `.kiro/agents/*.json` by hand; `.kiro/agents/` is the user's. Property suites are owned by the designer of their feature (`docs/PROPERTY_TESTS.md`). The files are generated from the table in `scripts/harness/agents-build.mjs`; edit the table and run it, never the JSON. `npm run quality:agents` checks the table, capabilities, limits, git rights and that every source file has exactly one owner. The Kiro Crew app, `npm run agents:install` and `npm run crew:check` (is this Mac ready for Crew): `docs/AGENTS_CREW.md`. A Crew member runs in its workspace; `kirocrew spawn` does not (it uses an empty scratch folder), and an `autoApprove` list would skip the shell guard hook. Spec: `.kiro/specs/agent-team/`.

## Hooks & Working Rules

- **`.kiro/hooks/` enforcement**: Kiro runs `spec-first-on-prompt`, `guard-spec-first`, `guard-chapter-files`, `typecheck-on-save`, `validate-chapters-on-save`, `validate-comix-on-save`, `validate-labs-on-save`, `asset-dryrun-*`, `chapter-gates-on-stop`, `spec-status-on-stop`, `property-tests-on-stop`, `check-agents-on-save` and `check-brands-on-save`. Agents running outside Kiro must honor the same pre-write guards and run the matching post-edit and stop gates manually.
- Report only validators you actually ran; never claim an unrun check passed.
- Pin exact dependency versions when adding packages. Never hand-edit generated files. Commit only when asked.
