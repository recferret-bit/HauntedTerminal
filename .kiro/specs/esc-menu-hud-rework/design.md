# Esc menu hud rework: design

Status: see requirements.md

Every claim below was read in the code on 2026-11-25. Where I did not read something, it says "not verified". Items marked **D#** are decisions that need the user's call (section 13).

## 1. What the code check changed in the plan

These facts are not in the requirements' Findings and shape the design.

1. **The neighbour data also drives door locks.** `src/renderer/stage-const.ts:45` `lockedNames(view)` reads `RoomView.neighbors` (relation `locked`); `stage-actor.ts` `doorLocked` and `stage-sync.ts:180-205` use it to show the lock badge and to open or close a door once with a CLANK. Removing `RoomView.neighbors` would unlock every door. Req 11 removes the column the player sees; the data stays (D1).
2. **A second dialog/tip coupling exists.** `src/play/input.ts:106-107` passes `onRightDialogOpen` and `onClear`, both calling `hud.hideHint()`. Req 10 names only `onHintShow` -> `onHintOpened`. Both directions go (D10).
3. **A hero is never left dead in a chapter session.** `hurt` (`session-rules.ts:241-262`) either restores from an SSD backup or calls `rebootLevel` at once. `deadNow` is transient. Req 18's "dead" case therefore means "the command works normally after the reboot" (D8).
4. **`loadLevel` replaces `g.rt`** (`session-level.ts`, levelCommands, levelTicks are fields of `rt`). A pending confirm kept in `g.rt` expires on any level load or reboot for free (section 8).
5. **`restartFloor()` already exists on both sessions** (`Session` interface `game/session.ts:35`, `ChapterSession`, `flow.restartFloor`). No new session method is needed; `restart-level --yes` and the menu call it.
6. **`pages/play.html` is the user's file.** `boot.ts:21-38` throws when `#stage-caption`, `#hud` and others are missing. The new UI is built by JS into existing nodes; `#stage-caption` stays in the DOM, hidden (D11).
7. **Progress is saved only when a level is cleared** (`recordLevelClear`, `session-code.ts:463`, `session-fs.ts:136`). Leaving mid-level loses that level's progress, so Req 6's confirm is needed.
8. **Mute is not persisted today.** `run.muted` / `g.muted` live in the session and are lost on reload. `GameSnapshot.muted` also feeds the comix (`input.ts:194`).
9. **The legacy-key migration is prefix based** (`legacy-keys.ts` `RENAMES`). A new key `out-of-credits:sound:v1` has no legacy name, so no `RENAMES` entry exists to add. Req 7 is met by using `PROJECT_SLUG` and adding a unit assertion.
10. **Door LED**: `door.ethernet` already has `led` (zone `phosphor`) and a blinking amber `link.led` (`doors.ts:80-81`). The doc comment says the game recolours `led` at runtime, but a search of `src/renderer` and `src/procgen/runtime` found no such recolour. The lock badge already exists (`st-lock`, a lock decal plus "LOCKED", `stage-overlay.ts:491-495`).
11. **Exit doors already use `door.ethernet`** when the directory is in `facts.exits` (`view.ts:47`) and in three layout slots. I did not read how `facts.exits` is built for every level, so "every level with an `exitDir`" is a property to prove, not a fact (section 10).
12. **`terminal-lab-smoke.mjs:200` clicks `#hud-mute`.** It breaks when the button leaves the HUD. That file has no owner in `team-rules.md` (section 14).

## 2. Files and owners

