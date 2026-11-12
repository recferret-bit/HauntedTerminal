# The room frame

Source of truth: `ROOM`, `ACTOR_BAND`, `designToRoomX` in
[`src/procgen/archetypes/rooms/frame.ts`](../../../../src/procgen/archetypes/rooms/frame.ts).
If this file and the code disagree, the code wins; fix this file.

## Coordinates

Model space, as for every model: y up, the model faces −z, the camera is on −z looking at +z,
**world +x is screen-left**.

```
 screen-left (+x)                                              screen-right (−x)
 x = +4.2  +4                +1.7                                   −4  −4.2
   |  bleed |    LEFT WING     |             ACTOR BAND               | bleed |
 y = 5.0  ┌──────────────────────────────────────────────────────────────────┐  ceiling beam 4.7 .. 5.0
          │                    UPPER WALL: motifs, the few accents           │
 y = 2.4  │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┌─────────────────────────────────────────────┤  ACTOR_BAND.top
          │ tall dressing,     │ dark relief only: silicon / pcbDark /       │
          │ any hardware zone  │ rubber / ink.  hero ~ x 0.7, doors far right│
 y = 0    ├────────────────────┴─────────────────────────────────────────────┤  floor top = feet
 y = −0.6 └────────────────────  APRON (floor front face)  ──────────────────┘
```

| Constant | Value | Meaning |
|---|---|---|
| `ROOM.width` / `halfWidth` | 8 / 4 | Playable width, centred on x = 0 |
| `ROOM.bleed` | 0.2 | The shell extends this far past each side, so a slightly wider panel shows no edge |
| `ROOM.height` | 5.0 | Wall top. 5.0 because the stage shows 4.81 units above the feet line at zoom 1 |
| `ROOM.apron` | 0.6 | How far the floor's front face hangs below y = 0 |
| `ROOM.zWallFace` | 0.9 | z of the wall surface. `onWall(depth)` gives the centre z of a relief glued to it |
| `ROOM.zDressFar` .. `zDressNear` | 0.8 .. 0.25 | Floor-standing dressing |
| `ROOM.zActor` | 0 | Actors. The room must leave this plane empty |
| `ROOM.zFront` | −0.35 | Foreground silhouettes, edges only |
| `ROOM.zApron` | −0.5 | z of the floor's front face. Apron details sit at `zApron − 0.02` |
| `ACTOR_BAND.xLeft` | 1.7 | Screen-left limit of the band. Beyond it is the left wing |
| `ACTOR_BAND.top` | 2.4 | Above it is the upper wall |

Total depth is about 1.55 units for an 8.4-wide model, far inside the 60% depth rule.

The shell (`shell()` in `kit.ts`) is five parts: `wall` (8.4 × 5 × 0.1), `floor` (8.4 × 0.6 × 1.5,
top at y = 0, spanning z −0.5 .. 1.0), `floor-lip`, `skirting`, `ceiling-beam`. Rooms with a special
floor pass `solidFloor: false` and build their own (`room.chasm` splits it in two around the gap,
`room.catwalk` uses a thin deck on struts over an `ink` drop).

## Sockets

All in room-frame coordinates.

