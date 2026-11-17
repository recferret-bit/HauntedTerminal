# QA 2026-11-17: first screen after the CSS fix (level 1, tutorial card open)

Branch: agent/first-screen-polish  ·  Asked by: lead-dev  ·  Scope: first screen of `/play?chapter=chapter-01-kiroween` after the `src/styles/game.css` change (masthead wraps, `#titleblock` max-width 42%, `#tutorial-card` moved to bottom-right of the stage), at 1600x950 and 1280x820. Compared with `docs/qa/2026-first-screen-before.md`. No game file was changed.

## Verdict

FAIL (2 findings to fix, 3 low carried over)

The header and the card position are fixed. The card now hides the `hub_uplink` text at 1280, and the stage captions are still partly cut.

## Which server

Port 5173 is still held by pid 61405 (`/Users/ferretrec/work/reddit/vangame`), another project, so I did not use it. `npm run status` said this project's stack was not running, and `npm start` refused. As before, I used `play-browser.mjs`, which starts its own Vite from this repo's `vite.config.ts` on `127.0.0.1:5342` and stops it at the end. The screenshots show the new layout (card at bottom-right, wrapped masthead), which the old CSS could not produce, so they come from the changed `game.css`.

## Checks run

| Command | Exit | Notes |
|---|---|---|
| `npm start` | 1 (earlier in this session, same as the before pass) | Port 5173 belongs to another project. Not retried on another port (the shell refuses the port option). |
| `node scripts/harness/play-browser.mjs --script docs/qa/labs/first-screen.script.json --query chapter=chapter-01-kiroween --width 1600 --height 950 --line-timeout 5000` | 1 | Expected: the script has no solution, so it waits 60 s for a stats screen. `play-1.png` (first screen, tutorial 1/6) used. No page or console errors reported. |
| same with `--width 1280 --height 820` | 1 | Same expected exit. |
| `npm run quality` | 0 | tsc, root, size, layers, declarative, specs (13), dup (0 clones), agents (14 tests), brands, mcp (12 tests), props (32 properties, seed 20261117). |
| `node scripts/harness/generate-chapter.mjs --verify` | 0 | 11 levels, 0 errors, 0 warnings, 11 cleared, cmds=64, deaths=0. It rewrites `src/chapters/generated/catalog-data.ts` (compiler output); check `git status` before committing. |

Not run: Chrome DevTools MCP (no reachable server of this project, see above), `haunted-forge` `validate_level` / `solve_level` (no level changed), the other suites (out of scope for a CSS change).

Limits: positions are estimates read from the screenshots (about +-3 px). No JavaScript evaluation was possible. Google Fonts is offline, so fallback fonts show.

## Screenshots

- 1600x950: `docs/qa/media/2026-11-17-first-screen-after-1600.png`
- 1280x820: `docs/qa/media/2026-11-17-first-screen-after-1280.png`

## Checklist

| Check | 1600x950 | 1280x820 |
|---|---|---|
| Header title and subtitle fully readable, not overlapped by the HUD | PASS. `HAUNTED TERMINAL` and `KIROWEEN SPECIAL ISSUE // KIROWEEN: OPEN WEIGHTS & FAMILY TIES` on one line; the HUD starts at x ~877, the header ends at x ~630. | PASS. The subtitle wraps to a second line (`TIES`); the header ends at x ~505, the HUD starts at x ~557. Gap ~50 px. |
| Card does not cover the hero | PASS (card x 1340-1575, y 370-520; hero x 460-570) | PASS (card x 1020-1252, y 290-437; hero x 365-450) |
| Card does not cover the speech bubble | PASS | PASS |
| Card does not cover the door | PASS (door x 1143-1250) | PASS (door x 890-990; card starts at x 1020) |
| Card does not cover `LOCKED hub_uplink` | PASS. `LOCKED` and `hub_uplink` sit above the card (y 280-360). | **FAIL.** `LOCKED` is visible (y ~260) but `hub_uplink` is not: it falls under the card (y 290-437). Finding 1. |
| Card does not cover the shader dock | PASS (card bottom ~520, dock top ~530) | PASS (card bottom ~437, dock top ~450). Clearance 10-13 px. |
| First-line captions visible | **Partly.** `WHERE AM I?!` is fully visible. `Kiro Ghost found you` is cut at `you`; the end (`in the dark wires!`) is under the bubble. Finding 2. | **Partly.** `Ghost found you in the dark wires!` is visible, but `Kiro` is hidden under the `LEVEL 01/11` badge, and `WHERE AM I?!` shows only `WHERE AM` (the rest is under the bubble). Finding 2. |
| Nothing else cut off | PASS. Stage, HUD buttons, portrait, terminal all inside the frame. | PASS. Same. |

## Findings

| # | Severity | Feature | Owner | What happens | Evidence |
|---|---|---|---|---|---|
| 1 | medium | Tutorial card | lead-dev (`#tutorial-card`, `src/styles/game.css`) | At 1280 the card (x 1020-1252, y 290-437) covers the `hub_uplink` label under `LOCKED`, the name of the first goal. Moving the card lower (it must stay clear of the dock at y ~450) or making it shorter would free y 290-340. Not seen at 1600. | media/2026-11-17-first-screen-after-1280.png |
| 2 | medium | Stage lettering | artist (`src/renderer/`, caption placement) with lead-dev | The two comic captions are still partly hidden. 1280: `Kiro` is under the `LEVEL` badge and `WHERE AM I?!` is cut to `WHERE AM` by the speech bubble. 1600: the blue caption ends at `you` under the bubble. This is the other half of before-finding 3, and it is the first message of the game. | both screenshots |
| 3 | low | Terminal | terminal-designer (`src/ui/`) | Lines still wrap in the middle of words (carried from before-finding 6). 1600: goal line breaks as `then cd h` / `ub_uplink`. 1280: `kiro_st` / `ory.txt`, `Go f` / `orth!`. | both screenshots |
| 4 | low | HUD, shader dock | lead-dev (`src/styles/game.css`) | Carried: HUD key labels and the masthead subtitle are 8-11 px; the shader dock buttons (`CRT PIXEL INK STORM`) are low-contrast orange on dark red and sit on the locked panel's bottom edge. The dock no longer collides with the card. | both screenshots |
| 5 | low | Speech bubble | artist / lead-dev | Carried: the bubble is large (about 430x240 at 1600) and is what hides the captions in finding 2. | both screenshots |

Fixed since the before pass: before-findings 1 (title cut by HUD) and 2 (card over the room top-left), and the card/dock overlap and the empty locked panel (before-findings 4 and 5, partly: the panel is now used by the card at 1600).

## Played by hand

Only the first screen was inspected at both sizes (intro skipped, tutorial 1/6 `ls` shown). No commands were typed in this pass. The full chapter was cleared headlessly by `generate-chapter.mjs --verify` (0 deaths).

## Handoffs

- lead-dev: finding 1 (card position at 1280), finding 4.
- artist: finding 2 (caption placement), finding 5.
- terminal-designer: finding 3.
