---
inclusion: fileMatch
fileMatchPattern: "{src/chapter-editor/**,scripts/harness/lib/**,pages/chapter-editor.html,src/styles/chapter-editor.css}"
---

# Chapter editor rules

Facts for code under `src/chapter-editor/` and the Node side in `scripts/harness/lib/chapter-*.mjs`. Contract: `declarative-chapters.md`. Procedure: skill `chapter-editor`.

- **Tables, not per-chapter code.** `schema.ts` is the only description of what a spec object contains; `form.ts` renders any table; `schema-check.ts` validates a spec against the same tables. Never add a UI branch for one chapter or level.
- **The editor owns no state the files do not have.** The draft is JSON; "dirty" is a comparison with the text last loaded or saved (`chapter-model.ts`); the game preview reads the draft from localStorage (`src/chapters/draft.ts`, `?draft=1`) and never records progress.
- **Reuse the game.** Preview, headless solve and step playback go through `createChapterSession`, `stepOutput` and the `__term` / `__game` hooks. Do not copy game rules into the editor.
- **Dev-only API.** `chapter-api.mjs` is a Vite `serve` plugin. It must keep: local Host and same Origin only, `Content-Type: application/json` required, whitelisted existing spec paths only, atomic writes, `baseEtag` conflict check (409). Weakening any of these needs a reason in the change.
- **Accessibility.** Build DOM with `h()` (text nodes, never `innerHTML`). Every control has a visible label or `aria-label`; tabs use `role="tablist"/"tab"/"tabpanel"` with `aria-selected`; status text lives in `role="status"`; colour is never the only signal (use `.sr` text); keep focus outlines.
- **Layers and limits.** `chapter-editor/` may import contracts, game, chapters, procgen (`scripts/quality/check-layers.mjs`). Files under 600 lines, functions under 130, no duplicate blocks. Run `npm run quality`.
- **Verification.** `node scripts/harness/editor-smoke.mjs` drives the real editor in headless Chrome; extend it when you add a capability.
