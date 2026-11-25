# App events, SFX and music: tasks

- [x] Bus, catalogs, voice pool, both orchestrators, and `attachAudio` (`src/contracts/app-bus.ts`, `src/audio/`). Covers requirements 4, 5, 6 and 7.
- [x] Sessions publish kernel events once. Terminal keys, commands, restarts and locks emit app events. Covers requirements 1 and 2.
- [x] Play page scene, Esc menu, manual, timer, cinematic cues, laptop lab, and the landing pages. Covers requirements 2, 3 and 6.
- [x] `scripts/harness/audio-unit.mjs` checks every manifest name, the music priority, the pool of 10, and the bus. Glossary, architecture and the layer table name `src/audio/`. Covers requirements 4, 5 and 8.
