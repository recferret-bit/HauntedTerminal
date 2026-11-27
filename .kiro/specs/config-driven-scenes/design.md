# Config-driven scenes: design

## Overview

The engine currently splits scene truth between JSON (`chapters/*/levels/*/level.spec.json`, `comix/*/comix.manifest.json`, `comix/*/pages/*/page.spec.json`, `chapters/*/story/comix.spec.json`) and hardcoded TypeScript modules (`src/game/view-layouts.ts` for Chapter-01 entity slots & props, `src/audio/sfx-doors.ts` for door basenames, `src/procgen/archetypes/rooms/floor1..5.ts` & `intro-room.ts` / `outro.ts` for baked clutter props), while lacking uniform/3D `zOrder`, `scale`, and degree `rotation` transforms across entities, actors, and props.

This design unifies scene placement, transforms, clutter props, backdrops, ambient rigs, and audio cues in JSON without breaking Classic `F1`–`F5` floors or violating strict inward layers (`scripts/quality/check-layers.mjs`).

## Architecture & Layer Flow

1. **Contracts (`src/contracts/`)**:
   - `src/contracts/room-view.ts`:
     - Export `SceneScale = number | [number, number, number]` and `SceneRotation = number | [number, number, number]` (degrees; scalar = Z-tilt).
     - Export `SceneTransform = { zOrder?: number; scale?: SceneScale; rotation?: SceneRotation }` and pure transform helpers (`normalizeScale`, `normalizeRotationDeg`, `normalizeRotationRad`, `zOrderToZOffset`, `zOrderToRenderOrder`).
     - Export `StageAmbientConfig` (`bats`, `storm`, `lightMode`, `loops`).
     - Extend `RoomActor` with `SceneTransform` and `portRole?: 'entry' | 'exit' | 'sub'`, and `RoomView` with `backdrop?: string` and `ambient?: StageAmbientConfig`.
   - `src/contracts/audio-cues.ts`:
     - Hold canonical `SFX_IDS`, `SfxId`, `MUSIC_IDS`, `MusicId` (re-exported by `src/audio/catalog.ts`) so `chapters`, `cinematic`, `chapter-editor`, `comix-editor`, `play`, and `audio` share exact cue validation without cross-layer cycles.
   - `src/contracts/app-bus.ts` & `src/contracts/events.ts`:
     - Extend `AppEvent` with `{ kind: 'sfx'; cue: string }` and `{ kind: 'music'; cue: string | null }`.
     - Extend `MusicScene` with optional `music?: string` override from active level/room config.
     - Extend `KernelEvent` (`ROOM_TRANSITION` with optional `sfx?: string` and `doorModel?: string`, `PICKUP_COLLECTED`, `ENEMY_ATTACK`, `FLOOR_ENTERED`, etc.), and add `{ type: 'SOUND_CUE'; cue: string }` and `{ type: 'FX_CUE'; preset: string; x?: number; y?: number; text?: string }`.

2. **Procgen & Ink Outline Compensation (`src/procgen/`)**:
   - `src/procgen/geometry/geometry.ts`: store `{ basePos, nrm, baseWeight }` in `shellGeo.userData.inkBase` inside `inkShellGeometry`.
   - `src/procgen/runtime/build.ts` & `src/procgen/index.ts`: export `compensateInkOutlines(root: THREE.Object3D)` to re-project ink shell vertices using inverse world-scale normal compensation whenever parent actor/prop/room scale is non-unit or anisotropic, keeping `MeshBasicMaterial` and existing `applyInk` fade compatibility intact.
   - `src/procgen/validate/model/semantic-checks.ts`: exempt models carrying tag `'real-world'` from `HUMAN_ZONE_MISUSE`.
   - **Dungeon Clutter Extraction**:
     - Register standalone `prop.platter`, `prop.shelf`, `prop.corner_cobweb`, `prop.hanging_cable`, `prop.pcb_plaque`, and `prop.led_bar` in `src/procgen/archetypes/props.ts` (under `props/clutter.ts` / `props/kiroween.ts`) with `['hover', 'wall']` tags and valid sockets/budgets.
     - Strip baked clutter calls (`platter`, `shelf`, `cobweb`, `radialCobweb`, `hangingCable`, `perchedBat`, `danglingSpider`, `textoliteBoardPlaque`, `indicatorPanel`) out of `floor1.ts`–`floor5.ts`.
   - **Real-World Comix Props Extraction**:
     - Register `prop.coffee_mug`, `prop.desk_lamp`, `prop.pc_tower`, `prop.bookshelf`, `prop.wall_poster`, and `prop.sticky_note` (all tagged `'real-world'`, wall items tagged `'wall', 'hover'`) under `src/procgen/archetypes/cinematic/real-props.ts` (imported by `src/procgen/archetypes/cinematic.ts`).
     - Strip those movable furniture props from `room.intro` and `room.outro`, leaving room shell, window, sky/clouds/sun, curtains, desk, monitor, and keyboard cleanly intact (with wall-socket grounded against skirting in `room.intro`).

