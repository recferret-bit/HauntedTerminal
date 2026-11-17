# Terminal Item & Lab: tasks

- [x] 1. Terminal 3D model: implement `src/procgen/archetypes/items/terminal.ts` (`item.terminal`) as a handheld field cyberdeck slate with grip handle, phosphor screen, and solder keypad; validate size `0.25..0.6` and sockets. _Req 1, 2_. Gates: `validate-model.mjs item.terminal --seeds 4`, `npm run quality`
- [x] 2. Developer holding terminal: register `vibecoder.dev_terminal` with arm swing and handle behind hand; confirm `sockets.lantern` is omitted and stage lighting behaves cleanly. _Req 3, 4_. Gates: `validate-model.mjs vibecoder.dev_terminal --seeds 4`, `npm run quality:fingerprint`
- [x] 3. Starter inventory & commands: add `terminal` to `starterInventory()`, verify `hold terminal` and Tab completion, ensure zero regression in chapter and classic playthroughs. _Req 5_. Gates: `laptop-unit.mjs`, `generate-chapter.mjs --verify`
- [x] 4. Terminal Lab test bench: maintain `/terminal-lab` test bench workbench, fixtures, and Node/CDP verification suites. _Req 6, 7, 8, 9, 10_. Gates: `terminal-lab-unit.mjs`, `terminal-lab-api-test.mjs`, `terminal-lab.mjs --all`, `terminal-lab-smoke.mjs`
