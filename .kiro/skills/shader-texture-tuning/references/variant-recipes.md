# Material variants: glitch, ice, stone, and how to add another

Working code: [comic-variants.ts](../examples/comic-variants.ts). The three patched shaders were
compiled and linked in Chrome's WebGL when written; `scripts/check-examples.mjs` re-checks that the
patch points still exist in `src/shaders/comic-material.ts` and that the uniforms match.

## Why patch instead of fork

A copy of `COMIC_FRAG` drifts: the next change to bands or rim misses it, and the variant stops
matching the rest of the page and the software preview. A patch inherits every stage it does not
touch. `patchComicFragment(patch)` inserts code at five anchors (exact lines of the stock shader) and
throws if one is gone, so a change to the base shader fails loudly instead of silently:

| Patch field | Where it lands | In scope | Use for |
|---|---|---|---|
| `decl` | Before `main()` | | Uniforms, helper functions. Prefix names `cv`. `cvHash(vec2)` is provided. |
| `begin` | First lines of `main()` | `comicUv` (starts as `vUv`) | Moving the `uMap` lookup: tears, scrolls. |
| `surface` | After map, stripes, halftone; before the ink rim | `col`, `n`, `shade`, `band`, `comicUv` | Replacing or tinting the surface. Multiply new colour by `band`. |
| `emissive` | Factor on `col += uColor * uEmissive` | everything above | Dimming or killing glow. |
| `final` | After rim, emissive, flash; before output | `col`, `fres`, `viewDir` | Rare: things that must not be inked or lit. |

`comicVariant(base, patch, uniforms)` clones a comic material (same colour, flags, map), swaps the
fragment shader and adds the uniforms. `applyComicVariant(root, make)` swaps every comic material
under an object, skips ink shells, and returns the new materials plus a `restore()`.

Whoever feeds `uTime`, `uFlash`, `uFlashPos` must feed the variant materials too (in the stage that
is the `comics` list; for a procgen model, the materials returned by `applyComicVariant`).

## Rules for any variant

1. Multiply by `band`. A variant colour that ignores the band is a flat sticker on a lit model.
2. Colours are `ZONES` entries passed as `THREE.Color` uniforms (they are converted to the working
   colour space; a literal `vec3` in GLSL is not).
3. Space: patterns live in **page space**, `vec2(-vWorld.x, vWorld.y)` (world +x is screen-left).
   The camera never rotates, so page space is stable and needs no triplanar mapping. Use UVs only to
   disturb the part's own texture.
4. Grid: 8 cells per world unit is about 7 screen px, three to four pixel-art cells. Finer than 16 per
   unit aliases.
5. Time: `floor(uTime * n)`. 12 per second for jitter, 4 for slow holds. Frozen and petrified states
   have no time term at all.
6. Transitions are a threshold on a per-cell hash, `step(cvHash(cell), amount)`: blocks flip one by
   one as `amount` goes 0 to 1. Never `mix(a, b, amount)` over time; that is a cross-fade.
7. Value first: check the variant in palette mode 4. Magenta `corruptMagenta` and green `pcb` differ
   in hue far more than in luma; the void blocks (`voidPurple`, dark) are what make corruption read.
8. Leave the ink shell alone. Ink stays ink in every state.

## Glitch: malware corruption

`glitchVariant(base, amount)`; uniforms `uGlitch`, `uGlitchA` (corruptMagenta), `uGlitchB`
(corruptViolet), `uGlitchVoid` (voidPurple).

```glsl
// begin: rows 1/16 unit tall tear sideways by whole eighths of the texture, 12 steps per second
float cvRow = floor(vWorld.y * 16.0);
float cvTick = floor(uTime * 12.0);
float cvTear = step(1.0 - 0.3 * uGlitch, cvHash(vec2(cvRow, cvTick)));
comicUv.x += cvTear * (floor(cvHash(vec2(cvTick, cvRow)) * 5.0) - 2.0) * 0.125;

// surface: 1/8 unit blocks flip to magenta or violet and hold for a quarter second; torn rows go void
vec2 cvCell = floor(vWorld.xy * 8.0);
float cvEaten = step(1.0 - 0.4 * uGlitch, cvHash(cvCell + floor(uTime * 4.0) * 0.37));
vec3 cvInk = cvHash(cvCell.yx + 3.1) < 0.5 ? uGlitchA : uGlitchB;
col = mix(col, cvInk * band, cvEaten);
col = mix(col, uGlitchVoid, cvTear * step(0.6, cvHash(vec2(cvRow, 9.7))));
```

