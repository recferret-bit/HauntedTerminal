# Esc menu hud rework: requirements

Status: requirements-approved

Capability: an Esc menu on the play screen that shows the current level's details, holds the sound control (mute and volume) and a back-to-main-menu button, and does not pause the game (the game clock and the battle turn timer keep running). The HUD loses the Sound and Restart floor buttons and the level details on the avatar card. A small level block (name plus a one-line objective) sits under the avatar, and the tips box moves to the left column below it. The right-hand neighbour column (`..`, DOWN, LOCKED, NEXT) disappears from every level; the exit is a door in the room, like the other port doors. A new `restart-level` terminal command (alias `retry`) replaces the Restart floor button, and the Esc menu gets a `Restart level` button.

## Findings from the code (existing behaviour, not decisions)

- Esc: the play page has no Esc handler. `src/play/input.ts` binds F2/F8/F9/F10 in the capture phase only. Esc is used by the code mini-editor (`src/ui/code-editor.ts:153`), the cinematic runner (`src/cinematic/runner.ts:209`) and the editors. The terminal (`src/ui/terminal-keys.ts`) is a custom line editor over xterm.
- Pause: `src/play/loop.ts` `syncPause` pauses the session when `play.reasons` is non-empty and blocks the shell for every reason except `hidden`. The turn timer also has `holdTurnTimer('editor')`. An Esc menu that adds no reason and no hold leaves the clock and the battle timer running.
- Level details today: `#stage-caption` (floor title and path, set from `snap.room.title` in `src/play/loop.ts:21`), the `FL n/N`, `BUGS`, `CMD`, `TIME` cells of `#hud` (`src/ui/hud.ts` `HUD_HTML`), and the `#tutorial-card` objective badge. `#hero-hud` (avatar, HP, turn indicator, the player's dialog drawer) is mounted into `#titleblock`. The sector caption text (`room.caption`) comes from `src/chapters/session-snapshot.ts:25` (banner or summary; "SECTOR CLEAR — cd <gate>" once the exit is open).
- Sound: the `#hud-mute` button (`hud.ts`) calls `session.toggleMute()` (`src/game/session.ts`, `src/chapters/session-flow.ts`); mute only today, no volume. `GameSnapshot.muted` feeds the label.
- Tips box (verified in code): it is the paper note `.hint-note`, element `#fx-hint` (`src/ui/hud.ts:380`, styles `src/styles/game.css:435`, `top: 104px`, with a "HINT!" tag and "click to close"). The `? Hint` button (`#hud-hint`) calls `session.hint()` (the `hank` ally line, `session-flow.ts` `hint`) and `hud.showHint()` fills and opens it. It is not a `DIALOG_BOX`, but today it is coupled to the orchestrator: `showHint` calls `onHintShow`, wired in `src/play/input.ts:113` to `play.dialogs.onHintOpened()`, which dismisses the right-side dialog (`dialog-orchestrator.ts:158`), and the orchestrator's doc comment names `.hint-note`.
- Dialogs: Kiro, NPC and agent lines use the one dialog box docked on the right (`.dialog-box.side-right`, `src/styles/dialog.css:22`); the player's own lines go through the avatar card's drawer. `KIRO.D` is a speaker tag (`dialog-orchestrator.ts:51`).
- Restart floor: the `#hud-restart` button calls `session.restartFloor()` (`src/play/input.ts:121`), which in a chapter is `rebootLevel` and prints `[RETRY] Reloaded <title>` (`src/chapters/session-flow.ts:260`). No terminal command reaches it today. The word `restart` already exists in the shell, but only after the chapter has ended: `exec` in `session-flow.ts:105` answers `restart` as "Play Again" (full chapter reset to level 1, `restart(g)`), and the end message says "Run `restart`...". This is why the new command is named `restart-level`.
- The same `restartFloor` is also reached by death without backup (`rebootLevel` in `session-rules.ts:258` and the classic `die`, `src/game/runtime.ts:219`).
- Command vocabulary lists to check for a new player command: `COMMANDS` and `helpText` and `MAN` in `src/game/manual.ts`; the chapter shell switch `src/chapters/session-shell.ts` (`exit`/`logout` at line 229) and the classic shell switch `src/game/session.ts:404`; the Terminal Lab command groups `src/terminal-lab/commands.ts`; `src/game/selfcheck.ts` command table; Tab completion (via `COMMANDS`, to confirm in design); terminal property tests `scripts/harness/props/terminal.mjs`. `src/chapters/validate-pack.ts` has no command list found by this search (only `exitDir`/`exitCommand` checks and `script.locks.command` names), to confirm in design.
- The neighbour column (`..`, DOWN, LOCKED, NEXT) is `drawNeighbors`, `src/renderer/stage-layout.ts:91`, built from `RoomView.neighbors` in `src/game/view.ts:168`.
- The exit is already also a door actor: the level's `exitDir` is a directory in the room, drawn as `door.ethernet` (`view.ts:47`, `thingModel`), shown locked until the win rules hold (`refreshExitGates`, `session-rules.ts:123`). Levels with `exitCommand` and no `exitDir` (the boss level, `exit`) have no exit door; `exit` there is a command (`session-code.ts:445`).
- No chapter vocabulary change appears to be needed: `exitDir` / `exitCommand` stay as they are. The work is in `src/ui`, `src/play`, `src/renderer` (neighbour column, door look), `src/game/view.ts`, `src/game` and `src/chapters` (the `restart-level` command) and styles.

## Requirements (EARS; every item follows a user answer of rounds 1 to 3, except items 16-19 whose exact form the user asked the lead to specify, and item 10's element, marked "to confirm")

1. WHEN the player presses Esc during play, THE SYSTEM SHALL open the Esc menu as a centered modal over the stage with the terminal still visible behind it; WHEN Esc is pressed again, THE SYSTEM SHALL close it.
2. WHILE the Esc menu is open, THE SYSTEM SHALL NOT deliver keys to the terminal input.
3. WHILE the Esc menu is open, THE SYSTEM SHALL keep the game clock, ticks, the battle turn timer and enemy turns running, and SHALL NOT add a pause reason or a turn-timer hold. (Opening the menu in a battle spends turn time; at 0 the enemy turn runs anyway.)
4. WHEN the Esc menu closes, THE SYSTEM SHALL return keyboard focus to the terminal and keep the half-typed line. (How: design.)
5. THE SYSTEM SHALL show these level details in the Esc menu: level name, objective summary, win-rule progress and bugs left.
6. THE SYSTEM SHALL provide a back-to-main-menu button in the Esc menu that goes to `/chapters.html`. IF progress could be lost by leaving, THEN THE SYSTEM SHALL ask for a confirm first; progress is saved per level. (Whether a confirm is needed: design, from how saving works.)
7. THE SYSTEM SHALL move the sound control from the HUD into the Esc menu, as a mute toggle plus a volume slider. WHEN the volume or mute changes, THE SYSTEM SHALL apply it to the WebAudio gain at once and persist it under a key registered in the legacy-keys migration (`src/contracts/legacy-keys.ts`). (Where volume lives: design.)
8. THE SYSTEM SHALL show a small block under the avatar, always visible, with the level name and a one-line objective. The `FL n/N`, `BUGS`, `CMD` and `TIME` cells SHALL stay in the HUD. The avatar card SHALL keep only the avatar, HP and the turn indicator; the stage caption and the objective text SHALL leave it.
9. THE SYSTEM SHALL remove the Restart floor button (`#hud-restart`) from the HUD. The `? Hint` button (`#hud-hint`) SHALL stay in the HUD.
10. THE SYSTEM SHALL move only the tips box (`.hint-note`, `#fx-hint`; confirmed by the user, Q16) to the left column, below the avatar and the level block of item 8. The tips box is not a dialog: THE SYSTEM SHALL NOT manage it with the `DialogOrchestrator` or its queue, and SHALL remove the coupling `onHintShow` -> `dialogs.onHintOpened()`. Dialog boxes (Kiro, NPC, agents) SHALL stay on the right, and the `DialogOrchestrator` SHALL NOT change in behaviour.
11. THE SYSTEM SHALL remove the whole neighbour column (`..`, DOWN, LOCKED, NEXT) from every level.
12. THE SYSTEM SHALL draw the exit of every level that has an `exitDir` as `door.ethernet` (no new model) with an LED (red while locked, green when open) and a padlock while locked.
13. WHILE an exit door is locked, THE SYSTEM SHALL show the red LED and the padlock on it and SHALL name what is missing through the existing sector caption (`room.caption`). THE SYSTEM SHALL NOT change the output of `ls` or `cat`.
14. THE SYSTEM SHALL give no door to a level that has only `exitCommand` (the boss `exit`). The `exit` command stays a command; the caption and `man exit` SHALL explain it. No chapter vocabulary changes.
15. THE SYSTEM SHALL add the terminal command `restart-level` with the alias `retry`. It restarts the current level (the existing `rebootLevel` path, `[RETRY] Reloaded <title>`). The end-of-chapter `restart` (Play Again, full chapter reset) SHALL NOT change.
16. WHEN the player runs `restart-level` or `retry` with no argument and no confirm is pending, THE SYSTEM SHALL NOT restart; it SHALL arm a pending confirm and print exactly: `[RESTART] This reloads "<level title>" and drops its progress. Run restart-level again, or restart-level --yes, to confirm.` WHEN the player then runs `restart-level` or `retry` while the confirm is pending, or runs `restart-level --yes` (or `retry --yes`) at any time, THE SYSTEM SHALL restart the level. (`--yes` is the one-step form for scripts and headless solves; the second run is the form for a player.)
17. THE SYSTEM SHALL expire a pending confirm on the first of: any other non-empty command line, a level change, or 20 game-clock ticks (one tick a second, `tick()`). The expiry SHALL depend only on the command count and the tick counter, never on wall time or randomness, so a headless solve and a property test reach the same state. WHEN a confirm expires on a command, THE SYSTEM SHALL run that command normally and print nothing extra.
18. IN a battle, the arming line of item 16 SHALL count as one player action like any non-empty line (glossary: Turn) and be answered by one enemy turn; the confirming run SHALL reload the level, which ends the battle with reason `level`, and SHALL NOT be followed by an enemy turn. WHEN the hero is dead (waiting for a backup or a reboot), THE SYSTEM SHALL accept `restart-level` and its confirm the same way. (Trade-off, proposed: no exception to the turn rule, but arming in a battle can cost a hit; `--yes` avoids the arming turn.)
19. THE SYSTEM SHALL add a `Restart level` button to the Esc menu. Pressing it SHALL show a second step in the menu (`Confirm restart` and `Cancel`); `Confirm restart` SHALL call the same session method that `restart-level --yes` calls (it SHALL NOT type into the terminal; typing stays blocked while the menu is open) and close the menu. Closing the menu with Esc SHALL cancel the second step. This button is a deliberate exception to the removal of the HUD Restart floor button (item 9): the user wants the HUD button gone and accepts a button inside the Esc menu. The menu path costs no enemy turn and leaves the terminal's pending-confirm state untouched.
20. WHEN `restart-level` is added, THE SYSTEM SHALL register it, with `retry`, in: `src/game/manual.ts` (`COMMANDS`, `helpText`, a `man restart-level` page that also names `restart` as the end-of-chapter command), the chapter shell switch and the classic shell switch, Tab completion, the Terminal Lab command groups and a lab script, the `selfcheck` table and the terminal property tests; and SHALL check that no chapter validator or `locks.command` list needs the name.

## Ownership (from `team-rules.md`)

- `terminal-designer`: `manual.ts` (help, man, `COMMANDS`, `man exit` text), Tab completion, `src/ui/` (Esc menu, level block, tips box position, HUD buttons, the menu's two-step Restart level), `src/terminal-lab/`, `scripts/harness/terminal-lab/`, `scripts/harness/props/terminal.mjs` (confirm property).
- `chapters-designer`: needed. The chapter shell switch `src/chapters/session-shell.ts`, `session-flow.ts` (`exec`, the pending confirm, the session method behind `--yes` and the menu, the `restart` interplay), the sector caption text naming what is missing (`session-snapshot.ts`), `props/{chapters,gameplay}.mjs` (exit door state), `battle-unit.mjs` (restart-level in a battle).
- `artist`: the neighbour column removal in `src/renderer/stage-layout.ts` and the LED and padlock on `door.ethernet` (`src/procgen/`, validators, fingerprint diff explained).
- `lead-dev`: `src/play` (Esc handler, wiring, the removed `onHintShow` coupling), `src/styles`, `src/game/{view,session}.ts` (door lock state in the view, classic shell switch), `src/contracts` (volume key), this spec.
- `qa`: the real Chrome playthrough and the visual audit.

## Out of scope

- Pausing the game from the Esc menu (the user said it is not a pause).
- A new door model (Q10: reuse `door.ethernet`).
- Changing the `DialogOrchestrator` or the place of dialog boxes (Q7).
- A door for `exitCommand`-only levels, and changes to `ls` / `cat` output (Q11, Q12).
- Renaming or changing the end-of-chapter `restart` (Q13).

## Decisions

- **Q1:** What does Esc show?
  **A (user, 2026-11-25):** A centered modal over the stage; the terminal is still visible behind it.
- **Q2:** Does typing continue while it is open?
  **A (user, 2026-11-25):** No, typing is blocked: the terminal input does not receive keys. The game is not paused: the game clock, ticks and the 30-second battle timer keep running ("it's not a pause"). Consequence recorded: a player who opens the menu in a battle loses turn time. How Esc/close restores terminal focus is a design decision.
- **Q3:** "Back to main menu": which page?
  **A (user, 2026-11-25):** `/chapters.html` (chapter select). A confirm is wanted only if progress could be lost; progress is saved per level (design checks this).
- **Q4:** Sound control?
  **A (user, 2026-11-25):** Mute plus a volume slider. Design decides where volume lives, its persistence key (legacy-keys migration rules) and the WebAudio gain.
- **Q5:** Which level details go in the menu?
  **A (user, 2026-11-25):** Level name, objective summary, win-rule progress and bugs left.
- **Q6:** What goes in the small block under the avatar, and what leaves the avatar card?
  **A (user, 2026-11-25):** Option A: a small block under the avatar with the level name plus a one-line objective, always visible. The `FL`, `BUGS`, `CMD` and `TIME` cells stay in the HUD. The avatar card keeps only the avatar, HP and turn; the caption and the objective text leave it.
- **Q7:** Which element moves, and where?
  **A (user, 2026-11-25):** The user picked option C and corrected it in their own words: "ONLY tips box goes to the left, tip box is not a dialog, and has not be managed by dialog orchestrator". Recorded as: only the tips box moves, to the left column below the avatar and the level block (Q6). Dialog boxes (Kiro, NPC, agents) stay on the right; the `DialogOrchestrator` is not touched; the tips box stays outside the orchestrator and its queue. The original option C text (splitting the orchestrator) is not adopted. Element identified from the code: `.hint-note` / `#fx-hint`, opened by the `? Hint` button (see Findings); the user did not explicitly confirm it, so it stays to confirm at the requirements approval.
- **Q8:** How does a player recover from a stuck level or death once Restart floor is gone?
  **A (user, 2026-11-25):** Option B: a new terminal command replaces the Restart floor button; the HUD button is removed. Name, confirm and scope: Q13, Q14. (Q15 adds a button inside the Esc menu.)
- **Q9:** Which neighbour cards go?
  **A (user, 2026-11-25):** Option A: remove the whole neighbour column (`..`, DOWN, LOCKED, NEXT).
- **Q10:** Exit door look?
  **A (user, 2026-11-25):** Option A: reuse `door.ethernet` for every exit; add a clear open/closed LED state (red locked, green open) plus a padlock when locked; no new model.
- **Q11:** How does a locked exit say what is missing?
  **A (user, 2026-11-25):** Option A: red LED and padlock on the locked exit door plus the existing sector caption naming what is missing; no change to `ls` / `cat` output.
- **Q12:** Levels with only `exitCommand`?
  **A (user, 2026-11-25):** Option A: no door; `exit` stays a command; the caption and `man` explain it; no vocabulary change.
- **Q13:** Name of the new command?
  **A (user, 2026-11-25):** Option A: `restart-level` with the alias `retry`; the end-of-chapter `restart` (Play Again) is unchanged.
- **Q14:** Confirm, battle and dead?
  **A (user, 2026-11-25):** Option B: `restart-level` requires a confirm; it works in a battle and when dead once confirmed. The user asked the exact form, message, expiry and enemy-turn cost to be specified, and the confirm path to be deterministic for headless solves and property tests. Specified in items 16-18; the lead proposed those details, the user approves them with the requirements.
- **Q15:** Esc menu and restart; hint button?
  **A (user, 2026-11-25):** Option B: the Esc menu has a `Restart level` button that runs the same command. This is a deliberate exception to Q8's removal of the HUD button: the HUD button goes, the menu button stays. The menu's two-step confirm and the rule that it calls the session path, not the terminal, are in item 19 (lead's proposal, approved with the requirements). The `? Hint` button stays in the HUD; only its note moves left.

- **Q16:** Approve the requirements including proposals 16 to 19, and confirm the tips box is `.hint-note` / `#fx-hint`?
  **A (user, 2026-11-25):** "i approve". Recorded as approval of the requirements as written, including items 16-19 (confirm form, message, expiry, battle and dead behaviour, the menu's two-step button), and as confirmation that the tips box is `.hint-note` / `#fx-hint` (one answer to the two-part message).

## Open questions

None.

## Verification

- Req 1-4: a unit check on the Esc menu (adds no pause reason and no hold; the turn timer keeps decreasing; keys do not reach the terminal while open; focus returns on close) and a `qa` run in real Chrome.
- Req 5-7: unit check of the volume gain and the persisted key; `qa` run.
- Req 8-10: `qa` screenshots at 1600x950 and 1280x820, `node scripts/harness/visual-audit.mjs`; a check that `onHintShow` no longer touches the orchestrator and that `node scripts/harness/property-tests.mjs --only gameplay` and the dialog checks still pass.
- Req 15-20: `node scripts/harness/property-tests.mjs --only terminal` with a new property for the confirm (generated command sequences: a bare `restart-level` never restarts; the second run or `--yes` restarts; any other command, a level change or 20 ticks expires it; the same sequence gives the same state; the menu path leaves the pending state untouched), `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/terminal-lab.mjs --all` (a lab script for `restart-level` and `retry`), `node scripts/harness/battle-unit.mjs` (arming costs one enemy turn, the confirm ends the battle with `level`, the dead case), `node scripts/harness/generate-chapter.mjs --verify`, `qa` run: `help`, `man restart-level`, Tab completion, end-of-chapter `restart` unchanged, the Esc menu two-step button in real Chrome.
- Req 11-14: `node scripts/harness/property-tests.mjs --only chapters,gameplay` with a new property for the exit door state (for every generated level: an `exitDir` door is locked iff a win rule fails, and shows red LED and padlock exactly then; `exitCommand`-only levels have no door; the view has no neighbours), `node scripts/harness/generate-chapter.mjs --verify` (0 deaths, all 11 levels), model validators and `npm run quality:fingerprint` for the door change (diff explained), `qa` real Chrome playthrough.
- Always: `npm run quality`, `node scripts/quality/check-specs.mjs`.
