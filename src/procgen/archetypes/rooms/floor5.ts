import type { ModelSpec, Vec2 } from '../../core/types.js';
import { makeRng } from '../../core/rng.js';
import { designToRoomX, onWall, RoomBuilder, ROOM } from './frame.js';
import { boltOutline, combOutline, pillar, shell } from './kit.js';

/**
 * Floor 5, the kernel core: a cracked CPU die in its socket, a storm in the cracks.
 * `silicon` walls, a `rubber` die, `gold` pins at the very top, `dataCyan` lightning. The boss brings the magenta.
 */
export function buildCore(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const b = new RoomBuilder('core', 'Kernel core');
  shell(b, { floor: 5, wall: 'silicon', ground: 'rubber', trim: 'pcbDark' });

  // The die: a huge package on the wall, split in two by a crack, the halves slipped apart.
  const dieX = 0.2, dieY = 2.85, half = 1.62;
  const crack: Vec2[] = [[0.25, half], [-0.2, 0.75], [0.3, 0.1], [-0.25, -0.7], [0.1, -half]];
  const leftHalf: Vec2[] = [[half, -half], [half, half], ...crack.map(([x, y]): Vec2 => [x + 0.07, y])];
  const rightHalf: Vec2[] = [[-half, half], [-half, -half], ...crack.map(([x, y]): Vec2 => [x - 0.07, y]).reverse()];
  b.relief('die-socket', [[-1.95, -1.95], [1.95, -1.95], [1.95, 1.95], [-1.95, 1.95]], 0.04, 'pcbDark', [dieX, dieY]);
  b.relief('die-half', leftHalf, 0.12, 'rubber', [dieX + 0.05, dieY + 0.06]);
  b.relief('die-half', rightHalf, 0.12, 'rubber', [dieX - 0.05, dieY - 0.08], { rot: [0, 0, -0.035] });
  // Lightning inside the crack, only above head height.
  b.relief('crack-light', crack.slice(0, 3).map(([x, y], i): Vec2 => [x + (i === 1 ? 0.03 : 0), y]).concat(crack.slice(0, 3).reverse().map(([x, y]): Vec2 => [x - 0.05, y])), 0.07, 'dataCyan', [dieX, dieY], {
    outline: false,
    anim: { type: 'blink', speed: 1.7, phase: rng.next() },
  });
  // Die markings: a notch and two laser-etched lines, dark on dark.
  b.plaque('die-mark', [0.9, 0.07, 0.14], 'silicon', [dieX + 0.85, dieY + 1.2], { outline: false });
  b.plaque('die-mark', [0.6, 0.07, 0.14], 'silicon', [dieX + 1.0, dieY + 1.02], { outline: false });
  // Socket pins along the top edge of the die.
  b.relief('socket-pins', combOutline(3.5, 0.2, 18, 0.4, 0.05), 0.06, 'gold', [dieX, dieY + 1.66]);

  // Storm bolts in the wall at both upper corners.
  b.relief('storm-bolt', boltOutline(1.5, 0.12, 5, 0.22, 1), 0.04, 'dataCyan', [3.3, 4.7], {
    outline: false,
    rot: [0, 0, -0.25],
    anim: { type: 'blink', speed: 0.9, phase: rng.next() },
  });
  b.relief('storm-bolt', boltOutline(1.2, 0.1, 4, 0.2, -1), 0.04, 'dataCyan', [-3.2, 4.7], {
    outline: false,
    rot: [0, 0, 0.3],
    anim: { type: 'blink', speed: 0.6, phase: rng.next() },
  });

  // Lightning-rod spires: capacitor pillars with heatsink points. Left wing, and one at the far right edge.
  const spire = (x: number, h: number, z: number): void => {
    pillar(b, x, h, 0.2, 'silicon', 'rubber', z);
    b.add('spire-point', { kind: 'cone', radius: 0.14, height: 0.7, sides: 6 }, 'heatsink', [x, h + 0.57, z]);
  };
  spire(3.55, 2.9, 0.66);
  spire(2.75, 1.9, 0.56);
  spire(-4.0, 2.4, 0.7);

  // The floor is breaking up: shards in the foreground at the very edges, and a cracked apron.
  b.add('floor-shard', { kind: 'extrude', outline: [[-0.45, 0], [0.5, 0], [0.3, 0.42], [-0.1, 0.3]], depth: 0.12 }, 'silicon', [3.85, -0.02, ROOM.zFront]);
  b.add('floor-shard', { kind: 'extrude', outline: [[-0.4, 0], [0.42, 0], [0.05, 0.36]], depth: 0.12 }, 'silicon', [-3.95, -0.02, ROOM.zFront]);
  for (const x of [2.2, -0.9, -2.9]) {
    b.add('floor-crack', { kind: 'extrude', outline: boltOutline(0.5, 0.09, 3, 0.1, x > 0 ? 1 : -1), depth: 0.02 }, 'ink', [x + rng.range(-0.2, 0.2), -0.05, ROOM.zApron - 0.02], { outline: false });
  }

  b.standardSockets(2.4)
    .socket('boss', [designToRoomX(0.2), 1.3, ROOM.zActor])
    .socket('core_dump', [designToRoomX(1.3), 0.5, ROOM.zActor])
    .socket('wakeup', [designToRoomX(-0.4), 0, ROOM.zActor])
    .socket('devnull', [designToRoomX(-1.2), 1.0, ROOM.zActor])
    .socket('portal', [designToRoomX(-1.2), 1.0, ROOM.zActor])
    .socket('die', [dieX, dieY, onWall(0.12)]);
  return b.spec();
}
