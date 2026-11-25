# Tutorial: Kiro Ghost delivers the terminal: tasks

Approval: delegated by the user on 2026-11-25 ("do your best").

- [x] 1. `lead-dev`: event types (`ITEM_CARRIED`, `ITEM_GIVEN`, emote `shout`) in `src/contracts/events.ts`; `held: ItemId | null` in `src/game/{types,view-layouts,session,runtime}.ts`; `vibecoder.dev_bare` id in `src/contracts/inventory.ts`. Req 1, 7, 8. Gate: `npx tsc --noEmit` via `npm run quality`.
- [x] 2. `artist`: `vibecoder.dev_bare`, dimmer dark glow, `flyTo` tween with facing, glide entrance on it, `ITEM_CARRIED` / `ITEM_GIVEN` / `shout` on the stage. Req 1, 3, 4, 5, 6, 7. Gates: `validate-model --all --strict`, `check-tags --all`, `screenshot-lab --selftest`, `quality:fingerprint`.
- [x] 3. `chapters-designer`: `inventory.ts` empty hands, the four-place change for `carry_item`, `give_item`, `shout`; `session-snapshot.ts`; manifest and level 1 script. Req 1, 7, 8, 9, 10, 11. Gates: `generate-chapter.mjs --verify`, `verify-chapter.mjs`, `editor-unit-test.mjs`, `editor-smoke.mjs`, `property-tests --only chapters,gameplay`.
- [x] 4. `terminal-designer`: terminal `setAvailable`, items strip and HUD with `held: null`. Req 1, 2. Gates: `npm run quality`, `property-tests --only terminal`, `terminal-lab.mjs --all`.
- [x] 5. `lead-dev`: wire `setAvailable` in `src/play/`. Req 2. Gates: `npm run quality`, `npm run build`.
- [ ] 6. `qa`: real Chrome pass of level 1 and a later-level jump. Req 2-11. Report in `docs/qa/`.