| Area | Files | Owner |
|---|---|---|
| Esc handler, menu state, wiring, `window.__menu` test hook | `src/play/{input,loop,state}.ts` | lead-dev |
| Styles for menu, level block, tip box, hidden caption, no column | `src/styles/esc-menu.css` (new, loaded where the other CSS is), `game.css`, `dialog.css` | lead-dev |
| Menu, level block, HUD buttons, tip box mount, orchestrator cleanup | `src/ui/esc-menu.ts` (new), `src/ui/level-block.ts` (new), `src/ui/sound-pref.ts` (new), `src/ui/hud.ts`, `src/ui/dialog-orchestrator.ts` | terminal-designer |
| `restart-level` pure confirm rule, help, man, `COMMANDS` | `src/game/commands-proc.ts` (existing; a new `commands-restart.ts` has no owner in the write fences, see tasks T3), `src/game/manual.ts` | terminal-designer |
| Lab groups and usage, lab script | `src/terminal-lab/commands.ts`, `scripts/harness/terminal-lab/restart-level.lab.json` | terminal-designer |
| Terminal property | `scripts/harness/props/terminal.mjs` | terminal-designer |
| Chapter shell case, pending confirm, reload flag, level info, locked caption | `src/chapters/{session-shell,session-flow,session-state,session-snapshot,chapter-session}.ts` | chapters-designer |
| Battle and exit-door properties | `scripts/harness/props/{chapters,gameplay}.mjs`, `scripts/harness/battle-unit.mjs` | chapters-designer |
| Classic shell case, classic tick counter, volume on `Session`, snapshot fields, selfcheck rows | `src/game/{session,types,sfx,selfcheck}.ts` | lead-dev |
| Storage key constant | `src/contracts/brand.ts` | lead-dev |
| Column removal, wider panel, door LED tint, stage selfcheck | `src/renderer/{stage-layout,stage-overlay,stage-sync,stage-const,stage-selfcheck}.ts` | artist |
| Real Chrome run, visual audit | `docs/qa/` | qa |

New files are inside existing areas (`src/ui`, `src/game`, `src/styles`). No new `src/<area>/`, no new page, no new dependency, no `vite.config.ts` change.

## 3. Esc handler (`src/play/input.ts`, lead-dev)

A `keydown` listener on `window` in the capture phase, next to the F2/F8/F9/F10 one.

- Acts only when `e.key === 'Escape'`, `!e.repeat`, `play.phase === 'play'`, and `play.reasons` holds none of `intro`, `card`, `outro`, `ended`, `cinematic`, `reveal` (`hidden` is not a blocker). It also does nothing when the stats screen is open.
- **Yields to the code editor and Field Manual.** Both close themselves on Esc (`code-editor.ts`, `manual-book.ts`), so `src/play/menu.ts` yields `Escape` whenever `play.codeEditor?.isOpen()` or `play.manualBook?.isOpen()`. When opening the Field Manual via `manual` or `F1`, any open Esc menu closes cleanly first.
- When it acts: `preventDefault()`, `stopPropagation()`, then toggle the menu. Second Esc closes it; a pending two-step restart is cancelled by closing (Req 19).
- **Input blocking without `setBlocked`.** `syncPause` (`loop.ts:11`) rewrites `shell.setBlocked` on every reason change, so a menu-owned `setBlocked(true)` would be overwritten. I also did not verify what `setBlocked` does to a half-typed line. Instead the menu is a full-viewport backdrop (`role="dialog" aria-modal`) that covers the terminal dock, takes focus, traps Tab, and while open a capture listener on `window` swallows keys whose target is outside the menu. xterm reads only its focused helper textarea, so it receives nothing; its line buffer is never touched, and `printAbove` keeps working (output of enemy turns lands above the prompt).
- **Focus restore.** On close, `play.shell.focus()` after `setTimeout(0)`, the call `input.ts:75` already uses for the editor. The existing click handler (`input.ts:175`) is extended to skip refocus while the menu is open.
- **No pause, no hold.** The menu never touches `play.reasons` or `holdTurnTimer`. `play.menuOpen` is a plain boolean in `state.ts`, read only by the Esc handler and the click handler. Battle: `battle.ts` `secondsLeft` keeps running (`holds.size > 0` is the only stop, line 137), so a timeout runs the enemy turn while the menu is open. Opening the menu in a battle spends turn time, as Q2 accepted.
- Test hook: `window.__menu = { open, close, isOpen }` in `exposePlayHooks` (`loop.ts`), like `__editor`.

## 4. The menu UI (`src/ui/esc-menu.ts`, terminal-designer)

`mountEscMenu(host, handlers)` returns `{ open(info), close(), isOpen(), update(snap) }`. DOM through `h()`-style helpers (`dom-lite.ts` `el`), never `innerHTML` for state text. Built into `#stage-wrapper` at mount; no HTML change.

Content, top to bottom:

1. Title `MENU` (it is not a pause, so the word pause is not used).
2. Level details (Req 5), refreshed by `update(snap)` while open: level name, path, objective summary, win-rule checklist with done marks, `BUGS left/total`.
3. Sound: mute toggle and a volume slider (`input type=range` 0 to 100, step 5).
4. `Restart level`. First press swaps the button row for `Confirm restart` and `Cancel`. Confirm calls `handlers.onRestartLevel()` and closes. Esc, `Cancel`, or closing cancels the step.
5. `Back to main menu`. Always asks one confirm line first ("This level's progress is not saved. Cleared levels are.") then goes to `/chapters.html` (D12).

