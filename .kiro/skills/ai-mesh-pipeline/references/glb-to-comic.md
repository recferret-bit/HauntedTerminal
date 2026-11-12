# GLB to comic: the procedure

Prerequisites, honestly stated:

- **In this repo**: node (the sanitizer uses built-ins only) and `three` (for the example loader's
  `GLTFLoader`). Nothing else is installed: there is no glTF-Transform, no mesh decimator, no image
  codec, and no image-to-3D client in `package.json`. Do not add one for a single asset.
- **Outside this repo**: a way to make the mesh (an image-to-3D service or Blender) and Blender itself
  for clean-up. Any service's API, pricing, licence and output format are outside this repo's control:
  check the provider's current docs.

## 1. Prepare the mesh in Blender

Do this before the sanitizer; it cannot do these for you.

1. **Import** the generated mesh. Delete lights, cameras, ground planes, duplicate shells.
2. **Front view**: the model must be readable from the front alone. Rotate it so its face, pins, eye,
   or label point at the viewer in Blender's front view (looking along +Y, numpad 1). Blender's glTF
   exporter converts to glTF's Y-up, +Z-forward convention with its default "+Y Up" option; the
   sanitizer then applies `--yaw 180` so the model faces the game's −z. If the result comes out
   back-to-front, pass `--yaw 0`.
3. **Flatten the idea, not just the mesh**: remove anything that only reads from the side or back.
   The camera never sees it and it costs triangles.
4. **Decimate** to the budget with the Decimate modifier (Collapse), then apply it:
   actors under 3500 triangles, pickups a few hundred, rooms under 8000. Thin parts must stay thicker
   than about 0.035 world units (2 px at 58 px per unit) after scaling to game height.
5. **Colour boundaries should follow edges.** The sanitizer colours whole triangles. Where two colours
   meet in the texture, make sure an edge loop runs there (Knife, or separate the part), otherwise the
   boundary is jagged.
6. **Apply** all modifiers and transforms. Remove armatures and shape keys.
7. **Export** glTF Binary (`.glb`): include normals, UVs and materials; images as **PNG**; compression
   off (no Draco, no meshopt); animations off.

## 2. Run the sanitizer

```bash
node .kiro/skills/ai-mesh-pipeline/scripts/sanitize-glb.mjs --input raw.glb --report          # look first
node .kiro/skills/ai-mesh-pipeline/scripts/sanitize-glb.mjs --input raw.glb --output public/assets/models/<key>.glb --height <units>
```

| Option | Default | Meaning |
|---|---|---|
| `--input` | required | A self-contained `.glb` |
| `--output` | | Where to write. Omit with `--report` to only analyse |
| `--height` | keep source size | Final height in world units (vibecoder 1.6, minions 0.6 to 1.1, enemies 1.0 to 1.6, bosses 1.8 to 2.6, pickups 0.3 to 0.5, doors 1.4 to 1.9) |
| `--families` | `hardware,signal,glass,neutral` | Palette families a triangle may snap to. Add `malware` for enemies; use `human,neutral` for the vibecoder |
| `--max-zones` | 5 | Zones kept, by surface area. The rest fold into the nearest kept zone |
| `--max-tris` | 3500 | Budget. Over it is an error (it does not decimate) |
| `--yaw` | 180 | Degrees about y applied before fitting |
| `--squash` | off | If depth exceeds 60% of the wider of width and height, scale z down to fit. Without it a deep model is an error |

What it does, in order: parse the GLB; walk the default scene accumulating node matrices; for each
triangle compute a linear base colour (`baseColorFactor` × PNG `baseColorTexture` sampled at the
triangle's UV centre × `COLOR_0`) and convert it to sRGB; apply the yaw; scale to `--height`; move the
feet to y = 0 and centre x and z; optionally squash z; snap each triangle to the nearest zone
(comparing against each zone's three cel bands, so baked shading lands on the right zone); keep the
largest zones; weld vertices and write one primitive per zone with `POSITION`, `NORMAL` and indices,
a material `zone:<id>` (flat base colour, metallic 0, roughness 1, `extras.zone`), and a node
`extras.hauntedTerminal` block with the triangle count and zone shares.

What it drops: textures, images, samplers, UVs, tangents, every PBR value, emissive, animations, skins,
cameras, lights, node hierarchy.

What it refuses, with the fix:

| Message | Fix |
|---|---|
| `N triangles is over the budget` | Decimate in Blender |
| `depth is N% of the wider of width and height` | `--squash`, or flatten the model |
| `KHR_draco_mesh_compression / EXT_meshopt_compression is not supported` | Export without compression |
| `only self-contained .glb files are supported` | Export glTF Binary, not `.gltf` + `.bin` |
| `sparse accessors are not supported` | Re-export from Blender |

A texture that is not an embedded PNG (JPEG, WebP, KTX2) is not an error: it is ignored with a warning
and that material falls back to its base colour factor, which for AI meshes is usually white, so
everything snaps to one pale zone. Re-export with PNG textures.

## 3. Read the report

The output looks like this (an illustration of the format, not a real asset):

```
bug: 1840 triangles, w 0.92 h 1.0 d 0.55 (depth 55%), feet at y = 0
   58.1%  silicon         #2b2540  hardware
   27.4%  corruptMagenta  #ef476f  malware
    9.0%  solder          #adb5bd  hardware
    5.5%  malwareEye      #fff07c  malware
```

- Zone shares should look like 60 / 30 / 10. One zone at 95% means the texture was not read (see above)
  or the concept was monochrome.
- A zone you did not expect (a `lockRed` door, a `gold` enemy) is a concept problem: regenerate with
  the palette hexes in the prompt, or restrict `--families`.
- Emissive zones (`phosphor`, `dataCyan`, `powerAmber`, `lockRed`, `malwareEye`, `lantern`, `glass`)
  will glow in the game. They should be small.

## 4. Put the comic look back

[examples/load-comic-glb.ts](../examples/load-comic-glb.ts) shows the whole of it:
`GLTFLoader` → for each mesh, read the zone from `material.userData.zone` (glTF `extras`) or the
`zone:<id>` name → `createComicMaterial(zone.color, { emissive, opacity, ghost, halftone, stripes })`
from `src/shaders/comic-material.ts` → an ink shell from `inkShellGeometry(geometry, 0.028)` drawn
back-face in `INK` → `userData.assetKey` and `userData.zone` set as `buildModel()` does. The result
takes the same `uTime` / flash / lantern uniforms as any procedural model.

Wiring that loader into `src/renderer/comic-stage.ts` (an actor slot that prefers a GLB over the
procedural cast) does not exist yet. Treat it as a separate, reviewed renderer change.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Model shows its back | Wrong yaw. Try `--yaw 0` |
| Black blotches | Baked shadows snapped to `ink` / `silicon`. Regenerate the concept with flat lighting, or drop `neutral` from `--families` |
| Jagged colour edges | No edge loop at the colour boundary (step 1.5) |
| Ink outline has gaps or spikes | Non-manifold or duplicated shells; merge by distance in Blender |
| Looks like a toy next to procedural models | Too many small zones and too much depth. Lower `--max-zones`, use `--squash` |
