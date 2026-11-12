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
Defaults: on, intensity 0.65, first strike after 1.4 s. In `frame()`: when the timer runs out it is
reset to `7 / max(0.35, intensity)` seconds (10.8 s at 0.65, 7 s at 1.0, 4.7 s at 1.5) and calls
`lightning.strikeAt((-2.4, 4.2, 1.2), 0.35 * intensity)`: a very short bolt high on the screen-right
side, whose real effect is the flash from that corner. `main.ts` wires it to the visual lab's STORM
tab (intensity slider 0..1.5).

### Lightning callers

| Caller | Call | With |
|---|---|---|
| `triggerLightningIntro()` | `strikeAt((0.1, 0.02, 0.7), 5.4)` | `triggerShake(1.6)`, `KRAKOOM!!` in `#4cc9f0` |
| Storm timer | `strikeAt((-2.4, 4.2, 1.2), 0.35 * intensity)` | nothing else |
| `PROC_SIGNALED` `KILLED` | `strikeAt(boss at y 0.05, 4.6)` | `triggerShake(1.6)`, `KILL -9 // REAPED!` |
| `PROC_SIGNALED` `TRAPPED_ENRAGED` | `spawnGridOverloadArc(boss + (-0.2, 1.5, 0), boss + (0.35, 0.4, 0.1))` | `triggerShake(1.3)`, boss painted `0xff2a55` |

`triggerShake(mul)`: 280 ms, amplitude `config.shakeIntensity (10) * 0.006 * mul` world units,
decaying linearly, camera x and y only.

### Lantern

`applyLantern(t)`, `t` in 0..1 (tweened over `config.transitionMs` = 420 ms on `LANTERN_REVEAL`, or
set to 1 by `syncRoom` when `view.lantern`):

- hidden dotfile (the ghost): body `uOpacity = 0.16 + 0.84 t`; eyes `uOpacity = t`, `uEmissive = 0.85 t`
- vibecoder lantern glow: `uEmissive = 0.35 + 1.25 t`

Hidden actors otherwise sit at `alpha 0.04` (`defaultRoom()` / the session's `RoomView`).
`config.lanternRadius` (140 px) is declared in `SandboxRenderConfig` but the stage does not read it:
there is no dark overlay or cone in the game yet. The storybook draws one (`src/storybook/stage/lab-stage.ts`:
a multiply plane in front of the camera with three hard steps, radius `140 / 58` units, emissive
meshes re-drawn above it).

### PS_XRAY

`HUD_OVERLAY_TOGGLED` -> `mountXray()`: a `THREE.Line` in `0x06d6a0` from the boss (y + 1.2) to the
minion (y + 0.9), and two text sprites (`PID 666  CPU 98%`, `PID 667  PPID 666`), all named `xray`
in the `fx` group; `clearXray()` removes them. It is an overlay: it does not change materials.

### Flood

A `BoxGeometry(1, 1, 0.2)` with `createFloodMaterial()` at z 0.5. `syncFlood()`:
height `0.02 + percent/100 * max(1.2, column height)`, width = the panel, visible above 1%.
Floor 3 starts at 20%; each `viaSymlinkLoop` transition adds 18%, capped at 85%.

## `LightningStrikeSystem`: `src/shaders/lightning.ts`

```ts
new LightningStrikeSystem(scene: THREE.Scene)
flashStrength: number            // read by the stage every frame
readonly flashPos: THREE.Vector3
strikeAt(targetPos: THREE.Vector3, skyHeight = 5.2): void
spawnGridOverloadArc(p1: THREE.Vector3, p2: THREE.Vector3): void
update(dt: number): void         // seconds
buildJaggedBoltGeometry(start, end, generations = 5, trunkRadius = 0.02, spawnForks = true): THREE.BufferGeometry | null
```

| | `strikeAt` | `spawnGridOverloadArc` |
|---|---|---|
| Main bolt | from `target + (±0.6, skyHeight, ±0.6)` to target; 5 generations, radius 0.022, forks, 0.42 s | `p1` to `p2`; 4 generations, radius 0.01, no forks, 0.16 s |
| Extras | 3 ground tendrils 0.45..1.0 long (4 generations, radius 0.012, 0.22 s); a Lichtenberg web: a 6.2-unit plane scaled 0.22, 0.7 s | none |
| Flash | `flashStrength = 5.5` at the target | `max(current, 2.2)` at the midpoint |

- Bolt shape: recursive midpoint displacement. Sway starts at 16% of the bolt length and is
  multiplied by 0.52 per generation; y sway is 35% of x and z. A fork (55% of the segment, radius
  x0.42) spawns with probability 0.32 in generations 0..2. Segments are 4-sided tubes, merged.
- Bolt material: `MeshBasicMaterial`, colour `(2.475, 4.84, 6.0)`, additive, `toneMapped: false`,
  no depth write, `renderOrder` 3. Opacity per frame: `sin(t * 6π) > -0.2 ? 1 - t : 0.2`.
- `update(dt)`: `flashStrength -= 14 * dt` (5.5 reaches 0 in 0.39 s); ages and disposes bolts and webs.
- Randomness is `Math.random()`: strikes are not reproducible.

## Parity copies

| File | What it copies |
|---|---|
| `src/procgen/geometry/raster-shade.ts` | `LIGHT = normalize([-0.35, 0.82, -0.48])`, bands 0.66 / 0.4 -> 1 / 0.68 / 0.4, halftone x0.78, rim `pow(1 - facing, 2.6)` and `smoothstep(0.55, 0.92) * 0.55`, emissive add, ghost alpha |
| `src/procgen/fx/preview.ts` | The same vector with x mirrored (`PAGE_LIGHT`, effects are authored in page space) and the same band thresholds |

Neither preview draws the flash, the pixel-art pass or the CRT pass.