Handlers are supplied by `src/play` (ui imports no `play`): `onMute`, `onVolume(v)`, `onRestartLevel` (calls `session.restartFloor()`, prints `colourise(res.output)` and `play.apply`, the same code as the old `onRestartFloor`, which is deleted), `onLeave`.

## 5. Avatar card, post-flip HUD reveal, and left-column stack

- **No level block below the avatar**: `src/ui/level-block.ts` and `.hero-status-col > #level-block` are removed per user request; `.hero-status-col` holds only `#hero-avatar`, `#hud-hp-cell`, and `#hud-turn`. `#stage-caption` stays hidden in DOM (`display: none`). Level title, path, objective, checklist, and bugs live in the Esc menu (`GameSnapshot.level`).
- **Out-of-flow hero dialog drawer**: `.hero-dialog-drawer` uses `position: absolute; left: 100%; top: -3px` and `clip-path` stepped animations instead of in-flow `max-width` transitions, so opening a `vibecoder` line never shifts `.hero-status-col`, `#hud`, `.items-strip`, or `#tutorial-card`. `StageOverlay.collectObstacles()` includes `#hero-hud.open .hero-dialog-drawer`.
- **Smooth post-page-flip HUD reveal**: `pages/play.html` and `src/play/boot.ts` start with `body.hud-hidden`; `syncPause` keeps `hud-hidden` active through `boot`, `intro`, `reveal`, `card`, and `cinematic` and calls `setHudHidden(false)` once the floor page-turn card finishes flipping, triggering `body.hud-enter` animations (honoring `prefers-reduced-motion`).
- **Left-column stack (`#titleblock`)**: `#hero-hud` -> `.items-strip` (`pointer-events: auto`) -> `#tutorial-card` (`KIRO.D` help card moved from bottom-right into normal flow below `.items-strip`) -> `#fx-hint` (anchored below `.items-strip`).

## 6. Tips box (`.hint-note` / `#fx-hint`) & Kiro prompt card (`#tutorial-card`)

- `mountFx` (`hud.ts`) creates `#fx-hint` and moves it into `#titleblock` anchored at `top: 184px; left: 0` (adjusting to `top: 206px` during battles when `#hud-turn` is shown), keeping `max-height: 200px; overflow-y: auto` so `#sandbox-toggle-btn` (`F2`) stays unobstructed at `1280x820` and `1024x768`.
- `wirePlayLoop` mounts `#tutorial-card` (`mountTutorial`) inside `#titleblock` right after `.items-strip` so it sits on the left below the inventory and never overlaps right-side door locks.
- Remove `onHintShow` / `onRightDialogOpen` / `onClear` coupling between `#fx-hint` and `DialogOrchestrator`.

## 7. Volume and persistence

- `src/game/sfx.ts` (lead-dev): `Sfx.setVolume(v: number)`; one `GainNode` master created with the `AudioContext`, every `tone` connects `amp -> master -> destination`; volume 0 to 1, default 1, so today's loudness is unchanged. Mute keeps its meaning (no context is created while muted).
- `Session.setVolume(v)` in `game/session.ts` and `ChapterSession` (a one-line delegate; chapters-designer file, same change), `GameSnapshot.volume` for the slider.
- Persistence: `SOUND_PREF_KEY = \`${PROJECT_SLUG}:sound:v1\`` in `contracts/brand.ts`; value `{"muted":boolean,"volume":number}`. `src/ui/sound-pref.ts` reads and writes it in try/catch (storage blocked: memory only). `play` applies it once after the session exists: `setVolume`, and `toggleMute()` if the saved mute differs. This also makes mute survive reloads (D5).
- `legacy-keys`: no `RENAMES` change (finding 9). Unit check: `renamedKey` of the old-slug sound key (built in the test from `legacy-keys.ts` data, never written out) gives the current key, so a hypothetical old key would migrate.
- Scope (D4): the slider governs `createSfx` (all in-game sounds). The comix `CineAudio` only takes `muted` (`input.ts:194`); passing the volume to it is a `comix-designer` change.
- `#hud-mute` and `onMute` leave the HUD; `hud.mute`, its label code (`hud.ts:289-290`) go.

## 8. `restart-level` / `retry` and the pending confirm

