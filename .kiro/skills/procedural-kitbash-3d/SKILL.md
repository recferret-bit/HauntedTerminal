---
name: procedural-kitbash-3d
description: "[ASSET PCG] Build procedural 3D models as comic reliefs from the greeble kit: the vibecoder and System Hand, pickups (energy, RAM, SSD), doors (USB, Ethernet, HDMI, serial, firewall gate, loopback mirror, /dev/null, talking socket), props and items (file, crate, fuse, chip, capacitor, heatsink, fan, cables, CRT, tombstone) and the kit itself (pins, chips, fins, LEDs, port shells, screws, cables, traces, grilles, chains, padlocks). Use whenever you add, change or review `src/procgen/kit` or `src/procgen/archetypes/{vibecoder,pickups,doors,props}.ts`, or a model 'looks wrong', 'floats', 'is unreadable' or a new door, pickup or prop is needed."
---

# Procedural kitbash 3D

Read [haunted-art-direction](../haunted-art-direction/SKILL.md) first. It defines the world, the
palette and the projection; this skill is how to build a model that obeys it.

Enemies are built with [procedural-malware-3d](../procedural-malware-3d/SKILL.md) and rooms with
[procedural-rooms-3d](../procedural-rooms-3d/SKILL.md). Both use the same kit described here.

## The one idea: a model is a relief

The camera is orthographic, sits on −z and never moves around a model. So a model is a **drawing
with thickness**: design the front view on the XY plane, then give each shape a little depth so the
cel bands and the lightning flash have something to catch. Three consequences:

- **Depth is for layering, not for looking at.** Parts stack toward the camera in steps of 0.02 or
  more. Wherever a nearer part overlaps a farther one, the renderer draws an ink line. That line is
  your pen: a pocket, a bezel, a cavity are all "one more plate in front".
- **`extrude` is the main shape.** A 2D outline with thickness gives any silhouette for a few dozen
  triangles. Boxes, cylinders and tubes are the exceptions, see [shape-cookbook.md](./references/shape-cookbook.md).
- **World +x is screen-left.** Write `0.3 * SCREEN_RIGHT` instead of `-0.3` for anything asymmetric.

A model is plain data (`ModelSpec` in `src/procgen/core/types.ts`): named parts, each with a shape,
a palette **zone** (never a hex colour), a position and an optional `AnimTag`. Builders are pure
functions of a `seed`.

## Where things live

| Path | What |
|---|---|
| `src/procgen/kit/shapes.ts` | Outlines (`outlineRoundRect`, `outlineArch`, `outlineComb`, `outlineStroke`, ...), part constructors (`kitPlate`, `kitBox`, `kitDisc`, `kitRing`), list transforms (`mirrorX`, `offsetParts`, `prefixParts`, `tiltParts`, `animateParts`) |
| `src/procgen/kit/greebles.ts` | The hardware vocabulary, `greeble*()`. Re-exports `shapes.ts`, so import everything from here |
| `src/procgen/archetypes/vibecoder.ts` | `vibecoder.dev`, `vibecoder.hand` |
| `src/procgen/archetypes/pickups.ts` | `pickup.energy`, `pickup.ram`, `pickup.ssd` |
| `src/procgen/archetypes/doors.ts` | `door.usb` `.ethernet` `.hdmi` `.serial` `.firewall` `.loopback` `.devnull` `.socket` |
| `src/procgen/archetypes/props.ts` | `prop.file` `.tar` `.fuse` `.chip` `.capacitor` `.heatsink` `.fan` `.cables` `.crt` `.tombstone` |

References: [greeble-catalog.md](./references/greeble-catalog.md) (every greeble and its options),
[shape-cookbook.md](./references/shape-cookbook.md) (which shape for which form, winding, depth,
triangle costs). Worked example: [examples/prop-floppy.ts](./examples/prop-floppy.ts).

## Workflow

1. **Find the brief.** Ids, game keys and the one visual idea per model are in
   [world-lexicon.md](../haunted-art-direction/references/world-lexicon.md). A new model needs a row
   there first. Say in one sentence what it is in the computer and what shape sells it.
2. **Silhouette on XY.** Decide the outline that is recognisable as a black shape at 96 px:
   a USB port is a tall rounded rectangle with a half-filled mouth, a floppy is a square with one cut
   corner. Write it as a `Vec2[]`, usually with `outlineSymmetric` (half the points) or a ready outline.
3. **Parts, back to front.** Body plate first, then what sits on it, then decals and lights.
   Keep 6 to 40 parts and under 3500 triangles. Use greebles for hardware detail instead of
   hand-placing boxes; they already handle layering and naming.
4. **Zones, 60 / 30 / 10.** One dominant zone, one secondary, accents and light for the rest; at most
   five zones plus ink. Family rules are enforced: `human` zones only on the vibecoder and the hand,
   `malware` zones never here, `signal` zones only for light that means something.
5. **Ground it.** Feet at `y = 0`. Bevels grow an outline by their size, so lift a bevelled base
   part by its bevel. Pickups and hanging things carry `tags: ['hover']` instead.
6. **Sockets.** `label` (name tag, above the top), `fx` (where sparks spawn, in front of the centre),
   plus the category's own: `lock` on doors, `bubble` on things that talk, `hand` / `lantern` on the vibecoder.
7. **Anim tags.** Only what the brief asks for (table below). Parts that move as one limb share the
   same `pivot`, `phase` and `amp`. A part has one tag, so a bobbing body and a pulsing light are
   different parts. Motion itself belongs to [procedural-animation-3d](../procedural-animation-3d/SKILL.md).
