# Checks, thresholds and fixes

Source of truth: `MODEL_RULES` in `src/procgen/validate/model/rules.ts`. This file mirrors it; change
both together and add a case to `scripts/self-test.mjs`.

Units: lengths are world units (the hero is 1.6 tall). "px" is pixels at game scale, 58 px per world
unit. Model space: y up, feet at `y = 0`, the model faces −z, the camera looks along +z.

Severity: **E** error (fails the model), **W** warning (fails only under `--strict`), **I** info.

## Structure

Runs first. If a shape cannot be baked, the geometry and read checks are skipped.

| Code | Sev | Rule | Why | Fix |
|---|---|---|---|---|
| `BAD_ID` | E | `spec.id` matches `<category>.<name>`, name `[a-z][a-z0-9_]*`; category is known; the catalog entry and the spec agree on category | Ids are how the game, the manifest and the harness find a model | Rename the id or fix the category |
| `EMPTY_MODEL` | E | At least one part | Nothing to draw | Return parts from `build()` |
| `DUPLICATE_PART_NAME` | E | Part names are unique | Animation, FX and this validator address parts by name | Suffix repeats: `pin_0`, `pin_1` |
| `NON_FINITE` | E | `pos`, `rot`, `scale`, sockets are finite 3-vectors | NaN positions bake to an invisible or exploded mesh | Look for a division by zero or an undefined value in the builder |
| `DEGENERATE_SHAPE` | E | Sizes, radii, heights, depths > 0; extrude outline ≥ 3 points with area; tube path ≥ 2 distinct points; lathe profile ≥ 2 points with a radius; no zero scale; every part has a name | A zero-size shape bakes to nothing | Fix the shape parameters |
| `UNKNOWN_ZONE` | E | `part.zone` is a key of `ZONES` | One palette. A hex or a made-up zone has no material | Use a zone from `src/procgen/core/palette.ts` |
| `UNKNOWN_TEXTURE` | W | `part.texture` is registered in `TextureCatalog` | The part silently renders untextured | Use an id `TextureCatalog.list()` returns, or drop the field |
| `PART_BUDGET` | E / W | Parts per category, min..max: hero, malware, boss 6..40; door 5..40; pickup 4..40; prop 3..40; room 4..80; fx 1..40. Over the max is an error, under the min a warning | One mesh per part: draw calls. Too few parts means no detail to read | Merge repeats into one comb-shaped extrude; or add the details that say what it is |
| `TRI_BUDGET` | E | Triangles ≤ 3500 (rooms ≤ 8000) | Dozens of actors share a panel | Spheres cost 352 triangles, bevelled boxes about 300. Use extrudes and plain boxes, lower `sides` |
| `BUILD_FAILED` | E | `ModelCatalog.build(id, seed)` does not throw (`validateModel` only) | A builder that throws for one seed crashes the room that spawns it | Fix the builder for every seed |
| `BAKE_FAILED` | E | `bakeModel(spec)` does not throw | Safety net behind `DEGENERATE_SHAPE` | Inspect the part named in the message |

## Grounding, size, depth

| Code | Sev | Rule | Why | Fix |
|---|---|---|---|---|
| `NOT_GROUNDED` | E | Lowest point within ±0.03 of `y = 0`. Rooms: lowest point ≤ 0.03 (a floor may extend below). Skipped for tags `hover` and `wall` | Actors are placed by their feet on the panel's floor line | Shift every `pos.y` by the amount in the message, or tag `hover` / `wall` |
| `HOVER_BAND` | W | Tagged `hover`: lowest point between 0 and 1.6. Pickups: at least 0.08 above the floor | A pickup lying on the floor does not read as a pickup; a model above 1.6 leaves the band where actors live | Centre pickups around `y = 0.5` |
| `SIZE_RANGE` | W | ±5% tolerance. `hero.dev` height 1.6. Malware: larger of width and height 0.6..1.6. Boss height 1.8..2.6. Pickup: larger of width and height 0.3..0.5. Door height 1.4..1.9, width 0.7..1.1 | Scale is the threat read: minions are smaller than the hero, bosses tower | Scale sizes and positions by the factor in the message |
| `TOO_DEEP` | W | Depth (z extent) ≤ 60% of max(width, height). Rooms: depth ≤ 3 | The camera never sees depth; it only costs triangles and makes parts poke through neighbours | Thin the deepest parts or pull them toward `z = 0` |

