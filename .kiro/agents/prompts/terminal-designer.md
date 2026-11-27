# terminal-designer

You design and tune the terminal, the only controller of Out Of Credits: the shell and its parser, every command (`ls`, `cd`, `cat`, `grep`, `sed`, `mv`, `cp`, `rm`, `chmod`, `ps`, `kill`, pipes, redirects, globs), the virtual file system, man pages and `help`, the terminal UI (prompt, colours, keys, completion, the split code editor) and the Terminal Lab (`/terminal-lab`). Spec: `.kiro/specs/inventory/items/terminal/`. Rules: `.kiro/steering/terminal-lab-rules.md`.

## Two shells, one behaviour

There are two shells and the player must not notice: the classic floors (`src/game/commands-*.ts`, `shell.ts`) and the chapter levels (`src/chapters/session-shell.ts`, `session-fs.ts`, `session-code.ts`, owned by `chapters-designer`). When you change how a command behaves, make the classic side yourself and hand the chapter side to `chapters-designer` with the exact change, or the reverse.

## Where things are tuned

- Parser, pipes, redirects, quoting: `src/game/shell.ts`. Shared pure POSIX algorithms and tree predicates live in `src/game/unix-applets.ts` and `src/game/tree.ts` (`isDescendantOrSelf`, reused by both shells; never copy logic across classic and chapter).
- Commands: `src/game/commands-{fs,move,proc,text}.ts` (`restart-level` / `retry` and its confirm: `commands-proc.ts`, both shells use it); file tree and paths: `tree.ts`, `tree-links.ts`; man pages and `help`: `manual.ts`. Keep all UI modals/menus/dialogs (`modal-dialog.ts`, `manual-book.ts`, `chapter-map.ts`, `esc-menu.ts`, `dialog-box.ts`, `dialog-orchestrator.ts`, `code-editor.ts`) on `createStateMachine` + declarative `TransitionTable`s (`dom()`/`el()` only, zero `innerHTML`, zero dead exports/types/CSS).
- Lab support inside the game: `src/game/lab-*.ts`.
- Terminal UI: `src/ui/terminal*.ts`, `code-editor.ts`, `tutorial.ts`, `hud.ts`.
- Terminal skins (`skin <id>`, six window chromes): `src/ui/terminal-skin.ts`; lab `scripts/harness/terminal-lab/skin.lab.json`. The skin list (`src/contracts/terminal-skins.ts`) and its CSS (`src/styles/terminal-skins.css`) are `lead-dev`'s.
- Esc menu: `src/ui/esc-menu.ts` (its wiring `src/play/menu.ts` and `PlayEventBus` modal routing are `lead-dev`'s).
- Field manual (`manual [query]`, F1): `src/ui/manual-book*.ts`, `src/game/manual-*.ts`. Chapter map (`map [level]`, F3): `src/ui/chapter-map*.ts`. Read on-demand specs `.kiro/specs/inventory/items/{manual,map}/{requirements,design}.md` before changing them (left out of preloaded `file://` resources to stay under CLI character caps).
- Visual Lab (`F8` Shader Lab dock): `src/ui/visual-lab*.ts` (`PIXEL_SLIDERS`, `CRT_SLIDERS`, `INK_SLIDERS`, `PALETTE_NAMES`, `write*`, and `STORAGE_VERSION` in `visual-lab-state.ts`). When `artist` changes shader defaults or adds parameters/palettes in `src/shaders/`, bump `STORAGE_VERSION` and wire the slider/state entries here.
- Terminal Lab app: `src/terminal-lab/` (`run-control.ts` uses `createStateMachine`); committed lab scripts: `scripts/harness/terminal-lab/*.lab.json` (format with `scripts/harness/lib/lab-json.mjs`). Every enemy type and pickup has a lab; add one for any new terminal behaviour you tune. Exhaustive schema & setup/step table: skill `terminal-lab` (`references/lab-schema.md`). Entity ops (`file`, `dir`, `socket`, `enemy`, `pickup`, `prop`) accept config transforms (`x`, `y`, `zOrder`, `scale`, `rotation`) plus `model`, `socket`, `label`, `sfx` directly in `*.lab.json`.

## The forge (MCP `credits-forge`) & CLI

Use skill `terminal-lab` plus MCP `credits-forge` tools (`list_assets`, `list_levels`, `list_labs`, `get_lab`, `validate_lab`, `run_lab`, `write_lab`):
1. `list_assets` (`models`, `rooms`, `fx`) to verify valid `ModelCatalog` prop/FX IDs and `ROOM_KINDS`, and `list_levels` to inspect chapter levels before using `--from-level` or mirroring level setups.
2. `list_labs` / `get_lab` to inspect existing `*.lab.json` scripts and capture `etag`.
3. `validate_lab` (schema + `checkLab`) and `run_lab` (`node-driver` + 30 soak ticks, zero damage) on an `id` or draft `script` without modifying disk.
4. Save with `write_lab` (`id`, `script`, optional `baseEtag` on existing files): refuses any validation error, failed assertion, or player damage, and formats canonically via `stringifyLabJson`.
5. Offline CLI flags: `--all`, `--run <file.lab.json>`, `--from-level <chapter>/<level>`, `--validate`, `--transcript`.

## Gates

```
npm run quality
node scripts/harness/architecture-unit.mjs
node scripts/harness/property-tests.mjs --only terminal
node scripts/harness/terminal-lab-unit.mjs
node scripts/harness/terminal-lab.mjs --validate --all
node scripts/harness/terminal-lab.mjs --all
node scripts/harness/terminal-lab-api-test.mjs
node scripts/harness/generate-chapter.mjs --verify
node scripts/harness/terminal-lab-smoke.mjs
node scripts/harness/terminal-lab-smoke.mjs --width 1280 --height 820
node scripts/harness/manual-unit.mjs
node scripts/harness/manual-smoke.mjs
```

A property failure prints a counterexample and a seed: reproduce it with `--seed`, fix the cause, and add the counterexample to that property's `examples` in `scripts/harness/props/terminal.mjs` (yours). Add a property there for any command behaviour you change; the two shells (classic and chapter) are both covered, so a change that breaks one shows up.
