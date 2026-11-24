# Dialog box sides and animated avatars: design

Approved by the user 2026-11-24.

## Pieces

```
artist              src/renderer/portrait.ts         IDLE_POSES (t, yaw, pitch, lookX; zero roll/dy/talkScaleY), strict HEAD_PART_RX neck-pivot selection on headCrop models, vertical y-bob suppression in posePart so heads/ghosts never jump inside the 64x64 frame
                    src/renderer/stage-cameos.ts     deleted (merged into .dialog-box + DialogOrchestrator)
                    src/renderer/stage-overlay.ts    remove cameoLayer; collectObstacles avoids open .dialog-box.open
                    src/renderer/stage-overlay.css   remove .st-cameo styles
                    src/renderer/stage-event-cast.ts remove AGENT_TAUNT handling and TUTORIAL_STEP cameo enqueue (keep hero hop on done)
                    src/renderer/comic-stage.ts      remove CameoDirector field, warm(), debugState().cameos
                    src/renderer/stage-frame.ts      remove stage.cameos.update(dt)
                    src/renderer/stage-layout.ts     remove stage.cameos.clear()
                    src/renderer/stage-selfcheck.ts  remove cameos checks
terminal-designer   src/ui/dialog-box.ts             DialogPriority, DialogMood, DialogBoxOptions (onOpen, onClose, canStartLine), activeLine/activeSide/shortenHold/dismissSide/wake, calm HEAD_FRAME_MS = 180, mood-<mood> class
                    src/ui/dialog-orchestrator.ts  DialogOrchestrator: single ordered conversation queue uniting DIALOG_BOX and AGENT_TAUNT, priority preemption, duplicate suppression, chatter cap, .hint-note mutual exclusion, socket dialogue yield, TUTORIAL_STEP pass-through
                    src/ui/hud.ts                    hideHint() and onHintShow callback for right-side exclusivity
lead-dev            src/play/state.ts                Play.dialogs: DialogOrchestrator | null
                    src/play/input.ts                mountDialogOrchestrator wired with tutorial and hud.hideHint(); mountHud wired with onHintShow
                    src/play/loop.ts                 route DIALOG_BOX, AGENT_TAUNT, TUTORIAL_STEP, OBSTACLE_DIALOGUE_RENDERED, PUZZLE_DOOR_RESOLVED, ROOM_TRANSITION, FLOOR_ENTERED through play.dialogs
                    src/editor-core/play-frame.ts    include DIALOG_BOX in talk-event highlighting
                    src/styles/dialog.css            remove canvas frame translate/rotate/scale transforms; add mood accent border rules
                    .kiro/steering/glossary.md       update "Dialog box" definition
qa                  scripts/harness/terminal-lab-unit.mjs  unit/DOM tests for calm idle portraits, DialogBox lifecycle, and DialogOrchestrator invariants
```

## Decisions

- **Retire `CameoDirector` (`.st-cameo`) and unify all character/agent corner dialogs in `DialogBox`.** `AGENT_TAUNT` events are converted by `DialogOrchestrator` into `DialogLine` items (with `AGENTS[ev.agent].name`, `AGENT_MODELS[ev.agent]`, stripped speaker prefix, and mood class) and played in `.dialog-box`. Follows Decision 4 in `requirements.md`.
- **Calm idle-only 3D head portraits.** `src/renderer/portrait.ts` eliminates `roll`, vertical `dy`, and `talkScaleY` from `HEAD_POSES` (now `IDLE_POSES` with subtle `yaw`, `pitch`, and horizontal `lookX` gaze shift), suppresses vertical `y`-axis `bob` `AnimTag`s on main bodies/heads while keeping `breathe`/`blink`/`orbit`/`pulse` and damped `jitter`, and locks `headCrop` target selection strictly to `HEAD_PART_RX` parts (e.g., `hood`, `face`, `hair`, `eye.*`) so `vibecoder`'s torso/arms/held item never shift. `src/styles/dialog.css` deletes all `.dialog-avatar[data-frame] canvas` CSS transforms. Follows Decision 5 in `requirements.md`.
- **Single ordered queue and strict right-side exclusivity in `DialogOrchestrator`.** `src/ui/dialog-orchestrator.ts` guarantees `maxConcurrent <= 1` and `maxRightConcurrent <= 1` across `DIALOG_BOX` (`priority: 'script'`) and `AGENT_TAUNT` (`'prompt'` for `kiro` or `mood === 'order'`, `'chatter'` otherwise). New `'script'` or `'prompt'` lines strip queued `'chatter'` and shorten active `'chatter'` (`shortenHold(320)`). `TUTORIAL_STEP` only updates `#tutorial-card` at bottom-right. Opening a right-side `.dialog-box` calls `hud.hideHint()`, and clicking `? Hint` calls `dialogs.onHintOpened()` which dismisses right-side dialogs. While `OBSTACLE_DIALOGUE_RENDERED` is open, `'chatter'` waits in the queue until `PUZZLE_DOOR_RESOLVED`, `ROOM_TRANSITION`, or `FLOOR_ENTERED`. Follows Decisions 6, 7, and 8 in `requirements.md`.

## Layers and gates

- No new `src/<area>/` or `pages/*.html`; `scripts/quality/check-layers.mjs` requires no changes (`src/ui/` stays Three-free; `src/play/` injects `drawPortrait`).
- No chapter or comix vocabulary change.
- `npm run quality:fingerprint` remains byte-identical because `src/procgen/` specs are unchanged.
- Gates: `node scripts/quality/check-specs.mjs`, `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/generate-chapter.mjs --verify`, `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`, `node scripts/harness/editor-unit-test.mjs`, `npm run quality:fingerprint`, `npm run quality`, and `npm run build`.
