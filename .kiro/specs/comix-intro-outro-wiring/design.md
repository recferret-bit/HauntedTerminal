# Comix intro outro wiring: design

Status: see requirements.md

## Findings from the code

- `src/play/boot.ts` sets `skipIntroPref` to true for every chapter session unless the URL has `?intro=1`. So the opening comix never plays for a chapter today, even with no progress. Classic sessions play it unless the saved skip preference is set.
- `src/play/outro.ts` `startRun` plays the `opening` comix when `skipIntroPref` is false, and the `ending` comix at the end of a run. Both are found by manifest `role`.
- Skip handling lives in the comix manifest (`skip: 'end' | SkipRule[]`) and the player; nothing to add for R6.

## Pieces

```
src/chapters/catalog.ts       new pure helper hasChapterProgress(progress, chapterId): true when any level has a cleared record
src/play/boot.ts              skipIntroPref for a chapter session = readSkipPref() || hasChapterProgress(readChapterProgress(), chapterParam), unless ?intro=1 forces the intro; lab, draft and directMidJump keep skipping
src/hub/comix-tiles.ts        buildComixTiles also takes the comix manifests (role opening or ending) and returns tiles with watchHref /cinematic.html?play=<id>, placed first; renderTile shows a single Watch button for them
src/hub/page-comix.ts         passes COMIX_MANIFESTS from src/cinematic/catalog.js
scripts/quality/check-layers.mjs, .kiro/steering/architecture.md   hub/ may import cinematic/catalog (data only)
scripts/harness/hub-unit.mjs  cases: both comix tiles first, hrefs, present with empty progress, chapter tiles unchanged
scripts/desktop/landing-smoke.mjs   Comix page shows two Watch links
```

## Decisions

- A "new game" is a chapter with no cleared level (Q2). A player who started but cleared nothing sees the intro again. This needs no new save field.
- The saved skip preference (`readSkipPref`) still wins, so a player who chose to skip stays skipped.
- `check-layers.mjs` lets `hub/` import only `contracts/` and `chapters/`. The comix manifests are compiled data, so the rule gains `cinematic/catalog`, changed together with `architecture.md`. The tile builder still takes the manifests as an argument.
- No slug appears in engine code; tiles come from manifest `role` and `id`.

## Risks

- `?intro=1` links built by `buildPlayUrl` keep forcing the intro; unchanged.
- Watch opens in the same tab; the cinematic page ends by its own end screen.
