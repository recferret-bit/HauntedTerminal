# Texture catalog

Every texture registered in `TextureCatalog` (`src/procgen/textures/index.ts`). Regenerate the tables with

```
node .kiro/skills/procedural-texture-synthesis/scripts/validate-textures.mjs --all --list
```

and look at them all at once with `npm run procgen:textures` (sheet: `scripts/harness/out/textures.png`,
cell order printed to stdout).

Columns: **zones** is the palette lock (ink, paper and the x0.68 / x0.4 cel shades of each zone are
always allowed). Put a texture on a part whose own `zone` is the first zone listed, so the 14% tint,
the halftone flag and the model validator's colour budget agree with what the texture shows.

## Surfaces (tile on both axes)

Source: `src/procgen/textures/surfaces.ts`.

| id | size | usage | zones | what it is, where it goes |
|---|---|---|---|---|
| `tex.pcb-traces` | 128x128 | surface, tiles | `pcb` `pcbDark` `gold` `solder` | Circuit board: routed trace bundles, vias, solder pads, silk-screen refs. Floors, walls, RAM sticks, any `pcb` part. |
| `tex.heatsink-fins` | 64x64 | surface, tiles | `heatsink` `solder` | Vertical cooling fins: ink gap, shaded left face, lit right edge, cut by cross slots. Heatsinks, radiators, organ pipes. |
| `tex.chip-label` | 128x128 | surface, tiles | `silicon` `rubber` `heatsink` | Black silicon package with laser-etched part number, lot code, pin-1 dot and a bar code. Chips, the SSD, the CPU die. |
| `tex.caution-stripes` | 64x64 | surface, tiles | `powerAmber` | Amber and ink hazard diagonals. Edges of gaps, the furnace, anything that hurts but is not malware. |
| `tex.paper-lines` | 128x128 | surface, tiles | `plastic` | Document paper: a title and ragged ink text lines. Files, scrolls, logs, tombstone inscriptions. |
| `tex.crosshatch` | 64x64 | surface, tiles | ink and paper only | Ink shading on paper: single hatch with patches of cross hatch. Shadow sides, stone, old plastic, comic gutters. |
| `tex.halftone` | 64x64 | surface, tiles | ink and paper only | Ben-Day dots in three stepped sizes, ink on paper. Printed-page shading for flat panels and captions. |
| `tex.glyph-rain` | 128x128 | surface, tiles | `phosphor` `glass` `pcbDark` | Code rain: columns of katakana-like marks, pale head, phosphor trail fading in cel steps. Screens, portals, the core. |
| `tex.hex-dump` | 128x128 | surface, tiles | `phosphor` `powerAmber` `dataCyan` | Rows of hex bytes on a dark terminal, a few highlighted. Memory, data crates, terminals, RAM-slot walls. |
| `tex.ribbon-cable` | 64x64 | surface, tiles | `heatsink` `solder` `lockRed` | Flat grey ribbon cable: parallel wires, one red, with a fold. Cobwebs, hanging cables, bridges. |
| `tex.platter` | 128x128 | surface, tiles | `silicon` `solder` `heatsink` `gold` `plastic` | One hard-drive platter per tile: grooves, a light wedge, a spindle hub. Disc faces in drive bays and tar crates. |
| `tex.corruption` | 128x128 | surface, tiles | `pcb` `pcbDark` `gold` `solder` `corruptMagenta` `corruptViolet` `voidPurple` `toxicGreen` | A PCB being eaten: displaced rows, magenta / violet glitch blocks, void holes. Infected hardware and malware bodies. |
| `tex.ice` | 128x128 | surface, tiles | `ice` `glass` | Frozen process: big pale shards with white fracture lines and sparkles. Skin for anything stopped with SIGSTOP. |
| `tex.stone` | 128x128 | surface, tiles | `heatsink` `solder` | Petrified executable: grey blocks, ink cracks, hatched shadow faces, pits. The gargoyle after chmod -x, tombstones. |
| `tex.grille` | 64x64 | surface, tiles | `heatsink` `solder` | Punched metal mesh: staggered ink holes with a lit lower-left rim, a few clogged. Speaker faces, firewall grilles, vents. |
| `tex.deck-plate` | 64x64 | surface, tiles | `silicon` `rubber` `pcbDark` | Dark, low-contrast ground: bolted silicon deck plates with faint buried traces. Squarish dark faces beside actors (plinths, floor tiles, wall blocks); stretched on a long apron box it smears. |

Notes:

- `tex.pcb-traces` and `tex.corruption` share one board generator (`drawPcb`), so with the same seed the
  corrupted board is the clean board, eaten. Swap one for the other to show infection.
- `tex.ice` and `tex.stone` are the state skins for `SIGSTOP` (frozen) and `chmod -x` (petrified). The
  game currently shows those states by repainting `uColor` (`paint()` in `src/renderer/comic-stage.ts`);
  material recipes that use these textures are in
  [shader-texture-tuning](../../shader-texture-tuning/references/variant-recipes.md).
