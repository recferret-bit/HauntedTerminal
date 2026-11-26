# Post chain: what each pass does to the art

Order (`ComicStage` constructor, and the storybook's `src/storybook/stage/lab-stage.ts`):
`RenderPass` -> `OutputPass` (sRGB + ACES tone mapping at 1.05) -> pixel-art pass -> CRT pass.
Live tuning in the game: F8 opens the shader lab (`src/ui/visual-lab.ts`), F9 toggles CRT, F10
toggles pixel-art; values persist in `localStorage` under `credits.lab.*`. Judge art at the defaults
below: those are what players see.

## Pixel-art pass (`src/shaders/pixel-art.ts`, `DEFAULT_PIXEL_PARAMS`)

| Param | Default | Effect on art |
|---|---|---|
| `pixelSize` | 3.5 | Cell size in **CSS** pixels (scaled by the device pixel ratio, so blocks look the same on Retina). Each cell takes **one** sample at its centre: no averaging. A feature thinner than a cell is either kept whole or dropped, and it flickers as it moves. |
| `edgeStrength` | 0.65 | Darkens a cell up to ~27% when a neighbour is much brighter: a faint extra keyline inside bright edges. It does not draw ink where there is none. |
| `colorLevels` | 16 | Quantization steps per channel, and of luma for the palette ramp. |
| `dither` | 0.85 | 4x4 Bayer, scaled by 1/levels: a light checker in smooth gradients (fresnel rim, lightning falloff). Flat cel bands stay flat. |
| `saturation` / `contrast` | 1.16 / 1.05 | Small pushes before quantizing. |
| `gridStrength` | 0.05 | A faint darker line on each cell's border. |
| `paletteMode` | **0, full RGB** | True hue survives. Modes 1 to 5 are retro options; COMIX (4) is described below because it flattens colour families. |

These defaults live in `DEFAULT_PIXEL_PARAMS` (`src/shaders/pixel-art.ts`).

**COMIX palette (mode 4, optional)**: the quantized **luma** picks a colour on a 4-stop ramp, ink (20,15,18) ->
magenta (239,71,111) -> yellow (255,209,102) -> paper (239,230,210), and the result is
`mix(ramp, original, 0.22)`. Only 22% of the true hue survives. Consequences:

- **Hue stops separating families; luma does.** Hoodie orange, malware magenta and PCB green all land
  on the pink-yellow-cream ramp by brightness. Two zones of equal luma read as one zone.
- Dark values (below ~0.33 luma) go ink-to-magenta: dark backdrops turn plum, shadow bands merge
  with ink lines.
- Emissive whites land on paper cream: an LED and a paper label look alike unless sizes differ.

Other modes for comparison (`?palette=` in the lab): 0 FULL (no remap: the true colours), 1 GAMEBOY,
2 AMBER, 3 NEON, 5 MANSION (ink -> deep violet -> violet -> amber, also 22% hue).

## CRT pass (`src/shaders/crt-pass.ts`, `DEFAULT_CRT_PARAMS`)

| Param | Default | Effect on art |
|---|---|---|
| `mix` | 1 | The processed frame fully replaces the clean one (lower values blend it back in). |
| `scanlineIntensity` | 0.18 | A 1 css-px dark row every 3 css px, 18% darker, crawling one pitch every 0.9 s. A 1-px horizontal line can sit in a dark row and fade. |
| `vignetteStrength` | 0.5 | Clear until 55% of the corner distance, then up to 50% darker at the corners. Small dark things in corners vanish first. |
| `noiseOpacity` | 0.05 | Grain in 2 css-px blocks, mixed toward white, restepped 10 times per second. |
| `rollIntensity` | 0.045 | A bright band 30% of the screen tall, crossing top to bottom every 8 s. |
| `flickerStrength` | 0.05 | Two short whole-frame dips every 3.7 s (one at full strength, one at 60%). |
| `distort` | 0 | Barrel warp, off by default (it re-filters the pixel cells). Straight lines stay straight. |

Net effect: thin horizontal lines lose contrast, dark-on-dark loses another step, the frame corners lose detail.
Nothing in the CRT pass sharpens.

## Tone mapping (OutputPass)

ACES at exposure 1.05 rolls off highlights: emissive `color * (1 + emissive)` above 1.0 compresses,
so two bright emissives of different strength look the same. The lightning flash (`uFlash` 5.5 at the
strike point) blows nearby surfaces to near white for ~0.1 s: this is intended.

## What survives the chain (rules of thumb at 58 px per unit, pixel ratio 1)

| Survives | Does not |
|---|---|
| Shapes 4+ px (0.07 units) across | Single-pixel details, 1-px gaps between parts |
| Silhouettes with notches and spikes | Smooth bevels (become one band) |
| Luma contrast between neighbouring zones (≥ ~0.2 luma apart) | Hue-only contrast (orange next to magenta of the same brightness) |
| One clear bright focal point | Several glows: they all become the same cream |
| Ink outline on the silhouette | Ink lines inside a dark zone (merge into it) |
