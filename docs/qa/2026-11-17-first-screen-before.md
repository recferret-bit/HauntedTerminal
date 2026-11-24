# QA 2026-11-17: first screen before (level 1, after the intro)

Branch: main (clean tree, no branch yet)  ·  Asked by: lead-dev  ·  Scope: first screen of `/play?chapter=chapter-01-kiroween`, level 1, with the Kiro tutorial card open, at 1600x950 and 1280x820. Nothing was fixed.

## Verdict

FAIL (8 findings)

## Checks run

| Command | Exit | Notes |
|---|---|---|
| `npm start` | 1 | Port 5173 is held by pid 61405 (`/Users/ferretrec/work/reddit/vangame`), another project. The shell refused `STACK_PORT=5174 npm start` and `npm start -- --port 5174`. |
| `node scripts/harness/play-browser.mjs --help` | 0 | `--help` is not an option: it ran the whole chapter at the default 1280x800, reached the stats screen, rank S, no errors. Its `play-1..11.png` were overwritten by the runs below. |
| `node scripts/harness/play-browser.mjs --script docs/qa/labs/first-screen.script.json --query chapter=chapter-01-kiroween --width 1600 --height 950` | 1 | Expected: the script has no solution lines, so it waits 60 s for a stats screen that never comes. The first screenshot (`play-1.png`, after the floor 1 title card) is what I used. Page and console errors: none reported. |
| same, `--width 1280 --height 820 --line-timeout 5000` | 1 | Same expected exit. No page or console errors. |

Not run: the Chrome DevTools MCP tools (no server of this project could be reached: 5173 is another app and a second port was refused; `play-browser.mjs` starts its own Vite on 5342 and stops it when it ends). `npm run quality` and the other gates (out of scope for a screenshot pass). `credits-forge` `validate_level` / `solve_level` (no level was changed).

