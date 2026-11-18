# Qa visual audit: design

## Pieces

```
scripts/harness/visual-audit.mjs        CLI: options, server start, the screen x size loop, summary.json, exit code, --update, --selftest
scripts/harness/lib/visual-capture.mjs  determinism (seeded Math.random, storm off, virtual time), reaching a screen, still capture, filmstrip
scripts/harness/lib/visual-detect.mjs   detectors: page-side (overflow, overlap, viewport, fonts) and pixel-side (blank/black, off-palette)
scripts/harness/lib/visual-frames.mjs   dropped-frame probe under CPU throttling (real time, separate phase)
scripts/harness/lib/visual-diff.mjs     pngjs decode, pixelmatch with masks and tolerance, diff image, filmstrip contact sheet, motion flags
scripts/harness/lib/visual-selftest.mjs the self-test, on fixture pages
scripts/harness/visual/screens.json     the screen list (data): id, url, lines, settle, animates, allowOverlap, tolerances
scripts/harness/visual/fixtures/*.html  self-test pages, each made to trip one detector or flag
docs/qa/baselines/<screen>@<WxH>.png    baselines, written only by a person's --update
docs/qa/baselines/masks.json            animated regions to ignore, per screen (rects in CSS px, per size or for all sizes)
scripts/harness/agents-build.mjs        qa: new MCP tools, write fence without baselines, --update denied; lead-dev owns the new scripts
scripts/quality/check-agents.mjs        asserts the qa fence rules of this spec
.kiro/agents/prompts/qa.md              the visual pass procedure, the checklist, the font rule
docs/qa/README.md                       report template: per-screen checklist table, audit summary section
package.json                            devDependencies pngjs and pixelmatch, exact versions
```

Every file stays within 600 lines, and every function within 130.

## How a run works

1. `visual-audit.mjs` starts its own Vite through `startPageServer()` on a free port, so it never fights the user's 5173. It launches headless Chrome through `scripts/harness/lib/browser.mjs`, the existing CDP helper with no npm dependency.
2. For each screen and size, it opens a fresh page and then does the following:
   - Sets the viewport (`Emulation.setDeviceMetricsOverride`).
   - Injects a preamble with `Page.addScriptToEvaluateOnNewDocument` before navigation. The preamble replaces `Math.random` with mulberry32 seeded from `--seed` (default `1995`). It sets `localStorage['haunted.lab.stormOn'] = '0'`, which is the key the shader dock already reads. It installs the page-side detector functions.
   - Sets virtual time with `Emulation.setVirtualTimePolicy({ policy: 'pauseIfNetworkFetchesPending' })` and navigates.
   - Types the screen's `lines` with real `Input.dispatchKeyEvent`, the way `play-browser.mjs` does. After each line it builds a filmstrip by advancing virtual time 12 times by 83 ms (`policy: 'advance', budget: 83`) and calling `Page.captureScreenshot` after each step.
   - Advances virtual time by the screen's `settle` ms and takes the still capture.
3. It runs the detectors on the still capture and the live DOM. It diffs the capture against the baseline and diffs the filmstrip frames pairwise.
4. **Frame-timing phase (real time).** In a separate browser, without virtual time, it sets `Emulation.setCPUThrottlingRate({ rate: 4 })` and samples `requestAnimationFrame` intervals for 2 s. It counts frames longer than 2 x 16.7 ms. This runs once per screen, at 1280x820 only, because the timing doesn't depend on layout size.
5. It writes `scripts/harness/out/visual/<screen>@<WxH>.png`, `...-film-<n>.png`, `...-diff.png` and `summary.json`. It exits 1 if any flag, diff or `no-baseline` exists, and 0 otherwise.

`--update <screen>[@<WxH>]` copies the new capture over the baseline after a normal capture. That is the only path that writes `docs/qa/baselines/`. `--selftest` runs `visual-selftest.mjs`.

## The screen list (`screens.json`)

```json
{ "seed": 1995, "sizes": ["1600x950", "1280x820", "1920x1080", "1024x768"],
  "screens": [
    { "id": "hub", "url": "/", "settle": 1500, "animates": false },
    { "id": "intro-p1", "url": "/cinematic.html?play=intro&t=2", "settle": 500 },
    { "id": "level-01", "url": "/play/<chapter>/<level-01>?nointro=1", "settle": 2500, "animates": true },
    { "id": "dialogue", "url": "...", "lines": ["cat intercom.sock"], "settle": 1500 },
    { "id": "damage", "url": "...", "lines": ["..."] }
  ] }
```

