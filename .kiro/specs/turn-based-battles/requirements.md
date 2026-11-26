# Turn based battles: requirements

Status: done (requirements, design and tasks approved by the user 2026-11-24; all tasks done and gates run 2026-11-24)

Capability: real-time damage is removed; combat is turn based only, with no switch. A battle starts when the hero is in a room with a live enemy that can hurt him, with a clear visual signal: one random agent of the big four (Clod, Gork, Codec, Anti-Gravy) appears and taunts the vibecoder, then the Kiro ghost gives a quick piece of advice, then the battle begins. The player always acts first. One battle orchestrator owns a state machine that says who is acting now; a battle may have several enemies. Every line the player types and sends with Enter is one action, correct or not. Each player turn has a 30-second timer; when it runs out, the enemies take their turn anyway. Tactical Mode is removed as a concept: there is one mode.

## Requirements

### Mode

1. THE SYSTEM SHALL have no real-time enemy damage: an enemy acts on the hero only during an enemy turn of a battle.
2. THE SYSTEM SHALL have no Tactical Mode: the HUD button `#hud-tactical`, the `tactical` command, the `?tactical=1` URL flag, the chapters-page "Launch in Tactical Mode" checkbox, the `TACTICAL` HUD shortcut and status text, and the manual and Terminal Lab entries are removed.

### Battle orchestrator

3. THE SYSTEM SHALL drive every battle through one battle orchestrator in `src/game/` (three-free) whose state machine names the actor of the current phase: `idle` (no battle), `intro`, `player`, `enemy`, back to `player`, and `idle` when the battle ends.
4. WHEN the hero is in a room with at least one live enemy that can hurt him (not dead, frozen or petrified, and not held by `holdEnemiesUntil` or `safe`), THE SYSTEM SHALL begin a battle.
5. WHEN no such enemy is left in the hero's room, or the hero leaves the room, THE SYSTEM SHALL end the battle; WHEN he comes back to a room with such an enemy, THE SYSTEM SHALL begin a new battle.
6. THE SYSTEM SHALL support a battle against several enemies at once.
7. THE SYSTEM SHALL use the orchestrator in the chapter session, and so in play, the chapter-editor preview and the Terminal Lab; in the lab, damage stays absorbed and the manual clock's Tick forces the enemy turn.
8. THE SYSTEM SHALL remove real-time damage from the classic floors session as well (one world step per command), without the battle intro.

### Battle intro

9. WHEN a battle begins, THE SYSTEM SHALL play a battle intro of about 10 seconds before every battle: an agent of the big four (Clod, Gork, Codec, Anti-Gravy) appears in the right-side dialog box with its `agent.<name>` portrait and taunts the vibecoder; then the Kiro ghost (`npc.kiro_ghost` portrait) gives one short advice line for the enemies present; then a "FIGHT!" banner plays with the new `fx.fight` effect.
10. THE SYSTEM SHALL choose the agent at random, seeded by the level and the battle number, so the same run picks the same agents.
11. THE SYSTEM SHALL take the taunts (a pool per agent) and the advice (one line per enemy type, from the bestiary weaknesses) from a code table in `src/game/agents.ts`; level specs gain no battle text.
12. WHILE the battle intro plays, WHEN the player presses Enter, THE SYSTEM SHALL skip to the battle start; text typed during the intro SHALL stay on the prompt and SHALL NOT run.

### Turns

13. WHEN a battle begins, THE SYSTEM SHALL give the first turn to the player.
14. WHILE it is the player's turn, THE SYSTEM SHALL count every non-empty line the player sends with Enter as one player action, whether the command succeeds or fails, and SHALL then run the enemy turn.
15. IF the player sends an empty line, THEN THE SYSTEM SHALL NOT count it as an action.
16. WHEN the player's turn begins, THE SYSTEM SHALL start a turn timer of 30 seconds (a fixed constant in the orchestrator); IF it runs out before the player acts, THEN THE SYSTEM SHALL end the player's turn and run the enemy turn.
17. WHILE the game is paused, the battle intro plays, the `edit` mini-editor is open or the laptop is open, THE SYSTEM SHALL pause the turn timer; it SHALL keep running while a dialog box shows.
18. WHEN an enemy turn runs, THE SYSTEM SHALL advance every enemy in the battle by one step of its existing pattern (tell an attack, or land the one it told), keeping today's cadence, damage and animations.
19. WHEN an enemy turn has several enemies acting, THE SYSTEM SHALL resolve all of them at once in the game and the stage SHALL play their actions one after another, about 0.4 s apart, in room order.
20. WHILE a battle runs, THE SYSTEM SHALL show a turn indicator on the hero HUD card: `YOUR TURN` with the seconds left, or `ENEMY TURN`.

