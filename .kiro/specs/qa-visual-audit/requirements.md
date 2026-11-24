# Qa visual audit: requirements

Status: done (requirements, design and tasks approved by the user 2026-11-18; all tasks done 2026-11-18)

Capability: the `qa` agent notices as many visual bugs, inconsistencies and glitches as it can (user, 2026-11-18: "make the qa agent notice all possible visual bugs or inconsistencies, glitches, etc."). One repeatable command, `node scripts/harness/visual-audit.mjs`, captures a fixed list of player-facing screens at four sizes, deterministically. It records a motion filmstrip after each command, diffs every capture against person-approved baselines, and runs numeric detectors. `qa` then judges that output against a fixed checklist with severities, follows up with Chrome DevTools MCP, and reports. The model's judgment comes last, on top of numbers it must explain.

Gaps this closes (from `.kiro/agents/prompts/qa.md` and `scripts/harness/agents-build.mjs`, 2026-11-18):
- `qa` judges still frames only, at two sizes.
- Its judgment differs between runs and nothing catches subtle regressions.
- Its prompt calls Google Fonts errors expected, although fonts are self-hosted in `public/fonts/`.
- The game has no seed or freeze option (17 `Math.random` calls in `src/renderer`, `src/play`, `src/shaders`).

## Requirements

### Capture

1. WHEN `node scripts/harness/visual-audit.mjs` runs with no options, THE SYSTEM SHALL capture every screen in the screen list at 1600x950, 1280x820, 1920x1080 and 1024x768 in headless Chrome. (Q3)
2. THE screen list SHALL be a committed data file. It SHALL hold the hub page, the intro comix, the first screen of each level of the chapter, a dialogue, damage, death and respawn, the boss, the stats screen and the laptop (from `/laptop-lab`, Q16). Each entry SHALL say how to reach the screen (URL and terminal lines) and how long to let it settle. (Q3)
3. WHEN `--screens <ids>` or `--sizes <WxH,...>` is given, THE SYSTEM SHALL capture only those screens or sizes. (Q14)
4. WHILE capturing, THE SYSTEM SHALL make the frame deterministic without changing game code. Before the page loads, the harness SHALL replace `Math.random` with a seeded generator (fixed seed, overridable with `--seed`). It SHALL use Chrome virtual time to freeze the frame after the screen's settle time, and it SHALL turn the storm off. (Q9, Q12)
5. THE SYSTEM SHALL write all output under `scripts/harness/out/visual/`: one PNG per screen and size, the filmstrips, the diff images, and `summary.json`. (Q14)

### Motion

6. WHEN a screen entry types a terminal line, THE SYSTEM SHALL record about 12 frames over the following second and write them as one filmstrip contact sheet per line. (Q1)
7. THE SYSTEM SHALL flag, in `summary.json`, each pair of consecutive filmstrip frames whose pixel change is above a threshold. It SHALL also flag each filmstrip in which nothing changes although the line should animate. (Q1)

### Baselines and diff

8. THE SYSTEM SHALL compare each capture with `docs/qa/baselines/<screen>@<size>.png`, using `pixelmatch` and `pngjs` (pinned devDependencies). It SHALL apply the screen's tolerance and the masked animated regions from a committed masks JSON file. (Q2, Q8, Q9)
9. WHEN a capture differs beyond tolerance, THE SYSTEM SHALL write a highlighted diff image and list it in `summary.json`.
10. IF a baseline is missing, THEN THE SYSTEM SHALL list the screen as `no-baseline`. It SHALL not create the baseline itself.
11. WHEN a person runs `visual-audit.mjs --update <screen>[@<size>]`, THE SYSTEM SHALL replace those baselines with the new captures. The `qa` agent's shell SHALL deny `--update`. `qa`'s write fence SHALL exclude `docs/qa/baselines/**`. (Q13)
12. IF any diff, detector flag or missing baseline is found, THEN THE SYSTEM SHALL exit non-zero. The script SHALL not be part of `npm run quality`. (Q10)

### Detectors

13. THE SYSTEM SHALL run these detectors on every capture and record each result in `summary.json` with its numbers (Q15):
    - a blank, black or frozen frame;
    - the share of pixels outside the palette;
    - text that overflows its box;
    - DOM elements that overlap without being meant to;
    - elements outside the viewport;
    - fonts that did not load (`document.fonts`), including any fallback to a font other than Chakra Petch or IBM Plex Mono (Q6);
    - console errors and failed requests;
    - the dropped-frame count under CPU throttling.

### The qa agent

14. THE `qa` prompt SHALL tell it to run `visual-audit.mjs` for every visual pass, read `summary.json`, look at every capture, filmstrip and diff image, and explain every flag and every diff in its report. (Q14)
15. THE `qa` prompt SHALL carry a fixed visual-bug checklist with a severity per item. It SHALL cover at least: overlap, clipped text, contrast, off-palette colour, z-fighting, floating parts, missing ink outlines, wrong font, blank or black frame, misaligned panels, inconsistent style between screens, stale text, flicker and stutter. For every screen, the report SHALL mark each item `pass`, `fail` or `n/a`. (Q4)
16. THE `qa` agent SHALL be allowed the Chrome DevTools MCP tool `emulate` (CPU throttling) and the performance trace tools, in addition to its current tools. JavaScript evaluation SHALL stay off. (Q5)
17. THE `qa` prompt SHALL stop calling Google Fonts errors expected. Any font request error SHALL be a finding. The Vite websocket error stays expected. (Q6)
18. THE new scripts SHALL be owned by `lead-dev`. `qa` only runs them. (Q11)

