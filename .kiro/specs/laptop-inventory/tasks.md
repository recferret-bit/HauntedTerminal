# Inventory and Laptop Lab: tasks

Status: done. Work done before the spec was written was re-verified against its gates after approval.

- [x] T1 Item models and the `item` category (Req 1). Built. Gates: model validator `--all --seeds 4`, model self-test, check-tags, storybook screenshot, fingerprint.
- [x] T2 Developer holds an item, `vibecoder.dev_laptop` (Req 2). Built. Gates: as T1; `vibecoder.dev` fingerprint unchanged.
- [x] T3 Inventory in both sessions and its commands (Req 3). Built. Gates: game self-checks (4 new conformance cases), `generate-chapter.mjs --verify`, `laptop-unit.mjs`.
- [x] T4 Laptop domain: machine, desktop, checks, tasks, keyboard, boot, geometry, progress (Req 5, 7, 8, 10). Built. Gate: `laptop-unit.mjs`.
- [x] T5 Runtime: sandboxed runner and sounds (Req 7, 9). Built. Gate: `laptop-lab-smoke.mjs`.
- [x] T6 UI and `/laptop-lab` page, `/dev` links, route, layer rules (Req 4-8). Built. Gates: `laptop-lab-smoke.mjs` at both sizes, `npm run quality`.
- [x] T7 Loop protection for page code and the preview watchdog (Req 9). New: `runtime/loop-guard.ts`, `__lg` in `bridge.ts`, guarded page runs and the stopped page in `runner.ts`. Gates: `laptop-unit.mjs` (transform cases), `laptop-lab-smoke.mjs` (endless page loops), `npm run quality`.
- [x] T8 Docs: `structure.md`, `tech.md`, `architecture.md`, `glossary.md`, `AGENTS.md`, the world lexicon, the kitbash and model-validator skill references (`item` category, thresholds). Gate: `npm run quality`.
- [x] T9 Final gates: `npm run quality`, model validator `--all --seeds 4`, game self-checks, `generate-chapter.mjs --verify`, fingerprint diff, both smoke sizes. Set every status to `done`.
