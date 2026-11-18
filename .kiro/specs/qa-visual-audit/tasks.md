# Qa visual audit: tasks

- [x] 1. Dependencies: add `pngjs` and `pixelmatch` as devDependencies at exact versions (`npm install -D -E`), and confirm that both load as ESM from a harness script. _Req 8_. Gates: `npm run quality`
- [x] 2. Diff and frames library, `scripts/harness/lib/visual-diff.mjs`:
  - decode and compare with masks, tolerance and the `size-changed` flag;
  - write the diff image with the masks outlined;
  - build the 4x3 contact sheet;
  - compute pairwise filmstrip changes and the motion-jump and frozen flags.

  Each piece gets a unit check on in-memory fixture PNGs inside `visual-selftest.mjs`. _Req 6-10_. Gates: `node scripts/harness/visual-audit.mjs --selftest`, `npm run quality:size`, `npm run quality:dup`
- [x] 3. Capture library, `scripts/harness/lib/visual-capture.mjs`:
  - the preamble (seeded `Math.random`, storm off, detector functions);
  - the virtual-time still and the 12-frame filmstrip;
  - the `capture-unstable` fallback.

  Self-test: two captures of an animated fixture page give byte-identical PNGs, and a fixture whose virtual time stalls is flagged `capture-unstable`. _Req 4, 6_. Gates: `--selftest`
- [x] 4. Detectors:
  - `scripts/harness/lib/visual-detect.mjs`: blank and black, off-palette (palette read from `src/procgen/core/palette.ts` and `src/styles/*.css`), text overflow, overlap with `allowOverlap`, out of viewport, fonts (`document.fonts` and `CSS.getPlatformFontsForNode`), console and network;
  - `scripts/harness/lib/visual-frames.mjs`: dropped frames under 4x CPU throttling.

  Add one fixture page per detector in `scripts/harness/visual/fixtures/`, plus a clean page that must trip nothing. _Req 13, 17_. Gates: `--selftest`
- [x] 5. CLI and screen list:
  - `scripts/harness/visual-audit.mjs` with `--screens`, `--sizes`, `--seed`, `--update`, `--selftest`, `summary.json` and the exit codes;
  - `scripts/harness/visual/screens.json`, with the level entries taken from the compiled catalog, plus the hub, intro, dialogue, damage, death and respawn, boss, stats and laptop (`/laptop-lab`) entries;
  - an empty `docs/qa/baselines/masks.json`.

  Self-test: `no-baseline` is listed and nothing is created, `--update` writes only the named baseline, and every exit code is checked. _Req 1-3, 5, 10-12_. Gates: `--selftest`, `npm run quality`
- [x] 6. First real run and calibration:
  - run the full audit on the chapter and report the run time and `summary.json`;
  - tune the masks, `settle`, `allowOverlap` and `maxOffPalette` per screen from what the run shows, explaining each value in the report;
  - show you the captures, and write the baselines only after your yes (`--update`, run by me on your instruction).

  _Req 1-2, 8-9, 13_. Gates: the real run, a second run that must report 0 diffs against the new baselines
- [x] 7. Agent fence:
  - in `scripts/harness/agents-build.mjs`, add the `qa` MCP tools (`emulate`, `performance_start_trace`, `performance_stop_trace`, `performance_analyze_insight`), narrow `qa.writes` (no `docs/qa/baselines/**`), add a new per-agent `shellDeny` with `*visual-audit*--update*` for `qa`, and add the new scripts to `lead-dev.writes`;
  - regenerate the agents;
  - add the matching assertions to `scripts/quality/check-agents.mjs`, including that `--no-javascript-evaluation` is still in the server args, and mark `docs/qa/baselines/**` as person-only.

  _Req 11, 16, 18_. Gates: `npm run quality:agents`, `npm run quality`
- [x] 8. The `qa` prompt and report template:
  - `.kiro/agents/prompts/qa.md`: the visual pass section, the checklist with severities, the per-screen pass/fail/n-a table, the throttled MCP follow-ups, and the Google Fonts line removed;
  - `docs/qa/README.md`: the template gains the checklist table and an audit summary section.

  _Req 14, 15, 17_. Gates: `npm run quality:agents`
- [x] 9. A real `qa` pass with `kiro-cli --agent qa`, scope `full`. It must produce a report that lists the checklist per screen and explains every flag. You review it. _Req 14-17_. Gates: the report in `docs/qa/`, `npm run quality`, `npm run build`
- [x] 10. Docs: `AGENTS.md`, `CLAUDE.md`, `.kiro/steering/tech.md` (commands), `.kiro/steering/team.md` (`qa`'s tools), and `.kiro/agents/prompts/team-rules.md` (ownership table). Then set `Status: done`. _All_. Gates: `npm run quality`, `node scripts/quality/check-specs.mjs`

## Status 2026-11-18

- Task 6 is blocked. The baselines are written: the user said yes, and `--update` ran on all 20 screens (80 PNGs, 56 MB). But the next run (the qa pass, `docs/qa/2026-11-18-full.md`, finding 7) differed on 36 of the 80 captures, by 0.2 to 16.6 percent, all on animated or scripted play screens. Because the screen is reached in real time, the game is at a different animation phase when the frame is frozen. The hub, the intro and the laptop stayed at 0 to 124 px. The user is asked how to make those screens deterministic before the task can be ticked.
- Task 9 is done: the report is `docs/qa/2026-11-18-full.md`. The run showed two tool gaps. Each scoped batch empties the output folder, so the earlier batches' images were lost. qa also made no Chrome DevTools MCP follow-up.
- 2026-11-18, later: the user accepted the recommendations: deterministic play screens, scoped runs that keep earlier batches, and smaller baselines. The play screens now run on the stepped clock (design.md, "Changes made during implementation"), with no game code change. Two full runs: 76 of 80 stills equal (71 at exactly 0 px). The 4 that differ all differ in the terminal area only: that is the game's font race (`terminal-designer`), not the audit. A full run takes 464 s, down from 1071. Scoped runs merge. Smaller baselines: there is no lossless gain (Chrome's PNGs are already smaller than a pngjs re-encode, and a frame has about 27k colours), so the size stays. The baselines from the old method are outdated: task 6 waits for the user to approve the new stills.
- 2026-11-18, end: the user approved the new stills and the font fix ("I confirm, go"). The terminal font race is fixed in `src/ui/terminal.ts`. `--update` rewrote all 80 baselines. The verification run then reported 80 of 80 `same` against them. It still exits 1, because of game findings (text overflow, font fallbacks, overlaps at 1024x768, the favicon 404), as Req 12 intends. Tasks 6 and 10 are done.