- The level entries are generated at run time from the compiled chapter catalog (`list_levels` data), so a renamed level never breaks the list. `screens.json` names only the extra screens and the lines that reach them.
- The damage, death and respawn, and boss entries reuse lines from `scripts/harness/chapter1.script.json`. For example, the death entry takes the solution of a level up to an enemy and then types `sleep`-like waiting lines until the hit lands.
- `animates: true` means a filmstrip with no change at all is flagged as frozen.
- `allowOverlap` lists selector pairs that are meant to overlap (for example the speech bubble over the stage canvas).
- Per-screen tolerances override the defaults: `maxDiffRatio` (default 0.002 of unmasked pixels), `pixelThreshold` (pixelmatch `threshold`, default 0.1) and `maxOffPalette` (default 0.25, see below).

## Detectors

| Detector | How | Flag when |
|---|---|---|
| blank / black | Pixel stats of the still capture: share of the most common colour, mean luminance. | One colour covers more than 95 percent, or mean luminance is below 6/255. |
| frozen | The filmstrip of a screen with `animates: true`. | Every frame pair differs by 0 pixels. |
| motion jump | Pairwise pixelmatch over the filmstrip, ratio of changed pixels per pair. | One pair changes more than 4x the median pair change and more than 15 percent of the frame (a pop or flicker); or a frame is blank between two non-blank frames. |
| off-palette | Every pixel of the still capture against the palette: the colours of `src/procgen/core/palette.ts` plus every hex colour in `src/styles/*.css`, read at run time. A pixel counts when its nearest palette colour is more than 40 away (RGB distance). | The share is above `maxOffPalette`. The default is loose, because cel bands, halftone, dither and CRT make in-between colours. The first approved run sets each screen's real value. |
| text overflow | Page-side: every visible element with text, `scrollWidth > clientWidth + 1` or `scrollHeight > clientHeight + 1`, where `overflow` is `hidden` or `clip` or `text-overflow` is set. | Any element. It records the selector and the box. |
| overlap | Page-side: the boxes of the fixed chrome elements (`#masthead`, `#hud`, `#tutorial-card`, `#shader-dock`, panels, terminal, speech bubbles, caption boxes, found by a selector list in `screens.json`), pairwise intersection. | An intersection above 4 px x 4 px that is not in `allowOverlap`. |
| out of viewport | Page-side: the same elements' boxes against the viewport. | Any part outside it. |
| fonts | `document.fonts` (every face `loaded`, none `error`), plus CDP `CSS.getPlatformFontsForNode` on each text element found by the overflow walk. | A face that failed, or a rendered platform font that is neither Chakra Petch nor IBM Plex Mono (an intended exception goes in `screens.json` `fontExceptions`). |
| console / network | CDP `Runtime`, `Log` and `Network.loadingFailed`. | Any error, except the Vite HMR websocket. A font request is never excused. |
| dropped frames | Step 4 above. | More than 10 percent of frames are long under 4x throttling. |

Every flag in `summary.json` carries its numbers, the selector or region, and the image that shows it, so `qa` can explain it.

## The diff

- `pngjs` decodes the baseline and the capture. Before `pixelmatch` (`includeAA: false`) runs, the masked rects from `masks.json` are painted the same flat colour in both images.
- A size mismatch is its own flag (`size-changed`) and is not diffed.
- The diff image is pixelmatch's output with the masks outlined, so `qa` sees what was ignored.
- The contact sheet is 4 x 3 frames, each downscaled 1/3 by a box filter, with 4 px paper gutters and the frame number. It is written with `pngjs`, so the existing `lib/png.mjs` writer is not needed here.

## The qa agent

