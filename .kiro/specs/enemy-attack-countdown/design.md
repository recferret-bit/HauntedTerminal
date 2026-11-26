# Enemy attack countdown: design

Status: done

- **Game** (`src/chapters/session-snapshot.ts` `markStrikeCountdowns`, after `buildRoom`; classic floors have no battle and so no badge): `RoomActor` (`src/contracts/room-view.ts`) gains `strikeIn?: number` (actions until the hit; 0 means told, the strike is the next enemy turn). The snapshot sets it for an enemy with `world.ticksToTell(e)` and `e.told`, only while the session says a battle is in its player phase. It reuses the lab's rule (`attackIn`) so both read one source.
- **Counting**: `ticksToTell` is "ticks until the tell"; the hit lands one tick later. `strikeIn = ticksToTell + 1`, or `0` when `e.told` (so "1 left" always shows as `!`, and a count is at least 2). Pinned by the unit check against the real damage event.
- **Contracts**: the new optional field only; no event or save change.
- **Stage** (`src/renderer/stage-sync.ts`, `stage-frame.ts`, `stage-overlay.ts`): `syncOverlays` copies `strikeIn` into the actor's `badge`; `stage.overlay.badge` draws a `.st-skull` element (text `☠` plus the number or `!`) above the HP pips, solid at `strikeIn <= 1`, otherwise pulsing with a stepped CSS animation (12 fps `steps()`), no transform bounce. Hidden through the existing `visible` flag, which already covers dead, hidden, petrified and exiting actors; frozen and held-fire are cleared in the game view (no `strikeIn`).
- **CSS**: one rule set in `src/styles/game.css` (red `#e8002b`, ink outline), reduced motion turns the pulse off.
- **Rejected**: counting in the renderer from `ENEMY_ATTACK` events (invents timing, wrong after a skipped intro); a HUD strip (user said badge only).
- **Gates**: see requirements Verification. Owners: `chapters-designer` (game, battle-unit, props), `artist`/`lead-dev` for renderer and CSS per `agents-build.mjs`; handed over in the report.
