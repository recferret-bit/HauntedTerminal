# Inventory: requirements

Status: done

Capability: the developer carries a typed **Inventory** of tools (`tube_transistor`, `terminal`, `laptop`, `manual`, `map`) and holds one item in his screen-right hand at a time. Inventory is a standalone parent entity in both code and `.kiro/specs/inventory/`, while each carried tool lives as a dedicated child entity under `.kiro/specs/inventory/items/<child>/` and registers through a single per-item descriptor that drives `inventory` commands, `ModelCatalog` (`item.<id>`), and `vibecoder` held-item hero models without parallel lists.

## Requirements

1. THE SYSTEM SHALL define a single pure item-descriptor registry (`ItemId`, `ItemDef`, `ITEM_IDS`, `ITEMS`) shared by `game` and `procgen`, where adding or changing a child item requires one descriptor plus its 3D builder (`Record<ItemId, (seed: number) => ModelSpec>`) rather than parallel lists across `inventory.ts`, `items.ts`, and `vibecoder.ts`.
2. THE SYSTEM SHALL register every inventory item in `ModelCatalog` under category `item` (`item.<id>`), standing on `y = 0` within `itemMajor` (`0.25..0.6` units) with a `grip` socket, permitted to use `human` palette zones, and shown in Storybook under `ITEM`.
3. THE SYSTEM SHALL register one developer hero model per inventory item (`vibecoder.dev` when holding `tube_transistor`, `vibecoder.dev_<id>` for all other items) by attaching the item's `grip` socket to his screen-right hand, placing any `handle` part behind the hand, and tagging item parts with the holding arm's swing.
4. WHEN an inventory item defines a `light` socket, THE SYSTEM SHALL expose it as the holder's `lantern` socket; IF the held item has no `light` socket, THEN THE SYSTEM SHALL omit `sockets.lantern` on the hero model AND the stage renderer SHALL treat `lantern` as `null` (never falling back to `sockets.fx` or drawing a warm light halo on the hero's chest).
5. THE SYSTEM SHALL keep an `Inventory` (`items`, `held`) in both the classic session (`Run.inventory`) and the chapter session (`ChapterState.inventory`), starting every new run, chapter `restart()`, and `applyInitialLoadout()` with the configured starter items (`['tube_transistor', 'terminal']` default in `starterInventory()`; Chapter 1 starts empty-handed `[]` and progressively earns `terminal` in Level 1 via `give_item`, grabs `tube_transistor` off the ground in Level 2 via `appearWhen` + `mv tube_transistor ~` after petrifying `gravy_sentry.bin` to unlock `ls` flags (`-a`, `-l`, `-la`) right away while basic `ls` works from Level 1, receives `map` + `manual` from the Old Bearded Coder at Hub #1 in Level 4 via `give_item`, and collects `laptop` in Level 6 via `mv laptop ~`, with matching `afterLevel: 1/2/4/6` `grants`) and `held` defaulted to `'tube_transistor'` when carried (else `'terminal'`, else `null`).
6. WHEN the player runs `inventory` or `inv`, THE SYSTEM SHALL list carried items in pickup order with `*` marking `held`; WHEN the player runs `hold <item>`, THE SYSTEM SHALL put `<item>` in hand if carried and update `SceneFacts.held` / the stage's hero model, or exit `1` with a clear message if missing or unknown.
7. WHEN the player presses Tab after `hold `, THE SYSTEM SHALL complete from `inventory.items` in both classic and chapter shells, and `grimoire` SHALL document `inventory` / `hold`.
8. WHEN `npm run quality:specs` (or `guard-spec-first` / `scaffold-spec.mjs`) runs, THE SYSTEM SHALL discover and validate nested child specs under `.kiro/specs/<parent>/items/<child>/` alongside top-level `.kiro/specs/<name>/` folders, and the superseded `.kiro/specs/laptop-inventory/` (now `.kiro/specs/inventory/items/laptop/`) and `.kiro/specs/terminal-lab/` (now `.kiro/specs/inventory/items/terminal/`) folders SHALL be removed with all steering, skill, and `AGENTS.md` links updated.
9. WHEN the player collects all 5 inventory items (`ITEM_IDS`) in non-preview/non-lab play, THE SYSTEM SHALL unlock `full_loadout` (`ACH_FULL_LOADOUT`); WHEN the player collects all 5 pickup types (`PICKUP_TYPES`: `energy`, `ram`, `ssd`, `tube_transistor`, `laptop`), THE SYSTEM SHALL unlock `hardware_hoarder` (`ACH_HARDWARE_HOARDER`), bringing the local/Steamworks achievement catalog to 15 trophies (`src/chapters/achievements.ts`).

## Out of scope

- Dropping or destroying carried inventory items.
- Automatic switching to `terminal` on ordinary shell commands.

## Decisions

- **Q:** Which child items belong under the Inventory entity?
  **A (user, 2026-11-17):** Three items: `lantern`, `terminal`, and `laptop` — `terminal` becomes an inventory item too, unifying all carried tools.
- **Q:** How should Inventory and its child entities be structured in `.kiro/specs/`?
  **A (user, 2026-11-17):** Nested under inventory: `.kiro/specs/inventory/` + `.kiro/specs/inventory/items/<child>/` (updating `check-specs.mjs` / `spec-status.mjs` to validate child folders).
- **Q:** Should the parent/child entity split also unify item registration in `src/` code?
  **A (user, 2026-11-17):** Refactor both specs and code so each child item is one descriptor driving `inventory.ts`, `item.*` `ModelCatalog`, and `vibecoder` held variants (removing the 3 parallel lists).
- **Q:** Which item should the developer hold at the start of a run, and when should commands switch it?
  **A (user, 2026-11-17):** Start with `items: ['lantern', 'terminal']` and `held: 'lantern'` (`vibecoder.dev`); `hold <item>` switches explicitly and `ls -a` raises `lantern`.
- **Q:** How should stage lighting behave when holding terminal or laptop instead of lantern?
  **A (user, 2026-11-17):** Only `item.lantern` carries a `light` socket: holding `terminal` or `laptop` hides the oil-lantern halo (fixing the chest glow fallback bug) while keeping dim room ambient readability.
- **Q:** How should we handle the old `.kiro/specs/laptop-inventory/` (now `.kiro/specs/inventory/items/laptop/`) and `.kiro/specs/terminal-lab/` (now `.kiro/specs/inventory/items/terminal/`) folders?
  **A (user, 2026-11-17):** Remove old `.kiro/specs/laptop-inventory/` and `.kiro/specs/terminal-lab/` once migrated into `.kiro/specs/inventory/` + `items/{lantern,terminal,laptop}/`, and update all steering/skill/`AGENTS.md` links.
- **Q:** Which findings from the Laptop & Inventory code review should become tasks in the refactored specs?
  **A (user, 2026-11-17):** Include all review fixes (B1-B6 bugs + `hold` Tab completion, `dispose()`, scratch initial run, per-task reset, palette/ARIA cleanup) as tasks in the refactored specs.
- **Q:** Should the Interactive Terminal Field Manual also be an inventory item alongside `lantern`, `terminal`, and `laptop`?
  **A (user, 2026-11-25):** Yes — make `manual` an additional inventory item (`item.manual`, `vibecoder.dev_manual`, carried by default, linked on landing as well) and migrate its spec cleanly into `.kiro/specs/inventory/items/manual/`.
- **Q:** Should the Chapter Motherboard Map also be an inventory item alongside `lantern`, `terminal`, `laptop`, and `manual`?
  **A (user, 2026-11-25):** Yes — add `map` (`item.map`, `vibecoder.dev_map`, carried from start alongside `manual`, with `map` terminal command, `hold map`, HUD `Map` button, `.item-map` click, and `F3`) as the 5th child item under `.kiro/specs/inventory/items/map/`.
- **Q:** Should `lantern` be renamed to `tube_transistor` with ground-drop acquisition and collection achievements?
  **A (user, 2026-11-26):** Yes — rename `lantern` to `tube_transistor` ("Tube Transistor"), rebuild `item.tube_transistor` and its icon, drop it onto the ground in Level 2 after petrifying the gargoyle (`appearWhen` + `mv tube_transistor ~`), and add achievements for obtaining all inventory items (`ACH_FULL_LOADOUT`) and all pickup types (`ACH_HARDWARE_HOARDER`).

## Open questions

## Verification

`npm run quality` (including `quality:specs` on nested child specs, `quality:layers`, `quality:dup`), `node scripts/harness/laptop-unit.mjs` (inventory state, starter items, `inv`/`hold`, Tab completion, chapter restart reset), `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --category item --seeds 4` and `vibecoder.dev vibecoder.dev_terminal vibecoder.dev_laptop --seeds 4`, `npm run quality:fingerprint`, `node scripts/harness/terminal-lab-unit.mjs`, and `node scripts/harness/generate-chapter.mjs --verify`.
