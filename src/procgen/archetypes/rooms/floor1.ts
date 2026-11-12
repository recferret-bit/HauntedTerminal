import type { ModelSpec } from '../../core/types.js';
import { makeRng } from '../../core/rng.js';
import { designToRoomX, RoomBuilder, ROOM } from './frame.js';
import { cobweb, hangingCable, led, platter, seams, shell } from './kit.js';

/**
 * Floor 1, the storage attic: drive bays, dusty platters, ribbon-cable cobwebs, a dead CRT.
 * Violet-dark `silicon` walls, `rubber` furniture, one `powerAmber` light.
 */

/** Roof rafters: a gable made of two bus bars and a king post. Upper wall only. */
function gable(b: RoomBuilder): void {
  const slope = 0.2;
  for (const side of [1, -1] as const) {
    b.box('rafter', [4.3, 0.2, 0.26], 'rubber', [side * 2.1, 4.08, 0.74], { rot: [0, 0, -side * slope] });
  }
  b.box('king-post', [0.2, 0.62, 0.3], 'rubber', [0, 4.4, 0.72]);
  b.box('tie-beam', [8.4, 0.12, 0.2], 'pcbDark', [0, 3.52, 0.78]);
}

/** A dead CRT: dark screen, one crack. `y` is the underside. */
function deadCrt(b: RoomBuilder, x: number, y: number, z: number): void {
  b.box('crt-case', [1.0, 0.82, 0.5], 'rubber', [x, y + 0.47, z]);
  b.box('crt-foot', [0.6, 0.08, 0.4], 'silicon', [x, y + 0.04, z]);
  b.box('crt-screen', [0.74, 0.56, 0.04], 'silicon', [x + 0.04, y + 0.5, z - 0.26]);
  b.add(
    'crt-crack',
    { kind: 'extrude', outline: [[-0.2, 0.2], [-0.02, 0.05], [-0.1, -0.02], [0.14, -0.2], [0.0, -0.02], [0.08, 0.06]], depth: 0.02 },
    'ink',
    [x + 0.04, y + 0.5, z - 0.29],
    { outline: false },
  );
  b.box('crt-knob', [0.07, 0.07, 0.04], 'heatsink', [x - 0.41, y + 0.2, z - 0.26]);
}

/** A rack of drive sleds. Returns the y of its top. */
function driveBay(b: RoomBuilder, x: number, width: number, sleds: number, z: number, litSled: number): number {
  const pitch = 0.5;
  const height = sleds * pitch + 0.2;
  b.box('bay-frame', [width, height, 0.45], 'rubber', [x, height / 2, z]);
  for (let i = 0; i < sleds; i++) {
    const y = 0.1 + pitch * (i + 0.5);
    b.box('bay-sled', [width - 0.22, pitch - 0.14, 0.06], 'silicon', [x, y, z - 0.24]);
    b.box('bay-handle', [width * 0.3, 0.06, 0.04], 'pcbDark', [x + width * 0.18, y, z - 0.28]);
  }
  led(b, 'powerAmber', [x - width / 2 + 0.24, 0.1 + pitch * (litSled + 0.5), z - 0.29], 0.5, 0.2);
  return height;
}

