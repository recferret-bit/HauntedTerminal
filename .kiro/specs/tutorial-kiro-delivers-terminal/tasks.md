# Tutorial: Kiro Ghost delivers the terminal: tasks

Approval: delegated by the user on 2026-11-25 ("do your best").

- [x] 1. `lead-dev`: event types (`ITEM_CARRIED`, `ITEM_GIVEN`, emote `shout`) in `src/contracts/events.ts`; `held: ItemId | null` in `src/game/{types,view-layouts,session,runtime}.ts`; `vibecoder.dev_bare` id in `src/contracts/inventory.ts`. Req 1, 7, 8. Gate: `npx tsc --noEmit` via `npm run quality`.
- [x] 2. `artist`: `vibecoder.dev_bare`, dimmer dark glow, `flyTo` tween with facing, glide entrance on it, `ITEM_CARRIED` / `ITEM_GIVEN` / `shout` on the stage. Req 1, 3, 4, 5, 6, 7. Gates: `validate-model --all --strict`, `check-tags --all`, `screenshot-lab --selftest`, `quality:fingerprint`.
- [x] 3. `chapters-designer`: `inventory.ts` empty hands, the four-place change for `carry_item`, `give_item`, `shout`; `session-snapshot.ts`; manifest and level 1 script. Req 1, 7, 8, 9, 10, 11. Gates: `generate-chapter.mjs --verify`, `verify-chapter.mjs`, `editor-unit-test.mjs`, `editor-smoke.mjs`, `property-tests --only chapters,gameplay`.
- [x] 4. `terminal-designer`: terminal `setAvailable`, items strip and HUD with `held: null`. Req 1, 2. Gates: `npm run quality`, `property-tests --only terminal`, `terminal-lab.mjs --all`.
- [x] 5. `lead-dev`: wire `setAvailable` in `src/play/`. Req 2. Gates: `npm run quality`, `npm run build`.
- [ ] 6. `qa`: real Chrome pass of level 1 and a later-level jump. Req 2-12. Gates: `node scripts/harness/play-browser.mjs`. Report: `docs/qa/<date>-tutorial-kiro-delivers-terminal.md`.
- [x] 7. `terminal-designer` (src/ui) / `lead-dev` (src/play, src/styles) (from code, commit 8536a3f): first-show visor boot of the terminal (`src/ui/term-boot.ts`, `src/ui/term-boot-pixel.ts`, `matrixBoot` in `src/ui/screen.ts`, `src/play/term-reveal.ts`, `matrix-boot` CSS in `src/styles/game.css`, `term_boot` cue), `setAvailable(on, pop)` (the `pop = true` parameter came in commit d60199c in `src/ui/terminal.ts`; commit 8536a3f added it to `src/ui/terminal-types.ts` and the `setAvailable(true, false)` call in `src/play/term-reveal.ts`). Req 12. Gates: `npm run quality`, `npm run build`, `node scripts/harness/audio-unit.mjs`.
