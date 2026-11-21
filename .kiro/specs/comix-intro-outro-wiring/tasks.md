# Comix intro outro wiring: tasks

Status: done

- [x] 1. Add `hasChapterProgress(progress, chapterId)` to `src/chapters/catalog.ts`. Covers R4, R5. Gates: `tsc --noEmit`, `hub-unit.mjs`.
- [x] 2. In `src/play/boot.ts`, make a chapter session skip the opening only when the skip preference is saved or the chapter has progress; `?intro=1` still forces it; lab, draft and mid-jump keep skipping. Covers R4, R5, R6. Gates: `tsc --noEmit`, `npm run quality:declarative`, a headless play check on a fresh and a saved profile.
- [x] 3. Allow `hub/` to import `cinematic/catalog` in `scripts/quality/check-layers.mjs` and `.kiro/steering/architecture.md`. Covers R7. Gate: `npm run quality:layers`.
- [x] 4. Extend `src/hub/comix-tiles.ts` with Intro and Outro tiles (manifest role `opening`, `ending`), a Watch link to `/cinematic.html?play=<id>`, listed first; pass `COMIX_MANIFESTS` from `src/hub/page-comix.ts`. Covers R1, R2, R3, R7. Gates: `tsc --noEmit`, `quality:declarative`.
- [x] 5. Add unit cases to `scripts/harness/hub-unit.mjs` and update `scripts/desktop/landing-smoke.mjs` for two Watch links. Covers R1 to R3. Gates: `node scripts/harness/hub-unit.mjs`, `landing-smoke`.
- [x] 6. Run `npm run quality`, `node scripts/harness/generate-chapter.mjs --verify`, and refresh the `comix` visual baseline request for the user (never approve baselines). Update `AGENTS.md`/steering if touched.
