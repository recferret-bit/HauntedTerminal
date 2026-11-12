---
name: particle-effect-validator
description: "[ASSET PCG] Validate and preview comic effects (`FxPreset`s in `src/procgen/fx`) without a browser: role balance 60/30/10, palette rules, colour separation, particle and triangle budgets, stepped timing, size at game scale, panel extent, lingering particles, onomatopoeia rules, plus a filmstrip PNG per effect. Use every time an FX preset, chunk shape, simulator, emitter or lettering changes, before calling effect work done, and when `npm run procgen:fx` or `procgen:check` fails on an `FX_*` code."
---

# Particle effect validator

Effects in this game are data ([procedural-particles-3d](../procedural-particles-3d/SKILL.md)), so
they can be checked and drawn in node. Two tools, both loading the TypeScript directly through Vite
SSR (no build, no GPU):

- **The validator** turns the art rules into numbers: is it a few big shapes or a fountain, are the
  colours the right family, is anything too small for the pixel-art pass, does it end on time.
- **The filmstrip** draws each preset as five frames across its duration, so you can judge the one
  thing numbers cannot: does frame 1 read as a comic hit.

Numbers first, then eyes. Never one without the other.

## Run it

From the project root:

```bash
npm run procgen:fx                      # validate every preset + the catalog check
npm run procgen:fx -- --sheet           # same, and write scripts/harness/out/fx.png
node .kiro/skills/particle-effect-validator/scripts/validate-particles.mjs fx.sigkill fx.hop --sheet --cols 1
node .kiro/skills/particle-effect-validator/scripts/validate-particles.mjs --all --json
node .kiro/skills/particle-effect-validator/scripts/self-test.mjs     # also part of npm run procgen:selftest
```

| Flag | Meaning |
|---|---|
| `--all` | Every preset in `FxCatalog`, plus `validateFxCatalog()`: every `FxMoment` has exactly one preset |
| `<id>...` | Only these presets (no catalog check) |
| `--json` | `{ reports, catalog }` on stdout |
| `--quiet` | Hide warnings |
| `--strict` | Warnings fail too |
| `--sheet` | Write the filmstrip |
| `--out <file>` | Filmstrip path. Default `scripts/harness/out/fx.png` |
| `--cols <n>` | Strips per row. Default 2; use 1 when you want to read a few presets closely |
| `--zoom <n>` | Scale relative to game scale (58 px per unit). Default 1.25 |
| `--seed <n>` | Emission seed. Default 1. Try 2 or 3: a preset must look right for any seed |
| `--floor <1..5>` | Backdrop colour from `FLOOR_THEMES`. Default 1. Check malware effects on 4 and 5 |

Exit code 0 when clean, 1 on any error (or any warning with `--strict`), 2 on bad usage.

## Reading the report

```
      id                     layers particles tris  area P/S/A  dE  smallest  extent  last particle
PASS  fx.sigkill             4L  22p  360t  area 64/24/11  dE 79  min 5px  2.4x2.4u  620ms
FAIL  fx.example             3L  24p  648t  area 47/48/5   dE 96  min 5px  1.6x1.5u  760ms
      ERROR FX_ROLE_BALANCE: secondary is 48% of the emitted area (want 8..45%, target 60/30/10)
```

- `area P/S/A`: share of emitted area per role. Aim near 60/30/10.
- `dE`: the smallest CIE76 distance between the primary colour and any secondary colour.
- `min`: the smallest chunk at its peak, in pixels at game scale.
- `extent`: page-space bounding box of the whole effect in world units.
- `last particle`: latest moment anything is alive; must not exceed `durationMs`.
- `PASS*` means passed with warnings.

Every code, its threshold, why it exists and how to fix it:
[checks-and-thresholds.md](./references/checks-and-thresholds.md). Thresholds live in `FX_LIMITS`
(`src/procgen/fx/validate.ts`); change them there and in the reference together, with a reason.

## Reading the filmstrip

Open the PNG (the Read tool shows images). The script prints the cell order: strips go left to
right, then top to bottom; each strip is one preset, its id and duration lettered above it, the
caption turning red when the preset fails.

Each strip has five frames, left to right, at 0%, 20%, 42%, 66% and 90% of `durationMs`. In every
frame the pale bar is a hero-sized ghost (0.7 x 1.6 units) and the line is the floor: they are there
for scale, not art. Full-panel presets are drawn at half scale so they fit; the log says so.

What to look for:

1. **Frame 1 is the hit.** The big shape and the word are both there, oversized. If frame 1 is
   empty or weaker than frame 2, the effect grows in: fix the scale keys or the delays.
2. **You can count the chunks.** If you cannot, there are too many or they are too small.
3. **Silhouette.** Squint. The effect should be one clear shape against the hero ghost, not a cloud.
4. **Three colours, one meaning.** One mass colour, one material colour, a few bright marks.
5. **The word is readable and not on top of the big shape**, inside the frame on every frame
   (the pop frame is 30% larger).
6. **Frames differ in steps.** Poses hold and jump; nothing should look like an in-between.
7. **Frame 5 is nearly empty.** The effect clears out before it ends.

The preview draws flat cel bands and ink with the same light vector and thresholds as
`src/shaders/comic-material.ts`. It does not run the pixel-art or CRT pass, the room, or the camera
shake: finish in `/asset-lab.html` or the game (`npm run dev`).

## The self-test

`scripts/self-test.mjs` builds one known-good preset, breaks it one way per check, and asserts the
expected code fires (PASS/FAIL per case). It also checks that `fxSimulate` is deterministic,
stepped and empty after the end, that `createFxEmitter` builds in node and mirrors the simulator,
that `fxRenderFrame` is deterministic, and that every shipped preset and the catalog pass.

When you add a check to `validateFxPreset`, add a case to the `cases` table in the same change: a
check with no failing example is a check nobody knows works.

## Typical fixes

| Symptom | Fix |
|---|---|
| `FX_ROLE_BALANCE` accent too large | Fewer or smaller accent chunks; a ring's area grows with the square of its scale keys |
| `FX_ROLE_BALANCE` primary too small | Make the big shape bigger, not more numerous |
| `FX_COLOR_SEPARATION` | Pick the secondary from a different lightness: `paper`, `solder`, `ink`, `copper` |
| `FX_LINGER` | `delayMs[1] + lifeMs[1]` must be at most `durationMs` |
| `FX_NO_POP` | Give the main layer no delay; delays shorter than one step still land on frame 1 |
| `FX_EXTENT` | Lower `speed` or raise `drag`; only set `fullPanel` for effects that are meant to own the panel |
| `FX_FAMILY` | Change the zone, or the `family` if the effect really belongs to someone else |
