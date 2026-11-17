# Lantern Item: requirements

Status: done (implemented and verified against all quality gates 2026-11-17)

Capability: `item.lantern` is the developer's oil lantern from his desk, carried in his inventory and held in his screen-right hand by hero model `vibecoder.dev`. It provides the stage's primary warm lighting and reveals hidden dotfiles and cloaked rootkit/spyware malware when swept with `ls -a`.

## Requirements

1. THE SYSTEM SHALL define `item.lantern` in the unified item registry with id `'lantern'`, label `'lantern'`, standalone model `'item.lantern'`, and hero model `'vibecoder.dev'`.
2. THE SYSTEM SHALL build `item.lantern` as a procedural 3D model standing on `y = 0` (4 parts: handle ring, cap, glass, foot; ~188 triangles; height ~0.41), using zones `lantern` and `hair`, with `grip` socket at `[0, 0.33, 0]` and `light` socket at `[0, 0.135, -0.07]`.
3. WHEN the developer holds `lantern` (`vibecoder.dev`), THE SYSTEM SHALL mount the lantern's `grip` socket to his screen-right hand with the handle part positioned behind the hand and arm swing animation applied to all lantern parts.
4. WHEN holding `lantern`, THE SYSTEM SHALL expose the item's `light` socket as `sockets.lantern` on the hero model `vibecoder.dev`, which the stage lighting system SHALL track as its primary light source (`ComicStage.light`).
5. WHEN the player enters the computer or starts/restarts a run or level, THE SYSTEM SHALL place `lantern` in inventory and hold it in hand by default.
6. WHEN the player executes `ls -a` (or `ls -la`), THE SYSTEM SHALL raise the lantern, reveal hidden files and dotfile malware (`.poltergeist.lock`, `.spycam`), trigger `LANTERN_REVEAL` events, and boost the stage lantern light for the duration of the transition.
7. IF the developer holds another item (`terminal` or `laptop`), THEN executing `ls -a` SHALL automatically switch the held item back to `lantern` (`holdItem(inv, 'lantern')`), updating the hero model and stage lighting.

## Out of scope

- Consumable oil or fuel mechanics (the lantern never runs out of light).
- Throwing or dropping the lantern.
- Using lantern light as a combat attack against malware.

## Decisions

- **Q:** Which child items belong under the Inventory entity?
  **A (user, 2026-11-17):** Three items: `lantern`, `terminal`, and `laptop` — lantern is a dedicated child entity.
- **Q:** How should stage lighting behave when holding terminal or laptop instead of lantern?
  **A (user, 2026-11-17):** Only `item.lantern` carries a `light` socket: holding `terminal` or `laptop` hides the oil-lantern halo while keeping dim room ambient readability.
- **Q:** Which item should the developer hold at the start of a run, and when should commands switch it?
  **A (user, 2026-11-17):** Start with `items: ['lantern', 'terminal']` and `held: 'lantern'` (`vibecoder.dev`); `hold <item>` switches explicitly and `ls -a` raises `lantern`.

## Open questions

## Verification

`validate-model.mjs item.lantern vibecoder.dev --seeds 4`, `node scripts/harness/laptop-unit.mjs`, `npm run quality:fingerprint`, and `node scripts/harness/generate-chapter.mjs --verify`.
