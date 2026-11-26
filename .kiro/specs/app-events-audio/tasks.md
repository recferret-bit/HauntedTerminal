# App events, SFX and music: tasks

- [x] Bus, catalogs, voice pool, both orchestrators, and `attachAudio` (`src/contracts/app-bus.ts`, `src/audio/`). Covers requirements 4, 5, 6 and 7. Gates: `node scripts/harness/audio-unit.mjs`, `npm run quality`
- [x] Sessions publish kernel events once. Terminal keys, commands, restarts and locks emit app events. Covers requirements 1 and 2. Gates: `node scripts/harness/audio-unit.mjs`
- [x] Play page scene, Esc menu, manual, timer, cinematic cues, laptop lab, and the landing pages. Covers requirements 2, 3 and 6. Gates: `node scripts/harness/audio-unit.mjs`, `node scripts/harness/audio-smoke.mjs`
- [x] `scripts/harness/audio-unit.mjs` checks every manifest name, the music priority, the pool of 10, and the bus. Glossary, architecture and the layer table name `src/audio/`. Covers requirements 4, 5 and 8.
- [x] Dialog voice lines: `DialogOrchestrator` `onOpen` publishes `dialog { speaker }` (`src/play/input.ts`); `speakerCue` maps the four agents to `taunt_<agent>_1..10`, `kiro` and unmapped speakers to `kiro_advice`..`kiro_advice_10`, `vibecoder` to `dialog_hero`; `nextPlayStyle` picks a random variant that differs from the previous one; speech buffers are prewarmed and trimmed; kernel `DIALOG_BOX` / `AGENT_TAUNT` play nothing (commit a98ab95). Covers requirement 9. Gates: `node scripts/harness/audio-unit.mjs`
