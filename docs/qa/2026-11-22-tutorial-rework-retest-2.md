# QA 2026-11-22: tutorial-rework retest 2

Branch: `agent/tutorial-rework`, HEAD `121c44d` (committed 2026-11-22 19:29 +0100). Asked by: lead-dev. Scope: the five fixes listed under "Fixes after this retest" in `2026-11-22-tutorial-rework-retest.md`, plus the cases that report left untested. The date comes from the HEAD commit, because my shell refuses `date`. No full visual audit, by request.

## Verdict

FAIL (8 findings: 1 high, 3 medium, 4 low).

Fixes 2 (floor restart) and 3 (early `mv lantern ~`) work as described. Fix 1 works for every command named in the fix. Two other routes still list the room in the dark: `echo *` and Tab completion. Fix 4 works at 500 px for the banner, the HP bar and the toast. At that width, though, the box covers the "TYPE" line of the tutorial card, and Kiro's speech bubble is cut off at the left edge. 360 px could not be reached. Every gate passes.

## Checks run

| Command | Exit | Notes |
|---|---|---|
| `node scripts/harness/generate-chapter.mjs --verify` | 0 | 11 levels, 0 errors, 0 warnings, 11 cleared, cmds=65, deaths=0 (run twice, both 0) |
| `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs` | 0 | 5/5 steps PASS: specs, catalog sync + 0-death solve, comix PNGs, skill self-tests, editor-unit-test (11 suites), terminal-lab-unit (58), terminal-lab-api-test (14), terminal-lab --all (29) |
| `node .kiro/skills/chapter-level-generator/scripts/self-test.mjs` | 0 | "self-test PASS" |
| `node scripts/harness/property-tests.mjs --only chapters,gameplay` | 0 | 26 properties, seed 20261117 |
| `npm start` | 1 | port 5173 belongs to pid 16410 (`/Users/ferretrec/work/TerraAgent`) |
| `STACK_PORT=5174 npm start` / `STACK_PORT=5174 npm stop` | 0 / 0 | all browser work on `http://localhost:5174` |
| `git status --short` after the gates | 0 | empty (the regenerated catalog has identical bytes) |

I did not check port 5400: `curl` is not on my shell allow-list, so I started 5174 instead.

Not run: `npm run quality`, `visual-audit.mjs` (by request), `editor-smoke.mjs`, `credits-forge` `validate_level` / `solve_level` (the `--verify` solve covers all 11 levels).

## MCP calls (chrome-devtools, `localhost:5174` only)

- `new_page` x3. The first two failed with "Protocol error (Target.setDiscoverTargets): Target closed". The third, with `isolatedContext: "qa2"`, opened page 2.
- `list_pages` x1: timed out after 30 s, during the same outage.
- `navigate_page` x7 (reload x5, url x2) and `take_snapshot` x2.
- `wait_for` x9. One timed out after 20 s on purpose, used as a 20 s wait.
- `type_text` x40 (the commands below) and `press_key` x1 (`Control+U`).
- `click` x4: RESTART FLOOR x2, TACTICAL x2. One TACTICAL click failed with "uid 6_21 no longer exists" after a reload and was retried with a fresh uid.
- `resize_page` x3: 500x800, 360x740 (the page stayed 500 wide) and 1280x800.
- `take_screenshot` x22, saved to `scripts/harness/out/qa-r2-{1..22}.png`.
- `list_console_messages` x1 (errors and warnings): only the Vite websocket failure (2 entries), which is expected under the fence. No page errors and no font errors.

Not used: `emulate` and performance traces.

Tool latency varied from about 1 s to about 40 s per call, so timings below are read from the HUD clock, not from my calls.

## Fix-by-fix results

### 1. Dark-room lock (level 1, no lantern)

