import type { ModelSpec, Vec2 } from '../../core/types.js';
import { makeRng } from '../../core/rng.js';
import { designToRoomX, onWall, RoomBuilder, ROOM } from './frame.js';
import { arch, led, mirroredTrace, ramPillar, seams, shell } from './kit.js';

/**
 * Floor 3, the bus maze: mirrored traces, loopback frames, RAM-slot corridors. A hall of mirrors,
 * so everything on the wall is symmetric about x = 0. `silicon` walls, `pcbDark` traces, `dataCyan` lights.
 */

function frameOutline(w: number, h: number, t: number): Vec2[] {
  // A rectangular frame as one keyhole outline: outer loop, a hairline bridge, inner loop the other way round.
  const hw = w / 2, hh = h / 2, e = 0.002;
  return [
    [-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh], [-hw, -hh + e],
    [-hw + t, -hh + t], [-hw + t, hh - t], [hw - t, hh - t], [hw - t, -hh + t], [-hw + t + e, -hh + t],
  ];
}

/** A loopback frame: a mirror that shows a corridor of smaller and smaller frames, ending in one cyan pixel. */
function loopbackFrame(b: RoomBuilder, x: number, y: number, w: number, h: number, phase: number): void {
  b.plaque('loop-glass', [w - 0.1, h - 0.1, 0.03], 'ink', [x, y], { outline: false, texture: 'tex.glyph-rain' });
  b.relief('loop-frame', frameOutline(w, h, 0.12), 0.12, 'rubber', [x, y]);
  b.relief('loop-echo', frameOutline(w * 0.62, h * 0.62, 0.07), 0.07, 'pcbDark', [x, y]);
  b.relief('loop-echo', frameOutline(w * 0.32, h * 0.32, 0.05), 0.06, 'pcbDark', [x, y]);
  led(b, 'dataCyan', [x, y, onWall(0.08)], 0.45, phase, 0.08);
}

export function buildCell(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const b = new RoomBuilder('cell', 'Loopback cell');
  shell(b, { floor: 3, wall: 'silicon', ground: 'rubber', trim: 'pcbDark' });

  // North, east, south: three identical frames above head height.
  const fy = 3.38;
  [2.65, 0, -2.65].forEach((x, i) => loopbackFrame(b, x, fy, 1.5, 1.7, (rng.next() + i / 3) % 1));

  // Mirrored traces climb from the floor to the frames and loop from one frame to the next.
  mirroredTrace(b, 'trace', [[4.2, 3.0], [3.75, 3.0], [3.4, 3.35]], 0.08, 'pcbDark');
  mirroredTrace(b, 'trace', [[1.9, 0.14], [1.9, 1.2], [2.25, 1.55], [2.25, 2.5]], 0.08, 'pcbDark');
  mirroredTrace(b, 'trace', [[1.3, 0.14], [1.3, 2.0], [0.45, 2.5]], 0.08, 'pcbDark');
  mirroredTrace(b, 'trace-loop', [[1.9, 4.24], [1.9, 4.5], [0.75, 4.5], [0.75, 4.24]], 0.08, 'pcbDark');

  // RAM-slot corridor: the cell is a slot, with latch clips at both ends.
  ramPillar(b, 3.55, 2.3, 0.62);
  ramPillar(b, 2.75, 1.5, 0.52);
  b.box('slot-latch', [0.3, 1.0, 0.3], 'rubber', [-3.95, 0.5, 0.6]);
  b.box('slot-latch-tab', [0.42, 0.14, 0.34], 'pcbDark', [-3.9, 1.06, 0.6]);

  b.standardSockets(1.8)
    .socket('mirrors', [designToRoomX(-0.2), 0, ROOM.zActor])
    .socket('mirror.north', [2.65, fy, onWall(0.12)])
    .socket('mirror.east', [0, fy, onWall(0.12)])
    .socket('mirror.south', [-2.65, fy, onWall(0.12)])
    .socket('flood', [0, 0, 0.3]);
  return b.spec();
}

export function buildLabHall(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const b = new RoomBuilder('lab_hall', 'Bus maze hall');
  shell(b, { floor: 3, wall: 'silicon', ground: 'rubber', trim: 'pcbDark' });
  seams(b, [0], 'pcbDark', 0.14, 2.3);

  // The big loopback over the hall: a ring of trace with an arrowhead chasing its own tail.
  const ringY = 3.45;
  const z = onWall(0.12);
  b.add('loop-ring', { kind: 'torus', radius: 0.82, tube: 0.07 }, 'rubber', [0, ringY, z]);
  b.add('loop-ring-inner', { kind: 'torus', radius: 0.46, tube: 0.045 }, 'pcbDark', [0, ringY, z]);
  b.relief('loop-arrow', [[-0.2, -0.16], [0.16, 0], [-0.2, 0.16], [-0.1, 0]], 0.1, 'rubber', [0, ringY + 0.82]);
  led(b, 'dataCyan', [0, ringY, onWall(0.08)], 0.4, rng.next(), 0.12);

  // Mirrored bus: traces fan out from the ring to the corners and down to the floor.
  mirroredTrace(b, 'trace', [[0.9, ringY], [2.2, ringY], [2.9, 4.15], [4.2, 4.15]], 0.09, 'pcbDark');
  mirroredTrace(b, 'trace', [[0.82, ringY - 0.42], [1.75, 2.55], [4.2, 2.55]], 0.09, 'pcbDark');
  mirroredTrace(b, 'trace', [[0.5, ringY - 0.7], [0.5, 2.2], [1.25, 1.45], [1.25, 0.14]], 0.09, 'pcbDark');
  mirroredTrace(b, 'trace', [[0.6, ringY + 0.62], [1.5, 4.55], [4.2, 4.55]], 0.09, 'pcbDark');
  led(b, 'dataCyan', [3.2, 4.15, onWall(0.06)], 0.7, 0.2, 0.07);
  led(b, 'dataCyan', [-3.2, 4.15, onWall(0.06)], 0.7, 0.7, 0.07);

  // RAM-stick colonnade.
  ramPillar(b, 3.6, 2.9, 0.62);
  ramPillar(b, 2.6, 2.9, 0.62);
  ramPillar(b, -3.95, 2.9, 0.7);

  // The pedestal niche, dark on dark, behind where the runes go.
  const pedestalX = designToRoomX(-0.3);
  arch(b, 'pedestal-niche', pedestalX, 1.15, 1.95, 0.1, 'rubber', 0.3, 0.06);
  b.box('pedestal', [0.7, 0.3, 0.4], 'pcbDark', [pedestalX, 0.15, 0.62]);

  b.standardSockets(2.2)
    .socket('altar', [designToRoomX(0.5), 0, ROOM.zActor])
    .socket('pedestal', [pedestalX, 0.3, 0.45])
    .socket('mimic', [pedestalX, 0.6, ROOM.zActor])
    .socket('door.down', [-3.6, 0, ROOM.zActor]);
  return b.spec();
}
