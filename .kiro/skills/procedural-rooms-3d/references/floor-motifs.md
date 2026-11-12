# Floor motifs

One table per floor: what part of the machine it is, the mansion feeling to hit, the shapes to use and
the zones to build them from. Floor base colours are `FLOOR_THEMES` in `src/procgen/core/palette.ts`
(the backdrop colour the stage clears to). Rooms do not use those hexes; they name zones.

Floors (aprons) carry no texture: the surface textures are brighter than the dark zones and sit right
under the actors' feet. A room uses the floor's **wall zone**, **two or three motifs**, and **one accent family**. Sharing
motifs between rooms of a floor is how the floor feels like one place; changing which motif is biggest
is how the rooms differ.

## Floor 1: storage attic (`/home/dev/nightmare_workspace`)

Rooms: `desk`, `attic`. Feeling: an attic. Dusty, abandoned, things stored and forgotten, low roof.

| | |
|---|---|
| Wall / floor / trim | `silicon` / `rubber` / `pcbDark` |
| Furniture | `rubber` frames, `silicon` fronts |
| Mid-tones (upper wall, left wing only) | `heatsink` platters and ribbon cable, a touch of `copper` (relay coil) |
| Accent | `powerAmber`: one drive LED, the relay light. 1 or 2 per room |
| Textures | wall `tex.backdrop.floor1`, hatch plate `tex.caution-stripes` |

Motifs:
- **Gable rafters**: two sloped bus bars, a king post and a tie beam across the upper wall. The roof.
- **Drive bays**: a rack frame with sled fronts and handles. Tower in the attic, desk legs in the desk nook.
- **Dead CRT**: `rubber` case, `silicon` screen, an `ink` crack. Dead means not `glass` and not lit.
- **Platters**: discs hung on the wall or stood on a shelf like plates.
- **Ribbon-cable cobwebs**: `cobweb()` in the upper corners; `hangingCable()` from the beam.
- **The relay** (attic): a small box above the hatch with the amber light the intercom talks about.

## Floor 2: firewall crypt (`/var/dungeon`)

Rooms: `crypt_entrance`, `crypt_hall`, `chasm`. Feeling: a crypt. Vaults, bars, graves, a drop.

| | |
|---|---|
| Wall / floor / trim | `pcbDark` / `silicon` / `rubber` |
| Stonework | `rubber` vaults, `silicon` niches and pillars |
| Mid-tones | `heatsink` pin grilles in the arch heads; `copper` traces and `gold` connector edges on the apron (chasm) |
| Accent | `phosphor` link LEDs; `powerAmber` on the chasm's lips |
| Textures | wall `tex.backdrop.floor2` |

Motifs:
- **Port-shell vaults**: `arch()` with `sharp` 0.75 .. 0.9. Three wide ones at the entrance, five
  narrow burial niches in the hall, one broken one over the chasm.
- **Port grilles**: `combOutline(..., down = true, taper)` hanging in the arch head: pins as a portcullis.
- **Log tombstones**: `tombstone()`, a chip package stood on end with three `ink` lines (the FATAL
  entries). Left wing, leaning a little (seeded).
- **Capacitor columns**: `pillar()`. Whole at the edge, snapped short in the hall.
- **The gap in the bus** (chasm): the floor is two blocks; three `copper` traces run along the apron
  and stop at a `gold` connector edge on each lip; the same bus on the upper wall stops over the gap;
  cut cables hang into it. The gap is centred on the `chasm` socket.

## Floor 3: bus maze (`/usr/local/labyrinth`)

Rooms: `cell`, `lab_hall`. Feeling: a hall of mirrors. Symmetry, repetition, the same thing again.

| | |
|---|---|
| Wall / floor / trim | `silicon` / `rubber` / `pcbDark` |
| Lines | `pcbDark` traces, `rubber` frames and rings |
| Mid-tones | none. This floor is the darkest and flattest; the mirrors are actors |
| Accent | `dataCyan`: one pixel at the end of each mirror corridor, two on the bus |
| Textures | wall `tex.backdrop.floor3`, loopback frame glass `tex.glyph-rain` |

Motifs:
- **Mirrored traces**: `mirroredTrace()` draws every trace twice, reflected in x = 0. The wall must be
  symmetric even though the left wing is not.
- **Loopback frames**: a frame containing a smaller frame containing a smaller frame, ending in a
  cyan pixel. Three in the cell (`mirror.north/east/south`); one ring with an arrowhead chasing its
  tail in the hall.