| Typed | Result |
|---|---|
| `find .`, `find` | refused: "find: it is too dark to see anything. Pull the lantern into your pocket first: mv lantern ~" |
| `kiro scan`, `kiro status` | refused: "kiro: Kiro Ghost cannot scan in the dark. Pull the lantern...". `kiro status` gets the "scan" wording (finding 7) |
| `ls`, `ls -a`, `ls ~`, `ls -la`, `"ls"`, `  ls`, `ls \| cat` | refused, "too dark" |
| `ls;find .` | both refused |
| `echo hi && find .` | prints `hi`, then `find` is refused |
| `/bin/ls`, `LS`, `\ls`, `command ls`, `sh -c ls`, `du`, `stat lantern`, `for f in *; do echo $f; done` | "command not found" (nothing leaks) |
| **`echo *`** | **leaks**: `hub_uplink kiro_story.txt lantern starter_ram_8gb.dimm` (finding 1) |
| **`cat ` + Tab** | **leaks**: the completion list shows `glitch_spark.exe hub_uplink/ kiro_story.txt lantern starter_ram_8gb.dimm` (finding 1) |
| `ps` | works: reveals glitch_spark.exe PID 1011, its PID tag and the enemy are drawn in the dark room, BUGS 1/1 |
| `cat kiro_story.txt` | works: the briefing prints |
| X-ray overlay | stayed off through every command above (`-8.png`) |

After `ps` and `cat kiro_story.txt` in the dark, the tutorial card jumped from 1/7 to **3/7** ("Pocket the RAM stick") while the lantern was still on the floor and `ls` was still refused (finding 3, `-2.png`).

After `mv lantern ~`, `ls` still lists `lantern` in the room (finding 4, `-3.png`).

### 2. RESTART FLOOR after taking the lantern: PASS

After the click:
- The room is dark again, the strip shows TERMINAL highlighted and LANTERN dim, and the hero has no lantern.
- Kiro is off stage. The card is back to 1/7.
- The monologue replays ("[RETRY] Reloaded...", "It is pitch black", DEV lines).
- `ls` is refused again, and `echo *` shows `lantern` back on the floor.
- Kiro re-entered with "I found you in the wires" while the clock went from 3:39 to about 4:02.
- The HUD clock and CMD are not reset (3:39, CMD 31). The first retest saw the same, and it may be intended.

The typed `restart` command does not exist: "bash: restart: command not found (try 'help' or 'hank')".

### 3. `mv lantern ~` at about 0:04: PASS

- The first try typed before the terminal accepted input, and the line was dropped (CMD 0, nothing echoed). The second, after waiting for the room text, landed at HUD 0:04.
- Result: `[COLLECTED] lantern`, the room is lit, strip LANTERN highlighted, card 2/7. Kiro's ghost bubble says "There! The lantern lights up the wires. Now look around with ls."
- Kiro then entered once, at 0:28 at the latest, with one line: "Easy, Vibecoder! I'm Kiro. I found you in the wires."
- No "found you in the dark", no stale 1/7 line, card or bubble.
- The DEV monologue keeps playing after the lantern is taken: "Where am I?..." and "It is so dark. No lantern, nothing. Only my terminal's glow." (finding 5, `-7.png`).

### 4. Narrow viewport

- **360 px not tested**: `resize_page` to 360x740 left the page at 500x740 (the screenshot is 500 wide). This is the same window floor the first retest hit.
- At 500x800 the dialog box is at the bottom of the stage and does not cover the title banner or the HP bar. Fix 4 holds for those two.
- The box covers the lower half of the KIRO.D tutorial card, which hides the "TYPE mv lantern ~" line, and the hero's legs (finding 2, `-4.png`).
- The level label wraps mid-word ("/mnt/wires_an / d_chips"), and the door card reads "LOCKE" (cut by the stage edge). Both are low; the second was there before.
- Toast (`kill -9 1011` unlocks ACH_SIGKILL_HUNTER): it sits at the top of the stage, over the level label and the TACTICAL row, not over the box. The box was not showing at that moment, so I did not see both on screen together.
- In the same screenshot, Kiro's speech bubble runs off the left edge of the viewport: "#3: I am weak / + GPU chips for / odels! Pocket the / n mv." and "_ram_8gb.dimm ~" are cut. The bubble also overlaps Kiro's portrait and the tutorial card (finding 2, `-5.png`).
- At 1280x800 the dialog box still covers the OUT OF CREDITS banner whenever it shows: only a yellow stub stays visible beside it (`-8.png`, `qa-r2-7.png`). The fix only applies at 820 px and below (finding 6).

