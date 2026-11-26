# Random pids: requirements

Status: done

Capability: every PID the player has to `kill` is random each time instead of fixed in the level spec. (User's words: "lets make all pids to kill to be random each time".)

## Requirements

1. WHEN a level loads (first entry, retry or restart), THE SYSTEM SHALL give every enemy that has a `pid` in its level spec, except PID 1, a new random PID, unique within that level and in the range 1100-8899.
2. THE SYSTEM SHALL show, signal and match each enemy only by its random PID (`ps`, `kill`, `pkill`, `top`, the stage's PID tags and the field manual's examples), and `kill` of the old spec PID SHALL answer `No such process`.
3. THE SYSTEM SHALL keep PID 1 (the boss), `777` (`kiro.d`) and `4242` (the player's shell) fixed, with their protections unchanged.
4. WHERE a spec string (summary, description, dialog, hint, tutorial prompt or command, `solutionCommands`) names an enemy's PID, THE SYSTEM SHALL write it as the placeholder `{pid:<enemy id>}` and replace it with that enemy's current PID when the string is shown or run.
5. WHEN the headless solver runs a level's `solutionCommands`, THE SYSTEM SHALL resolve each `{pid:<enemy id>}` from the session it runs in, so every level still clears with 0 deaths for any random PIDs.
6. IF a spec uses `{pid:<id>}` for an enemy id that does not exist or has no `pid`, THEN THE SYSTEM SHALL fail the pack check (`validate-pack.ts`) and the chapter editor's check with the string and the id.
7. THE SYSTEM SHALL remove the PID shuffle of chaos mode (`?chaos=1`); chaos mode keeps its other effects.
8. THE SYSTEM SHALL keep the spec `pid` field as the "this enemy has a PID" marker; its number no longer reaches the player.

## Out of scope

- Changing which enemies exist, or any enemy's behavior; only the PID number changes.
- Randomizing `ppid`, port numbers or any other number.
- A second chapter or new levels.

## Decisions

**Q (round 1, last question):** Should the random PIDs be unique across the level and in a realistic range, such as 1100-8899 like chaos mode?
**A (user, 2026-11-26):** "yes" (the one yes/no question of the round).

**Q (round 1):** the five questions on when the PID is picked, which PIDs, how text names them, how the solver copes, and chaos mode.
**A (user, 2026-11-26):** "i approve", given to my "say 'recommended on all' or pick letters". Recorded as the recommended option of each: (1) A, a new PID on every level load; (2) A, every enemy `pid` except the boss PID 1; (3) A, `{pid:<enemy id>}` placeholder; (4) A, placeholder in `solutionCommands` resolved from the session; (5) A, remove chaos mode's PID shuffle. I kept 777 and 4242 fixed because they are protected system PIDs, not PIDs to kill (requirement 3); say so if you meant otherwise.

Context found in code (not decisions): chaos mode (`?chaos=1`) already shuffles enemy PIDs from a seed in `src/chapters/session-level.ts` (`levelSpawns`), PID 1 is exempt; the specs, tutorial prompts, dialogs and `solutionCommands` hard-code `1011`, `2104`, `4108`; `session-proc.ts` special-cases PIDs 777 and 4242.

## Open questions

(none: all five answered 2026-11-26; see Decisions.)

## Verification

- 1, 2, 3: a unit check in `scripts/harness/` plus a gameplay property (`property-tests.mjs --only gameplay`, `chapters`): over many seeds PIDs are unique, in range, and `ps`/`kill` agree.
- 4, 5: `node scripts/harness/generate-chapter.mjs --verify` and `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs` (0 deaths).
- 6: `node scripts/harness/editor-unit-test.mjs` (a bad placeholder is reported).
- 7: `node scripts/harness/terminal-lab-unit.mjs`, `npm run quality`.
