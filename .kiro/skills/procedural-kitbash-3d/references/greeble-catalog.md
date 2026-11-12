# Greeble catalog

Every greeble in `src/procgen/kit/greebles.ts`. Each is a pure function `(options) => PartSpec[]`;
spread the result into a model's `parts`. Import from `'../kit/greebles.js'`.

## Shared conventions

- `name`: prefix for the part names the greeble creates. Must be unique within the model.
- `pos: [x, y, z]`: the **mount point**. x and y are the centre of the greeble; z is the surface it
  sits on. The greeble rises toward the camera (−z) from there and sinks `GREEBLE_SINK` (0.008) into
  the surface, so it never floats and never z-fights.
- Zones are optional and default to the hardware zone the real part is made of.
- Directions (`dir`, "left", "right") are **screen** directions. Screen-left is world +x.
- No greeble is random. Variation comes from the numbers the archetype passes in.

To stack a greeble on a plate, mount it on the plate's front face:
`frontZ = plateCentreZ - plateDepth / 2`.

## Pins and contacts

| Function | Options (defaults) | Parts | Notes |
|---|---|---|---|
| `greeblePinRow` | `count`, `pitch`, `size` ([0.04, 0.1]), `depth` (0.04), `zone` (`gold`), `axis` (`'x'` or `'y'`) | `${name}.pin0..n` | One box per pin, 12 triangles each. Use when pins are big or few (the four USB contacts). |
| `greebleContactTeeth` | `width`, `count`, `toothLength`, `bar` (0.03), `depth` (0.03), `zone` (`gold`), `dir` (`'down'`, `'up'`, `'left'`, `'right'`), `duty` (0.55) | `${name}.pins` | A whole comb in **one** part: edge connectors, chip legs, SATA and HDMI contacts. `pos` is the centre of the comb's bounding box. Hide the bar behind the body and let only the teeth show; teeth shorter than ~0.06 vanish under the body's ink. |

## Chips and heatsinks

| Function | Options (defaults) | Parts | Notes |
|---|---|---|---|
| `greebleDipChip` | `width`, `height`, `depth` (0.08), `legs` (4 per side), `legLength` (0.06), `legSides` (`'bottom'`, `'x'`, `'y'`, `'none'`), `zone` (`silicon`), `legZone` (`solder`), `notch` (true), `marks` (2), `markZone` (`solder`), `texture` | `${name}.body`, `${name}.pins.a`, `.pins.b`, `${name}.notch`, `${name}.mark0..` | `'bottom'`: one row under the body, the chip seen from its long side, standing on its legs (set `pos[1] = legLength + height / 2` to stand it on the floor). `'x'`: legs on both screen sides, a chip seen from above or stood on end. |
| `greebleHeatsinkFins` | `width`, `height`, `depth` (0.2), `fins` (6), `base` (0.06), `zone` (`heatsink`), `style` (`'comb'` or `'ribs'`), `heights` (per-fin 0..1, comb only), `texture` | comb: `${name}.fins`. ribs: `${name}.plate`, `${name}.rib0..` | `comb`: fins stand up and read as a comb silhouette, one part; `heights` turns a radiator into a pipe organ. `ribs`: a plate facing the camera with vertical ribs on it. `pos` is the centre of the bounding box. |

## Lights

