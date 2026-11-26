# Flying bats: design

Status: see requirements.md

## Units

1. `src/renderer/bat-path.ts` (pure, no three, unit-testable): `cubicBezier(p0,p1,p2,p3,t)`, `easeInOutSine`/`easeInOutCubic`, `pickCornerPair(rng, bounds)` (random corner, outside the view by a margin, diagonal opposite), `makeFlock(rng, bounds)` returns 1-6 `BatFlight`s: `{ p0..p3, durationSec, scale, phase }`. Control points sit on the corner-to-corner line at 1/3 and 2/3, pushed sideways by a random bow (opposite signs sometimes, for an S). Each bat adds a per-bat offset to all four points so the flock spreads. Duration 2-3.5 s base, per-bat speed factor 0.75-1.25, scale 0.7-1.3.
2. `src/renderer/stage-bats.ts` (three): `BatFlock` state in a small table `{ nextIn, flights[] }` on the stage. `stepBats(stage, dt)`: counts `nextIn` down (20-60 s), spawns a flock, advances each flight `t += dt / duration`, positions the bat at `cubicBezier(eased(t))`, turns it to face its travel direction (mirror in x, small bank from the tangent), and on `t >= 1` removes it from `stage.world` and calls `disposeModel`. Pauses (no countdown, no advance) while `stage.stormPaused`. Skipped when `reducedMotion.on`.
3. Model: `buildModel(ModelCatalog 'prop.bat', { seed })` plus `createAnimator` (existing `swing` wing tags, wings flap faster for flight via the animator's speed). Materials are fed `uTime`/`uFlash` like other extras (`stage.extraComics`); removed on dispose.
4. Wiring: one call `stepBats(stage, dt)` in `stepStage` after `stepActors`. Bats live in `stage.world` at a z in front of actors (`ACTOR_Z - 0.4`) so they pass over the scene, with ink and cel from the comic material. Bounds come from `stage.panelBounds()` plus camera pan.
5. The `prop:bat` room prop stays as it is; the flying bats are separate scene objects, never actors, never in `RoomView`, so they cannot touch battles, turns or the timer.

## Decisions

- Pure path module so the maths is tested without WebGL; the stage file only moves objects.
- Own `stage.tweens` is not used for the flight: a flock is 1-6 long-lived objects driven by `dt` and by `stormPaused`, so a pause freezes them; `TweenManager` has no pause.
- No new dependency, no new layer, no new page: all under `src/renderer/`, so no layer rule change.

## Risks

- `stormPaused` must be true whenever the game is paused. Check `lifecycle.derive`; if it is not, add a dedicated flag in the same change.
- Visual QA: bats must read at game scale and stay inside the palette; the artist runs the storybook check.
