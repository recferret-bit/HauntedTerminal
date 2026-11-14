---
inclusion: fileMatch
fileMatchPattern: "{comix/**,src/cinematic/**,src/comix-editor/**}"
---

# Declarative comix

The cinematic player is a generic 3D comic engine. A comix sequence is data. **No code in `src/cinematic/` or `src/comix-editor/` may name a specific scene, page, line, or role.** Everything rendered or played comes from connected specs in `comix/<slug>/`, compiled to `src/cinematic/generated/catalog-data.ts` and played by generic primitives. Procedure for humans and agents: skills `comix-architect-intake`, `comix-sequence-generator`, `comix-implementer`, and `comix-editor`.

## Connected layout (`comix/<slug>/`)

| What | File | Played / checked by |
|---|---|---|
| Sequence metadata, `durationSec`, `holdAtEnd`, `skip`, shared `cues`, 3D `stage` (`room`, `background`, `points`, `props`, `fixtures`), `cast`, and ordered `pages[]` summaries (`specPath`) | `comix.manifest.json` | `src/cinematic/play-pack.ts`, `timeline.ts`, `set.ts` |
| Self-contained page window (`from`, `until`), local `cues`, 3D page-flip `turn`, `overlays`, page `tracks`, and `panels[]` (`layout`, `camera`, `letters`, `beats`, `tracks`) | `pages/page-XX-<slug>/page.spec.json` | `tracks.ts`, `beats.ts`, `letters-build.ts`, `letters-draw.ts` |
| Human-readable sequence overview & page/panel timing table | `README.md` | `scripts/harness/validate-comix.mjs` |

The full vocabulary is typed in: #[[file:src/cinematic/spec-types.ts]]

## Rules

1. **Connected, self-contained pages only.** Never split a sequence into disconnected horizontal files (`marks.json`, `letters.json`, `camera.json`, `poses.json`, ...). Every JSON file inside `comix/<slug>/` must be `comix.manifest.json` or a `pages/page-XX-<slug>/page.spec.json` declared in `manifest.pages`, and page/panel tracks stay bounded to `[page.from, page.until]` (except open-ended hold tracks on the final page when `holdAtEnd` is `true`).
2. **Spec first.** Extending the vocabulary requires updating four places together: `src/cinematic/spec-types.ts`, the generic runtime in `src/cinematic/`, the editor form tables in `src/comix-editor/schema*.ts` (exhaustively typed against `kind` unions), and `src/cinematic/simulate.ts` / `src/comix-editor/check.ts`.
3. **Generated is output.** Never hand-edit `src/cinematic/generated/` (a hook blocks it). Edit `comix/<slug>/` and run `node scripts/harness/generate-comix.mjs`.
4. **One JSON writer.** `scripts/harness/lib/comix-json.mjs` (`stringifyComixJson`) is used by `/comix-editor` and CLI scripts so saving an untouched spec changes zero bytes.
5. **Existing asset ids only** (`ModelCatalog`, `FxCatalog`). Missing models or FX belong to `[ASSET PCG]` skills.

## Humans tune, agents verify

Humans review, click-select 2D/3D elements bidirectionally, scrub timestamps, and tweak sequences in `/comix-editor` (etag-guarded `409` conflict protection + external disk-change reload; see `.kiro/steering/comix-editor-rules.md` and `.kiro/specs/comix-editor/`). Finish any comix change with:
- `node .kiro/skills/comix-implementer/scripts/verify-comix.mjs` (or `node scripts/harness/generate-comix.mjs --verify` + `node scripts/harness/validate-comix.mjs`)
- `node scripts/harness/comix-editor-smoke.mjs` when `src/comix-editor/`, `src/cinematic/editor-select.ts`, `src/cinematic/preview.ts`, or `scripts/harness/lib/comix-api.mjs` changed.
