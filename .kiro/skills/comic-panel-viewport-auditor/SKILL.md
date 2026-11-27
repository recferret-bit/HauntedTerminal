---
name: comic-panel-viewport-auditor
description: "[ASSET PCG] Camera, page contract and visual QA for generated assets: orthographic camera on -z, ink-framed comic panel, design band, feet line, `assertFrame`, and the QA loop (software contact sheet, `/storybook.html` with silhouette, game-scale, lantern-dark, floor-background, flash, state and post-pass checks, headless screenshots, how to judge a screenshot honestly). Use whenever you add or change a model, texture, FX preset, shader, post pass, room, camera or panel layout, before calling any visual asset work done, and whenever someone asks whether something 'reads' or how to screenshot it."
---

# Comic panel viewport auditor

Read [credits-art-direction](../credits-art-direction/SKILL.md) first: it holds the nine look rules this
checklist enforces. This skill is about **seeing** the art the way the player does and judging it.

## 1. The camera and page contract

The game draws one comic panel per directory (`src/renderer/comic-stage.ts`, `ComicStage`).

- **Orthographic, on −z, looking +z, level.** `CAM_HOME` (0, 2.45, −8) looks at `LOOK_HOME` (0, 2.45, 0);
  frustum height `5.35 / zoom` world units. Orthographic keeps sizes honest across the panel; level keeps
  the floor a line feet can stand on. The camera never rotates (shake only translates it).
- **World +x is screen-left.** Screen-right is world −x. Models face −z, so `rotation.y = 0` shows their
  front. A mirrored label or an LED on the wrong side means it was authored for +x = right.
- **`assertFrame()`** runs after every `buildScene()` and throws if the view direction has `z < 0.9` or
  `|y| > 0.05`, if screen-right `x > −0.9`, or if the backdrop faces away. Never weaken it; fix the scene.
- **Layers:** actors at z 0.22, plinth 0.35, backdrop 1.7, paper 2.4. Feet at `viewBottom + 0.5`
  (the constant `FEET_Y = 0.62` is only the pre-layout value), 0.02 above the plinth top.
- **Design band:** actors are authored on x from `DESIGN_LEFT = 4.9` (screen-left) to `DESIGN_RIGHT = −1.15`
  and mapped linearly onto the live panel. The screen-right 20% (1.7 to 2.8 units) is the neighbor
  column behind a 0.14 gutter. Top-left holds the masthead and yellow caption, top-right the HUD,
  bottom corners the F2 button and shader dock: nothing that must be read goes in a corner.
- **Scale:** px per unit = stage height / (5.35 / zoom). 58 px per unit (vibecoder ~93 px) is the small,
  worst case and the art bible's design number; a 1080 px window gives ~120.

All numbers with sources: [references/camera-and-panel.md](./references/camera-and-panel.md).

## 2. What the post chain does to art

`RenderPass` → `OutputPass` (sRGB, ACES, exposure 1.05) → pixel-art → CRT. Defaults are what players see.

- **Pixel-art** (`src/shaders/pixel-art.ts`, `DEFAULT_PIXEL_PARAMS`): 3.5-CSS-px cells (scaled by the
  pixel ratio), **one sample per cell** (thin things vanish or flicker), 16 levels, Bayer dither 0.85,
  edge 0.65, saturation 1.16, contrast 1.05, a faint 0.05 cell grid, and palette mode 0 (full RGB: true
  hue survives). The retro modes 1 to 5 are options; under COMIX (4) and MANSION (5) only 22% of the hue
  survives and **families separate by brightness, not hue**.
- **CRT** (`src/shaders/crt-pass.ts`, `DEFAULT_CRT_PARAMS`): a 1-px scanline every 3 CSS px (18% darker),
  vignette (corners up to 50% darker), grain, roll band and flicker, `mix` 1, no barrel warp (`distort` 0).
  Thin horizontal lines and dark-on-dark lose the most.
- **Tone mapping** flattens strong emissives: two glows of different strength look alike.

Parameters and a survives / does-not table: [references/post-chain.md](./references/post-chain.md).

## 3. The QA loop for any new or changed visual

Numbers first, then eyes, in this order. Do not skip to the game.

1. **Software sheet** (no browser): `node scripts/harness/render-sheet.mjs --all` writes `scripts/harness/out/models.png`;
   `node scripts/harness/render-sheet.mjs <id> --views` adds side and top views to check depth.
   Open the PNG. Fix silhouette and proportions here; it is the fastest loop.
2. **Storybook**, the real renderer: `npm start`, open `http://localhost:5400/storybook.html`.
   The gallery shows every `ModelCatalog` model at one shared scale with a ground line and a dashed
   vibecoder-height (1.6) line, plus `textures` and `fx` tabs. Click a panel to inspect; every toggle is a URL
   parameter ([references/storybook-url-params.md](./references/storybook-url-params.md)).
   Headless, one command: `node .kiro/skills/comic-panel-viewport-auditor/scripts/lab-qa.mjs <id>`
   shoots every test below to `scripts/harness/out/lab-<id>-<test>.png` (18 shots for an enemy, ~20 s).
   One shot: `node scripts/harness/screenshot-lab.mjs --query "inspect=<id>&scale=game" --name <stem>`.
3. **In the game**: `npm start`, `http://localhost:5400/play`. F2 opens the dev panel (level jump, kernel
   events: `ls -la` lantern reveal, `chmod -x` petrify, `kill -STOP` freeze, intro flash, hitboxes);
   F8 opens the shader lab (CRT, PIXEL, INK, STORM, PROJECTION zoom); F9 / F10 toggle CRT / pixel-art.
   The stage builds every actor from `ModelCatalog` (`buildStageActor()` in `src/renderer/stage-cast.ts`:
   the `RoomActor.model` id, else the `LEGACY_CAST` model of its key in `src/renderer/procgen-cast.ts`,
   else `prop.file`). So a catalog model shows in the game once a level spec or room places it; check it
   there at the live zoom, under the real room, lantern and battle states, and compare with the lab shot.

