---
inclusion: fileMatch
fileMatchPattern: "{src/comix-editor/**,src/editor-core/**,src/cinematic/**,pages/comix-editor.html,src/styles/editor-workstation.css,src/styles/comix-editor.css,scripts/harness/lib/comix-*.mjs,scripts/harness/lib/editor-api-common.mjs}"
---

# Comix editor & runtime rules

Facts for `src/cinematic/`, `src/comix-editor/` (built on `src/editor-core/`), `pages/comix-editor.html`, `src/styles/{editor-workstation,comix-editor}.css`, and `scripts/harness/lib/comix-*.mjs`. Contracts: `declarative-comix.md`, `.kiro/specs/declarative-comix-runtime/`, and `.kiro/specs/comix-editor/`. Procedure: skills `comix-editor`, `comix-implementer`.

- **Zero hardcoded scenes.** Neither `src/cinematic/` nor `src/comix-editor/` nor `src/editor-core/` may name a sequence slug, page ID, panel ID, or scene-specific role (`scripts/quality/check-declarative.mjs`).
- **Tables and shared selection.** `schema*.ts` exhaustively describes every `spec-types.ts` union; `editor-core/form.ts` renders items with `data-item-path` and `selectPath`; `src/comix-editor/selection.ts` handles bidirectional routing, `visibilityJumpForElement`, and in-place DOM sync (`syncInspectorSelectionDom` -> `syncSelectedDetailsDom`) so focused inputs keep focus.
- **3D & 2D viewport selection parity.** `.htc-panel` carries a `5px` border while `.htc-panel > canvas` sits inset `0`. `src/cinematic/editor-select.ts` (`pickComixElementAt`, `EditorSelectionOverlay`) must always measure `.htc-panel > canvas` for raycasting/marquees and exclude `world.room` shell geometry from raycasts.
- **Dev-only API.** `scripts/harness/lib/comix-api.mjs` (`editor-api-common.mjs`) must keep local Host & same-origin checks, `Content-Type: application/json`, JSON object bodies, strict connected spec path whitelisting, collision-safe atomic writes (`stringifyComixJson`), `409` etag conflict protection, and automatic `catalog-data.ts` regeneration.
- **Workstation UX & accessibility.** Build DOM via `h()` (no `innerHTML`), use `role="group"` for multi-control fields, keep all docks hidable/draggable/resizable with Focus mode (`src/editor-core/workspace.ts`, `dock-layout.ts`, `viewport-stage.ts`), preserve `/editor` compatibility when changing `src/editor-core/`, keep files `<= 600` lines / functions `<= 130` lines / `0` clones (`npm run quality`), and verify via `scripts/harness/editor-unit-test.mjs`, `scripts/harness/comix-editor-smoke.mjs`, `scripts/harness/editor-smoke.mjs`, and `.kiro/skills/comix-implementer/scripts/verify-comix.mjs`.