Pure rule in `src/game/commands-proc.ts` (terminal-designer; was planned as a new `commands-restart.ts`, moved because that path has no owner), used by both shells so the behaviour cannot drift:

```
parseRestartArgs(args) -> { yes: boolean } | { error: string }
decideRestart(pending, now, yes) -> 'arm' | 'restart'
RESTART_CONFIRM_TICKS = 20
armMessage(title) -> the exact line of Req 16
```

State, chapter session (chapters-designer): `LevelRuntime.restartPending: { armedAtCommand: number; armedAtTick: number } | null` in `session-state.ts`, next to `levelCommands` and `levelTicks`. Because `loadLevel` rebuilds `rt` (finding 4), the state is cleared by a level change, a reboot, a death reboot and the confirm itself, with no clearing code.

Rule, evaluated when the command runs (`session-shell.ts` gets `case 'restart-level': case 'retry':` calling `cmdRestartLevel`):

- `yes` -> restart.
- Pending exists and `rt.levelCommands === armedAtCommand + 1` (no other line in between) and `rt.levelTicks - armedAtTick <= 20` -> restart.
- Otherwise -> arm: `restartPending = { rt.levelCommands, rt.levelTicks }`, print the Req 16 line, exit code 0.

"Any other non-empty command line expires it" falls out of the counter test; an expired pending is simply overwritten by the next arm. Nothing reads wall time or randomness; `levelTicks` counts `tick()` while not paused (`session-flow.ts` `tick` returns early when paused or in intro), so a headless solve and a property test reproduce. Note for solvers: `generate-chapter --ticks N` adds N-1 forced ticks per command; with N above 21 a two-run confirm would expire, so solutions and scripts use `--yes` (no shipped level solution restarts a level).

Restart path: `cmdRestartLevel` calls the same `flow.restartFloor(g)` (so `[RETRY] Reloaded <title>.` plus arrival, Req 15) and sets `g.reloadedNow = true`. `exec` resets that flag at its start (like `deadNow`) and, after `runLine`, skips the whole post-command block when it is set. Today that block ends in `afterCommand`, which gives a player the enemy turn; skipping it satisfies Req 18 (the confirming run is not answered by an enemy turn). `loadLevel` already ends a battle with reason `level` (`session-level.ts:60`). The arming line takes the normal path, so in a battle it is one action answered by one enemy turn (Req 18). `exec` counts `g.commands` for both lines (they are lines the player typed; recorded as the first word `restart-level` in telemetry, harmless).

Compound lines (`echo x; retry --yes`) work because the case lives in the shell switch. The reload happens inside `runLine`; later parts of the line then run against the fresh level.

After the chapter ended, `exec` answers every line except `restart` with the "Issue complete" message (`session-flow.ts:116-120`); `restart-level` there gets that message. `restart` (Play Again) is untouched.

Classic session (lead-dev, `game/session.ts:404` switch): same two cases, same helper. It needs a tick counter: add `ticks` to `Session`, incremented in `tick()` when not paused, and `restartPending` on the run (cleared in `load`). Classic `restartFloor()` stays as is (it is also the death path).

Menu path (Req 19): `handlers.onRestartLevel` calls `session.restartFloor()` directly; it neither reads nor types into the terminal. A reload clears `restartPending` as for every reload; opening, cancelling or closing the menu does not touch it (D9).

## 9. Neighbour column removal (artist)

- `stage-layout.ts`: delete `drawNeighbors`; in `layoutFill` set `stage.panelRight = viewRight + margin` (no `colW`, no gutter), drop `stage.column`; remove `stage.neighbors` group lines 153-155 and the `stage-sync.ts:80` call. `stage-overlay.ts`: delete the `neighbors(...)` method and its CSS. Check `colWorld`'s other users (not verified) before deleting.
- Keep `RoomView.neighbors` and its builder (`view.ts:168-176`) because `lockedNames` needs it (D1). Update the doc comment in `contracts/room-view.ts` to say it feeds door locks only. `session-snapshot.ts` filter of the `parent` panel is then dead and removed by chapters-designer.
- Effect: the main panel gets wider, so `placeX` moves every actor in every room. Every visual baseline changes. Baselines are approved by a person only (`docs/qa/baselines/`), so the audit will flag all screens until the user approves new ones.
- Known quirk, unchanged: `view.ts:170` stops at 4 neighbours, so a locked fourth directory shows no lock. Left alone.

## 10. Exit door: LED, padlock, and every level (artist, chapters-designer)

