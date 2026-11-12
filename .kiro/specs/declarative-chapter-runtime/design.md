# Declarative chapter runtime: design

## Data flow

```
chapters/<slug>/*.json --(chapter-compile.mjs)--> src/chapters/generated/catalog-data.ts --(catalog.getChapterPack)--> ChapterPack
                                    editor draft (localStorage, ?draft=1) ------------------------------------------^
ChapterPack --> createChapterSession({ pack, preview }) --> ChapterState.pack --> session-*.ts, script.ts
```

`ChapterState.pack` replaces every `getChapterManifest(chapterId)` lookup. `preview` gates `recordLevelClear`, `recordTelemetry` and perks.

## Vocabulary (`src/chapters/script-types.ts`)

- Steps: `print`, `emote`, `spawn`, `kiro_action`, `say`, `taunt`, `dialogue`, `tutorial_step`.
- Conditions: `ran_command`, `file_absent`, `file_read`, `enemy_dead`, `any_enemy_dead`, `core_loaded`, `tutorial_skipped`, `any`, `all`.
- Level: `arrival`, `allySpeaker`, `safe`, `holdEnemiesUntil`, `signalAliases`, `tutorial`, `bullying`, `kiro`, `onBossKill`.
- Chapter: `grants`, `outro` (`caption`, `actors`, `finale`), `dossier`, `boss.cameoLabel`.

## Interpreter (`src/chapters/script.ts`)

- `stepOutput(step, env)` is pure: `{ events, print }`. `runSteps` supplies live state through `StepEnv`; the editor supplies draft state. One implementation plays a step in the game and in the preview.
- Tutorial step = first step whose `doneWhen` fails. Later conditions may imply earlier ones by listing them in the earlier step's `doneWhen`.
- Hidden enemy: `hiddenEnemyId`, `isNodeHidden`, `revealHidden` are the only hooks the room, `ls`, `kiro scan` and counts use.
- Kiro: `kiroStage`, `kiroIsWeak`, `coreMatches`, `coreReaction`.
- Templates: `{text}` `{boss}` `{rank}` `{commands}` `{scrap}` `{scrapTotal}` `{core}` `{foe}` `{kiro}` `{gguf}`; unknown tokens stay literal.

## Decisions

- `LevelRuntime.commandsRun` (a set of first words) feeds `ran_command`; `ls` on the room and `ps` register themselves.
- Semantic text stays in specs even when it repeats (a hub line in `dialogue` and in `print`): the player sees the bubble and the terminal line separately.
- The chaos seed defaults to the manifest id, not a literal.
- Engine-wide content that is not chapter-specific (malware codex cards, grimoire, perks) stays in `catalog.ts`.

## Guards

`scripts/quality/check-declarative.mjs` (patterns), typed variant tables in `schema.ts` (exhaustiveness), `schema-check.ts` (field tables), `validate-pack.ts` (references, completeness types for `RoomKind`/`EnemyType`/`PickupType`/`ChapterMechanic` lists), PreToolUse hook `guard-chapter-files`.
