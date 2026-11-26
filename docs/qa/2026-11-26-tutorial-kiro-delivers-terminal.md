# QA 2026-11-26: tutorial-kiro-delivers-terminal

Branch: (working tree)  ·  Asked by: lead-dev  ·  Scope: `.kiro/specs/tutorial-kiro-delivers-terminal/` tasks.md task 6, requirements 2-12

## Verdict

FAIL (1 finding, medium). Req 5, 6 and 12 (the S-curve flight, the carried terminal, the visor boot) are NOT judged: see "Not judged".

## Checks run

| Command / tool | Exit | Notes |
|---|---|---|
| `npm start` | 0 | stack was already running (pid 99413, port 5400); I did not start it and did not stop it |
| Chrome DevTools MCP (`new_page`, `take_screenshot`, `type_text`, `wait_for`, `navigate_page`, `take_snapshot`, `click`, `list_console_messages`) | n/a | real Chrome, 1280x800, `/play/chapter-01-kiroween?nointro=1`, then reload, then `/play/chapter-01-kiroween/level-02-task-ram-heist?nointro=1`, then `/terminal-lab/enemy-virus` |
| `node scripts/harness/visual-audit.mjs --screens level-01 --sizes 1280x820` | 1 | 1 capture, 1 flag `diff`; motion pass: 0/121 long frames, worst 16.8 ms |
| `node scripts/harness/property-tests.mjs --only chapters` | 0 | 17 properties pass |
| `node scripts/harness/terminal-lab-smoke.mjs` | 0 | "terminal lab smoke OK" |

Not run: `play-browser.mjs` (MCP used instead), the real intro cinematic (only `?nointro=1` loaded, so "check the real intro once" is not done), `--width 1600` size, `audio-unit.mjs`. `credits-forge` tools: not called. Some shell lines were refused by the allow-list; I reran them without the refused part.

## What I saw (screenshots in `docs/qa/media/`)

| Req | Result | Evidence |
|---|---|---|
| 1 hero starts bare-handed | pass: no terminal in his hand, empty items-strip slot for TERMINAL (dim), no lantern | `2026-11-26-qa-tut-1-start.png` |
| 2 terminal panel hidden until the handover | pass: bottom third of the screen is empty, no prompt, until the lines `You dropped your terminal in the dark. Here, take it` / `My terminal!`; after that the panel and prompt show, TERMINAL slot lights orange | `qa-tut-1-start.png`, `2026-11-26-qa-tut-3.png` |
| 3 dark start, fainter light | pass by eye: scene much darker than with the terminal (compare `qa-tut-1-start` with `qa-tut-3`); hero lit with a faint glow only | same |
| 9 order of lines | pass: monologue, the four agents' lines, hero shout line `HELLOOOO?? Is anybody out there?!`, Kiro intro, Kiro "take it", hero "My terminal!", tutorial card 1/6 | terminal log in `qa-tut-3.png` |
| 11 first commands | pass: `ls`, `ps`, `kill -9 <rolled PID>` (5037) cleared glitch_spark.exe (BUGS 0/1, achievement toast). `mv`, `cd` not typed | `2026-11-26-qa-tut-5-ps.png`, `2026-11-26-qa-tut-6-kill.png` |
| 10 later-level jump | pass: `/play/chapter-01-kiroween/level-02-task-ram-heist` showed the terminal panel, prompt and the TERMINAL slot lit at 0:00, with RAM 16 GB and the HUD 110/110. No flight or boot seen (screenshot taken a few seconds after load, so a boot of a few hundred ms is not excluded) | `2026-11-26-qa-jump-l2.png` |
| Kiro hovers next to the hero after handover | pass: Kiro ghost stands left of the hero, hero holds the terminal in his hand | `2026-11-26-qa-fly-b.png` |
| Restart and reload replay the delivery | `restart-level --yes` and a page reload both returned to the bare-handed start with the terminal hidden, then Kiro delivered it again after about 70 s | `2026-11-26-qa-tut-7-restart.png` |

Console: only the Vite websocket errors. No page errors.

## Not judged

Each MCP call takes several seconds and the tools have no JavaScript or video, so I could not catch the moving parts. I took no frame of: Kiro's flight in (req 5, smoothness and facing), `carry_item` flight (req 6), the visor boot opening line (req 12 first show, the `term_boot` cue) and the pop-in on a later show, nor the `shout` lettering of "HELLOOOO??" (req 4; only the log line was seen). Frames I did get show the state before and after only. A person watching the page, or a harness that steps the game clock, must judge these. Sound: not judged by ear; the cue `term_boot` was not heard.

## Visual audit

`node scripts/harness/visual-audit.mjs --screens level-01 --sizes 1280x820`: exit 1, 1 capture, 1 flag.

| Screen @ size | Flag | Verdict | Finding # or reason |
|---|---|---|---|
| level-01@1280x820 | diff | expected, baseline is stale | the approved baseline in `docs/qa/baselines/` is the older UI (the old project-name header, `Kiro Ghost found you`, panel visible at 0 s). The new capture shows the bare-handed start with no terminal panel. A person decides whether to approve a new baseline; I ran no `--update`. Diff image: `2026-11-26-tutorial-level01-diff.png` |

Checklist (level-01 @1280x820 still, plus my live screenshots at 1280x800):

| Screen | Sizes | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| level-01 | 1280x820 only | p | p | p | p | p | p | p | p | p | p | p | F1 | p | p |

Items 13 (flicker): motion pass shows no long frames; no filmstrip contact sheet inspected. Other sizes (1600x950, 1920x1080, 1024x768): not run.

## Findings

| # | Severity | Feature | Owner | What happens | How to reproduce | Evidence |
|---|---|---|---|---|---|---|
| 1 | medium | tutorial card (stale text) | chapters-designer (card content, level 1 script); `terminal-designer` if the card is gated in `src/ui/` | The KIRO.D tutorial card "TUTORIAL #1: Your terminal screen lights the nearby wires. Look around with ls. TYPE ls" is on screen from 0:00, while the hero has no terminal and no input exists. The text refers to a terminal he does not have for another ~70 s, and it asks for a command he cannot type. It also shows the 1/6 card before Kiro's delivery in the spec's own order (req 9: the `ls` guidance comes after `give_item`). | open `/play/chapter-01-kiroween?nointro=1` and look at the left card | `2026-11-26-qa-tut-1-start.png` |

## Notes for the lead

- Battle intro (10 s, `INTRO_SEC`): not verified, see the random-pids report. A lab battle showed the FIGHT! badge, but the intro lines and the Enter skip were not observed. Level 2 starts no battle in the first 25 s.
- On a restart or reload the 70 s bare-handed opening replays in full. Req 1 says a run without `terminal` in `startItems` starts bare-handed, so this fits the spec, but a player who restarts mid-level loses over a minute; a question for the user, not a bug I can call.
- `take_snapshot` shows hidden DOM text `BACKUP RESTORED!` on the play page from the first load. It was not visible in any screenshot.

## Follow-up (lead-dev, 2026-11-26)

Finding 1 is fixed: `tutorialState` in `src/chapters/script.ts` returns no card until the inventory holds the terminal. The level 1 opening property now asserts it (null before the gift, step 1 after) and fails without the fix. `generate-chapter.mjs --verify`: 11 levels, 0 deaths. Not re-run in Chrome; the next qa pass should look at the left card at 0:00 again. The flight, the visor boot and the sound still need a person to watch the real intro once.
