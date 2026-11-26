# Hero ouch comments: requirements

Status: done

Capability: when the vibecoder takes damage he sometimes lets out a short, nerdy "ouch" as big yellow comic lettering over the stage. It is not a dialog box. It works like the hero's `HELLOOOO??` shout (`VIBECODER_EMOTE`, `src/renderer/stage-emote.ts`, lettering through `say`), and it is rare.

User's words, 2026-11-27: "lets add rare vibecoder commets about taking damage, not a dialog, like we have already for like heloooow. yellow big text. lets have like 20 different 1-2 nerd like words about ouch. add it to the specs properly."

## Requirements

1. WHEN the vibecoder takes damage (`PLAYER_DAMAGED`, amount above 0) and the chance roll succeeds, THE SYSTEM SHALL letter one ouch word big and yellow (`#ffd166`) over the vibecoder's head, with no dialog box and no portrait.
2. THE SYSTEM SHALL pick the word from a list of 20 distinct ouch words of one or two words each, nerd flavoured (for example `SEGFAULT!`, `OFF-BY-ONE!`, `STACK OVERFLOW!`), kept as one declarative table.
3. THE SYSTEM SHALL NOT pick the same word twice in a row.
4. THE SYSTEM SHALL keep the comment rare: a chance per hit (1 in 4) plus a cooldown (3 hits) so two comments never come back to back.
5. WHEN the hit is lethal (`hpRemaining` 0), THE SYSTEM SHALL NOT letter a comment (the SEGFAULT tear plays instead).
6. WHILE a dialog box, the laptop or a modal is on screen, THE SYSTEM SHALL still letter the comment (it is not a dialog) and SHALL NOT delay or reorder any dialog.
7. THE SYSTEM SHALL make the roll deterministic under test (seeded), so headless runs and the property suites repeat.
8. THE SYSTEM SHALL treat previews and labs like normal play: no special case (labs absorb damage, so no `PLAYER_DAMAGED` and no comment arrives there).

## Out of scope

- A sound for the comment (the hit already has one).
- Comments on enemy damage, on pickups or on low HP.
- Per-level word lists in chapter specs.

## Decisions

**Q:** Is this a dialog? **A (user, 2026-11-27):** No. Big yellow lettering like `HELLOOOO??`.
**Q:** How many words? **A (user, 2026-11-27):** About 20 different, one or two words each, nerd like.
**Q:** How often? **A (user, 2026-11-27):** Rare.
**Q (round 1):** Where does the word table live? **A (user, 2026-11-27):** approved the recommendation: `src/game/ouch.ts`, rolled in the session, so it is testable without Three.js and seeded. (Design detail: the word travels on `PLAYER_DAMAGED.ouch`, not on a new `VIBECODER_EMOTE` kind, so the four-place chapter vocabulary is untouched.)
**Q:** How rare? **A (user, 2026-11-27):** 1 in 4 hits with a 3-hit cooldown.
**Q:** Lettering? **A (user, 2026-11-27):** calm yellow lettering above the head, no shake.
**Q:** Previews and labs? **A (user, 2026-11-27):** treat like normal play.
**Q:** The 20 words? **A (user, 2026-11-27):** keep the proposed list: `OUCH!`, `SEGFAULT!`, `NULL POINTER!`, `OFF-BY-ONE!`, `STACK OVERFLOW!`, `CORE DUMPED!`, `KERNEL PANIC!`, `404 HP!`, `EXCEPTION!`, `BUFFER BURN!`, `MEMORY LEAK!`, `RACE CONDITION!`, `DEADLOCK!`, `SYNTAX ERROR!`, `BAD SECTOR!`, `PACKET LOSS!`, `TIMEOUT!`, `UNDEFINED!`, `GIT BLAME!`, `REGRESSION!`.
**Approval (user, 2026-11-27):** "i approve all, use recommendations" (requirements, design, tasks).

## Open questions

(none)

## Verification

- The property below covers the table (20 distinct, 1 to 2 words), the cooldown, the lethal hit and the repeat rule.
- Property in `scripts/harness/props/gameplay-fsm.mjs`: no comment on a lethal hit, never the same word twice in a row, at most one per 4 hits, an always-pass roll speaks on hits 1, 5, 9.
- `node scripts/harness/battle-unit.mjs`, `node scripts/harness/property-tests.mjs --only gameplay`, `node scripts/harness/generate-chapter.mjs --verify` (0 deaths unchanged), `npm run quality`, and a screenshot of the lettering in the storybook or a play frame.
