# Chapter editor stage studio: requirements

Status: done (implemented and verified 2026-11-27)

Capability: Turn `/editor` (the Chapter Editor) into a terminal-free interactive 3D Stage Studio where the 3D scene fills the entire preview viewport, all HUD chrome can be toggled cleanly, dialogs can be replayed from scratch or triggered individually, enemies/pickups/props/ports can be added persistently or spawned transiently, subdirectories can be previewed, and any stage actor can be clicked and dragged (plus scaled and rotated) directly on the 3D canvas so clicking Save persists updated positions, transforms, and spawned objects to `chapters/<slug>/` JSON configs and recompiles `src/chapters/generated/`.

## Requirements

1. **Terminal Removal & 100%-Height 3D Viewport.** WHEN `/editor` loads a level preview (`?editor=1`), THE SYSTEM SHALL hide `#terminal-dock` inside the preview iframe, skip terminal boot/focus transitions, and expand `#stage-wrapper` (`ComicStage`) to fill 100% of the preview viewport height, WHILE removing the bottom terminal command input bar from `/editor` and keeping `Open in Lab` and `Check`-tab solution walkthrough controls available (leaving normal `/play` and `/terminal-lab` terminals completely unchanged).

2. **HUD Chrome Toggle (`👁 HUD`).** WHEN the author clicks the Stage Bar HUD toggle (`👁 HUD`) in `/editor`, THE SYSTEM SHALL hide or show all in-game HUD chrome (`#topbar`, `#hud`, `#sandbox-toggle-btn`, `.skip-dialog-btn`, `.battle-callout`, `#outro`) via a dedicated `body.editor-hud-off` override that survives session pause/sync cycles, WHILE keeping triggered speech bubbles, `DialogBox` cards, `TutorialCard` cards, and on-stage FX lettering visible.

3. **Hidden & Subdirectory Object Inspection (`👻 Hidden`, `📁 Room`, `⏸ AI`).** WHEN the author toggles `👻 Hidden`, selects a room directory in `📁 Room (cwd)`, or toggles `⏸ AI`, THE SYSTEM SHALL render `appearWhen`-gated pickups, `tutorial.hide` enemies, and pre-spawn Kiro actors transparently (`alpha: 0.55`) in preview, switch the preview room `cwd` in place to inspect subdirectory actors/props, and pause enemy combat AI ticks by default (toggleable) so staging is never interrupted.

4. **Direct 3D Canvas Selection & Bidirectional Inspector Sync.** WHEN the author clicks a 3D actor (`prop`, `pickup`, `enemy`, `boss`, `door`, `file`, `socket`, `vibecoder`, `kiro`, `boss:cameo`) inside `/editor`'s preview stage, THE SYSTEM SHALL project its 3D bounds into a selection overlay box with its label and coordinates, fire `StageEditorApi.onSelect`, select the corresponding entry in `ChapterModel`, and highlight/reveal its form row in the right Inspector (and clicking a row in the Inspector highlights the actor on stage). Clicking empty room background SHALL clear selection.

5. **2D Mouse Drag & Corner Scale / Rotate Handles -> Draft JSON & Real Save.** WHEN the author drags a selected actor on the 3D stage or drags the selection box corner scale (`⤡`) or top rotation (`⟳`) handle, THE SYSTEM SHALL move the actor smoothly in `(x, y)` (with grab-offset preservation, smart floor snap when `|y| < 0.12` unless `Alt` is held, `Shift` axis lock, and automatic `socket` detach when dragging a socket-bound actor) or update its `scale`/`rotation`, map those changes back onto the exact field in `ChapterModel` (`level.spec.json` or `chapter.manifest.json`, upgrading numeric `stage.hero` to `{ x, ... }` when needed), mark the file dirty without interrupting drag, and persist the canonical JSON to disk (`stringifyChapterJson` + `src/chapters/generated/` recompile) when the author clicks Save (`Save file`, `Save all`, or `Ctrl/Cmd+S`).

6. **Dialog Runner (`💬 All Dialogs`, `⏭ Next Beat`, `■ Stop`, `🎯 Specific Dialog`).** WHEN the author clicks `💬 All Dialogs` or selects an entry from the Specific Dialog picker and clicks `▶ Run Dialog`, THE SYSTEM SHALL respectively replay the level's full narrative sequence from scratch (`dialogs.json` banner -> `script.arrival` -> `script.timed` with compressed beat waits -> `agentTaunt` -> `tutorial` steps -> `completion`, steppable with `⏭ Next Beat` and cancellable with `■ Stop`) or clear active dialogs and play the chosen arrival/timed/trigger/`onBossKill` step, `dialogs.json` entry, tutorial step, or socket riddle prompt/hint/success immediately on the live stage.

