---
name: ai-mesh-pipeline
description: "[ASSET PCG] Optional external-asset path for game assets: PNG albedo maps dropped into `public/assets/sprites/` and listed in `public/assets/manifest.json`, and AI-generated or Blender `.glb` meshes forced into the comic look (palette zones, cel material, ink shells, front-facing relief). Use whenever someone wants to add, replace, generate or debug a PNG sprite, texture or `.glb` mesh for an actor, edits the manifest, asks for image-generation or image-to-3D prompts in the game's style, or asks why a dropped-in asset does not show or looks wrong. Read `credits-art-direction` first."
---

# External assets: PNG maps and GLB meshes

**The game is procedural-first.** Every actor, door, pickup and room is a `ModelSpec` built in code
(`src/procgen`), and that is the default answer to "we need a new thing": see
[procedural-kitbash-3d](../procedural-kitbash-3d/SKILL.md), [procedural-malware-3d](../procedural-malware-3d/SKILL.md),
[procedural-rooms-3d](../procedural-rooms-3d/SKILL.md). External assets are an optional layer on top,
for when a hand-painted or generated image says something geometry cannot. There are two kinds, and
both have to end up looking like the rest of the page: ink outlines, flat cel colour, the one palette.

Read [credits-art-direction](../credits-art-direction/SKILL.md) first for the look and the palette.

| You have | Path | Status in the game |
|---|---|---|
| A PNG for an existing actor | A. PNG albedo map | Loaded and listed in the F2 inspector; not yet applied to any mesh |
| A concept image to generate | Prompts in [prompt-templates-and-providers.md](./references/prompt-templates-and-providers.md) | Feeds path A or B |
| A `.glb` from an image-to-3D service or Blender | B. GLB to comic | Sanitizer works; the game has no GLB loader wired in yet |

## Path A: PNG albedo maps (loaded, not applied yet)

How it really works today, from `src/assets/asset-registry.ts`, `src/play/boot.ts` and `src/sandbox/dev-inspector.ts`:

1. At boot (`loadStage()` in `src/play/boot.ts`) and when you press **Hot-Reload Assets** in the F2 inspector,
   `AssetRegistry.reloadAll()` fetches `/assets/manifest.json` and, for each key, sends a `HEAD` request
   for its `textureUrl`. If the response is OK and its content type is an image, the PNG is loaded as an
   sRGB texture; otherwise the key is marked `PROCEDURAL`. A missing file falls back cleanly, but on a static host (Netlify) the probe is a real 404 and Chrome logs a console error, so list a key only once its PNG exists (`manifest.json` is `{}` until then).
2. The F2 inspector lists every key with its `[PNG]` or `[PROCEDURAL]` badge (`registry.listStatuses()`).
3. **Nothing applies the texture yet.** `AssetRegistry.getTexture(key)` has no caller in `src/`, and
   `ComicStage.buildScene()` does not bind registry textures. A loaded PNG therefore changes nothing on
   screen. Wiring it in is a renderer change: for each mesh whose `userData.assetKey` matches a manifest key,
   set the comic material's `uMap` and `uHasMap = 1` (the same uniforms `stateTintHook` in
   `src/renderer/stage-cast.ts` already swaps for the stone, ice and corruption tints).
4. Once bound, the comic shader mixes it in: `colour = mix(zoneColour × band, texture.rgb × band, 0.86)`.
   Cel bands, ink and halftone still apply on top.

What follows from that (these surprise people):

- **It is an albedo map on a 3D mesh, not a sprite.** The PNG would be laid on each part of the actor through
  that part's own UVs (a box shows the whole image on every face). It does not replace the silhouette.
- **Alpha is ignored.** The shader reads only `.rgb`, so transparent pixels show as whatever RGB they hold,
  usually black. Paint edge to edge. (`public/assets/README_ASSETS.md` asks for transparent sprites; for
  the comic material that is wrong.)
- **`anchor`, `targetHeight` and `tintFallback` are not read by any code.** Keep them valid (the type
  `ManifestEntry` requires them) but do not expect them to move or scale anything.
- **Keys the stage stamps on actors** (`group.userData.assetKey`, set in `buildActorModel()` in
  `src/renderer/stage-cast.ts`) are the `RoomActor.key`: the `LEGACY_CAST` keys of
  `src/renderer/procgen-cast.ts` (`vibecoder`, `ghost`, `crate`, `socket`, `gargoyle`, `gate`, `boss`,
  `minion`, `hole`, `mirror`, `scroll`) or `entity` for catalog-only actors. The vortex mesh carries
  `black_hole`, and the System Hand group is named `system_hand`. The key table in
  `public/assets/README_ASSETS.md` still uses older names (`poltergeist`, `crate_bridge`, ...).
- Procgen models built with `buildModel()` also carry `userData.assetKey = spec.id` (`vibecoder.dev`) on
  each mesh (`src/procgen/runtime/build.ts`); the stage key above sits on the actor's group. When you wire
  textures in, map through `ModelEntry.gameKey`.

Workflow:

