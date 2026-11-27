# Config-driven scenes: requirements

Status: done

Capability: Move all chapter level entities (files, ports/doors, consumables/pickups, enemies, hardware & Kiroween room clutter props, backdrops, ambient behaviors, SFX/music cues) and all Comix visuals/props (both Animated 3D Comix `comix/<slug>/` and Chapter Story Comix `story/comix.spec.json`) into declarative JSON configs with unified `zOrder`, `scale`, and `rotation` transform support, ink-outline compensation, `/editor` + `/comix-editor` + `/terminal-lab` form/validator coverage, and updated Kiro Crew instructions so agents configure JSON specs before touching engine code.

## Requirements

1. **Shared Scene Transforms & Ink Compensation**
   - WHEN any stage actor, entity, prop, backdrop item, or comix cast member declares optional transform fields (`zOrder?: number`, `scale?: number | [number, number, number]`, `rotation?: number | [number, number, number]` in degrees where a scalar means Z-tilt and a 3-tuple means Euler XYZ), THE SYSTEM SHALL normalize and apply position depth offset + Three.js `renderOrder` (`zOrder = 0` on actor plane, `< 0` toward back wall, `> 0` toward camera), uniform or anisotropic `scale`, and degree-based XYZ `rotation` identically across gameplay `ComicStage`, Animated 3D Comix `CinematicStage`, Story Comix WebGL (`src/play/comix-panel.ts`), and offline Story Comix rasterization (`scripts/harness/draw-comix.mjs`).
   - WHEN an actor or prop has non-unit uniform or non-uniform `scale` applied on `ComicStage` or `CinematicStage`, THE SYSTEM SHALL compensate ink-outline shell extrusion in world space so comic ink silhouette thickness stays proportional without distorting axes or clamping tweened base transforms back to `(1, 1, 1)` / `0`.

2. **Dungeon Room Clutter & Backdrop Overrides**
   - WHEN building dungeon rooms `room.desk`, `room.attic`, `room.crypt_entrance`, `room.crypt_hall`, `room.chasm`, `room.cell`, `room.lab_hall`, `room.catwalk`, `room.furnace`, and `room.core`, THE SYSTEM SHALL render only architectural walls, floors, arches, and fixed structural rigs inside `room.<kind>`, having extracted compact disks/platters (`prop.platter`), wall shelves (`prop.shelf`), corner cable cobwebs (`prop.corner_cobweb`), dangling ceiling cables (`prop.hanging_cable`), colored PCB wall plaques (`prop.pcb_plaque`), and LED indicator strips (`prop.led_bar`) alongside `prop.cobweb`, `prop.spider`, and `prop.bat` as standalone `ModelCatalog` `prop.*` assets placed via JSON `props[]` (for chapters) and preserved in Classic floor `LAYOUTS` (`src/game/view-layouts.ts`).
   - WHEN a `RoomView` or `level.spec.json` `stage` provides `backdrop` (`#rrggbb`) or `ambient` (`bats`, `storm`, `lightMode`, `loops`), THE SYSTEM SHALL apply those visual and ambient overrides on `ComicStage` and audio playback.

3. **Animated 3D Comix Real-World Props & Animatable Stage Props**
   - WHEN validating models tagged `real-world` in `ModelCatalog`, THE SYSTEM SHALL permit `human` palette zones for real-world furniture props alongside `vibecoder.*`, `item.*`, `npc.greybeard_rig`, `room.intro`, and `room.outro`.
   - WHEN rendering `comix/<slug>/` sequences (`room.intro` and `room.outro`), THE SYSTEM SHALL provide standalone real-world props (`prop.coffee_mug`, `prop.desk_lamp`, `prop.pc_tower`, `prop.bookshelf`, `prop.wall_poster`, `prop.sticky_note`) in `ModelCatalog`, place them via `comix.manifest.json` `stage.props[]` with full `zOrder`/`scale`/`rotation`/`visible` support, and allow `SceneTrack` (`actor_visibility`, `actor_motion`, `actor_rig`, `part_visibility`, `material_tint`) to target `stage.props[]` entries by id in addition to `cast[]` actors and `room`.

4. **Single-Source Declarative Level Configs & Audio Cues**
   - WHEN reading a chapter level (`LevelSpec`), THE SYSTEM SHALL accept optional `x`, `y`, `zOrder`, `scale`, `rotation`, `model`, `socket`, `label`, and `sfx` directly on entries in `files[]`, `pickups[]`, `enemies[]`, and `props[]` (including `cwd` on `props[]` for subdirectories, plus `stage.hero`, `stage.entryPort`, `stage.kiro`, `stage.backdrop`, `stage.ambient`, `stage.music`, `stage.sfx`, and `stage.subdirs` per-path overrides), explicit pickup models (`model`) and transform overrides on `item.tube_transistor` / `pickup.gpu`, as well as declarative `sfx`, `music`, `fx` (`preset`, `x?`, `y?`, `text?`), `despawn`, and spatial/transformed non-`kiro` `spawn` steps in `LevelScript`.
   - WHEN transitioning through chapter doors, collecting configured pickups, triggering enemy attacks, executing level scripts, or playing level music beds, THE SYSTEM SHALL resolve SFX (including `ROOM_TRANSITION.doorModel` -> `doorModelCue` fallback when `ev.sfx` is unset) and music cues from chapter/level config via `AppBus` and `KernelEvent`, mark door actors with `RoomActor.portRole` (`'entry' | 'exit' | 'sub'`) for level-transition targeting, and remove all hardcoded Chapter-01 layout entries from `src/game/view-layouts.ts` and Chapter-01 door basenames from `src/audio/sfx-doors.ts` while preserving Classic floor `F1`–`F5` behavior (enforced across `game` and `audio` by `check-declarative.mjs`).

