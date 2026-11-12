---
name: shader-texture-tuning
description: "[ASSET PCG] Tune and extend the real shaders: the comic cel material (bands, uMap mix, halftone, stripes, ink rim, ghost, emissive, lightning flash), ink shells, vortex and flood materials, the pixel-art pass (pixel size, levels, Bayer dither, edge, palette modes), the CRT pass, composer order and the visual lab dock. Use whenever a material or the whole frame looks wrong (muddy, too dark, speckled, thin or thick outlines, unreadable textures), when you change any shader constant or uniform, or add a material variant or post effect (malware glitch, SIGSTOP ice, chmod -x stone). Read `haunted-art-direction` first."
---

# Shader and texture tuning

The look is produced by a short, fixed chain. Every tuning question is "which link owns this?".

```
zone colour + texture ──> comic material (cel bands, map, halftone, stripes, ink rim, emissive, flash)
ink shell (back faces, #110e1b) ─┘
        RenderPass ──> OutputPass ──> pixel-art pass ──> CRT pass
```

| Link | File | Owns |
|---|---|---|
| Comic material | `src/shaders/comic-material.ts` | Light (3 bands), albedo map mix, shadow dots, stripes, rim darkening, glow, ghost, flash |
| Ink shell | `src/procgen/geometry/geometry.ts` `inkShellGeometry`, `runtime/build.ts` | The outline: constant world-space weight (0.028) |
| Vortex, flood | `src/shaders/comic-material.ts` | `/dev/null` spiral, the rising data flood |
| Pixel-art pass | `src/shaders/pixel-art.ts` | Pixel size, colour levels, dither, edge darkening, **the final palette** |
| CRT pass | `src/shaders/crt-pass.ts` | Scanlines, roll, grain, flicker, vignette, barrel |
| Composer, wiring | `src/renderer/comic-stage.ts` | Pass order, per-frame uniforms, `setInk` / `setPixelParams` / `setCrtParams` |
| Visual lab dock | `src/ui/visual-lab.ts` | Live sliders in the running game, saved in `localStorage` (`haunted.lab.*`) |
| Software preview | `src/procgen/geometry/raster-shade.ts` | A copy of the comic fragment maths for the harness sheets |

Details: [comic-material.md](./references/comic-material.md) (every uniform and constant, ink shells,
vortex, flood, known quirks) and [post-passes.md](./references/post-passes.md) (pixel-art and CRT
parameters, palette modes, composer order, visual lab, adding a pass).

## What must not change

These are the look. A tuning change that breaks one is a redesign, not a tweak.

1. **Three hard bands**: lit 1.0, mid 0.68, shadow 0.4, from one fixed light `(-0.35, 0.82, -0.48)`:
   upper screen-RIGHT, toward the camera (x = −0.35 and world +x is screen-left). Lit faces point
   up and to the right; shadow sides are screen-left and underneath. No smooth lighting term anywhere.
2. **Ink is `#110e1b`** and outlines have one weight across a model.
3. **Stepped, not faded.** Anything animated in a shader moves in steps (`floor(uTime * n)`, `step()`),
   like a comic drawn on twos. Smooth fades turn to dither crawl in the pixel pass.
4. **Emissive means signal.** Only `signal` zones, the lantern, glass and malware eyes glow.
5. **Colours come from `ZONES`** (`src/procgen/core/palette.ts`), passed in as uniforms. No colour
   literals in new GLSL, except the existing flash tint.
6. **The pixel-art pass quantizes the final, display-space colour.** The default palette mode is 0 (full
   colour, 16 levels, Bayer dither), so hue survives; modes 1 to 5 are retro options, and modes 4 (COMIX)
   and 5 keep only 22% of the hue. Judge a material change after the pass, in the storybook.

## The parity rule

`src/procgen/geometry/raster-shade.ts` mirrors the comic fragment shader so models can be previewed and
validated in node. If you change any of these in one file, change it in the other in the same commit:

| What | `comic-material.ts` | `raster-shade.ts` |
|---|---|---|
| Light direction | `LIGHT = (-0.35, 0.82, -0.48)` | `LIGHT = normalize([-0.35, 0.82, -0.48])` |
| Band thresholds and values | `shade > 0.66 ? 1.0 : shade > 0.4 ? 0.68 : 0.4` | same expression |
| Map mix | `mix(col, albedo * band, 0.86)` | `r * 0.14 + tr * band * 0.86` |
| Halftone darkening | `mix(1.0, 0.78, dotMask)` in non-lit bands, dots placed in **world xz** | `*= 0.78` in non-lit bands, dots placed in **screen space** |
| Ink rim | `pow(1 - n.v, 2.6)`, `smoothstep(0.55, 0.92) * 0.55` | same numbers |
| Emissive | `col += uColor * uEmissive` | `+= base * emissive` |
| Ghost | alpha `uOpacity * (0.12 + fres * 1.15)`, max 0.92, tint `(0.25, 0.08, 0.35) * fres` | same numbers (tint as 64, 20, 89) |

