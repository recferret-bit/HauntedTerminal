---
inclusion: fileMatch
fileMatchPattern: "{chapters/**,src/chapters/**,src/chapter-editor/**,src/play/**,src/ui/**,src/pages/**}"
---

# Declarative chapters

The game is an engine. A chapter is data. **No code may name a chapter, a level or a level number.** Everything a player sees, hears or has to solve comes from `chapters/<slug>/` and is played by generic code. Terms: `glossary.md`. Procedure for humans and agents: skill `chapter-editor`.

## Where each thing lives

| What | File | Played by |
|---|---|---|
| Identity, ally, boss, `grants`, `outro`/`finale`, `dossier` | `chapter.manifest.json` | `src/chapters/session-*.ts` via `g.pack.manifest` |
| The world and how to win | `levels/*/level.spec.json` | `session-level.ts`, `session-rules.ts` |
| What happens: `script` | `level.spec.json -> script` | `src/chapters/script.ts` (the one interpreter) |
| Banner, 3 hints, taunt, completion, speakers | `story/dialogs.json` | `script.ts`, `session-meta.ts` |
| Comic pages | `story/comix.spec.json` | `scripts/harness/draw-comix.mjs`, comic reader |

The vocabulary of `script` is this file, so it cannot drift from the code: #[[file:src/chapters/script-types.ts]]

## Rules

1. **Spec first.** If the vocabulary cannot say it, extend it generically in four places, in one change: the type (`script-types.ts` / `types.ts`), the interpreter (`script.ts`), the editor form (`src/chapter-editor/schema.ts`), the checks (`src/chapters/validate-pack.ts`). Never `if (levelId === ...)`. A PreToolUse hook asks before you touch these files.
2. **Enforced, not remembered.** `npm run quality:declarative` rejects chapter ids, level ids and `spec.index === N` in `src/`. `schema.ts` variant tables are typed by the spec unions, so a new `kind` without a form fails `tsc`. `node scripts/harness/generate-chapter.mjs --validate` checks a spec against the field tables (unknown keys, wrong types, missing fields) and against files, enemies, sockets, cores and asset ids.
3. **Generated is output.** Never edit `src/chapters/generated/` (a hook blocks it). Edit specs, run `node scripts/harness/generate-chapter.mjs`.
4. **One JSON writer.** `scripts/harness/lib/chapter-json.mjs` (`stringifyChapterJson`) is the formatter of the editor and of agents; a no-op save changes zero bytes.
5. **Existing asset ids only** (`ModelCatalog`, `RoomKind`). A missing one is an ASSET PCG task.

## Humans tune, agents generate

People do final tuning in the Chapter Editor (`/editor`). The editor refuses to overwrite a file that changed on disk after it loaded it (etag, HTTP 409), and shows "Reload from disk" when an agent or git touched a file. Agents owe the same care:

- Read the spec from disk right before editing; change only the fields the task names. Never rebuild a level or story file from a template over human edits.
- Finish with `node scripts/harness/generate-chapter.mjs --verify` (static checks + 0-death headless playthrough). If `src/chapter-editor/` changed, also `node scripts/harness/editor-smoke.mjs`. Report only what you ran.