1. Generate or paint the image with the palette and style in
   [prompt-templates-and-providers.md](./references/prompt-templates-and-providers.md) (use the
   "flat albedo sheet" template, not the sprite one, for path A).
2. Save it as `public/assets/sprites/<key>.png` and add its manifest entry (the manifest is `{}` today);
   an entry is `{ "textureUrl": "/assets/sprites/<key>.png", "anchor": [0.5, 0.9], "targetHeight": 92, "tintFallback": "#rrggbb" }`.
3. Check it: `node .kiro/skills/ai-mesh-pipeline/scripts/check-manifest.mjs`
   (`--strict` makes warnings fail). It validates the JSON, every field, that each file is a readable
   PNG of sane size, how much of it is transparent, how much is on-palette, and orphan files. Its
   "keys no mesh uses" check still looks for a renderer cast file that no longer exists, so it is skipped today.
4. `npm start`, press F2, **Hot-Reload Assets**, and confirm the key shows `[PNG]`. It will not show on the
   actor until the renderer binds registry textures (step 3 above).
5. If it fights the cel shading or the pixel-art pass, the fix is nearly always fewer colours and
   bigger shapes in the PNG, not a shader change.

## Path B: GLB meshes, forced into the comic look

A raw AI or Blender mesh has everything this game forbids: PBR materials, photo textures, baked
shadows, 100k triangles, an arbitrary pivot and facing, and real depth. Never load one directly.
The rule is: **keep the geometry, throw away the look, and put ours back on.**

```
concept image  ->  image-to-3D or Blender  ->  decimate in Blender  ->  sanitize-glb.mjs  ->  comic loader
 (our prompts)      (external, your choice)     (to the budget)          (in this repo)        (example code)
```

1. **Concept**: a front orthographic, flat-coloured image from the prompt templates. Reject it if it is
   not readable as a black silhouette.
2. **Reconstruct** with whatever image-to-3D service or Blender workflow you have access to. This repo
   ships no provider client and assumes none; check the provider's current docs for how to call it and
   for its licence terms.
3. **Decimate** in Blender to the budget (3500 triangles for an actor, 8000 for a room) and export a
   self-contained `.glb` with **PNG** textures and no Draco / meshopt compression. Recipe:
   [glb-to-comic.md](./references/glb-to-comic.md).
4. **Sanitize**:

   ```bash
   node .kiro/skills/ai-mesh-pipeline/scripts/sanitize-glb.mjs \
     --input raw/bug.glb --output public/assets/models/bug.glb \
     --height 1.0 --families hardware,malware,neutral --squash
   ```

   It bakes transforms, drops every texture, UV, animation and PBR value, assigns each triangle the
   nearest palette zone of the allowed families (sampling the PNG base-colour texture, the base-colour
   factor and vertex colours), keeps at most 5 zones, writes one primitive per zone with a material
   named `zone:<id>`, turns the model to face −z, puts its feet at y = 0, scales it to `--height`, and
   enforces the triangle and depth budgets. It prints the zone shares: compare them with 60 / 30 / 10.
   It has no dependencies and does not decimate; over budget is an error.
5. **Load** with the pattern in [examples/load-comic-glb.ts](./examples/load-comic-glb.ts): every
   material is replaced by `createComicMaterial` for its zone and every mesh gets an ink shell from
   `inkShellGeometry`. This loader is an example, not game code: the stage has no GLB slot today, and
   adding one is a renderer change to do deliberately.
6. **Judge it like a procedural model**: silhouette at 96 px, one focal light, a malware model has
   `malware` zones and exactly one eye. If the result needs more than a few minutes of fixing, write
   it as a `ModelSpec` instead: a kitbash model is smaller, animatable part by part, and validated.

Choose `--families` by who the model is (the family rules are in the art bible): props, doors, rooms
`hardware,signal,glass,neutral` (the default); malware add `malware`; the vibecoder `human,neutral`.

## What a GLB cannot give you

- **Per-part animation.** AnimTags drive named parts of a `ModelSpec`. A sanitized GLB is one mesh per
  zone; it can bob, spin or jitter as a whole, nothing else. Rigs and clips are dropped.
- **Validator coverage.** `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --strict` reads `ModelCatalog` only.
- **Texture detail.** Colour is decided per triangle, so detail smaller than a triangle is lost. That is
  intended: detail here is geometry or ink, never a photo.

## Files

- [scripts/check-manifest.mjs](./scripts/check-manifest.mjs): manifest and sprite checker (path A).
- [scripts/sanitize-glb.mjs](./scripts/sanitize-glb.mjs): GLB sanitizer (path B). `--report` alone analyses without writing.
- [examples/load-comic-glb.ts](./examples/load-comic-glb.ts): re-skinning a sanitized GLB with the comic material and ink.
- [references/prompt-templates-and-providers.md](./references/prompt-templates-and-providers.md): prompts per asset category, palette hexes, provider notes.
- [references/glb-to-comic.md](./references/glb-to-comic.md): Blender preparation, what the sanitizer does and refuses, troubleshooting.
