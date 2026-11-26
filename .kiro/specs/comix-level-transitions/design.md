# Comix level transitions and 3D hero movement: design

Status: see requirements.md

Follows [requirements.md](./requirements.md) (approved by the user 2026-11-26). Grounded in the existing `ComicStage`, `PlayLifecycle`, `buildRoom`, and `ModelAnimator` code read on 2026-11-26.

## Data flow & 3-phase timeline (`LEVEL_TRANSITION_MS = 1760`)

```
session.exec('cd <exitDir>') / Classic advance()
  ├── Synchronous kernel swap: emits FLOOR_CLEARED + (Classic ROOM_TRANSITION +) FLOOR_ENTERED + ENTITY_SPAWNED
  └── Returns incoming snap.room immediately (headless playthroughs, Terminal Lab, and --verify stay instant)

Browser play loop (src/play/loop.ts):
  ├── Detects paired FLOOR_CLEARED + FLOOR_ENTERED (when !stage.reducedMotion.on)
  ├── Holds PauseReason 'transition' for LEVEL_TRANSITION_MS (pauses clock & storm, blocks shell/modals, keeps HUD visible)
  ├── Defers post-FLOOR_ENTERED DIALOG_BOX / AGENT_TAUNT / TUTORIAL_STEP UI chatter until transition lands or skips
  └── Capture keydown Enter in src/play/input.ts -> skips stage transition, flushes deferred chatter, restores focus

ComicStage 3-phase FSM (LEVEL_TRANSITION_TRANSITIONS via createStateMachine):
  idle ──(FLOOR_CLEARED arms <= 250 ms -> paired FLOOR_ENTERED)──> exit_walk (0..520 ms)
       ──> gutter_pan (520..1200 ms) ──> entry_walk (1200..1760 ms) ──> idle
  (SKIP from any active state -> idle, immediate snap to landed Panel B at x = 0)
```

### Reverse-offset two-panel staging

1. **Arm & capture outgoing panel:** `FLOOR_CLEARED` sets `levelExitArmedAt = stage.clockMs` (expires if `GAME_ENDED` arrives or >250 ms elapses without `FLOOR_ENTERED`). When paired `FLOOR_ENTERED` arrives with `!stage.reducedMotion.on`, `stage.syncRoom(incomingView)` builds Panel B (incoming `stage.room`, `stage.backdrop`, and incoming `StageActor`s) at canonical **`x = 0`**, while Panel A's outgoing `room` mesh, outgoing backdrop clone, outgoing non-hero actors, and two `#110e1b` ink panel-border strips (`~0.09` world units ≈ 5 px each framing a `~0.42` world-unit cream `#efe6d2` paper gutter) move into a temporary `outgoingGroup` shifted to **`x = +panSpan`** (`panSpan = panelW + gutterWorldW`; world `+x` is screen-left, `-x` is screen-right). The background `paper` plane in `stage-layout.ts` widens from `28 x 16` to `56 x 18` so cream comic paper fills all viewport aspects throughout the pan.
2. **Phase 1 — `exit_walk` (`0..520 ms`):** `stage.camPanX = +panSpan`, keeping Panel A pixel-identical to the frame before `cd`. The 3D hero starts at his outgoing `x + panSpan`, turns in 3/4 profile toward the outgoing exit door (`+1.18` rad right-handed yaw toward `-x` screen-right), walks at 12 fps (`83 ms` steps) to `exitDoorX + panSpan`, and tucks into the doorway cavity (`offset.z: 0 -> +0.18`, `body.scale: 1 -> 0.82`) on the final two 12 fps steps.
3. **Phase 2 — `gutter_pan` (`520..1200 ms`):** `stage.camPanX` eases smoothly from `+panSpan` to `0` (`smootherstep` at 60 fps), panning left-to-right across the ink-framed `#efe6d2` paper gutter from Panel A into Panel B at `x = 0`, while `.st-caption-box` snaps in at the bottom-left of `panelRect`. Camera projection in `applyShake` and `stage.overlay.sync` reads `CAM_HOME.x + camPanX` / `LOOK_HOME.x + camPanX`, keeping `dir = (0, 0, +1)` and `assertFrame(stage)` satisfied at every frame. At `1200 ms`, `outgoingGroup` is disposed cleanly with zero Panel B coordinate fixup.
4. **Phase 3 — `entry_walk` (`1200..1760 ms`):** The hero spawns inside Panel B's `door.left` (`door:entry`), untucks (`offset.z: +0.18 -> 0`, `body.scale: 0.82 -> 1`) over two 12 fps steps while walking right (`+1.18` rad) to `hero.home.x`, then steps `rotation.y: +1.18 -> +0.55 -> 0` and restores `idle` on arrival.

## Pieces & Owners

