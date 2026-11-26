# Tutorial rework: design

Approved by the user 2026-11-21.

## Pieces

New or changed files, grouped by the agent that owns them (`team-rules.md`).

```
chapters-designer   chapters/chapter-01-kiroween/chapter.manifest.json   startItems: ['terminal']; grants: { afterLevel: 1, items: ['lantern'] }
                    chapters/.../level-01-tutorial-awakening/level.spec.json   lantern pickup + file, timed script, ls lock, new tutorial steps, new solution
                    chapters/.../story/dialogs.json, LEVEL.md                   the monologue and Kiro's lines
                    src/chapters/types.ts, script-types.ts                      vocabulary (below)
                    src/chapters/script.ts                                      dialog_box step, timed entries, locks, has_item condition
                    src/chapters/session-flow.ts, session-state.ts              startItems/grants.items in applyInitialLoadout; a level tick counter in rt; timed entries fire in tick()
                    src/chapters/session-shell.ts                               command lock check before dispatch
                    src/chapters/session-fs.ts                                  collectPickupNode: the lantern pickup gives and holds the item
                    src/chapters/session-snapshot.ts                            snapshot.inventory, facts.dark
                    src/chapters/validate-pack.ts, src/chapter-editor/schema.ts the other two of the four places
                    src/game/bestiary.ts, src/game/inventory.ts                 PickupType 'lantern' (PICKUP_INFO), starterInventory(items)
                    scripts/harness/props/{chapters,gameplay}.mjs               properties follow the new behaviour
lead-dev            src/contracts/events.ts          DIALOG_BOX event; PICKUP_COLLECTED.item gains 'lantern'; ENTITY_SPAWNED.entrance
                    src/contracts/room-view.ts       SceneFacts.dark
                    src/game/types.ts                GameSnapshot.inventory { items, held }
                    src/play/                        wires the dialog box, the items strip and the portraits; paints the HUD from snapshot.inventory
                    src/styles/                      dialog box and items strip CSS
terminal-designer   src/ui/dialog-box.ts             the box in the left corner: avatar canvas, speaker name, text, hold time, queue
                    src/ui/items-strip.ts            the HUD strip: one slot per item
                    src/ui/hud.ts                    mounts the strip; pickup() accepts 'lantern'
                    src/terminal-lab/catalog.ts      PICKUP_FILES gains the lantern
artist              src/renderer/portrait.ts         drawPortrait(modelId, px): a canvas from the model's software raster (no new model)
                    src/renderer/stage-light.ts      the dim self-glow used while facts.dark
                    src/renderer/stage-event-cast.ts the 'glide' entrance of a script spawn (Kiro moves to him)
                    src/renderer/event-fx.ts         lantern pickup burst
qa                  docs/qa/<date>-tutorial-rework.md
```

## Decisions