- **RAM-slot corridor**: `ramPillar()` (board, chips, slot; gold teeth hidden in the slot) as a
  colonnade; slot latches at the cell's ends.
- **Pedestal niche** (hall): a dark arch and a low plinth behind the `pedestal` socket.
- The cell floods: leave the lower wall plain so the black water (a stage shader) reads.

## Floor 4: CPU cooling furnace (`/proc_mansion/boiler_room`)

Rooms: `catwalk`, `furnace`. Feeling: a boiler room. Pipes, pressure, heat, machinery that runs by itself.

| | |
|---|---|
| Wall / floor / trim | `rubber` / `silicon` / `silicon` |
| Iron | `silicon` rails, valve bodies, fan frames |
| Mid-tones | `copper` heat pipes and heat spreader, `heatsink` fins, fan blades, valve wheel; a `plastic` gauge face |
| Accent | heat: a `powerAmber` die and ember slits, `lockRed` warning lights |
| Textures | wall `tex.backdrop.floor4`, fin banks `tex.heatsink-fins` |

Motifs:
- **Heat pipes**: `pipe()` runs along the upper wall and drops down the left wing or the far edge.
- **Heatsink organ**: `combOutline()` teeth up, on the upper wall. Two banks of different height.
- **Fans**: `fan()`; blades are one pinwheel part tagged `spin`. A small intake on the catwalk, a
  two-fan tower in the furnace's left wing.
- **The glowing die** (furnace): a `copper` spreader, a `silicon` well, a `powerAmber` die tagged
  `pulse`. The largest emissive area in any room, and it is above head height on purpose.
- **Catwalk**: a thin deck with struts over an `ink` drop, and a dark rail against the wall.
- **Valve** (catwalk): a wheel on the pipes above the `valve` socket, one `lockRed` light.

## Floor 5: kernel core (`/sys/kernel/panic_chamber`)

Room: `core`. Feeling: the thing in the cellar. One huge broken object, a storm, the floor giving way.

| | |
|---|---|
| Wall / floor / trim | `silicon` / `rubber` / `pcbDark` |
| The die | `rubber` halves on a `pcbDark` socket plate |
| Mid-tones | `gold` socket pins along the die's top edge, `heatsink` spire points |
| Accent | `dataCyan` lightning: in the crack (upper part only) and two bolts in the upper corners, all `blink` at different speeds |
| Textures | wall `tex.backdrop.floor5` |

Motifs:
- **The cracked die**: one package split by a zigzag, the halves slipped apart and one rotated a
  few degrees. The crack is the composition; keep everything else smaller.
- **Storm bolts**: `boltOutline()`; never more than three lit things, the boss is the light source here.
- **Lightning-rod spires**: `pillar()` plus a `heatsink` cone, two in the left wing, one at the right edge.
- **Breaking floor**: `ink` cracks on the apron and two low foreground shards at the very edges
  (the only room that uses the foreground layer).
- No `malware` zones even here. The overlord brings the magenta; the room stays hardware so he reads.

## Outro: the desk at dawn

Room: `outro` (shown when the game has ended). Feeling: relief. It is morning and you are out.

This is the one room outside the machine, so it is the one place set dressing may use the `human`
family. It is tagged `real-world`. Treat it as an exception, not a precedent.

| | |
|---|---|
| Wall / floor / trim | `denim` / `hair` (wood) / `plastic` |
| Warmth | `lantern` window light and sticky note, a `hoodie` rising sun, books in `hoodie` / `paper` / `skin` / `plastic` |
| Hardware | a `plastic` monitor with a `silicon` screen, `plastic` keyboard |
| Accent | `phosphor`: a prompt and a blinking cursor. The machine, now just a machine |

Motifs: the window (upper wall, over the hero), the real desk in the same place and proportions as
`room.desk` so the player recognises it, a bookshelf. Same frame and the same actor band rule.

## Adding a floor or a motif

- A new motif is a function in `kit.ts` if two rooms use it, otherwise a local function in the floor file.
- Prefer one `extrude` outline over many boxes.
- If a motif needs a colour the palette lacks (floor 4 has no dark red hardware zone, for example),
  do not inline a hex: use the nearest dark zone and let the accent and the backdrop texture carry the
  hue, or propose a new zone in `ZONES` with a family and a reason.
