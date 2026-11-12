---
name: comic-lighting-and-lightning
description: "[ASSET PCG] Lighting of generated assets and rooms: the single fixed light direction and three cel bands of the comic material, emissive as 'this is a light source', the lightning flash (`uFlash` / `uFlashPos`), `LightningStrikeSystem`, the storm, the lantern reveal, floor moods, PS_XRAY and the data flood. Use whenever a task mentions lighting, shadows, darkness, glow, emissive, the lantern, lightning, thunder, the storm, flashes, room mood or tint, rim light, or before adding a Three.js light, shadow map, bloom or smooth gradient. Read before touching `src/shaders/comic-material.ts`, `src/shaders/lightning.ts` or the light code in `src/renderer/comic-stage.ts`."
---

# Comic lighting and lightning

Read [haunted-art-direction](../haunted-art-direction/SKILL.md) first.

## The model in one paragraph

**Light in this game is drawn, not simulated.** Every surface is shaded by one shader
(`createComicMaterial`, `src/shaders/comic-material.ts`) from one constant direction into three flat
bands. There are no shadow maps, no bloom and no light objects that matter: the stage adds an
`AmbientLight` and a `DirectionalLight`, but the comic material is a `ShaderMaterial` that ignores
them. Anything that should glow sets `uEmissive`. The only dynamic light is the lightning flash: a
point and a strength pushed into every comic material each frame. Mood comes from the floor's
backdrop colour and from what is hidden, not from light intensity.

That is on purpose. A comic panel is lit by the artist's decision, the same in every panel, so the
player's eye learns it once and then reads only what changes: what glows, what flashes, what hides.

Exact numbers and file locations: [lighting-model.md](./references/lighting-model.md).

## The pieces

| Piece | Where | What it does |
|---|---|---|
| Key light | `LIGHT` in `comic-material.ts`, copied to every `uLightDir` | Direction to the light: `(-0.35, 0.82, -0.48)` normalised. Up, toward the camera, and toward world `-x`, which is **screen-right** |
| Cel bands | `COMIC_FRAG` | Half-Lambert `shade = n·l * 0.5 + 0.5`; `> 0.66` lit x1.0, `> 0.4` mid x0.68, else shadow x0.4 |
| Ink rim | `COMIC_FRAG` | Grazing faces blend up to 55% toward ink `#110e1b` |
| Halftone, stripes | `uHalftone`, `uStripes` | Ben-Day dots in the mid and shadow bands only; stripes for fins |
| Emissive | `uEmissive`, from `ZoneDef.emissive` | `colour x emissive` added after banding. The convention for "light source" |
| Flash | `uFlash`, `uFlashPos` | Cyan-white add, falling off with distance from the strike |
| Lightning | `LightningStrikeSystem`, `src/shaders/lightning.ts` | Builds bolts, owns `flashStrength` / `flashPos` |
| Storm | `ComicStage.setStorm(on, intensity)` | Periodic distant strikes |
| Lantern | `ComicStage.applyLantern(t)` | Reveals the hidden dotfile, raises the vibecoder's lantern glow |
| Floor mood | `FLOORS` in `comic-stage.ts`, mirrored by `FLOOR_THEMES` in `src/procgen/core/palette.ts` | Backdrop colour and accent per floor |
| PS_XRAY | `mountXray()` | Green process tags and a parent-child line |
| Flood | `createFloodMaterial`, `syncFlood()` | Translucent cyan slab rising from the floor |

### Why that light direction

The camera sits on `-z` looking at `+z`, so a face that looks at the player has normal `(0, 0, -1)`.
The light's `-0.48` z puts every camera-facing face in the **lit** band (shade 0.74): the front of a
model is always its true palette colour. The `0.82` y lights tops and drops undersides into shadow,
which grounds things. The `-0.35` x splits left from right: faces turned toward screen-right stay
lit (0.67, just inside the band), faces turned toward screen-left drop to shadow (0.33) with the
mid band on the angles in between, so a relief shows its depth as hard band edges down one side.
Undersides land in the 0.4 shadow band.

