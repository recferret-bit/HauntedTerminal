# Tube Transistor Item (formerly Lantern): design

Status: see requirements.md

## Pieces

```
src/contracts/
  inventory.ts              ITEMS.tube_transistor (`item.tube_transistor`, `vibecoder.dev`, `light: true`)
src/procgen/archetypes/items/
  tube-transistor.ts        buildTubeTransistor(seed): 10-part vacuum-tube transistor standing on 3 gold pins at y=0
                            with grip, light, label, and fx sockets (replaces deleted items/lantern.ts)
src/procgen/archetypes/
  items.ts                  registers ModelCatalog `item.tube_transistor` from ITEM_BUILDERS
  vibecoder.ts              mounts tube_transistor to hand, tags parts with arm swing, registers vibecoder.dev
src/renderer/
  stage-cast.ts             laidTransistor lays `item.tube_transistor` pickups horizontally flush on y=0 (rotZ=PI/2, scale 1.45)
  stage-motion.ts           dropToGround() drops floor `item.*` pickups onto the ground with a stepped comic bounce
  stage-frame.ts            lightFrame tracks hero's sockets.lantern as primary comic light source
  portrait.ts               renders `item.tube_transistor` for the HUD `.items-strip` icon
src/chapters/
  types.ts / script-types.ts LevelPickupSpec.appearWhen, LevelScript.triggers, ScriptCond `room_swept`,
                            ChapterManifest.onFirstPickup (four-place rule: script.ts, schema.ts, validate-pack.ts)
  session-shell.ts          dispatch() gates `ls` option flags (`hasLsFlags`) until `hasItem('tube_transistor')`
  session-fs.ts             collectPickupNode gives/holds `tube_transistor`, triggers `onFirstPickup`, reveals `appearWhen`
                            pickups; cmdLs reveals dotfiles, sets `roomSwept`, and switches held item to `tube_transistor`
  session-level.ts          loadLevel applies cumulative `afterLevel: 2` grant (`tube_transistor`, `ssd: 256`, `ram: 16`)
  achievements.ts           15 achievements including `full_loadout` (`ACH_FULL_LOADOUT`) and `hardware_hoarder` (`ACH_HARDWARE_HOARDER`)
src/game/
  session-shell.ts          CLASSIC_HANDLERS.ls shares `hasLsFlags` + `LS_FLAGS_LOCKED_MESSAGE` flag gate with Chapter shell
```

## Decisions

- **Single light source.** Only `item.tube_transistor` provides `sockets.light`. When held, `vibecoder.dev` gains `sockets.lantern` at the glowing tube envelope (`[0, 0.31, -0.07]`), keeping internal shader/renderer socket naming (`sockets.lantern`) and `LANTERN_REVEAL` / `ACH_LANTERN_SWEEP` wire keys stable.
- **Ground-laying drop pose.** On the floor as a pickup (`kind: 'pickup'`, `model: 'item.tube_transistor'`), `stage-cast.ts` rotates the model onto its side (`rotation.z = Math.PI / 2`, scale `1.45`) flush on `y = 0`. When a pickup's `appearWhen` condition flips true (e.g., `enemy_dead` on Level 2's `trojan_l2`), `session-fs.ts` spawns it with `reason: 'script'` and `stage-motion.ts` runs `dropToGround()`.
- **Declarative pacing (`appearWhen`, `script.triggers`, `manifest.onFirstPickup`).** Level 2 drops `tube_transistor` after petrifying `gravy_sentry.bin`, guides `mv tube_transistor ~` and an `ls -la` test via `script.triggers`, and pairs `ram_16gb.dimm` with `ssd_256gb.img` (`pickup.ssd`). Level 3 hides all three enemies (`spyware_l3`, `crack_l3`, `worm_l3`) behind `ls -la`. RAM (+Max HP) and SSD (auto-Revive) tutorials fire once per session on first pickup via `manifest.onFirstPickup`.
- **`ls -a` / `ls -la` raising.** Executing `ls -a` / `ls -la` raises the Tube Transistor (`g.inventory = holdItem(g.inventory, 'tube_transistor')`), sets `roomSwept`, triggers `LANTERN_REVEAL`, and flashes stage lighting.
- **Intentional asset fingerprint update (2026-11-26).** Replacing `item.lantern` with `item.tube_transistor` (312 tris, 10 parts) updates `item.tube_transistor` and `vibecoder.dev` geometry intentionally.

## Layers and gates

- Gates: `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs item.tube_transistor vibecoder.dev --seeds 4`, `npm run quality:fingerprint`, `node scripts/harness/generate-chapter.mjs --verify`, `npm run quality`.
