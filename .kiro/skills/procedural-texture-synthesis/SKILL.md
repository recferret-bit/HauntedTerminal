---
name: procedural-texture-synthesis
description: "[ASSET PCG] Draw, register and validate procedural comic textures: flat, hard-edged, palette-locked pixel buffers (PCB traces, chip labels, heatsink fins, glyph rain, hex dumps, corruption, ice, stone, floor backdrops, decals) made in TypeScript with the `tex*` toolkit in `src/procgen/textures`. Use whenever you add or change a texture, put `texture:` on a model part, need a backdrop or decal, see a seam, gradient or off-palette colour, or when `npm run procgen:textures` fails. Read `haunted-art-direction` first."
---

# Procedural texture synthesis

Textures in this game are **ink drawings of hardware**, not materials. They are generated in code as
`PixelBuffer`s (RGBA8, row 0 on top), with no image files and no canvas, so the same generator runs in
the browser and in the node harness. Art rules come from
[haunted-art-direction](../haunted-art-direction/SKILL.md); this skill is how to draw inside them.

## Why textures look the way they do

A texture reaches the screen through four stages, and each one removes something:

1. A model part names it: `PartSpec.texture: 'tex.pcb-traces'` (`src/procgen/core/types.ts`).
2. `buildModel` (`src/procgen/runtime/build.ts`) turns it into a nearest-filtered `DataTexture` and binds
   it as `uMap` on that part's comic material.
3. The comic fragment shader (`src/shaders/comic-material.ts`) does
   `col = mix(uColor * band, albedo * band, 0.86)`. The texture is 86% of the colour, the zone colour
   14%, and both are multiplied by the cel band (1, 0.68 or 0.4). Halftone dots, stripes, the ink rim,
   emissive and the lightning flash are added after.
4. The pixel-art pass samples the frame in 2 px cells, quantizes to 20 levels with Bayer dither and
   remaps through a palette ramp; then the CRT pass adds scanlines.

So:

- **No lighting in the texture.** The shader owns light. A texture that paints its own highlights and
  shadows gets them multiplied by the bands and reads as dirt. Draw objects (traces, pads, fins,
  glyphs), not shading. A single hard cel step on a raised shape is fine.
- **Flat colour, hard edges, no gradients, no noise.** Dither and quantization turn a fade into
  crawling speckle. Variation comes from shapes and from stepping between palette colours.
- **Palette-locked.** Colours come only from `ZONES` (`src/procgen/core/palette.ts`), each at the three
  cel bands (x1, x0.68, x0.4), plus ink `#110e1b` and paper `#f4f1ea`. Backdrops add their floor's
  `FLOOR_THEMES` bg and accent. Each texture declares its `zones`; the validator holds it to them.
- **Nothing thinner than 2 px, on the even grid.** The pixel pass keeps one sample per 2 px cell. A
  1 px line flickers in and out; a 2 px line that starts on an odd coordinate loses a third of its
  contrast. Text is drawn at scale 2 or more.
- **Value carries the drawing.** The game's default pixel palette is full colour (mode 0), but the
  16-level quantizer and the retro modes (4 COMIX keeps only 22% of the hue) flatten close colours. Two
  colours of equal brightness can merge on screen. Separate shapes by light against dark (ink under gold,
  paper on green), and use hue as a bonus.
- **Close to the zone colour.** The part's zone still tints 14% and drives halftone, emissive and the
  model validator's 60/30/10 budget. A `pcb` part gets a mostly-`pcb` texture.
- **Seeds vary layout, never identity.** `tex.chip-label` is always a chip label; the seed changes the
  part number. Use `makeRng(seed)`, never `Math.random()`.

## Kinds

| usage | size | wraps | rules |
|---|---|---|---|
| `surface` | 64 or 128 (max 256), square | both axes | Albedo for model parts. At most ~12 colours. |
| `backdrop` | 256x128 | x only | One per floor. Dark and low-contrast so actors pop: mean luma <= 52, luma spread <= 22, bright pixels <= 3%. Motif and accent lights in the upper half only; the lower half (`TEX_BACKDROP_QUIET_FROM` = 0.5) sits behind the actors and holds only the floor bg and its x0.68 shade. No floor line: room models draw their own floor. |
| `decal` | 64x64 or 64x32 | no | Cut-out with alpha 0 or 255 and a 2 px ink outline. |

Every shipped texture, with zones and intended use: [texture-catalog.md](./references/texture-catalog.md).
Check there before drawing a new one.

## Using a texture on a model

```ts
{ name: 'board', shape: { kind: 'box', size: [1.2, 0.8, 0.1] }, zone: 'pcb', pos: [0, 0.4, 0], texture: 'tex.pcb-traces' }
```

- `box`: one tile per face, stretched to the face. Readable on its camera face. A face far from the
  tile's aspect smears the drawing (a 64x64 tile on an 8.4 x 0.6 apron turns seams into wide bands).
- `extrude`: UVs are (−x, y) of the outline, so one tile per world unit (a 0.3 unit part shows 30% of the
  tile). `shapeToGeometry` flips u so the camera face reads left-to-right like a box face (world +x is
  screen-left). Prefer a box for text-heavy labels anyway: a small extrude shows only part of the tile.
