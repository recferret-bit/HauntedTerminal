# Kiroween Level Details, Colored Textolites, Hardware Props & Haunted Fauna: requirements

Status: done (implemented and verified 2026-11-26)

Capability: Elevate all 11 levels of `chapter-01-kiroween` with rich, varied hardware and Kiroween atmosphere—adding a 5-board colored-textolite palette and tileable PCB surface textures, a modular suite of procedural hardware/cooling props and room-kit builders (wire looms, discrete & server GPUs, RAM banks, transistors, animated indicators, air & AIO liquid coolers, coolant water pipes), hardware-built Kiroween cobwebs, dangling spiders, and flapping bats, dedicated `pickup.gpu` + varied `pickup.ram` pickup visuals, and declarative per-level props + deterministic room seeds (including progressive Hub 1 -> Hub 2 -> Hub 3 server rack upgrades) editable in `/editor`.

## Requirements

1. WHEN models, rooms, or pickups render PCB substrates, THE SYSTEM SHALL provide a 5-board hardware textolite set in `ZONES` (`src/procgen/core/palette.ts`)—keeping existing green FR-4 (`pcb`, `pcbDark`) and adding vintage amber phenolic (`pcbAmber`), sapphire blue (`pcbBlue`), oxide crimson (`pcbRed`), and matte black server substrate (`pcbBlack`) in family `'hardware'` with halftone shading—paired with seamless tileable 2px-grid comic surface textures (`tex.pcb-amber`, `tex.pcb-blue`, `tex.pcb-red`, `tex.pcb-black` in `src/procgen/textures/surfaces.ts`) whose hues and values remain distinct from vibecoder human orange (`hoodie`) and hostile malware magenta/violet.
2. WHEN building standalone stage props (`src/procgen/archetypes/props/`) and room architecture (`src/procgen/archetypes/rooms/kit.ts`), THE SYSTEM SHALL register seed-varied procedural 3D relief models and room-kit builders for braided/ribbon/frayed wire looms (`prop.wire_loom`), discrete multi-fan graphics cards (`prop.gpu_card`), high-density tensor server sleds (`prop.gpu_server`), multi-slot colored-textolite and heatspreader RAM banks (`prop.ram_bank`), TO-92 and TO-220 transistor clusters (`prop.transistor`), stepped 12fps diagnostic indicators including 7-segment POST readouts, LED bar-graphs, and dial gauges (`prop.indicator`), copper-heatpipe tower coolers (`prop.cooler_tower`), AIO liquid-cooling radiators/blocks (`prop.cooler_aio`), and flanged coolant water pipes with glass sight-tubes and reservoirs (`prop.water_pipe`).
3. WHEN furnishing Kiroween rooms and levels with haunted atmosphere, THE SYSTEM SHALL provide hardware-built ambient Kiroween set-dressing—radial solder/fiber-optic cobwebs (`prop.cobweb`), 8-pin IC/transistor spiders dangling on threads with stepped 12fps bob/swing motion (`prop.spider`), and folded-PCB/ribbon-wing bats hanging or gently flapping in upper room space with stepped 12fps swing/bob motion (`prop.bat`), plus matching upper-wall/corner room-kit builders—using strictly hardware, neutral, glass, or subtle signal palette zones (zero malware zones) so ambient fauna never reads as a combat enemy.
4. WHEN a level spawns scavenged GPU pickups (`gpu_*.img` or a pickup declaring a GPU visual) or RAM stick pickups (`pickup.ram`), THE SYSTEM SHALL render GPU pickups using a dedicated hovering `pickup.gpu` model (colored textolite board, finned shroud, gold PCIe edge fingers, and pulsing signal core) without altering `PickupType` storage/backup mechanics or `solutionCommands`, and SHALL vary `pickup.ram` PCB substrate zones and textures deterministically by seed.
5. WHEN a chapter level or sub-directory is loaded in play, preview, or `/editor`, THE SYSTEM SHALL support optional declarative `roomSeed` and `props` (`LevelPropSpec[]`: `id`, `model`, `x`, `y?`, `label?`) across the four-place chapter contract (`src/chapters/types.ts`, `src/chapters/session-snapshot.ts`, `src/chapter-editor/schema.ts`, `src/chapters/validate-pack.ts`) and `RoomView` (`src/contracts/room-view.ts` -> `src/renderer/stage-layout.ts`), rebuild `room.<kind>` with deterministic per-level/sub-room seeds rather than a fixed seed `1`, enrich `room.<kind>` builders (`floor1.ts..floor5.ts`) while keeping `ACTOR_BAND` dark and unobstructed, and dress all 11 levels of `chapters/chapter-01-kiroween/`—including visible Hub 1 (Level 4) -> Hub 2 (Level 7) -> Hub 3 (Level 10) server rack, GPU, cooler, indicator, and water-pipe upgrades.
6. WHILE actors stand in `ACTOR_BAND` on the play stage, THE SYSTEM SHALL keep wall relief behind actors within dark band zones and place tall or bright hardware/Kiroween dressing in the left wing, upper wall (`y > 2.4`), floor apron, or non-overlapping prop slots so vibecoder, malware, doors, and pickups maintain crisp silhouettes under the pixel-art and CRT post passes.
7. IF any new or updated palette zone, texture, model, animation tag, room, chapter schema field, or level spec violates geometry/readability/semantic budgets, leaves an asset unreferenced, breaks `/editor` or `/terminal-lab` schema parity, or causes a death or failure in headless playthroughs, THEN `validate-model.mjs --all --strict`, `validate-textures.mjs --all`, `check-tags.mjs --all`, `asset-usage.mjs`, `editor-unit-test.mjs`, `terminal-lab-unit.mjs`, `generate-chapter.mjs --verify`, `verify-chapter.mjs`, and `npm run quality` SHALL fail.

