# Declarative chapter runtime: requirements

Capability: the engine plays any chapter from its specs. No code names a chapter or a level. Contract: `.kiro/steering/declarative-chapters.md`.

## Requirements

1. WHEN a level is entered for the first time, THE SYSTEM SHALL run `script.arrival` (or, if absent, the dialog `agentTaunt` as a smug cameo) and print only the text the steps declare.
2. WHEN a level declares `script.tutorial`, THE SYSTEM SHALL show the first step whose `doneWhen` conditions do not hold, announce each completed step with its `doneText`, and mark the last step done when the level is cleared or `tutorial skip` runs.
3. WHILE `script.tutorial.hide.revealWhen` does not hold, THE SYSTEM SHALL hide that enemy and its file from the room, `ls`, `ps`-free views, completion, `kiro scan` and the enemy count.
4. WHEN `script.bullying` is set and the level has `after` or more commands and the count is a multiple of `every`, THE SYSTEM SHALL emit one line of `lines[]` in rotation, unless the level is solved.
5. WHEN `kiro load <core>` runs in a level with a `kiro_loaded` rule, THE SYSTEM SHALL use `script.kiro` (`loadRefusal`, `wrongCoreLine`, `reactions[core]`, `coreAliases`) and no built-in text.
6. WHEN a level sets `safe`, THE SYSTEM SHALL deal no damage and let enemies hold fire; WHEN it sets `holdEnemiesUntil`, THE SYSTEM SHALL freeze enemy ticks until the condition holds.
7. WHEN PID 1 of a boss level is killed, THE SYSTEM SHALL run `script.onBossKill`; WHEN the final exit succeeds, THE SYSTEM SHALL run `manifest.outro.finale` with `{rank}`, `{commands}`, `{scrap}`, `{scrapTotal}`.
8. WHEN a level is entered directly, THE SYSTEM SHALL give the RAM, SSD and Kiro core summed from `manifest.grants` with `afterLevel` below the start level.
9. THE SYSTEM SHALL read the codex from `BESTIARY_DOSSIER` plus `manifest.dossier`, the ally name from `manifest.allyNpc`, the closing scene from `manifest.outro`, and the cameo from `manifest.boss`.
10. WHEN a session is created with `pack`, THE SYSTEM SHALL play that pack instead of the compiled catalog; WHEN `preview` is set, THE SYSTEM SHALL record no progress, scrap, perks or telemetry.
11. IF runtime code under `src/` contains a chapter id, a level id or a branch on a level number greater than 1, THEN `npm run quality:declarative` SHALL fail.
12. WHEN a `kind` is added to `ScriptStep`, `ScriptCond` or `WinRule`, THE BUILD SHALL fail until `schema.ts` has a form for it.
13. WHEN a spec mentions a file, socket, enemy, core, model or room that does not exist, or a key or type the field tables do not know, `generate-chapter.mjs --validate` SHALL report it and exit 1 for errors.
14. WHEN `generate-chapter.mjs --verify` runs, THE SYSTEM SHALL play every level's `solutionCommands` under enemy ticks and fail on any unsolved level or death.

## Verification

| Req | Check |
|---|---|
| 1-8, 10 | `node scripts/harness/generate-chapter.mjs --verify`; `node .kiro/skills/chapter-level-generator/scripts/self-test.mjs` |
| 9 | self-test (`dossierOf`, outro actors), `editor-smoke` |
| 11 | `npm run quality:declarative` |
| 12 | `npx tsc --noEmit` |
| 13, 14 | `node scripts/harness/generate-chapter.mjs --validate` / `--verify` |