- **The lantern is a pickup, not a new command.** Requirement 5 says `mv lantern ~`, and `collectPickupNode` already runs on `mv <pickup> ~`. A new `PickupType` `'lantern'` (model `item.lantern`, amount 1) reuses that path. It touches the exhaustive tables (`PICKUP_INFO`, `PICKUP_TYPES`, the `PICKUP_COLLECTED` event, the HUD pop, `PICKUP_FILES` in the Terminal Lab), so a missing entry fails `tsc`. The pickup entity reuses the existing `item.lantern` model: no new asset and `quality:fingerprint` stays identical.
- **Start items are chapter data.** `manifest.startItems` (default `['lantern', 'terminal']`, so other chapters are unchanged) and `ChapterGrant.items`. Chapter 1 starts with `['terminal']` held; a grant `{ afterLevel: 1, items: ['lantern'] }` gives the lantern to a player who jumps straight to level 2 or later (Req 8). No level is named in code. Vocabulary change in the four places: types, `applyInitialLoadout`, editor schema, pack check.
- **He holds the terminal, not an empty hand.** `vibecoder.dev_terminal` already exists, so level 1 needs no new hero model. The faint light "from the character" is the terminal's screen glow (requirement 1). This is an assumption to confirm at approval: the alternative is a new bare-handed hero model (an ASSET PCG task).
- **Darkness is a fact, not a light mode the player picks.** `SceneFacts.dark` is true while `lantern` is not in the inventory. The stage then uses a dim self-glow around the hero instead of the lantern pool: a tight radius, high darkness, no rays. It never changes the lantern, `ls -a` or any level where he carries the lantern (every other level, Req 8).
- **Time is game ticks.** The session already ticks once a second and ignores ticks while paused (title cards, intro). `script.timed` entries `{ afterSec, steps }` fire when the level's tick counter reaches `afterSec`. This keeps "about 8 seconds" inside the session, deterministic and headless-safe: `--verify` solves tick the same way and never waits for real time. Rejected: timers in `src/play`, which the headless gates cannot see.
- **The dialog box is one generic step.** `{ kind: 'dialog_box', speaker, text, holdSec? }`, `speaker` being `vibecoder` or a `ScriptAgent`. It emits `DIALOG_BOX { speaker, name, model, text, holdMs }`; the UI queues the boxes and draws the avatar from `model`. The monologue is several steps at different `afterSec`; Kiro's lines follow the same way. It also prints the line in the terminal so the headless transcript has it (like `say`).
- **Avatars are drawn, not authored.** `drawPortrait(modelId)` rasterises the model's head with the procgen software rasteriser into a small canvas in the palette (cached per model). The same function draws the item icons of the strip from `item.*` models. `src/ui` imports no three; `src/play` passes the function in.
- **The lock is data.** `script.locks: [{ command, until, message }]`: while `until` (a condition) is false, the command refuses with `message` and the tutorial points to `mv`. A new condition `{ kind: 'has_item', item }` serves both the lock and the tutorial step. The check runs in `session-shell` before dispatch, so `ls`, `ls -a` and `ls -la` are all covered, and no command name is special-cased in code.
- **Kiro "moves to him".** `spawn` gets `entrance?: 'appear' | 'glide'` (default `appear`, today's behaviour). `glide` makes the stage tween the actor in from the panel edge to its slot beside the hero. It is a renderer detail of `ENTITY_SPAWNED`.
- **The strip shows `inventory.items` from every snapshot.** `GameSnapshot.inventory` is new; the HUD redraws it on each paint, dims the slots he does not carry and marks the held one. `PICKUP_COLLECTED` for the lantern plays a short pop on its slot.
- **Input is never blocked by a dialog.** The player may type `mv lantern ~` at any moment. Kiro's timed entry carries the same text either way; if the player is faster, the line is still true ("take the lantern and move" reads as a reminder). Keeping the dialog non-blocking avoids a pause state in the headless session.
- **Tutorial steps.** Step 1 becomes `mv lantern ~` (done when the lantern is held), step 2 is `ls`, and steps 3 to 6 are today's steps (`mv` the RAM, `cat`, `ps`, `kill -9 1011`). The solution list starts with `mv lantern ~`, then `ls`.
- **Re-entering level 1.** The lantern stays in the inventory once taken, and the file is a pickup, so a reboot of the level puts it back and collecting it again changes nothing. A new run (`restart`) resets the inventory to `startItems`.

## Layers and gates

- No new `src/<area>/` or page. `src/renderer/portrait.ts` imports procgen only (allowed for the renderer). `src/ui` stays three-free. `check-layers.mjs` does not change.
- Vocabulary changes, each in the four places (types, interpreter, `src/chapter-editor/schema.ts`, `validate-pack.ts`): `dialog_box` step, `spawn.entrance`, `script.timed`, `script.locks`, `has_item` condition, `manifest.startItems`, `ChapterGrant.items`, pickup type `lantern`. `terminal-lab-unit.mjs` also runs, because the Terminal Lab reuses the editor field tables.
- The `PICKUP_COLLECTED.item` union grows, so every exhaustive `Record<PickupType, ...>` fails `tsc` until it has a lantern entry. That is intended.
- Gates: `npm run quality`, `node scripts/harness/generate-chapter.mjs --verify` (0 deaths), `node scripts/harness/editor-unit-test.mjs`, `node scripts/harness/editor-smoke.mjs`, `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/terminal-lab.mjs --all`, `node scripts/harness/property-tests.mjs`, `npm run quality:fingerprint` (must be byte-identical: no asset changes), and the visual audit report for the dark screen (`node scripts/harness/visual-audit.mjs`, flags explained, baselines not touched).

### Later amendment (2026-11-25, Chapter 1 pacing rework)

- See `.kiro/specs/tutorial-kiro-delivers-terminal/` and `.kiro/specs/inventory/items/{lantern,laptop}/`: Level 1 now focuses purely on receiving `terminal` and learning the shell (`ls`, `mv`, `cat`, `ps`, `kill -9`, `cd`), while `lantern` acquisition and the pitch-black `ls`/`find`/`kiro` lock moved to Level 3 (`afterLevel: 3`), and `laptop` acquisition (`edit`/`sed` lock) is introduced on Level 6 (`afterLevel: 6`).
