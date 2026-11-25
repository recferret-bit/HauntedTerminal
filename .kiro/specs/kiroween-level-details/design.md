# Kiroween Level Details, Colored Textolites, Hardware Props & Haunted Fauna: design

## Pieces

```
src/procgen/core/
  palette.ts                      adds 4 hardware colored textolite zones (`pcbAmber`, `pcbBlue`, `pcbRed`, `pcbBlack`, halftone: true) + `PCB_ZONES`
src/procgen/textures/
  surfaces-pcb.ts                 parameterized `drawTextolitePcb` (45-deg trace bundles, gold/solder vias & pads, silkscreen refs on 2px grid)
  surfaces.ts                     registers `tex.pcb-amber`, `tex.pcb-blue`, `tex.pcb-red`, `tex.pcb-black` into `SURFACE_TEXTURES`
src/procgen/archetypes/props/
  components.ts                   `prop.wire_loom`, `prop.gpu_card`, `prop.gpu_server`, `prop.ram_bank`, `prop.transistor`
  cooling.ts                      `prop.indicator`, `prop.cooler_tower`, `prop.cooler_aio`, `prop.water_pipe`
  kiroween.ts                     `prop.cobweb`, `prop.spider`, `prop.bat` (hardware-built ambient Kiroween dressing, non-malware)
src/procgen/archetypes/props.ts   registers all 12 new `prop.*` entries in `ModelCatalog`
src/procgen/archetypes/pickups.ts adds hovering `pickup.gpu` and seed-driven colored-textolite substrate + `tex.pcb-*` variation on `pickup.ram`
src/procgen/archetypes/rooms/
  kit-kiroween.ts                 room-scale upper-wall/wing/apron helpers (`radialCobweb`, `danglingSpider`, `perchedBat`, `waterPipe`, `coolerUnit`, `indicatorPanel`, `wireBundle`, `transistorCluster`)
  floor1.ts..floor5.ts            seed-varied room enrichment across all 5 floor themes keeping `ACTOR_BAND` dark & unobstructed
src/contracts/
  room-view.ts                    adds optional `roomSeed?: number` on `RoomView`
src/renderer/
  comic-stage.ts                  tracks `{ kind, seed, model, animator }` on `ComicStage.room`
  stage-layout.ts                 rebuilds `room.<kind>` whenever `kind` or `seed` changes (no longer hardcoded to seed 1)
  stage-sync.ts                   passes `view.roomSeed ?? 1` to `syncRoomModel`
src/game/
  entities.ts                     maps scavenged GPU `.img` pickups (or explicit `pickup.model`) to `'pickup.gpu'` without changing `PickupType` storage/backup math
  view.ts, view-layouts.ts        computes deterministic `roomSeed` per `cwd` (`hashSeed`) and enriches classic-floor `LAYOUTS` with new hardware/Kiroween props
src/chapters/
  types.ts                        adds optional `roomSeed?: number`, `props?: LevelPropSpec[]` (`id`, `model`, `x`, `y?`, `label?`), and `LevelPickupSpec.model?: string`
  session-snapshot.ts             emits `roomSeed` (combined with `cwd` sub-room hash) and declarative `spec.props` on `RoomView`
  validate-pack.ts                checks `props` (`id` uniqueness, valid `model` via `assetIssues`, finite `x`/`y`), `roomSeed` >= 1, and `pickup.model`
src/chapter-editor/
  schema.ts, schema-check.ts      adds exhaustive editor fields for `roomSeed`, `pickup.model`, and `props` (`OVERVIEW` + `ENTITIES`)
src/terminal-lab/
  level-import.ts                 maps imported chapter `spec.props` / `roomSeed` cleanly when importing a level into Terminal Lab
chapters/chapter-01-kiroween/
  levels/*/level.spec.json        curates distinct `roomSeed`s and sector-themed declarative `props` across all 11 levels (including progressive Hub 1 -> Hub 2 -> Hub 3 upgrades), written via `stringifyChapterJson`
src/chapters/generated/
  catalog-data.ts                 recompiled by `node scripts/harness/generate-chapter.mjs`
.kiro/skills/
  credits-art-direction/references/world-lexicon.md              documents `pickup.gpu` and the 12 new `prop.*` models
  procedural-texture-synthesis/references/texture-catalog.md     documents `tex.pcb-amber`, `tex.pcb-blue`, `tex.pcb-red`, `tex.pcb-black`
```

## Decisions

