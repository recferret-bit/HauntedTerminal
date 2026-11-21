# Comix intro outro wiring: requirements

Status: done

Capability: The Comix page lists the intro and outro comixes as watchable tiles, and the opening comix plays when a player starts a new game (a chapter with no saved progress), once per save.

Current behaviour (proposed, from code; not yet verified in a browser): `src/play/outro.ts` `startRun` plays the `opening` comix at every run start unless `play.skipIntroPref` is set, and plays the `ending` comix when a run ends. The Comix page (`src/hub/comix-tiles.ts`) lists chapters and roadmap tiles only.

## Requirements

1. WHEN the Comix page renders, THE SYSTEM SHALL show one tile per comix whose manifest role is `opening` or `ending`, titled from its manifest, listed before the chapter tiles.
2. WHEN the player activates Watch on a comix tile, THE SYSTEM SHALL open `/cinematic.html?play=<slug>` for that comix.
3. THE SYSTEM SHALL keep both comix tiles watchable regardless of chapter progress.
4. WHEN a player enters a chapter that has no saved progress, THE SYSTEM SHALL play the `opening` comix before the first level.
5. WHEN a chapter has saved progress, THE SYSTEM SHALL NOT play the `opening` comix on entry.
6. WHILE a comix plays at new game, THE SYSTEM SHALL let the player skip it by key or click, only if the comix manifest skip policy allows it.
7. THE SYSTEM SHALL resolve comixes by manifest `role` and name no comix slug in engine code (`npm run quality:declarative`).

## Out of scope

- A "New game" button that wipes progress (asked, not chosen).
- Playing comixes inline in a modal on the Comix page.
- Locking the outro until the chapter is cleared.
- Changes to comix content (`comix/intro`, `comix/outro`) or a second chapter.

## Decisions

**Q1 (Comix page layout):** Two tiles with a Watch button opening `/cinematic.html?play=<slug>`. **A (user, 2026-05-17):** accepted the recommendation (A).
**Q2 (what is a new game):** First entry to a chapter with no saved progress. **A (user, 2026-05-17):** accepted the recommendation (A).
**Q3 (skip):** Skippable, as the manifest skip policy decides. **A (user, 2026-05-17):** accepted the recommendation (A).
**Q4 (repeat):** Plays once per save; the Comix page replays it. **A (user, 2026-05-17):** accepted the recommendation (A).
**Q5 (outro availability):** Both always watchable. **A (user, 2026-05-17):** accepted the recommendation (A).

## Open questions

(none)

## Verification

- R1, R2, R3: unit test in `scripts/harness/hub-unit.mjs` for the tile builder; `landing-smoke` in headless Chrome.
- R4, R5, R6: a play-flow check in headless Chrome on a fresh and a saved profile.
- R7: `npm run quality:declarative`; `npm run quality`.
