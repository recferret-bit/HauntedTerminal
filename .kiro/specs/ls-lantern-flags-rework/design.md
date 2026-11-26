# LS & Lantern Flags Rework: design

Status: see requirements.md

## Pieces

```
src/game/
  unix-applets.ts       hasLsFlags(args): true for any `-` option arg of length > 1;
                        LS_FLAGS_LOCKED_MESSAGE: shared generic in-world refusal string
  session-shell.ts      CLASSIC_HANDLERS.ls gates only when !g.lab && !hasItem('lantern') && hasLsFlags(args)
  runtime.ts            noteAction() bumps 'lantern' only when carrying lantern (or in lab); otherwise 'read'
  manual.ts             helpText() and MAN.ls distinguish basic `ls [path]` vs lantern-gated flags
  manual-cmds-nav.ts    Field Manual `ls` entry documents basic `ls` vs lantern-required `-a`/`-A`/`-l`/`-la`
src/contracts/
  inventory.ts          ITEMS.lantern lore & use updated to reflect unlocking `ls` flags (-a, -l, -la)
src/chapters/
  session-shell.ts      dispatch() gates `ls` only when !g.lab && !hasItem('lantern') && hasLsFlags(argv.slice(1)),
                        setting g.commandCue = 'locked' and returning emptyStep(1, LS_FLAGS_LOCKED_MESSAGE)
  session-fs.ts         cmdLs() matches option args with `a.startsWith('-') && a.length > 1` for parity with
                        hasLsFlags() and Classic splitShortFlags()
chapters/chapter-01-kiroween/
  levels/level-01-tutorial-awakening/level.spec.json
                        remove full-`ls` script.locks; Step 1 teaches `ls` (6-step tutorial: ls -> mv -> cat ->
                        ps -> kill -9 -> cd); update summary, kiro_story.txt, timed dialogs, skipText, solutionCommands
  levels/level-01-tutorial-awakening/LEVEL.md
                        update beat table, tutorial cards, and solution
  levels/level-02-task-ram-heist/level.spec.json
                        remove full-`ls` script.locks; update vault_notes.txt and timed dialog copy
  levels/level-03-task-gpu-salvage/level.spec.json
                        update title/summary/arrival/timed dialogs to say Oil Lantern unlocks `ls -la` & `ls` flags
  story/dialogs.json    update Levels 1–3 banner, hankRungs, agentTaunt, completion
  chapter.manifest.json update summary, mechanicsSummary, Level 1 mechanicLabel/teaches, Level 3 title
  README.md             update progression and Kiro.d blurb
src/chapters/generated/
  catalog-data.ts       recompiled via `node scripts/harness/generate-chapter.mjs` (never hand-edited)
.kiro/specs/ & .kiro/steering/
  ls-lantern-flags-rework/{requirements,design,tasks}.md
  inventory/{requirements,design}.md
  inventory/items/lantern/{requirements,design}.md
  tutorial-kiro-delivers-terminal/{requirements,design}.md
  tutorial-rework/requirements.md (append entry to ## Later changes)
  .kiro/steering/glossary.md (update Lock entry)
scripts/harness/ & .kiro/skills/
  scripts/harness/manual-unit.mjs            update Classic dark-ls test (basic ls ok, flags locked)
  scripts/harness/props/terminal.mjs         add both-shells property: basic ls vs lantern-gated flags
  .kiro/skills/chapter-level-generator/scripts/self-test.mjs
                                             update Levels 1–3 ls/flag & tutorial Step 1 assertions
```

## Decisions

- **Single shared flag detector (`hasLsFlags`).** Placed in `src/game/unix-applets.ts` (already imported by both `src/game/` and `src/chapters/`) so Classic and Chapter shells agree on every argument form (`ls`, `ls .`, `ls dir` allowed; `-a`, `-A`, `-l`, `-la`, `-al`, `-F`, `--all`, `dir -a` refused without `lantern`; bare `-` remains a path token matching `splitShortFlags`). Follows Decision 1 & 2.
- **Generic engine message, zero hardcoded chapter/level names.** `LS_FLAGS_LOCKED_MESSAGE` never names "Sector 02" or any chapter/level, keeping `src/` strictly declarative (`declarative-chapters.md`). Chapter-specific hints live in `chapters/chapter-01-kiroween/` dialogs and briefings. Follows Decision 2.
- **No `ScriptLock` vocabulary change.** Removing the redundant `command: "ls"` entries from Levels 1 & 2 `script.locks` avoids four-place schema/editor churn while keeping `script.locks` working unchanged for full-command locks (e.g. Level 6 `edit`/`sed`). Follows Decision 2.
- **Classic `noteAction` guard.** `noteAction()` runs before `CLASSIC_HANDLERS.ls`; checking `g.lab || hasItem(g.run.inventory, 'lantern')` prevents a refused `ls -a` from bumping the hero's `'lantern'` animation. Follows Req 2.
- **Level 1 Step 1 = `ls`.** `cmdLs()` already adds `'ls'` to `g.rt.commandsRun` only when listing `cwd`, and `isNodeHidden()` already hides `glitch_spark.exe` until `mv` + `cat` (or `ps`), so running `ls` on Step 1 reveals `hub_uplink/  kiro_story.txt  starter_ram_8gb.dimm` without spoiling the hidden tutorial virus. Follows Decision 3.
- **Canonical JSON formatting.** All edited files under `chapters/chapter-01-kiroween/` are written with `stringifyChapterJson` (`scripts/harness/lib/chapter-json.mjs`) so the canonical-writer property test passes byte-for-byte.

## Layers and gates

- Inward layers (`scripts/quality/check-layers.mjs`): unchanged.
- Chapter/Editor vocabulary (`script-types.ts`, `schema.ts`, `validate-pack.ts`): unchanged.
- Asset fingerprint (`npm run quality:fingerprint`): unchanged in the initial flag-gate pass; later updated intentionally on 2026-11-26 when `item.lantern` was replaced by `item.tube_transistor` (see `.kiro/specs/inventory/items/lantern/design.md`).
- **2026-11-26 Tube Transistor amendment:** Both shells (`src/chapters/session-shell.ts`, `src/game/session-shell.ts`, `src/game/runtime.ts`) now check `hasItem(..., 'tube_transistor')` and `LS_FLAGS_LOCKED_MESSAGE` names the Tube Transistor. Four-place vocabulary additions (`LevelPickupSpec.appearWhen`, `LevelScript.triggers`, `ScriptCond` `room_swept`, `ChapterManifest.onFirstPickup`) drive Level 2's ground-drop pickup (`mv tube_transistor ~`), `ssd_256gb.img`, and Level 2/3 `ls -la` dialogs (with all three Level 3 enemies cloaked via `hidden: true`), while `src/chapters/achievements.ts` expands to 15 achievements (`ACH_FULL_LOADOUT`, `ACH_HARDWARE_HOARDER`).
- Gates: `node scripts/quality/check-specs.mjs`, `node scripts/harness/generate-chapter.mjs --verify`, `node .kiro/skills/chapter-level-generator/scripts/self-test.mjs`, `node scripts/harness/manual-unit.mjs`, `node scripts/harness/classic-unit.mjs`, `node scripts/harness/audio-unit.mjs`, `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/property-tests.mjs --only chapters,gameplay,terminal`, `npm run quality`, `npm run build`.
