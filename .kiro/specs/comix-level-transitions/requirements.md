# Comix level transitions and 3D hero movement: requirements

Status: done (2026-11-26; requirements, design, tasks approved by the user 2026-11-26)

Capability: Rework level transitions into a smooth *Comix Zone*-style panel-to-panel sequence (~1.8 s) where the 3D developer turns in 3/4 profile and walks into the outgoing room's socketed exit door (`door.right`), the camera pans left-to-right across an ink-framed cream paper gutter (`#efe6d2`) into the incoming panel with a corner *Comix Zone* yellow caption box, and the developer steps out of the incoming room's entrance door (`door.left`) into his resting spot, with 12 fps stepped 3D yaw turning and limb motion across walks while keeping Level 1 boot, retries, map jumps, and headless execution instant.

## What exists today (read from the code, 2026-11-26)

- **Synchronous level swap:** In `src/chapters/session-fs.ts` (`cmdCd`), stepping into `spec.exitDir` emits `FLOOR_CLEARED`, calls `loadLevel(g, g.levelIdx + 1, ...)` (`src/chapters/session-level.ts`), and emits `FLOOR_ENTERED` + `ENTITY_SPAWNED` in one synchronous `exec()` batch whose `snapshot` is already the new level's `RoomView`. Classic mode (`src/game/commands-move.ts`, `advance()`) emits `FLOOR_CLEARED`, `ROOM_TRANSITION`, and `FLOOR_ENTERED` in the same synchronous pattern.
- **Immediate room wipe and opaque flip card:** In `src/play/loop.ts` (`applySlice`), `FLOOR_ENTERED` triggers `holdForCard(play)` (`PauseReason = 'card'`, `CARD_MS = 1600` in `src/play/state.ts`) and immediately calls `paint(play, snap)` -> `play.stage.syncRoom(snap.room)` (`src/renderer/stage-sync.ts`). `syncRoomInner` removes all non-hero (and non-Kiro) actors of the old room on room change, snaps the hero to his new `home`, and `onFloorEntered` (`src/renderer/stage-event-travel.ts`) spawns a full-panel opaque DOM flip card (`stage.overlay.card(...)` in `src/renderer/stage-overlay.ts`, 420 ms in + 800 ms hold + 380 ms out). `onFloorCleared` only hops in place (`hopInPlace`); the hero never walks to an exit door or out of an entrance door.
- **Camera locked to `CAM_HOME`:** `ComicStage` (`src/renderer/comic-stage.ts`) uses an orthographic camera at `CAM_HOME = (0, 2.45, -8)` looking at `LOOK_HOME = (0, 2.45, 0)` (world `+x` is screen-left, `-x` is screen-right), with a cream `#efe6d2` paper plane (`28 x 16`) behind the stage at `z = 2.4` (`src/renderer/stage-layout.ts`), while `applyShake` (`src/renderer/stage-frame.ts`) resets `stage.camera.position` to `CAM_HOME` whenever `shakeLeft <= 0`.
- **Room door sockets already exist:** Every `room.<kind>` (`src/procgen/archetypes/rooms/frame.ts`, `RoomBuilder.standardSockets`) defines `door.left` (`[3.3, 0, 0.25]`), `door.right` (`[-3.55, 0, 0.25]`), `door.down` (`[-2.4, 0, 0]`), and `vibecoder`, queryable in world space via `roomSocket(stage, name)` (`src/renderer/stage-resolve.ts`). However, `src/game/view.ts` (`placeThings`) places `exitDir` (`door.ethernet`) at `place.free()` unless specified in `LAYOUTS`, and spawns no entry door actor on `door.left`.
- **3D hero model never turns:** `vibecoder.*` (`src/procgen/archetypes/vibecoder.ts`) is a full 3D extruded kitbash (`torso` depth `0.28`, `hood` `0.30`, `legWalk` and `armSwing` around local `axis: 'x'`, face/eyes on `-z`). Yet `animator.setFacing` (`src/procgen/runtime/animator/pose.ts`) only flips `root.forward` and `root.lean` — `hero.body.rotation.y` stays `0` (facing dead-front) during `walkActor` (`src/renderer/stage-frame.ts`), `heroAction` (`src/renderer/stage-motion.ts`), and `onRoomTransition` (`src/renderer/stage-event-travel.ts`).

## Requirements

