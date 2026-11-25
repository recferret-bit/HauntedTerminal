# QA 2026-11-24: terminal-command-animations

Branch: agent/terminal-cmd-anim-2 (uncommitted work, 16 modified files + `src/renderer/reduced-motion.ts`)  ·  Asked by: lead-dev  ·  Scope: classic and chapter play, Terminal Lab (spec `.kiro/specs/terminal-command-animations/`, task 10)

## Verdict

FAIL (1 finding for this feature): #1 the failure flinch is still not shown to read at game scale after the enlarged `heroFlinch` (`artist`; re-check of 2026-11-24, see "Re-check"). The rest works as specified.

Finding 2 (the stage selfcheck `ok: false`, `fx.hit-hero` and `fx.fight`) is a known pre-existing issue. It is outside this feature's scope and is not a blocker for it; it is kept in the findings table for `artist` only. It is not counted in the verdict. The green and red swirls pick correctly in chapter play, on the `ls` lock refusal, on an unknown command and in a Terminal Lab. The stamp property passes, the fingerprint diff is the expected one, the chapter verifies with 0 deaths, and the lab smoke passes. Some checks could not be made; they are listed under "Not checked".

## Checks run

| Command | Exit | Notes |
|---|---|---|
| `npm start` | 0 | Stack was already running (pid 51707, port 5400), so the command was a no-op. I did not start it, so I left it running and did not `npm stop` it. |
| `node scripts/harness/property-tests.mjs --only gameplay,chapters,terminal` | 0 | 39 properties, seed 20261117. This includes the new "every VIBECODER_ACTION of a command carries failed:true exactly when the command exits non-zero (100 runs)". |
| `node scripts/harness/generate-chapter.mjs --verify` | 0 | 11 levels, 0 errors, 0 warnings, cmds=65, deaths=0. |
| `npm run quality:fingerprint` | 0 | 109 lines. Compared with `scripts/harness/out/fingerprint-before.txt` (107 lines, 13:59 today) using `grep -vxFf` both ways. No old line changed or disappeared, and two lines were added (see "Fingerprint" below). |
| `node scripts/harness/terminal-lab-smoke.mjs` | 0 | "terminal lab smoke OK", no page errors, 29 repo labs. |
| `node scripts/harness/terminal-lab-smoke.mjs --width 1280 --height 820` | 0 (tail shown) | "terminal lab smoke OK". |
| `node scripts/harness/screenshot-lab.mjs --selftest` | 0 | `malware.lab_fixture`, 61 models, 25 textures, wrote `out/lab-selftest.png`. |
| `node scripts/harness/visual-audit.mjs` | 1 | 96 captures, 24 frame probes, 139 flags, 442 s. Report only, no `--update`. Explained below. |
| `node scripts/harness/visual-audit.mjs --screens-file docs/qa/labs/cmdanim-screens.json --out scripts/harness/out/qa-cmdanim-visual --baselines scripts/harness/out/qa-cmdanim-nobase` | 1 | My own screens (level 1 `ls` lock, `pwd`, `id`; level 2 `pwd` then `cat nothing_here.txt`) at 1280x820, run against an empty baseline folder so the approved baselines are not touched. The filmstrips are the evidence for good, wrong and lock commands. 24 flags, all `no-baseline`, `overlap` or `capture-unstable`, the same kinds as the main run. |

MCP calls:

| Tool | Result |
|---|---|
| `chrome-devtools new_page` `/play?nointro=1` | Level 1 loaded, terminal focused. |
| `type_text` / `press_key` `pwd`, `whoami`, `id`, `uname`, `echo hi`, `ps`, `ls` | Outputs as expected (`id`, `uname`: "command not found"; `ls`: lock message). Each MCP screenshot came back after the 680 ms swirl had ended, so these stills show no swirl. The filmstrip harness above replaced them as evidence. |
| `take_screenshot` (9 play stills, 2 lab, 1 storybook) | `scripts/harness/out/qa-cmdanim-*.png/jpeg` |
| `navigate_page` `/storybook.html?tab=fx&inspect=fx.matrix-fault&t=0.3` | Red swirl: red glyph streams plus pale-pink glitch blocks, ink-outlined. Media 6. |
| `emulate prefersReducedMotion: reduce` (once with `cpuThrottlingRate: 4`), reload, `ls` | No swirl in the frame, but the screenshot also landed after the 300 ms tint, so the result is inconclusive. Reset to `cpuThrottlingRate: 1`, `auto`. |
| `navigate_page` `/terminal-lab/basics`, Run up to step 7 (`rm nothing.txt`), Run box `cat nope.txt`, resize 1600x950 | The red swirl is caught in the frame around the hero (media 5). The Events tab shows `"command": "cat nope.txt", "failed": true`. |
| `list_console_messages` (play, lab) | Only the expected Vite websocket errors. |
| `list_network_requests` (lab) | No failed request (all 200/304). |
| `credits-forge validate_level` level-01-tutorial-awakening | ok, 0 errors, 0 warnings. |
| `credits-forge solve_level` level-01-tutorial-awakening | ok, 7 commands, 0 deaths. |