| Socket | Rooms | Position | Use |
|---|---|---|---|
| `hero` | all | `[designToRoomX(hero x in view.ts), 0, 0]` | Hero spawn |
| `caption` | all | `[3.75, 4.55, 0.25]` | Top-left corner for the yellow caption box |
| `door.left` | all | `[3.3, 0, 0.25]` | A door in the left wing (the way back) |
| `door.right` | all | `[−3.55, 0, 0.25]`, or the gate actor's x | A door on the right edge (the way on) |
| `door.down` | all | default `[−2.4, 0, 0]`; rooms override | A hatch, stairs, shaft or elevator in the floor |
| `note`, `desk` | desk | | `todo.note`; the desktop surface |
| `readme`, `intercom`, `ghost`, `hatch`, `relay` | attic | | Actors from `view.ts`; `relay` is the relay LED on the wall |
| `chronicles`, `archivist`, `gate` | crypt_entrance | | The log niche, the talking socket, the firewall gate |
| `plank`, `gargoyle` | crypt_hall | | The `.tar` crate and the trojan's perch |
| `chasm`, `bridge`, `stairs` | chasm | | Centre of the gap (both names), the far-side stairs |
| `mirrors`, `mirror.north/east/south`, `flood` | cell | | The mirror actor, the three wall frames, the flood plane origin |
| `altar`, `pedestal`, `mimic` | lab_hall | | The pressure-plate socket, the top of the pedestal, the mimic |
| `valve`, `dump` | catwalk | | The valve socket actor, `boiler.dump` |
| `boss`, `minion`, `spawn`, `die` | furnace | | Fork bomb, zombie, where the Hand draws new zombies, the glowing die |
| `boss`, `core_dump`, `wakeup`, `devnull`, `portal`, `die` | core | | The overlord hovers at y = 1.3; `devnull` and `portal` share a spot |
| `window`, `desk` | outro | | The dawn window, the desktop |

Actor sockets are derived, not hand-placed: `designToRoomX(x)` takes the `x` that `buildRoom()` in
`src/game/view.ts` gives an actor and maps it onto the room width with the same linear rule the stage
uses. If `view.ts` moves an actor, update the argument, not the number.

## How this maps to the stage

`src/renderer/comic-stage.ts` works in a *design space* and then fits it to the window:

- `DESIGN_LEFT = 4.9`, `DESIGN_RIGHT = −1.15`: the x range `view.ts` authors actors in (6.05 wide,
  +x is screen-left). `placeX(designX)` maps it linearly onto the main panel,
  `panelLeft` .. `panelRight`, clamped at both ends.
- `designToRoomX` does the same thing onto the room: `t = (4.9 − x) / 6.05`,
  `roomX = 4 − 8t`. So design 4.9 → room +4, design 1.875 → room 0, design −1.15 → room −4.
  The hero at design 2.4 lands at room x = 0.69.
- The orthographic view is `5.35 / zoom` units tall, centred on y = 2.45 (`CAM_HOME`, `LOOK_HOME`).
  `layoutFill()` sets `feetY = viewBottom + 0.5` (0.295 at zoom 1; the constant `FEET_Y = 0.62` is only
  the value before the first layout). So the room's y = 0 belongs at `feetY`, its apron fills the
  0.5 units below, and 4.81 units of wall are visible above.
- The main panel is the view width minus a neighbour column on screen-right
  (`colW = clamp(viewW × 0.2, 1.7, 2.8)` plus a 0.14 gutter). Its width depends on the window's
  aspect ratio; it is not 8.
- Actors are placed at z = 0.22. The current flat backdrop is at z = 1.7, the plinth box at z = 0.35,
  the paper at z = 2.4.

## How the stage uses the rooms now

`ComicStage` (`syncRoomModel` and `fitRoom` in `src/renderer/comic-stage.ts`) builds `room.<kind>` from
`ModelCatalog` whenever `view.kind` changes, animates it with `createAnimator`, and lays it over the main
panel: y = 0 at `feetY`, z = 0.22 (the actor plane), x scaled by `(panelLeft - panelRight) / ROOM.width`
so room sockets match `placeX`. The old flat backdrop plane stays behind it as a fill colour, the old
plinth box is hidden (the room's floor replaces it), and the neighbour column cards were moved to z 0.9 / 0.95
so they sit in front of the wall.

The flood, the bridge and the PS_XRAY overlay are anchored to the room's `flood` / `bridge` / `chasm`
sockets. Known gap: the stretch in x distorts round shapes at extreme window aspect ratios. Actors are built
per `RoomActor.model` by `src/renderer/stage-cast.ts` (legacy keys map through `LEGACY_CAST` in
`procgen-cast.ts`).
