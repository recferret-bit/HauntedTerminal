# The comic material, ink shells, vortex and flood

Source: `src/shaders/comic-material.ts`. Created by `createComicMaterial(color, opts)`; for procgen
models by `zoneMaterial()` in `src/procgen/core/build.ts`, one shared material per zone plus one clone
per textured part.

## Uniforms

| Uniform | Type | Set from | Meaning |
|---|---|---|---|
| `uColor` | color | zone colour | Base colour. Also the colour of the emissive add. The stage repaints it for state (`paint()` in `comic-stage.ts`: petrified `0x6c757d`, frozen `0x4cc9f0`). |
| `uInk` | color | `#110e1b` | Rim darkening colour. |
| `uLightDir` | vec3 | `(-0.35, 0.82, -0.48)` normalized | The one light. Not connected to Three.js lights. |
| `uEmissive` | float | `ZoneDef.emissive` | `col += uColor * uEmissive`. 0.3 and up reads as a light. |
| `uOpacity` | float | `ZoneDef.opacity` | Alpha. Below 0.999 the material is transparent; at 0.9 or less it stops writing depth. |
| `uGhost` | 0/1 | `ZoneDef.ghost` | Fresnel ghost: clear centre, bright violet rim, no depth write. |
| `uStripes` | 0/1 | `ZoneDef.stripes` | 7 dark bands (x0.7) across the UV v range. Only `heatsink` uses it. |
| `uHalftone` | 0/1 | `ZoneDef.halftone` | Ben-Day dots (x0.78) in the mid and shadow bands. |
| `uHasMap`, `uMap` | 0/1, sampler | `PartSpec.texture` | Albedo map. Only `.rgb` is read. |
| `uFlash`, `uFlashPos` | float, vec3 | stage, every frame | Lightning: adds `(0.55, 0.86, 1.0) * uFlash / (1 + 0.45 d^2)`. |
| `uTime` | float | stage, every frame | Declared, unused by the stock shader. Variants use it. |

The stage feeds `uTime`, `uFlash`, `uFlashPos` to the materials in its `comics` list (collected in
`buildScene`). A material created later must be added to whatever loop does that, or it will not flash.
`BuiltModel.allMaterials` is the list to feed for a procgen model.

## Fragment order

The order is the design. Each step sees the result of the previous one.

1. `shade = dot(n, light) * 0.5 + 0.5`; `band = 1.0 | 0.68 | 0.4` at thresholds 0.66 and 0.4.
2. `col = uColor * band`.
3. Map: `col = mix(col, albedo * band, 0.86)`. The texture replaces 86% of the colour and takes the band.
4. Stripes: `col *= 0.7` on alternating bands of `fract(vUv.y * 7)`.
5. Halftone, only when `band < 0.95`: a dot of radius 0.16 in each cell of `fract(vWorld.xz * 16)`, `col *= 0.78`.
6. Ink rim: `fres = pow(1 - n.v, 2.6)`; `col = mix(col, uInk, smoothstep(0.55, 0.92, fres) * 0.55)`.
   This rounds forms toward ink at grazing angles; the outline itself is the ink shell.
7. Emissive add, then the flash add. Both after the rim, so glow and lightning are never inked.
8. Ghost: alpha `clamp(uOpacity * (0.12 + fres * 1.15), 0, 0.92)`, colour `+ (0.25, 0.08, 0.35) * fres`.

What each constant does when you move it:

| Constant | Raise it | Lower it |
|---|---|---|
| Band thresholds 0.66 / 0.4 | More mid and shadow, moodier, small parts go dark | Flatter, brighter, less form |
| Band values 0.68 / 0.4 | Less contrast between bands; under the pixel pass they can merge | Harder, more graphic; shadow band nears ink and outlines disappear into it |
| Map mix 0.86 | Texture owns the colour; zone tint gone | Texture washes into the zone colour |
| Halftone cell 16 per unit, radius 0.16, x0.78 | Finer dots alias under the 2 px pixel pass | Coarser dots read as a pattern, not as tone |
| Rim power 2.6, 0.55..0.92, x0.55 | Narrower rim | Wide dark halo, small round parts turn to ink |

