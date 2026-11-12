---
name: procedural-rooms-3d
description: "[ASSET PCG] Build room sets: the `room.<kind>` models in `src/procgen/archetypes/rooms` (back wall, floor, set dressing, door and actor sockets) that sit behind the actors of each comic panel. Use whenever you add a room or room variant, touch a wall, floor, backdrop, pillar, arch, grille or set dressing, move a door or actor socket, restyle a floor of the machine, or a room is too busy, too bright or hides the hero. Level-generation skills pick a `roomKind` from this set; adding a new kind starts here. Read `haunted-art-direction` first."
---

# Procedural rooms

A room is a `ModelSpec` like any other model, but its job is the opposite of an actor's: **to recede**.
The player reads the hero, the malware, the door and the pickup; the room only says *where in the
machine we are* and *what mood it is*. Every rule below follows from that.

Read [haunted-art-direction](../haunted-art-direction/SKILL.md) first: the palette, the camera and the
harness commands are defined there and not repeated here.

## Where things are

```
src/procgen/archetypes/rooms.ts          registers room.<kind> for every RoomKind; exports the frame helpers
src/procgen/archetypes/rooms/frame.ts    ROOM, ACTOR_BAND, BAND_ZONES, designToRoomX, roomIdForKind, RoomBuilder
src/procgen/archetypes/rooms/kit.ts      part-builders: shell, arch, pillar, combOutline, trace, fan, led, pipe ...
src/procgen/archetypes/rooms/floor1.ts   desk, attic            floor2.ts  crypt_entrance, crypt_hall, chasm
src/procgen/archetypes/rooms/floor3.ts   cell, lab_hall         floor4.ts  catwalk, furnace
src/procgen/archetypes/rooms/floor5.ts   core                   outro.ts   outro (the real world)
```

`RoomKind` comes from `src/renderer/room-view.ts`; which actors stand in which room, and at what x, is
in `src/game/view.ts`. One id per kind: `room.desk`, `room.attic`, `room.crypt_entrance`,
`room.crypt_hall`, `room.chasm`, `room.cell`, `room.lab_hall`, `room.catwalk`, `room.furnace`,
`room.core`, `room.outro`.

## The room frame

All rooms share one coordinate frame so the stage can swap them and actors land on the same spots.
Constants live in `ROOM` (`frame.ts`); details and the mapping to the stage are in
[references/room-frame.md](./references/room-frame.md).

- **y**: `0` is the floor top, where feet go. The wall rises to `5.0`. The floor's front face (the
  *apron*) hangs down to `−0.6`; the camera is level, so the apron is the only part of the floor you see.
- **x**: 8 units wide, centred on 0, plus 0.2 bleed each side. **World +x is screen-left.**
- **z**: the camera is on −z, so smaller z is nearer. Four layers:

| Layer | z | What goes there |
|---|---|---|
| Wall | face at `0.9` | One box. Relief is glued on with `b.plaque()` / `b.relief()` |
| Dressing | `0.8` .. `0.25` | Floor-standing things: pillars, racks, tombstones, fan towers |
| Actors | `0` | Nothing of yours. The stage puts hero, malware, doors, pickups here |
| Foreground | `−0.35` | Optional low dark silhouettes, at the very edges only (|x| > 3.5, under 0.5 tall) |

## The actor band (the rule that matters most)

Actors stand between the right edge and x ≈ 1.7 (the hero spawns around x = 0.7 and everything else is
to screen-right of him), and are up to 2.4 tall. That rectangle is `ACTOR_BAND`. Inside it:

- Only wall relief, only in `BAND_ZONES` (`silicon`, `pcbDark`, `rubber`, `ink`). No `heatsink`,
  `solder`, `plastic`, `gold`, `copper`, no signal zones, nothing emissive.
- Nothing floor-standing and nothing nearer than z = 0.5. Two exceptions, both in band zones: one
  half-hidden pillar on the right edge (x ≤ −3.9), and a low rail or plinth pressed against the wall
  (the catwalk rail, the pedestal).

Everything with a shape goes to one of three places:

1. **The upper wall** (y > 2.4): arches' heads, grilles, fins, pipes, frames, the room's one big motif.
2. **The left wing** (x > 1.7, screen-left of the hero): tall floor-standing dressing, any hardware zone.
3. **The apron** (y < 0): traces, hatch plates, ember slits. Below the feet, so it may carry accents.

Why so strict: actors are small (the hero is 92 px) and the pixel-art pass quantizes everything. A
bright pillar behind a 60 px enemy erases its silhouette.

## Value and colour

- Walls and floors use the three dark hardware zones. One of them is ~60% of the picture, a second
  ~30%. Mid-tones (`heatsink`, `copper`, `gold`) are spent above head height or in the left wing.
- **Signal accents are sparse**: 2 to 5 small emissive parts per room, in the floor's accent
  (see [floor-motifs.md](./references/floor-motifs.md)). Each one should mean something (a link LED, a
  relay, the die). Tag LEDs `blink`.
