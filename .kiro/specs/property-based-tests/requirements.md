# Property-based tests: requirements

Status: done (requirements, design and tasks approved by the user 2026-11-17; all tasks done and gates run 2026-11-17)

Capability: property-based tests that generate many random inputs and check that invariants hold for each major feature of Out Of Credits: the terminal, the laptop, comix, chapters and gameplay elements.

## Requirements

1. WHEN `npm run quality` runs, THE SYSTEM SHALL run `scripts/harness/property-tests.mjs`, which loads the TypeScript sources through Vite SSR and checks properties with fast-check 4.10.2 (pinned exactly, a devDependency).
2. THE SYSTEM SHALL use a fixed seed and 100 runs per property by default; `--seed <n>` and `--runs <n>` SHALL override them, and `--only <feature>` SHALL run one feature.
3. IF a property fails, THEN THE SYSTEM SHALL print the feature, the property, the shrunk counterexample and the seed, and exit 1.
4. THE SYSTEM SHALL check at least these properties per feature (the design may add more):
   - **Terminal:** the shell never throws on any input line; `cp a b` then `cat b` prints what `cat a` prints; `mv a b` keeps the content and removes `a`; after `chmod <mode> f`, `ls -l f` shows that mode; after `rm f`, `ls` never lists `f`.
   - **Laptop:** the lifecycle state machine only reaches defined states for any event sequence; the desktop reducer keeps window ids unique; the loop guard leaves loop-free code unchanged and guarded code still parses; saved progress parses any string without throwing.
   - **Comix:** random valid pages simulate without errors; the canonical JSON writer round-trips (parse, write, parse gives the same value); cue expressions resolve to finite times.
   - **Chapters:** random command sequences never throw in a chapter session; the same commands give the same transcript (determinism); the canonical JSON writer round-trips; `checkPack` never throws on a mutated pack.
   - **Gameplay elements:** HP stays between 0 and max; an enemy killed stays dead; a pickup is collected at most once; the inventory holds only items it was given and `hold` only takes one of them; a door opens only when its win rules hold; `kiro load` without the needed cores never loads a model.
5. THE SYSTEM SHALL keep the whole suite under 60 s on the development machine with the default runs.
6. WHEN a property finds a bug whose correct behaviour is clear, THE SYSTEM SHALL fix it in the same task and keep the counterexample as a fixed regression case; IF the correct behaviour is unclear, THEN the work SHALL stop and ask the user.
7. `npm run quality:fingerprint` SHALL stay byte-identical unless a fix changes an asset, which is then explained.

8. THE SYSTEM SHALL run the terminal properties on both shells (the chapter shell and the classic shell), so that "two shells, one behaviour" is checked.
9. THE SYSTEM SHALL keep the "never crashes" properties honest: for each checker that wraps its work, a separate property SHALL assert that a set of realistic breakages is reported as a specific error (not only as "malformed spec"), and a guard property SHALL fail when random play stops reaching kills, pickups, enemy attacks and level changes.
10. A property file SHALL be owned by the designer of its feature, so that designer can add regression examples; each regression example SHALL name its corruption by key path, not by index.

## Out of scope

- Replacing the existing example-based suites.

## Decisions

- **Q:** Which features?
  **A (user, 2026-11-17):** Each major feature: terminal, laptop, comix, chapters, gameplay elements.

- **Q5:** Which runner, and is it a gate?
  **A (user, 2026-11-17):** fast-check 4.10.2 pinned exactly, no new test runner; one Node harness `scripts/harness/property-tests.mjs` loading TypeScript through Vite SSR like `laptop-unit.mjs`; fixed seed; part of `npm run quality`.

- **Q9:** What counts as "gameplay elements"?
  **A (user, 2026-11-17):** All five: enemies and combat, pickups, inventory and `hold`, doors and win rules, Kiro cores (`kiro load`).
- **Q10:** Seed policy and found bugs?
  **A (user, 2026-11-17):** Fixed seed, 100 runs per property in the gate, `--seed` and `--runs` to explore; failures print the shrunk counterexample and seed. Clear-behaviour bugs are fixed in the same task with the counterexample kept as a regression case; unclear ones stop and ask.

- **Q12:** Close the open behaviour questions found by the first run, and act on the independent review.
  **A (user delegated, 2026-11-17):** "Use your recommendations." Applied as: `sed` with an empty pattern is refused like GNU sed (both shells); `cp` of an unreadable file fails (chapter shell, matching the classic shell); the properties above (requirements 8-10) replace the vacuous ones; hub `kiro load` is checked against the level's `coreAliases`, and the win rule now honours them (a real bug the new property found).

## Open questions


## Verification

- Req 1-5: `node scripts/harness/property-tests.mjs` and `npm run quality` pass; the run time is printed.
- Req 3-4: one planted bug per feature (reverted, not committed) makes its property fail and print a counterexample.
- Req 6: every fixed bug has a regression case in the suite and a line in `tasks.md`.
- Req 7: `npm run quality:fingerprint` before and after.

## Later changes

- **2026-11-24, `.kiro/specs/turn-based-battles/` (approved by the user):** the gameplay properties now also cover battles (the phase between calls is idle, intro or player; enemy damage only inside an enemy turn; the player has the first turn; an empty line changes nothing), and the generator guard requires battles and enemy turns. `tick()` steps only the clock (`script.timed`, the battle intro and turn timer); enemies move on commands and enemy turns.
- **2026-11-26 (from code; user to confirm):** the runner refuses an `fc.asyncProperty` or an async `check()`, because its failure would be read as a pass, fails an `fc.property` whose predicate is `async` with that cause (no unhandled rejection), and proves all three with a self-check at startup (`runnerSelfCheck` in `scripts/harness/props/kit.mjs`, exit 1 if it fails); an `--only` that selects no feature (e.g. `--only ,`) prints the usage and exits 2; the default run now checks 81 properties (terminal 26, laptop 6, comix 5, chapters 17, gameplay 27).
- **2026-11-26, commit 1905207 (from code; user to confirm, see `.kiro/specs/architecture-hardening/`):** the default run now checks 87 properties (terminal 29, laptop 6, comix 5, chapters 17, gameplay 30; `node scripts/harness/property-tests.mjs --list`). The 81 above was added by the same commit and was already out of date there. Terminal properties added by that commit include: classic and chapter shells agree on the unix applets, `reverseLines` is an involution, `applyChmodMode` clauses, the UI transition tables and the dialog orchestrator caps; gameplay properties added by it include `BATTLE_TRANSITIONS`, `AppBus` order and its 200-entry cap, `PlayEventBus` delivery.
