# Hero ouch comments: requirements

Status: draft

Capability: when the vibecoder takes damage he sometimes lets out a short, nerdy "ouch" as big yellow comic lettering over the stage. It is not a dialog box. It works like the hero's `HELLOOOO??` shout (`VIBECODER_EMOTE`, `src/renderer/stage-emote.ts`, lettering through `say`), and it is rare.

User's words, 2026-11-27: "lets add rare vibecoder commets about taking damage, not a dialog, like we have already for like heloooow. yellow big text. lets have like 20 different 1-2 nerd like words about ouch. add it to the specs properly."

## Requirements (proposed, not yet approved)

1. WHEN the vibecoder takes damage (`PLAYER_DAMAGED`, amount above 0) and the chance roll succeeds, THE SYSTEM SHALL letter one ouch word big and yellow (`#ffd166`) over the vibecoder's head, with no dialog box and no portrait.
2. THE SYSTEM SHALL pick the word from a list of 20 distinct ouch words of one or two words each, nerd flavoured (for example `SEGFAULT!`, `OFF-BY-ONE!`, `STACK OVERFLOW!`), kept as one declarative table.
3. THE SYSTEM SHALL NOT pick the same word twice in a row.
4. THE SYSTEM SHALL keep the comment rare: a chance per hit (proposed 1 in 4) plus a cooldown (proposed 3 hits) so two comments never come back to back.
5. WHEN the hit is lethal (`hpRemaining` 0), THE SYSTEM SHALL NOT letter a comment (the SEGFAULT tear plays instead).
6. WHILE a dialog box, the laptop or a modal is on screen, THE SYSTEM SHALL still letter the comment (it is not a dialog) and SHALL NOT delay or reorder any dialog.
7. THE SYSTEM SHALL make the roll deterministic under test (seeded), so headless runs and the property suites repeat.
8. THE SYSTEM SHALL NOT play in `preview`... (open, see questions).

## Out of scope

- A sound for the comment (the hit already has one).
- Comments on enemy damage, on pickups or on low HP.
- Per-level word lists in chapter specs.

## Decisions

**Q:** Is this a dialog? **A (user, 2026-11-27):** No. Big yellow lettering like `HELLOOOO??`.
**Q:** How many words? **A (user, 2026-11-27):** About 20 different, one or two words each, nerd like.
**Q:** How often? **A (user, 2026-11-27):** Rare.

## Open questions

- [ ] Where does the word table live? (a) `src/game/` as plain data, rolled in the session and sent as a `VIBECODER_EMOTE` with `emote: 'ouch'` (Recommended: replay-safe, testable headlessly, one place); (b) in the renderer only, rolled from `PLAYER_DAMAGED` (simpler, but not testable without Three and not seeded).
- [ ] How rare? (a) 1 in 4 hits with a 3 hit cooldown (Recommended); (b) 1 in 6 with no cooldown; (c) 1 in 3.
- [ ] Lettering: (a) the `shout` look (big, shake, hop) (more noise); (b) `say` big at the head, yellow, no shake (Recommended: calm, readable on every hit).
- [ ] Should it also appear in `preview`, labs and the Terminal Lab? (a) yes, labs absorb damage so no hits arrive (Recommended: no special case); (b) never.
- [ ] Final list of 20: accept the proposal below or edit it?

Proposed 20: `OUCH!`, `SEGFAULT!`, `NULL POINTER!`, `OFF-BY-ONE!`, `STACK OVERFLOW!`, `CORE DUMPED!`, `KERNEL PANIC!`, `404 HP!`, `EXCEPTION!`, `BUFFER BURN!`, `MEMORY LEAK!`, `RACE CONDITION!`, `DEADLOCK!`, `SYNTAX ERROR!`, `BAD SECTOR!`, `PACKET LOSS!`, `TIMEOUT!`, `UNDEFINED!`, `GIT BLAME!`, `REGRESSION!`.

## Verification

- A unit check on the table: 20 entries, all distinct, 1 to 2 words each, no repeat in a row, cooldown and chance honoured with a fixed seed.
- A property in `scripts/harness/props/gameplay.mjs`: over generated hit sequences, no two comments are adjacent, none on a lethal hit, never the same word twice in a row.
- `node scripts/harness/battle-unit.mjs`, `node scripts/harness/property-tests.mjs --only gameplay`, `node scripts/harness/generate-chapter.mjs --verify` (0 deaths unchanged), `npm run quality`, and a screenshot of the lettering in the storybook or a play frame.