Then the asset gate must be green: `npx tsc --noEmit`, the validators
(`node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --strict`,
`node .kiro/skills/procedural-texture-synthesis/scripts/validate-textures.mjs --all`,
`node .kiro/skills/particle-effect-validator/scripts/validate-particles.mjs --all`,
`node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all`), the self-tests and
`npm run quality:fingerprint` (the full list is in [credits-art-direction](../credits-art-direction/SKILL.md#the-harness)).

## 4. The inspect checklist (pass / fail)

Run each with `scale=game` unless stated. A fail is a fail; write down which rule it breaks.

| # | Test (lab param) | Pass when | Rule |
|---|---|---|---|
| 1 | `silhouette=1` | The flat ink shape alone says what it is: horns, ports, limbs, spikes stick out. | 1 silhouette |
| 2 | default (front, game scale) | Eyes, LEDs, pins, labels are on the side facing you; nothing is mirrored. `yaw` back at 0. | 2 face the camera |
| 3 | `yaw=±30` (debug only) | Depth is shallow (info panel depth ratio ≤ 0.60); nothing important hides behind. | 3 shallow depth |
| 4 | `ink=0` vs default | Ink is one even weight on every solid part; no doubled lines, no ink inside dark zones only. | 4 ink |
| 5 | `post=0`, `fit` | Exactly three cel bands from one light; no smooth gradients, no noisy speckle. | 5 cel bands |
| 6 | info panel zones, default (`palette=0`) vs `palette=4` | One zone ~60% of the front, one ~30%, ≤ 5 zones; under COMIX the two big zones still differ in **brightness**. | 6 60/30/10 |
| 7 | `tex=0` vs default | Detail is geometry or ink; textures add flat comic art, not noise. | 7 detail |
| 8 | `lantern=1`, `flash=1` | Only lantern, signal and malware eyes/cores glow; in the dark the focal glow still reads, nothing else does. | 8 light means something |
| 9 | `scale=game`, `dpr=1` | No important part thinner than ~2 px; the focal point survives the quantizer. | 9 readable small |
| 10 | `bg=floor1`..`floor5`, `paper` | The actor separates from all five backdrops by luma at the silhouette. Judge at the default `palette=0`; under COMIX (`palette=4`) the dark floors quantize to almost one plum. | 9, mood |
| 11 | `state=hidden/petrified/frozen/enraged`, `attack` with `t` < 0.6 | Hidden barely shows; stone and ice change the read but keep the silhouette; enraged reads hotter. | enemies |
| 12 | gallery, same category | Sizes match the art bible (vibecoder 1.6, minions 0.6-1.1, bosses 1.8-2.6, pickups 0.3-0.5). | sizes |

## 5. Judging a screenshot honestly

Look at the small frame first (game scale, `dpr=1`), the big one second. Squint: what you see squinting
is what a player sees at speed. Compare against a neighbour of the same category in the gallery.
Say what is wrong in words before changing code; "looks fine" is not a verdict.

Common failures and the usual fix:

- **Mushy silhouette**: the shape is a rounded blob in silhouette mode. Push 2-3 features past the
  outline (horns, a spike, a cable) and cut notches; drop round primitives on enemies.
- **Detail lost to the quantizer**: pins, teeth or text gone at 58 px. Make fewer, bigger features
  (≥ 4 px, 0.07 units) and spacing ≥ 1 cell; delete what cannot be made big.
- **Ink doubling**: two ink lines where parts overlap or nearly touch, or a black smear on small parts.
  Merge the parts, separate them by ≥ 0.06, or set `outline: false` on tiny decals.
- **Wrong colour family**: under COMIX the vibecoder or a pickup reads like malware. Separate by luma
  (a brighter or darker zone), not hue; check with `palette=0` that the hue is right too.
- **Glow everywhere**: three or more cream blobs of the same brightness. Keep one focal emissive; turn
  the rest into hardware zones.
- **Lost against the backdrop**: dark body on a dark floor colour, no rim. Lighten the dominant zone,
  add a lighter accent on the silhouette edge, or rely on the ink line, and re-check every room mood.
- **Judging the wrong view**: a shot taken with `yaw`, `post=0`, `palette=0` or `fit` is a debug view.
  Pass / fail is decided on the default chain at game scale.

A worked example of a written verdict: [examples/qa-verdict.md](./examples/qa-verdict.md).

## Lab versus game: known differences

The lab uses the game's camera convention, `buildModel` materials and ink shells, the game's own
`createPixelArtPass` / `createCrtPass` defaults, the same renderer settings and the same `uTime` /
`uFlash` / `uFlashPos` feed. It differs in: centring the camera on the subject (still level, on −z);
no boot `setInk` (the game scales ink shells by 1.045 and forces halftone on); `StageLight` (`src/renderer/stage-light.ts`) is live in `/play` (with `LightMode` presets `lantern`, `monitor`, `blacklight`, `neon`, `storm`, `off`, `RoomView.dark` terminal-screen glow when without `tube_transistor`, and `FxLightSpec` dynamic FX light pools), whereas Storybook's `lantern=1` tests `lantern` mode in isolation; states driven by `src/procgen/anim` (tints toward zones)
where the stage paints fixed colours. Details in [references/camera-and-panel.md](./references/camera-and-panel.md).
