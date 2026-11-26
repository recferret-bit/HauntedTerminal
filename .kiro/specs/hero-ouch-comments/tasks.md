# Hero ouch comments: tasks

Status: done

- [x] 1. `src/game/ouch.ts` table and roll (req 2, 3, 4, 5, 7).
- [x] 2. `PLAYER_DAMAGED.ouch` in `src/contracts/events.ts`; roll in both `hurt` functions; `OuchState` on the chapter state, `Play` and the classic session (req 1, 7, 8).
- [x] 3. Stage lettering in `onPlayerDamaged`, selfcheck event (req 1, 6).
- [x] 4. Property in `scripts/harness/props/gameplay-fsm.mjs` (req 2 to 5). Gates: `property-tests.mjs --only gameplay`, `generate-chapter.mjs --verify`, `npm run quality`.