| File | Change | Line budget | Owner |
|---|---|---|---|
| `src/contracts/room-view.ts` | Add optional `socket?: 'door.left' \| 'door.right' \| 'door.down'` on `RoomActor` | ~60 -> ~65 | `lead-dev` |
| `src/game/view-layouts.ts` | Add `entryDoor?: boolean` on `SceneFacts`; nudge left-edge actors within `0.4` of `ENTRY_SOCKET_X = 4.37` (e.g. `dad.tty.sock` in `/sys/clod_overlord_core` `4.25 -> 3.68`) so `door:entry` never overlaps | 460 -> ~470 | `lead-dev` |
| `src/game/view.ts` | Define `ENTRY_SOCKET_X = 4.37` (`roomX = +3.3`) & `EXIT_SOCKET_X = -0.81` (`roomX = -3.55`); anchor exit dirs (`thing.name in facts.exits`) to `socket: 'door.right'` + `EXIT_SOCKET_X`; add `door:entry` (`door.serial`, `socket: 'door.left'`, `ENTRY_SOCKET_X`) when `facts.entryDoor` is true | 225 -> ~255 | `lead-dev` |
| `src/game/runtime.ts` | Pass `entryDoor: g.run.floor > 1 && absPath(g.run.cwd) === FLOOR_PATHS[g.run.floor]` in `facts(g)` | 456 -> ~459 | `lead-dev` |
| `src/chapters/session-snapshot.ts` | Pass `entryDoor: g.levelIdx > 0 && cwdPath === g.rt.spec.cwd` in `facts` | 219 -> ~222 | `chapters-designer` |
| `src/renderer/stage-hero-turn.ts` (**new**) | `HERO_TURN_YAW = 1.18` (~68°), `HERO_HALF_YAW = 0.56`, right-handed travel-to-yaw mapping (`dx < 0` screen-right -> `+HERO_TURN_YAW`, `dx > 0` screen-left -> `-HERO_TURN_YAW`), 12 fps (`83 ms`) stepped yaw update, `applyDoorTuck`, `resetHeroPose` | ~115 | `artist` |
| `src/renderer/stage-level-transition.ts` (**new**) | `LEVEL_TRANSITION_TRANSITIONS` + `createStateMachine`, `outgoingGroup` + `#110e1b` ink borders & `#efe6d2` gutter staging/disposal, `startLevelTransition`, `updateLevelTransition`, `skipLevelTransition`, `isLevelTransitioning`, `isLevelExitArmed`, `reducedMotion` fast-cut | ~245 | `artist` |
| `src/renderer/stage-overlay-cards.ts` (**new**) | Extract `card` & `tearText` from `stage-overlay.ts` and add `captionBox` (two-tier `#ffd166` / `#fbf6e9` *Comix Zone* corner caption box with `#110e1b` border, auto-disposed on transition end) | ~130 | `artist` |
| `src/renderer/stage-overlay.ts` & `stage-overlay.css` | Delegate `card`/`tearText`/`captionBox` to `stage-overlay-cards.ts`; add `.st-caption-box` styling docked bottom-left of `panelRect` clear of HUD/tutorial/dialog chrome | 580 -> ~505 / 148 -> ~175 | `artist` |
| `src/renderer/comic-stage.ts`, `stage-layout.ts`, `stage-sync.ts`, `stage-frame.ts`, `stage-motion.ts`, `stage-event-travel.ts`, `stage-fx.ts`, `stage-selfcheck.ts` | Wire `camPanX`, widened `56 x 18` cream paper backdrop, `placeActorAtSocket` (`door.left`/`door.right`), hero 3/4 yaw across `walkActor`/`heroAction`/in-level `ROOM_TRANSITION`, level-exit transition lifecycle, `captionBox`, and self-check assertions (full transition settle, yaw reset, `reducedMotion` cut, `skipLevelTransition`) | all <= 580 | `artist` |
| `src/procgen/anim/events.ts` | Update `FLOOR_CLEARED` / `ROOM_TRANSITION` metadata rows & comments to reflect socketed door walk, gutter pan, corner caption, and 3/4 yaw | ~160 | `artist` |
| `src/play/lifecycle.ts` | Add `'transition'` to `PauseReason`: pauses clock & storm, blocks shell & modals, `canRestartFloor` false, **`hideHud: false`** | 136 -> ~146 | `lead-dev` |
| `src/play/state.ts` | Export `LEVEL_TRANSITION_MS = 1760` and pending transition timer / deferred chatter flush state on `Play` | 197 -> ~206 | `lead-dev` |
| `src/play/loop.ts` | Pair `FLOOR_CLEARED` + `FLOOR_ENTERED` to hold `'transition'` instead of `'card'` (unless `stage.reducedMotion.on`); defer `DIALOG_BOX` / `AGENT_TAUNT` / `TUTORIAL_STEP` UI playback until transition ends; keep `restart-level` / `map` jump / `debugTeleport` instant without `holdForCard` | 269 -> ~315 | `lead-dev` |
| `src/play/input.ts` | In capture `keydown`, handle `Enter` (`!e.repeat && play.lifecycle.hasReason('transition')`) with `preventDefault()` + `stopPropagation()`, calling `skipPlayLevelTransition(play)` to settle stage, flush deferred chatter, clear `'transition'`, and refocus shell | 431 -> ~452 | `lead-dev` |

