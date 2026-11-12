# Architecture rules

Code follows clean architecture: dependencies point inward, and the rules are enforced by scripts, not by memory.

## Layers (inner to outer)

```
contracts/            pure types shared by game and tools (events, room view)
procgen/core          domain: palette, rng, types, catalogs, pixel buffers. No three.
procgen/geometry      shape -> geometry, software raster (three math only)
procgen/kit, textures, archetypes, fx, anim, validate
                      content and rules as plain data and pure functions
procgen/runtime       adapters: comic materials, ink shells, animator, FX emitter. Only layer that imports shaders/
shaders/              GLSL materials and post passes. Imports nothing from procgen
storybook/            storybook: domain <- subjects <- stage <- ui <- app (entry: storybook/storybook.ts)
```

Exact allowed imports live in `scripts/quality/check-layers.mjs`. Change the rules there if the architecture changes, in the same commit.

## Hard limits

- No source file over 600 lines. No function over 130 lines. Split by responsibility, not by line count.
- No duplicated blocks (`jscpd`, 4 lines / 35 tokens). Extract the shared helper into the innermost layer that both callers may import.
- KISS: plain functions and data tables before classes; no indirection that only exists to survive a missing module.
- No `any`.

## Gates (run before saying a change is done)

- `npm run quality` : typecheck, root layout, size, layers, duplicates.
- `npm run quality:fingerprint` : hashes of every model, texture and FX (specs, validator reports, rasters, meshes, poses). Refactors must leave it byte-identical; for intended asset changes, diff it and explain the change.
- Storybook: `node scripts/harness/screenshot-lab.mjs --selftest`.
