# Declarative comix runtime: tasks

- [x] 1. Define connected Comix spec vocabulary in `src/cinematic/spec-types.ts` and `expr.ts`. _Req 1, 2, 3_
- [x] 2. Convert `comix/intro/` and `comix/outro/` to connected `comix.manifest.json` + `pages/page-XX-<slug>/page.spec.json` + `README.md`. _Req 1_
- [x] 3. Implement timeline compiler (`timeline.ts`), stage builder (`set.ts`, `stage.ts`), and 60fps runner (`runner.ts`, `play-pack.ts`). _Req 2, 3, 4, 6_
- [x] 4. Implement generic interpreters for `tracks.ts`, `beats.ts`, `letters-build.ts`, and `letters-draw.ts` with `data-comix-*` element metadata. _Req 4, 5, 7_
- [x] 5. Implement `src/cinematic/simulate.ts`, `scripts/harness/validate-comix.mjs`, and `scripts/harness/generate-comix.mjs --check/--verify`. _Req 1, 8_
- [x] 6. Track `world.props` in `reel.ts`/`play-pack.ts` and implement viewport element picking + marquee overlay (`editor-select.ts`, `preview.ts`, `onDraw` hook). _Req 7_
- [x] 7. Gate zero hardcoded comix/page/level literals in `scripts/quality/check-declarative.mjs` and wire `.kiro/skills/comix-implementer/scripts/verify-comix.mjs`. _Req 8_
