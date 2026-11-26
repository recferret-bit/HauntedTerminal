# Tutorial rework: requirements

Status: done (all tasks ticked and gates run 2026-11-22)

Capability: the tutorial level (level 1) opens in the dark. The vibecoder wakes with no lantern and only a faint glow around him, and he talks to himself in a dialog box with his avatar in the screen corner. About 8 seconds after his monologue, Kiro Ghost floats over and tells him to take the lantern. `ls` is blocked until he has it, so `mv` is the first command he learns. Once he holds the lantern, `ls` works and the rest of the level plays as it does today. A new indicator shows the items he carries, with the lantern on it once he has it.

User's words, 2026-11-21: "vibecoder wake on a fully dark place, barely visible light source from the character, he must talk with himself like what is going on, where am i. Add vibecoder dialog with his avatar on the left corner when he is talking. make vibecoder to be without the lantern. after vibecoder dialog, about 8 seconds kiro ghost moves to him and talk, he says take the lantern and move, this is part of our tutorial, so mv command will be first, ls is blocked. user take lantern and now could use ls. the rest is same. also, lets add indication of current items, and place lantern on it."

## Requirements

1. WHEN level 1 starts, THE SYSTEM SHALL show the room almost fully dark, with only a faint light source around the vibecoder, and the vibecoder SHALL carry no lantern (his hero model is the one without it).
2. WHEN level 1 starts, THE SYSTEM SHALL play a vibecoder monologue ("what is going on", "where am I") as dialog lines in a dialog box in the left corner of the screen, with his avatar beside the text.
3. WHEN the monologue ends, THE SYSTEM SHALL wait about 8 seconds of real time, then move Kiro Ghost to the vibecoder and play his dialog in the same box with his own avatar; the dialog SHALL tell the player to take the lantern and move.
4. WHILE the vibecoder does not hold the lantern in level 1, THE SYSTEM SHALL refuse `ls` with an in-world message that points to `mv` ("too dark to see"), and the tutorial SHALL teach `mv` first.
5. WHEN the player runs `mv lantern ~` in level 1, THE SYSTEM SHALL add `lantern` to his inventory, hold it in hand, light the stage with it and unlock `ls`.
6. THE SYSTEM SHALL show an items indicator in the HUD, always visible, with one slot for each of `lantern`, `terminal` and `laptop`: items he does not carry are dimmed and the held one is highlighted.
7. THE SYSTEM SHALL provide the dialog box as a generic chapter script step (speaker, avatar, text), usable by any level, with the four-place vocabulary change (types, interpreter, editor schema, pack check); the engine SHALL name no level.
8. THE SYSTEM SHALL start every level other than level 1 with the lantern in hand, and a direct jump to a later level SHALL grant it (`manifest.grants`).
9. THE SYSTEM SHALL keep the rest of level 1 as it is today (read the briefing, `ps`, `kill -9 1011`, `cd hub_uplink`), with 0 deaths in the headless solve.

## Out of scope

- A second chapter, new commands other than what the level needs, and changing levels 2 to 11 beyond the lantern start.
- Dropping or losing the lantern after taking it.
- Voice or sound for the dialog.

## Decisions

- **Q:** How does the player take the lantern?
  **A (user, 2026-11-21):** `mv lantern ~` (Recommended): the lantern is a file in the room, and moving it to `~` adds it to the inventory.
- **Q:** What does `ls` do before the lantern is taken?
  **A (user, 2026-11-21):** An in-world refusal ("too dark to see") that points to `mv` (Recommended).
- **Q:** Is the dialog box a generic tool?
  **A (user, 2026-11-21):** Yes: a generic script step with speaker, avatar and text, usable by any level (Recommended).
- **Q:** What does the items indicator show and where?
  **A (user, 2026-11-21):** A small always-visible HUD strip with a slot per item (lantern, terminal, laptop): not carried is dimmed, held is highlighted (Recommended).
- **Q:** Do the other levels keep starting with the lantern?
  **A (user, 2026-11-21):** Yes. Only level 1 starts without it; a direct jump to a later level grants it through `manifest.grants` (Recommended).
- **Q:** Who builds it?
  **A (user, 2026-11-21):** The Kiro Crew: `lead-dev` routes to `chapters-designer` (level and script), `artist` (dark lighting, avatars), `terminal-designer` (`ls` lock, `mv` of the lantern) and `qa`; code outside their paths is handed to its owner (proposed split accepted).
- **Q:** What is "about 8 seconds"?
  **A (user, 2026-11-21):** Real time after the monologue ends (accepted with the recommendations).

## Open questions

## Verification

- Req 1, 2, 3: a headless run of level 1 checks that `DIALOG_BOX` events fire at their `afterSec` ticks, in order, and that Kiro's spawn follows; the visual audit of the dark screen and a Chrome check by `qa` (avatar, left corner, glow).
- Req 4, 5: `generate-chapter.mjs --verify` with the new solution (`mv lantern ~` first), and a chapter property: `ls` is refused until `has_item lantern`, then works.
- Req 6: a unit check of the snapshot (`inventory`) and a Chrome check of the strip by `qa`.
- Req 7: `editor-unit-test.mjs` and `editor-smoke.mjs` (the schema forms), `terminal-lab-unit.mjs`, `npm run quality` (declarative gate: no level named in code).
- Req 8: `generate-chapter.mjs --verify` jumps to level 2 and checks that the lantern is held; the `gameplay` properties.
- Req 9: `--verify` (0 deaths) and `npm run quality:fingerprint` (byte-identical, no asset changes).

## Later changes

- **2026-11-24, `.kiro/specs/turn-based-battles/` (approved by the user):** combat is now turn based and real-time damage and Tactical Mode are gone. Req 3 still holds: `script.timed` keeps real seconds and is the only real-time clock besides the battle clock; it never makes an enemy act. Level 1 sets `safe`, so it has no battle. The QA findings about Tactical Mode (retest 2, finding 8) no longer apply.
- **2026-11-25, Chapter 1 pacing rework:** amended by `.kiro/specs/tutorial-kiro-delivers-terminal/`: Level 1 starts dark with `['manual', 'map']` only, Kiro delivers `terminal` at 25 s and teaches `ls` first (no `ls` lock on Level 1); the oil `lantern` pickup, its `ls`/`find`/`kiro` locks, and the `'lantern'` grant (`afterLevel: 3`) moved to Level 3 (`level-03-task-gpu-salvage`); `laptop` pickup (`afterLevel: 6`) unlocks `edit`/`sed` on Level 6 (`level-06-task-logic-purge`).