## Out of scope

- Changing chapter puzzle mechanics, VFS file names, enemy stats, backup math, or `solutionCommands`.
- Starting a second chapter beyond `chapter-01-kiroween`.
- Adding extra Three.js scene lights, shadow maps, bloom, or smooth non-stepped gradients.
- Using `human` or `malware` palette zones on rooms or non-hostile props/fauna.

## Decisions

- **Q:** Which colored textolite (PCB substrate) palette zones and tileable surface textures should we add?
  **A (user, 2026-11-25):** Full 5-board hardware set (green FR-4 + amber phenolic + sapphire blue + oxide crimson + matte black) with tileable PCB textures — maximum board variety while keeping orange (hero) and magenta/violet (malware) unmistakable.
- **Q:** How granular should the new hardware, wiring, transistor, indicator, cooler, and water-pipe assets be?
  **A (user, 2026-11-25):** Full modular hardware + liquid-cooling suite (~10–12 new props & room-kit parts: wire looms, dual-fan/H100 GPUs, RAM banks, TO-92/TO-220 transistors, 7-seg/bar/dial indicators, tower/AIO coolers, coolant pipes/reservoirs) — covers every requested detail with animated fans/indicators and seed variety.
- **Q:** How should the Kiroween spider webs, spiders, and bats look and animate inside the computer world?
  **A (user, 2026-11-25):** Hardware-built ambient Kiroween fauna (solder/fiber radial cobwebs, 8-pin IC/transistor spiders dangling on threads, folded-PCB/ribbon-wing bats hanging & flapping in upper corners) — fits the "everything is hardware" art rule with stepped 12fps life and zero enemy confusion.
- **Q:** Should scavenged GPU and RAM pickups on the stage floor also get visual upgrades, or only decorative props?
  **A (user, 2026-11-25):** Add a dedicated `pickup.gpu` model for scavenged GPU `.img` pickups + colored-textolite seed variation on `pickup.ram`, alongside larger background GPU/RAM props — scavenging a GPU actually looks like a glowing GPU/tensor module without changing level commands or win rules.
- **Q:** How should we drive visual variety and set-dressing across all 11 Kiroween levels and sub-rooms?
  **A (user, 2026-11-25):** Declarative level props + per-level/path room seeds + enriched `room.<kind>` builders (including progressive Hub 1->2->3 server upgrades & Kiroween dressing across all 11 levels, editable in `/editor`) — makes every level and Hub reboot visually distinct and tunable in Chapter Editor.

## Open questions

(none)

## Verification

| Requirement | Gate |
|---|---|
| 1 | `node .kiro/skills/procedural-texture-synthesis/scripts/validate-textures.mjs --all` |
| 2, 3, 4, 6 | `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --strict`, `node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all`, `node scripts/harness/asset-usage.mjs` |
| 5, 7 | `node scripts/harness/editor-unit-test.mjs`, `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/generate-chapter.mjs --verify`, `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs` |
| 1–7 | `node scripts/harness/screenshot-lab.mjs --selftest`, `npm run quality:fingerprint`, `npm run quality`, `npm run build` |
