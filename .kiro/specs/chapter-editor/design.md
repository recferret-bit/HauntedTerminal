# Chapter editor: design

## Pieces

```
pages/chapter-editor.html -> src/chapter-editor/main.ts -> app.ts
  ../editor-core/      shared dom, schema, form + form-state (data-item-path selection, remapArrayPaths),
                       schema-check, http, BasePackModel + FileBaselineTracker, dock-state/layout,
                       workspace (Ctrl/Cmd+S, Ctrl/Cmd+Shift+S, focus rescue), view-resizer,
                       viewport-stage, workstationChrome (shared with src/comix-editor/, zero cross-imports)
  api.ts ------------- fetch ---> scripts/harness/lib/chapter-api.mjs + editor-api-common.mjs --> chapters/*.json, src/chapters/generated/
  chapter-model.ts     BasePackModel + FileBaselineTracker (draft + baselines + etags + reloadFrom)
  chrome.ts            workstation top bar (no redirect links), Levels outliner, roving ARIA Inspector tablist
  schema.ts            field tables  --> editor-core/form.ts (render)  --> schema-check.ts (validate)
  check.ts             validatePack + assetIssues + schemaIssues ; solvePack
  preview.ts           centered ViewportStageController (/play/...?draft=1) + bottom Console & Walkthrough dock
```

## Decisions

- **Shared workstation core.** Layout/docking/forms/chrome/HTTP/baselines live in `src/editor-core/` and `src/styles/editor-workstation.css`; `/editor` and `/comix-editor` only add domain panes and previews (`check-layers.mjs` & `jscpd --threshold 0` enforce zero duplication or cross-editor imports).
- **Forms from tables.** One description per spec object drives rendering and validation, so they cannot disagree. Tagged unions are lazy (conditions contain conditions).
- **Preview is the game.** Same code path as a player; the only differences are `pack` from localStorage and `preview: true`.
- **Dirty = comparison.** `FileBaselineTracker` compares canonical JSON against baseline text.
- **Conflicts over locks.** Humans and agents both write the files; a content hash per file (etag) is checked on every write instead of a lock.
- **Dev-only API.** A Vite plugin with `apply: 'serve'`; a built site degrades to read-only.
- **Canonical JSON.** `chapter-json.mjs` reproduces the existing hand-formatted files (short arrays inline; story files also inline flat objects).
- **Hot reload safety.** A save recompiles `src/chapters/generated/catalog-data.ts`; `src/chapters/catalog.ts` self-accepts HMR updates to `./generated/catalog-data.js` in place (matching `src/cinematic/catalog.ts`), so Vite never triggers a disruptive full-page reload on `/editor`.

## API

`GET /api/chapters` · `GET /api/chapters/<slug>/etags` (`{etags,slugs}`) · `PUT /api/chapters/<slug>/file {path,json,baseEtag}` -> `{etag}` or 409 · `POST /api/chapters/<slug>/render-comix`.
