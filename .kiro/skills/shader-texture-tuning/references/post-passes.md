# Pixel-art pass, CRT pass, composer, visual lab

## Composer order

Built in the `ComicStage` constructor (`src/renderer/comic-stage.ts`):

```
RenderPass(scene, camera) -> OutputPass -> pixelPass -> crtPass
```

`OutputPass` does tone mapping and the colour-space conversion first, so the pixel and CRT passes work in display colour (as in TerraAgent). The pixel pass's `pixelSize` is in CSS pixels: `setPixelArtParams(pass, params, pixelRatio)` scales it. Pass resolution is set in `resize()`
in device pixels (`w * pixelRatio`), through `setPixelArtSize` and `setCrtSize`. Passes are switched
with `pass.enabled` (`applyConfigVisuals`, driven by `stage.pixelOn` / `stage.crtOn`).

## Pixel-art pass (`src/shaders/pixel-art.ts`)

One fragment shader assembled from five chunks: `BAYER_CHUNK`, `EDGE_CHUNK`, `PALETTE_CHUNK`,
`QUANTIZE_CHUNK`, `PIXEL_MAIN`. Per output pixel it finds its cell (`uResolution / uPixelSize`),
samples the scene once at the cell centre plus four neighbours, and quantizes.

| Param (`PixelArtParams`) | Default | Lab range | Effect |
|---|---|---|---|
| `pixelSize` | 2 | 1..8 | Cell size in device pixels. Everything thinner than one cell can vanish. |
| `colorLevels` | 20 | 2..32 | Steps per channel after dither. Low values posterize the three cel bands into each other. |
| `dither` | 0.28 | 0..1.5 | Ordered 4x4 Bayer, amplitude `dither / levels`. It only shows where the input is between levels: flat comic colour stays flat, gradients crawl. |
| `edgeStrength` | 0.32 | 0..1.5 | Darkens a cell whose brightest neighbour is 0.10 to 0.32 brighter (an extra ink line on the dark side of edges) and adds a small ridge lift. |
| `saturation` | 1.05 | 0..2 | Applied before quantizing. |
| `contrast` | 1.04 | 0.5..1.6 | Around 0.5, before quantizing. |
| `gridStrength` | 0 | 0..0.25 | Darkens the last row / column of each cell (an LCD grid). |
| `paletteMode` | 4 | 0..5 | See below. |

Palette modes (`applyPaletteMode`), chosen by quantized luma `qLuma`:

| Mode | Name | Result |
|---|---|---|
| 0 | FULL | Quantized RGB, no remap. The reference when judging a zone colour. |
| 1 | GAMEBOY | Four greens, 100% remap. |
| 2 | AMBER | Black to amber, 100% remap. |
| 3 | NEON | Navy to blue to pink, 100% remap. |
| 4 | COMIX | Ramp ink `(20,15,18)` -> magenta `(239,71,111)` -> amber `(255,209,102)` -> paper `(239,230,210)`, mixed 78% ramp / 22% scene colour. |
| 5 | MANSION | Ramp ink -> `(58,42,85)` -> violet `(155,93,229)` -> gold `(224,177,90)`, 78 / 22. |

Consequence for all art: in the shipped look, **luma decides the colour**. Dark things go to ink and
magenta, mid values to amber, bright to paper; hue survives only as a 22% tint. A zone, texture or
variant must separate by value. Two zones of the same luma are the same colour on screen.

Tuning notes:

- `pixelSize` 2 with a 58 px per unit camera gives the hero about 46 cells of height. At 3 the ink
  shell (1.6 px) starts to break up; raise `inkWeight` with it or leave it.
- `dither` and `colorLevels` trade: `dither / levels` is the visible amplitude. 0.28 / 20 is quiet.
- `edgeStrength` thickens outlines only where the pass sees a luma step. It cannot draw an outline
  between two parts of equal value; that is the ink shell's job.
- To add a palette mode: add a branch in `applyPaletteMode` (keep the 78 / 22 mix so `signal` hues
  still tint), extend the comment at the top of the file, `PALETTE_NAMES` in `src/ui/visual-lab.ts`
  and `src/lab/options.ts`, and the `paletteMode` slider `max`.

