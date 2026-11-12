# Shape cookbook

How to get common forms out of `ShapeSpec` (`src/procgen/core/types.ts`) for a camera that only
ever sees the front. Helpers named here are in `src/procgen/kit/shapes.ts` and are re-exported by
`src/procgen/kit/greebles.ts`.

## Axes, once

- y is up, feet at y = 0.
- The model **faces −z**. "In front" means a smaller z. Layer toward the camera.
- **World +x is screen-left.** A point at x = +0.3 appears on the left of the picture. Multiply by
  `SCREEN_LEFT` (1) or `SCREEN_RIGHT` (−1) so the code says what you mean, or draw an outline in
  screen coordinates (+x right) and pass it through `outlineFlipX`.
- Rotations are Euler XYZ radians. A positive z rotation is counter-clockwise in model space, which
  is **clockwise on screen**.
- One fixed light shines from above and toward the camera (`LIGHT` in `src/procgen/geometry/raster-shade.ts`).
  Faces that look at the camera or up are in the lit band, faces that look down are in shadow, and
  the two sides of a box land in different bands.

## Which shape

| You want | Use | Why |
|---|---|---|
| Any flat form with a silhouette: bodies, shells, plates, limbs, labels, blades | `extrude` via `kitPlate(name, outline, depth, zone, pos)` | The outline is exactly what the player sees. Cheapest and most controllable. |
| A slab whose top and sides matter (sills, pallets, straps, pins) | `box` via `kitBox` | Six faces give three cel bands for free. |
| A can, pillar or pipe standing up | `cylinder` (axis y) | Smooth normals give vertical lit / mid / shadow bands: it reads as round. |
| A disc, lens, knob, hole or lamp facing the camera | `kitDisc` (a cylinder turned by `FACE_CAMERA`) | A sphere costs 7 times more and looks the same from the front. |
| A ring with a real hole: drain, lantern handle, chain link | `kitRing` (a `lathe` washer turned by `FACE_CAMERA`) | `extrude` cannot have holes; `torus` costs 320 triangles. |
| A round cable in 3D, a tentacle | `tube` via `greebleCable` | Follows a smooth path. ~220 triangles for three points. |
| A flat cable, strap, crack, trace, arm | `extrude` of `outlineStroke(path, width)` | A ribbon along a polyline, mitred corners, a few dozen triangles. |
| A turned profile: bottle, bell, finial | `lathe` with a `[radius, y]` profile | Only when the roundness shows as shading; otherwise extrude its silhouette. |
| A soft blob (vibecoder only) | `extrude` with a round outline and `bevel` 0.02 to 0.03, or `capsule` / `sphere` | Bevel gives the soft cel edge without the triangle cost. |

Rule of thumb: if you can describe it as "this outline, this thick", it is an `extrude`.

## Outlines

All outline helpers return a `Vec2[]` centred on (0, 0) unless noted.

| Helper | Form |
|---|---|
| `outlineRect(w, h)` | Rectangle |
| `outlineRoundRect(w, h, r, seg = 3)` | Rounded rectangle; `r >= min(w, h) / 2` gives a stadium |
| `outlineChamferRect(w, h, c)` | 45-degree cut corners: the hardware look |
| `outlineEllipse(rx, ry = rx, seg = 16)` | Circle or ellipse |
| `outlineArch(w, h, seg = 8, pointed = 0)` | Doorway: flat bottom, round top; `pointed` makes it gothic |
| `outlineTrapezoid(wBottom, wTop, h)` | Symmetric trapezoid |
| `outlineBolt(w, h)` | Lightning bolt |
| `outlineComb(width, count, toothH, barH, duty)` | Bar with teeth hanging below it (bar spans y 0..barH, teeth y −toothH..0) |
| `outlineStroke(points, width)` | A polyline turned into a ribbon |
| `sagPath(a, b, sag, seg)` | Points along a hanging line, to feed `outlineStroke` |
| `outlineSymmetric(half)` | Full outline from its x ≥ 0 half, listed **bottom to top** |
| `outlineTransform(pts, { scale, rot, move })` | Scale, then rotate, then move |
| `outlineFlipX(pts)` | Mirror left-right |

Rules for hand-written outlines:

- **Winding does not matter** (Three.js fixes it), but the outline must be **simple**: no edge may
  cross another. A crossed outline triangulates into garbage with no error.
- Do not repeat the first point at the end.
- Concave is fine (combs, bolts, pinwheels). Holes are not possible: draw the hole as a dark plate
  on top (`greeblePortShell`) or use `kitRing`.
- Curves are polylines. 3 segments per corner and 12 to 18 per circle are enough at 58 px per unit.
- `bevel` grows the outline by its size on every side and rounds the front and back edges.
  Budget for it: a base plate with `bevel: 0.012` reaches 0.012 below its outline.