- No `malware` zones in a room, ever: magenta and violet must mean "this will hurt you". No `human`
  zones either, except `room.outro`, which is the real world and is tagged `real-world`.
- `inkWeight: 0.02` (thinner than actors' 0.028), set by `RoomBuilder.spec()`.
- Textures are optional polish: name them with `texture`. The wall takes `tex.backdrop.floor1..5`
  (`shell()` does this); small upper-wall or apron parts may take `tex.heatsink-fins`,
  `tex.glyph-rain`, `tex.caution-stripes`, `tex.pcb-traces`, `tex.hex-dump`, `tex.crosshatch`. Do not
  texture the floor block: a texture replaces 86% of the zone colour and the surface textures are far
  brighter than the dark zones. Unknown ids are ignored, so **the room must read without textures**.

## Gothic shapes from hardware

The mansion gives the shape, the computer gives the material. Use the kit, do not model masonry:

| Mansion thing | Made from | Kit call |
|---|---|---|
| Vault, niche, doorway | A port shell | `arch()` / `archOutline()` (`sharp` 0 round .. 1 pointed) |
| Column | A capacitor can, a RAM stick in its slot | `pillar()`, `ramPillar()` |
| Portcullis, stalactites, balustrade, organ pipes | Pins and heatsink fins | `combOutline()` (teeth up or down, `taper`) |
| Carved lines, floor pattern | PCB traces | `trace()`, `mirroredTrace()` |
| Cobwebs, chains | Ribbon cable, hanging cable | `cobweb()`, `hangingCable()` (tagged `swing`) |
| Plates, tombstones | Disk platters, chip packages | `platter()`, `tombstone()` |
| Boiler pipes, furnace | Heat pipes, fans | `pipe()`, `fan()` (blades tagged `spin`) |

Combs, traces, arches and frames are **one `extrude` part each**. That is how a room stays under the
budget: 80 parts, 8000 triangles (current rooms use 30 to 40 parts and under 1800 triangles). Avoid
`sphere` (352 triangles) and `torus` (320) for small things; an LED is a 12-triangle box.

## Sockets

Every room provides `hero`, `caption`, `door.left`, `door.right`, `door.down` (via
`b.standardSockets(heroDesignX)`), plus one socket per thing `view.ts` puts in that room, named for
what it is (`gate`, `intercom`, `chasm`, `boss`, `pedestal`, `valve` ...). Compute actor sockets with
`designToRoomX(x)` from the x in `view.ts`, never by eye, so the dressing lines up with the actor
(the chasm's gap is centred on the pit actor this way). Full list in
[room-frame.md](./references/room-frame.md).

## Workflow

1. **Pick the floor's vocabulary** in [floor-motifs.md](./references/floor-motifs.md): wall zone,
   motifs, accent. A room shows two or three motifs, not all of them.
2. **Write the builder** with `RoomBuilder` and the kit. Start from `shell()`, then the upper-wall
   motif, then the left wing, then sockets. Worked example: [examples/worked-room.ts](./examples/worked-room.ts).
   Use `makeRng(seed)` for small variation (a tombstone's lean, a cable's position), never for layout.
3. **Register**: a new variant of an existing kind replaces or extends its builder; a new kind needs
   the `RoomKind` union, `kindOf()` in `src/game/view.ts`, `ROOM_KINDS` and `floorForKind()` in
   `frame.ts`, and an entry in `ROOM_DEFS` in `rooms.ts`.
4. **Render and look**:
   `node scripts/harness/render-sheet.mjs --category room --size 420 --cols 2 --out scripts/harness/out/rooms.png`
   then open the PNG. For one room up close: `node scripts/harness/render-sheet.mjs room.chasm --size 880 --out scripts/harness/out/room.png`;
   add `--views` for side and top views to check the z layers.
5. **Squint test** on the sheet: cover the top half; the bottom half must be nearly flat dark. Then
   imagine the hero at x = 0.7 and a door at the right edge: nothing bright behind either.
6. **Validate**: `npm run procgen:validate`, then `npm run procgen:check` before calling it done.
7. **Asset lab**: `npm run dev`, open `/asset-lab.html`, look at the room under the real shaders,
   pixel-art and CRT passes, with and without textures.

## Common mistakes

- Dressing the middle. If it is interesting, it goes up, left or down.
- Symmetric left and right wings. The right edge is where doors and gates stand; keep it to an
  edge pillar at most.
- Bright floors. The apron is 0.6 tall and directly under every actor's feet.
- Too many accents. If more than five things glow, none of them is a signal.
- Forgetting +x is screen-left and building the left wing at negative x.
- Wiring a room into `comic-stage.ts` as part of an art task. The stage still draws a flat backdrop
  plane; adopting room sets is a separate renderer change, described in [room-frame.md](./references/room-frame.md).