## CRT pass (`src/shaders/crt-pass.ts`)

| Param (`CrtParams`) | Default | Lab range | Effect |
|---|---|---|---|
| `scanlineIntensity` | 0.22 | 0..0.65 | `sin(uv.y * resolution.y * pi)` lines. |
| `rollIntensity` | 0.03 | 0..0.25 | A bright band drifting up the screen. |
| `noiseOpacity` | 0.035 | 0..0.3 | Blocky grain, 12 changes per second. |
| `flickerStrength` | 0.03 | 0..0.25 | Rare whole-frame dips (1.5% of 1/8 s ticks). |
| `vignetteStrength` | 0.28 | 0..0.95 | Corner darkening. |
| `mix` | 0.72 | 0..1 | Blend of the processed frame over the straight one; scales every effect above. |
| `distort` | 0.008 | 0..0.08 | Barrel warp plus a tiny horizontal wave. 0 adds neither. |

`setCrtTime(pass, t)` is called every frame by the stage. The CRT pass is the monitor glass: keep it
subtle enough that the terminal text under the scene and 2 px ink lines stay sharp. `distort` above
~0.02 bends the panel frames visibly.

## Visual lab dock (`src/ui/visual-lab.ts`)

`mountVisualLab(hooks)` in `src/main.ts` adds a button strip (CRT, PIXEL, INK, STORM, PROJECTION) and
a slider dialog. It calls `stage.setPixelParams`, `stage.setCrtParams`, `stage.setInk`,
`stage.setStorm`, `stage.setZoom`. State is read at boot by `readInitialShaderState()` and stored in
`localStorage` under `haunted.lab.` + `pixel`, `crt`, `ink` (JSON records), `pixelOn`, `crtOn`,
`stormOn`, `storm`, `zoom`, `inkHold`.

- A value you tuned in the dock lives only in your browser. Ship it by changing the `DEFAULT_*` constant.
- Stale `haunted.lab.*` keys make the game ignore new defaults. Clear them when a default "does nothing".
- INK tab: OUTLINE 0..2 scales shells, HALFTONE 0..1 is an on/off switch at 0.05 (see quirks in
  comic-material.md). PROJECTION: ZOOM 0.75..1.6.
- To expose a new parameter: add it to the params interface and defaults in the shader file, to the
  `set*Params` function, to the matching `*_SLIDERS` list and to the `write*` / `*Field` switches in
  `visual-lab.ts`. Sliders are data; the dialog renders from the list.

The asset lab (`/asset-lab.html`, `src/lab/`) has its own toggles for the same passes and palette
modes and takes them as URL parameters (`src/lab/options.ts`), which makes before / after screenshots
reproducible: `/asset-lab.html?tab=textures&pixel=0&crt=0`.

## Adding a post pass

Worked example: [glitch-pass.ts](../examples/glitch-pass.ts) (screen tear for a malware hit).

1. One file in `src/shaders/`, shaped like `crt-pass.ts`: params interface, `DEFAULT_*`, GLSL strings,
   `create*Pass(width, height, params)`, `set*Size`, `set*Params`, `set*Time` if animated.
2. Choose the slot. Part of the drawing (tears, shockwaves, panel wipes, speed lines): insert before
   the pixel pass, `composer.insertPass(pass, 1)`, so it is quantized and dithered with the scene.
   Part of the monitor (ghosting, burn-in): after `crtPass`.
3. Work in pixel-art cells. Offsets are whole multiples of `pixelSize / resolution`; time is stepped
   with `floor(uTime * n)`. A sub-cell shift shimmers.
4. Disable the pass when it does nothing (`pass.enabled = false`): every enabled pass is a full-screen draw.
5. Resize it in `ComicStage.resize()` next to the others, feed time in `frame`, add a toggle and sliders
   to the visual lab if it has parameters worth tuning.
6. Glow blur, blur of any kind, depth of field and tone mapping are off the table: they make gradients, and the pixel
   pass turns gradients into noise.