- `cylinder`: the tile wraps around the side; caps show the inscribed circle (`tex.platter` is made for caps).
- There is no per-part UV scale. If the drawing is too coarse or too fine on a part, change the part
  or draw a variant at another pitch.
- Decals: the comic material reads only `.rgb` of `uMap`, so transparent decal pixels render as ink
  (their hidden RGB is ink on purpose). Put a decal on a thin `box` with `outline: false`, sized to the
  decal's aspect, and accept the ink plate, or cut the part to the decal's shape.
- Geometry first: pins, fins and contacts that carry the silhouette are parts, not pixels. A texture
  adds drawing to a face that is already the right shape.

## Workflow

1. **Draw.** Write a `TexEntry` in `src/procgen/textures/` (`surfaces.ts`, `backdrops.ts` or
   `decals.ts`) with the toolkit: [drawing-toolkit.md](./references/drawing-toolkit.md). Follow the
   worked example [socket-pins.ts](./examples/socket-pins.ts): zones, grid, base colour, big shapes,
   repeating feature with ink under it, one accent, stop.
2. **Register.** Add the entry to that file's exported list (`SURFACE_TEXTURES`, ...).
   `src/procgen/textures/index.ts` registers the lists in `TextureCatalog`. Ids are `tex.<name>`,
   `tex.backdrop.floor<n>`, `tex.decal.<name>`.
3. **Validate.** From the project root:
   ```
   node .kiro/skills/procedural-texture-synthesis/scripts/validate-textures.mjs tex.my-thing --sheet --out scripts/harness/out/draft.png
   ```
   A draft that is not registered yet: `--file path/to/draft.ts` checks every `TextureEntry` the
   module exports. Fix every error; read every warning.
4. **Look.** Open the PNG with the Read tool. Tileable textures are shown 2x2 (backdrops 2x1): a seam
   is a line through the middle of the cell. Ask: is it recognisable as the thing at a glance? Is it
   ink and flat colour? Does one tile repeat without an obvious "stamp"? Try `--seed 7`.
5. **Whole set.** `npm run procgen:textures` (all textures, sheet at `scripts/harness/out/textures.png`)
   and `npm run procgen:selftest`.
6. **Under the real shaders.** `npm start`, open `/storybook.html?tab=textures` for every texture
   through the pixel-art and CRT passes, then the models tab for a model that uses yours. The software sheet (`npm run procgen:sheet`) also samples textures, but only the
   storybook shows the pixel-art and CRT passes. If the drawing turns to mush there, it is too fine:
   make shapes bigger, not the texture larger.
7. Add a row to [texture-catalog.md](./references/texture-catalog.md)
   (`validate-textures.mjs --all --list` prints the table).

## What the validator checks

`validateTexture(entry, buf)` in `src/procgen/validate/textures.ts`; limits in `TEXTURE_LIMITS`.

| Code | Meaning | Usual fix |
|---|---|---|
| `SIZE_POW2`, `SIZE_RANGE`, `BACKDROP_SHAPE` | Power-of-two sides; surfaces 64 to 256; backdrops at least 2:1 | Resize |
| `SEAM_X`, `SEAM_Y` | The wrap is more discontinuous than the worst interior column / row | Pitch must divide the size; draw across the border (writes wrap); no clipped shapes |
| `OFF_PALETTE` | Pixels that are not an allowed colour of the declared `zones` | `texColor()` only; declare the zone; `quantizeToPalette()` after any blend |
| `COLOR_COUNT` | More than 12 colours (warning), 24 (error) | Fewer zones, fewer shades |
| `GRADIENT` | Pixels sitting in smooth ramps | Replace the fade with two or three flat steps |
| `FLAT_FILL` | No drawing at all | Use the plain zone colour instead of a texture |
| `BACKDROP_BRIGHT`, `BACKDROP_CONTRAST` | Backdrop too light or too busy | Floor bg and its shades, x0.4 hardware colours, accent as dots |
| `BACKDROP_BAND` | Detail, ink or lights in the lower half, where actors stand (the rooms' `ACTOR_BAND`, y 0..2.4 of a 5 unit wall) | Move the motif up; below row 64 use bg and bg x0.68 only; start thick brushes inside the tile so they do not wrap down |
| `THIN_DETAIL`, `DOWNSAMPLE_LOSS` | 1 px features; contrast lost in a 2x downsample | 2 px minimum, even coordinates, text scale 2 |
| `ALPHA_SOFT`, `ALPHA_HOLES`, `DECAL_OPAQUE` | Partial alpha; holes in a non-decal; a decal with no cut-out | Alpha is 0 or 255, decals only |
| `NONDETERMINISTIC`, `SEED_IGNORED`, `SEED_CHANGES_STATIC`, `SEED_CHANGES_SIZE` | Same seed differs; seed does nothing; seed changes size | `makeRng(seed)`; vary layout or set `staticLayout: true` |

`scripts/self-test.mjs` feeds the validator synthetic bad textures with known answers. Run it after
changing a threshold or a toolkit function; if you add a check, add its bad case there.

The numbers cannot tell a good drawing from a tidy bad one. A texture that passes and does not read as
its object on the sheet is not done.