- **Hardware-safe 5-board textolite palette + `seed = 1` texture coverage (`palette.ts`, `surfaces-pcb.ts`).** Chosen hexes (`pcbAmber: 0x8a5a28`, `pcbBlue: 0x1d4e89`, `pcbRed: 0x7d1d2c`, `pcbBlack: 0x1d222b`) use deep earthy/solder-mask values with Ben-Day halftone so human `hoodie` (`0xf77f00`) and hostile malware `corruptMagenta`/`corruptViolet` (`0xef476f`/`0x9b5de5`) stay unmistakable. Because `scripts/harness/asset-usage.mjs` inspects `ModelCatalog.build(id, 1).parts` at `seed = 1`, each of the 4 new `tex.pcb-*` textures is referenced at `seed = 1` (`prop.transistor` -> `tex.pcb-amber`, `prop.gpu_card` -> `tex.pcb-blue`, `prop.ram_bank` -> `tex.pcb-red`, `prop.gpu_server` / `pickup.gpu` -> `tex.pcb-black`) while other seeds cycle across all 5 boards. Follows Req 1 & 7 and Decision 1.
- **Visual-only `pickup.gpu` mapping without mutating `PickupType` save/grant contracts (`entities.ts`, `pickups.ts`).** Scavenged `gpu_*.img` pickups keep `type: 'ssd'` (+256 GB storage/backup math and `grants` compatibility) while `entities.ts` selects `'pickup.gpu'` (or an explicit `LevelPickupSpec.model`) for their stage mesh. Rejected adding a `'gpu'` `PickupType` union member because GPU files in `chapter-01-kiroween` intentionally grant storage/VRAM capacity under existing rules and `solutionCommands`. Follows Req 4 and Decision 4.
- **Hardware-constructed Kiroween fauna (`props/kiroween.ts`, `rooms/kit-kiroween.ts`).** Spiders (`prop.spider`) are built from DIP/TO-92 packages and 8 bent IC-pin legs hanging on a thin wire thread (`hover`, `wall`, stepped `bob`/`swing`); bats (`prop.bat`) use folded `pcbBlack`/ribbon-cable wings and capacitor ears (`hover`, `wall`, stepped `swing`/`bob` at `y >= 2.5`); cobwebs (`prop.cobweb`) are radial silver `solder` spokes and polygonal spiral rings. Zero `malware` zones and zero `jitter` tags are used so players never confuse ambient Kiroween set-dressing with targetable enemies. Follows Req 3 & 6 and Decision 3.
- **Four-place declarative `props` & `roomSeed` + dynamic `ComicStage` room seeding (`types.ts`, `schema.ts`, `validate-pack.ts`, `session-snapshot.ts`, `stage-layout.ts`).** Extending `LevelSpec` with optional `roomSeed` and `props` lets each of the 11 levels (and Hub 1 -> Hub 2 -> Hub 3 in `/home/dev`, which all share `cwd: '/home/dev'` and `roomKind: 'desk'`) declare its own hardware/Kiroween stage dressing and room seed in JSON rather than hardcoding level checks in `src/` (forbidden by `check-declarative.mjs`). Sub-directories combine `spec.roomSeed` with `hashSeed(cwdPath)` so entering `cd vram_crate` or `cd port_445` shifts room variation deterministically. Follows Req 5 & 6 and Decision 5.
- **Strict `ACTOR_BAND` discipline and part/triangle budgets.** Room-kit additions (`kit-kiroween.ts`) place cobwebs, bats, dangling spiders, water pipes, indicator panels, and coolers strictly in the upper wall (`y > 2.4`), left wing (`x > 1.7`), or apron (`y < 0`), keeping rooms well below `80` parts / `8000` tris and props below `40` parts / `3500` tris and `<= 5` non-light/neutral zones. Follows Req 2, 3, 6, 7.

## Layers and gates

- **Layer rules (`scripts/quality/check-layers.mjs`):** Unchanged (zero new `src/<area>/`, zero cross-layer violations).
- **Pages (`vite.config.ts`):** Unchanged.
- **Vocabulary & schema (`guard-chapter-files`):** Coordinated four-place update across `src/chapters/types.ts`, `src/chapters/session-snapshot.ts`, `src/chapter-editor/schema.ts` (+ `schema-check.ts`), and `src/chapters/validate-pack.ts`, plus `src/terminal-lab/level-import.ts`.
- **Team ownership (`scripts/quality/check-agents.mjs`):** Every new/modified file falls under a single existing owner (`artist`, `chapters-designer`, `terminal-designer`, `lead-dev`); `.kiro/agents/*.json` needs no change.
- **Asset fingerprints (`npm run quality:fingerprint`):** Intentional additions for 4 `tex.pcb-*` textures, `pickup.gpu`, 12 `prop.*` models, and updated `pickup.ram` + `room.*` hashes; all unrelated actors (`vibecoder.*`, `item.*`, `malware.*`, `boss.*`, `agent.*`, `npc.*`, `door.*`) remain byte-identical.
- **Verification gates:**
  - `node scripts/quality/check-specs.mjs`
  - `node scripts/quality/check-brands.mjs`
  - `node .kiro/skills/procedural-texture-synthesis/scripts/validate-textures.mjs --all`
  - `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --strict`
  - `node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all`
  - `node scripts/harness/asset-usage.mjs`
  - `node scripts/harness/editor-unit-test.mjs`
  - `node scripts/harness/terminal-lab-unit.mjs`
  - `node scripts/harness/generate-chapter.mjs --verify`
  - `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`
  - `node scripts/harness/screenshot-lab.mjs --selftest`
  - `npm run quality:fingerprint`
  - `npm run quality`
  - `npm run build`
