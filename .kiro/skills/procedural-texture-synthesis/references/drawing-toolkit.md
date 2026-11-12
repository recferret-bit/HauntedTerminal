# Drawing toolkit

Source: `src/procgen/textures/toolkit.ts` and `src/procgen/textures/font.ts`, on top of
`src/procgen/core/pixels.ts`. Everything is re-exported from `src/procgen/index.ts`, so harness scripts
see it as `procgen.texLine` and so on. Inside `src/procgen/textures/` import from `./toolkit.js` and
`./font.js`.

Three properties hold for every function, and anything you add must keep them:

- **Hard-edged.** A pixel is either the colour or not. No anti-aliasing, no alpha blending.
- **Wrapping.** All writes go through `setPixel`, which wraps coordinates. A shape drawn across the
  border re-enters on the other side, so tileability is free as long as pitches divide the size.
- **Colour comes in as a number you got from `texColor`.** The toolkit never invents a colour.

Coordinates are pixels, origin top-left, y down. Keep positions and sizes even.

## Colour

| Function | Use |
|---|---|
| `texColor(zone, shade = 0)` | The colour of a `ZONES` entry at cel band 0 (lit), 1 (x0.68), 2 (x0.4). The only way to get a colour. |
| `texFloorColor(floor, 'bg' \| 'accent', shade = 0)` | Backdrop colours from `FLOOR_THEMES`. |
| `texShade(hex, shade)` | The same darkening for an arbitrary hex (used by the two above). |
| `INK`, `PAPER` | From `core/palette.ts`. Always allowed. |
| `texPalette(zones, extra?)` | The full list of colours a texture locked to `zones` may contain. |
| `texAllowedColors(entry)` | The list the validator uses for an entry (`zones`, `floor`). |
| `quantizeToPalette(buf, zones, extra?)` | Snap every opaque pixel to the nearest allowed colour. Returns the number of pixels changed. A no-op on anything drawn with `texColor`; the last step after scaling, blending or importing pixels. It fixes colour, not softness: a blurred edge stays a staircase of in-between shades. |
| `texSnapToColors(buf, colors)` | The same against an explicit colour list. |

## Buffers

| Function | Use |
|---|---|
| `texNew(w, h, hex)` | Opaque buffer filled with one colour. Start every surface and backdrop here. |
| `texNewDecal(w, h)` | Fully transparent buffer (hidden RGB is ink). Start every decal here. |
| `texGet(buf, x, y)` | Colour of a pixel as `0xRRGGBB`, wrapping. For masks ("hatch only the shaded cells"). |
| `texTile(buf, nx, ny)` | Repeat a buffer, to look at seams. |
| `texScaleUp(buf, k)` | Nearest-neighbour integer upscale. |
| `texInkOutline(buf, t = 2, hex = INK)` | Decals: turn every transparent pixel within `t` px of an opaque one into ink. Call it last. |

From `core/pixels.ts`: `makePixels`, `setPixel`, `getPixel`, `fillRect`, `blit` (no wrap, clipped).

## Shapes

| Function | Notes |
|---|---|
| `texRect(buf, x, y, w, h, hex, mask?)` | Filled rectangle. |
| `texFrame(buf, x, y, w, h, hex, t = 2)` | Rectangle outline drawn inside the box. |
| `texLine(buf, x0, y0, x1, y1, hex, t = 2)` | Bresenham line with a square `t` px brush. Horizontal, vertical and 45 degree lines are cleanest. |
| `texPolyline(buf, pts, hex, t = 2, closed = false)` | Connected lines: cables, cracks, arches. |
| `texDisc(buf, cx, cy, r, hex, mask?)` | Filled disc. An integer centre with integer `r` gives a symmetric dot `2r` px wide. |
| `texRing(buf, cx, cy, r, hex, t = 2, from?, to?)` | Ring of outer radius `r`; `from` / `to` in radians cut an arc or, with a large `t`, a wedge. |
| `texPolygon(buf, pts, hex)` | Filled polygon, even-odd rule. |

Ink under a shape: draw the same shape 1 to 2 px larger in `INK` first, then the colour on top.

## Patterns

