---
name: chapter-editor
description: "[LEVEL GEN] Step 5 of level generation (human review and final tuning). The Chapter Editor page (`/editor`) selects a chapter, lists its levels and edits every spec file with schema-driven forms (overview, files, enemies, win rules and solution, script, dialogs, manifest, comic), previews the REAL game on the unsaved draft (play dialogs, animations and interactions, step the solution, fire single script steps), checks references and runs the headless solution, then saves back to `chapters/`. Use whenever a human wants to tune a chapter by hand, whenever a new spec field or script step kind is added (the editor schema must follow), whenever the declarative contract is in question (no per-chapter code), or when asked how to review a chapter visually."
---

# Chapter Editor (`chapter-editor`)

**Category: LEVEL GEN**, the human step after `chapter-implementer`. The contract is `.kiro/steering/declarative-chapters.md` (loaded when you touch chapter or editor files); terms are in `glossary.md`. The game is an engine and a chapter is data. The editor edits that data; it never owns a second copy.

## Run it

```bash
npm start                                  # dev server; then open http://localhost:5173/editor
# deep links: /editor/<chapter>/<level>?tab=script    /editor/<chapter>?tab=comic
node scripts/harness/editor-smoke.mjs      # headless Chrome drives the whole loop (own server on 5343)
```

Writing needs the dev server (`/api/chapters`, a Vite plugin that exists only under `vite serve`). A built site opens the editor read-only from the compiled catalog.

## What a human does there

| Tab | Edits | Source file |
|---|---|---|
| Overview, Files, Enemies & items, Rules & solution | the level world | `level.spec.json` |
| Script | arrival steps, tutorial cards, hidden enemy, recurring taunts, Kiro, boss-kill reaction. Each step has a ▶ button that fires its events on the live stage | `level.spec.json -> script` |
| Dialogs | banner, 3 hints, arrival taunt, completion | `story/dialogs.json` |
| Chapter / Speakers / Comic | manifest (grants, dossier, outro, finale), speaker colours, comic panels with the rendered page beside them | `chapter.manifest.json`, `story/*.json` |
| JSON | the raw file, applied to the draft | any |
| Check | static checks (references, asset ids, field tables) and the headless solution of this level or the chapter, on the draft | `validate-pack.ts`, `schema-check.ts`, `solve.ts` |

The right column is the game itself in an iframe (`/play/<chapter>/<level>?draft=1`): restart, type the next solution command, run the solution at a chosen speed, type any command, fire a raw event, read the event log. The draft travels through localStorage (`src/chapters/draft.ts`); a preview records no progress, scrap or telemetry.

Saving writes only changed files, refreshes the manifest's level summaries and recompiles `src/chapters/generated/`. **Saves are conflict-safe**: each file carries an etag; if someone else (an agent, git, another tab) changed it after the editor loaded it, the API answers 409, nothing is overwritten, and the header offers "Reload from disk". Ctrl/Cmd+S saves the current file.

## Canonical example

Do not copy a template; read a real, gated spec:
`chapters/chapter-01-kiroween/levels/level-04-hub-model-one/level.spec.json` (a hub: `arrival` = emote + dialogue + print, `kiro` = labels, `weak`/`weakUntilCore`, `wrongCoreLine`, `reactions`),
`.../level-01-tutorial-awakening/level.spec.json` (a tutorial: `tutorial` with `doneWhen` conditions and a `hide` enemy, `safe`, `holdEnemiesUntil`, `signalAliases`),
`.../level-11-boss-claude-core/level.spec.json` (`onBossKill`), and `chapter.manifest.json` (`grants`, `outro.finale`, `dossier`).
The vocabulary is `src/chapters/script-types.ts`; the field tables are `src/chapter-editor/schema.ts`.

## Code map (`src/chapter-editor/`)

| File | Job |
|---|---|
| `schema.ts` | **the field tables**: what each spec object is made of. Add a field and the form and the schema check both know it. Variant tables are typed by the spec unions: a new `kind` without a form fails `tsc` |
| `form.ts` | generic renderer for the tables (text, number, octal, select, lists, objects, maps, tagged unions with add/move/duplicate/remove) |
| `schema-check.ts` | validates a spec against the tables: unknown keys, missing or mistyped fields, bad options |
| `check.ts` | all static checks in one list (`validatePack` + `assetIssues` + `schemaIssues`), headless solve |
| `panes.ts`, `app.ts` | tabs, sidebar, save, conflict handling, routing |
| `chapter-model.ts` | editable copy, baselines (dirty), etags |
| `preview.ts` | iframe driver |
| `api.ts` | dev API client with a read-only fallback |

Node side: `scripts/harness/lib/chapter-api.mjs` (API, safety rules in `chapter-editor-rules.md`), `chapter-compile.mjs` (read chapters, render `catalog-data.ts`, etags), `chapter-json.mjs` (canonical JSON text).

## Adding a capability (the only allowed way)

1. Type it in `src/chapters/script-types.ts` (or `types.ts`).
2. Interpret it once in `src/chapters/script.ts` (or the session file that owns the concept). Pure step output goes through `stepOutput`, so the editor can play it too.
3. Add it to `src/chapter-editor/schema.ts` (hints explain `{tokens}`).
4. Check its references in `src/chapters/validate-pack.ts`.
5. Use it in a spec. A PreToolUse hook asks before you edit the vocabulary files; answer yes only when all four places change together.

## Common mistakes

- `if (levelId === ...)` or `spec.index === N` in `src/`. `npm run quality:declarative` fails; move it into `script`.
- Editing `src/chapters/generated/`. A hook blocks it; edit specs and run `node scripts/harness/generate-chapter.mjs`.
- Adding a field to the type but not to `schema.ts`: `generate-chapter.mjs --validate` warns "unknown field" on every spec that uses it, and the human cannot edit it.
- Rebuilding a level JSON from a template over human edits. Read the file from disk and patch only the fields the task names.
- Writing JSON with `JSON.stringify(x, null, 2)`: use `stringifyChapterJson` so a save does not reformat the file.
- A `taunt` step in a level whose `dialogs.json` entry has no `agentTaunt` and no `fallback` says nothing (the Check tab warns).
- Putting a model, room or enemy type in a spec that does not exist: asset ids are checked against the catalog; make the asset first (ASSET PCG).
- Weakening the dev API rules (origin, content type, existing files only, etag).

## Finish with

```bash
node scripts/harness/generate-chapter.mjs --verify     # static checks + 0-death headless playthrough of every level
npm run quality                                        # includes the declarative gate
node scripts/harness/editor-smoke.mjs                  # if src/chapter-editor/ or the dev API changed
```

Run them, fix everything they print, and report only what you ran.