Limits of this pass:
- **Bounding boxes are estimates read from the screenshots** (px from the page's top-left corner, +-3 px). No script can evaluate JavaScript in the page, so no `getBoundingClientRect()` was taken. Selectors come from `pages/play.html`, `src/styles/game.css` and `src/ui/tutorial.ts`.
- `play-browser.mjs` starts Chrome with `--hide-scrollbars`, so scrollbars cannot be judged. `body { overflow: hidden }` and `#page { height: 100vh }` (`game.css`) mean none should show; no clipped page edge was seen at either size.
- Google Fonts is offline, so the fallback font is shown.

## Screenshots

- 1600x950: `docs/qa/media/2026-11-17-first-screen-1600.png`
- 1280x820: `docs/qa/media/2026-11-17-first-screen-1280.png`

Layout seen: `#stage-wrapper` is x 8-1592, y 8-578 at 1600 (x 8-1272, y 8-497 at 1280); `#terminal-dock` sits below it.

## Findings

| # | Severity | Feature | Owner | What happens | Evidence |
|---|---|---|---|---|---|
| 1 | high | HUD / header | lead-dev (`src/styles/game.css`, `src/play/`) | **The masthead title is cut off by the HUD at 1280.** `#masthead` (`white-space: nowrap`, inside `#titleblock` with `min-width: 0`) is x 26-~600 wide, but the `#hud` HP cell starts at x ~557 and paints over it. The visible text ends at `KIROWEEN SPECIAL ISSUE // KIROWEEN: OPEN WEIG`; the rest of the title and the masthead's right border are hidden. It is overlap, not an ellipsis. At 1600 it fits (x 26-693, ends `... FAMILY TIES`) and the HUD cells start at x ~877. | media/2026-11-17-first-screen-1280.png |
| 2 | high | Tutorial card | terminal-designer (`src/ui/tutorial.ts`), lead-dev (`#tutorial-card` CSS) | **`#tutorial-card` (the KIRO.D AGENT PROMPT card) covers the top-left of the stage.** It is `position: absolute; left: 12px; top: 100px; width: 330px`, rotated -1deg. Box: 1600 x 28-357, y 112-272; 1280 x 25-360, y 113-272. It hides the upper-left of the room (the cabinet, cables) and the start of the two comic captions in finding 3. The hero and Kiro Ghost are not covered. At 1280 the card, the speech bubble and the portrait take x 25-990 of the 1264 px stage across y 108-320. | both screenshots |
| 3 | high | Stage lettering | artist (`src/renderer/`) with lead-dev | **The comic captions "Kiro Ghost found you!" (blue, y ~122-152) and "WHERE AM I?!" (yellow, y ~265-310) are cut by the card and the speech bubble.** At 1600 the first ends at `Kiro Ghost found you` with the last letters under the bubble (bubble left edge x ~668) and the exclamation marks of the second touch it. At 1280 only `ost found` and `RE AM` (of `WHERE AM I?!`) can be read, between the card (right edge x ~360) and the bubble (left edge x ~480). The first screen's main message is not readable at 1280. | both screenshots |
| 4 | medium | Stage overlay | lead-dev (`#shader-dock`, `src/ui/`) / terminal-designer | **The shader dock (`#shader-dock`: CRT, PIXEL, INK, STORM) overlaps the right panel and the room floor.** Box: 1600 x 1325-1575, y 530-556; 1280 x 1005-1256, y 449-475. It sits on the bottom border of the locked-door panel and on the hazard stripes at the foot of the room. The buttons use ~10 px orange text on a dark red-orange fill; the label contrast is low and hard to read at game scale. | both screenshots |
| 5 | medium | Right panel | artist / lead-dev | **The locked-door panel (`LOCKED`, `hub_uplink`) is a large dark maroon box that is mostly empty**: 1600 x 1298-1582, y 92-545 (about 284x453 px); 1280 x 1020-1262, y 88-485. The text fills the top 20 percent. At 1280 it starts ~30 px right of the locked door and leaves the room visible in a strip only ~700 px wide. It reads as unused space, and the shader dock (finding 4) lands on it. | both screenshots |
| 6 | medium | Terminal | terminal-designer (`src/ui/`) | **Terminal lines wrap in the middle of words.** 1600: `... then cd h` / `ub_uplink.`, `... cat, ps` / `, and kill!"`. 1280: `cat kiro_st` / `ory.txt`, `then cd hub_uplink` is intact but `Go f` / `orth!` is split. A hard wrap at the column count, not at word breaks, so the goal line (a command the player must type) is broken: `cd h` / `ub_uplink`. `#terminal-panel`, y 610-830 at 1600 and y 528-745 at 1280; the lower ~110 px at 1600 (y 825-935) is empty. | both screenshots |
| 7 | low | HUD | lead-dev (`src/styles/game.css`) | **Tiny HUD labels.** The unit and key labels (`GB`, `/11`, `HP`, `RAM`, `SSD`, `BUGS`, `FL`, `CMD`; `.hud-k`, 8-11 px) and the masthead subtitle (10 px, `#5c5348` on yellow) are hard to read at 1600, worse at 1280. The ellipsized `#stage-caption` (`FLOOR 01 // ...`) is not shown on this screen; `LEVEL 01/11 // /mnt/wires_and_chips` is intact at both sizes. | both screenshots |
| 8 | low | Speech bubble | artist / lead-dev | **The Kiro Ghost speech bubble is large.** 1600 x 668-1100, y 127-367 (432x240, 20 px monospace, 8 lines); 1280 x 480-850, y 108-320 (370x212). It fills the upper-middle of the room above the hero and the lantern glow, and with the card and portrait leaves no free sky at 1280. Text itself is legible (dark on cream). | both screenshots |

## Played by hand

Only the first screen was inspected (intro skipped, level 1 title card passed, tutorial step 1/6 `ls` shown). No commands were typed in this pass. The chapter was not replayed beyond the accidental full run above (stats screen reached, rank S, 64 commands, 85 s, no console errors).

## Handoffs

- lead-dev: findings 1, 2 (card CSS), 4, 5, 7, 8 (`src/styles/game.css`, `src/play/`).
- terminal-designer: findings 2 (`src/ui/tutorial.ts`), 6, 4 (dock buttons).
- artist: findings 3, 5, 8 (stage lettering and panel in `src/renderer/`).

Side effect of this pass: `scripts/harness/out/play-*.png` were overwritten; `docs/qa/labs/first-screen.script.json` was added (a 2 s wait script) so the screenshot can be repeated.
