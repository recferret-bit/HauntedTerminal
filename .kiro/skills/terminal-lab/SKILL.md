---
name: terminal-lab
description: "[WORKFLOW] Test bench and scripting harness for Terminal Lab (`scripts/harness/terminal-lab/*.lab.json`, `/terminal-lab`, `src/terminal-lab/`): build, validate, and run `.lab.json` scenes headlessly or in browser Chrome with invulnerability and 30 enemy soak ticks, import chapter levels via `--from-level`, and inspect or write labs through `credits-forge` (`list_labs`, `get_lab`, `validate_lab`, `run_lab`, `write_lab`). Use whenever testing a command, enemy, pickup, riddle, skin, or terminal behaviour outside chapters."
---

# Terminal Lab (`terminal-lab`)

**Category: WORKFLOW.** Owner: `terminal-designer` (`src/terminal-lab/**`, `scripts/harness/terminal-lab/**`, `src/game/lab-*.ts`). Rules: `.kiro/steering/terminal-lab-rules.md`. Strictly read-only toward `chapters/` and `comix/`.

## Run It

```bash
# Headless CLI runner (Node driver + SOAK_TICKS=30, zero damage assertion)
node scripts/harness/terminal-lab.mjs --all [--validate] [--transcript]
node scripts/harness/terminal-lab.mjs --run scripts/harness/terminal-lab/<id>.lab.json [--validate] [--transcript]
node scripts/harness/terminal-lab.mjs --from-level <chapter>/<level> [--validate] [--transcript]

# Browser Workbench (/terminal-lab, deep links /terminal-lab/<id>?tab= or ?from=<chapter>/<level>)
npm start                                          # open http://localhost:5400/terminal-lab
```

## MCP Tools (`credits-forge`)

`terminal-designer` and `qa` have read access (`list_assets`, `list_levels`, `list_labs`, `get_lab`, `validate_lab`, `run_lab`), and `terminal-designer` alone holds `write_lab`:

1. Call `list_labs` / `get_lab` to read a lab and its `etag`.
2. Call `validate_lab` (schema `parseLabText` + `checkLab`) and `run_lab` (`node-driver` + 30 soak ticks, zero hurt) on an `id` or draft `script` without touching disk.
3. Save with `write_lab({ id, script, baseEtag? })`: refuses any lab with `checkLab` errors, failed `expect` steps, or non-zero damage; overwrites require matching `baseEtag`, new files omit `baseEtag`, and writes format canonically via `stringifyLabJson`.

## Capabilities & Schema

- **Browser Workbench**: Scene setup outliner & drag-and-drop asset palette (`ModelCatalog` props, files/dirs/sockets, enemies, pickups, patches, riddles, tasks, watches), step runner (`run-control.ts` FSM), live `/play/...?draft=1&lab=1` iframe with in-place session swap (`__lab`), Inspector & Transcript cards, and `/api/terminal-lab` save (`baseEtag` 409).
- **Four-place vocabulary rule** (guarded by `guard-chapter-files`): new lab setup/step kinds require coordinated edits in `src/terminal-lab/lab-types.ts` + `src/chapters/session-lab-types.ts`, `lab-pack.ts`/`runner.ts`, `src/terminal-lab/schema.ts`, `lab-check.ts`/`store.ts`, `catalog.ts` (if placeable), and a committed `.lab.json` fixture.
- Exhaustive configuration schema (`LabScript`, all 13 `setup` ops, all 10 `step` ops, `LabCond`, `LabExpect`, `LabPattern`): [references/lab-schema.md](./references/lab-schema.md).

## Gates

```bash
npm run quality
node scripts/harness/terminal-lab-unit.mjs
node scripts/harness/terminal-lab.mjs --all
node scripts/harness/terminal-lab.mjs --validate --all
node scripts/harness/terminal-lab-api-test.mjs
node scripts/harness/property-tests.mjs --only terminal
node scripts/harness/terminal-lab-smoke.mjs --width 1280 --height 820
```