3. **Renderer (`src/renderer/`)**:
   - `stage-cast.ts`, `stage-sync.ts`, `stage-level-transition.ts` & `stage-event-cast.ts`:
     - Keep `baseScale` at `[1, 1, 1]` for `laidTransistor` so JSON `scale`/`rotation` apply directly while keeping `(1.45, 90deg)` fallback + sideways floor-centering when unset; track `portRole` so `findExitDoorX` / `findEntryDoorX` target semantic exit/entry doors cleanly; handle `FX_CUE` via `stage.fxPlayer`.
     - Store `userData.baseScaleVec`, `userData.baseRot`, and `zOrder` on `actor.body` / `StageActor`.
     - Apply `zOrder` (`z = baseZ - zOrder * 0.08`, clamped in front of wall face, plus `renderOrder`), normalized `scale` (multiplying actor/pickup stage scale and scaling `actor.height` and pickup clearance cleanly), and normalized `rotation` in degrees, then run `compensateInkOutlines`.
     - Preserve configured base scale/rotation across `stage-motion.ts` animations (`suckIntoNull`, `collect`, `finishExit`, `popOut`, `flyTo`).
     - In `stage-sync.ts`, apply `view.backdrop` hex override and `view.ambient` (`bats`, `storm`, `lightMode`) onto `ComicStage`.
   - `stage-bats.ts`: honor `stage.batsConfig` (`enabled`, `minGapSec`, `maxGapSec`, `count`, `scale`) from `RoomView.ambient.bats`.

4. **Game & Audio (`src/game/`, `src/audio/`, `src/play/`)**:
   - `src/game/view-layouts.ts`: delete all hardcoded Chapter-01 layout entries; preserve Classic `F1`–`F5` entries and move Classic's extracted clutter props (`prop.platter`, `prop.shelf`, `prop.corner_cobweb`, `prop.cobweb`, `prop.spider`, `prop.bat`, `prop.hanging_cable`, `prop.pcb_plaque`, `prop.led_bar`) into Classic `LAYOUTS`.
   - `src/game/view.ts`, `src/game/entities-types.ts`, `src/game/entities.ts`, `src/game/floors.ts`: let `ViewThing`, `EntityView`, `EnemySpawn`, `PickupSpawn`, and `SceneFacts` carry direct placement/visual/audio config (`x`, `y`, `zOrder`, `scale`, `rotation`, `model`, `socket`, `label`, `sfx`) and stage overrides (`hero`, `entryPort`, `backdrop`, `ambient`) so `buildRoom(facts)` is 100% config-driven when `LAYOUTS[cwd]` is absent.
   - `src/audio/sfx-doors.ts`: remove all Chapter-01 door basenames from `DOOR_CUE`, keeping Classic doors intact, and add `doorModelCue` (`door.*` -> `SfxId`).
   - `src/audio/sfx-kernel.ts` & `src/audio/sfx-app.ts` & `src/audio/music-for.ts`: prioritize event `ev.sfx` overrides, then `doorModelCue(ev.doorModel)`, then `doorCue(ev.toPath)` -> `'hop'`, plus `SOUND_CUE`, `scene.music` override in `musicFor`, and `app.sfx` / `app.music` cues.
   - `src/play/audio-sync.ts`: forward level `music` & `ambientLoops` overrides from `GameSnapshot` onto `MusicScene` and loop state.

