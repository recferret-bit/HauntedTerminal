# Chapter Motherboard Map Item & Dialog: requirements

Status: done

Capability: `map` is the 5th typed **Inventory** tool under `.kiro/specs/inventory/` (`item.map`, `vibecoder.dev_map`, carried from start alongside `manual` in `starterInventory()` and Chapter 1) AND an interactive **Motherboard Chapter Map** big popup `<dialog>` (`#chapter-map-dialog`) on `/play`. Styled like a PCB motherboard with etched traces, channels, pins, and IC chip blocks, it ties all levels of the Kiroween chapter together declaratively across Boot ROM, 3 Data Channels (Tasks -> Hub Controller with hardware/core grant buses), and the CPU Core Boss Socket, with a live chip inspector and two-step in-place `Deploy to Level` jump. Opened via a small `Map` button (`#hud-map`) in `.hud-btns`, clicking the `.item-slot.item-map` inventory slot, `F3`, or the `map [level]` terminal command.

## Requirements

### Inventory item & 3D procedural asset

1. THE SYSTEM SHALL register `'map'` in `ITEM_IDS` and `ITEMS` (`src/contracts/inventory.ts`) as the 5th child inventory item alongside `'lantern'`, `'terminal'`, `'laptop'`, and `'manual'`, with `model: 'item.map'`, `heroModel: 'vibecoder.dev_map'`, and zero `light` socket.
2. THE SYSTEM SHALL build `item.map` in `src/procgen/archetypes/items/map.ts` (wired into `ITEM_BUILDERS.map` in `src/procgen/archetypes/items.ts`) standing on `y = 0` within `itemMajor` (`0.25..0.6` units) with top leather carry `handle`, `pcb` board body, `hair` side frame rails, recessed `ink` trace bed, `paper`/`hoodie` channel bus traces & IC chip blocks, and tiny `phosphor` beacon nodes within `MODEL_RULES.color.maxZones = 5` when carried by `vibecoder.dev_map` (auto-derived in `src/procgen/archetypes/vibecoder.ts`), emitting no oil-lantern light cone (`sockets.lantern` omitted).
3. THE SYSTEM SHALL include `'map'` in `starterInventory()` defaults (`['lantern', 'terminal', 'manual', 'map']`), Chapter 1 `startItems` (`['manual', 'map']`), HUD `.items-strip` (`src/ui/items-strip.ts`, 5 slots), `inventory`/`inv`/`hold map` commands, Tab completions, `grimoire` entries, `chapter-editor` item hints, and Field Manual command docs (`src/game/manual-cmds-nav.ts`, `src/game/manual-cmds-meta.ts`).

### Declarative Motherboard topology