### Clocks

21. THE SYSTEM SHALL advance the world (enemy passives, quest file restore, Kiro crack progress) one step per player command and one step per enemy turn forced by a timer runout, never in real time.
22. THE SYSTEM SHALL keep a real-time clock for `script.timed` entries only (`afterSec` stays seconds, paused with the game); it SHALL never make an enemy act.

### Solver and gates

23. WHEN the headless solver plays a solution, THE SYSTEM SHALL play each command as one player action followed by one enemy turn, add `--ticks N` minus 1 forced timer runouts between commands, and skip the battle intro as if Enter were pressed.
24. THE SYSTEM SHALL keep every level of the chapter solvable headlessly with 0 deaths.
25. WHEN this capability ships, THE SYSTEM's other Kiro specs, steering, skills and docs that describe real-time ticks or Tactical Mode SHALL be amended in the same change (list under "Affected specs and docs").

## Affected specs and docs

Amended in the implementation, not before (they describe what ships today):

- `.kiro/specs/tutorial-rework/` (Req 3 holds: `script.timed` keeps real seconds; note that its clock is now the only real-time clock and drives no enemy).
- `.kiro/specs/declarative-chapter-runtime/` (Req 6 `safe` / `holdEnemiesUntil`, Req 14 solutions "under enemy ticks").
- `.kiro/specs/mcp-devtools-and-forge/` (Req 8 `solve_level` "under enemy tick pressure").
- `.kiro/specs/property-based-tests/` (design: gameplay properties over "commands and ticks").
- `.kiro/specs/qa-visual-audit/` (design: play screens on a stepped game clock).
- Steering: `glossary.md` (Timed entry "game ticks, one a second"; new Battle terms), `terminal-lab-rules.md` (manual clock), `AGENTS.md`, `CLAUDE.md`.
- Skills: `procedural-malware-animation` ("one game tick is one second", tell = "time to type one command"), `chapter-level-generator` and `chapter-implementer` (`--ticks 3` tick pressure), `credits-art-direction` (`playthrough.mjs --ticks 3`), `chapter-editor` (`holdEnemiesUntil`).
- `chapters/README.md`.

## Out of scope