8. **Register** with `ModelCatalog.register({ id, category, label, lore, gameKey?, build })` at the
   bottom of the archetype file. `src/procgen/index.ts` already imports the four files above.
9. **Render and look.** From the project root:
   ```
   node scripts/harness/render-sheet.mjs door.usb pickup.ram --views --out scripts/harness/out/mine.png
   ```
   Open the PNG with the Read tool. The big picture shows the drawing; the small one in the cell's
   bottom-left corner is the size the player sees. If the small one is mush, simplify: fewer, bigger
   shapes, `outline: false` on details, more contrast between neighbours. `--views` adds side and top
   views to check depth. `--seed n` shows a variation.
10. **Validate.**
    ```
    node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs door.usb --seeds 8 --strict
    ```
    It checks floating and buried parts, grounding, size ranges, palette families, zone count and
    thin features, and tells you the fix. See [model-geometry-validator](../model-geometry-validator/SKILL.md).
    Zero errors and zero warnings across seeds before you stop.
11. **Storybook.** `npm run dev`, open `/storybook.html`: the same model under the real comic shader,
    pixel-art and CRT passes, animated. This is the only place ink shells and animation are real.
12. `npm run procgen:check` must stay green.

## Category rules

| Category | Size | Must have | Must not |
|---|---|---|---|
| `vibecoder` | `vibecoder.dev` 1.6 tall | `human` zones; round, soft outlines (large corner radii, bevels 0.02 to 0.03); legs tagged `legWalk` with phases 0 and 0.5 and the hip as pivot, the free arm `armSwing`; lantern on the screen-right; sockets `bubble`, `hand`, `lantern`, `fx` | Hardware or malware zones, sharp corners |
| `pickup` | 0.3 to 0.5, centred near y = 0.5 | `tags: ['hover']`; exactly one `signal` zone on a small part with `pulse`; every other part `bob` with the same tag (`animateParts`); a silhouette that says what you gain | Detail under 2 px, a second glowing zone |
| `door` | 0.7 to 1.1 wide, 1.4 to 1.9 tall | A shell (`solder`, `heatsink` or `plastic`), visible contacts (`gold`), a lamp part named exactly `led` (the game recolours it: `lockRed` locked, `powerAmber` busy, `phosphor` open), a `lock` socket, a base that touches y = 0 | Malware zones; glow other than LEDs |
| `prop` | Items 0.3 to 0.9, set dressing up to ~1.3 | Feet at y = 0 (or `hover` + `wall` for things that hang); low contrast for set dressing so actors pop | Any `signal` zone: props do not glow. Use `glass` sparingly |

Shared rules that the validator cannot see:

- **The vibecoder is the only warm round thing.** Hardware is rectangles, chamfers and combs. If a door
  looks friendly, square it off.
- **Say the function with geometry.** A chip shows legs, a port shows contacts, a fan shows blades.
  A flat one-colour plate is a placeholder.
- **Dark on dark disappears.** `silicon` and `rubber` are close to the room background. Give a dark
  body a light neighbour (label, legs, caps) to carry the silhouette.
- **Names matter.** Part names are unique and role words drive checks: `led`, `eye`, `leg`, `pin`,
  `lock`, `blade`. Do not call a chip's legs `leg` (use `pins`), or a lamp bezel anything ending in `led`.
- **Seed is taste, not identity.** Chip count, lean angle, label lines: yes. Shape of the model: no.
- **Textures are optional.** A part may name a `texture` id (`tex.pcb-traces`, `tex.chip-label`, ...);
  unknown ids are ignored. Render with and without and keep it only if the small thumbnail is not worse.

## Adding a greeble

Add one when the same group of parts appears in a second model.

1. Write `export function greebleThing(o: ThingOptions): PartSpec[]` in `src/procgen/kit/greebles.ts`.
   Options extend `GreebleBase` (`name`, `pos`). `pos` is the mount point: x, y centre and the z of
   the surface it sits on. Use the file's `mount()` / `face()` helpers so it rises toward −z and sinks
   0.008 into the surface.
2. Name parts `${o.name}.<role>`. Zones are options with hardware defaults. No randomness: take
   numbers, let the archetype own the `Rng`.
3. Prefer one comb-shaped extrude over many boxes (see `greebleContactTeeth`). Count triangles.
4. Start the export name with `greeble` (names must not collide across `src/procgen`).
5. Add a row to [greeble-catalog.md](./references/greeble-catalog.md), use it in a model, render, validate.

## Common failures

| Symptom | Cause and fix |
|---|---|
| Model is mirrored | +x is screen-left. Use `SCREEN_LEFT` / `SCREEN_RIGHT`, or draw in screen space and `outlineFlipX` |
| A detail is a black blob | Ink shell on a part under ~0.07 units. Set `outline: false`, or merge into a comb |
| No line between two layers | Less than 0.012 apart in z. Step layers by 0.02 or more |
| `minY -0.012` | Bevel grew the base outline. Lift the part by its bevel |
| Triangle count jumped | `kitBox` with `bevel` costs 300 triangles. Use `kitPlate(outlineRoundRect(...))` with `bevel` |
| `HIDDEN_PART` / `BURIED_PART` | A part fully behind or inside another. Move it to the −z side or delete it |
| Glass has no outline | Translucent zones (`glass`, `ice`, `ghostViolet`) never get ink. Put a frame part behind them |