4. THE SYSTEM SHALL build the motherboard circuit topology (`src/ui/chapter-map-model.ts`) purely from the active `ChapterManifest`, `ChapterPack`, and saved `ChapterProgressStore` (`readChapterProgress()`) without hardcoding any chapter ID, level ID, or `level.index === N` (`N > 1`) in `src/`.
5. WHEN building the motherboard layout for a chapter manifest (such as Kiroween's 11 levels), THE SYSTEM SHALL organize every level into a 4-stage PCB architecture:
   - **Boot ROM Socket** (`SOCKET 00 // BOOT ROM`): the opening non-hub, non-boss level (`index === 1`);
   - **Data Channels** (`CHANNEL 01 // BUS A`, `CHANNEL 02 // BUS B`, `CHANNEL 03 // BUS C`, ...): consecutive non-hub task levels wired sequentially via PCB bus traces into their following `mechanic === 'hub'` Hub Controller IC chip block, carrying the manifest's `grants` (`ram`, `ssd`, `core`, `items`) along the channel bus;
   - **CPU Core Socket** (`NORTHBRIDGE // CPU CORE SOCKET`): `mechanic === 'boss'` final level(s) receiving the converged output buses from the channels.
6. FOR EACH motherboard block, THE SYSTEM SHALL track live status (`current`, `cleared`, `ready`, `unknown`), chip package classification (`ROM-DIP8`, `TASK-QFP16`, `HUB-BGA24`, `CORE-PGA64`), full level metadata (`title`, `cwd`, `roomKind`, `mechanic`, `mechanicLabel`, `difficulty`, `teaches`, `enemies`, `summary`, `grants`), and personal best clear record (`bestRank`, `bestCommands`, `bestTimeSec`, `chaosCleared`). An entry block (`i === 0`) or any block whose immediately preceding level is cleared is marked `ready` (opened) when not `current`/`cleared`, whereas unreached sectors stay `unknown`.

### Big popup dialog, chip inspector & in-place level jump

7. THE SYSTEM SHALL render the Chapter Map inside a large centered native `<dialog id="chapter-map-dialog" class="chapter-map-dialog" closedby="any">` (`src/ui/chapter-map.ts`, `src/ui/chapter-map-hardware.ts`, `src/styles/chapter-map.css`) styled like a PCB motherboard with mounting screw holes, alignment fiducials, SMD/via silkscreens, etched solder grid, channel bus tracks, flanking PC hardware bays (24-pin ATX power, CR2032 CMOS battery, VRM capacitors & `66.6MHz` crystal, 4 DIMM RAM banks + dual-digit BIOS POST hex readout, PCIe/ISA + M.2 NVMe heatshield, spinning PWM fan + DIP switch + piezo speaker), orthogonal wire connectors, IC pin arrays, status LEDs, desaturated/half-transparent `unknown` blocks (still clickable for inspect/deploy), a multi-layer `current`-sector diagnostic probe animation (reticles, radar clock pulse, oscilloscope bars, laser scanbeam, trace signal pulses), and a right/bottom chip inspector drawer (`#cm-inspector`), built cleanly via safe DOM helpers (`el()` / text nodes, zero `innerHTML`).
8. WHEN the player clicks any level block (or navigates between blocks with arrow keys), THE SYSTEM SHALL select that block on the motherboard, highlight its incoming/outgoing bus path, and populate `#cm-inspector` with its schematic metadata, teaches chips, active malware threats, grant badges, personal best record, and `#cm-deploy-btn` (`Deploy to Level XX`).
9. WHEN the player activates `Deploy to Level XX` in a chapter session, IF the target is a different level AND the current level has already run commands (`snap.commands > 0` or current level command progress > 0), THEN THE SYSTEM SHALL require a two-step confirmation (`Confirm Deploy to Level XX` / `Cancel`) before jumping; WHEN confirmed (or when no confirm is required), THE SYSTEM SHALL jump in place via `session.jumpToLevel(level.id)` + `session.arriveLevel()`, print the new level banner, update the URL via `history.replaceState` (`buildPlayUrl`), and close the dialog (classic mode navigates to `buildPlayUrl(manifest.id, level.id, true)`).

### Triggers, terminal command & non-pausing timer behavior

10. THE SYSTEM SHALL open/toggle the Chapter Map dialog when the player clicks the small `#hud-map` (`Map`) button in `.hud-btns` next to `#hud-hint`, clicks the `.item-slot.item-map` inventory slot in `.items-strip`, presses `F3`, or runs `map [level|query]` in the terminal.
11. THE SYSTEM SHALL register `'map'` in `COMMANDS` (`src/game/manual.ts`), `helpText`, `MAN`, `MANUAL_TOOLS_AND_META`, both shells (`src/game/session.ts`, `src/chapters/session-shell.ts`; the classic dispatch is now `CLASSIC_HANDLERS` in `src/game/session-shell.ts`, 2026-11-26), Tab completion (`map <level|topic>`), `consumeMapRequest()`, and `src/terminal-lab/commands.ts` (`GROUPS['Help & game']`, `ungrouped()` stays empty).
12. WHILE `#chapter-map-dialog` is open, THE SYSTEM SHALL block terminal keystrokes (`play.shell.setBlocked(true)`) and leave `Escape` to close the dialog (closing automatically on `beginEnding` / cinematic / title card / outro) WITHOUT adding a `PauseReason` or pausing the game clock or 30-second battle turn timer, and SHALL restore keyboard focus to the terminal on close.

## Out of scope

- Adding a second chapter or non-Kiroween chapter data (Kiroween scope stays one chapter of 11 levels).
- Modifying `chapters/` spec schemas (`chapter.manifest.json` stays untouched beyond `"startItems"`).
- Persisting custom player-drawn wire layouts or level unlock locks (all 11 blocks are inspectable and deployable per user choice).

## Decisions

- **Q1:** How should the Chapter Map inventory item and terminal command work?
  **A (user, 2026-11-25):** Item `map` (`item.map` / `vibecoder.dev_map`), carried from start alongside `manual`, with terminal command `map` and `hold map` — full parity with Field Manual from Level 1 onward.
- **Q2:** Where should the small popup button for the Chapter Map be placed?
  **A (user, 2026-11-25):** Small `MAP` button in the top-right HUD next to `? Hint` (plus clicking the `map` slot in `.items-strip` and hotkey `F3`).
- **Q3:** What should clicking a level block on the motherboard map do?
  **A (user, 2026-11-25):** Inspect & Jump to any level: clicking a level block opens its chip inspector (title, path, mechanic, threats, teaches, best rank/stats) with a `Jump / Deploy to Level` action.
- **Q4:** How should the motherboard channels, blocks, and wires arrange the chapter's levels?
  **A (user, 2026-11-25):** 4-Stage Motherboard Architecture derived declaratively from the chapter manifest: Boot ROM (L1 Tutorial) -> 3 Data Channels (Tasks L2-L3 -> Hub 1 L4; Tasks L5-L6 -> Hub 2 L7; Tasks L8-L9 -> Hub 3 L10) -> CPU Core Socket (L11 Boss), with PCB traces, bus channels, and RAM/SSD/Core grant buses — mirrors Kiroween's 1+6+3+1 structure without hardcoding level IDs in `src/`.
- **Q5:** How should the Chapter Map dialog behave with terminal input and the battle turn timer?
  **A (user, 2026-11-25):** Same as Field Manual & Esc menu: blocks terminal typing while open, closes on Esc / backdrop / close button, restores terminal focus, and does NOT pause the game clock or 30s battle turn timer.
- **Q6:** How should `Deploy / Jump to Level` inside the Chapter Map popup transition to the selected level?
  **A (user, 2026-11-25):** In-place jump via `session.jumpToLevel(levelId)` + `arriveLevel()` and URL update (`/play/<chapter>/<level>`), with a quick two-step `Confirm Deploy` on the button when jumping away from a level where commands were already run.
- **Q7:** Approve requirements, design, and tasks to proceed to implementation and verification?
  **A (user, 2026-11-25):** Approved all three gates (requirements, design, tasks) to implement and verify immediately.

## Open questions

None.

## Verification

- Unit suites: `node scripts/harness/manual-unit.mjs` (covers `ITEM_IDS`, `ITEMS.map`, `findCommandDoc('map')`, `exec('map')`, `consumeMapRequest()`, and `buildMotherboardTopology` across all 11 Kiroween levels), `node scripts/harness/laptop-unit.mjs`, `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/battle-unit.mjs`.
- Asset validators: `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs item.map vibecoder.dev_map --seeds 4 --strict`, `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --strict`, `node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all`, `npm run quality:fingerprint`.
- Browser & chapter E2E: `node scripts/harness/manual-smoke.mjs` (5-item `.items-strip`, `#hud-map` button, `.item-slot.item-map` click, `F3` toggle, `map` terminal command, 11-block motherboard layout, chip inspector, two-step `Deploy` in-place jump to Level 2, non-pausing battle timer while open), `node scripts/harness/generate-chapter.mjs --verify`, `node scripts/harness/playthrough.mjs --ticks 3`.
- Project gates: `npm run quality` (`tsc --noEmit`, `quality:root`, `quality:size`, `quality:layers`, `quality:declarative`, `quality:specs`, `quality:dup`, `quality:agents`, `quality:brands`, `quality:mcp`, `quality:props`), `npm run build`.