- `tex.crosshatch` and `tex.halftone` are ink on paper. On a coloured zone they replace 86% of the
  colour with paper; they are for paper-like parts (gutters, captions, documents), not a shading
  overlay. Shadow dots on coloured parts come from the zone's `halftone` flag in the shader.
- `tex.platter` is one disc per tile on a `silicon` field: use it on a cylinder cap or a square face.
- Surfaces are drawn at full zone brightness, for parts the player should notice. For dark faces
  beside the actors use `tex.deck-plate`, which stays within a few luma steps of `silicon`. A box face
  takes one whole tile, so on a long floor apron (8.4 x 0.6) the plates smear; until parts get a UV
  repeat, build the apron from squarish boxes or leave it untextured.
- `tex.glyph-rain` and `tex.hex-dump` are dark with emissive-family colours; on a `phosphor` /
  `dataCyan` zone the part's emissive adds on top, which is what makes a screen glow.

## Backdrops (256x128, tile on x)

Source: `src/procgen/textures/backdrops.ts`. One wall per floor of the bible's floor table, drawn in the
floor's `FLOOR_THEMES` bg, its x0.68 and x0.4 shades and x0.4 hardware colours; the accent appears as
x0.4 lines and a few x0.68 sparks, all in the upper half (rows 0..63). The lower half (rows 64..127)
sits behind the actors: on the rooms' wall (one tile on an 8.4 x 5 unit box face) it covers y 0..2.5,
which contains `ACTOR_BAND` (y 0..2.4, `src/procgen/archetypes/rooms/frame.ts`). There only the floor
bg and its x0.68 shade appear, as panels, brick courses or seams; `BACKDROP_BAND` enforces it. There is
no floor line: the room models draw their own floor, apron and skirting.

| id | size | usage | zones | what it is, where it goes |
|---|---|---|---|---|
| `tex.backdrop.floor1` | 256x128 | backdrop, tiles x | `rubber` `heatsink` `silicon` + floor 1 bg / accent | Floor 1 attic: roof trusses over a row of drive bays with platters and activity lights, ribbon-cable cobwebs; plain panelled wall below. |
| `tex.backdrop.floor2` | 256x128 | backdrop, tiles x | `heatsink` `rubber` + floor 2 bg / accent | Floor 2 crypt: a row of pointed arches barred with firewall grilles, one broken open, over a plain brick wall. |
| `tex.backdrop.floor3` | 256x128 | backdrop, tiles x | `rubber` `heatsink` + floor 3 bg / accent | Floor 3 hall of mirrors: a bus bundle and its mirror image around a corridor of RAM slots and loopback rings; quiet trace ghosts below. |
| `tex.backdrop.floor4` | 256x128 | backdrop, tiles x | `heatsink` `copper` `rubber` + floor 4 bg / accent | Floor 4 boiler room: a copper heat pipe feeding heatsink fins like organ pipes, a fan; a plain riveted boiler wall below. |
| `tex.backdrop.floor5` | 256x128 | backdrop, tiles x | `rubber` `voidPurple` + floor 5 bg / accent | Floor 5 cellar: a cracked CPU die in a pin field with storm bolts either side, the pin grid fading into a dark wall below. |

The game's stage currently draws its back wall as a flat `createComicMaterial(theme.bg, { halftone: true })`
plane (`buildScene` in `src/renderer/comic-stage.ts`). A backdrop texture goes on that kind of plane as
`uMap`; room models in `src/procgen/archetypes/rooms*` reference them through `PartSpec.texture`.

## Decals (cut-outs, no wrap)

Source: `src/procgen/textures/decals.ts`. Alpha is 0 or 255; the outline is 2 px of ink.

| id | size | usage | zones | what it is, where it goes |
|---|---|---|---|---|
| `tex.decal.pid-tag` | 64x32 | decal | `lockRed` | A paper luggage tag reading PID and a process number (the seed picks it). Chest of zombie processes and daemons. |
| `tex.decal.rwx-lock` | 64x64 | decal | `gold` `solder` `lockRed` `phosphor` | A padlock stamped RWX with three permission lamps (red denied, green granted; the seed picks them). Locked doors and files. |
| `tex.decal.bolt` | 64x64 | decal | `powerAmber` | The power mark: an amber zigzag bolt (the seed nudges the zigzag). Energy cells, fuse boxes, high-voltage warnings. |

The comic material does not read the map's alpha. Transparent decal pixels carry ink as their hidden
RGB, so a decal on a `box` shows as a sticker on an ink plate. See "Using a texture on a model" in
[SKILL.md](../SKILL.md).

## Ideas not drawn yet

Useful next textures, if a model needs them: RAM-slot rows, a USB / port contact strip, a keyboard key
grid, a cracked CRT glass, a floppy label, a firewall brick, a boot-log paper (`tex.paper-lines` with
`[ OK ]` marks). Keep the same rules: one object, two or three zones, 2 px minimum.