### 5. Not tested before

- **Pause during a title card**: not tested. With `?nointro=1`, neither RESTART FLOOR nor a reload showed a floor card in my screenshots: the dark room was back on the first screenshot after the click. So I could not see a card hold the game.
- **TACTICAL from the start** (TACTICAL on, then RESTART FLOOR at 0:40):
  - The HUD clock kept running (0:40 to 1:33 in about 50 s).
  - The scripted timeline did not move: no DEV line and no Kiro entrance in 50 s.
  - Two `pwd` commands produced one DEV line ("What is going on?!"). The script advances only on commands, so Kiro's entrance at tick 13 takes about a dozen commands.
  - The card 1/7 still guides the player, so the level is playable. This is a design call (finding 8, `-6.png`).
- **Two dialog lines close together**: seen with the DEV lines at 0:01 to 0:04. The box showed "What is going on?!" while the log had already printed "Where am I?..." (`qa-r2-10.png`). The box lags the log by one line but catches up; I did not see two lines overlap. I counted this as part of finding 5, not a separate one.
- **Long line**: at 1280 px Kiro's two-line box text fits. At 500 px the bubble clips (finding 2). I did not force a longer line.
- **Lantern pickup pop**: the first screenshot after `mv lantern ~` (HUD 0:04, `-7.png`) already shows the slot highlighted orange, with no visible scale or flash. Tool latency (1 s or more) means I cannot tell whether a pop played. Not tested.
- **Jump to level 2 by URL, then back**:
  - Level 2: lit, lantern held, RAM 16, HP 110/110, BUGS 1/1, `ls` works, Anti-Gravy taunt (`qa-r2-21.png`).
  - Back to level 1: dark, strip TERMINAL highlighted, card 1/7, `ls` refused (`qa-r2-22.png`). PASS.

## Findings

