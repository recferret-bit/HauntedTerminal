# Comix editor studio: tasks

- [x] 1. Build conflict-safe `/api/comix` dev plugin (`scripts/harness/lib/comix-api.mjs`, `comix-json.mjs`, `api.ts`, `model.ts`). _Req 1_
- [x] 2. Build schema-driven Inspector tables (`schema*.ts`), 2D Layout Mini-Map (`sheet-drag.ts`), diagnostics (`check.ts`), and datalists (`suggest.ts`). _Req 2_
- [x] 3. Implement centered Comix Viewport workstation with hidable/draggable/floatable/swappable docks, splitters, Focus mode, and edge/corner resizers (`src/editor-core/{workspace,dock-layout,dock-state,view-resizer,viewport-stage}.ts`, `preview*.ts`). _Req 3, 4_
- [x] 4. Wire shared selectable `<details data-item-path>` hooks in `src/editor-core/form.ts` preserving `/editor` (`editor-smoke.mjs`) and form input focus. _Req 5_
- [x] 5. Implement `src/comix-editor/selection.ts` and wire bidirectional selection between live viewport (`pickComixElementAt`, `EditorSelectionOverlay`), `.cx-sel-pill`, Inspector forms, `.panel-sec`, and `.layout-box` mini-map. _Req 5_
- [x] 6. Expose `selectedElement`, `selectElement`, and `pickViewportElement` on `window.__comixEditor` and verify end-to-end in `scripts/harness/editor-unit-test.mjs`, `scripts/harness/comix-editor-smoke.mjs`, and `npm run quality`. _Req 6_