1. **Level-exit sequence trigger and outgoing room preservation:**
   WHEN a player completes a level via a level exit (`FLOOR_CLEARED` paired with `FLOOR_ENTERED`), THE SYSTEM SHALL keep the outgoing room geometry and outgoing actors on `ComicStage` until the exit walk completes and the camera scrolls past the outgoing panel, while keeping `session.exec()` synchronous and instant for headless callers.

2. **Walk into the outgoing socketed exit door:**
   WHEN a level-exit transition begins on `ComicStage`, THE SYSTEM SHALL turn the 3D developer toward the outgoing room's exit door (at socket `door.right` or the resolved exit door actor), animate him walking to that doorway at 12 fps comic timing, and tuck him into the doorway (depth offset and slight scale tuck) before the camera pan begins.

3. **Comix panel-to-panel camera pan and corner caption box:**
   WHEN the developer enters the outgoing exit door on a level-exit transition, THE SYSTEM SHALL pan the orthographic camera horizontally left-to-right (from the outgoing panel across an ink-framed cream `#efe6d2` comic paper gutter to the incoming panel) and show a corner *Comix Zone* yellow caption box for the new level, replacing the opaque full-panel flip card (`stage.overlay.card`) on level-exit transitions, while keeping `stage.overlay` projections and camera shake (`applyShake`) aligned to the active camera position.

4. **Socketed exit and entrance doors (`door.right` and `door.left`) without spec edits:**
   WHILE constructing a room view (`buildRoom` / chapter snapshot decoration), THE SYSTEM SHALL auto-anchor the room's exit door to room socket `door.right` and, for every level after the first (`floor > 1` / `levelIdx > 0`), auto-place an entrance port door at room socket `door.left` without modifying existing `level.spec.json` files.

5. **Walk out of the incoming entrance door:**
   WHEN the camera pan reaches the incoming level panel during a level-exit transition, THE SYSTEM SHALL spawn the developer inside the incoming room's `door.left` doorway with a doorway depth/scale tuck, step him forward out onto `y = feetY` and across to his resting `home` position in `walk` animation turned toward travel, and return him to front-facing `idle` on arrival.

6. **Instant loads for boot, retries, and map jumps:**
   WHEN the game loads Level 1 at boot, reloads a level (`restart-level` / `retry` / floor restart), or jumps directly via Chapter Map or dev teleport (no `FLOOR_CLEARED` exit), THE SYSTEM SHALL load the room immediately without playing the walk-to-door, camera scroll, or walk-out sequence.

7. **In-level `cd` door walk:**
   WHEN an in-level directory transition (`ROOM_TRANSITION`, non-loop and `upwardPanelsSmashed < 3`) runs on `ComicStage`, THE SYSTEM SHALL turn and walk the 3D developer toward the target door (or entry side) with stepped 12 fps motion instead of keeping him facing dead-front, while preserving `panel_smash` (`upwardPanelsSmashed >= 3`) and `eloop` (`viaSymlinkLoop`) behaviors.

8. **3D hero turning and stepped limb animation across walks:**
   WHILE the developer is walking (`walkActor`, `heroAction`, in-level `ROOM_TRANSITION`, or level-exit/entry walks), THE SYSTEM SHALL rotate `hero.body.rotation.y` up to ~70 degrees in a 3/4 profile toward the horizontal travel direction on a 12 fps stepped comic beat (never exposing his flat back) while driving `animator.setState('walk')`, and SHALL restore `hero.body.rotation.y = 0` and resting `idle` state when movement stops, without breaking `StageActor` badges, sockets (`actorSocket`), or DOM overlays.

9. **Input/clock hold and Enter-to-skip:**
   WHILE a ~1.8 s level-exit transition sequence is playing on the play page, THE SYSTEM SHALL pause the game clock and block shell command submission, and IF the player presses Enter during the sequence, THEN THE SYSTEM SHALL skip immediately to the settled incoming room state (camera at `CAM_HOME`, developer at `home` facing front, overlays synced, clock and shell resumed) without submitting a terminal command.

10. **Reduced motion (`prefers-reduced-motion`):**
    WHILE `stage.reducedMotion.on` is true when a level-exit transition runs, THE SYSTEM SHALL skip the walk-in, camera gutter pan, and walk-out animations and cut immediately to the settled incoming room state.

11. **Invariants (headless, Terminal Lab, fingerprint):**
    THE SYSTEM SHALL keep headless chapter playthroughs at 0 deaths, keep Terminal Lab runs and transcripts unchanged, and keep `npm run quality:fingerprint` byte-identical (no edits to model geometry or `AnimTag` tables in `src/procgen/archetypes/`).