Not run / not checked:

- `window.__stage.selfCheck()` and therefore `checkCommandFeedback`: not run. My Chrome DevTools tools have no JavaScript evaluation, and no harness script calls the selfcheck (searched `scripts/` and `.kiro/skills/`). From reading `src/renderer/stage-selfcheck.ts:379-412`, the check tests one cue per case (`fx.matrix-cast` / `fx.matrix-fault`), a dropped cue with a hero tint under reduced motion, a played cue and no tint with motion on, and that the tint clears. I cannot confirm that it passes. `lead-dev` or `artist` must run it, or add a harness for it.
- Reduced-motion tint on screen: not confirmed (see the `emulate` row). The audit harness has no reduced-motion option.
- `play-browser.mjs`: not run. The scoped checks above use the same real Chrome; a full 11-level run was not asked for.
- `npm run quality`: not run (it was not in the requested list).

## Fingerprint

Two lines were added and no line changed or disappeared, so `fx.matrix-cast` and every other existing line are byte-identical:

- `fx.matrix-fault preset=a7e3cd01c965 ...`: the expected addition.
- `fx.fight preset=f26610df67e4 ...`: not part of this feature. `fx.fight` is in HEAD's `src/procgen/fx/presets.ts:33` (added by commit e4f4259, "Make combat turn based", today), and the branch diff of `presets.ts` touches `fx.fight` only as context lines. The `before` file was captured before that commit, so this line is a stale reference, not a change. Diffed against HEAD, the expected single added line is `fx.matrix-fault`.

The palette zones (`faultBright`, `faultGlow`, `faultDark`) add no fingerprint line, since the script hashes models, textures and FX only.

## Selfcheck failure: pre-existing (established from code and git, no stash or checkout)

- `missingFx fx.hit-hero`: `event-fx.ts:75-76` cues `'fx.hit-hero'`, and `FX_IDS` lists `'fx.hit-hero'` (`fx-player.ts:22`), but the preset id is `'fx.hit-vibecoder'` (`presets.ts`, HEAD line 267). `FxPlayer.play` looks the preset up by id and returns null when it is missing (`fx-player.ts:112`), so `played` never gets `fx.hit-hero`. All three lines are the same at `git show HEAD`, and `git log -S` puts them in the first commits of 2026-11-12 (97fc9ce, cea7f78). The "tell then strike" pair expects `'fx.hit-hero': [1, 1]` (HEAD `stage-selfcheck.ts:218`), so it fails for the same reason. In the real game the damage screen shows the hit, so only the id lookup is wrong.
- `missingFx fx.fight`: `fx.fight` plays only on `BATTLE_TURN` with `first && actor === 'player'` (`event-fx.ts:117-119`), and HEAD's `allEvents()` has no `BATTLE_*` event (grep on `git show HEAD:src/renderer/stage-selfcheck.ts` finds none). `fx.fight` entered `FX_IDS` in e4f4259. In the real game FIGHT! plays (damage still, level 2 filmstrip).
- So the failure occurs without this feature. This branch only adds one failed action to `allEvents()` and `checkCommandFeedback`, which is what makes `fx.matrix-fault` show as played.

## Visual audit

`node scripts/harness/visual-audit.mjs`: exit 1, 96 captures, 139 flags, 442 s. None of the screens in `screens.json` ends on a failing command, so no still can contain the red swirl. The branch touches no file in `src/hub`, `src/laptop`, `src/styles`, `src/ui` or `pages/`. Each flag group:

| Screen @ size | Flag | Verdict | Reason |
|---|---|---|---|
| level-01..11, dialogue, damage, death-respawn, boss-fight, stats @ all four | diff (3 to 37 %) | pre-existing | The baselines predate today's rename and the turn-based battles. `damage@1280x820-diff.png` shows the baseline HUD with the previous project title and a `TACTICAL` button. The green swirl in `damage@*` (the last line is `pwd`) is the existing `fx.matrix-cast`, unchanged. Not caused by this feature; a person must approve new baselines. |
| battle-start @ all four | no-baseline | expected | New screen; no baseline approved yet (the same verdict as `2026-11-24-turn-based-battles.md`). |
| level-*, dialogue, battle-start, damage, death-respawn, boss-fight, stats @1600x950 | text-overflow (`#terminal-panel`, 3 px Y) | pre-existing | The xterm screen is 3 px taller than its panel at 1600x950; already noted as note 1 in today's battles report. Not this feature. |
| level-01 @ all; level-02..10, dialogue, battle-start, damage, death-respawn @1024x768; some levels @1280x820 | overlap (`#tutorial-card` over `.st-ncard`) | pre-existing | DOM layout of the HUD cards; this branch changes no DOM or CSS. Owner `terminal-designer` / `lead-dev` (`src/ui`, `src/styles`). |
| hub, desktop, achievements, comix @ all four | size-changed | pre-existing | Landing pages are untouched by this branch. Owner `lead-dev`. |
| laptop @ all four | text-overflow ×2 | pre-existing | Laptop Lab is untouched by this branch. Owner `laptop-designer`. |
| stats motion | jump ×3 | pre-existing | The stats screen plays after the chapter; there are no command swirls in it. Owner `lead-dev`. |
| damage @1280/1920, boss-fight @ all | capture-unstable | not checked | Run flag, handed to `lead-dev` (audit owner). |
| intro-early, intro-late | diff | pre-existing | Comix cinematic; untouched by this branch. |

Motion: there were no `dropped-frames` flags. The worst long-frame result was 5/108 at 66.7 ms (death-respawn).

### Checklist per screen (the screens this feature touches)

| Screen | Sizes | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| level-01 good / lock / unknown (filmstrips) | 1280x820 | p | p | p | p | p | p | p | p | p | p | p | p | p | p |
| level-02 failed `cat` during battle intro | 1280x820 | p (note 3) | p | p | p | p | p | p | p | p | p | p | p | p | p |
| Terminal Lab basics, failed `cat` | 1600x950 | p | p | p | p | p | p | p | p | p | p | p | p | p | p |
| storybook `fx.matrix-fault` | 1280x800 | - | p | p | p | - | - | p | p | p | - | p | p | - | p |

## What I saw

- **Good command** (`pwd`, level 1, media 1): green glyph swirl wraps the hero in frames 0-4 (0-320 ms), gone by frame 6. No red. The hop is not distinguishable at contact-sheet scale.
- **Refused lock** (`ls` before the lantern, media 2) and **unknown command** (`id`, media 3): red streams and pale glitch blocks around the hero in frames 0-4, gone by frame 6. No green in any frame. The terminal shows the red error line.
- **Lit room** (level 2: `pwd` green in film 1, `cat nothing_here.txt` red in film 2, media 4): the red read is clear against the lit room. It plays during the battle intro, under the FIGHT! banner (note 3).
- **Terminal Lab** (media 5): red swirl around the hero after `cat nope.txt`; Events shows `failed: true`.
- **Flinch** (task-6 gate, screenshot sequence = frames 0-5 of media 2 and 3, 80 ms apart, covering the 360 ms flinch): I cannot see the flinch. The hero's silhouette looks the same in frames 0-5 as in frames 6-11; the swirl covers the body while the flinch runs. By the design numbers (offset about 0.06 units, about 3.5 px at the game's 58 px/unit, and a -0.06 rad lean, about 3.4°), that is expected. **It does not read.** The failure reads through the red colour alone (finding 1).

## Re-check: enlarged `heroFlinch` (~500 ms, ~15 px recoil, ~11° lean)

Run: `node scripts/harness/visual-audit.mjs --screens-file docs/qa/labs/cmdanim-screens.json --out scripts/harness/out/qa-cmdanim-visual2 --baselines scripts/harness/out/qa-cmdanim-nobase` (exit 1: 23 flags, all `no-baseline`, `overlap` or one `capture-unstable` on cmd-lock; no dropped frames, worst frame 16.8 ms). Filmstrips are 12 frames, about 80 ms apart, at 1280x820.

