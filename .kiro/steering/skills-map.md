# Skills map

Skills live in `.kiro/skills/`. Every skill description starts with its category tag, `[ASSET PCG]` or `[LEVEL GEN]`. Activate the matching skill before working in its area; do not improvise rules the skill already defines.

## Category 1: ASSET PCG (procedural content generation of game assets)

Root contract: `haunted-art-direction`. Read it first, before any other asset skill.

| Area | Skills |
|---|---|
| Models | `procedural-kitbash-3d` (hero, pickups, doors, props), `procedural-malware-3d` (enemies, bosses), `model-geometry-validator` |
| Rooms | `procedural-rooms-3d` |
| Surfaces | `procedural-texture-synthesis`, `shader-texture-tuning`, `comic-lighting-and-lightning` |
| Motion | `procedural-animation-3d`, `procedural-malware-animation` |
| Effects | `procedural-particles-3d`, `particle-effect-validator` |
| External assets | `ai-mesh-pipeline` (PNG sprites, `.glb` meshes) |
| Visual QA | `comic-panel-viewport-auditor` |

Rules: every asset change ends with its validator and a visual QA pass. Pair creator skills with their validator (models with `model-geometry-validator`, effects with `particle-effect-validator`).

## Category 2: LEVEL GEN (levels and the chapter)

Run in this order. Each step consumes the output of the previous one.

1. `chapter-architect-intake`: interview, then chapter specs (manifest, comix spec, dialogs, `level.spec.json` per level).
2. `comix-story-drawer`: render the Comix pages from `story/comix.spec.json`.
3. `chapter-level-generator`: compile levels, validators, headless solvability.
4. `chapter-implementer`: run the whole pipeline and the QA gate (`verify-chapter.mjs`).

Rules: specs reference existing asset IDs only (`ModelCatalog`, `RoomKind`). Never put geometry, shader or particle definitions in a level spec.

## Boundary

- Needs a new model, room, texture, effect or animation: ASSET PCG, then return to the level.
- Needs a new puzzle, win rule, dialogue, comic panel or level order: LEVEL GEN.
- Level-gen skills may read `haunted-art-direction`; asset skills never depend on level skills.
