import type { ModelSpec } from '../../core/types.js';
import { makeRng } from '../../core/rng.js';
import { designToRoomX, onWall, RoomBuilder, ROOM } from './frame.js';
import { combOutline, fan, led, pipe, seams, shell } from './kit.js';

/**
 * Floor 4, the CPU cooling furnace: heatsink fins, heat pipes, fans, the glowing die.
 * `rubber` walls, `silicon` iron, `copper` pipes, `heatsink` fins above head height, `powerAmber` / `lockRed` heat.
 */

/** A bank of heatsink fins on the upper wall, like organ pipes. */
function finBank(b: RoomBuilder, x: number, bottom: number, width: number, height: number, fins: number): void {
  b.relief('fin-bank', combOutline(width, height, fins, 0.52, 0.16), 0.12, 'heatsink', [x, bottom], { texture: 'tex.heatsink-fins' });
}

export function buildCatwalk(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const b = new RoomBuilder('catwalk', 'Cooling catwalk');
  shell(b, { floor: 4, wall: 'rubber', ground: 'silicon', trim: 'silicon', solidFloor: false });
  seams(b, [-2.8, -0.6, 1.6], 'silicon', 0.14, 2.3);

  // The catwalk: a thin deck on struts over a dark drop, with a rail behind the actors.
  const W = ROOM.width + ROOM.bleed * 2;
  b.box('deck', [W, 0.16, 1.4], 'silicon', [0, -0.08, 0.2]);
  b.box('deck-lip', [W, 0.06, 0.04], 'heatsink', [0, -0.03, ROOM.zApron - 0.02]);
  b.box('drop', [W, 0.5, 0.06], 'ink', [0, -0.4, 0.9], { outline: false });
  b.add('deck-struts', { kind: 'extrude', outline: combOutline(W, 0.5, 9, 0.16, 0.06, true, 0.5), depth: 0.1 }, 'rubber', [0, -0.16, ROOM.zApron + 0.1]);
  b.add('rail', { kind: 'extrude', outline: combOutline(W, 0.92, 17, 0.14, 0.05, true), depth: 0.05 }, 'silicon', [0, 0.98, 0.78]);

  // Heat pipes along the upper wall, dropping through the deck in the left wing.
  const zp = onWall(0.2);
  pipe(b, [-4.2, 4.1], [3.45, 4.1], 0.1, 'copper', zp, null);
  pipe(b, [-4.2, 3.72], [2.75, 3.72], 0.1, 'copper', zp, null);
  pipe(b, [3.45, 4.1], [3.45, 0], 0.1, 'copper', zp);
  pipe(b, [2.75, 3.72], [2.75, 0], 0.1, 'copper', zp);

  // The valve wheel sits on the pipes above the valve socket; one red light says it is shut.
  const valveX = designToRoomX(0.4);
  b.add('valve-wheel', { kind: 'torus', radius: 0.3, tube: 0.05 }, 'heatsink', [valveX, 3.91, 0.56]);
  b.box('valve-spoke', [0.6, 0.06, 0.04], 'heatsink', [valveX, 3.91, 0.56]);
  b.box('valve-spoke', [0.06, 0.6, 0.04], 'heatsink', [valveX, 3.91, 0.56]);
  b.plaque('valve-body', [0.34, 0.62, 0.3], 'silicon', [valveX, 3.91]);
  led(b, 'lockRed', [valveX - 0.5, 3.36, onWall(0.06)], 0.9, rng.next(), 0.1);

  // A pressure gauge and a small fin bank.
  b.add('gauge', { kind: 'cylinder', rTop: 0.26, rBottom: 0.26, height: 0.08, sides: 14 }, 'plastic', [0.9, 3.0, onWall(0.08)], { rot: [Math.PI / 2, 0, 0] });
  b.box('gauge-needle', [0.05, 0.24, 0.02], 'ink', [0.9 + 0.06, 3.06, onWall(0.08) - 0.05], { rot: [0, 0, rng.range(0.5, 1.0)], outline: false });
  finBank(b, -3.0, 2.62, 1.7, 0.8, 9);

  // Left wing: an intake fan between the pipes and the edge.
  fan(b, 2.05, 3.0, 1.0, 0.74, 'silicon', 'heatsink', 0.5);

  b.standardSockets(2.2)
    .socket('valve', [valveX, 0, ROOM.zActor])
    .socket('dump', [designToRoomX(-0.6), 0.5, ROOM.zActor])
    .socket('door.right', [-3.6, 0, ROOM.zActor]);
  return b.spec();
}

export function buildFurnace(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const b = new RoomBuilder('furnace', 'CPU furnace hall');
  shell(b, { floor: 4, wall: 'rubber', ground: 'silicon', trim: 'silicon' });
  seams(b, [-0.9, 1.75], 'silicon', 0.14, 2.3);

  // The glowing die in its heat spreader: the furnace mouth, above head height.
  const dieX = 0.55, dieY = 3.55;
  b.plaque('spreader', [1.7, 1.5, 0.14], 'copper', [dieX, dieY]);
  b.plaque('spreader-well', [1.1, 0.95, 0.18], 'silicon', [dieX, dieY]);
  b.plaque('die', [0.72, 0.6, 0.22], 'powerAmber', [dieX, dieY], { anim: { type: 'pulse', speed: 0.5, amp: 0.05 } });
  for (const sx of [1, -1]) for (const sy of [1, -1]) {
    b.plaque('spreader-bolt', [0.12, 0.12, 0.2], 'heatsink', [dieX + sx * 0.7, dieY + sy * 0.6]);
  }

  // Heatsink organ on the screen-right side, over where the fork bomb stands.
  finBank(b, -1.55, 3.05, 1.5, 1.45, 8);
  finBank(b, -3.2, 3.05, 1.5, 1.2, 8);
  // Heat pipes from the die into the organ and down the far edge.
  const zp = onWall(0.2);
  pipe(b, [dieX - 0.85, 3.3], [-4.2, 3.3], 0.09, 'copper', zp - 0.1, null);
  pipe(b, [dieX - 0.85, 2.72], [-4.2, 2.72], 0.09, 'copper', zp, null);
  pipe(b, [dieX + 0.85, 3.9], [1.9, 3.9], 0.09, 'copper', zp, null);

  // Left wing: the fan tower.
  b.box('fan-tower', [1.7, 4.3, 0.3], 'silicon', [3.05, 2.15, 0.72]);
  fan(b, 3.05, 3.3, 1.4, 0.56, 'rubber', 'heatsink', 0.9);
  fan(b, 3.05, 1.2, 1.4, 0.56, 'rubber', 'heatsink', 0.75);
  led(b, 'lockRed', [3.75, 2.25, 0.55], 1.5, rng.next());

  // Ember slits in the floor apron.
  for (const x of [1.4, -0.5, -2.6]) {
    b.box('ember', [0.5, 0.06, 0.03], 'powerAmber', [x + rng.range(-0.15, 0.15), -0.3, ROOM.zApron - 0.02], {
      outline: false,
      anim: { type: 'blink', speed: 0.25, phase: rng.next() },
    });
  }

  b.standardSockets(2.4)
    .socket('boss', [designToRoomX(0.2), 0, ROOM.zActor])
    .socket('minion', [designToRoomX(-1.0), 0, ROOM.zActor])
    .socket('spawn', [designToRoomX(-0.4), 0, ROOM.zActor])
    .socket('die', [dieX, dieY, onWall(0.22)])
    .socket('door.down', [-3.6, 0, ROOM.zActor]);
  return b.spec();
}
