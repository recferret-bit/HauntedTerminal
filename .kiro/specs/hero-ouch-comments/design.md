# Hero ouch comments: design

Status: done

- `src/game/ouch.ts` (pure, three-free): `OUCH_WORDS` (20), `createOuch(random)`, `rollOuch(state, hpRemaining)`. Chance 1 in 4 per hit, cooldown 3 hits after a comment, no word twice in a row, nothing on a lethal hit.
- Rolled where the hit is created: `hurt` in `src/chapters/session-level.ts` (chapter session; the random is `seededRandom(pidSeed + 1)` when `pidSeed` is set) and `hurt` in `src/game/runtime.ts` (classic session). Each session owns one `OuchState`. Labs return before the event, so they never roll.
- `PLAYER_DAMAGED` gains optional `ouch?: string` (`src/contracts/events.ts`). Rejected: a new `VIBECODER_EMOTE` kind, which would touch the four-place chapter vocabulary (types, interpreter, editor forms, pack checks) for something no script uses.
- `onPlayerDamaged` (`src/renderer/stage-event-combat.ts`) letters it with `say` in `#ffd166`, size 1.5, over the hero's head. No shake, no sound, no dialog box.
- Rejected: rolling in the renderer (not seeded, not testable without Three).
