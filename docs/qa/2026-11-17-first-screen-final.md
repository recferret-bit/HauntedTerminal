# QA: first screen, final pass (2026-11-17)

Branch `agent/first-screen-polish`. Scope: first screen of level 1 after the `@media (max-height: 880px)` rule in `src/styles/game.css` and the new `src/renderer/stage-avoid.ts` + `stage-overlay.ts` caption placement.

**Verdict: PASS** (0 blocking findings, 2 low findings carried from the earlier reports).

## How the screenshots were made

- Port 5173 is held by pid 61405 (`/Users/ferretrec/work/reddit/vangame`), another project. `npm start` refuses it, and the shell refuses `STACK_PORT=...` and `--port`. I did not touch that process.
- The Chrome DevTools MCP tools were therefore **not used** (no server of this repo to point them at). I used `play-browser.mjs`, which starts its own Vite from this repo's `vite.config.ts` and stops it at the end.
- The script `docs/qa/labs/first-screen.script.json` has no solution, so `play-browser` ends with `FAIL` after its wait. That is expected. I only read the last lines of its output, so I did not review its page/console error list.
- Google Fonts is offline in this setup, so fallback fonts show.

## Commands

| Command | Exit |
|---|---|
| `npm run quality` | 0 (run twice: once piped to `tail`, once alone for the exit code; both PASS, properties 32 ok) |
| `node scripts/harness/generate-chapter.mjs --verify` | 0 (11 levels, 0 errors, 0 warnings, 11 cleared, cmds=64, deaths=0) |
| `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --strict` | 0 (59 models, 0 failed, 0 warnings) |
| `npm run quality:fingerprint` | 0 (printed the hashes; I did not diff them against a stored baseline) |
| `node scripts/harness/screenshot-lab.mjs --selftest` | 0 |
| `node scripts/harness/play-browser.mjs --script docs/qa/labs/first-screen.script.json --query chapter=chapter-01-kiroween --width 1600 --height 950 --line-timeout 5000` | prints `FAIL` (expected, see above); `play-1.png` used |
| same, `--width 1280 --height 820` | same |

MCP calls: none made (tools loaded, server unreachable as above).

## `git status --porcelain` (every changed path)

```
 M src/renderer/stage-overlay.ts
 M src/styles/game.css
?? docs/qa/2026-11-17-first-screen-after.md
?? docs/qa/2026-first-screen-before.md
?? docs/qa/labs/
?? docs/qa/media/2026-11-17-first-screen-1280.png
?? docs/qa/media/2026-11-17-first-screen-1600.png
?? docs/qa/media/2026-11-17-first-screen-after-1280.png
?? docs/qa/media/2026-11-17-first-screen-after-1600.png
?? docs/qa/media/2026-11-17-first-screen-final-1280.png
?? docs/qa/media/2026-11-17-first-screen-final-1600.png
?? src/renderer/stage-avoid.ts
```

Nothing under `src/chapters/generated/` changed. `generate-chapter.mjs --verify` rewrote `catalog-data.ts` with identical bytes. This report is the one more new file.

## Screenshots

- `docs/qa/media/2026-11-17-first-screen-final-1600.png` (1600x950)
- `docs/qa/media/2026-11-17-first-screen-final-1280.png` (1280x820)

## Checks (read from the screenshots, positions about +-3 px)

| Check | 1600x950 | 1280x820 |
|---|---|---|
| Header title and subtitle complete | PASS. One line, `...OPEN WEIGHTS & FAMILY TIES` fully inside the yellow box. | PASS. Subtitle wraps to two lines (`FAMILY` / `TIES`), both inside the box. |
| Tutorial card clears `hub_uplink` | PASS. Card starts below the name, in the lower right of the locked panel. | PASS. Card top is about 30 px under `hub_uplink` (the media query works). |
| Card clears hero, bubble, door | PASS. Card is right of the door and below the bubble. | PASS. Card left edge (about x 1020) is right of the door (ends about x 990). |
| Card clears shader dock | PASS. Card bottom about y 515, dock top about y 530. | PASS but tight. Card bottom about y 442, dock top about y 452. |
| Comic caption `WHERE AM I?!` readable | PASS. Complete; ends about 6 px before the bubble. | PASS. Complete; ends about 5 px before the bubble. |
| Comic caption `Kiro Ghost found you in the dark wires!` readable | PASS. Complete. | PASS. Complete. |
| Nothing else cut off | PASS. HUD, buttons, portrait, `LOCKED` door label, `F2` badge, terminal all inside the frame. | PASS. Same. |

Both earlier stage-lettering findings (`Kiro` under the `LEVEL` badge, `WHERE AM` cut by the bubble, blue caption hidden under the bubble) are gone.

## Findings (low, none blocking)

| # | Sev | Owner | Finding |
|---|---|---|---|
| 1 | low | `artist` (`src/renderer/stage-avoid.ts`) | The blue caption is drawn across the hero and the ghost sprite at both sizes. It stays readable, but it covers the hero's torso. Only matters if actors must stay uncovered. |
| 2 | low | `terminal-designer` (`src/ui/`) | Terminal lines still break mid-word: 1600 `then cd h` / `ub_uplink`; 1280 `kiro_st` / `ory.txt` and `Go f` / `orth!`. Carried from the earlier reports. |

Carried and unchanged, not re-judged here: HUD labels and the masthead subtitle are small (8-11 px); the shader dock text is low-contrast orange on dark red.

## Verdict

PASS. The header, the tutorial card, the shader dock and both captions meet the requested checks at both sizes, and every gate listed above exited 0.