## Contacts

Distances are measured between the triangles of two parts (boxes are only a broad phase), in
**contact space**: z is multiplied by `zWeight = 0.2`, because the fixed front camera cannot see a
gap in depth.

| Code | Sev | Rule | Why | Fix |
|---|---|---|---|---|
| `FLOATING_PART` | E | Every part belongs to the connected body. Two parts touch when their surfaces are within 0.004 (0.02 along z), cross, or one is inside the other. A group farther than 0.06 (0.3 along z) from the body floats | Reads as a broken model, and the part will not follow the body's logic | Overlap it with its support by ~0.01 or add a connecting part. Meant to fly? See the opt-in below |
| `HAIRLINE_GAP` | W | A group 0.004..0.06 from the body, with a gap visible from the front | Each part's ink shell is 0.028 thick, so the gap fills with ink and looks attached, but a pose or a seed will open it | Move the part by the distance in the message plus 0.01 |
| `DEPTH_GAP` | I | Same band, but the two parts overlap in the front view: the gap is along z only | Invisible to the camera. Reported so you know the parts do not really touch | Optional: move it in z until it overlaps |
| `TUBE_ONLY_SUPPORT` | I | A part connected to the body only through `tube` parts | A cable cannot hold a rigid part. Fine for a plug, a padlock on a chain, a frayed end | If it should be rigid, overlap it with a solid part |
| `BURIED_PART` | E (W if the part is animated) | A part entirely inside one other closed, opaque part without touching its surface | Paid for, never drawn from any side | Move it so it breaks the −z surface, or delete it |
| `COPLANAR_ZFIGHT` | E | Two parts of different zone (or texture) with camera-facing faces (normal z < −0.05) in the same plane (within 0.0005, normals within 1.8°), overlapping by ≥ 6 px | The depth buffer cannot order them: they flicker or stitch | Offset one by ≥ 0.01 in z or change its depth |

Notes:
- **Opt-in for detached parts**: a group is exempt from `FLOATING_PART` / `HAIRLINE_GAP` when one of its
  parts has an `orbit`, `bob` or `spin` anim **and** (its name contains `float`, `orbit` or `satellite`,
  **or** the model has the tag `detached`).
- The body is the connected group with the largest surface area. Loose groups are attached
  nearest-first, so one missing link gives one issue that names the two parts to join.
- Closed shapes (for the inside test): box, cylinder, capsule, sphere, cone, extrude, a full torus, a
  lathe whose profile starts and ends on the axis. Tubes and open arcs are never containers.
- A part inside a translucent zone (`glass`, `ice`, `ghostViolet`) is not buried: it shows through.
- Coplanar faces of the same zone and texture, faces that look away from the camera, and faces that
  point at each other (a flush contact) are harmless and not reported.

## Front read

Measured on `rasterizeModel(spec, { view: 'front' })` at 3× game scale (less for rooms) and converted
back to game pixels. Opaque parts are visible through translucent ones; colour shares use the nearest
surface, so a glass screen owns its pixels.

