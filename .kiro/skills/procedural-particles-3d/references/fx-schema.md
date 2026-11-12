# FX schema

Source of truth: `src/procgen/fx/types.ts`. Everything is exported from `src/procgen/index.ts`.

## Coordinates

Page space: `+x` screen-right, `+y` up, angles in degrees counter-clockwise from screen-right
(0 right, 90 up, 180 left, 270 down). Units are world units (58 px at game scale). The emitter group
mirrors x because world `+x` is screen-left. `FxParticleState.z` is layering depth toward the camera
(`layer index x 0.02` plus `zSpread` jitter); there is no z motion.

## `FxPreset`

| Field | Type | Meaning |
|---|---|---|
| `id` | `fx.<kebab-name>` | Catalog key |
| `label` | string | Human name |
| `family` | `'system' \| 'malware' \| 'hero'` | Which palette families the layers and the word may use (`FX_FAMILY_ZONES`) |
| `trigger` | `{ event, moment, when }` | `event`: a `KernelEvent['type']` or `'COMMAND' \| 'GAME_TICK' \| 'INTRO'`. `moment`: an `FxMoment`, one preset each. `when`: the exact condition in words |
| `anchor` | `'feet' \| 'center' \| 'top'` | Where the origin sits on the target. The caller positions `emitter.group` there |
| `durationMs` | number | All particles are gone by then. One-shots 150..1500; loops 400..6000 |
| `stepFps` | number, default 12 | Frame rate the motion is snapped to. 6..15 |
| `layers` | `FxLayer[]` | 2..6 |
| `onomatopoeia` | `FxOnomatopoeia` | Optional unless `FX_MOMENT_WORDS[moment]` names a word |
| `shake` | 0..2 | Argument for `ComicStage.triggerShake(mul)`: 0.8 light, 1.6 heavy |
| `flash` | 0..6 | Peak `uFlash` for every comic material. 5.5 is a lightning strike |
| `fullPanel` | boolean | Allows an extent up to 7 x 5.6 units instead of 3.4 x 2.8 |
| `loop` | boolean | Ambient effect: time wraps at `durationMs`, `done` never turns true |

## `FxLayer`

| Field | Type | Default | Meaning |
|---|---|---|---|
| `name` | string | | Unique in the preset |
| `role` | `'primary' \| 'secondary' \| 'accent'` | | 60 / 30 / 10 by emitted area |
| `shape` | `ShapeSpec` | | One chunk. Use `fx/shapes.ts`. Long axis on `+x` so `align` works |
| `zone` | `ZoneId` | | Palette zone |
| `count` | integer | | Particles in the layer. All layers together at most 120 |
| `emit` | see below | | Emission shape |
| `origin` | `[x, y]` | `[0, 0]` | Layer origin relative to the effect origin |
| `spawn` | `{ radius?: [min, max], width?, height? }` | | Where particles start |
| `angle` | `[min, max]` degrees | full circle for fans, up for `line`, down for `rain` | Direction range |
| `speed` | `[min, max]` units/s | 0 | Initial speed. 0 makes a static pose (a bolt, a ring) |
| `gravity` | units/s² | 0 | Downward. Negative floats (ash, embers) |
| `drag` | 1/s | 0 | Exponential slow-down. 5..7 stops debris in about a third of a second, which reads as a thrown, drawn chunk |
| `spin` | `[min, max]` deg/s | 0 | Around the axis toward the camera |
| `rotation` | `[min, max]` deg | 0 | Starting rotation |
| `align` | boolean | false | Point `+x` of the shape along the direction of travel |
| `swirl` | degrees | 0 | `implode` only: sweep around the origin on the way in |
| `delayMs` | `[min, max]` | 0 | Snapped down to the step grid |
| `lifeMs` | `[min, max]` | | `delay + life` must not exceed `durationMs` |
| `size` | `[min, max]` | 1 | Per-particle size multiplier. 0.8..1.2 looks hand-drawn |
| `scale` | `FxKey[]` | | Stepped `[t, value]` keys over life, first key at `t = 0`, at most 5 |
| `alpha` | `FxKey[]` | opaque | Stepped opacity. Use one or two steps (1 then 0.5), never a ramp |
| `zSpread` | number | 0 | Depth jitter for layering, at most 0.25 |
| `outline` | boolean | true | Ink shell. `ink`-zone layers get a paper keyline; translucent zones (`ice`, `glass`, `ghostViolet`) get none |

