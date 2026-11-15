# Terminal Lab: design

## Pieces

```
pages/terminal-lab.html -> src/terminal-lab/main.ts -> app.ts (LabApp)
  ../editor-core/      workspace + docks, form, chrome (topBar, renderIssueList, renderJsonFilePane), game-preview
                       (GamePreviewShell, shared with /editor), play-frame (PlayFrame), console-dock, pollDisk
  lab-model.ts         the open lab: script, selection path, issues, repo baseline + etag
  lab-pack.ts          LabScript -> { pack: ChapterPack, config: LabConfig }      (pure)
  lab-frame.ts         GamePreviewShell + PlayFrame on /play/...?draft=1&lab=1; in-page window.__lab.swap + seq
  runner.ts            LabDriver steps -> StepResult[], transcriptOf               (no DOM, no rules)
  node-driver.ts       openLabSession: createChapterSession({ pack, preview, lab }) or createSession({ lab })
  frame-driver.ts      the same steps through window.__lab and __term
  run-control.ts       cursor, breakpoints, Record, replay after a scene change
  level-import.ts      ChapterPack + LevelDefinition -> LabScript (read-only toward chapters/)
  palette-drag.ts      HTML5 drag-and-drop from palette chips onto viewport stage (x coord) or Scene list (index)
  schema.ts            field tables (reuses chapter-editor/schema.ts) ; lab-check.ts  checkLab
  catalog.ts           palette from BESTIARY, PICKUP_INFO, ModelCatalog, RULE_VARIANTS, agents
  commands.ts, context.ts   command list from Tab completion; tips for the selection
  store.ts, disk.ts, repo.ts   browser library ; /api/terminal-lab ; save, reload, staleness
  hook.ts              window.__terminalLab
src/game/lab-*.ts      shared lab types, pattern/check matchers, riddle helpers, countdown & file tree
src/chapters/session-lab*.ts, session-riddle.ts, lab-config.ts   chapter lab session + config storage
scripts/harness/lib/terminal-lab-api.mjs, lab-run.mjs, lab-json.mjs, test-kit.mjs
```

## Decisions

- **One session option, two drivers.** `ChapterSessionOptions.lab: LabConfig` (`driver: 'chapter'`, default) and `ClassicSessionOptions.lab: LabConfig` (`driver: 'classic'`, `src/game/session.ts`) share `src/game/lab-*.ts`: damage is absorbed, the truce is off, the clock can be manual, props, riddles and checks are live. Per-level state is `LevelRuntime.lab` / classic `LabRuntimeState`, and `window.__lab.swap(packId, levelId)` swaps sessions inside `/play` without reloading the iframe or rebuilding the WebGL stage. A game session has `lab: null` and is unchanged.
- **The config is untrusted.** The game reads it from localStorage next to the draft, through `normaliseLabConfig`; a stale or partial entry cannot crash a command.
- **Explicit patterns.** `re:` marks a regular expression; anything else is text, so `/dev/null` is an answer, not a regex.
- **One source per fact.** `World.stateOf` and `World.cadence` feed both the stage and `inspect`; `ticksToTell` mirrors `tick`/`act` for the countdown; `enemiesHeld` holds both the world and the countdown; `dialogueEvent` builds every speech bubble.
- **Riddles are careful with doors.** Matched by absolute path; opening adds bits only to a locked door and never rewrites an open one.
- **Same transcript everywhere.** No wall-clock in `transcriptOf`; the browser reads answers from `__lab.execLog()` (recorded in lab games only), not the screen.
- **Repo like the editors.** The etag lives on the model; `pollDisk` on focus and every 5 s; 409 on any stale write.

## API

`GET /api/terminal-lab` · `GET /api/terminal-lab/etags` (`{dir,etags,files}`) · `PUT /api/terminal-lab/file {path,json,baseEtag}` -> `{etag,created,path}` or 409. `TERMINAL_LAB_DIR` moves the folder and `dir`/`path` report the active workspace-relative location.

## Lab script

```json
{ "id": "example", "title": "Example", "room": { "roomKind": "lab_hall", "floorTheme": 2, "mechanic": "terminal", "cwd": "/lab", "title": "Example", "summary": "One virus." },
  "player": { "ram": 0, "ssd": 0, "core": "" }, "clock": "manual", "enemyFire": "live",
  "setup": [{ "op": "enemy", "id": "virus-1", "type": "virus", "path": "/lab/virus.exe", "pid": 4001, "ppid": 1 }],
  "steps": [{ "op": "run", "line": "ls", "expect": { "stdout": "virus.exe" } },
            { "op": "run", "line": "kill -9 4001", "expect": { "events": ["ENEMY_KILLED"] } }] }
```