5. **Chapter Story Comix Configs, Editors, Validators & Agent Workflow**
   - WHEN rendering Chapter Story Comix panels (`story/comix.spec.json`) in WebGL (`comic.html`) or PNG (`scripts/harness/draw-comix.mjs`), THE SYSTEM SHALL honor actor `y`, `zOrder`, `scale`, `rotation`, per-panel `props[]`, `backdrop`, and interactive `sfx.cue`.
   - WHEN editing or validating chapter packs, comix packs, or terminal labs in `/editor`, `/comix-editor`, `/terminal-lab`, `validate-pack.ts`, `check.ts`, `credits-forge` (`list_assets` including `kind: 'audio'`), or `scripts/quality/`, THE SYSTEM SHALL expose exhaustive schema forms (`numOrVec3`, `sfx`/`music`/`fx` suggestion datalists, stage/prop/audio/script fields), static checks (including `FxCatalog` checks for `fx` steps and `spawn` transform validation), updated property tests, updated agent prompts (`.kiro/agents/prompts/*.md`) and skills directing agents to modify JSON configs before touching engine code.

## Out of scope

- Replacing or changing Classic Campaign (`F1`–`F5` in `src/game/floors.ts`, `LAYOUTS[F1..F5]`, and Classic `DOOR_CUE` entries in `src/audio/sfx-doors.ts`).
- Adding new gameplay chapters beyond `chapter-01-kiroween` or introducing hand-authored static mesh files instead of procedural `ModelCatalog` specs.
- Adding external audio assets beyond the existing `SFX_IDS` / `MUSIC_IDS` manifests.

## Decisions

- **Q1 (Baked room background clutter & backdrops):** Extract clutter into standalone `prop.*` models + JSON `props[]` + `stage.backdrop`/`ambient` overrides — makes every CD, web, spider, bat, shelf, and backdrop configurable in JSON while keeping Classic floor presets intact. **A (user, 2026-11-27):** Recommended option approved.
- **Q2 (Animated 3D Comix `room.intro` & `room.outro` props):** Extract movable intro/outro props (mug, lamp, PC tower, bookshelf, poster, sticky notes) into `ModelCatalog` (`'real-world'` palette tag) and place them via `comix.manifest.json` `stage.props[]` (animatable on tracks) — makes comix background furniture configurable too. **A (user, 2026-11-27):** Recommended option approved.
- **Q3 (Transform JSON shape across chapter & comix):** `zOrder: number` (`0` = actor plane, `<0` toward wall, `>0` toward camera + `renderOrder`), `scale: number | [sx, sy, sz]`, `rotation: number | [rx, ry, rz]` in degrees (`number` = Z-tilt), with ink-outline compensation — concise for 2D tweaks, full 3D when needed. **A (user, 2026-11-27):** Recommended option approved.
- **Q4 (Level config structure in `level.spec.json`):** Add `x`/`y`/`zOrder`/`scale`/`rotation`/`model`/`socket`/`label`/`sfx` directly on `files[]`, `pickups[]`, `enemies[]`, and `props[]` (with `cwd` for subdirs), add `stage` (`hero`, `entryPort`, `kiro`, `backdrop`, `ambient`) + music/sfx cues & script steps, and remove Chapter-01 tables from `view-layouts.ts` & `sfx-doors.ts` — single source of truth per entity. **A (user, 2026-11-27):** Recommended option approved.
- **Q5 (Comix/editor scope & approval):** Cover both Animated 3D Comix (`comix/*`) and Chapter Story Comix (`story/comix.spec.json` in WebGL + `draw-comix.mjs`), update `/editor` + `/comix-editor` + `/terminal-lab` forms & Crew prompts/skills, and treat user answers here as approval to spec & implement end-to-end now. **A (user, 2026-11-27):** Recommended option approved.

## Open questions

None.

## Verification

- Geometry & tags: `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --strict` and `node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all`.
- Chapters & chapter editor: `node scripts/harness/generate-chapter.mjs --check`, `node scripts/harness/generate-chapter.mjs --verify --ticks 3`, `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`, `node scripts/harness/draw-comix.mjs`.
- Comix & comix editor: `node scripts/harness/generate-comix.mjs --check`, `node scripts/harness/generate-comix.mjs --verify`, `node .kiro/skills/comix-implementer/scripts/verify-comix.mjs`.
- Terminal Lab, Audio, Classic, Battle & Project quality: `npm run quality` (including `tsc`, `lint`, `size`, `layers`, `cycles`, `deadcode`, `declarative`, `specs`, `dup`, `agents`, `brands`, `mcp`, `props`), `npm run test`, `npm run build`, and updated unit/property assertions.