Note: the art bible says "upper screen-left". The vector says upper screen-**right** (world `+x` is
screen-left and the light's x is negative); the software rasterizer agrees. Trust the vector.

## Rules

1. **No Three.js lights, shadow maps, bloom, tone-mapped glow or gradients.** They do nothing to
   comic materials, or they fight the pixel-art pass. Light is bands, emissive and the flash.
2. **One direction for the whole page.** Never light one actor differently from its room.
3. **Emissive is a promise.** If it glows, it is the lantern, a system signal (LED, pickup, port),
   or a malware eye or core. `emissive >= 0.3` reads as a source. Do not use it to "brighten" art.
4. **Darkness hides by opacity and value, never by turning the key light down.** Hidden dotfiles
   are `alpha 0.04`; rooms are dark because their palette is dark.
5. **In the dark, only emissive survives.** Anything the player must still find without the lantern
   (door LEDs, pickups, enemy eyes, the vibecoder's lantern) must be an emissive zone.
6. **A flash is a held frame, not a fade-in.** Full strength on the first frame, gone in under
   half a second, always with shake and a word.
7. **Parity.** `src/procgen/geometry/raster-shade.ts` and `src/procgen/fx/preview.ts` copy the light vector
   and the band thresholds so the node previews match the game. Change one, change all three, in
   the same commit (see below).

## Lightning, as it is today

`LightningStrikeSystem(scene)` exposes `strikeAt(target, skyHeight = 5.2)`,
`spawnGridOverloadArc(p1, p2)`, `update(dtSeconds)`, `buildJaggedBoltGeometry(...)`, and the two
fields the stage reads every frame: `flashStrength` (set to 5.5 by a strike, decays at 14 per
second, so about 0.4 s) and `flashPos`. `ComicStage.frame()` copies both into `uFlash` / `uFlashPos`
of every comic material it collected in `this.comics`.

Callers: `triggerLightningIntro()` (strike at the desk, shake 1.6, `KRAKOOM!!`), the storm timer,
`PROC_SIGNALED` `KILLED` (strike on the boss) and `TRAPPED_ENRAGED` (a short arc). Usage and
parameters: [LightningStrikeSystem.ts](./examples/LightningStrikeSystem.ts).

Known gaps, so you do not design around features that are not there: bolts are additive glowing
tubes rather than ink-edged shapes; midpoint displacement and the ground web use `Math.random()` and
spread in x and z, but z is invisible to the front camera and the web lies flat on the floor, edge-on
to it; bolt opacity fades instead of stepping; the file's header comment still names the project it
was adapted from. The comic version of a bolt already exists as data: `fx.lightning-strike`
(`src/procgen/fx/presets.ts`).

## How lightning should be drawn

- **A shape, not a glow**: a jagged blade in the page plane, 3 to 4 units tall, `dataCyan` with a
  thinner `paper` core, both with the 0.028 ink shell. Build it with `fxBolt` or the seeded
  `comicBoltOutline` in the example.
- **Held 2 to 3 frames at 12 fps** (170 to 250 ms), with one small size change between frames, then
  cut. No fade.
- **Full-panel flash on the first frame**: `flashStrength = 5.5` at the strike point. Do not ease it in.
- **Ground hit**: a `paper` starburst and 8 to 10 `powerAmber` sparks thrown up, falling in 300 ms.
- **KRAKOOM!** in jagged lettering, `paper`, beside the bolt, held about 700 ms; shake 1.6.
- **One strike per beat.** The storm is punctuation: with the default intensity it strikes every
  10.8 s. Never chain flashes faster than about one per second (photosensitivity, and it stops
  meaning anything).

## Extending the lighting

Recipes with code for each of these: [extension-recipes.md](./references/extension-recipes.md).

| Want | Do | Do not |
|---|---|---|
| Per-floor mood | Tint: multiply by a floor colour in the shadow and mid bands only; or nudge `uLightDir` per floor within ±15° | Change band thresholds per floor; move the light behind the camera-facing band |
| Furnace heat (floor 4) | A second rim colour: replace the ink rim blend with `powerAmber`/`lockRed` on faces turned toward a `uRimDir` | A PointLight; emissive on every pipe |
| Kernel-core storm (floor 5) | `setStorm(true, 1.2..1.5)`, strikes from `FLOOR_THEMES[5].accent` side, `fx.lightning-strike` per hit | Continuous flicker |
| Real lantern darkness | A stepped multiply overlay centred on the lantern (lit / mid ring / dark), emissive meshes drawn over it. The storybook has a working stand-in in `src/storybook/stage/lab-stage.ts` | A SpotLight; a soft radial gradient |
| New glowing thing | Give its zone `emissive` in `ZONES`, in the `signal` family | Raise `uEmissive` ad hoc in the stage |
| A new flash source | Set `lightning.flashStrength` / `flashPos`, or `FxPreset.flash` | A second flash uniform per effect |

## Checklist for any lighting change

1. `npm run procgen:sheet` and open `scripts/harness/out/models.png`: bands still three, fronts still lit.
2. `npm run procgen:fx -- --sheet`: effects still read on the floor backdrop.
3. `npm run dev`: the game, then `/storybook.html` with the lantern and flash toggles. Check floor 1
   (darkest violet) and floor 4 (red).
4. If you changed the vector or the bands: the three copies agree (`comic-material.ts`,
   `geometry/raster-shade.ts`, `fx/preview.ts`).
5. `npm run procgen:check` is green.

## The scene light (lantern, `ls` ping, light sources)

The game now has one real comic light, on top of the fixed cel direction:

- **Shader:** `COMIC_FRAG` in `src/shaders/comic-material.ts` has a light block driven by `COMIC_LIGHT`,
  a set of uniforms shared by reference by every comic material (`uLampPos`, `uLampColor`, `uLampColor2`,
  `uLampSplit`, `uLampPower`, `uLampRadius`, `uLampDark`, `uLampScan`, `uLampUv`, `uPingR`, `uPingPower`).
  Distance is measured on the page plane (xy), falloff is three stepped rings with a dithered edge, and
  darkness is applied before emissive, so glowing things stay bright in the dark. All zeros is the flat
  look: that is what the storybook, the cinematics (`suspendComicLight`) and `raster-shade.ts` show.
- **Rig:** `src/renderer/stage-light.ts` (`StageLight`) picks the source and drives the uniforms every
  frame, stepped at 12 fps, plus a halo mesh with sunburst rays at the lantern.
- **Sources** (`LIGHT_MODES`, radio buttons in the F8 dock, saved in localStorage): LANTERN (warm pool
  from the vibecoder's `lantern` socket), PHOSPHOR (green glow from below with scanlines), BLACKLIGHT (UV:
  `malware`-family zones fluoresce through `uUvReact`), NEON (cyan / magenta split at the lantern), STORM
  (cold light from above that follows the lightning flash), FLAT (off).
- **`ls`:** the stage reads `VIBECODER_ACTION.command`. `ls` calls `light.ping(1)`: one ring sweeps the room
  and the light is boosted for about 4.5 s. `ls -a` / `ls -la` call `ping(2)`: three rings, a bigger
  boost for about 9 s, and a little UV. In FLAT mode `ls` still lights the room for the boost.
- **New source:** add a row to `MODES` and `LIGHT_MODES` in `stage-light.ts`; nothing else needs to change.