export function buildDesk(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const b = new RoomBuilder('desk', 'Desk nook');
  shell(b, { floor: 1, wall: 'silicon', ground: 'rubber', trim: 'pcbDark' });
  gable(b);
  seams(b, [-2.6, -0.4], 'pcbDark', 0.14, 3.46);

  // The desk he fell asleep at, rebuilt by the machine out of drive bays. Left wing.
  const z = 0.56;
  b.box('desk-leg', [0.55, 0.96, 0.44], 'silicon', [2.0, 0.48, z]);
  b.box('desk-leg', [0.55, 0.96, 0.44], 'silicon', [3.7, 0.48, z]);
  for (let i = 0; i < 3; i++) b.box('desk-drawer', [0.4, 0.2, 0.04], 'pcbDark', [3.7, 0.2 + i * 0.28, z - 0.23]);
  b.box('desk-top', [2.4, 0.13, 0.52], 'rubber', [2.85, 1.02, z]);
  deadCrt(b, 3.0, 1.085, z);
  b.box('keyboard', [0.8, 0.07, 0.3], 'silicon', [2.2, 1.12, z - 0.06]);
  led(b, 'powerAmber', [2.0, 0.8, z - 0.24], 0.4, 0.1);

  // A shelf of dusty platters, high on the screen-right side.
  b.plaque('shelf', [2.3, 0.09, 0.28], 'rubber', [-2.3, 2.62]);
  const lean = rng.range(0.25, 0.4);
  platter(b, -2.9, 3.06, 0.4, 'heatsink', 'silicon', 0.1);
  platter(b, -2.2, 3.02 + lean * 0.1, 0.36, 'rubber', 'silicon', 0.14);
  platter(b, -1.6, 2.96, 0.3, 'heatsink', 'silicon', 0.1);

  cobweb(b, 1, 1.25, 'heatsink');
  hangingCable(b, rng.range(-1.2, -0.6), 0.95, 'rubber', rng.next());

  b.standardSockets(2.4)
    .socket('note', [designToRoomX(0.2), 0.5, ROOM.zActor])
    .socket('desk', [2.85, 1.085, z]);
  return b.spec();
}

export function buildAttic(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const b = new RoomBuilder('attic', 'Storage attic');
  shell(b, { floor: 1, wall: 'silicon', ground: 'rubber', trim: 'pcbDark' });
  gable(b);
  seams(b, [-1.9, 0.3], 'pcbDark', 0.14, 3.46);

  // Left wing: a drive-bay tower with the dead CRT dumped on top.
  const top = driveBay(b, 3.1, 1.4, 4, 0.6, rng.int(0, 3));
  deadCrt(b, 3.05, top, 0.6);
  b.box('bay-crate', [0.6, 0.55, 0.4], 'silicon', [2.05, 0.275, 0.58], { texture: 'tex.deck-plate' });

  // The power relay the intercom talks about: upper wall, above the hatch.
  b.plaque('relay-box', [0.62, 0.8, 0.14], 'rubber', [-3.3, 2.98]);
  b.plaque('relay-coil', [0.36, 0.3, 0.2], 'copper', [-3.3, 2.82]);
  led(b, 'powerAmber', [-3.3, 3.22, 0.74], 0.3, 0);
  b.add('relay-conduit', { kind: 'tube', path: [[-3.3, 2.58, 0.86], [-3.34, 1.6, 0.87], [-3.5, 0.1, 0.87]], radius: 0.04 }, 'rubber', [0, 0, 0]);

  // Platters nailed to the wall like plates, high up.
  platter(b, -0.95, 2.95, 0.34, 'heatsink', 'silicon', 0.03);
  platter(b, -0.4, 3.08, 0.26, 'rubber', 'silicon', 0.06);

  // The hatch to the cellar: a striped plate in the floor apron under the gate actor.
  const hatchX = designToRoomX(-1.0);
  b.box('hatch-plate', [0.95, 0.3, 0.05], 'rubber', [hatchX + 0.25, -0.26, ROOM.zApron - 0.02], { texture: 'tex.caution-stripes' });

  cobweb(b, 1, 1.1, 'heatsink');
  cobweb(b, -1, 1.45, 'heatsink');
  hangingCable(b, rng.range(0.9, 1.5), 0.8, 'rubber', rng.next());
  hangingCable(b, rng.range(-2.3, -1.7), 0.55, 'rubber', rng.next());

  b.standardSockets(2.5)
    .socket('readme', [designToRoomX(1.3), 0.5, ROOM.zActor])
    .socket('intercom', [designToRoomX(0.1), 0, ROOM.zActor])
    .socket('ghost', [designToRoomX(-0.4), 0.9, ROOM.zActor])
    .socket('hatch', [hatchX, 0, ROOM.zActor])
    .socket('door.down', [hatchX, 0, ROOM.zActor])
    .socket('relay', [-3.3, 3.22, 0.74]);
  return b.spec();
}