- A per-level turn timer or per-level battle text (both fixed in code; a later spec may add chapter vocabulary for them).
- The battle intro in the classic floors session (Req 8).
- New enemy types, new damage or cadence values, and rebalancing (Req 18 keeps today's).
- An explicit "pass turn" command (an empty Enter is not an action, Req 15).

## Decisions

- **Q:** Keep real-time damage as an option?
  **A (user, 2026-11-24):** No. Remove real-time damage entirely; turn based is the default and only mode.
- **Q:** Keep the button that switches modes?
  **A (user, 2026-11-24):** No, remove it.
- **Q:** How does a battle start?
  **A (user, 2026-11-24):** A random agent of the big four appears and taunts the vibecoder, then the Kiro ghost gives a quick advice, then the battle begins. It must be a clear visual signal.
- **Q:** Who acts first?
  **A (user, 2026-11-24):** The player, always.
- **Q:** How is battle flow owned in code?
  **A (user, 2026-11-24):** One clear battle service or orchestrator with a state machine of who is acting now.
- **Q:** Several enemies in one battle?
  **A (user, 2026-11-24):** Allowed.
- **Q:** What counts as a player action?
  **A (user, 2026-11-24):** Every input typed and sent with Enter, correct or not.
- **Q:** What if the player waits?
  **A (user, 2026-11-24):** A battle timer, about 30 seconds; when it passes, the enemy attacks anyway.
- **Q:** When does a battle begin and end?
  **A (user, 2026-11-24, accepted the recommendation):** It begins when the hero is in a room with a live enemy that can hurt him; it ends when none is left (dead, frozen, petrified) or he leaves the room. Coming back starts a new battle.
- **Q:** Is the 30 s timer per player turn or one countdown per battle?
  **A (user, 2026-11-24, accepted the recommendation):** Per player turn; it restarts at 30 s every time the player's turn begins.
- **Q:** What does one enemy turn do?
  **A (user, 2026-11-24, accepted the recommendation):** One step of each enemy's existing pattern (tell, then strike on its cadence); balance, animations and the 0-death solutions stay as they are.
- **Q:** Outside a battle, what advances time-based things (`script.timed`, quest file restore, Kiro crack)?
  **A (user, 2026-11-24, accepted the recommendation):** One step per command, as Tactical Mode does today; nothing ticks in real time. (Refined for `script.timed` by the next answers.)
- **Q:** How much of Tactical Mode goes?
  **A (user, 2026-11-24, accepted the recommendation):** All of it: button, command, URL flag, chapters-page checkbox, HUD and status text, manual and Terminal Lab entries.
- **Q:** Update the other specs?
  **A (user, 2026-11-24):** Yes, properly update all the specs this touches (Req 14, "Affected specs and docs").
- **Q:** Level 1 plays its monologue on `script.timed` (real seconds). Which clock do timed entries use?
  **A (user, 2026-11-24, accepted the recommendation):** A real-time clock for `script.timed` only; enemies, quest restore and Kiro crack step per command. Level 1 and `tutorial-rework` Req 3 stay as they are.
- **Q:** How does the battle intro behave?
  **A (user, 2026-11-24, accepted the recommendation):** Full intro before every battle, about 4 s (taunt, Kiro advice, banner). Enter skips it; text typed during it stays on the prompt and does not run.
- **Q:** Where do the taunt and advice lines come from?
  **A (user, 2026-11-24, accepted the recommendation):** A code table in `src/game/agents.ts`: taunts per agent, advice per enemy type from the bestiary weaknesses. No chapter vocabulary change.
- **Q:** Does the turn timer run while the editor, laptop, a dialog or pause is open?
  **A (user, 2026-11-24, accepted the recommendation):** It pauses during pause, the battle intro, the `edit` mini-editor and the laptop; it runs while a dialog box shows.
- **Q:** Is an empty Enter an action?
  **A (user, 2026-11-24, accepted the recommendation):** No; only a non-empty line counts.
- **Q:** Several enemies: one after another or all at once?
  **A (user, 2026-11-24, accepted the recommendation):** Resolved at once in the game, played one after another on the stage, about 0.4 s apart, in room order.
- **Q:** Which sessions get the battle system?
  **A (user, 2026-11-24, accepted the recommendation):** One orchestrator in `src/game/`, used by the chapter session (play, editor preview, Terminal Lab with absorbed damage; the lab's manual Tick forces the enemy turn). The classic floors session only loses real-time damage and gets no intro.
- **Q:** What does the visual signal use?
  **A (user, 2026-11-24, accepted the recommendation):** Existing `agent.<name>` and `npc.kiro_ghost` portraits in the dialog box, one new `artist` effect `fx.fight` ("FIGHT!") with its validator, and a HUD turn indicator (`YOUR TURN 0:30` / `ENEMY TURN`). The random agent is seeded by level and battle number.
- **Q:** Timer length?
  **A (user, 2026-11-24, accepted the recommendation):** A fixed 30 s constant in the orchestrator.
- **Q:** How do the solver and the 0-death gate model turns?
  **A (user, 2026-11-24, accepted the recommendation):** Each solution command is one action plus one enemy turn; `--ticks N` adds N minus 1 timer runouts between commands; the intro is skipped as if Enter were pressed.

## Open questions

(none)

## Verification

- Req 1, 2, 21, 22: a unit suite for the orchestrator and the session (no enemy acts on `tick()` outside an enemy turn; `script.timed` still fires on seconds); `npm run quality:declarative`; a grep gate that `tactical` is gone from `src/`.
- Req 3 to 6, 13 to 19: the orchestrator unit suite (state transitions, battle start and end, several enemies, empty line, timer runout, pause cases) and a new gameplay property in `property-tests.mjs` (the phase is always one of the states; an enemy damages the hero only in `enemy`; the player always has the first turn).
- Req 7: `terminal-lab-unit.mjs` (Tick forces the enemy turn, damage absorbed), `terminal-lab.mjs --all`, `editor-smoke.mjs`.
- Req 8: the classic session selfcheck (`src/game/selfcheck.ts`; removed 2026-11-26 in commit 1905207, now `scripts/harness/classic-unit.mjs`) and property tests.
- Req 9 to 12, 20: a unit test on the intro sequence (seeded agent, advice per enemy type, Enter skips, typed text kept); `particle-effect-validator` on `fx.fight`; `visual-audit.mjs` with a battle-start screen; a person checks that the signal reads.
- Req 23, 24: `node scripts/harness/generate-chapter.mjs --verify` and `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs` with 0 deaths.
- Req 25: review of the "Affected specs and docs" list in the final task; `npm run quality:specs`.

## Later changes

- **2026-11-26 (user, "go with your recommendations"):** the intro is `INTRO_SEC = 10` (was 4). Commit 7f7856a raised each intro line to 4.8 s (`BATTLE_LINE_MS`) and the voiced taunt and Kiro clips run 2 to 4 s, so a 4 s intro let FIGHT! fire during the first line. Enter still skips it. Decision A above ("about 4 s") is superseded.
