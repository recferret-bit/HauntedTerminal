# Flying bats: requirements

Status: requirements-approved

Capability: Bats fly across the 3D comic stage at random intervals, in groups of 1 to 6. Each group crosses from one corner to the diagonally opposite corner (random corner, so random direction) along a smooth cubic Bézier path driven by easing tweens. The flight is fast; each bat differs a little in size and speed.

## Requirements (proposed, awaiting approval)

1. WHEN the random flock timer elapses, THE SYSTEM SHALL spawn a flock of 1 to 6 bats.
2. THE SYSTEM SHALL start each flock just outside a random corner of the stage view and end it just outside the diagonally opposite corner.
3. THE SYSTEM SHALL move every bat along a cubic Bézier path whose control points are randomised, with an easing tween along the path parameter.
4. THE SYSTEM SHALL give each bat its own size and speed within the configured ranges, and a small path offset so the flock spreads.
5. THE SYSTEM SHALL draw each bat as the live 3D model with its own animation tags, inside the 3D stage.
6. WHEN a bat finishes its path, THE SYSTEM SHALL remove it and free its resources.
7. WHILE the game is paused, THE SYSTEM SHALL pause the timer and every flight.
8. THE SYSTEM SHALL implement the Bézier and easing as a pure helper with no new dependency.

## Out of scope

- Landing pages, DOM/canvas overlay, sprite rendering.
- Tween libraries (GSAP etc.).

## Decisions

**Q1 (where):** **A (user, 2026-11-27):** B, inside the 3D comic stage as scene objects.
**Q2 (drawing):** **A (user, 2026-11-27):** B, the 3D model live with animation tags.
**Q3 (when):** **A (user, 2026-11-27):** A, random intervals of 20-60 s, paused with the game.
**Q4 (path):** **A (user, 2026-11-27):** A, outside one random corner to outside the opposite corner, randomised Bézier bow, per-bat offset.
**Q5 (tween):** **A (user, 2026-11-27):** A, own pure cubic Bézier + easing helper.
**Q6 (timing, size):** **A (user, 2026-11-27):** Accepted: 2-3.5 s per bat, size 0.7-1.3x, speed +-25%.
**Q7 (interaction, sound):** **A (user, 2026-11-27):** Accepted: none, decoration only.
**Q8 (model):** **A (user, 2026-11-27):** Accepted: wing-flap tags on a flying variant of prop.bat (artist pass).
**Q9 (screens):** **A (user, 2026-11-27):** Accepted: play stage only.

**Q10 (battles):** **A (user, 2026-11-27):** Yes, bats also fly during battles; decoration only, paused with the game, no effect on turns or the timer.

## Open questions

(none)

## Verification

- Unit test of the Bézier/easing helper (endpoints, monotonic t, corner pairing, group size 1-6), model validator and tag check for the bat, `npm run quality`.