| Function | Options (defaults) | Parts | Notes |
|---|---|---|---|
| `greebleLed` | `name` (the lamp's exact part name), `radius` (0.04), `zone` (`phosphor`), `bezelZone` (`silicon`, or `null` for none), `square` (false), `blink` (cycles per second), `anim` (any `AnimTag`, overrides `blink`) | the lamp, named `name`; the bezel, named after the stem (`led` → `bezel`, `link.led` → `link.bezel`) | The lamp is flat, emissive and has `outline: false`; the bezel carries the ink. A door's status light must be named exactly `led`. Zones: `phosphor` open or ok, `powerAmber` busy, `lockRed` locked, `dataCyan` data. Lamps under radius 0.025 are below 3 px. |

## Ports, screws, plates

| Function | Options (defaults) | Parts | Notes |
|---|---|---|---|
| `greeblePortShell` | `width`, `height`, `depth` (0.24), `wall` (0.07), `zone` (`solder`), `cavityZone` (`silicon`), `radius` (0.04), `outline`, `cavityOutline` | `${name}.shell`, `${name}.cavity` | The body of every plug-shaped door. Extrudes cannot have holes, so the mouth is a dark plate on the shell's face. Pass `cavityOutline` (centred on the shell) for a shaped or off-centre mouth, `outline` for a non-rectangular shell. |
| `greeblePortCavityZ(z, depth)` | same `z` and `depth` as the shell | a number | The z to mount tongues and contacts on, inside the mouth. |
| `greebleScrew` | `radius` (0.045), `zone` (`solder`), `style` (`'slot'`, `'cross'`, `'thumb'`), `angle` (0.6) | `${name}.head`, `${name}.slot`, `.slot2` (cross), `.cap` (thumb) | Vary `angle` per screw. `thumb` is the tall knurled screw of a serial port. |
| `greebleLabelPlate` | `width`, `height`, `zone` (`plastic`), `lines` (3), `lineZone` (`ink`), `depth` (0.02), `texture` | `${name}.plate`, `${name}.line0..` | A sticker with ink bars for text, ragged right. Lines need ~0.035 of height each to survive. |
| `greeblePanel` | `width`, `height`, `zone` (required), `depth` (0.03), `radius`, `texture` | `name` | One plain plate: "one more layer of relief". |

## Grilles

| Function | Options (defaults) | Parts | Notes |
|---|---|---|---|
| `greebleVentGrille` | `width`, `height`, `slats` (4), `zone` (`solder`), `slotZone` (`ink`), `vertical` (false), `plate` (true), `depth` (0.03) | `${name}.plate`, `${name}.slot0..` | `plate: false` cuts the slots straight into whatever is underneath. |
| `greebleSpeakerGrille` | `radius`, `slats` (5), `zone` (`solder`), `slotZone` (`ink`), `aspect` (1), `depth` (0.03) | `${name}.plate`, `${name}.slot0..` | Round, slots follow the circle. `aspect` under 1 squashes it into a mouth. |

## Cables and traces

| Function | Options (defaults) | Parts | Notes |
|---|---|---|---|
| `greebleCable` | `from`, `to` (3D points), `sag` (0.1), `radius` (0.03), `zone` (`rubber`) | `name` | A round cable as one `tube`, ~220 triangles. It takes no `pos`: `from` is the part position. Negative `sag` bows it upward. |
| `greebleRibbonCable` | `from`, `to` (2D points), `z`, `width` (0.14), `sag` (0.12), `zone` (`solder`), `markZone` (`copper`, or `null`), `plugs` (false), `depth` (0.03) | `${name}.band`, `${name}.mark`, `${name}.plug.a`, `.plug.b` | A flat ribbon seen face-on, ~60 triangles. The mark is the pin-1 strand. Drape several with growing `sag` for a cobweb. |
| `greebleTrace` | `points` (2D polyline relative to `pos`), `width` (0.035), `zone` (`gold`), `depth` (0.015), `pads` (`'end'`, `'both'`, `'none'`), `outline` (false) | `${name}.trace`, `${name}.pad.a`, `.pad.b` | Keep runs at 0, 45 and 90 degrees: that is what makes it a PCB trace. |

## Chains and locks

| Function | Options (defaults) | Parts | Notes |
|---|---|---|---|
| `greebleChain` | `from`, `to` (2D points), `z`, `links` (6), `sag` (0), `linkRadius` (fitted), `zone` (`solder`) | `${name}.link0..` | Oval rings alternate with edge-on links. ~80 triangles per ring; keep `linkRadius` at 0.045 or more. |
| `greeblePadlock` | `width` (0.24), `height` (0.2), `depth` (0.1), `zone` (`gold`), `shackleZone` (`solder`), `keyholeZone` (`ink`), `open` (false) | `${name}.shackle`, `${name}.body`, `${name}.keyhole`, `${name}.keyslot` | `pos` is the centre of the body; the shackle adds ~60% of the height on top. |

## Using them together

```ts
import { greebleLed, greeblePortCavityZ, greeblePortShell, greeblePinRow, kitPlate, outlineRoundRect } from '../kit/greebles.js';

const D = 0.26;            // shell depth
const back = D / 2;        // the shell is centred on z = 0, so it is mounted on z = +D/2
const inside = greeblePortCavityZ(back, D);
const parts = [
  ...greeblePortShell({ name: 'port', pos: [0, 0.86, back], width: 0.8, height: 1.56, depth: D }),
  kitPlate('tongue', outlineRoundRect(0.25, 1.12, 0.02, 1), 0.05, 'plastic', [0.14, 0.86, inside - 0.02]),
  ...greeblePinRow({ name: 'contact', pos: [0.14, 0.86, inside - 0.045], count: 4, pitch: 0.26, size: [0.13, 0.15], depth: 0.02, axis: 'y' }),
  ...greebleLed({ name: 'led', pos: [0, 1.52, -back], zone: 'phosphor' }),
];
```

The real version is `buildUsb` in `src/procgen/archetypes/doors.ts`.

## Helpers that work on part lists (`src/procgen/kit/shapes.ts`)

| Function | What it does |
|---|---|
| `offsetParts(parts, [dx, dy, dz])` | Moves parts and their animation pivots. |
| `prefixParts(parts, prefix)` | Renames to `prefix.name`: use a greeble twice in one model. |
| `mirrorX(parts, rename?)` | Returns mirrored **copies** across x = 0 (outlines, tube paths, rotations and pivots flipped). Default rename swaps a `.l` / `.r` suffix, else appends `.m`. |
| `tiltParts(parts, angle, pivot?)` | Rotates a finished group in the page plane. Positive is counter-clockwise in model space. |
| `animateParts(parts, tag)` | Gives every part without a tag the same one: a pickup that bobs as one piece. |
