# Comix editor studio: design

```
src/editor-core/
  dom.ts, schema.ts, schema-check.ts, form.ts, form-state.ts, http.ts, file-tracker.ts
  dock-state.ts, dock-layout.ts, workspace.ts, drag.ts, view-resizer.ts, viewport-stage.ts, chrome.ts

src/comix-editor/
  api.ts            Dev /api/comix client (via editor-core/http) + compiled fallback
  model.ts          BasePackModel + FileBaselineTracker + syncSummaries()
  schema*.ts        Exhaustive Field[] tables against src/cinematic/spec-types.ts
  check.ts          Static schema/ref diagnostics + simulateComixPack() 60fps wrapper
  panes.ts          Inspector tabs, interactive 2D sheet boxes, JSON & Check panes
  chrome.ts         Workstation top bar (no external redirects), outliner, ARIA roving tablist
  selection.ts      routeForElement, resolveSelectionFromPath, visibilityJumpForElement, syncInspectorSelectionDom
  preview.ts        Centered Comix Viewport stage + bottom timeline dock + draft iframe bridge
  preview-bars.ts   Stage bar (.cx-sel-pill, zoom, Apply Shot, Focus) & transport bar
  sheet-drag.ts     2D panel layout rect drag/corner-resize & Alt+Arrow nudging
  app.ts            ComixEditorController, URL router, Selection sync & window.__comixEditor
```

## Bidirectional Selection Dataflow

```
  [Viewport Click / window.__comixEditor.pickViewportElement(x,y)]
      -> pickComixElementAt(world, x, y) [Letters -> Overlays -> 3D Raycast(actors,fixtures,props) -> Panel]
      -> EditorSelectionOverlay draws .htc-sel-box + .htc-sel-badge inside .htc-panel / host
      -> ComixPreview.onSelectElement(ref) -> app.handleViewportSelect(ref)
      -> opens Right Inspector if hidden, routes target/tab via routeForElement(),
         expands openDetails, renders, syncInspectorSelectionDom(..., scrollIntoView=true)

  [Inspector Item Click/Focusin or Layout Map Click or window.__comixEditor.selectElement(refOrPath)]
      -> form.ts bindSelectableItem() -> app.selectByItemPath(path) -> resolveSelectionFromPath(pack, path)
      -> visibilityJumpForElement(pack, ref, currentSec) seeks preview only if hidden at currentSec
      -> preview.setSelectedElement(ref) -> iframe cine.selectElement(ref) updates .htc-sel-box
      -> syncInspectorSelectionDom(paneEl, ref, scrollIntoView=false) keeps input focus intact
```

## Verification Architecture

- **Dev server API:** `scripts/harness/lib/comix-api.mjs` (`editor-api-common.mjs`) enforces localhost, same-origin checks, `Content-Type: application/json`, JSON object bodies, strict path whitelists (`comix.manifest.json` and `pages/page-*/page.spec.json`), collision-safe atomic temp-write + rename, `409` etag validation, and automatic regeneration of `src/cinematic/generated/catalog-data.ts`.
- **Unit & Corner-Case Suite:** `scripts/harness/editor-unit-test.mjs` verifies `sanitizeLayout`, `remapArrayPaths`, `SchemaWalk` finite-number/shape invariants, `ChapterModel`/`ComixModel` identity preservation & disk change detection, `routeForElement`/`resolveSelectionFromPath` across all 10 element kinds, and API security/atomic-write helpers.
- **Headless E2E:** `scripts/harness/comix-editor-smoke.mjs` tests layout at multiple viewports (`1600x960`, `1280x820`), dock hide/show/swap/float, bidirectional 2D letter / 3D actor / 3D prop / `page_track` / Inspector selection sync, draft preview, external page add/delete reload, `409` conflict handling, lossless saves, and API security rejections.