Cropping: not possible. My shell runs only `node scripts/...` and `.kiro/skills/...`, and I may write only under `docs/qa/`, so I could not run an image-crop script. I judged the full contact sheets, in which the hero is about 40 px tall. Treat the judgement as coarse.

- Failed command, unknown `id` (media 7) and refused `ls` lock (media 8): red glyph streams and glitch blocks cover the hero in frames 0-4 (0-320 ms). In frames 4-5 the hero's silhouette looks slightly darker and more crouched than in frames 7-11, and in the lock sheet frames 2-4 the body appears tilted. Beyond that I cannot separate the recoil from the swirl. I cannot measure 15 px or 11° from these images.
- Successful command, `pwd` (media 9): green swirl in frames 0-4, then the hero stands upright in the same spot. No tilt or crouch is visible. The failed sheets differ from it only by the red colour and this slight tilt.
- Honest result: the flinch is probably more visible than before, since I now see a lean that I did not see at 3.5 px. At game scale it still does not read as a distinct motion, because the swirl covers the body for most of the flinch. I cannot confirm it reads. Finding 1 stays open, lower confidence than before.
- Needed to close it: a cropped, enlarged hero strip (a script under `scripts/harness/` owned by `lead-dev`, or a visual-audit option for a clip rect), or a still taken at 150-300 ms on a stepped clock.

## Findings

| # | Severity | Feature | Owner | What happens | How to reproduce | Evidence |
|---|---|---|---|---|---|---|
| 1 | medium (open, re-checked) | stage (req 7) | artist | First pass: the flinch was about 3.5 px and 3.4° and invisible. After the enlargement (~15 px, ~11°, ~500 ms) a slight tilt and crouch shows in frames 2-5 of the failed filmstrips, but the swirl still covers the body and I cannot confirm it reads as a distinct motion. Success shows no such tilt. Needs a cropped hero strip to close (see "Re-check"). | Level 1, type `ls` before `mv lantern ~`, or `id`; look at frames 0-5 | media/...-2.png, -3.png (before); -7.png (`id`), -8.png (lock), -9.png (`pwd`, no flinch) (after) |
| 2 | medium (gate; known pre-existing, outside this feature's scope, not a blocker, not in the verdict) | stage selfcheck (task 7) | artist | `__stage.selfCheck()` reports `ok: false`: `missingFx` `fx.fight` and `fx.hit-hero`, plus the "tell then strike" pair. Pre-existing at HEAD (see section above); task 7's gate cannot pass until it is fixed. Fix: cue and list `fx.hit-vibecoder` (or rename the preset; a fingerprint change), and add a `BATTLE_TURN { first: true, actor: 'player' }` to `allEvents()`. | `window.__stage.selfCheck()` on `/play` (as reported by artist; not run by qa) | code: `event-fx.ts:75-76,117-119`, `fx-player.ts:22`, `stage-selfcheck.ts:223` |

Notes (not findings):

1. Not checked: reduced-motion tint and `checkCommandFeedback` (see "Not run"). `lead-dev` should run `__stage.selfCheck()` with and without `prefers-reduced-motion`, or give qa a harness that can.
2. Baselines in `docs/qa/baselines/` are stale (rename, battles). A person needs to approve new ones; no agent may write there.
3. The red swirl, FIGHT! and the agent taunt can play at once (level 2 film 2). They read separately and nothing important is hidden, so this is a judgment call for `artist`, not a defect.

## Played by hand

In Chrome (MCP) on level 1, I typed `pwd`, `whoami`, `id`, `uname`, `echo hi`, `ps` and `ls` (refused), reloaded and typed `ls` again twice, then repeated with reduced motion emulated and with the CPU throttled ×4. HP stayed 100/100 and there were no console errors besides the Vite websocket. In the Terminal Lab I ran the basics script up to `rm nothing.txt` and then `cat nope.txt` from the Run box; the lab counted 16 absorbed damage (enemy fire live, by design) and applied none.

## Files

- Throwaway screens file: `docs/qa/labs/cmdanim-screens.json`
- Media: `docs/qa/media/2026-11-24-terminal-command-animations-{1..6}.png` (1 good, 2 lock, 3 unknown, 4 lit-room good+fail, 5 Terminal Lab red, 6 storybook `fx.matrix-fault`)
