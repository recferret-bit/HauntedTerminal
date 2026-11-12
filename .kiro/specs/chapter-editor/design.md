# Chapter editor: design

## Pieces

```
pages/chapter-editor.html -> src/chapter-editor/main.ts -> app.ts
  api.ts ------------- fetch ---> scripts/harness/lib/chapter-api.mjs (Vite serve plugin)  --> chapters/*.json, src/chapters/generated/
  chapter-model.ts     draft + baselines + etags
  schema.ts            field tables  --> form.ts (render)   --> schema-check.ts (validate)
  check.ts             validatePack + assetIssues + schemaIssues ; solvePack
  preview.ts           iframe /play/...?draft=1 ; __term / __game hooks ; stepOutput for single steps
```

## Decisions

- **Forms from tables.** One description per spec object drives rendering and validation, so they cannot disagree. Tagged unions are lazy (conditions contain conditions).
- **Preview is the game.** Same code path as a player; the only differences are `pack` from localStorage and `preview: true`.
- **Dirty = comparison.** No flags to forget.
- **Conflicts over locks.** Humans and agents both write the files; a content hash per file (etag) is checked on every write instead of a lock.
- **Dev-only API.** A Vite plugin with `apply: 'serve'`; a built site degrades to read-only.
- **Canonical JSON.** `chapter-json.mjs` reproduces the existing hand-formatted files (short arrays inline; story files also inline flat objects).
- **Hot reload caveat.** A save recompiles `catalog-data.ts`, which reloads open game tabs; the editor page does not import it statically.

## API

`GET /api/chapters` · `GET /api/chapters/<slug>/etags` · `PUT /api/chapters/<slug>/file {path,json,baseEtag}` -> `{etag}` or 409 · `POST /api/chapters/<slug>/render-comix`.
