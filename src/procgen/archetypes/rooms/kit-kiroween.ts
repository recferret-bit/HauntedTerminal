import type { ZoneId } from '../../core/palette.js';
import type { Vec2 } from '../../core/types.js';
import { onWall, round, type RoomBuilder } from './frame.js';
import { pipe } from './kit.js';

/** A flanged coolant pipe run with an optional translucent glass sight-tube collar. */
export function waterPipeRun(b: RoomBuilder, from: Vec2, to: Vec2, zone: ZoneId = 'copper', z = onWall(0.18), sightGlass = true): void {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (!sightGlass || len < 0.75) {
    pipe(b, from, to, 0.085, zone, z, 'rubber');
    return;
  }
  const ux = dx / len;
  const uy = dy / len;
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const gap = 0.22;
  pipe(b, from, [round(mx - ux * gap), round(my - uy * gap)], 0.085, zone, z, 'rubber');
  pipe(b, [round(mx + ux * gap), round(my + uy * gap)], to, 0.085, zone, z, 'rubber');
  const rotZ = round(Math.atan2(dy, dx) - Math.PI / 2);
  b.add('pipe-sight', { kind: 'cylinder', rTop: 0.115, rBottom: 0.115, height: 0.4, sides: 10 }, 'glass', [mx, my, z], {
    rot: [0, 0, rotZ],
  });
  b.add('pipe-coolant', { kind: 'cylinder', rTop: 0.065, rBottom: 0.065, height: 0.34, sides: 8 }, 'dataCyan', [mx, my, z], {
    rot: [0, 0, rotZ],
    outline: false,
  });
}