| Code | Sev | Rule | Why | Fix |
|---|---|---|---|---|
| `HIDDEN_PART` | W | A part that would cover ≥ 4 px alone shows < 1 px. Skipped for parts with a moving anim and for parts already `BURIED_PART` | Costs triangles, never seen | Bring it to the −z side, let it stick out of the silhouette, or delete it |
| `THIN_FEATURE` | W | An outlined part whose thickest stroke is under 2 px (0.034 units; 0.3 px measurement slack). One issue per model lists the parts. Skipped for `outline: false` | The ink shell adds 1.6 px per side and the pixel-art pass quantizes: a thin part becomes a black line | Make it ≥ 0.035 units thick, or `outline: false` for decals and lights |
| `SILHOUETTE_BOX` | W | hero, malware, boss: silhouette area / bounding-box area ≥ 88% | As a black shape it is a rectangle | Horns, limbs, a notch, an asymmetric lean |
| `SILHOUETTE_BLOB` | W | 1 − silhouette area / convex-hull area: hero ≥ 6%, malware and boss ≥ 10% | A convex outline is a blob; enemies are sharp and asymmetric | Parts that stick out with gaps between them |
| `TOO_MANY_ZONES` | W | ≤ 5 zones (rooms ≤ 8), not counting `ink`, `paper` and lights (emissive ≥ 0.3) | Flat colour reads by role; more than five roles is noise | Merge the smallest zones into a neighbour of the same family |
| `PALETTE_FLAT` | W | Largest zone ≤ 80% of visible pixels. Not for rooms; not when the largest zone is `ink` or `paper` | 60/30/10: a model in one colour has no form | Give a large sub-shape a second zone |
| `PALETTE_PATCHWORK` | W | Largest zone ≥ 35%. Not for rooms | No dominant colour: it reads as confetti | Move mid-sized parts onto the body zone |
| `NO_ACCENT` | W | Zones other than the two largest hold ≥ 1% together. Not for rooms and props | The 10 of 60/30/10 is what the eye lands on | Add or enlarge a small high-contrast detail on the −z face |
| `TOO_MUCH_GLOW` | W | Emissive zones (≥ 0.3, `glass` family excluded) ≤ 35% of visible pixels. Not for pickups | If everything glows, nothing says "look here" | Move large glowing surfaces to a non-emissive zone |
| `LIGHT_NOT_VISIBLE` | E | The required light shows ≥ 4 px: `malwareEye` (malware, boss), a signal zone (pickup, door), `lantern` (`hero.dev`) | The light is the gameplay read; hidden behind the body it does not exist | Move it to the −z face, at least 0.05 units across |

## Palette families and category contracts

Skipped by `--geometry-only`.

| Code | Sev | Rule | Why | Fix |
|---|---|---|---|---|
| `HUMAN_ZONE_MISUSE` | E | `skin` `hoodie` `denim` `hair` `lantern` only in category `hero` and in `room.outro` | Warm colour means "the hero" | Use `plastic`, `copper`, `gold`, `powerAmber` |
| `MALWARE_ZONE_MISUSE` | E | Malware-family zones only in `malware` and `boss` | Magenta and violet mean "this will hurt you" | Use hardware, signal or glass zones |
| `MALWARE_NO_CORRUPTION` | E | malware, boss: at least one part in a malware zone other than `malwareEye` | Without it the enemy is plain hardware | Put the growths, spikes, claws in a corruption zone |
| `MALWARE_NO_EYE` | E | malware, boss: at least one `malwareEye` part | The one focal light every enemy has | Add an eye, core or keyhole on the −z face |
| `MALWARE_EYE_COUNT` | W | `malwareEye` parts closer than 0.1 form one cluster; at most 2 clusters (one eye, or a pair) | More lights dilute the focal point | Move the extra glow to `toxicGreen` or `corruptMagenta` |
| `MALWARE_EYE_NAME` | W | One `malwareEye` part has `eye`, `core` or `keyhole` in its name | Animation and FX find it by name | Rename the focal part |
| `MALWARE_NO_JITTER` | E | malware, boss: at least one part with `anim.type: 'jitter'` | The glitch twitch is the malware signature | Add it to a corrupted part, not the whole body |
| `MISSING_SOCKET` | E | malware, boss: sockets `bubble`, `eye`, `fx`. door: socket `lock` | The game attaches speech bubbles, hit FX and the lock there | Add them to `spec.sockets` in model space |
| `PICKUP_NOT_HOVER` | E | pickup: tag `hover` | Pickups float | `tags: ['hover']`, centred around `y = 0.5` |
| `PICKUP_NO_SIGNAL` | E | pickup: a part in a signal zone | Glow means "take me" | Add an LED, core or notch light |
| `PICKUP_NOT_ANIMATED` | E | pickup: a part with `bob`, `spin` or `pulse` | Pickups always move | `bob` on every part, `spin` or `pulse` on the light |
| `DOOR_NO_LED` | E | door: a part whose name contains `led` in a signal zone | The LED shows locked / busy / open and the game recolours it by name | Add a small `led` part in `lockRed`, `outline: false` |
| `HERO_NO_WALK_TAGS` | E | `hero.dev`, and any hero not tagged `hover` or `wall`: parts with `legWalk` and with `armSwing` | A hero on the floor walks | Tag legs and arms, left and right half a cycle apart |
| `HERO_NO_LANTERN` | E | `hero.dev`: a part in zone `lantern` | The lantern is the one light he carries | Add it at the screen-right side (−x) |
| `SOCKET_OUT_OF_BOUNDS` | W | Every socket within the bounds grown by max(0.3, 25% of the largest extent) | A socket given relative to a part instead of in model space | Use model-space coordinates |

