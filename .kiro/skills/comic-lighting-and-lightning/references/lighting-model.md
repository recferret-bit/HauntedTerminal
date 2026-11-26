# Lighting model: the real numbers

Everything here is read from the code. If the code changes, fix this file in the same change.

## The comic material: `src/shaders/comic-material.ts`

`createComicMaterial(color, { emissive?, opacity?, ghost?, stripes?, halftone? })` returns a
`THREE.ShaderMaterial` with `userData.comic = true` (`isComic(mat)` tests it).

| Uniform | Default | Meaning |
|---|---|---|
| `uColor` | the zone colour | Flat base colour |
| `uInk` | `0x110e1b` | Ink colour for the rim |
| `uLightDir` | `normalize(-0.35, 0.82, -0.48)` = `(-0.346, 0.810, -0.474)` | Direction **to** the light, world space, constant |
| `uFlashPos` | `(0, 0, 0)` | World position of the current flash |
| `uFlash` | 0 | Flash strength |
| `uEmissive` | 0 | Added as `uColor * uEmissive` |
| `uOpacity` | 1 | Material is `transparent` below 0.999; `depthWrite` only above 0.9 |
| `uGhost` | 0 | Fresnel ghost: clear centre, bright violet rim |
| `uStripes`, `uHalftone` | 0 | Surface patterns |
| `uHasMap`, `uMap` | 0, null | Albedo texture, mixed 86% over the flat colour |
| `uTime` | 0 | Set every frame by the stage; unused by the comic fragment shader itself |

Fragment shader, in order:

1. `shade = dot(n, uLightDir) * 0.5 + 0.5` (half-Lambert, 0..1).
2. Band: `shade > 0.66` -> 1.0 (lit), `shade > 0.4` -> 0.68 (mid), else 0.4 (shadow).
3. `col = uColor * band`; with a map, `mix(col, albedo * band, 0.86)`.
4. Stripes: `step(0.5, fract(vUv.y * 7))`, dark stripes x0.7.
5. Halftone, only when `band < 0.95`: dots of radius 0.16 on a 1/16-unit grid in world xz, x0.78.
6. Ink rim: `fres = pow(1 - max(dot(n, viewDir), 0), 2.6)`; `mix(col, uInk, smoothstep(0.55, 0.92, fres) * 0.55)`.
   `viewDir` is `normalize(cameraPosition - vWorld)` even though the camera is orthographic.
7. Emissive: `col += uColor * uEmissive`.
8. Flash: `att = uFlash / (1 + |uFlashPos - vWorld|² * 0.45)`; `col += (0.55, 0.86, 1.0) * att`.
9. Ghost: alpha `clamp(uOpacity * (0.12 + fres * 1.15), 0, 0.92)`, colour `+ (0.25, 0.08, 0.35) * fres`.

Band of a face by its normal (camera on `-z`; world `+x` is screen-left):

| Face | Normal | shade | Band |
|---|---|---|---|
| Toward the camera | `(0, 0, -1)` | 0.74 | lit |
| Top | `(0, 1, 0)` | 0.91 | lit |
| Screen-right side | `(-1, 0, 0)` | 0.67 | lit (just) |
| Screen-left side | `(1, 0, 0)` | 0.33 | shadow |
| Bottom | `(0, -1, 0)` | 0.10 | shadow |
| Away from the camera | `(0, 0, 1)` | 0.26 | shadow |

The same file holds `createVortexMaterial()` (the `/dev/null` spiral: 6 arms, purple `(0.62, 0.14, 0.95)`,
black core, driven by `uTime`) and `createFloodMaterial()` (cyan `(0.15, 0.75, 0.95)` with moving
bands, alpha 0.38, `depthWrite` off). Neither is lit by anything.

## Emissive zones: `src/procgen/core/palette.ts`

| Zone | Family | Emissive |
|---|---|---|
| `lantern` | human | 0.35 |
| `phosphor` | signal | 0.6 |
| `dataCyan` | signal | 0.5 |
| `powerAmber` | signal | 0.6 |
| `lockRed` | signal | 0.5 |
| `malwareEye` | malware | 1.1 |
| `glass` | glass | 0.45 |
| `ice` | glass | 0.2 |

`>= 0.3` reads as a light source. Everything else in `ZONES` is 0.

## The stage: `src/renderer/comic-stage.ts`

- Camera: orthographic, at `(0, 2.45, -8)` looking at `(0, 2.45, 0)`; page height 5.35 units / zoom.
- Renderer: `ACESFilmicToneMapping`, exposure 1.05, sRGB output; then pixel-art pass, CRT pass.
- `AmbientLight(0xf4f1ea, 0.35)` and `DirectionalLight(0xfff4dd, 1.1)` at `(-2.4, 6.5, -4.2)` are added
  in the constructor. Comic materials ignore them; they would only affect a lit Three.js material.
- `buildScene()` collects every comic material under `world` into `this.comics`. `frame()` writes
  `uTime`, `uFlash` and `uFlashPos` into each one, every frame. A material created later (an effect,
  a spawned actor) must be fed the same way or it will not flash.
