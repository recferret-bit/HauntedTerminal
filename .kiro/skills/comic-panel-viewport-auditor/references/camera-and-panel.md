# Camera and panel: the numbers

Every value below is read from the code. If the code changes, the code wins: re-read it and fix
this page. Main source: `src/renderer/comic-stage.ts` (class `ComicStage`).

## Renderer

| What | Value | Where |
|---|---|---|
| Renderer | `WebGLRenderer({ antialias: true })` | constructor |
| Pixel ratio | `min(devicePixelRatio, 1.75)` | constructor |
| Output | `SRGBColorSpace`, `ACESFilmicToneMapping`, exposure `1.05` | constructor |
| Lights in the scene | ambient `0xf4f1ea` 0.35, directional `0xfff4dd` 1.1 at (−2.4, 6.5, −4.2) | constructor |
| Lights that matter | none of the above: comic materials ignore Three.js lights. They use `uLightDir` | `src/shaders/comic-material.ts` |
| `uLightDir` | normalize(−0.35, 0.82, −0.48): up, toward the camera, and toward world −x, which is **screen-right** | `LIGHT` in comic-material.ts |

## Camera

| What | Value |
|---|---|
| Type | `OrthographicCamera`, near 0.05, far 40 |
| Position / target | `CAM_HOME` (0, 2.45, −8) looking at `LOOK_HOME` (0, 2.45, 0): on −z, looking +z, level |
| Screen axes | screen-right = world **−x**, so world **+x is screen-left**; screen-up = +y |
| Frustum height | `pageH = 5.35 / zoom` world units (`resize()`); width follows the mount's aspect |
| Zoom | `setZoom` clamps to 0.75..1.6 (F8 shader lab, PROJECTION tab) |
| Shake | moves the camera in x/y only, never rotates it (`applyShake`) |

`assertFrame()` runs at the end of `buildScene()` and throws if the camera is wrong:

- view direction `z < 0.9` or `|y| > 0.05` -> "comic camera is tilted"
- camera matrix column 0 (screen-right) has `x > −0.9` -> "expected world −x"
- the backdrop's +z normal, rotated, has `z > −0.9` -> "backdrop faces away"

Why each rule: orthographic keeps sizes honest (a door is the same size at any x); level means the
floor is a line, not a plane, so feet can sit on it; looking +z from −z means meshes built facing −z
show their front at `rotation.y = 0`. Mirror-image text or an LED on the wrong side means a model was
authored for +x = screen-right.

## Pixels per world unit

`ppu = stage height in CSS px / (5.35 / zoom)`. The stage is the window minus the terminal dock
(`clamp(260px, 36vh, 420px)`) and page padding. Examples at zoom 1: a 310 px stage gives ~58 px per
unit (the art bible's design number, the vibecoder ~93 px tall); a 1080 px tall window gives about
650 px of stage, ~120 px per unit. **58 is the small, worst case**: if it reads at 58 it reads everywhere.
The storybook's `scale=game` is exactly 58.

The pixel-art cell is `pixelSize` 2 **device** pixels. At pixel ratio 1 that is 2 CSS px (0.034 units at
58 ppu); at 1.75 it is 1.14 CSS px. Pixel ratio 1 is the coarsest frame, so check at `dpr=1`.
The ink shell (0.028 units) is 1.6 px at 58 ppu: thinner than one quantizer cell at dpr 1.

## Depth layers (z grows away from the camera)

| z | What |
|---|---|
| 0.22 | actors (`built.group.position.set(worldX, feetY, 0.22)`) |
| 0.35 | plinth box, 0.42 deep, 0.48 tall |
| 0.5 | flood volume |
| 1.42 / 1.55 | neighbor-panel card fill / frame |
| 1.7 | backdrop plane (floor theme `bg`), sized to the view in `layoutFill` |
| 2.4 | paper plane, 28 x 16 |

## Panel layout (`layoutFill(halfW, halfH)`)

| What | Value |
|---|---|
| View box | `viewLeft = halfW − 0.02`, `viewRight = −halfW + 0.02`, `viewTop/Bottom = 2.45 ± halfH ∓ 0.02` |
| Neighbor column | width `colW = clamp(viewW * 0.2, 1.7, 2.8)` on the **screen-right** edge, cards with a 0.1 gap, at most 3 |
| Main panel | `panelLeft = viewLeft`, `panelRight = viewRight + colW + 0.14` (0.14 = the gutter) |
| Feet | `feetY = viewBottom + 0.5`. The constant `FEET_Y = 0.62` is only the value before the first layout |
| Plinth | centred under the main panel at `viewBottom + 0.24`; its top is 0.02 below the feet |
| Design band | actors are authored on x from `DESIGN_LEFT = 4.9` (screen-left) to `DESIGN_RIGHT = −1.15`, then `placeX` maps that band linearly onto `panelLeft..panelRight` |

Consequence: actor x in a room is relative, not absolute. A wide actor near either end of the
design band can overlap the frame or the neighbor column at narrow aspect ratios. Rooms keep the
middle of the band (feet line, x from −1.15 to 4.9) clear and dark.

## The page around the canvas (`src/styles/game.css`)

| Element | Style |
|---|---|
| `#stage-wrapper` | 5 px `--ink` (#140f12) border, 6 px hard shadow, background #1a1424 |
| `#page` | 8 px padding and 8 px gap on `--paper` (#efe6d2) with a 5 px dot screen |
| `#stage-caption` | yellow `--yellow` (#ffd166) box, 3 px ink border, 4 px shadow, top-left, Chakra Petch 700 13 px |
| `#masthead` | yellow box, 3 px border, top-left above the caption |
| `#hud` | top-right, dark plate |
| bottom-left / right | F2 button, shader dock |

The canvas-side corners (top-left caption, top-right HUD, bottom corners) are covered by UI.
Nothing that must be read may live there.

## Comic material uniforms the stage feeds every frame (`frame()`)

`uTime` = elapsed seconds; `uFlash` = `LightningStrikeSystem.flashStrength`; `uFlashPos` = its
`flashPos`. A strike sets `flashStrength = 5.5` and decays at 14 per second (gone in ~0.4 s); a grid
arc sets at least 2.2. The ambient storm strikes every `7 / max(0.35, intensity)` s at 0.35 x intensity
(default intensity 0.65). Materials only get these if they were in `world` when `buildScene()`
collected `comics`: anything added later must be fed by hand.

## What the stage does to actors that the lab does not

- `setInk()` at boot scales every `userData.outline` shell by `1 + 0.045 * outline` (1.045 at the
  default) and forces `uHalftone` on or off for every comic material in `world`.
- Lantern: `applyLantern(t)` only fades the ghost and boosts the vibecoder glow. There is no darkness
  cone in the game today; `config.lanternRadius` (140) is declared and unused. The lab's
  lantern-dark mode is a stricter test than the game, on purpose.
- State tints today (`syncRoom`, `PROC_SIGNALED`): petrified paints `uColor` 0x6c757d, frozen 0x4cc9f0,
  enraged 0xff2a55; hidden fades `uOpacity` (a lurking dotfile uses alpha 0.04). The lab drives states
  through `src/procgen/anim` instead, which tints toward the `heatsink` / `ice` / `lockRed` zones.