- **LED (Req 12):** a renderer-side tint in `syncOverlays` (`stage-sync.ts:180`), next to `openDoor` / `closeDoor`: the door's `led` part material goes `lockRed` while `doorLocked`, `phosphor` otherwise. No model change, so the model, texture and FX hashes stay identical. I will confirm that with `npm run quality:fingerprint`; not run yet.
- **Padlock:** reuse the existing `st-lock` badge (decal plus "LOCKED") that already appears on every locked door (D2). The alternative is a padlock part on `door.ethernet` using `greeblePadlock` (as `door.firewall` does, `doors.ts:158`), which changes the model hash everywhere the door is used and needs the model validators.
- **Which doors (D3):** `doorLocked` is computed for every door, so tinting all doors is the same code. Recommended: all doors, because a green LED on a locked door would contradict the lock badge.
- **Every level with an `exitDir`:** property in `props/chapters.mjs` (chapters-designer): for each generated level, standing in the exit's parent room, the view contains a door actor with model `door.ethernet` for the exit name, locked iff `!allWinRulesMet`, and `exitCommand`-only levels contain none. If the property finds a level where the exit is not `door.ethernet`, the fix is in `view.ts` `thingModel` input (`facts.exits`), a lead-dev file; the property decides.
- **Boss `exit` command (Req 14):** no door. `man exit` text in `manual.ts` gets a sentence ("on the last level it ends the chapter"); the caption already says `run exit`.

## 11. Sector caption for a locked exit (chapters-designer)

`session-snapshot.ts:25-27` today: `exitOpen ? "SECTOR CLEAR..." : banner ?? summary`. New: when the exit is locked and the hero stands in the room that holds the exit door, `LOCKED: <first missing description>` plus `(+N more)` using `getChecklist(g)` (`unfinishedObjectives` returns a multi-line string, so it is not reused). Elsewhere the banner stays (D7). `ls` and `cat` output is not touched.

## 12. Registration of `restart-level` and `retry` (Req 20)

| Place | Change | Owner |
|---|---|---|
| `manual.ts` `COMMANDS` | add `restart-level`, `retry` (feeds chapter `CHAPTER_COMMANDS` at `session-state.ts:184`, classic man topics `runtime.ts:425`, Tab completion) | terminal-designer |
| `manual.ts` `helpText` | one line under `shell`/`carry` | terminal-designer |
| `manual.ts` `MAN` | `restart-level` page (arming, `--yes`, expiry, names `restart`); `MAN.retry = MAN['restart-level']`; `exit` page gets the boss sentence | terminal-designer |
| Chapter switch `session-shell.ts` (near `exit`, line 229) | two cases | chapters-designer |
| Classic switch `game/session.ts:404` | two cases | lead-dev |
| `help` text of the chapter shell (long string at `session-shell.ts:129`) | mention | chapters-designer |
| Terminal Lab `commands.ts` | group `Help & game`, `USAGE`, example line `restart-level --yes` (its `ungrouped` drift check fails otherwise) | terminal-designer |
| Lab script | `restart-level.lab.json`: arm, confirm, `--yes`, expiry by another command | terminal-designer |
| `selfcheck.ts` command table (`game/selfcheck.ts:360-520`) | rows: bare run arms, second run restarts, `retry --yes` restarts, `man restart-level`, Tab `rest` | lead-dev |
| Properties | `props/terminal.mjs`: for generated sequences, a bare run never restarts; second run or `--yes` restarts; any other line, a level change or more than 20 ticks expires; same sequence, same state; both shells | terminal-designer |
| `validate-pack.ts` | no command list found (only `exitDir`/`exitCommand` and `locks.command`). A `locks` entry naming `restart-level` would simply refuse it; no code change. | none |

## 13. Decisions that need the user's call