`uGlitch` 0.35 is an idle infection (about 14% of blocks, 10% of rows), 1.0 is death. Drive it from
game state: raise it on hit, ramp to 1 on death. It pairs with the `jitter` AnimTag (geometry) and
with `tex.corruption` as the part's `texture` (static damage that the software preview also shows).
Use it on malware bodies and on hardware being infected, never on the hero or on `signal` parts.

## Ice: SIGSTOP

`frozenVariant(base, amount)`; the shared overlay patch with `uOverlay = tex.ice`, glint on,
emissive cut 0.5.

```glsl
vec2 cvPage = vec2(-vWorld.x, vWorld.y);
float cvTurned = step(cvHash(floor(cvPage * 8.0)), uOverlayAmount);       // which blocks have frozen
vec3 cvSkin = texture2D(uOverlay, cvPage * uOverlayScale).rgb * band;     // ice shards, cel-lit
float cvGlint = uOverlayGlint * step(0.95, band) * step(0.9, fract((cvPage.x + cvPage.y) * 2.5));
cvSkin = mix(cvSkin, uOverlayGlintColor, cvGlint);                        // paper streaks, lit band only
col = mix(col, cvSkin, cvTurned);
// emissive factor: 1.0 - uOverlayAmount * uOverlayEmissiveCut
```

`uOverlayScale` 0.75 shows three quarters of a tile per world unit, so a 1.6 unit actor carries about
one tile of shards. Animate `uOverlayAmount` 0 to 1 over ~200 ms when the signal lands, and stop the
actor's animation clock at the same moment: ice that wobbles does not read as frozen. Thaw is the reverse.

## Stone: chmod -x

`petrifiedVariant(base, amount)`; the same overlay patch with `uOverlay = tex.stone`, no glint,
emissive cut 1.0. A petrified enemy's eye goes dark: that is the readable difference from frozen (pale,
still faintly glowing) at 96 px. Stone is the lasting state, so also swap geometry cues if you can
(the bible: the trojan "turns to grey stone").

## Wiring a variant into the game

The stage currently shows these states by repainting `uColor` (`paint()` in
`src/renderer/comic-stage.ts`: petrified `0x6c757d`, frozen `0x4cc9f0`) for actors in `syncRoom`.
To replace that with variants:

1. Move the code from `examples/comic-variants.ts` to `src/shaders/comic-variants.ts`.
2. In `syncRoom`, where `actor.petrified` / `actor.frozen` are read, call `applyComicVariant` on the
   actor's group once per state change (keep the returned `restore` on the actor), instead of `paint`.
3. Add the returned materials to the per-frame loop in `frame` that sets `uTime`, `uFlash`,
   `uFlashPos`, and remove them on restore.
4. Tween `uOverlayAmount` / `uGlitch` with the stage's `tweens`.
5. In the asset lab the states are listed in `STATE_IDS` (`src/lab/options.ts`): check `petrified`,
   `frozen` and a malware model there.

## Parity with the software preview

`raster.ts` does not run variants, and should not: the harness sheets show the model's base look.
For a state that must be visible in a sheet, give the part the matching texture
(`texture: 'tex.stone'`), which `rasterizeModel` does sample. If a variant ever becomes the default
look of a zone, it is no longer a variant: put it in `COMIC_FRAG` and mirror it in `raster.ts`.

## Checklist for a new variant

- [ ] One sentence: what state it shows and what the player should conclude from it.
- [ ] A `ComicPatch` with `cv`-prefixed names; no edit to `COMIC_FRAG`.
- [ ] Colours from `ZONES` as uniforms; every new colour term multiplied by `band`.
- [ ] Stepped time or none; hash-threshold transition.
- [ ] `node .kiro/skills/shader-texture-tuning/scripts/check-examples.mjs` passes (add the variant to its list).
- [ ] No GLSL errors in the browser console with the material on screen.
- [ ] Reads at game scale in palette modes 4 and 0, with the pixel and CRT passes on, during a lightning flash.
- [ ] Distinguishable from the other states by value and silhouette, not by hue alone.
