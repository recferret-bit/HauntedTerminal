# Terminal Item & Lab: requirements

Status: done (implemented and verified against all quality gates 2026-11-17)

Capability: `item.terminal` is the developer's handheld field cyberdeck slate, carried in his inventory from the start and held in his screen-right hand by hero model `vibecoder.dev_terminal`. In-game it represents his direct terminal link to the machine; out-of-game a test bench `/terminal-lab` lets developers place enemies, pickups, props, riddles, tasks, and NPC dialogue, play them in the real game on the real comic stage, and replay them headlessly without player damage.

## Requirements

1. THE SYSTEM SHALL define `item.terminal` in the unified item registry with id `'terminal'`, label `'terminal'`, standalone model `'item.terminal'`, and hero model `'vibecoder.dev_terminal'`.
2. THE SYSTEM SHALL build `item.terminal` as a handheld field cyberdeck slate standing on `y = 0` (dark `silicon` shell, brown `hair` leather grip handle, recessed `pcbDark` bezel with a glowing `phosphor` `>_` prompt screen, and `solder` keypad), with sockets `grip` and `screen`, and WITHOUT a `light` socket.
3. THE SYSTEM SHALL register `vibecoder.dev_terminal` in `ModelCatalog` as the developer holding `item.terminal` in his screen-right hand, tagging terminal parts with arm swing and placing the handle behind the hand.
4. WHEN holding `terminal`, `vibecoder.dev_terminal` SHALL omit `sockets.lantern`; the stage lighting system SHALL treat the hero light as null (falling back to room ambient without drawing an oil-lantern halo on the hero's chest).
5. THE SYSTEM SHALL include `terminal` in `starterInventory()` alongside `lantern` (`['lantern', 'terminal']`); running `hold terminal` SHALL switch the hero model to `vibecoder.dev_terminal` and emit a `VIBECODER_ACTION` event.
6. WHEN `/terminal-lab[/<lab-id>]` opens, THE SYSTEM SHALL show the shared workstation layout (`src/editor-core/`): Scene dock, real game in an iframe (swapping sessions in-page without reloading the iframe), Inspector, Script & Console; layout persists under `ht-terminal-lab-ui`.
7. THE SYSTEM SHALL offer placeable game objects from live catalogs (never hand-typed): `EnemyType` (`BESTIARY`), `PickupType` (`PICKUP_INFO`), `ModelCatalog` prop IDs, `RoomKind`, floor themes 1-5, `ScriptAgent` NPCs and Kiro cores, across both `driver: "chapter"` and `driver: "classic"`.
8. THE SYSTEM SHALL let the user define riddles (socket with prompt and text/`re:` answer), tasks (win rules), and checks (commands, stdout, exit codes, events, files), displaying each as a live goal.
9. WHILE a terminal lab runs, THE SYSTEM SHALL never reduce HP and never trigger death/reboot; damage is counted in `absorbed` and enemy attacks may be paused with `enemyFire: hold`.
10. THE SYSTEM SHALL provide both a `live` clock and a `manual` clock, deterministic execution matching browser and Node transcripts, autosave in localStorage, and save/load to `scripts/harness/terminal-lab/` via the dev-only `/api/terminal-lab` endpoint with etag 409 conflict protection.

## Out of scope

- Writing chapter or comix specs from `/terminal-lab`.
- Consuming battery or power when holding the terminal.
- Displaying real-time in-game terminal output on the tiny `item.terminal` in-world 3D model during normal play.

## Decisions

- **Q:** Which child items belong under the Inventory entity?
  **A (user, 2026-11-17):** Three items: `lantern`, `terminal`, and `laptop` — terminal becomes an inventory item too, unifying all carried tools.
- **Q:** If terminal is a child of Inventory, what should it own in-game and in specs?
  **A (user, 2026-11-17):** Full inventory item (`item.terminal` + `vibecoder.dev_terminal`, carried from start with lantern), and the terminal child spec owns `/terminal-lab` just as laptop owns `/laptop-lab`.
- **Q:** How should `item.terminal` look as a 3D kitbash model in his hand and in Storybook?
  **A (user, 2026-11-17):** Handheld field cyberdeck slate: dark silicon shell, brown leather grip handle, recessed pcbDark bezel with glowing phosphor `>_` screen and solder keypad (distinct from the closed beige laptop briefcase).
- **Q:** Which item should the developer hold at the start of a run, and when should commands switch it?
  **A (user, 2026-11-17):** Start with `items: ['lantern', 'terminal']` and `held: 'lantern'` (`vibecoder.dev`); `hold <item>` switches explicitly and `ls -a` raises `lantern`.
- **Q:** How should stage lighting behave when holding terminal or laptop instead of lantern?
  **A (user, 2026-11-17):** Only `item.lantern` carries a `light` socket: holding `terminal` or `laptop` hides the oil-lantern halo (no chest glow bug) while keeping dim room ambient readability.

## Open questions

## Verification

`validate-model.mjs item.terminal vibecoder.dev_terminal --seeds 4`, `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/terminal-lab-api-test.mjs`, `node scripts/harness/terminal-lab.mjs --all`, `node scripts/harness/terminal-lab-smoke.mjs`, `npm run quality:fingerprint`, and `npm run quality`.
