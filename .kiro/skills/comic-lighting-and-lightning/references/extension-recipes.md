# Extension recipes

Each recipe keeps the rules of the look: one direction, three flat bands, emissive means light,
hard steps. They are changes to `src/shaders/comic-material.ts` and `src/renderer/comic-stage.ts`;
this skill does not apply them for you. After any of them run the checklist in `SKILL.md`.

## 1. Per-floor tint (cheapest mood change)

Tint only what is not lit, so palette colours stay true where the player looks.

```glsl
// COMIC_FRAG, new uniform
uniform vec3 uShadowTint;   // default vec3(1.0)
// after: vec3 col = uColor * band;
if (band < 0.95) col *= uShadowTint;
```

```ts
// createComicMaterial: uShadowTint: { value: new THREE.Color(0xffffff) }
// ComicStage.syncRoom, next to the backdrop colour update:
for (const mat of this.comics) (mat.uniforms.uShadowTint.value as THREE.Color).copy(tintFor(view.floor));
```

Suggested tints (multiply; keep every channel at or above 0.75 so shadows do not go black):
floor 1 `(0.92, 0.88, 1.0)` violet dusk, floor 2 `(0.85, 1.0, 0.95)` crypt green, floor 3
`(0.85, 0.95, 1.0)` cold cyan, floor 4 `(1.0, 0.82, 0.78)` furnace red, floor 5 `(1.0, 0.8, 1.0)` magenta.

Parity: add the same multiply to `raster-shade.ts` behind a `RasterOptions.shadowTint`.

## 2. Per-floor light direction

`uLightDir` is already a per-material uniform, so this needs no shader change:

```ts
const dir = new THREE.Vector3(x, y, z).normalize();
for (const mat of this.comics) (mat.uniforms.uLightDir.value as THREE.Vector3).copy(dir);
```

Constraints, or the art breaks:

- Camera-facing faces must stay lit: `(-z component) * 0.5 + 0.5 > 0.66`, so normalised `z <= -0.33`.
- Keep `y >= 0.6`: light from below is a horror cue; save it for one moment (see recipe 4), not a floor.
- Stay within about 15° of the default. Models were composed for it.
- Presets worth having: furnace, light from the die below-right `(-0.45, 0.62, -0.42)`; kernel core,
  steeper top light `(-0.2, 0.9, -0.4)`.
- Set `raster-shade.ts` `LIGHT` and `fx/preview.ts` `PAGE_LIGHT` from the same value when previewing a
  floor; otherwise the contact sheets lie.

## 3. A second rim colour for the furnace

The furnace die glows from one side. Draw that as a coloured rim on faces turned toward it, in
place of the ink rim there. Still flat: one extra band, no falloff.

```glsl
uniform vec3 uRimColor;   // default vec3(0.0) = off
uniform vec3 uRimDir;     // direction to the heat source, world space
// replace step 6 (ink rim) with:
float rimMask = smoothstep(0.55, 0.92, fres);
float toHeat = step(0.25, dot(n, normalize(uRimDir)));
col = mix(col, uInk, rimMask * 0.55 * (1.0 - toHeat));
col += uRimColor * rimMask * toHeat;          // a hard-edged hot edge, not a glow
```

Use `powerAmber` (`0xffd166`) or `lockRed` (`0xef233c`) at 0.5 to 0.8 strength, `uRimDir` pointing at
the die. Only on floor 4, only while the boss is alive ("the boiler room cools" when it dies: tween
the strength to 0 in three steps, not smoothly). Do not put it on the vibecoder: he is lit by his lantern.

## 4. The kernel-core storm (floor 5)

- `setStorm(true, 1.3)`: a strike about every 5.4 s. Above 1.5 the flashes stop reading as events.
- Move the strike point per hit between two or three fixed spots along the top of the panel so the
  flash direction changes; keep z at 1.2 (behind the actors) so the flash rakes their fronts.
- Play `fx.lightning-strike` (`FxCatalog.forMoment('lightning-strike')`) at the ground point of each
  near strike for the drawn bolt, the word and the sparks; let `LightningStrikeSystem` supply the
  flash numbers only.
- Boss phase changes: one strike each, with `triggerShake(1.6)`. For the phase-3 break, flip
  `uLightDir.y` negative for exactly two frames (light from below), then restore. That is the one
  sanctioned under-light.
- Between strikes the room must stay readable from emissive alone: the boss eye (`malwareEye`, 1.1),
  the sockets' LEDs, the pickups.

## 5. Real lantern darkness

The design doc asks for dark corners and a cone from the lantern; the game stage only reveals the
dotfile today. To add the dark:

1. A full-screen plane parented to the camera, in front of everything, `MultiplyBlending`-style
   shader with **three hard steps**: inside the radius x1.0, a ring to 1.6x the radius x0.55, outside
   x0.2 tinted toward the floor `bg`. Radius: `config.lanternRadius` px / 58 px per unit (2.4 units).
   `src/storybook/stage/lab-stage.ts` has this as a working stand-in; lift it rather than rewriting it.
2. Centre it on the vibecoder's lantern socket, projected to camera space every frame.
3. Draw emissive meshes after it (`renderOrder` above the plane, `transparent = true` so they sort):
   that is rule 5, "in the dark only emissive survives".
4. Unlit (`lantern: false`) rooms: radius 0.6 of normal, so the vibecoder is a small island of light;
   `ls -a` snaps it to full over three steps while `applyLantern` raises the dotfile.
5. During a lightning flash, lift the dark step to x0.6 for the frames where `flashStrength > 2`: the
   whole room shows for an instant. This is the haunted-mansion beat; use it.

Never a `SpotLight`, never a smooth radial gradient: both wash out under the pixel-art quantizer.

## 6. Making lightning comic

`LightningStrikeSystem` works but draws glowing tubes. To bring it to the look without changing who
calls it:

- Keep `flashStrength` / `flashPos` and `update()` as the single flash source.
- Replace the tube bolt with an extruded page-plane outline (`comicBoltOutline` in
  `../examples/LightningStrikeSystem.ts`, or `fxBolt`), `dataCyan` comic material, emissive, with an
  ink shell from `inkShellGeometry`. Displace in x and y only.
- Seed it (`makeRng`), so a strike is reproducible.
- Hold: visible for 3 steps at 12 fps with the scale keys `1, 1.06, 0.94`, then removed. No opacity ramp.
- Drop the ground web (edge-on to the camera) in favour of the `paper` ground star.
- Simplest route: delete nothing, call `createFxEmitter(FxCatalog.get('fx.lightning-strike'))` at the
  strike point from `strikeAt`'s callers, and set the tube material's opacity to 0.

## 7. Parity rule

Three files hold the light: `src/shaders/comic-material.ts` (truth), `src/procgen/geometry/raster-shade.ts`
(model contact sheets, model validator) and `src/procgen/fx/preview.ts` (effect filmstrip). A change
to the vector, the band thresholds (0.66 / 0.4), the band multipliers (1 / 0.68 / 0.4), the rim curve
or the emissive add must land in all three in one commit, followed by `npm run procgen:sheet` and
`npm run procgen:fx -- --sheet` to confirm the previews moved the way the game did. `preview.ts`
mirrors x (page space); do not "fix" that.
