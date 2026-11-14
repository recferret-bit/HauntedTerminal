# Skills map

Skills live in `.kiro/skills/`. Every skill description starts with its category tag, `[ASSET PCG]` or `[LEVEL GEN]`. Activate the matching skill before working in its area; do not improvise rules the skill already defines.

## Category 1: ASSET PCG (procedural content generation of game assets)

Root contract: `haunted-art-direction`. Read it first, before any other asset skill.

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

## Boundary

- Needs a new model, room, texture, effect or animation: ASSET PCG, then return to the level.
- Needs a new puzzle, win rule, dialogue, comic panel or level order: LEVEL GEN.
- Level-gen skills may read `haunted-art-direction`; asset skills never depend on level skills.
