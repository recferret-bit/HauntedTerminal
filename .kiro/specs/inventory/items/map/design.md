# Chapter Motherboard Map Item & Dialog: design

## Pieces

```
src/contracts/inventory.ts            Adds 'map' to ITEM_IDS & ITEMS descriptor (item.map, vibecoder.dev_map)
src/game/inventory.ts                 starterInventory() defaults to ['lantern', 'terminal'] (map omitted by default)
src/procgen/archetypes/items/map.ts   Procedural 3D item.map (top strap + PCB slate + trace bed + IC blocks + phosphor beacons)
src/procgen/archetypes/items.ts       ITEM_BUILDERS.map -> buildMap (auto-wires vibecoder.dev_map in vibecoder.ts)
.kiro/skills/credits-art-direction/references/world-lexicon.md Documents item.map & vibecoder.dev_map
chapters/chapter-01-kiroween/chapter.manifest.json Chapter 1 startItems is []; grants afterLevel: 4 includes "map" & "manual" (gifted via give_item at Hub #1)
src/chapters/{types,catalog}.ts,      Inventory/hold comments, GRIMOIRE_ENTRIES (now metagame-data.ts), chapter-editor field hints updated
  src/chapter-editor/schema.ts
src/game/manual.ts, manual-cmds-nav.ts, Registers 'map' command, helpText, MAN.map, runMap(), and Field Manual documentation
  manual-cmds-meta.ts
src/game/session.ts, runtime.ts       Classic shell 'map' command, consumeMapRequest(), Tab completion
src/chapters/session-state.ts,        Chapter shell 'map' command, consumeMapRequest(), ended-state allowance, Tab completion
  session-flow.ts, session-shell.ts,
  chapter-session.ts
src/terminal-lab/commands.ts          Registers 'map' in GROUPS['Help & game'] and EXAMPLES
src/ui/chapter-map-model.ts           Pure declarative 4-stage Motherboard topology builder (Boot ROM -> 3 Channels -> Core; 4-state current/cleared/ready/unknown progression)
src/ui/chapter-map-hardware.ts        Decorative PCB hardware bays (ATX/CMOS/VRM, DIMM/BIOS POST, PCI/M.2 NVMe, spinning PWM fan/DIP/speaker), backdrop fiducials, and current-sector probe animation
src/ui/chapter-map.ts                 Big popup <dialog id="chapter-map-dialog"> with PCB canvas, hardware bays, chip inspector & 2-step deploy
src/styles/chapter-map.css            Motherboard PCB grid, channels, IC pins, wire buses, LEDs, unknown dimmed states, probe animations, hardware bays & responsive rules
src/styles/dialog.css                 5-slot .items-strip tightening on narrow viewports + clickable .item-map / .item-manual affordance
src/ui/items-strip.ts, hud.ts         Optional onItemClick on items-strip; small #hud-map button beside #hud-hint in .hud-btns
src/play/{state,input,loop,outro,menu}.ts, Big dialog wiring: F3 / #hud-map / .item-map / `map` cmd, in-place jumpToLevel + URL sync,
  src/main.ts                         blocks shell input WITHOUT PauseReason, closes on ending/card, window.__map hook
scripts/harness/{laptop-unit,         Unit & browser smoke tests for 5-item inventory, motherboard topology, triggers,
  manual-unit,manual-smoke}.mjs,      non-pausing battle timer, and two-step in-place deploy
  scripts/harness/props/sessions.mjs
```

## Decisions

- **Declarative 4-stage motherboard grouping without chapter-specific IDs.** `buildMotherboardTopology()` walks `manifest.levels` in order: an initial non-hub/non-boss entry becomes `bootBlock`; each subsequent run of task levels terminating in `mechanic === 'hub'` forms one `MotherboardChannel` (`CHANNEL 01 // BUS A`, `CHANNEL 02 // BUS B`, `CHANNEL 03 // BUS C`); and any `mechanic === 'boss'` level becomes `coreBlocks`. Manifest `grants` are matched by `afterLevel` to attach RAM/SSD/item/core bus badges along the channels and chips—passing `quality:declarative` cleanly while rendering Kiroween's exact `1 + (2+1) * 3 + 1 = 11` architecture.
- **Native `<dialog>` with non-pausing shell block.** Following `hint-dialog.ts` and `manual-book.ts`, `#chapter-map-dialog` uses `showModal()`, `closedby="any"` + `wireLightDismissFallback` (defined in `src/ui/modal-dialog.ts`; `hint-dialog.ts` only re-exports it), adds zero `PauseReason`, and lets `syncPause()` block xterm input while keeping the game clock and 30s battle turn timer running.
- **Two-step in-place deploy safety.** When jumping to a different level in a chapter session where commands have already been executed (`levelCommands > 0` or `snap.commands > 0` when at start), `#cm-deploy-btn` reveals `#cm-confirm-row` (`Confirm Deploy` / `Cancel`) so accidental clicks never wipe level progress, then calls `session.jumpToLevel(level.id)` + `session.arriveLevel()` and `history.replaceState`.
- **Single-zone-budget PCB palette for `item.map`.** `item.map` reuses `pcb`, `hair`, `paper`, `ink`, `hoodie`, and minimal `phosphor` beacon accents so `vibecoder.dev_map` remains <= 5 non-neutral/non-light zones under `--strict`.

## Layers and gates

- Layer rules unchanged (`src/ui/` already permits `contracts/`, `game/`, `chapters/`, `shaders/`, `renderer/`).
- Fingerprint: intentional addition of `item.map` and `vibecoder.dev_map` (`npm run quality:fingerprint` diff documented).
- Gates: `npm run quality`, `npm run build`, `validate-model.mjs --all --strict`, `check-tags.mjs --all`, `manual-unit.mjs`, `laptop-unit.mjs`, `terminal-lab-unit.mjs`, `battle-unit.mjs`, `manual-smoke.mjs`, `generate-chapter.mjs --verify`.
