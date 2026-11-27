# Chapter editor stage studio: design

Status: see requirements.md

## Pieces

- `src/contracts/stage-editor.ts`: Pure interfaces (`StageActorRef`, `StageTransformPatch`, `StageEditorApi`) shared between `play/` (`window.__stageEditor`) and `chapter-editor/` with zero `THREE` imports.
- `src/renderer/stage-layout.ts`: Export inverse projection helpers `unplaceX(stage, worldX)` and `unplaceY(stage, worldY)` matching `placeX(stage, designX)`.
- `src/styles/game.css`: `body.stage-only` (hides `#terminal-dock`, `#stage-wrapper` fills 100% height) and `body.editor-hud-off` (hides `#topbar`, `#hud`, `#sandbox-toggle-btn`, `.skip-dialog-btn`, `.battle-callout`, `#outro`, keeping speech/dialog cards visible).
- `src/play/boot.ts`, `src/play/term-reveal.ts`, `src/play/loop.ts`, `src/play/lab.ts`: Shared in-place chapter session swap helper (`lab.ts` + `stage-editor.ts`), `?editor=1` stage-only boot, HUD toggle sync, Show-Hidden overlay support, and `aiPaused` guard.
- `src/play/stage-editor-pick.ts`, `src/play/stage-editor-gizmo.ts`, `src/play/stage-editor.ts`: `THREE` projection actor hit-testing (`pickStageActorAt`), DOM selection frame + corner scale (`⤡`) + top rotation (`⟳`) handles, 2D pointer drag with floor snap & `Shift` lock, live `applyActorTransform` updates, and `window.__stageEditor` API.
- `src/chapters/chapter-session.ts`, `src/chapters/session-level.ts`, `src/chapters/session-snapshot.ts`: Optional read-only preview extensions cleanly wired for editor `cwd` switch and `showHidden` stage actors (transparent alpha `0.55` for `appearWhen` pickups, hidden tutorial enemies, and pre-spawn Kiro) without altering gameplay behavior when unset.
- `src/chapter-editor/actor-mutator.ts`: Bidirectional mapping between `StageActorRef` and `ChapterModel` draft paths (`props[]`, `pickups[]`, `enemies[]`, `files[]`, `stage.hero`, `stage.entryPort`, `stage.kiro`, `stage.subdirs[cwd]`, `manifest.boss.cameoTransform`, `manifest.outro.actors[]`), live patch application, and `+ Add to Level` (`prop`, `enemy`, `pickup`, `door`, `socket`).
- `src/chapter-editor/dialog-runner.ts`: Collects every playable dialog beat from `level.spec.json`, `dialogs.json`, `riddles[]`, and `manifest` and executes compressed full sequence playback (`All Dialogs`, `Next Beat`, `Stop`) or single-beat triggers (`Run Dialog`).
- `src/chapter-editor/stage-studio.ts`, `src/chapter-editor/preview.ts`, `src/chapter-editor/panes.ts`, `src/chapter-editor/app.ts`: Replaces the bottom terminal command dock with the Stage Studio dock (Stage Bar HUD/Hidden/AI/Room controls + Restart/Dialog/Add/Test-Enemy/Kill/Open-in-Lab bar + Event Tester/Log), keeps live solution walkthrough buttons in `Check`, syncs Inspector selections bidirectionally, and persists drag/spawn changes via existing `/api/chapters` save pipeline.
- `src/styles/editor-workstation.css`, `src/styles/chapter-editor.css`: Stage Studio toolbar/button/log styling.
- `scripts/harness/editor-unit-test.mjs`, `scripts/harness/editor-smoke.mjs`: Unit & headless Chrome coverage for all new Stage Studio capabilities and drag -> Save -> disk persistence.

## Decisions

- **Keep `Play` / `ComicStage` WebGL ownership strictly inside `src/play/` & `src/renderer/`.** `src/editor-core/` and `src/chapter-editor/` stay `THREE`-free to satisfy `check-layers.mjs`; all camera matrix unprojection lives in `src/play/stage-editor-*.ts` behind `StageEditorApi`.
- **Share session-swap & actor transform helpers rather than duplicating `src/play/lab.ts`.** `src/play/` session teardown/reset logic is extracted cleanly so both `lab.ts` and `stage-editor.ts` stay DRY (`0` `jscpd` clones) and keep files well under 600 lines.
- **Explicit `actorId` -> `ChapterModel` resolver (`actor-mutator.ts`).** Every draggable stage entity resolves deterministically back to a draft JSON entry and Inspector `itemPath`, upgrading primitive `stage.hero` numbers to `{ x, ... }` objects on `y`/`scale`/`rotation` edit and clearing `socket` when dragged freely.

## Layers and gates

- Layer rules: no changes needed (`contracts/` -> `renderer/` -> `play/` holds `THREE`; `chapter-editor/` imports only `contracts/`, `editor-core/`, `game/`, `chapters/`, `procgen/`).
- Ownership (`scripts/harness/agents-build.mjs`): all new files live under existing owned prefixes (`src/contracts/**`, `src/play/**`, `src/styles/**` -> `lead-dev`; `src/chapter-editor/**`, `src/chapters/**` -> `chapters-designer`).
- `check-declarative.mjs`, `check-size.mjs` (`<= 600` lines/file, `<= 130` lines/fn), `check-cycles.mjs`, `check-deadcode.mjs`, `jscpd` (`0` clones), `check-specs.mjs`.