- **MCP:** `DEVTOOLS_LOOK` gains `emulate`, `performance_start_trace`, `performance_stop_trace` and `performance_analyze_insight` (the tool names in `chrome-devtools-mcp@1.13.0`). `--no-javascript-evaluation` stays in the server args.
- **Write fence:** `qa.writes` becomes `docs/qa/*.md`, `docs/qa/media/**` and `docs/qa/labs/**`, instead of `docs/qa/**`. `docs/qa/baselines/**` is owned by no agent and is listed in `check-agents.mjs` as person-only, like `.kiro/agents/`.
- **Shell:** a new per-agent `shellDeny` field in the agents table, which `agents-build.mjs` writes as an extra deny rule. For `qa` it is `['*visual-audit*--update*']`.
- **Ownership:** `lead-dev.writes` gains `scripts/harness/visual-audit.mjs`, `scripts/harness/lib/visual-*.mjs` and `scripts/harness/visual/**`.
- **`check-agents.mjs`** asserts all four points above, and asserts that the chrome-devtools args still contain `--no-javascript-evaluation`.
- **Prompt (`qa.md`):**
  - A "Visual pass" section: run `node scripts/harness/visual-audit.mjs` (narrowed with `--screens` for a scoped pass), read `summary.json`, open every capture, filmstrip and diff image, and explain every flag and diff as either a finding with an owner or expected with a reason.
  - The checklist table, with the severity of each item: overlap, clipped text, contrast, off-palette colour, z-fighting, floating parts, missing ink outlines, wrong font, blank or black frame, misaligned panels, inconsistent style between screens, stale text, flicker and stutter.
  - A per-screen report table that marks every item `pass`, `fail` or `n/a`.
  - Throttled follow-ups with MCP `emulate` and the performance trace tools when a screen stutters.
  - The Google Fonts line removed. Only the Vite websocket stays expected.

## Decisions

- **Virtual time for both stills and filmstrips.** It makes filmstrips exact (12 frames at 83 ms) and reproducible, so they can be diffed. Taking screenshots in real time can't reach 12 fps at 1920x1080. This follows Q1 and Q12. The risk is that WebGL `requestAnimationFrame` under virtual time stalls in some Chrome builds. Fallback: if virtual time does not advance within 5 s, the run marks the screen `capture-unstable` (a flag, never a silent pass) and captures in real time.
- **Frame timing in real time, apart from the captures.** Virtual time hides real cost, so dropped frames need real time and CPU throttling (Q15).
- **The laptop screen is `/laptop-lab?state=desktop&speed=0&mute=1`.** The chapter does not give the laptop yet (`tech.md`), so the lab is the only place the player-facing laptop is drawn. Q7 excludes the labs as tools; this captures the laptop itself, not the lab's controls. Confirmed by the user (Q16, 2026-11-18).
- **Off-palette is a measured number, not a hard rule.** The post passes create in-between colours by design (`haunted-art-direction`), so a strict palette check would flag every frame. The flag fires on a rise above each screen's approved value.
- **The level list comes from the catalog, not from `screens.json`.** No chapter or level name is written in tooling code, which keeps it in line with `quality:declarative`.
- **Baselines have no agent owner.** This follows Q13: only a person changes them, and `check-agents.mjs` enforces it.

## Changes made during implementation (2026-11-18)

Found while building task 3 and 7. None changes a requirement; each is listed here so the design matches the code.

