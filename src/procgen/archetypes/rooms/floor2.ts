import type { ModelSpec } from '../../core/types.js';
import { makeRng } from '../../core/rng.js';
import { designToRoomX, onWall, RoomBuilder, ROOM } from './frame.js';
import { arch, combOutline, hangingCable, led, pillar, shell, tombstone, trace } from './kit.js';

/**
 * Floor 2, the firewall crypt: port-shell vaults, pin grilles, log tombstones, a gap in the bus.
 * `pcbDark` walls with `rubber` and `silicon` stonework, `phosphor` link lights.
 */

/** A port grille hanging in the head of an arch: pins as a portcullis. Upper wall only. */
function portGrille(b: RoomBuilder, x: number, top: number, width: number, drop: number, pins: number): void {
  b.relief('port-grille', combOutline(width, drop, pins, 0.34, 0.1, true, 0.5), 0.05, 'heatsink', [x, top]);
}

export function buildCryptEntrance(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const b = new RoomBuilder('crypt_entrance', 'Firewall crypt entrance');
  shell(b, { floor: 2, wall: 'pcbDark', ground: 'silicon', trim: 'rubber' });

  // Three vaults made of port shells. Their legs are dark relief; the grilles hang above head height.
  for (const x of [2.7, 0, -2.7]) {
    arch(b, 'vault', x, 2.62, 4.5, 0.17, 'rubber', 0.75);
    portGrille(b, x, 4.2, 1.5, 0.85, 7);
  }
  b.plaque('vault-keystone', [0.3, 0.34, 0.16], 'silicon', [0, 4.42]);
  led(b, 'phosphor', [0.34, 4.25, onWall(0.2)], 0.6, 0);
  led(b, 'phosphor', [-0.34, 4.25, onWall(0.2)], 2.4, 0.5);

  // Left wing: log tombstones, one per bad day.
  tombstone(b, 3.35, 0.78, 1.45, 'rubber', 0.6, rng.range(-0.05, 0.05));
  tombstone(b, 2.45, 0.66, 1.05, 'rubber', 0.52, rng.range(0.04, 0.12));
  pillar(b, 4.0, 3.1, 0.2, 'silicon', 'rubber', 0.7);

  // The chronicles: a card-slot niche in the wall between vibecoder and gate. Dark on dark.
  const nicheX = designToRoomX(1.1);
  b.plaque('niche', [0.9, 1.3, 0.05], 'silicon', [nicheX, 1.0]);
  for (let i = 0; i < 3; i++) b.plaque('niche-slot', [0.66, 0.08, 0.08], 'rubber', [nicheX, 0.62 + i * 0.36]);

  hangingCable(b, rng.range(1.2, 1.5), 0.7, 'rubber', rng.next(), 0.7);

  b.standardSockets(2.4)
    .socket('chronicles', [nicheX, 0.5, ROOM.zActor])
    .socket('archivist', [designToRoomX(0.0), 0, ROOM.zActor])
    .socket('gate', [designToRoomX(-0.9), 0, ROOM.zActor])
    .socket('door.right', [designToRoomX(-0.9), 0, ROOM.zActor]);
  return b.spec();
}

export function buildCryptHall(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const b = new RoomBuilder('crypt_hall', 'Crypt hall');
  shell(b, { floor: 2, wall: 'pcbDark', ground: 'silicon', trim: 'rubber' });

  // A row of burial niches: narrow port arches, every other one barred, a chip plaque in each head.
  const xs = [3.3, 1.65, 0, -1.65, -3.3];
  xs.forEach((x, i) => {
    arch(b, 'niche-arch', x, 1.4, 3.9, 0.12, 'silicon', 0.9);
    if (i % 2 === 0) portGrille(b, x, 3.5, 0.9, 0.6, 5);
    else {
      b.plaque('niche-chip', [0.5, 0.62, 0.08], 'rubber', [x, 3.05]);
      b.plaque('niche-chip-line', [0.3, 0.05, 0.1], 'ink', [x, 3.14], { outline: false });
      b.plaque('niche-chip-line', [0.22, 0.05, 0.1], 'ink', [x, 2.98], { outline: false });
    }
  });
  b.plaque('frieze', [8.4, 0.16, 0.08], 'rubber', [0, 4.22]);
  led(b, 'phosphor', [xs[1]!, 3.42, onWall(0.12)], 0.5, 0.3);
  led(b, 'powerAmber', [xs[3]!, 3.42, onWall(0.12)], 0.35, 0.7);

  // Left wing: a tombstone and a snapped capacitor column.
  tombstone(b, 3.4, 0.74, 1.3, 'rubber', 0.58, rng.range(-0.1, -0.03));
  pillar(b, 2.5, 0.85, 0.24, 'silicon', 'rubber', 0.56);

  hangingCable(b, rng.range(-0.95, -0.7), 0.6, 'rubber', rng.next(), 0.7);
  hangingCable(b, rng.range(0.7, 0.95), 0.75, 'rubber', rng.next(), 0.7);

  b.standardSockets(2.3)
    .socket('plank', [designToRoomX(0.7), 0, ROOM.zActor])
    .socket('gargoyle', [designToRoomX(-0.6), 0, ROOM.zActor])
    .socket('door.down', [-3.6, 0, ROOM.zActor]);
  return b.spec();
}