## Decisions

- **Right-handed 3/4 yaw (`±68°`) preserves `quality:fingerprint`:** Rotating `hero.body.rotation.y` up to `HERO_TURN_YAW = 1.18` rad (~68°) aligns `vibecoder.*`'s existing `axis: 'x'` `legWalk` and `armSwing` limbs into ~93% of a full side-stride profile toward travel while never exposing his flat back (`credits-art-direction` relief rule). No `src/procgen/archetypes/` model or `AnimTag` changes, keeping `npm run quality:fingerprint` byte-identical.
- **Reverse-offset `outgoingGroup` at `x = +panSpan`:** Building incoming Panel B at canonical `x = 0` and offsetting Panel A to `+panSpan` guarantees zero post-pan coordinate rebasing on live actors, badges, or room sockets once `outgoingGroup` is disposed at `1200 ms`, while `applyShake` and `StageOverlay` simply add `camPanX` to `CAM_HOME.x` and `LOOK_HOME.x`.
- **Keep `.st-card` live while moving card builders to `stage-overlay-cards.ts`:** `stage-overlay.ts` sits at 580/600 lines; extracting `card` and `tearText` alongside the new `captionBox` keeps `stage-overlay.ts` comfortably under the 600-line cap. Retaining `.st-card` for `GAME_ENDED` and boot `startRun` preserves Level 1 visual-audit boot behavior and ensures zero dead CSS classes under `check-deadcode.mjs`.
- **Dedicated `'transition'` `PauseReason` with `hideHud: false`:** Unlike `'card'` (which sets `hideHud: true` behind the opaque full-panel flip card), `'transition'` keeps `#hero-hud` and `#hud` visible over the smooth pan while blocking shell input, pausing the game/battle clock and storm, and keeping `restartFloor` disabled until landed.
- **Capture-phase `Enter` skip in `src/play/input.ts`:** Because `shell.setBlocked(true)` blurs `xterm` and suppresses `term.onData`, a capture `window.addEventListener('keydown', ...)` intercept during `hasReason('transition')` skips the animation cleanly without submitting a terminal command.
- **Socketed exit & entrance placement in `view.ts` without spec edits:** Anchoring exit directories to `EXIT_SOCKET_X` (`door.right`) and spawning unlocked `door:entry` (`door.serial`) at `ENTRY_SOCKET_X` (`door.left`) when `entryDoor` is true covers all chapters and Classic floors uniformly without editing `chapters/*/levels/*/level.spec.json` or the 4-place level vocabulary (keeping `door.ethernet` exclusive to level exits).

## Layers, Invariants & Verification Gates

- **Layers & ownership:** Zero new `src/<area>/` directories, zero edits to `scripts/quality/check-layers.mjs` or `vite.config.ts`, and every new file (`src/renderer/stage-{hero-turn,level-transition,overlay-cards}.ts`) belongs to `src/renderer/`, already owned by `artist` in `scripts/harness/agents-build.mjs`. Zero edits to `chapters/` specs or `src/chapters/generated/`.
- **Camera frame invariant:** `assertFrame(stage)` holds at every pan offset because `camera.position.x` and `LOOK_HOME.x` both shift by `camPanX` (`dir = (0, 0, +1)`).
- **Automated gates:**
  - `node scripts/quality/check-specs.mjs` and `npm run quality` (including `tsc --noEmit`, `check-layers.mjs`, `check-size.mjs`, `check-deadcode.mjs`, `quality:dup`, `quality:declarative`, `quality:agents`, `quality:props`).
  - `node scripts/harness/architecture-unit.mjs` (extended with `LEVEL_TRANSITION_TRANSITIONS` state reachability and `PlayLifecycle` `'transition'` derived-state assertions) and `node scripts/harness/classic-unit.mjs`.
  - `node scripts/harness/generate-chapter.mjs --verify` and `node scripts/harness/playthrough.mjs --ticks 3` (0 deaths, unchanged synchronous `exec()`).
  - `node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all` and `npm run quality:fingerprint` (byte-identical).
  - `node scripts/harness/terminal-lab.mjs --all` and `node scripts/harness/terminal-lab-unit.mjs`.
  - `ComicStage` self-check (`stage-selfcheck.ts`): full exit->pan->entry transition settle, 3D yaw restoration (`rotation.y === 0`), `reducedMotion` instant cut, `skipLevelTransition()` settle, and `ov.cards === 0`.
  - Visual browser QA (`qa`): real Chrome inspection of exit walk into `door.right`, cream `#efe6d2` gutter pan + `.st-caption-box`, walk-out from `door.left`, 3/4 hero turn, Enter skip, and `prefers-reduced-motion`.