5. **Declarative Chapters (`src/chapters/`, `chapters/chapter-01-kiroween/`)**:
   - Extend `LevelFileSpec`, `LevelEnemySpec`, `LevelPickupSpec`, `LevelPropSpec` (`+ cwd`), `LevelSpec.stage`, `LevelScript` steps (`spawn` with `x`/`y`/`label`/`SceneTransform`, `despawn`, `sfx`, `fx`, `music`), `ChapterManifest.outro.actors` & `boss` cameo transforms in `src/chapters/{types,script-types}.ts`.
   - Wire `session-level.ts`, `session-fs.ts` (passing `doorModel` on `ROOM_TRANSITION`), `session-snapshot.ts` (materializing `rt.spawnedActors`), `script.ts` (`spawn`/`despawn`/`fx`/`sfx`/`music`), and `session-flow.ts` to populate VFS/entity/subdir configs, SFX/FX events, music, and `RoomView.stage` / `backdrop` / `ambient` purely from JSON.
   - Migrate all Chapter-01 layouts, door SFX, clutter props, explicit pickup models (`pickup.gpu` / `item.tube_transistor`), subdir configs, and story comix configs into `chapters/chapter-01-kiroween/levels/level-01..11/level.spec.json` and `chapters/chapter-01-kiroween/story/comix.spec.json`, formatted with `stringifyChapterJson` and compiled cleanly.

6. **Animated 3D Comix & Story Comix (`src/cinematic/`, `src/play/comix-panel.ts`, `scripts/harness/draw-comix.mjs`)**:
   - `src/cinematic/spec-types.ts`: add `SceneTransform` + `visible` to `StagePropSpec`, add `SceneTransform` to `ComixActorSpec`, add `ambient?: StageAmbientConfig` to `ComixStageSpec`, extend `actor_motion` with optional `scaleVecFrom/To`, `rotFrom/To`, `zOrderFrom/To`.
   - `src/cinematic/{reel,play-pack,tracks,timeline,simulate,editor-select}.ts`: promote `stage.props[]` to full animatable track targets (preserving baseline state across `resetBaseline` & `collectTrackBases`), support `zOrder`, uniform/non-uniform `scale`, degree `rotation` (`rotationZ` backward-compatible), and `compensateInkOutlines`.
   - Update `comix/intro/*` and `comix/outro/*` JSONs cleanly via `stringifyComixJson` so extracted real-world props live in `stage.props[]` and animated `powerAmber` tracks target `"tower"`.
   - Upgrade `ComixCastActor` & `ComixPanelSpec` (`y`, `zOrder`, `scale`, `rotation`, `props`, `backdrop`, `sfx.cue`) in both `src/play/comix-panel.ts` (WebGL) and `scripts/harness/draw-comix.mjs` (3D-transformed `BakedPart` software rasterizer).

7. **Editors, Terminal Lab, Quality & Crew Guidance**:
   - `src/editor-core/`: add `numOrVec3` `Field` type and `sfx`/`music`/`fx` suggestion categories with `SchemaWalk` validation and UI controls.
   - Update `src/chapter-editor/` (splitting script variants into `schema-script.ts` and passing `FxCatalog.has` to `assetIssues`), `src/comix-editor/`, `src/terminal-lab/`, `src/chapters/validate-pack.ts`, `scripts/mcp/credits-forge` (`list_assets` supporting `kind: 'audio'`), `scripts/quality/check-declarative.mjs` (`game`, `audio`, VFS paths), `scripts/hooks/guard-chapter-files.mjs`, property test suites, unit suites, `.kiro/agents/prompts/*.md`, and `.kiro/skills/*/SKILL.md`.