- **(Superseded for play screens by the stepped clock below; still how the hub, comix player and laptop are captured.) The screen is reached in real time; virtual time only freezes the frame.** With virtual time fast-forwarding from the start, the game's own timing did not keep up: the level title card stayed over the stage after two commands, while a real-time run of the same steps showed the room (measured on `dialogue@1280x820`). So the steps run in real time, and after the settle time the frame is frozen. Measured on the game, neither method alone stops every pixel. First the CSS animation playback rate is set to 0 (`Animation.setPlaybackRate`). If two screenshots 250 ms apart still differ (the WebGL stage's loop), virtual time is paused too. A screenshot under paused virtual time hangs on pages with no animation loop (hub, laptop), which is why this order is used. Result on two runs of the same screens: 0 changed pixels on `level-01`, `level-04`, `hub` and `intro-early`, 42 px on `laptop`. Fallback: Chrome not answering is `capture-unstable` (unfrozen capture); a pair that still differs is `capture-unstable` too. Req 4 holds as written: seeded random, storm off, the frame frozen after the settle time.
- **Play screens moved to a stepped game clock (2026-11-18, after the first qa pass; user: "I accept your recommendations").** Real-time reaching left the game at a different animation phase each run: 36 of 80 captures differed from the baselines by 0.2 to 16.6 percent (qa report `docs/qa/2026-11-18-full.md`, finding 7). The recommendation was a game-side capture option, but the stage already has a dev hook (`window.__stage`: `freeze(true)` stops its own loop, `advance(ms)` steps it in 16 ms steps and renders once), so no game code changes and Q12 still holds. On the stepped clock, virtual time is paused before navigation and advanced by the harness in chunks of at most 240 ms. After each chunk the page runs `__vaStep(ms)`: on the first call it freezes the stage, and on every call it advances the stage by the same ms and flushes a queue that stands in for `requestAnimationFrame` (preamble). Timers, game ticks, the stage, the overlay and the terminal therefore all follow one clock. CSS animations run at 1000x, so transitions have settled by the next chunk. When the frame is frozen, infinite CSS animations (reported without `iterations`) are paused at time 0. Under paused virtual time Chrome makes no frame, so each screenshot gets one 16 ms budget. Result on two runs of 14 play captures: 0 changed pixels on 11, 120 px (the cursor) on 3. A run is also about 5x faster, because waiting for a death takes about 3 s instead of 63.
- **A font race in the game, found by the audit:** the terminal is opened without waiting for IBM Plex Mono (`src/ui/terminal.ts` sets `fontFamily`, and nothing awaits `document.fonts`). When the font arrives late, the terminal's cell size differs, and one run showed 18 rows where another showed 16. Forcing every face to load in the harness made Chrome's screenshots hang, so the audit does not hide the race. Fixed on 2026-11-18 in `src/ui/terminal.ts` (the user said go): once the font has loaded, the terminal measures again and refits. Measured with a 2.5 s font delay, the terminal now always has Plex Mono cells (17 px rows, 16 rows at 1280x820). Before, it kept the fallback's 15 px rows (18 rows) whether the font came early or late.
- **Filmstrips come from the real-time motion pass.** Each screen gets one real-time browser at `frameSize` (1280x820). It records filmstrips (a screencast sampled every 80 ms) while reaching the screen, then the throttled frame timing. On the stepped clock, screenshots taken mid-strip could hang, and motion is not diffed against baselines anyway.
- **Filmstrips are a real-time screencast sampled every 80 ms** (`Page.startScreencast`; frame k is the newest frame at or before k x 83 ms). Screenshots in real time cannot reach 12 fps at 1920x1080. A still page sends no new frames, so its frames repeat, which is what the frozen check needs. Filmstrips and the frame probe run at `frameSize` (1280x820) only, because motion and timing do not depend on the layout size.
- **Lines are submitted through `window.__term.submit`.** This is the Enter path that `play-browser.mjs` uses, and it is used here instead of raw key events.
- **Screens are reached with real game events.** Damage and death need one command first, because the game holds a truce until the player has typed in a level (`levelCommands === 0`). Death takes about 63 s of game time, which is about 3 s on the stepped clock. A scoped run (`--screens`, `--sizes`) keeps earlier runs' files and merges `summary.json`, because the qa pass lost its earlier batches when each batch emptied the folder.
- **The baselines are fenced for every team agent, not only qa.** `--update`, any command naming `docs/qa/baselines`, and `cp` with a `..` path are in the shared `DENY_WORDS`, because `cp ... docs/qa/media/../baselines/x` would otherwise pass qa's `cp` allow rule. `docs/qa/baselines/**` is an `fs_write` deny in every agent, so it holds for the lead too, whose fence covers its sub-agents' paths. A per-agent `shellDeny` field was not needed.
- **`emulate` is limited to CPU throttling by `devtools-url-guard.mjs`.** The tool also sets the user agent, headers, geolocation and network, so the hook refuses any field but `cpuThrottlingRate` (Q5), with a unit test in `agents-unit.mjs`.
- **`--out` may only be under `scripts/harness/out/` or the system temp folder**, because the run empties it first. `--screens-file` and `--base` let the self-test run the CLI against fixture pages.

## Layers and gates

- No `src/` change, no new page, no layer rule, no vocabulary change. `quality:fingerprint` is unaffected.
- New pinned devDependencies `pngjs` and `pixelmatch`, at exact versions.
- `visual-audit.mjs --selftest` is a new suite. It is not part of `npm run quality` (Q10). `npm run quality:agents` gains the fence assertions.
- Docs updated in the same change: `AGENTS.md`, `CLAUDE.md`, `.kiro/steering/tech.md`, `team.md` (qa's tools), `.kiro/agents/prompts/team-rules.md` (ownership table), `docs/qa/README.md`.