- **D1 Neighbours.** Recommended: keep `RoomView.neighbors` as lock data, remove only the drawn column. Alternative: add a `locked` flag to `RoomActor` and delete `neighbors` (a `src/contracts` change touching view, snapshot, selfcheck and renderer).
- **D2 Padlock.** Recommended: reuse the existing lock badge. Alternative: a 3D padlock part on `door.ethernet` (model hash and validators change). The artist checks first that the badge reads as a padlock.
- **D3 LED scope.** Recommended: red/green on every door. Alternative: the exit door only.
- **D4 Volume scope.** Recommended: in-game sounds only now. Alternative: also the comix (a `comix-designer` change to `CineAudio`).
- **D5 Persistence.** Recommended: persist mute and volume in one key; default volume 1 (today's loudness). Alternative: persist volume only and keep mute per run.
- **D6 Objective line.** Recommended: first unfinished win rule. Alternative: the level `summary` always.
- **D7 Locked caption.** Recommended: show the missing item only in the room with the exit door. Alternative: always replace the banner.
- **D8 Dead case of Req 18.** The chapter session never leaves the hero dead. Recommended: read it as "works normally right after a reboot". Alternative: no text change, nothing to build.
- **D9 Req 19 wording "untouched".** A confirmed restart reloads the level and so clears the pending state. Recommended: read "untouched" as "opening, cancelling or closing the menu does not change it".
- **D10 Dialog coupling.** Recommended: remove the two hide callbacks and the unused `onHintOpened`. Alternative: keep the unused method.
- **D11 `#stage-caption`.** Recommended: keep the node, hidden by CSS. Alternative: you edit `pages/play.html` and `boot.ts` stops requiring it.
- **D12 Back to main menu.** Recommended: always one confirm line. Alternative: confirm only while the level is not cleared.

## 14. Handoffs outside the agents' paths

- `scripts/harness/terminal-lab-smoke.mjs:200` clicks `#hud-mute`. It has no owner in `team-rules.md`; the user (or `lead-dev` after a rule change) must switch it to the menu control. Until then `terminal-lab-smoke` fails.
- Visual baselines (`docs/qa/baselines/`): every screen changes (section 9); only the user approves them.
- A new CSS file needs a loader line in an entry that `lead-dev` owns (`src/main.ts` or `src/style.css`); no `pages/` change.

## 15. Layers, size, declarative

- Layers: `ui/` may import contracts, game, chapters, shaders, renderer (`check-layers.mjs:39`); `play/` is outer. New files: `ui/esc-menu.ts`, `ui/level-block.ts`, `ui/sound-pref.ts` (the restart rule lives in the existing `game/commands-proc.ts`). `check-layers.mjs` is not edited.
- Size: `hud.ts` is 467 lines and shrinks; `session.ts` 489 gets about 25 lines; `session-flow.ts` 303; `input.ts` 242. `game.css` is 1203 lines, so CSS is outside the size gate or already over it; new CSS goes to a new file anyway. Functions stay under 130 lines (the menu is built from small functions).
- Declarative: nothing names a chapter or level. No chapter vocabulary changes (`exitDir`, `exitCommand`, `script` untouched), so the four-place rule does not apply.
- Quality hooks: `guard-chapter-files` is not triggered (no vocabulary file).

## 16. Gates

`npm run quality`; `node scripts/quality/check-specs.mjs`; `node scripts/harness/property-tests.mjs --only terminal,chapters,gameplay`; `node scripts/harness/battle-unit.mjs`; `node scripts/harness/generate-chapter.mjs --verify`; `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`; `node scripts/harness/terminal-lab-unit.mjs`; `node scripts/harness/terminal-lab.mjs --all`; `node scripts/harness/terminal-lab-api-test.mjs`; `node scripts/harness/terminal-lab-smoke.mjs` (also `--width 1280 --height 820`, after the handoff in section 14); `node scripts/harness/editor-unit-test.mjs`; `node scripts/harness/screenshot-lab.mjs --selftest`; `npm run quality:fingerprint` (expected byte-identical with the tint-only LED); `node scripts/harness/visual-audit.mjs` (all screens flagged by design, section 9); `qa` in real Chrome: Esc open/close with a half-typed line, Esc inside the code editor, a battle with the menu open past the turn timer, volume persisting across a reload, `restart-level` twice and with `--yes`, the menu two-step restart.

## Decisions

- **Q17:** Approve the design? The request was: "Reply 'approved, use your recommendations' or name the decisions to change".
  **A (user, 2026-11-25):** "i approve". Recorded as approval of the design as written, with the recommended option chosen for D1 to D12 (the user named no change): D1 keep `RoomView.neighbors` as lock data; D2 reuse the lock badge; D3 LED on every door; D4 volume for in-game sounds only; D5 persist mute and volume, default volume 1; D6 objective is the first unfinished win rule; D7 locked caption only in the exit door's room; D8 "dead" means "works normally after the reboot"; D9 "untouched" means opening, cancelling or closing the menu does not change the pending state; D10 remove both hide callbacks and `onHintOpened`; D11 keep `#stage-caption` hidden by CSS; D12 back to main menu always asks one confirm line.
