---
inclusion: fileMatch
fileMatchPattern: "{src/chapter-editor/**,src/editor-core/**,scripts/harness/lib/**,pages/chapter-editor.html,src/styles/editor-workstation.css,src/styles/chapter-editor.css}"
---

# Chapter editor rules

Facts for code under `src/chapter-editor/` (built on `src/editor-core/`) and the Node side in `scripts/harness/lib/chapter-*.mjs`. Contract: `declarative-chapters.md`, `.kiro/specs/chapter-editor/`. Procedure: skill `chapter-editor`.

- **Tables, not per-chapter code.** `schema.ts` is the only description of what a spec object contains; `editor-core/form.ts` renders any table with `data-item-path` selection; `schema-check.ts` validates a spec against `editor-core/schema-check.ts`. Never add a UI branch for one chapter or level.
- **The editor owns no state the files do not have.** The draft is JSON; "dirty" is a comparison with the text last loaded or saved (`chapter-model.ts` / `FileBaselineTracker`); the game preview reads the draft from localStorage (`src/chapters/draft.ts`, `?draft=1`) and never records progress.
- **Reuse the game & shared workstation core.** Preview, headless solve and step playback go through `createChapterSession`, `stepOutput` and the `__term` / `__game` hooks. Do not copy game rules into the editor, and keep shared layout/form/chrome/HTTP/stage abstractions in `src/editor-core/` (without importing `src/comix-editor/`).
- **Dev-only API.** `chapter-api.mjs` (`editor-api-common.mjs`) is a Vite `serve` plugin. It must keep: local Host and same Origin only, `Content-Type: application/json` required, JSON object bodies, whitelisted existing spec files only, collision-safe atomic writes, `baseEtag` conflict check (409), and `{ etags, slugs }` external disk-change detection. Weakening any of these needs a reason in the change.
- **Workstation UX & accessibility.** Build DOM with `h()` (text nodes, never `innerHTML`). Keep top bar single-row without redirect links or horizontal scroll; keep docks hidable/draggable/floatable/resizable with Focus mode (`` ` ``) and focus rescue; use `role="group"` (never multi-input `<label>`) for multi-control fields; render Check issues with `<button class="issue-jump">`; use roving `[role="tablist"]` owning only `[role="tab"]`; expose status/log via `role="status"`/`role="log"` and semantic `<th scope="col">` tables.
- **Layers and limits.** `editor-core/` imports `contracts/` only; `chapter-editor/` may import `contracts/`, `editor-core/`, `game/`, `chapters/`, `procgen/` (`scripts/quality/check-layers.mjs`). Files under 600 lines, functions under 130, 0 duplicate blocks (`jscpd`). Run `npm run quality`.
- **Verification.** `node scripts/harness/editor-unit-test.mjs` tests layout/form/schema/model/API corner cases; `node scripts/harness/editor-smoke.mjs` drives the real editor in headless Chrome (desktop & compact viewports); extend both when you add a capability.
