# Tube Transistor Item (formerly Lantern): requirements

Status: done (implemented and verified against all quality gates 2026-11-17; reworked to Tube Transistor & ground-drop pickup 2026-11-26)

Capability: `item.tube_transistor` (formerly `item.lantern`) is the developer's glowing vacuum-tube transistor, carried in his inventory and held upright in his screen-right hand by hero model `vibecoder.dev`. It provides the stage's primary warm lighting, unlocks all `ls` option flags (`-a`, `-A`, `-l`, `-la`, etc.; basic `ls [path]` works from the start for visible files only), and reveals hidden dotfiles and cloaked rootkit/spyware malware when swept with `ls -a` / `ls -la`. When placed as a world pickup (`kind: 'pickup'`, `model: 'item.tube_transistor'`), it lays horizontally on its side flush on `y = 0` and lands via a stepped bounce animation (`dropToGround`) when revealed by a declarative `appearWhen` condition (e.g., after petrifying Level 2's gargoyle sentry).

## Requirements

1. THE SYSTEM SHALL define `item.tube_transistor` in the unified item registry (`src/contracts/inventory.ts`) with id `'tube_transistor'`, label `'tube transistor'`, standalone model `'item.tube_transistor'`, hero model `'vibecoder.dev'`, and `light: true`.
2. THE SYSTEM SHALL build `item.tube_transistor` (`src/procgen/archetypes/items/tube-transistor.ts`) as a procedural 3D vacuum-tube transistor model standing upright on its three gold leads on `y = 0` (10 parts: `pin.l`, `pin.c`, `pin.r`, `handle`, `collar`, `bulb`, `pip`, `anode`, `filament`, `glint`; 312 triangles; `0.24 x 0.48 x 0.15`), using zones `lantern`, `hair`, `gold`, `glass`, and `paper`, with `grip` socket at `[0, 0.075, 0]`, `light` socket at `[0, 0.31, -0.07]`, `label` socket at `[0, 0.56, 0]`, and `fx` socket at `[0, 0.28, -0.1]`.
3. WHEN the developer holds `tube_transistor` (`vibecoder.dev`), THE SYSTEM SHALL mount the item's `grip` socket to his screen-right hand with the dark bakelite `handle` positioned behind the hand and arm swing animation applied to all item parts.
4. WHEN holding `tube_transistor`, THE SYSTEM SHALL expose the item's `light` socket as `sockets.lantern` on the hero model `vibecoder.dev`, which the stage lighting system SHALL track as its primary light source (`ComicStage.light`).
5. WHEN placed as a floor pickup (`kind: 'pickup'`, `model: 'item.tube_transistor'`), THE SYSTEM SHALL lay the Tube Transistor horizontally on its side flush on the floor (`rotation.z = Math.PI / 2`, scale `1.45`), and WHEN it spawns via a declarative `appearWhen` pickup reveal (`reason === 'script'`), THE SYSTEM SHALL animate it landing on the ground with a stepped comic bounce (`dropToGround`).
6. WHEN Chapter 1 Level 2 (`level-02-task-ram-heist`) plays, THE SYSTEM SHALL reveal the `tube_transistor` floor pickup (`appearWhen: { kind: 'enemy_dead', enemyId: 'trojan_l2' }`) onto the ground once `gravy_sentry.bin` is petrified (`chmod -x gravy_sentry.bin`), let the player grab it with `mv tube_transistor ~` (giving and holding `tube_transistor`, unlocking `ls -la`, and firing `script.triggers` dialogs on drop, pickup, and `room_swept`), and include `ssd_256gb.img` (`pickup.ssd`) alongside `ram_16gb.dimm`; direct jumps to Level 3+ or classic runs SHALL grant `tube_transistor` (`afterLevel: 2` in Chapter 1, `starterInventory()` default in Classic).
7. WHEN the player executes `ls -a` (or `ls -la`), THE SYSTEM SHALL raise the Tube Transistor, reveal hidden files and cloaked/dotfile malware (such as Level 2's `.vault_beacon` and Level 3's all-hidden squad `.codec_spycam`, `.keygen.exe`, `port_445/worm.bin`, and `.transistor_rune`), trigger `LANTERN_REVEAL` events (unlocking `ACH_LANTERN_SWEEP`), and boost the stage light for the duration of the transition. (While `tube_transistor` is not carried outside Terminal Lab, basic `ls [path]` lists visible files only and any `ls` option flag starting with `-` is refused with exit `1`.)
8. IF the developer holds another item (`terminal`, `laptop`, `manual`, or `map`), THEN executing `ls -a` / `ls -la` SHALL automatically switch the held item back to `tube_transistor` (`holdItem(inv, 'tube_transistor')`), updating the hero model and stage lighting.
9. WHEN the player collects `tube_transistor` (via `mv tube_transistor ~` or `ITEM_GIVEN`), THE SYSTEM SHALL track it toward both `ACH_FULL_LOADOUT` (all 5 inventory items) and `ACH_HARDWARE_HOARDER` (all 5 pickup types) within the 15-achievement catalog (`src/chapters/achievements.ts`), while sanitizing legacy `'lantern'` entries in saved achievement stats to `'tube_transistor'`.

## Out of scope

- Consumable power or filament burnout mechanics (the Tube Transistor never runs out of light).
- Throwing or discarding the Tube Transistor once carried.
- Using Tube Transistor light as a direct damage attack against malware.

## Decisions

- **Q:** Which child items belong under the Inventory entity?
  **A (user, 2026-11-17):** Three items: `lantern`, `terminal`, and `laptop` — lantern is a dedicated child entity (later expanded with `manual` and `map`, and renamed to `tube_transistor` on 2026-11-26).
- **Q:** How should stage lighting behave when holding terminal or laptop instead of the light item?
  **A (user, 2026-11-17):** Only the light item (`item.tube_transistor`, formerly `item.lantern`) carries a `light` socket: holding other items hides the warm halo while keeping dim room ambient readability.
- **Q:** Which item should the developer hold at the start of a run, and when should commands switch it?
  **A (user, 2026-11-17):** Classic starts with `items: ['tube_transistor', 'terminal']` and `held: 'tube_transistor'` (`vibecoder.dev`); `hold <item>` switches explicitly and `ls -a` raises `tube_transistor`.
- **Q:** How should the lantern item and its Level 2/3 acquisition be reworked?
  **A (user, 2026-11-26):** Rename `lantern` to `tube_transistor` ("Tube Transistor") and rebuild its 3D model and HUD icon; lay it on the ground when dropped after petrifying the Level 2 monster so the vibecoder grabs it with `mv tube_transistor ~`; add richer Kiro.d + Vibecoder dialogs encouraging `ls -la`; hide Level 3's enemies so `ls -la` is required there; replace Level 2's tensor image with an SSD disk pickup (`ssd_256gb.img`); move RAM and SSD explanations out of the tutorial into separate first-pickup dialogs (`manifest.onFirstPickup`); add `ACH_FULL_LOADOUT` and `ACH_HARDWARE_HOARDER` achievements (15 total).

## Open questions

## Verification

`validate-model.mjs item.tube_transistor vibecoder.dev --seeds 4`, `node scripts/harness/laptop-unit.mjs`, `npm run quality:fingerprint`, and `node scripts/harness/generate-chapter.mjs --verify`.
