# Terminal Lab: tasks

- [x] 1. Lab session option `lab` on `ChapterSession`: absorbed damage, manual clock, props, `inspect`, `labTick`, `inject`; per-level state reset on reload. _Req 7, 8, 9_
- [x] 2. Shared preview: `PlayFrame`, `GamePreviewShell`, `console-dock`, `pollDisk`, `redrawKeepingFocus` in `editor-core/`, adopted by `/editor` and `/comix-editor`. _Req 1_
- [x] 3. Page shell, route (`/terminal-lab/<id>?tab=`), layer rule, declarative-gate area, `dev.html` link. _Req 1_
- [x] 4. Lab script types, `buildLabPack`, palette from the catalogs, field tables, Scene dock, browser library (autosave, New, Duplicate, Import, Export, Delete). _Req 2, 5, 11_
- [x] 5. Runner, Node and browser drivers, Script dock (Step, Run all, Run to here, breakpoints, Record, replay), `terminal-lab.mjs` CLI. _Req 5, 6_
- [x] 6. Riddles (path match, `re:` answers, hints, doors), tasks, checks, goals, speech ops, `inject`. _Req 3, 5_
- [x] 7. Commands panel with the not-implemented probe and the drift check; tips for the selection; World, Files, Transcript, Events and JSON tabs; attack countdown from the game. _Req 4, 9_
- [x] 8. Top bar (lab picker, Save/Revert/Reload from repo, clock, enemy fire, no-damage badge); dev API with etag conflicts. _Req 7, 8, 11_
- [x] 9. 28 committed labs: every enemy type and pickup (including an active crack paired with a worm + sealed port), classic floor driver, riddles, tasks, NPCs, inject, settings, no-damage soak. _Req 3, 7_
- [x] 10. `window.__terminalLab`, keyboard and ARIA pass; unit, API and smoke suites; `verify-chapter.mjs` runs the first three; save hook runs every lab. _Req 12_
- [x] 11. In-page session swap instead of an iframe reload on scene changes.
- [x] 12. Classic floors (`src/game/session.ts`) as a second driver.
- [x] 13. "Open this level in the lab": import a chapter level as a lab `setup`, read-only toward `chapters/`.
- [x] 14. Drag to place from the palette (in addition to click, onto the viewport stage or Scene list).

## Findings about the game (fixed)

- `readlink`, `ln`, `pkill`, `tutorial` and `logout` are implemented in the chapter shell and match Tab completion, `help` and `man` (0 missing commands in both chapter and classic probes).
- `man` with no argument prints a usage prompt instead of `null`.
- Placing a `crack` from the palette binds `helps` to an existing `worm` (ensuring a sealed port directory) or places a paired `worm` + sealed `port_445` directory so it acts immediately (`enemy-crack.lab.json`).
