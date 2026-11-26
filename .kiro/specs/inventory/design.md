# Inventory: design

## Pieces

```
src/game/
  inventory.ts         pure ItemId, ItemDef, ITEM_DEFS registry; starterInventory(), giveItem(), holdItem(),
                       heroModel(), inventoryCommand(), runInventory(); Tab completion helper
src/procgen/
  archetypes/items.ts  unified registry iteration: registers ModelCatalog item.<id> from item builders
  archetypes/vibecoder.ts unified held variants iteration: registers vibecoder.dev and vibecoder.dev_<id>
                       from item descriptors and builders
src/chapters/
  session-shell.ts     Tab completion on `hold ` using inventory.items; dispatch `inventory`/`inv`/`hold`
  session-flow.ts      restart(g) and applyInitialLoadout() reset g.inventory = starterInventory()
  catalog.ts           GRIMOIRE_ENTRIES documentation for inventory and hold (now in metagame-data.ts, 2026-11-26)
scripts/quality/
  spec-status.mjs      recursive discovery of specs in .kiro/specs/ including items/<child>
```

## Decisions

- **Single source of truth for items.** An item descriptor (`ItemDef` in `src/game/inventory.ts` or `src/procgen/archetypes/items.ts`) defines id, label, modelId, heroModelId, lore, whether it carries light, and whether it is a starter item. `items.ts` registers `item.<id>` for each builder, and `vibecoder.ts` registers each `vibecoder.dev_<id>` variant from the same table.
- **Starter items.** `starterInventory()` gives `items: ['lantern', 'terminal', 'manual', 'map']` and `held: 'lantern'` (chapters may override via `manifest.startItems` and `manifest.grants`, e.g. Chapter 1 starts with `['manual', 'map']`, earns `terminal` in Level 1 via `give_item`, `lantern` in Level 3 via `mv lantern ~`, and `laptop` in Level 6 via `mv laptop ~`, with matching `afterLevel: 1/3/6` grants for direct jumps). The player carries them from arrival once earned.
- **Light socket isolation.** Only items with `light: true` provide `sockets.lantern` on the hero model. `ComicStage.lightFrame` explicitly checks for `sockets.lantern` on the hero rather than falling back to `sockets.fx`.
- **Chapter lifecycle integrity.** Restarting a chapter run (`restart(g)`) reinitializes `g.inventory` to `starterInventory()`, matching classic session behavior.
- **Nested Kiro specs.** `spec-status.mjs` recursively finds `.kiro/specs/**/requirements.md`, validating parent and child specs with standard quality gates.

## Layers and gates

- Inward layers preserved: `game/inventory.ts` remains pure, three-free. `procgen/archetypes/` imports `game/inventory.ts` or contracts for item types.
- Gates: `npm run quality` (`tsc`, layers, size, specs, dup), `node scripts/harness/laptop-unit.mjs`, `node scripts/harness/generate-chapter.mjs --verify`.