## Depth

- Total depth (z) at most ~60% of the wider of width and height. Typical: body 0.1 to 0.3, plates on
  top 0.02 to 0.05, decals 0.01.
- **Step layers by 0.02 or more.** The renderer draws an ink crease where a nearer outlined part
  overlaps a farther one by more than 0.012 in depth. Less than that and two plates merge into one
  flat colour.
- **Overlap in z as well.** A plate must touch or sink into the part behind it (greebles sink 0.008),
  or the validator reports `FLOATING_PART` / `DEPTH_GAP`.
- Never put two faces at exactly the same z: they z-fight in the real renderer.
- Depth is invisible from the front. Check it with `node scripts/harness/render-sheet.mjs <id> --views`.

## Ink

Every part gets an ink shell 0.028 units thick (1.6 px) unless `outline: false`.

- Turn it off for anything smaller than ~0.07 units across, for emissive lamps, and for decals
  (text lines, slots, holes, cracks). Otherwise the detail becomes a black blob.
- Gaps narrower than ~0.06 between two outlined parts fill with ink. That is fine for heatsink fins
  (it reads as a drawn line) and wrong for anything that should show the background.
- Translucent zones (`glass`, `ice`, `ghostViolet`) never get a shell. Give them a frame.
- A part in the `ink` zone is a hole or a line. It needs `outline: false`.

## Size at game scale

58 px per world unit: 0.035 units is 2 px, 0.1 units is 6 px. A pickup is ~25 px tall. Text lines,
contact teeth and LED lamps need at least 2 px in their thin direction and should be few. Count what
the thumbnail in the render sheet shows, not what the big render shows.

## Triangle costs

| Shape | Triangles |
|---|---|
| `extrude`, n-point outline | ~4n (~6n with `bevel`) |
| `box` | 12 |
| `box` with `bevel` | **300**. Prefer `kitPlate(outlineRoundRect(...), ..., { bevel })` |
| `cylinder`, 12 sides | 48 (`kitDisc` default) |
| `kitRing`, 20 sides | 160 |
| `capsule` | ~180 |
| `tube`, 3 path points | ~220 |
| `torus` | 320 |
| `sphere` | 352 |

Budget: 6 to 40 parts and under 3500 triangles per actor. The render sheet prints both.

## Recipes

**A plate with a relief detail and an ink line around it**

```ts
kitPlate('torso', outlineSymmetric([[0.19, 0], [0.25, 0.14], [0.27, 0.42], [0.17, 0.555], [0.06, 0.57]]), 0.28, 'hoodie', [0, 0.56, 0], { bevel: 0.03 }),
// Same zone, 0.01 in front of the torso face (z = −0.14): the ink crease draws the pocket.
kitPlate('pocket', outlineSymmetric([[0.15, -0.07], [0.165, -0.03], [0.1, 0.07]]), 0.04, 'hoodie', [0, 0.74, -0.15]),
```

**An asymmetric outline, written for the screen**

```ts
const R = SCREEN_RIGHT;
// Cut corner at the top screen-right.
const card: Vec2[] = [[-0.16 * R, -0.2], [0.16 * R, -0.2], [0.16 * R, 0.1], [0.06 * R, 0.2], [-0.16 * R, 0.2]];
```

**Spinning blades as one part**

```ts
const wheel: Vec2[] = [];
const step = (Math.PI * 2) / blades;
const polar = (a: number, r: number): Vec2 => [Math.cos(a) * r, Math.sin(a) * r];
for (let i = 0; i < blades; i++) {
  const a = i * step;
  wheel.push(polar(a, hub), polar(a + step * 0.12, R), polar(a + step * 0.5, R), polar(a + step * 0.86, R * 0.92), polar(a + step * 0.62, hub));
}
kitPlate('blades', wheel, 0.03, 'heatsink', [0, cy, -0.115], { anim: { type: 'spin', axis: 'z', speed: 1.4, pivot: [0, cy, -0.115] } });
```

**A limb that walks**: every part of the leg carries the same tag, pivot at the hip.

```ts
const walk: AnimTag = { type: 'legWalk', axis: 'x', amp: 0.45, phase: 0, pivot: [0.115, 0.62, 0] };
kitPlate('leg.l', legOutline, 0.18, 'denim', [0.115, 0.36, 0], { anim: walk });
kitPlate('sneaker.l', shoeOutline, 0.24, 'paper', [0.115, 0.07, -0.03], { anim: walk });
```

**A leaning object that stays on the floor**: build it upright with its base on y = 0, then tilt
around the bottom corner it leans toward.

```ts
parts = tiltParts(parts, lean, [lean > 0 ? -W / 2 : W / 2, 0]);
```
