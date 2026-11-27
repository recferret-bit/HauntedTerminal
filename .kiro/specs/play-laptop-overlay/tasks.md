# Play laptop overlay: tasks

Status: see requirements.md

- [x] 1. Move the lab's action mapping to `src/laptop/app-bus.ts` (`laptopHear`) and use it in `src/laptop/lab/lab-page.ts`. _Req 6_. Gates: `node scripts/harness/laptop-unit.mjs`, `node scripts/harness/laptop-lab-smoke.mjs`, `npm run quality`
- [x] 2. Layer rule: `play/` may import `laptop/` in `scripts/quality/check-layers.mjs` and `.kiro/steering/architecture.md`. _Req 1_. Gates: `npm run quality:layers`
- [x] 3. `src/play/laptop.ts` + `src/styles/play-laptop.css`: open (carried check, closed lid, storage key or memory), Close button, dispose, focus return, no turn-timer hold. _Req 1, 2, 3, 4, 7_. Gates: `npx tsc --noEmit`, `npm run quality`
- [x] 4. Modal routing: `'laptop'` in `PlayModalKind` / `PlayModalTarget` / `OverlayId`; `F4` and the HUD slot in `src/play/input.ts`, `src/ui/hud.ts`, `src/ui/items-strip.ts`; Escape in `src/play/menu.ts`; `__laptopOverlay` hook in `src/play/loop.ts`. _Req 1, 2, 4, 5_. Gates: `node scripts/harness/architecture-unit.mjs`, `npm run quality`
- [x] 5. Headless check `scripts/harness/play-laptop-smoke.mjs` on `/play` at 1600x950 and 1280x820: slot dim and F4 ignored before `laptop` is carried; after a grant the slot click and F4 open the closed lid; clicking the lid boots it; Escape closes without the Esc menu; F4 toggles; turn timer not held; progress key absent in `?draft=1`. _Req 1-7_. Gates: `node scripts/harness/play-laptop-smoke.mjs`, `node scripts/harness/manual-smoke.mjs`, `node scripts/harness/generate-chapter.mjs --verify --ticks 3`
- [x] 6. Docs: `glossary.md` turn timer line, `tech.md` Laptop Lab line, `AGENTS.md` gates line. _All_. Gates: `npm run quality`, `npm run build`
