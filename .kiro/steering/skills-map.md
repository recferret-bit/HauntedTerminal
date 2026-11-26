# Skills map

Skills live in `.kiro/skills/`. Every skill description starts with its category tag, `[ASSET PCG]`, `[LEVEL GEN]`, `[AUDIO]`, `[SOCIAL]` or `[WORKFLOW]` (`check-agents.mjs` fails on an untagged skill). Activate the matching skill before working in its area; do not improvise rules the skill already defines.

## Before all: WORKFLOW

`feature-spec-grill`: a new feature or a big refactor starts here, before any other skill (`spec-first.md`). It writes `.kiro/specs/<name>/`, grills the user until every open question is answered, and gets requirements, design and tasks approved. The approved tasks then name the ASSET PCG and LEVEL GEN skills that do the work.

## Category 1: ASSET PCG (procedural content generation of game assets)

Root contract: `credits-art-direction`. Read it first, before any other asset skill.

| Area | Skills |
|---|---|
| Models | `procedural-kitbash-3d` (vibecoder, pickups, doors, props), `procedural-malware-3d` (enemies, bosses), `model-geometry-validator` |
| Rooms | `procedural-rooms-3d` |
| Surfaces | `procedural-texture-synthesis`, `shader-texture-tuning`, `comic-lighting-and-lightning` |
| Motion | `procedural-animation-3d`, `procedural-malware-animation` |
| Effects | `procedural-particles-3d`, `particle-effect-validator` |
| External assets | `ai-mesh-pipeline` (PNG sprites, `.glb` meshes) |
| Visual QA | `comic-panel-viewport-auditor` |

Rules: every asset change ends with its validator and a visual QA pass. Pair creator skills with their validator (models with `model-geometry-validator`, effects with `particle-effect-validator`).

## Category 2: LEVEL GEN (chapters, levels, and animated 3D comixes)

### A. Chapters & Levels (`chapters/<slug>/`)

Run in this order. Each step consumes the output of the previous one.

1. `chapter-architect-intake`: interview, then chapter specs (manifest, comix spec, dialogs, `level.spec.json` per level).
2. `comix-story-drawer`: render static chapter-issue comic PNGs from `chapters/<slug>/story/comix.spec.json`.
3. `chapter-level-generator`: compile levels, validators, headless solvability.
4. `chapter-implementer`: run the whole pipeline and the QA gate (`verify-chapter.mjs`).
5. `chapter-editor`: the human step. `/editor` edits every spec with forms, previews the real game on the unsaved draft, checks references, runs the headless solution (`src/chapter-editor/schema.ts`).

The contract behind all five is `.kiro/steering/declarative-chapters.md`: chapters are data, the engine names no chapter or level.

### B. Animated 3D Comix Sequences (`comix/<slug>/`)

Run in this order whenever planning, generating, compiling, or tuning real-time 3D comic sequences (`intro`, `outro`, interludes, standalone reels):

1. `comix-architect-intake`: interview, then scaffold connected `comix/<slug>/` specs (`README.md`, `comix.manifest.json`, `pages/page-XX-<slug>/page.spec.json`).
2. `comix-sequence-generator`: choreograph page panels, orthographic cameras, lettering, discrete beats, and continuous scene tracks.
3. `comix-implementer`: compile `src/cinematic/generated/catalog-data.ts`, run 60fps simulation + freeze-frame visual checks, and pass `verify-comix.mjs`.
4. `comix-editor`: the human review & tuning studio at `/comix-editor` (bidirectional viewport <-> Inspector element selection, 2D layout mini-map, schema forms, timestamp scrubber preview, 60fps check, conflict-safe saving).

The contract behind all four is `.kiro/steering/declarative-comix.md`, `.kiro/steering/comix-editor-rules.md`, and `.kiro/specs/{declarative-comix-runtime,comix-editor}/`: comixes are connected page specs, and `src/cinematic/` names no scene.

Rules: specs reference existing asset IDs only (`ModelCatalog`, `RoomKind`, `FxCatalog`). Never put geometry, shader or particle definitions in a level or comix spec.

## Category 3: AUDIO (sound effects, music, voice lines)

`sfx-and-music-pipeline` is the house pipeline and wins over the CLI skills: a cue is a row in `docs/audio/SFX_LIST.md` or `MUSIC_LIST.md`, dry-run with `node scripts/harness/audio-gen.mjs plan <cue>`, generated with `--generate` only when the brief says so (cap 15,000 credits a run, reserve 30,000, Keychain login, `ffmpeg` post when installed), mapped in `src/audio/`, checked with `audio-gen.mjs --check` and `audio-unit.mjs`.

The 36 `elevenlabs-*` skills are the ElevenLabs CLI's own (`elevenlabs generate-skills`), kept as generated except the `[AUDIO]` tag. Only `shared`, `text-to-sound-effects`, `music`, `text-to-speech`, `voices`, `audio-effects`, `usage` and `models` apply to this game; the rest (agents, dubbing, studio, webhooks, workspaces, reception, ...) are reference only. No agent runs `elevenlabs` directly: the shell refuses it and `--output`. Spec: `.kiro/specs/audio-agent/`.

## Category 4: SOCIAL (campaigns, market research, declarative videos, screenshots & infographics)

`smm-revenue-playbook` (X, YouTube/Shorts & TikTok playbooks + $1M Steam funnel grounded in `docs/marketing/MARKET_RESEARCH_1M_REVENUE.md`) and `social-video-harness` (`scripts/harness/social-media.mjs`: declarative `social/media/specs/*.json` video/screenshot/infographic capture, in-game audio mixing & capped ElevenLabs social voiceovers). Spec: `.kiro/specs/social-smm-agent/`.

## Who uses which skills (agent team)

The team agents in `.kiro/agents/` split these skills by owner: `artist` uses every ASSET PCG skill; `chapters-designer` the chapter LEVEL GEN chain; `comix-designer` the comix LEVEL GEN chain; `sound-designer` the AUDIO skills; `smm-agent` the SOCIAL skills; `lead-dev` the WORKFLOW skill; `qa` the validators and auditors. Kiro CLI 3.3 shows every workspace skill to every agent, so this split is each agent's focus, not a lock. See `docs/AGENTS_CREW.md`.

## Boundary

- Needs a new model, room, texture, effect or animation: ASSET PCG, then return to the level.
- Needs a new puzzle, win rule, dialogue, comic panel or level order: LEVEL GEN.
- Level-gen skills may read `credits-art-direction`; asset skills never depend on level skills.
- The **Terminal Lab** (`/terminal-lab`) and **Laptop Lab** (`/laptop-lab`) are test benches / emulators, not content categories: they place or emulate tools and never write chapters or comixes. Needs a new asset: ASSET PCG first.