### Emission kinds

| `emit` | Spawn | Motion |
|---|---|---|
| `burst` | Origin, pushed out by `spawn.radius` | Evenly fanned over `angle` (default 0..360), slight jitter |
| `cone` | Same | Same, `angle` and `speed` required |
| `ring` | On a circle of `spawn.radius` | Radially outward at `speed` (0 = a static ring of marks) |
| `line` | Across `spawn.width` x `spawn.height`, evenly spread on x | Along `angle` |
| `rain` | Across `spawn.width`, at `spawn.height` above the origin | Along `angle`, default straight down |
| `implode` | On a circle of `spawn.radius` | Pulled into the origin over the particle's life, accelerating; `speed` ignored |

Fans are evenly spaced on purpose: a comic burst is a drawn star, not a random spray. Offset one
fan against another with `angle: [20, 380]`.

### Stepped keys

`scale: [[0, 1.3], [0.34, 1], [0.67, 0.7]]` means: 1.3 from birth, 1.0 from 34% of life, 0.7 from 67%,
then gone. With a 250 ms life at 12 fps that is exactly three drawn frames. Shared tracks in
`presets.ts`: `POP`, `CHUNK`, `PUFF`, `RING`, `TWINKLE`.

## `FxOnomatopoeia`

| Field | Meaning |
|---|---|
| `text` | Upper-case, 1..18 characters from `fxWordCharset()` (`A-Z 0-9 ! ? + - / . : ( ) > _ # %`, space, multiplier `x`) |
| `zone` | Palette zone, family rule applies |
| `style` | `'burst' \| 'jagged' \| 'whisper' \| 'glitch'` |
| `holdMs` | 300..1400 |
| `offset` | Centre of the word from the origin. Default `[0, 0.7]` |
| `size` | Cap height in units. Default 0.3 (17 px). Minimum 10 px |

## Functions

```ts
FxCatalog.register(preset) / .get(id) / .has(id) / .list() / .forMoment(moment)
fxSpawn(preset, seed = 1): FxSpawn[]                       // roll every particle once
fxEvaluate(preset, spawns, tMs): FxParticleState[]         // closed form, stepped, visible particles only
fxSimulate(preset, seed, tMs): FxParticleState[]           // fxEvaluate(fxSpawn(...))
fxWordState(preset, tMs, text?): FxWordState | null
fxTotalMs(preset): number                                  // max(durationMs, word holdMs)
validateFxPreset(preset): FxReport                         // { pass, errors, warnings, issues[], metrics }
validateFxCatalog(): FxIssue[]                             // every FxMoment has exactly one preset
formatFxReport(report, { quiet? }): string
fxRenderFrame(preset, tMs, opts?): PixelBuffer             // software preview, page plane
createFxEmitter(preset, { seed?, inkWeight?, text? }): FxEmitter
//   FxEmitter: { preset, group, materials, timeMs, done, update(dtMs), seek(tMs), dispose() }
fxDeltaE(hexA, hexB): number                               // CIE76
fxShapeSoup(shape): FxSoup                                 // triangles, frontArea, size
```

Determinism: all randomness comes from `makeRng(hashSeed(preset.id + layer, seed))` at spawn.
Evaluation is closed form, so `seek()` to any time gives the same picture as stepping there.

## Runtime notes

- `createFxEmitter` uses a small mesh pool per layer, not `InstancedMesh`: the comic vertex shader
  (`src/shaders/comic-material.ts`) has no instancing path. Budget is 120 particles, so this is at
  most a few hundred draw calls for well under a second.
- One comic material per layer per alpha step; `emitter.materials` lists them so the host can feed
  `uFlash` / `uFlashPos` like every other comic material.
- The emitter does not shake the camera or flash the room. Read `preset.shake` and `preset.flash`
  and apply them in the stage.