- Scene background while a room is shown: the floor `bg`. Paper behind everything: `0xefe6d2`.

### Floor moods

`FLOORS` in `comic-stage.ts`; `FLOOR_THEMES` in `src/procgen/core/palette.ts` mirrors it.

| Floor | Backdrop `bg` | Accent | Stage accent name |
|---|---|---|---|
| 1 storage attic | `0x211a36` | `0xffd166` | amber |
| 2 firewall crypt | `0x1c252c` | `0x06d6a0` | green |
| 3 bus maze | `0x182038` | `0x4cc9f0` | cyan |
| 4 cooling furnace | `0x2e1720` | `0xef476f` | red |
| 5 kernel core | `0x1f1135` | `0xb5179e` | magenta |

The mood is the backdrop colour (a halftoned comic material) plus the accent used for hitboxes and
captions. The light vector is the same on every floor.

### Storm

`setStorm(on, intensity)`: stores both; turning it off zeroes `lightning.flashStrength`.
Defaults: on, intensity 0.65, first strike after 1.4 s. In `stepStage()`: when the timer runs out it
is reset to `7 / max(0.35, intensity)` seconds (10.8 s at 0.65, 7 s at 1.0, 4.7 s at 1.5) and calls
`stage.strikeLightning((x, feetY, ACTOR_Z), 5.2, { flash: 1.6 * intensity, scale: 0.85 })` along
with emitting `{ kind: 'cine', cue: 'lightning' }` on `audioBus`. `main.ts` wires it to the visual
lab's STORM tab (intensity slider 0..1.5).

### Lightning callers

All in-game lightning uses `ComicStage.strikeLightning` -> `LightningStrikeSystem.strikeAt`
(synchronized to `LIGHTNING_SOUND_SEC = 1.41` s, matching `public/sfx/lightning.mp3`); 2D comic
bolts (`fx.lightning-strike`, `makeComicBolt`) remain for `comix/intro` and `comix/outro`.

| Caller | Call | With |
|---|---|---|
| `triggerLightningIntro()` | `strikeLightning((midX + 0.6, feetY, ACTOR_Z), 5.4)` | `triggerShake(1.6)`, `lightning` + `thunder` cues |
| Storm timer | `strikeLightning((x, feetY, ACTOR_Z), 5.2, { flash: 1.6 * intensity, scale: 0.85 })` | `lightning` cue |
| `PROC_SIGNALED` `KILLED` / `ENEMY_KILLED` `SIGKILL` | `strikeLightning(subject-feet, 5.2, undefined, 'kill:<id>')` | `fx.sigkill` (120 ms delay), `kill` / `lightning` SFX |
| `GAME_ENDED` | `strikeLightning(panel-floor, 5.4, undefined, 'game-ended')` | `triggerShake(1.6)`, end card |
| `VIBECODER_EMOTE` `shout` | `strikeLightning(panel-floor, 5.2, undefined, 'shout')` | `fx.fight` word banner, `triggerShake(1.4)`, `emote_shout` + `lightning` SFX |
| Comix `lightning` / `arc` beats | `stage.lightning.strikeAt` / `spawnGridOverloadArc` | `fx.lightning-strike` / `makeComicBolt` |

`triggerShake(mul)`: 280 ms, amplitude `config.shakeIntensity (10) * 0.006 * mul` world units,
decaying linearly, camera x and y only.

### Lantern

`applyLantern(t)`, `t` in 0..1 (tweened over `config.transitionMs` = 420 ms on `LANTERN_REVEAL`, or
set to 1 by `syncRoom` when `view.lantern`):

- hidden dotfile (the ghost): body `uOpacity = 0.16 + 0.84 t`; eyes `uOpacity = t`, `uEmissive = 0.85 t`
- vibecoder lantern glow: `uEmissive = 0.35 + 1.25 t`