| # | Sev | Feature | Owner | What happens | Repro | Evidence |
|---|---|---|---|---|---|---|
| 1 | high | dark-room lock (fix 1) | terminal-designer (glob expansion and Tab completion in the shell); chapters-designer to decide whether `script.locks` should cover them | Without the lantern, `echo *` prints every file in the room, and Tab completion after `cat ` lists them too, including `glitch_spark.exe`. Every named lock holds; these two routes are not commands, so a per-command lock cannot catch them. | fresh level 1, type `echo *`; type `cat ` then Tab | `docs/qa/media/2026-11-22-tutorial-rework-retest-2-1.png`, `-2.png` |
| 2 | medium | narrow layout (fix 4) | terminal-designer (dialog box, speech bubble in `src/ui`), lead-dev (`src/styles`) | At 500 px the bottom dialog box covers the "TYPE mv lantern ~" line of the tutorial card and the hero's legs. Kiro's speech bubble overflows the left edge of the viewport, so its text is cut. | resize to 500 wide, open level 1; later `ps`, `kill -9 1011` | `-4.png`, `-5.png` |
| 3 | medium | tutorial order | chapters-designer | `ps` and `cat kiro_story.txt` in the dark move the tutorial card to 3/7 ("Pocket the RAM stick") while the lantern is not taken and `ls` (step 2) is still refused. | fresh level 1: `ps`, `cat kiro_story.txt`, without `mv lantern ~` | `-2.png` |
| 4 | low | lantern file | chapters-designer | After `[COLLECTED] lantern`, `ls` still lists `lantern` in the room. The first retest saw the file disappear from the floor model; this is the directory listing. | `mv lantern ~`, `ls` | `-3.png` |
| 5 | low | stale monologue | chapters-designer | The DEV dark monologue ("It is so dark. No lantern, nothing.") still prints, in the log and the dialog box, after the lantern is taken early. Fix 3 added `unless` to Kiro's reminders only. | `mv lantern ~` at about 0:04 | `-7.png` |
| 6 | low | dialog box at 1280 px | terminal-designer, lead-dev (`src/styles`) | The box covers the title banner while it shows at desktop widths. The first retest reported this at 1024 px; the fix covers 820 px and below only. | open level 1 at 1280x800 | `-8.png` |
| 7 | low | wording | chapters-designer (lock `message`) | `kiro status` is refused with "Kiro Ghost cannot scan in the dark", but status is not a scan. | `kiro status` in the dark | `-8.png` |
| 8 | medium | TACTICAL mode | chapters-designer (design call), lead-dev if the HUD clock should follow ticks | In tactical mode the timed script (monologue, Kiro's entrance at tick 13) advances only on commands, while the HUD clock keeps running in real time. A player who starts in tactical sits in the dark with no Kiro until about a dozen commands. Whether that is intended is not in the spec I read. | TACTICAL on, RESTART FLOOR, wait 50 s, then `pwd` x2 | `-6.png` |

Also seen, not counted as findings:
- Input typed in the first second after a reload is dropped.
- The RESTART FLOOR button stays orange (its focus colour) after a click.
- The level label wraps mid-word at 500 px.

## Not tested

- A 360 px viewport (the window floor is 500).
- Pause during a title card (no card appeared with `?nointro=1`).
- The lantern pop animation on the strip slot (tool latency too high to catch it).
- The toast and the dialog box on screen at the same moment.
- A deliberately long dialog line.
- Death and respawn on level 1.
- Port 5400 (I could not probe it).
- 1600x950 and 1920x1080.
- Levels 3 to 11 in the browser.
- The visual audit and performance traces.

## Handoffs

- terminal-designer: findings 1, 2, 6.
- chapters-designer: findings 1 (whether to lock), 3, 4, 5, 7, 8.
- lead-dev: findings 2 and 6 (`src/styles`), finding 8 (HUD clock).

Screens copied to `docs/qa/media/2026-11-22-tutorial-rework-retest-2-{1..8}.png`:
1. `echo *` leak
2. Tab leak, card at 3/7
3. `ls` lists the lantern
4. 500 px box over the card
5. 500 px bubble clipped
6. tactical
7. early `mv`
8. dark refusals and the banner covered

The rest stay in `scripts/harness/out/qa-r2-*.png`. No game file changed.

## Triage and fixes after this report (2026-11-22, main session, not the `qa` agent)

| Finding | Decision |
|---|---|
| 1 `echo *` and Tab completion list the room in the dark | not fixed, a call for the user: the lock names commands (`ls`, `find`, `kiro`), and a shell that cannot complete names would feel broken. Left open. |
| 2 500 px layout (card TYPE line, Kiro's bubble cut at the left) | not fixed: below the 820 px rule on purpose, narrower than a normal desktop window; low |
| 3 `ps` and `cat` in the dark moved the card to 3/7 | fixed: step 1 is done only by `has_item lantern`; `self-test.mjs` checks that `cat` in the dark keeps the card on 1/7 |
| 4 `ls` lists `lantern` after it is collected | could not reproduce: a headless session lists `hub_uplink/ kiro_story.txt starter_ram_8gb.dimm` after `mv lantern ~` (`ls` and `ls -la`) |
| 5 DEV "No lantern" line after an early pickup | fixed: that timed entry has `unless has_item lantern`; `self-test.mjs` checks it |
| 6 box covers the title banner at 1280 px | not fixed: the box is meant to sit in the top-left corner; the banner returns when it hides |
| 7 `kiro status` says "cannot scan" | fixed: the lock text reads "Kiro Ghost cannot help you in the dark" |
| 8 TACTICAL: Kiro's entrance needs about a dozen commands | by design: tactical mode advances the world per command, and the script clock is the world tick; left as is, to confirm with the user |