| Function | Notes |
|---|---|
| `texStripes(buf, hex, { period, width, dir, offset?, mask? })` | `dir` is `'h'`, `'v'`, `'/'` or `'\\'`. `period` must divide the size. |
| `texCrosshatch(buf, hex, { spacing, thickness = 2, dirs = 'x', mask? })` | Diagonal ink hatching, one direction (`'/'`, `'\\'`) or both. |
| `texHalftone(buf, hex, { cell, radius, stagger = true, mask? })` | Ben-Day dots. `radius` may be a function of the dot centre for stepped sizes; keep it >= 2. `cell` must divide the width and `2 * cell` the height. |
| `texBlocks(buf, { cell, seed, colors, weights?, mask? })` | Blocky noise: each `cell` square takes one of `colors` (`null` leaves it). Glitch, tiles, dead pixels. |
| `texSteppedNoise(buf, { cell, seed, colors, octaves?, thresholds?, mask? })` | Hard-edged value noise: smooth wrapping noise cut into flat contour bands, one colour per band. Stains, camouflage, infection fronts. |
| `texNoiseField(w, h, cell, seed, octaves = 1)` | The same noise as a function `(x, y) -> 0..1`, for masks and for choosing between a few discrete options. Never write its value into a pixel as a brightness. |
| `texCellNoise(buf, { points, seed, colors, weights?, edge?, edgeWidth = 2, mask? })` | Voronoi shards with straight borders, each one flat colour, optional crack colour between them. Ice, stone, shattered glass. Returns the cell index per pixel. |
| `texLattice(cols, rows, seed)` | Raw wrapping grid of random values, if you need your own pattern. |

A `mask` is `(x, y) => boolean`. Typical masks: a rectangle test, `field(x, y) > 0.5`, or
`texGet(buf, x, y) === someColour` captured before drawing.

## Text

3x5 bitmap font in `font.ts`: digits, capitals (lower case is mapped to capitals), `- . : / _ # + = < > ! ? * % [ ] ( ) |`
and space, plus 16 katakana-like marks.

| Function | Notes |
|---|---|
| `texText(buf, text, x, y, hex, scale = 1)` | Top-left anchored. Returns the width drawn. Use scale 2 on surfaces (6x10 px glyphs, 8 px advance), 3 for a headline. |
| `texTextWidth(text, scale)` | For centring. |
| `texKana(buf, index, x, y, hex, scale)` | One of `TEX_KANA_COUNT` alien marks, for code rain. |
| `texHexByte(n)` | `0..255` as two hex digits. |

A 3 px wide `W` reads as an `H`; where the letter matters (the `RWX` lock) draw it by hand 5 px wide.
Text in a texture is rhythm, not information: at game scale it is a few screen pixels tall.

## Recipes

Trace bundle that wraps (from `surfaces.ts`): run from x = 0 to the width, with two 45 degree jogs of
equal and opposite height, so the bundle leaves the tile at the row it entered. Offset each parallel
trace's jog by `0.414 * pitch` to keep the spacing through the bend.

Glitch tear that stays on palette: copy a band of rows and write it back shifted sideways
(`tex.corruption`). Every pixel is still a palette colour and the band still wraps.

Infection front: sample `texNoiseField` once per 8 px block, not per pixel, and fill whole blocks by
threshold. The blob has a blocky, digital edge instead of an organic one.

Cel step on a raised shape: the light comes from the upper screen-RIGHT (`uLightDir` x = −0.35, and
world +x is screen-left). On the camera face of a `box` the texture is not mirrored (texture left is
screen-left), so the x0.68 shade goes on the lower-left 2 px of a pad or pin, a highlight on the
upper-right, and the lit inner wall of a hole is its lower-left. One step only. On an `extrude` the
texture IS mirrored (see SKILL.md): there the baked shade lands on the wrong side and text reads backwards.

Depth in a backdrop: wall = floor bg, recess = bg x0.68, hole = bg x0.4, frame = a x0.4 hardware
colour or `rubber`, light = accent x0.4 in a 4x4 px square. That is the whole budget, and all of it
goes in the upper half: from row `TEX_BACKDROP_QUIET_FROM` (0.5) down the wall sits behind the actors
and may use only bg and bg x0.68, in large calm shapes (panels, brick courses, seams).

A thick brush wraps: a 6 px line drawn at y = 0 leaves pixels in the bottom rows. Start motifs a
brush-width inside the tile.

## Adding a toolkit function

Add it to `toolkit.ts` with a `tex` prefix (the module is re-exported from `src/procgen/index.ts`
next to other agents' modules, so names must not collide), write through `setPixel`, take colours as
arguments, and add a case to `scripts/self-test.mjs` if it can produce something the validator should
reject.
