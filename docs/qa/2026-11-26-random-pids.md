# QA 2026-11-26: random-pids

Branch: (working tree)  ·  Asked by: lead-dev  ·  Scope: `.kiro/specs/random-pids/` tasks.md task 6 (browser play)

## Verdict

PASS (0 findings against random PIDs; 1 note for the owner of the tutorial prompt, see the tutorial report)

## Checks run

| Command / tool | Exit | Notes |
|---|---|---|
| `npm start` | 0 | "stack already running (pid 99413, port 5400)": I did not start it, so I did not stop it |
| `node scripts/harness/property-tests.mjs --only chapters` | 0 | 17 properties, seed 20261117. The PID properties passed: rollPids, rolled PIDs only, 0-death clears for any seed, `ps` lists rolled PIDs and `restart-level --yes` re-rolls, a lab keeps its author's PIDs |
| `node scripts/harness/terminal-lab-smoke.mjs` | 0 | "terminal lab smoke OK", "no page errors" |
| Chrome DevTools MCP: `new_page`, `take_screenshot`, `type_text`, `wait_for`, `navigate_page` (reload, url), `click`, `take_snapshot`, `list_console_messages` | n/a | Real Chrome at 1280x800 on `http://localhost:5400/play/chapter-01-kiroween?nointro=1` |
| `node scripts/harness/visual-audit.mjs --screens level-01 --sizes 1280x820` | 1 | 1 flag (diff against an old baseline), see the tutorial report |

Not run: `play-browser.mjs` (the MCP covered the same ground and has no JS evaluation, so I typed every line by hand), `generate-chapter.mjs --verify`, `verify-chapter.mjs`, `editor-smoke.mjs` (they are `chapters-designer` gates, not part of the browser pass I was asked for). `credits-forge` tools: not called.
Some shell lines were refused by the allow-list (`sed`, `head`, `timeout`, a `cp` with `..`); I reran them without those parts.

## Played in real Chrome (level 1)

| Load | How | PID shown by `ps` | PID tag on stage | In 1100-8899 |
|---|---|---|---|---|
| 1 | first load | 5037 | 5037 | yes |
| 2 | `restart-level` (armed), then `restart-level --yes` | 8828 | 8828 | yes |
| 3 | page reload | 7843 | 7843 | yes |

- Three loads gave three different PIDs. `777` (kiro.d) and `4242` (bash) stayed fixed.
- Load 1: `kill -9 1011` (the spec marker) answered `kill: (1011) - No such process`. `kill -9 5037` answered `glitch_spark.exe is gone.`, BUGS went 1/1 to 0/1, and the ACH_SIGKILL_HUNTER toast appeared.
- Load 1: `cat kiro_story.txt` printed "kill -9 5037 -> zap glitch_spark.exe (PID 5037)". No spec number appears, no `{pid:...}` placeholder left over.
- The Kiro line `Easy, Vibecoder! I'm Kiro.d ... PID 777` is the fixed Kiro PID and is correct.
- Not checked: the Kiro prompt (tutorial card 5/6, "kill -9 ...") naming the PID. I did not get to step 5/6 of the tutorial card on a fresh load, because I killed the virus out of order. The `cat` text and the stage tag do show the rolled number.
- Terminal Lab, `/terminal-lab/enemy-virus` (lab file has `"pid": 4001`): in the lab game frame `ps` listed `4001 1 dev RUNNING 23 virus.exe`. The author's PID is kept.
- Console: only the Vite websocket errors (expected under the fence). No page errors, no font errors seen.

Screenshots (`docs/qa/media/`): `2026-11-26-qa-tut-5-ps.png` (load 1 `ps`, PID 5037), `2026-11-26-qa-tut-6-kill.png` (spec PID refused, rolled PID kills), `2026-11-26-qa-pid-cat.png` (briefing text), `2026-11-26-qa-pid-reroll.png` (load 2, PID 8828), `2026-11-26-qa-pid-load3.png` (load 3, PID 7843), `2026-11-26-qa-lab-ps2.png` (lab keeps 4001).

## Battle intro (INTRO_SEC = 10 s)

Not verified. The lab battle (`enemy-virus`) started after my first command and the screenshot shows the "FIGHT!" badge and "BATTLE #1: 1 malware in range. You move first." in the terminal, but MCP call latency (several seconds per call) was too coarse to see the two intro lines in order or the Enter skip. The level 2 jump has a hidden enemy and showed no battle. Needs a person or a harness timing test: nothing here is a pass or a fail.

## Findings

| # | Severity | Feature | Owner | What happens | Evidence |
|---|---|---|---|---|---|
| none | | | | | |

## Played by hand

Wrong PID (`kill -9 1011`) is refused with a clear message. `restart-level` armed on a first line and restarted on `--yes`; the level reset (CMD, bugs, tutorial card back to 1/6) and the PID changed.