Two known gaps, so the preview is kinder than the game:
- **Halftone placement differs.** The shader uses `vWorld.xz`, so on camera-facing faces (constant z)
  the dots become vertical streaks or vanish; the raster draws real screen-space dots. Moving the shader
  to `vWorld.xy` would fix the game; that is a look change, so it needs sign-off.
- **The raster skips the post passes.** The default pixel-art palette (`paletteMode: 4`, COMIX, an option, no longer the default) keeps
  little hue, so colours that differ in the sheet can come out the same in the game. See "The shipped
  look loses hue" in the art bible.

The texture toolkit's cel shades (`TEX_SHADES = [1, 0.68, 0.4]` in `src/procgen/textures/toolkit.ts`)
are the same band values: change the bands and the texture palette lock moves with them.

`node .kiro/skills/shader-texture-tuning/scripts/check-examples.mjs` verifies these constants are
present in both files (and that the example variants still patch cleanly). The preview does not
implement stripes, the flash, the pixel-art pass or the CRT pass.

## Tuning workflow

1. **Name the link.** Turn passes off to find it: in the game, the dock buttons (CRT, PIXEL, INK,
   STORM) toggle each stage; in the storybook (`npm run dev`, `/storybook.html`) use the same toggles
   and the palette buttons. If it is wrong with pixel and CRT off, it is the material or the model.
   If it is only wrong with them on, it is a pass parameter.
2. **Tune live first.** Move the visual lab slider until it reads right; note the value.
3. **Make it the default in code.** Pass defaults live in `DEFAULT_PIXEL_PARAMS` (`pixel-art.ts`),
   `DEFAULT_CRT_PARAMS` (`crt-pass.ts`), `DEFAULT_INK` (`visual-lab.ts`). Material constants live in
   `COMIC_FRAG`. Per-zone flags (`emissive`, `halftone`, `stripes`, `ghost`, `opacity`) live in
   `ZONES`: fix a zone there, not in a shader. Clear `localStorage` keys `haunted.lab.*` to see defaults.
4. **Keep parity** (table above) and run:
   ```
   node .kiro/skills/shader-texture-tuning/scripts/check-examples.mjs
   npm run procgen:sheet        # software preview of every model: scripts/harness/out/models.png
   npx tsc --noEmit
   ```
5. **Look at the real frame**: the game and `/storybook.html`, vibecoder at game scale (58 px per unit),
   on a dark floor and on paper, with a lightning flash held. Check a `signal` pickup, a malware
   enemy and a textured part: those three cover emissive, halftone and map.

Symptom to knob:

| Symptom | Look at |
|---|---|
| Shadows crawl or speckle | `dither` (0.28) too high for `colorLevels` (20); a gradient in a texture or shader |
| Everything pink / hue lost | `paletteMode` 4 does that by design; compare with mode 0 before changing a zone |
| Outline too thin at game scale | `inkWeight` in the `ModelSpec` / `DEFAULT_INK_WEIGHT`; then `edgeStrength` (0.32) |
| Texture is mush | Texture detail under 2 px or low value contrast: fix the texture ([procedural-texture-synthesis](../procedural-texture-synthesis/SKILL.md)), not `pixelSize` |
| Model is a dark blob | Too much surface in the 0.4 band (depth too large, faces turned from the light) or rim eating small parts |
| Glow does nothing | `uEmissive` is additive in the zone colour: dark zones cannot glow. Use a `signal` zone |
| Dots become streaks or vanish | Known quirk of the world-space halftone, see comic-material.md |

## Adding a material variant

Do not fork `COMIC_FRAG`. Patch it at its four stable points (uv, surface, emissive, output) so the
variant inherits bands, map, rim and flash, and stays a comic material that the stage keeps feeding
`uTime` and `uFlash`. [comic-variants.ts](./examples/comic-variants.ts) is working code for three:

- `glitchVariant`: malware corruption (stepped magenta / violet blocks, torn rows).
- `frozenVariant`: SIGSTOP, an ice skin from `tex.ice` flipping in block by block.
- `petrifiedVariant`: chmod -x, a stone skin from `tex.stone`, emissive off.

[variant-recipes.md](./references/variant-recipes.md) explains the patch points, the GLSL of each
variant, how to wire one into the stage, and the checklist for a new one.

## Adding a post effect

Follow `crt-pass.ts`: a `ShaderPass` factory plus `set*` helpers, parameters as a typed object with
defaults. Decide the slot: effects that belong to the drawing go **before** the pixel-art pass so they
are quantized with it; effects of the monitor go after the CRT pass. Worked example:
[glitch-pass.ts](./examples/glitch-pass.ts). Rules and the slider wiring: post-passes.md.
