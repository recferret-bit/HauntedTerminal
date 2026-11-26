# LS & Lantern Flags Rework: requirements

Status: done (all tasks ticked and gates verified 2026-11-26)

Capability: basic `ls` (`ls` and `ls <path>`) works in the terminal from the beginning to list visible files in the current or named folder without showing hidden dotfiles, while all `ls` option flags (`-a`, `-A`, `-l`, `-la`, `-al`, etc.) are gated behind carrying the Tube Transistor (`item.tube_transistor`, originally `item.lantern`). Chapter 1 dialogs, Level 1 tutorial, Level 2 ground-drop acquisition (`appearWhen` + `mv tube_transistor ~`, `script.triggers`, `ssd_256gb.img`), Level 3 all-hidden squad (`ls -la`), Field Manual/man docs, glossary, and existing Kiro specs are updated to match.

## Requirements

1. WHEN the player executes `ls` or `ls <path...>` without option flags while not carrying `lantern` (in Chapter or Classic sessions), THE SYSTEM SHALL list visible (non-dotfile, non-hidden) entries in the target directory or the target file name with exit code `0`, and SHALL NOT reveal hidden dotfiles or cloaked enemies or emit `LANTERN_REVEAL`.
2. IF the player executes `ls` with any option flag (any argument starting with `-` of length > 1, e.g. `-a`, `-A`, `-l`, `-la`, `-al`, `-F`, `--all`) while not carrying `lantern` (outside Terminal Lab), THEN THE SYSTEM SHALL refuse the command with exit code `1`, print a generic in-world lantern refusal message (naming no chapter or level), emit the `locked` command audio cue in chapter mode, and SHALL NOT emit `LANTERN_REVEAL`, trigger the `'lantern'` hero action, or record `ls` in `commandsRun`.
3. WHEN the player carries `lantern` (or runs inside Terminal Lab), THE SYSTEM SHALL allow all `ls` flags: `-a`/`-A`/`-la` SHALL hold `lantern`, emit `LANTERN_REVEAL`, and expose hidden dotfiles and dotfile enemies, while `-l` (without `-a`/`-A`) SHALL print long format without revealing hidden dotfiles.
4. THE SYSTEM SHALL share the `ls` flag detector (`hasLsFlags`) and generic refusal message (`LS_FLAGS_LOCKED_MESSAGE`) in `src/game/unix-applets.ts` across Chapter (`src/chapters/session-shell.ts`, `src/chapters/session-fs.ts`) and Classic (`src/game/session-shell.ts`, `src/game/runtime.ts`) shells, and SHALL remove the redundant full-`ls` `script.locks` entries from Chapter 1 Levels 1 and 2 with zero changes to `ScriptLock` vocabulary or editor schemas.
5. WHEN Chapter 1 Level 1 (`level-01-tutorial-awakening`) plays, THE SYSTEM SHALL teach basic `ls` as Tutorial Step 1 (`ls` -> `mv starter_ram_8gb.dimm ~` -> `cat kiro_story.txt` -> `ps` -> `kill -9 {pid:tutorial_virus_1}` -> `cd hub_uplink`, 6 steps, 0-death headless solve); Level 1, Level 2, Level 3 specs, `dialogs.json`, `chapter.manifest.json`, `chapters/chapter-01-kiroween/README.md`, and `LEVEL.md` SHALL consistently explain that basic `ls` works from the start for visible files while `ls -la` and all `ls` flags unlock with the Oil Lantern reward after Sector 02.
6. THE SYSTEM SHALL update `help`, `man ls`, Field Manual (`src/game/manual-cmds-nav.ts`), and `ITEMS.lantern` text (`src/contracts/inventory.ts`) so they accurately explain basic `ls [path]` vs lantern-gated `ls` flags.
7. THE SYSTEM SHALL update `.kiro/specs/inventory/items/lantern/{requirements,design}.md`, `.kiro/specs/inventory/{requirements,design}.md`, `.kiro/specs/tutorial-kiro-delivers-terminal/{requirements,design}.md`, `.kiro/specs/tutorial-rework/requirements.md` (`## Later changes`), and `.kiro/steering/glossary.md`, recompile `src/chapters/generated/catalog-data.ts` via `generate-chapter.mjs`, and cover basic `ls` vs lantern-gated flags in unit, self-test, and property tests.

## Out of scope

- Changing `ScriptLock` vocabulary or Chapter Editor forms.
- Changing how `lantern` is earned (still rewarded upon clearing Chapter 1 Level 2 / granted at `afterLevel: 2`) or any 3D models/lighting/fingerprint.
- Adding new `ls` flags beyond existing shell support.

## Decisions

- **Q:** Without the lantern, what should basic `ls` allow?
  **A (user, 2026-11-26):** Allow bare `ls` and `ls <path>`; block all `-` flags (`-a`, `-A`, `-l`, `-la`, etc.) until `lantern` is carried.
- **Q:** Where should the pre-lantern `ls` parameter gate be enforced?
  **A (user, 2026-11-26):** Built-in gate in Chapter + Classic shells (bypassed in Terminal Lab) and remove full-`ls` `script.locks` from Levels 1–2.
- **Q:** How should Level 1 (`level-01-tutorial-awakening`) tutorial steps handle basic `ls`?
  **A (user, 2026-11-26):** Make basic `ls` Tutorial Step 1 (`ls` -> `mv` -> `cat` -> `ps` -> `kill -9` -> `cd`, 6 steps).
- **Q:** How should we track this rework in `.kiro/specs/`?
  **A (user, 2026-11-26):** Scaffold `.kiro/specs/ls-lantern-flags-rework/` and update existing lantern, inventory, tutorial specs & glossary.

## Later changes

- **2026-11-26, Tube Transistor rework (user prompt):** Renamed item `lantern` -> `tube_transistor` (`item.tube_transistor`, rebuilt 10-part glowing vacuum-tube model & HUD icon); `hasLsFlags` now gates on `hasItem('tube_transistor')` (`ITEMS.tube_transistor`); Level 2 drops `tube_transistor` horizontally onto the ground (`appearWhen: { kind: 'enemy_dead', enemyId: 'trojan_l2' }` + `dropToGround`) after petrifying `gravy_sentry.bin` so the player grabs it with `mv tube_transistor ~`, triggers Kiro.d + Vibecoder `script.triggers` dialogs encouraging an immediate `ls -la` test (exposing `.vault_beacon`), and replaces the tensor image with `ssd_256gb.img` (`pickup.ssd`); Level 3 hides all enemies (`spyware_l3`, `crack_l3`, `worm_l3`) behind `ls -la` alongside `.transistor_rune` / `transistor_gate.sock`; RAM & SSD tutorials moved from Level 1 timed script to `manifest.onFirstPickup`; added `full_loadout` (`ACH_FULL_LOADOUT`) and `hardware_hoarder` (`ACH_HARDWARE_HOARDER`) achievements (15 total).

## Open questions

## Verification

- `node scripts/harness/generate-chapter.mjs --verify`
- `node .kiro/skills/chapter-level-generator/scripts/self-test.mjs`
- `node scripts/harness/manual-unit.mjs`
- `node scripts/harness/classic-unit.mjs`
- `node scripts/harness/audio-unit.mjs`
- `node scripts/harness/terminal-lab-unit.mjs`
- `node scripts/harness/property-tests.mjs --only chapters,gameplay,terminal`
- `npm run quality` (includes `tsc --noEmit`, `quality:specs`, `quality:declarative`, `quality:lint`, `quality:props`)
- `npm run build`