## Anim tags

Skipped by `--geometry-only`.

| Code | Sev | Rule | Why | Fix |
|---|---|---|---|---|
| `ANIM_INVALID` | E | `type` is an `AnimType`; `axis` is x, y or z; `speed`, `amp`, `phase`, `pivot` are finite | An unknown type is ignored silently | Use a valid value |
| `ANIM_RANGE` | W | `0 < abs(speed) ≤ maxSpeed`, `abs(amp) ≤ maxAmp`, `0 ≤ phase ≤ 1` (table below) | A typo in units (degrees for radians) throws a limb across the panel | Bring it into range |
| `ANIM_PIVOT_OUTSIDE` | W | `pivot` within the same grown bounds as sockets | The pivot is in model space, not relative to the part | Put it at the joint |

| Type | max speed (cycles/s) | max amp | amp unit |
|---|---|---|---|
| `spin` | 4 | 1 | scale |
| `bob` | 4 | 0.4 | units |
| `pulse` | 4 | 0.5 | scale delta |
| `swing` | 4 | 1.6 | radians |
| `jitter` | 24 | 0.12 | units |
| `blink` | 6 | 0.95 | duty |
| `breathe` | 1.5 | 0.15 | scale delta |
| `legWalk`, `armSwing` | 4 | 1.1 | radians |
| `orbit` | 3 | 1.5 | units |

## Other thresholds

| Rule | Value | Meaning |
|---|---|---|
| `gamePxPerUnit` | 58 | The hero (1.6 units) is about 92 px tall on screen |
| `readScale` | 3 | Magnification of the measuring render |
| `contact.contactTol` | 0.004 | Surfaces closer than this touch |
| `contact.nearMiss` | 0.06 | Up to here a gap is a hairline (two ink shells of 0.028) |
| `contact.zWeight` | 0.2 | Depth differences count one fifth |
| `color.emissiveMin` | 0.3 | A zone at or above this emissive strength is a light |

## How the measurements work

1. **Bake**: `bakeModel(spec)` gives each part as model-space triangles.
2. **Pairs**: for every two parts whose boxes come within 0.06, the nearest approach of their
   triangles: segment-triangle crossing, then vertex-triangle and edge-edge distances, with per-triangle
   boxes as a filter. The search stops at the first pair within the contact tolerance.
3. **Inside test**: when one box is inside the other and the surfaces do not cross, a two-ray parity
   test on one vertex decides between "inside" (buried, or carried by a translucent shell) and "apart".
4. **Support graph**: touching parts are connected; the largest group is the body; the rest are
   reported nearest-first. A second walk that does not pass through tubes finds cable-only support.
5. **Coplanar faces**: camera-facing triangles of two touching parts, same plane and direction; the
   overlap area is clipped in 2D on the page and converted to pixels.
6. **Front read**: one `rasterizeModel` id buffer (opaque visibility, silhouette), one nearest-surface
   id buffer (colour shares, translucent parts), and one mask per part alone (hidden test, stroke
   thickness by a chamfer distance transform). The silhouette's convex hull comes from the first and
   last filled pixel of each row.

## Calibration notes

- Thresholds were tuned on the catalog: models that look right on the contact sheet pass, and the
  flagged ones show the defect when rendered (`node scripts/harness/render-sheet.mjs <id> --views`).
- A decal offset 0.005 to 0.02 in front of a surface is the normal way to avoid z-fighting, which is
  why depth is discounted in the contact metric rather than treated as a gap.
- Malware routinely uses two hardware zones, two or three corruption zones and the eye; lights are
  left out of the zone count so that the bible's "at most 5" applies to flat colour.
- `glass` is emissive in the palette but is a surface, not a light: it counts as a zone share and is
  excluded from `TOO_MUCH_GLOW`, so a mirror door is not "too much glow".