Hidden actors otherwise sit at `alpha 0.04` (`defaultRoom()` / the session's `RoomView`).
`config.lanternRadius` (140 px) is declared in `SandboxRenderConfig` but the stage does not read it.
Darkness in the game is the scene light, `StageLight` in `src/renderer/stage-light.ts`: it writes the
shared `COMIC_LIGHT` uniforms (`uLampPos`, `uLampPower`, `uLampRadius`, `uLampDark`, ...) that every comic
material reads, stepped at 12 fps. While `RoomView.dark` is true (he does not carry the lantern;
`stage-frame.ts` passes `dark: !!stage.view?.dark`) it uses `DARK_DEF` instead of the chosen mode: a tight
phosphor-green pool (radius 1.15, power 0.385, dark 1.4) centred on his chest, where the terminal screen
is, with no halo and no `ls` boost; with empty hands (`vibecoder.dev_bare`) the power is halved
(`BARE_GLOW` 0.5). Otherwise the F8 dock's mode applies (`lantern`: dark 0.55, radius 2.7, halo). The
storybook has its own stand-in, `LanternLayer` (`src/storybook/stage/lantern-layer.ts`): a multiply
plane in front of the camera with three hard steps, radius `140 / 58` units.

### PS_XRAY

`HUD_OVERLAY_TOGGLED` (`src/renderer/stage-event-cast.ts`) copies the event's processes into
`stage.xrayProcs` (pid, ppid, name, cpu), sets `stage.xrayOn` (`ev.active`, else "any processes") and
calls `syncOverlays()` (`src/renderer/stage-sync.ts`); `syncRoom` also turns it on from `RoomView.xray`.
`syncOverlays()` gives every live enemy or boss with a `pid` (and any actor whose pid is listed) a PID
plate badge: `<name> <cpu>%` from the process list, or its target / label. Each frame `updateXrayLinks()`
(`src/renderer/stage-frame.ts`) draws parent -> child links between actors whose pids match a listed
`ppid -> pid` pair (falling back to boss -> each enemy), and `StageOverlay.links()`
(`src/renderer/stage-overlay.ts`) renders them in the DOM overlay as SVG: an ink line under a dashed
green one, pulsing in two held widths. It is all DOM overlay: no Three.js objects and no material
changes; `HUD_OVERLAY_TOGGLED` plays no FX (`event-fx.ts`).

### Flood

A `BoxGeometry(1, 1, 0.2)` with `createFloodMaterial()` at z 0.5. `syncFlood()`:
height `0.02 + percent/100 * max(1.2, column height)`, width = the panel, visible above 1%.
Floor 3 starts at 20%; each `viaSymlinkLoop` transition adds 18%, capped at 85%.

## `LightningStrikeSystem`: `src/shaders/lightning.ts`

```ts
export const LIGHTNING_SOUND_SEC = 1.41; // matches public/sfx/lightning.mp3
new LightningStrikeSystem(scene: THREE.Scene)
flashStrength: number            // read by the stage every frame
readonly flashPos: THREE.Vector3
strikeAt(targetPos: THREE.Vector3, skyHeight = 5.2, opts?: LightningStrikeOptions): void
spawnGridOverloadArc(p1: THREE.Vector3, p2: THREE.Vector3): void
clear(): void
update(dt: number): void         // seconds
buildJaggedBoltGeometry(start, end, generations = 5, trunkRadius = 0.02, spawnForks = true): THREE.BufferGeometry | null
```

| | `strikeAt` (defaults: `dur = 1.41 s`, `scale = 1`, `flash = 3.6`) | `spawnGridOverloadArc` |
|---|---|---|
| Sky bolts | 3 channels (`delay 0`, `0.18 * dur`, `0.42 * dur`), `generations` 5/5/4, `radius` `0.036/0.028/0.022 * scale`, forks, `dur * 0.62 / 0.62 / 0.56` | `p1` to `p2`; 4 generations, radius 0.014, no forks, 0.24 s |
| Ground tendrils & web | 4 immediate tendrils (`dur * 0.48`) + 3 delayed tendrils (`delay 0.24 * dur`, `dur * 0.62`), arcing upward in y; Voronoi Lichtenberg web (`6.2`-unit plane tilted `-0.52` rad toward `-z`, scaled `0.42 * scale`, `depthTest: false`, lasting `dur`) | none |
| Flash | `flashStrength = max(current, peakFlash)` at target; re-strike channels pulse `0.42 * peakFlash` and `0.25 * peakFlash`; decays at `max(18, peakFlash / 0.18)` per s | `max(current, 2.2)` at the midpoint |

- Bolt shape: recursive midpoint displacement. Sway starts at 16% of the bolt length and is
  multiplied by 0.52 per generation; y sway is 35% of x and z. A fork (55% of the segment, radius
  x0.42) spawns with probability 0.32 in generations 0..2. Segments are 4-sided tubes, merged.
- Bolt material: `MeshBasicMaterial`, colour `(1.024, 2.816, 3.6)`, additive, `toneMapped: false`,
  no depth write, `renderOrder` 3. Opacity per frame: `sin(t * 10π) > -0.15 ? 1 - 0.85 * t : 0.15`.
- `update(dt)`: `flashStrength -= flashDecay * dt`; ages and disposes bolts (after `delay + duration`) and webs.
- Randomness is `Math.random()`: strikes are not reproducible.

## Parity copies

| File | What it copies |
|---|---|
| `src/procgen/geometry/raster-shade.ts` | `LIGHT = normalize([-0.35, 0.82, -0.48])`, bands 0.66 / 0.4 -> 1 / 0.68 / 0.4, halftone x0.78, rim `pow(1 - facing, 2.6)` and `smoothstep(0.55, 0.92) * 0.55`, emissive add, ghost alpha |
| `src/procgen/fx/preview.ts` | The same vector with x mirrored (`PAGE_LIGHT`, effects are authored in page space) and the same band thresholds |

Neither preview draws the flash, the pixel-art pass or the CRT pass.