export function buildChasm(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const b = new RoomBuilder('chasm', 'Bus chasm');
  shell(b, { floor: 2, wall: 'pcbDark', ground: 'silicon', trim: 'rubber', solidFloor: false });

  // The floor is the bus, and it is cut. Gap centred on the pit actor.
  const gapX = designToRoomX(0.3);
  const gapHalf = 0.8;
  const leftEdge = gapX + gapHalf; // screen-left lip
  const rightEdge = gapX - gapHalf;
  const farLeft = ROOM.halfWidth + ROOM.bleed;
  const leftW = farLeft - leftEdge;
  const rightW = rightEdge + farLeft;
  const zA = ROOM.zApron;
  b.box('floor', [leftW, ROOM.apron, 1.5], 'silicon', [leftEdge + leftW / 2, -ROOM.apron / 2, 0.25]);
  b.box('floor', [rightW, ROOM.apron, 1.5], 'silicon', [rightEdge - rightW / 2, -ROOM.apron / 2, 0.25]);
  b.box('floor-lip', [leftW, 0.07, 0.04], 'rubber', [leftEdge + leftW / 2, -0.035, zA - 0.02]);
  b.box('floor-lip', [rightW, 0.07, 0.04], 'rubber', [rightEdge - rightW / 2, -0.035, zA - 0.02]);
  b.box('pit', [gapHalf * 2 + 0.1, ROOM.apron + 0.1, 0.06], 'ink', [gapX, -ROOM.apron / 2 - 0.05, 0.9], { outline: false });

  // Bus traces along the apron, cut at both lips, with a connector edge where they stop.
  for (let i = 0; i < 3; i++) {
    const y = -0.2 - i * 0.13;
    b.box('bus-trace', [leftW - 0.14, 0.05, 0.03], 'copper', [leftEdge + leftW / 2 + 0.07, y, zA - 0.02], { outline: false });
    b.box('bus-trace', [rightW - 0.14, 0.05, 0.03], 'copper', [rightEdge - rightW / 2 - 0.07, y, zA - 0.02], { outline: false });
  }
  b.box('bus-edge', [0.1, 0.44, 0.05], 'gold', [leftEdge + 0.05, -0.33, zA - 0.03]);
  b.box('bus-edge', [0.1, 0.44, 0.05], 'gold', [rightEdge - 0.05, -0.33, zA - 0.03]);
  led(b, 'powerAmber', [leftEdge + 0.3, -0.09, zA - 0.04], 1.2, 0, 0.08);
  led(b, 'powerAmber', [rightEdge - 0.3, -0.09, zA - 0.04], 1.2, 0.5, 0.08);

  // The same bus on the wall, high up: it runs in from both sides and stops over the gap.
  for (let i = 0; i < 3; i++) {
    const y = 3.25 + i * 0.2;
    const stop = 0.5 + i * 0.22;
    trace(b, 'wall-bus', [[farLeft, y], [leftEdge + stop + 0.4, y], [leftEdge + stop, y - 0.4]], 0.08, 'rubber');
    trace(b, 'wall-bus', [[-farLeft, y], [rightEdge - stop * 0.4 - 0.2, y]], 0.08, 'rubber');
  }
  // A broken vault over the pit, and stalactite pins above it.
  arch(b, 'vault', gapX, 3.5, 4.55, 0.2, 'rubber', 0.8, 0.12);
  b.relief('stalactite-pins', combOutline(1.9, 0.75, 6, 0.42, 0.1, true, 0.95), 0.06, 'heatsink', [gapX, 4.7]);
  // Cut cables hang into the gap from the vault.
  hangingCable(b, gapX + 0.45, rng.range(1.5, 1.8), 'rubber', rng.next(), 0.72);
  hangingCable(b, gapX - 0.3, rng.range(1.0, 1.3), 'rubber', rng.next(), 0.72);

  // Left wing.
  tombstone(b, 3.4, 0.72, 1.2, 'rubber', 0.58, rng.range(0.03, 0.1));
  pillar(b, 2.45, 3.0, 0.2, 'silicon', 'rubber', 0.7);

  b.standardSockets(2.2)
    .socket('chasm', [gapX, 0, ROOM.zActor])
    .socket('bridge', [gapX, 0, ROOM.zActor])
    .socket('stairs', [designToRoomX(-0.7), 0, ROOM.zActor])
    .socket('door.down', [designToRoomX(-0.7), 0, ROOM.zActor]);
  return b.spec();
}