## Out of scope

- Editing any `chapters/*/levels/*/level.spec.json` or adding new level/editor/validator vocabulary fields (`types.ts`, `script-types.ts`, `src/chapter-editor/schema.ts`, `src/chapters/validate-pack.ts`).
- Changing `vibecoder.*` or `door.*` model geometry, adding back-hood meshes, or altering `npm run quality:fingerprint`.
- Playing the walk-to-door, camera scroll, or walk-out sequence on Level 1 boot, `restart-level` / `retry`, `map` / dev teleports, or Terminal Lab swaps.
- Multi-row vertical or diagonal comic-page tier panning.
- Changes to turn-based battle rules or battle intro timing.

## Decisions

- **Q1:** Which level and room changes should play the walk-to-door, camera scroll, and walk-out sequence?
  **A (user, 2026-11-26):** Level exits (`cd <exitDir>` / floor exit) play full walk -> comic scroll -> walk-out; in-level `cd` also turns & walks to the door (Level 1 start, retries, and map jumps stay instant).
- **Q2:** How should the Comix Zone camera scroll and level title card work together?
  **A (user, 2026-11-26):** Horizontal left-to-right camera pan across an ink-framed cream paper gutter (`#efe6d2`) + corner Comix Zone yellow caption box, replacing the opaque full-panel flip card on transitions.
- **Q3:** How should exit and entrance doors be placed on rooms?
  **A (user, 2026-11-26):** Auto-anchor the exit door to room socket `door.right` and auto-place a matching entrance port door on `door.left` for levels > 1 (zero `level.spec.json` edits).
- **Q4:** How should the 3D vibecoder turn and animate during movement?
  **A (user, 2026-11-26):** 3/4 3D yaw turn (`rotation.y` up to ~70 deg toward travel, never exposing his flat back) on all walks (transitions + command actions), stepped at 12 fps comic timing with a doorway depth/scale tuck.
- **Q5:** How should terminal input, timers, and reduced motion behave while the transition plays?
  **A (user, 2026-11-26):** Pause game clock & block shell input during the ~1.8s sequence, allow Enter to skip straight to landed state, cut to an instant swap under `prefers-reduced-motion`, and keep headless `session.exec()` instant.
- **Requirements approval (user, 2026-11-26):** Explicit approval of `requirements.md` as written.
- **Design approval (user, 2026-11-26):** Explicit approval of `design.md` as written.
- **Tasks approval (user, 2026-11-26):** Explicit approval of `tasks.md` as written.

## Open questions

## Owners (proposed, confirmed at the design gate)

- `artist`: `src/renderer/**` (3D hero yaw turning, doorway tuck, camera pan + ink-framed cream gutter + corner yellow caption box, deferred outgoing/incoming room transition choreography, `stage-selfcheck.ts`) and `src/procgen/anim/events.ts` (transition reaction metadata/comments).
- `lead-dev`: `src/play/**` (transition pause reason, Enter-to-skip, `applyEvents` / `paint` coordination), `src/game/view.ts` & `src/chapters/session-snapshot.ts` (socketed `door.right` / `door.left` placement), `src/contracts/**` (if any shared snapshot/room metadata is extended), and docs/steering/spec updates.
- `qa`: Chrome visual & behavioral verification across desktop/narrow viewports, Enter-to-skip, and `prefers-reduced-motion`.

## Verification

- Spec gate: `node scripts/quality/check-specs.mjs`
- Project gates: `npm run quality`, `node scripts/harness/architecture-unit.mjs`, `node scripts/harness/classic-unit.mjs`
- Chapter & headless solvability: `node scripts/harness/generate-chapter.mjs --verify`, `node scripts/harness/playthrough.mjs --ticks 3`
- Asset & animation invariants: `node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all`, `npm run quality:fingerprint` (must remain byte-identical)
- Terminal Lab invariance: `node scripts/harness/terminal-lab.mjs --all`, `node scripts/harness/terminal-lab-unit.mjs`
- Visual & interactive browser QA: Chrome screenshots / filmstrip (`play-browser.mjs` / `screenshot-lab.mjs`) verifying outgoing walk to `door.right`, ink-framed paper gutter pan + yellow corner caption, walk-out from `door.left`, 3/4 3D hero turning on movement, Enter skip, and `prefers-reduced-motion` instant cut.
