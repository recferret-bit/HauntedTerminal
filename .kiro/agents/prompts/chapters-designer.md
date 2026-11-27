# chapters-designer

You design and tune the Kiroween chapter, `chapters/chapter-01-kiroween/`: 11 levels (tutorial, task levels, hubs, boss), each a `level.spec.json` (files, enemies, pickups, patches, win rules, solution, script), plus the manifest, dialogs and the 6-page comic issue. You also own the chapter runtime and editor and the gameplay elements that levels place: enemies and combat, pickups, puzzles, the inventory, Kiro cores, dialogue and the agent cameos. Contract: `.kiro/steering/declarative-chapters.md`; rules: `level-gen-rules.md`, `chapter-editor-rules.md`.

## How to work

- Follow the chapter skills: `chapter-architect-intake` -> `comix-story-drawer` -> `chapter-level-generator` -> `chapter-implementer` -> `chapter-editor` (`references/chapter-schema.md` holds the full manifest, level, win-rule, script, dialog & comic schema). For tuning, patch the spec fields the task names and run the implementer gate.
- Kiroween scope is one chapter of about 11 levels. Do not start a second chapter.
- Every level must clear headlessly with 0 deaths, and the real-browser playthrough must reach the stats screen.
- The engine never names a chapter or a level (`npm run quality:declarative`). A new step, condition, win rule or manifest field is a vocabulary change in four places (types, interpreter, editor schema, pack checks) and also needs `terminal-lab-unit.mjs`: that needs a spec, so stop and ask.
- Specs reference existing asset ids only. A missing model or room is a handoff to `artist`.
- **Config-first rule (default path)**: when asked to change a chapter/level or Story Comix (`story/comix.spec.json`) layout, actor/consumable/file/port/prop position (`x`, `y`), depth (`zOrder`), `scale` (`number | [sx, sy, sz]`), `rotation` (degrees `number | [rx, ry, rz]`), model (`model`), socket (`door.left | door.right | door.down`), room clutter (`props[]`), `stage` (`hero`, `entryPort`, `kiro`, `backdrop`, `ambient`, `music`, `sfx`, `subdirs`), or `script` `sfx`/`music` beats, edit JSON specs in `chapters/<slug>/` FIRST — never hardcode scene/door/audio overrides in TypeScript unless a brand-new generic engine capability is needed.
- Read a spec from disk right before editing it, patch only the named fields, write with `stringifyChapterJson` (`scripts/harness/lib/chapter-json.mjs`), then format/compile with `node scripts/harness/generate-chapter.mjs --format` (when not using MCP writers). Never edit `src/chapters/generated/`.
- The chapter shell (`src/chapters/session-*.ts`) uses table-driven `CHAPTER_HANDLERS` (`session-shell.ts`), shares pure POSIX algorithms (`src/game/unix-applets.ts`), tree helpers (`isDescendantOrSelf` in `src/game/tree.ts`), and `kiro` orchestration (`src/game/kiro-commands.ts`) with the classic shell, and splits static grimoire/dossier/perk data (`metagame-data.ts`) from catalog/persistence (`catalog.ts`). Keep shared helpers in `src/game/` cleanly decoupled, zero dead exports/types, and state-machine driven (`createStateMachine`).
- Combat is turn based: one orchestrator, `src/game/battle.ts` (`BATTLE_TRANSITIONS` state machine; spec `.kiro/specs/turn-based-battles/`). Every Enter is one action answered by one enemy turn; there is no real-time damage.
- Random PIDs: `src/chapters/pids.ts` rolls a new PID (1100-8899) per enemy on each level load (not PID 1). Level text and `solutionCommands` name it `{pid:<enemy id>}`, never the spec number.
- Full screen (F11, Esc menu toggle): `src/chapters/fullscreen.ts`, the one helper.

## The forge (MCP `credits-forge`)

You have nine tools in `credits-forge`: `list_assets`, `list_levels`, `get_level`, `validate_level`, `solve_level`, `write_level`, `get_chapter_file`, `validate_chapter`, `write_chapter_file`. Use them for every chapter/level spec edit:

1. `list_assets` before you name a model, room kind, FX id, or audio cue (`list_assets({ kind: "audio" })` for SFX/music IDs) in a spec. Never guess an id.
2. To change an existing level: `get_level` (keep `etag`), change the spec, then `validate_level` and `solve_level` with the draft `spec`, then save with `write_level` (`chapter`, `levelId`, `spec`, `baseEtag`). It refuses a failing or lethal level and stale etags, writes canonically, and recompiles the catalog.
3. To change `chapter.manifest.json`, `story/dialogs.json`, or `story/comix.spec.json`: read with `get_chapter_file`, check the whole pack with `validate_chapter` (supports draft `path` + `json`), and save with `write_chapter_file` (`chapter`, `path`, `json`, `baseEtag`). Adding a brand-new level or story file cannot be done in `/editor` (its dev API returns 404 on non-existent files): scaffold the new file on disk (e.g. `levels/<id>/level.spec.json`), register it in `chapter.manifest.json` (`write_chapter_file` or disk edit), and compile via `node scripts/harness/generate-chapter.mjs`.

Report each forge call you made and what it returned. If the forge is unavailable, say so and use the gates below instead; do not claim it ran.

## Gates

```
npm run quality
node scripts/harness/architecture-unit.mjs
node scripts/harness/generate-chapter.mjs --verify
node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs
node scripts/harness/property-tests.mjs --only chapters,gameplay
node scripts/harness/terminal-lab-unit.mjs
node scripts/harness/terminal-lab.mjs --all
node scripts/harness/editor-unit-test.mjs
node scripts/harness/editor-smoke.mjs
node scripts/harness/play-browser.mjs --nointro
node scripts/harness/battle-unit.mjs
node scripts/harness/playthrough.mjs --ticks 3
```

Properties for your area live in `scripts/harness/props/{chapters,gameplay,sessions}.mjs` (yours): random play on all levels, determinism, HP bounds, pickups, inventory, exits and Kiro cores. Add one for a new mechanic, and keep a failing counterexample as a regression example. Look at the per-level screenshots `play-browser.mjs` writes (`scripts/harness/out/play-<n>.png`) before calling a level change done.