Every one of these is mirrored in `src/procgen/core/raster.ts` (see the parity rule in SKILL.md).

## Known quirks

Read these before "fixing" what looks like a bug in a model.

- **Halftone is projected in world xz.** On faces that look at the camera (the xy plane, which is most
  of what the player sees) z is constant, so the dots degenerate into vertical streaks, or vanish,
  depending on the face's z. Proper dots appear on top faces. The software preview (`raster.ts`) uses
  screen-space dots instead, so it is more flattering than the game here. A fix would be
  `fract(vWorld.xy * 16.0)` in the shader; it needs art sign-off because it changes every halftone zone.
- **The lab's INK tab overrides zones.** `ComicStage.setInk` sets `uHalftone` to 1 on every comic
  material in the world when the HALFTONE slider is above 0.05 (the default is 0.85), including zones
  that do not declare `halftone`, and to 0 on all of them otherwise. The slider is an on/off switch.
- **`setInk` scales shells.** It sets `scale = 1 + 0.045 * outline` on every object with
  `userData.outline`. The game's current cast (`src/renderer/procedural-cast.ts`) uses scaled-copy
  shells, where that is the outline. Procgen shells are already offset by `inkShellGeometry`; the
  scale is added on top, so at OUTLINE 1 their line is slightly heavier on large parts.
- **Map alpha is ignored.** Decal textures show ink where they are transparent.
- **Emissive is the zone colour.** A texture on an emissive part does not change what glows.
- **`uLightDir` is per material.** Changing the light means changing `LIGHT` in `comic-material.ts`
  and in `raster.ts`, not a scene light. The `AmbientLight` and `DirectionalLight` in the stage do not
  affect comic materials.

## Ink shells

`inkShellGeometry(geo, thickness)` in `src/procgen/core/geometry.ts`: clone the geometry, merge
vertices, recompute smooth normals, push every vertex out along its normal by `thickness` world units,
draw with `MeshBasicMaterial({ color: INK, side: BackSide })`. Because the offset is in world units,
a pin and a wall get the same line weight. `buildModel` divides the thickness by the part's largest
scale component so scaled parts keep it.

- Weight: `ModelSpec.inkWeight`, default `DEFAULT_INK_WEIGHT = 0.028` (about 1.6 px at 58 px per unit,
  so one to two pixel-art cells). Rooms use 0.02. Below ~0.02 the pixel pass drops the line.
- No shell on: `outline: false` parts, ghost zones, zones with opacity 0.9 or less.
- Shells are children of their part mesh, tagged `userData.outline = true`, excluded from raycasts.
  Fades must fade them too (the stage does, in `syncRoom`).
- Thin or open geometry (a single plane) has no back faces to show: give it thickness.
- Inner lines (a mouth, a panel seam) are not produced by shells. Use a separate ink-zone part or a texture.

## Vortex (`createVortexMaterial`)

`/dev/null`. View-aligned polar coordinates from the normal: six spiral arms
`sin(angle * 6 - uTime * 3.2 + r * 24)`, violet `(0.62, 0.14, 0.95)` on near-black, a black core inside
`r < 0.34`, a violet fresnel rim. Uniform: `uTime` only, fed by the stage from
`cast.hole.group.userData.vortex`. It is the one material allowed a smooth animation: it is a hole in
the page, not a drawing on it. Tune arm count (6), spin (3.2), twist (24), core radius (0.34).

## Flood (`createFloodMaterial`)

The rising data flood on floor 3: a transparent cyan box, `vUv.y` bands scrolling up
(`sin(vUv.y * 28 + uTime * 2.4)`), `vUv.x` scan (`sin(vUv.x * 40 - uTime * 3)`), alpha 0.38, no depth
write, double sided. Uniform: `uTime`. It tints what is behind it, so check actors through it at 20%
and 80% flood.

## Lightning

`src/shaders/lightning.ts` (`LightningStrikeSystem`): bolt meshes and a ground web with its own small
shader (`uAge`, `uDuration`, `uSeed`). It exposes `flashStrength` and `flashPos`, which the stage copies
into every comic material each frame. Design and tuning:
[comic-lighting-and-lightning](../../comic-lighting-and-lightning/SKILL.md).
