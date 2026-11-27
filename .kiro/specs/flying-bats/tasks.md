# Flying bats: tasks

Status: see requirements.md

- [x] 1. `src/renderer/bat-path.ts`: cubic Bézier, easing, corner pair, `makeFlock` (1-6 bats, size 0.7-1.3, speed +-25%, 2-3.5 s). _Req 1-4, 7_. Gates: `npm run quality` (types, size, dead code).
- [x] 2. Unit test in `scripts/harness/` (new `bat-path-unit.mjs`, or added to `architecture-unit.mjs`): endpoints equal p0/p3, t monotonic, start and end are opposite corners and outside bounds, group size always in 1..6, size and speed in range, deterministic with a seed. _Req 1-4_. Gate: that script.
- [x] 3. `src/renderer/stage-bats.ts` plus one call in `stepStage`: spawn timer 20-60 s, move, face travel, dispose at the end, pause on `stormPaused`, skip on reduced motion. _Req 5, 6, 7_. Gates: `npm run quality`, `node scripts/harness/battle-unit.mjs`, `node scripts/harness/generate-chapter.mjs --verify` (0 deaths unchanged).
- [ ] 4. (not done: the seeded 400-flock check in task 2 covers the invariants) Property in `scripts/harness/props/gameplay.mjs` or `comix`-style suite: for any seed the flock obeys the bounds above (non-vacuous). _Req 1-4_. Gate: `node scripts/harness/property-tests.mjs --only gameplay`.
- [ ] 5. (not needed: flap speed is set in `stage-bats.ts` via `FLAP_RATE`, the model is unchanged) Artist pass (delegated): wing-flap speed for flight on `prop.bat`, `validate-model.mjs --all --strict`, `check-tags.mjs --all`, storybook screenshot, `quality:fingerprint` diff explained. _Req 5_.
- [x] 6. Visual check in Chrome on the play page (screenshot with a forced flock) and docs: one line in `tech.md`. _All_. Gates: `npm run quality`, `npm run build`.