7. **Level Object Spawning (`+ Add to Level`) & Live Sandbox Tools (`⚡ Test Enemy`, `💀 Kill Enemies`, `↻ Restart`).** WHEN the author chooses an Enemy, Pickup, Stage Prop, Subdir Door, or Socket in `+ Add to Level`, THE SYSTEM SHALL insert the new entry (plus any backing `files[]` VFS node) into the draft `level.spec.json` in the active `cwd`, sync the stage in place without reloading, and select it for dragging and saving; AND WHEN the author clicks `⚡ Test Enemy`, `💀 Kill Enemies`, or `↻ Restart`, THE SYSTEM SHALL inject a transient preview enemy without dirtying JSON, neutralize live enemies on stage, or reset the active level cleanly in place.

## Out of scope

- Multi-select lasso/marquee or 3D Z-depth drag gizmos (`zOrder` remains editable in the Inspector alongside numeric/tuple `scale` and `rotation`).
- Adding new `level.spec.json` or `chapter.manifest.json` schema fields beyond existing declarative transform/stage fields.
- Removing terminals from `/play` gameplay or `/terminal-lab`.

## Decisions

- **Q1:** How should the terminal be removed in the Chapter Editor (`/editor`)?
  **A (user, 2026-11-27):** Remove both terminal surfaces: hide `#terminal-dock` inside `/editor`'s preview iframe (100% 3D stage height) and replace the bottom command input with the new Stage Controls bar + Event Log (keep walkthrough/solve in Check or compact controls, and Open in Lab for terminal testing).
- **Q2:** How should mouse selection and dragging behave on the 3D stage?
  **A (user, 2026-11-27):** Free 2D `(x, y)` mouse drag with smart floor snap (`|y| < 0.12` snaps to floor `y = 0`, `Shift` locks axis, dragging a socket-bound actor detaches `socket` so `x`/`y` apply), plus optional scale/rotate handles on the selection box; updates the draft JSON live so Save writes real config files.
- **Q3:** How should "run all dialogs from scratch" and "run specific dialog" work?
  **A (user, 2026-11-27):** Add "Run All Dialogs" (replays full level arrival -> opening timed steps -> taunt -> completion from scratch, with Next Beat / Stop and compressed wait gaps) plus a "Run Dialog" picker listing every arrival/timed/trigger step, `dialogs.json` entry (taunt, 3 hints, completion), and socket riddle.
- **Q4:** How should "spawn enemy, etc." work in the Chapter Editor?
  **A (user, 2026-11-27):** Include both `+ Add to Level` (spawns Enemy, Pickup, or Prop into the draft JSON at stage center, ready to drag & Save) AND live stage test tools (sandbox Spawn Test Enemy without dirtying JSON, Kill Enemies, Trigger FX/SFX, Pause AI, and a Room `cwd` switcher to edit subdirectories).
- **Q5:** What should Hide/Show HUD toggle, and how should we proceed with the Kiro spec gates?
  **A (user, 2026-11-27):** Toggle all HUD chrome (`#topbar`, stats/inventory `#hud`, `F2` button, skip/battle banners) while keeping triggered dialog bubbles visible — and treat these answers as approval of requirements, design, and tasks to spec & implement end-to-end now.

## Open questions

(none)

## Verification

- `npm run quality` (`tsc`, `quality:deps`, `quality:lint`, `quality:root`, `quality:size`, `quality:layers`, `quality:cycles`, `quality:deadcode`, `quality:declarative`, `quality:specs`, `jscpd`, `quality:agents`, `quality:brands`, `quality:mcp`, `quality:props`)
- `npm run test` & `npm run build`
- `node scripts/harness/editor-unit-test.mjs` (`unplaceX`/`unplaceY` round-trips, `actor-mutator` mapping/patching/`+ Add to Level`, `dialog-runner` catalog)
- `node scripts/harness/editor-smoke.mjs` & `node scripts/harness/editor-smoke.mjs --width 1280 --height 820` (terminal-free iframe height, HUD toggle, dialog runner replay & single dialog, sandbox spawn/kill/restart, `+ Add to Level`, pointer drag -> draft update -> real disk Save & restore)
- `node scripts/harness/terminal-lab-unit.mjs && node scripts/harness/terminal-lab-smoke.mjs && node scripts/harness/comix-editor-smoke.mjs && node scripts/harness/play-browser.mjs --nointro`
