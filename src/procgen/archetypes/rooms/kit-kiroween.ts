import { pickBoardTheme, type ZoneId } from '../../core/palette.js';
import type { Vec2, Vec3 } from '../../core/types.js';
import { outlineStroke } from '../../kit/shapes.js';
import { onWall, ROOM, round, type RoomBuilder } from './frame.js';
import { led, pipe } from './kit.js';

/**
 * Room-scale Kiroween, cooling, indicator, and colored-textolite dressing helpers.
 * Callers place these strictly in the upper wall (`y > 2.45`), left wing (`x > 1.85`), or floor apron (`y < 0`)
 * so `ACTOR_BAND` remains dark and quiet behind characters.
 */

/** Picks a colored textolite zone + tileable texture deterministically from a room seed. */
export const roomBoardTheme = pickBoardTheme;

/** A radial solder-wire cobweb mounted flat on the upper wall. */
export function radialCobweb(b: RoomBuilder, x: number, y: number, radius: number, zone: ZoneId = 'heatsink'): void {
  const cross = (ang: number, depth: number): void => {
    b.plaque('web-spoke', [round(radius * 2), 0.055, depth], zone, [x, y], { rot: [0, 0, ang] });
  };
  cross(0.15, 0.025);
  cross(Math.PI / 2 + 0.15, 0.025);
  cross(Math.PI / 4 + 0.15, 0.045);
  cross(-Math.PI / 4 + 0.15, 0.045);
  const arcPts = (from: number, to: number, r: number): Vec2[] => {
    const out: Vec2[] = [];
    for (let i = 0; i <= 5; i++) {
      const a = from + ((to - from) * i) / 5;
      out.push([round(Math.cos(a) * r), round(Math.sin(a) * r)]);
    }
    return out;
  };
  b.relief('web-arc', outlineStroke(arcPts(-0.15, Math.PI + 0.15, radius * 0.72), 0.05), 0.065, zone, [x, y]);
  b.relief('web-arc', outlineStroke(arcPts(Math.PI - 0.15, Math.PI * 2 + 0.15, radius * 0.72), 0.05), 0.065, zone, [x, y]);
  b.plaque('web-hub', [0.14, 0.14, 0.085], 'silicon', [x, y]);
}

/** An 8-pin IC spider dangling from the ceiling beam in upper space or left wing. */
export function danglingSpider(b: RoomBuilder, x: number, drop: number, bodyZone: ZoneId = 'silicon', phase = 0, z = 0.62): void {
  const top = ROOM.height - 0.3;
  const pivot: Vec3 = [x, top, z];
  const anim = { type: 'swing' as const, axis: 'z' as const, amp: 0.09, speed: 0.35, phase, pivot };
  const bodyY = round(top - drop);
  b.box('spider-thread', [0.045, drop, 0.04], 'solder', [x, round(top - drop / 2), z], { anim });
  b.box('spider-body', [0.28, 0.2, 0.1], bodyZone, [x, bodyY, z - 0.01], { anim });
  const legs = outlineStroke([[-0.32, 0.1], [-0.18, 0.02], [0.18, 0.02], [0.32, 0.1]], 0.048);
  b.add('spider-legs', { kind: 'extrude', outline: legs, depth: 0.045 }, 'solder', [x, bodyY + 0.04, z - 0.02], { anim });
}

/** A folded-PCB bat hanging on the upper wall with gently flapping wings. */
export function perchedBat(b: RoomBuilder, x: number, y: number, span: number, wingZone: ZoneId = 'pcbBlack', phase = 0): void {
  const wingZ = onWall(0.08);
  const bodyZ = onWall(0.135);
  const wing = (sx: number): Vec2[] => [
    [0, 0.06],
    [round(span * 0.4 * sx), 0.14],
    [round(span * sx), 0.09],
    [round(span * 0.7 * sx), -0.11],
    [round(span * 0.2 * sx), -0.05],
    [0, -0.06],
  ];
  b.plaque('bat-body', [0.16, 0.22, 0.135], 'silicon', [x, y]);
  b.add('bat-wing.l', { kind: 'extrude', outline: wing(1), depth: 0.06 }, wingZone, [x + 0.06, y + 0.02, wingZ], {
    anim: { type: 'swing', axis: 'z', amp: 0.2, speed: 0.85, phase, pivot: [x + 0.06, y + 0.02, wingZ] },
  });
  b.add('bat-wing.r', { kind: 'extrude', outline: wing(-1), depth: 0.06 }, wingZone, [x - 0.06, y + 0.02, wingZ], {
    anim: { type: 'swing', axis: 'z', amp: -0.2, speed: 0.85, phase, pivot: [x - 0.06, y + 0.02, wingZ] },
  });
  const eyeZ = round(bodyZ - 0.078);
  b.box('bat-eye.l', [0.04, 0.04, 0.02], 'powerAmber', [x + 0.04, y + 0.04, eyeZ], { outline: false });
  b.box('bat-eye.r', [0.04, 0.04, 0.02], 'powerAmber', [x - 0.04, y + 0.04, eyeZ], { outline: false });
}

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

/** Upper-wall or left-wing diagnostic indicator LED bar on a dark bezel. */
export function indicatorPanel(b: RoomBuilder, x: number, y: number, zones: readonly ZoneId[] = ['phosphor', 'powerAmber', 'lockRed']): void {
  const w = zones.length * 0.18 + 0.14;
  b.plaque('ind-panel', [w, 0.22, 0.08], 'rubber', [x, y]);
  const start = x - ((zones.length - 1) * 0.16) / 2;
  const ledZ = round(onWall(0.08) - 0.055);
  zones.forEach((z, i) => {
    led(b, z, [round(start + i * 0.16), y, ledZ], 0.65 + i * 0.25, i * 0.22, 0.075);
  });
}

/** Colored textolite board plaque with surface IC chips (strictly outside ACTOR_BAND). */
export function textoliteBoardPlaque(b: RoomBuilder, x: number, y: number, w: number, h: number, theme: { zone: ZoneId; texture: string }): void {
  b.plaque('pcb-board', [w, h, 0.07], theme.zone, [x, y], { texture: theme.texture });
  b.plaque('pcb-chip', [round(w * 0.34), round(h * 0.44), 0.1], 'silicon', [x + round(w * 0.16), y]);
  b.plaque('pcb-chip', [round(w * 0.24), round(h * 0.34), 0.1], 'silicon', [x - round(w * 0.22), y - round(h * 0.08)]);
}