## Out of scope

- Firefox and Safari, mobile and touch, and formal accessibility (WCAG) audits. (Q7)
- The editors and labs (`/editor`, `/comix-editor`, `/terminal-lab`, `/laptop-lab`): their own smoke tests cover them. (Q7)
- Changes to game code for capture (no `?capture=` option). (Q12)
- Making the audit a gate in `npm run quality`. (Q10)

## Decisions

- **Q1:** How should qa catch motion glitches (flicker, stutter, late or missing FX, animation pops)?
  **A (user, 2026-11-18):** A new harness script records a burst of frames after each command (about 12 frames over 1 s), builds a filmstrip contact sheet for qa to read, and flags frame-to-frame jumps numerically.
- **Q2:** Should qa compare against approved screenshots?
  **A (user, 2026-11-18):** Yes. Committed baseline PNGs for key screens; a script diffs new captures and writes a highlighted diff image; qa explains each diff; a person approves new baselines.
- **Q3:** Which screens and sizes must a visual pass cover?
  **A (user, 2026-11-18):** A fixed screen list (hub, intro comix, first screen of each of the 11 levels, dialogue, damage, death/respawn, boss, stats screen, laptop) at 1600x950, 1280x820, 1920x1080 and 1024x768.
- **Q4:** A fixed visual-bug checklist in the qa prompt?
  **A (user, 2026-11-18):** Yes, with severities; every screen gets each item marked pass, fail or n/a in the report.
- **Q5:** May qa get more Chrome DevTools tools?
  **A (user, 2026-11-18):** Add only `emulate` (CPU throttling) and the performance trace tools; JavaScript evaluation stays off.
- **Q6:** Fix the stale Google Fonts rule in this spec?
  **A (user, 2026-11-18):** Yes. Any font request error is a finding; screenshots must show Chakra Petch and IBM Plex Mono, not fallback fonts.
- **Q7:** What is out of scope?
  **A (user, 2026-11-18):** Firefox and Safari, mobile and touch, formal accessibility (WCAG) audits, and the editors and labs (covered by their own smoke tests).
- **Q8:** How is the pixel diff implemented?
  **A (user, 2026-11-18):** Pinned devDependencies `pngjs` and `pixelmatch`.
- **Q9:** Where do baselines live and how are they deterministic?
  **A (user, 2026-11-18):** `docs/qa/baselines/<screen>@<size>.png`; captured with a fixed seed, the storm off and the frame frozen after a set settle time; diffed with a per-screen tolerance and masks for known animated regions listed in a JSON file.
- **Q10:** Does a baseline diff fail a gate?
  **A (user, 2026-11-18):** Report only. The diff script exits non-zero, qa lists every diff with its image, a person decides; not part of `npm run quality`.
- **Q11:** Which team agent owns the new capture and diff scripts?
  **A (user, 2026-11-18):** `lead-dev`; qa only runs them, so it cannot change its own tools.
- **Q12:** How are captures made deterministic?
  **A (user, 2026-11-18):** In the harness only: a seeded `Math.random` injected before load and Chrome virtual time to freeze the frame; no game code change.
- **Q13:** Who may update baselines?
  **A (user, 2026-11-18):** Only a person, with `visual-audit.mjs --update <screen>`; qa's shell denies `--update`.
- **Q14:** How does a pass run?
  **A (user, 2026-11-18):** One command, `node scripts/harness/visual-audit.mjs` (`--screens`, `--sizes`), writing screenshots, filmstrips, diffs and a JSON summary to `scripts/harness/out/visual/`; qa reads it, judges with the checklist, then follows up with MCP.
- **Q15:** Automatic detectors in the script?
  **A (user, 2026-11-18):** Yes, all of them (blank/black/frozen frames, off-palette pixel share, text overflow, DOM overlap, out-of-viewport elements, unloaded fonts, console errors and failed requests, dropped frames under CPU throttling); each in the JSON summary, and qa must explain every flag.
- **Q16:** The chapter does not give the laptop yet; capture the laptop screen from `/laptop-lab?state=desktop&speed=0&mute=1`, or drop it?
  **A (user, 2026-11-18):** Capture it from `/laptop-lab` (option 1), since the laptop is not integrated into the chapter yet.

## Open questions

## Verification

- Req 1-5, 8-10, 12-13: a self-test, `node scripts/harness/visual-audit.mjs --selftest`. It checks the seeded random and frozen frame (two runs give byte-identical PNGs), the diff and tolerance on fixture PNGs, the masks, `no-baseline`, and each detector on a fixture page made to trip it. It also checks the exit codes.
- Req 6-7: the self-test runs a fixture page with a known flicker and a known still frame, and asserts both flags.
- Req 1-2: one real full run on the chapter, with its `summary.json` and timing reported.
- Req 11, 16, 18: `npm run quality:agents`. The agent table asserts the denied `--update`, the excluded `docs/qa/baselines/**`, the new MCP tools, JavaScript evaluation still off, and the script owner.
- Req 14-17: `npm run quality:agents` checks the prompt text. Then a real `qa` pass (`kiro-cli --agent qa`) whose report lists the checklist per screen and explains every flag.
- Project-wide: `npm run quality` and `npm run build`.

## Later changes

- **2026-11-24, `.kiro/specs/turn-based-battles/` (approved by the user):** on the stepped game clock, `tick()` no longer moves enemies (combat is turn based): play screens with enemies show the battle intro and the turn indicator on the hero card. A battle-start screen is added by the turn-based-battles QA task; its baseline is approved by a person only.
