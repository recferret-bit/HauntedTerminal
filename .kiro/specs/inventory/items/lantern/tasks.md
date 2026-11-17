# Lantern Item: tasks

- [x] 1. Lantern model & hero integration: maintain `buildLantern` in `src/procgen/archetypes/items/lantern.ts`, verified against `item` size budget and `human` zone rules. _Req 1, 2, 3_. Gates: `validate-model.mjs item.lantern vibecoder.dev --seeds 4`, `npm run quality:fingerprint`
- [x] 2. Gameplay & stage lighting: ensure `ls -a` raises lantern, triggers reveal events, and provides `ComicStage.light` source position. _Req 4, 5, 6, 7_. Gates: `laptop-unit.mjs`, `generate-chapter.mjs --verify`, `npm run quality`
