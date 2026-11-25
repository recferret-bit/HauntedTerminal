# Inventory: requirements

Status: done

Capability: the developer carries a typed **Inventory** of tools (`lantern`, `terminal`, `laptop`, `manual`, `map`) and holds one item in his screen-right hand at a time. Inventory is a standalone parent entity in both code and `.kiro/specs/inventory/`, while each carried tool lives as a dedicated child entity under `.kiro/specs/inventory/items/<child>/` and registers through a single per-item descriptor that drives `inventory` commands, `ModelCatalog` (`item.<id>`), and `vibecoder` held-item hero models without parallel lists.

## Requirements

1. THE SYSTEM SHALL define a single pure item-descriptor registry (`ItemId`, `ItemDef`, `ITEM_IDS`, `ITEMS`) shared by `game` and `procgen`, where adding or changing a child item requires one descriptor plus its 3D builder (`Record<ItemId, (seed: number) => ModelSpec>`) rather than parallel lists across `inventory.ts`, `items.ts`, and `vibecoder.ts`.
2. THE SYSTEM SHALL register every inventory item in `ModelCatalog` under category `item` (`item.<id>`), standing on `y = 0` within `itemMajor` (`0.25..0.6` units) with a `grip` socket, permitted to use `human` palette zones, and shown in Storybook under `ITEM`.
3. THE SYSTEM SHALL register one developer hero model per inventory item (`vibecoder.dev` when holding `lantern`, `vibecoder.dev_<id>` for all other items) by attaching the item's `grip` socket to his screen-right hand, placing any `handle` part behind the hand, and tagging item parts with the holding arm's swing.
4. WHEN an inventory item defines a `light` socket, THE SYSTEM SHALL expose it as the holder's `lantern` socket; IF the held item has no `light` socket, THEN THE SYSTEM SHALL omit `sockets.lantern` on the hero model AND the stage renderer SHALL treat `lantern` as `null` (never falling back to `sockets.fx` or drawing an oil-lantern halo on the hero's chest).
5. THE SYSTEM SHALL keep an `Inventory` (`items`, `held`) in both the classic session (`Run.inventory`) and the chapter session (`ChapterState.inventory`), starting every new run, chapter `restart()`, and `applyInitialLoadout()` with all starter items (`['lantern', 'terminal', 'manual', 'map']` default; Chapter 1 starts with `['manual', 'map']`) and `held` defaulted to `'lantern'` when carried (else `unique[0]`).
6. WHEN the player runs `inventory` or `inv`, THE SYSTEM SHALL list carried items in pickup order with `*` marking `held`; WHEN the player runs `hold <item>`, THE SYSTEM SHALL put `<item>` in hand if carried and update `SceneFacts.held` / the stage's hero model, or exit `1` with a clear message if missing or unknown.
7. WHEN the player presses Tab after `hold `, THE SYSTEM SHALL complete from `inventory.items` in both classic and chapter shells, and `grimoire` SHALL document `inventory` / `hold`.
8. WHEN `npm run quality:specs` (or `guard-spec-first` / `scaffold-spec.mjs`) runs, THE SYSTEM SHALL discover and validate nested child specs under `.kiro/specs/<parent>/items/<child>/` alongside top-level `.kiro/specs/<name>/` folders, and the superseded `.kiro/specs/laptop-inventory/` and `.kiro/specs/terminal-lab/` folders SHALL be removed with all steering, skill, and `AGENTS.md` links updated.

## Out of scope

- Chapter script vocabulary for granting `laptop` mid-chapter (`give_item` step or `manifest.grants` item field).
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
- **Q:** How should we handle the old `.kiro/specs/laptop-inventory/` and `.kiro/specs/terminal-lab/` folders?
  **A (user, 2026-11-17):** Remove old `.kiro/specs/laptop-inventory/` and `.kiro/specs/terminal-lab/` once migrated into `.kiro/specs/inventory/` + `items/{lantern,terminal,laptop}/`, and update all steering/skill/`AGENTS.md` links.
- **Q:** Which findings from the Laptop & Inventory code review should become tasks in the refactored specs?
  **A (user, 2026-11-17):** Include all review fixes (B1-B6 bugs + `hold` Tab completion, `dispose()`, scratch initial run, per-task reset, palette/ARIA cleanup) as tasks in the refactored specs.
- **Q:** Should the Interactive Terminal Field Manual also be an inventory item alongside `lantern`, `terminal`, and `laptop`?
  **A (user, 2026-11-25):** Yes — make `manual` an additional inventory item (`item.manual`, `vibecoder.dev_manual`, carried by default, linked on landing as well) and migrate its spec cleanly into `.kiro/specs/inventory/items/manual/`.
- **Q:** Should the Interactive Chapter Motherboard Map (`map`) also be added as a 5th inventory item alongside `manual`?
  **A (user, 2026-11-25):** Yes — add `map` (`item.map`, `vibecoder.dev_map`) carried from start alongside `manual`, with `map [level]` command, `F3`, `#hud-map`, and PCB motherboard dialog in `.kiro/specs/inventory/items/map/`.

## Open questions

## Verification

`npm run quality` (including `quality:specs` on nested child specs, `quality:layers`, `quality:dup`), `node scripts/harness/laptop-unit.mjs` (inventory state, starter items, `inv`/`hold`, Tab completion, chapter restart reset), `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --category item --seeds 4` and `vibecoder.dev vibecoder.dev_terminal vibecoder.dev_laptop --seeds 4`, `npm run quality:fingerprint`, `node scripts/harness/terminal-lab-unit.mjs`, and `node scripts/harness/generate-chapter.mjs --verify`.
