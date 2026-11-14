# Comix editor studio: design

```
src/comix-editor/
  api.ts            Dev /api/comix client + etag ConflictError + compiled fallback
  model.ts          Baseline vs draft tracking, syncSummaries(), etags
  schema*.ts        Exhaustive Field[] tables against src/cinematic/spec-types.ts
  check.ts          Static schema/ref diagnostics + simulateComixPack() 60fps wrapper
  panes.ts          Inspector tabs, interactive 2D sheet boxes, JSON & Check panes
  chrome.ts         Top bar (no external redirects), outliner, ARIA roving tablist
  selection.ts      routeForElement, resolveSelectionFromPath, visibilityJumpForElement, syncInspectorSelectionDom
  preview.ts        Centered Comix Viewport + bottom timeline dock + draft iframe bridge
  preview-bars.ts   Stage bar (.cx-sel-pill, zoom, Apply Shot, Focus) & transport bar
  view-resizer.ts   Symmetric edge/corner viewport resize + keyboard nudge + wheel zoom
  workspace.ts      Hidable dock toggles, Focus/Zen mode, restore pill, persistence
  dock-layout.ts    Splitters, drag-to-float windows, left/right swap & snap-dock
  drag.ts           Shared pointer-capture + drag threshold engine
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

- **Dev server API:** `scripts/harness/lib/comix-api.mjs` enforces localhost, same-origin checks, `Content-Type: application/json`, strict path whitelists (`comix.manifest.json` and `pages/page-*/page.spec.json`), atomic temp-write + rename, `409` etag validation, and automatic regeneration of `src/cinematic/generated/catalog-data.ts`.
- **Headless E2E:** `scripts/harness/comix-editor-smoke.mjs` tests layout at multiple viewports (`1600x960`, `1280x820`), dock hide/show/swap/float, bidirectional 2D letter / 3D actor / 3D prop / Inspector selection sync, draft preview, external page add/delete reload, `409` conflict handling, lossless saves, and API security rejections.
