/**
 * Worked example: a variant of the floor 2 crypt hall, "the ossuary", built step by step.
 * It is not registered (examples are not imported by the game). To ship it, move the function into
 * src/procgen/archetypes/rooms/floor2.ts and point `ROOM_DEFS.crypt_hall.build` at it in
 * src/procgen/archetypes/rooms.ts, or pick between builders by seed there.
 *
 * To look at it without registering:
 *   node .kiro/skills/procedural-rooms-3d/examples/render-example.mjs
 */
import { makeRng } from '../../../../src/procgen/core/rng.js';
import type { ModelSpec } from '../../../../src/procgen/core/types.js';
import { designToRoomX, onWall, ROOM, RoomBuilder } from '../../../../src/procgen/archetypes/rooms/frame.js';
import { arch, combOutline, hangingCable, led, pillar, shell, tombstone } from '../../../../src/procgen/archetypes/rooms/kit.js';

export function buildOssuary(seed: number): ModelSpec {
  // Seeded variation only for small things. Layout never depends on the seed.
  const rng = makeRng(seed);
  // The kind decides the id (`room.crypt_hall`) and the floor tag.
  const b = new RoomBuilder('crypt_hall', 'Crypt hall: ossuary');

  // 1. The shell. Floor 2 vocabulary: pcbDark wall, silicon floor, rubber trim (floor-motifs.md).
  //    Textures are named but optional; the room has to read without them.
  shell(b, { floor: 2, wall: 'pcbDark', ground: 'silicon', trim: 'rubber' });

  // 2. The upper-wall motif: one wide port-shell vault with a pin portcullis in its head.
  //    The legs come down into the actor band, so they are `rubber` (a BAND_ZONE), thin, and flat on the wall.
  arch(b, 'vault', -1.2, 4.6, 4.5, 0.2, 'rubber', 0.85, 0.12);
  //    The pins are `heatsink` (a mid-tone), so they must stay above ACTOR_BAND.top = 2.4:
  //    they hang from y = 4.1 down to 3.2.
  b.relief('port-grille', combOutline(2.6, 0.9, 11, 0.3, 0.1, true, 0.5), 0.05, 'heatsink', [-1.2, 4.1]);

  // 3. Shelves of dead chips ("bones") inside the vault: dark on dark, they are in the band.
  for (let row = 0; row < 3; row++) {
    const y = 0.7 + row * 0.62;
    b.plaque('bone-shelf', [3.4, 0.07, 0.1], 'rubber', [-1.2, y - 0.2]);
    for (let i = 0; i < 6; i++) {
      // A missing chip here and there. rng.chance keeps it deterministic per seed.
      if (rng.chance(0.2)) continue;
      b.plaque('bone-chip', [0.4, 0.3, 0.06], 'silicon', [-2.6 + i * 0.56, y]);
    }
  }

  // 4. The accent: two link LEDs on the keystone. Signal zones, tiny, above head height, blinking.
  b.plaque('keystone', [0.34, 0.3, 0.16], 'silicon', [-1.2, 4.42]);
  led(b, 'phosphor', [-0.9, 4.42, onWall(0.18)], 0.6, 0);
  led(b, 'phosphor', [-1.5, 4.42, onWall(0.18)], 2.1, 0.5);

  // 5. The left wing (x > 1.7): the only place for tall floor-standing dressing.
  pillar(b, 3.9, 3.2, 0.2, 'silicon', 'rubber', 0.7);
  tombstone(b, 3.0, 0.8, 1.5, 'rubber', 0.6, rng.range(-0.06, 0.06));
  tombstone(b, 2.2, 0.62, 1.0, 'rubber', 0.5, rng.range(0.05, 0.12));
  hangingCable(b, 2.6, rng.range(0.6, 0.9), 'rubber', rng.next(), 0.7);

  // 6. Sockets. Standard ones first, then one per actor src/game/view.ts puts in a crypt_hall,
  //    converted from its design x so the dressing and the actor agree.
  b.standardSockets(2.3)
    .socket('plank', [designToRoomX(0.7), 0, ROOM.zActor])
    .socket('gargoyle', [designToRoomX(-0.6), 0, ROOM.zActor])
    .socket('door.down', [-3.6, 0, ROOM.zActor]);

  // 7. spec() fills in id, category, inkWeight 0.02 and the floor tag.
  return b.spec(['variant:ossuary']);
}
