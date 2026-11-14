# Declarative comix runtime: design

```
comix/<slug>/README.md + comix.manifest.json + pages/page-XX-<slug>/page.spec.json
     |  (scripts/harness/generate-comix.mjs)
     v
src/cinematic/generated/catalog-data.ts  (COMIX_PACKS, COMIX_MANIFESTS)
     |
     +--> src/cinematic/timeline.ts      (compileTimeline: cues, relative times, activePanelAt)
     +--> src/cinematic/play-pack.ts     (buildWorld -> world.actors/props/fixtures + draw loop)
     +--> src/cinematic/tracks.ts        (applyTracks at t using ModelCatalog + FxCatalog)
     +--> src/cinematic/beats.ts         (triggerBeats: fx, lightning, arc, look, state, audio)
     +--> src/cinematic/letters-build.ts & letters-draw.ts (2D bubbles, sfx, captions, stats, overlays)
     +--> src/cinematic/runner.ts        (deterministic fixed-step RAF + freezeAt / seek / skip)
     +--> src/cinematic/simulate.ts      (Node-compatible 60fps verifier without WebGL DOM)
     +--> src/cinematic/preview.ts & editor-select.ts (viewport zoom/pan, DOM + 3D raycast picking)
```

## Key Invariants

- **Exhaustive spec unions:** Every `kind` in `PanelLetter`, `PanelBeat`, `SceneTrack`, and `StageFixtureSpec` in `src/cinematic/spec-types.ts` is handled uniformly by runtime interpreters, editor schemas (`src/comix-editor/schema*.ts`), and static/60fps checks (`src/comix-editor/check.ts`).
- **3D & 2D coordinate parity for selection:** Panels carry a `5px solid` border while `.htc-panel > canvas` fills inset `0`. Hit-testing (`pickComixElementAt`) and marquee projection (`EditorSelectionOverlay`) measure `.htc-panel > canvas` and intersect orthographic rays against Cast `actors`, Stage `fixtures`, and `world.props` (never `world.room` shell geometry).
- **Single caller boundary:** Game code calls `playComix(slug, host, opts, stats, debug)` in `src/cinematic/index.ts`. No game, play, or engine module duplicates timeline compilation or hardcodes comix IDs.
