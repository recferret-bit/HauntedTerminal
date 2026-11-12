import type { ZoneId } from '../../core/palette.js';
import type { Vec2, Vec3 } from '../../core/types.js';
import { blink, onWall, ROOM, round, type RoomBuilder } from './frame.js';

/**
 * Room part-builders: gothic shapes made out of hardware. Each adds a handful of parts to a RoomBuilder.
 * Kept local to rooms on purpose (rooms need big, cheap, low-contrast versions of the kit greebles).
 * Every outline here is one `extrude` part, so a 20-fin heatsink costs one part, not twenty.
 */

const FULL_W = ROOM.width + ROOM.bleed * 2;

export interface ShellOptions {
  floor: 1 | 2 | 3 | 4 | 5;
  wall: ZoneId;
  ground: ZoneId;
  trim: ZoneId;
  /** Set false when the room builds its own floor (chasm, catwalk). */
  solidFloor?: boolean;
  groundTexture?: string;
}

/** Back wall, floor block with its apron, floor lip, skirting and a ceiling beam. */
export function shell(b: RoomBuilder, o: ShellOptions): void {
  b.box('wall', [FULL_W, ROOM.height, 0.1], o.wall, [0, ROOM.height / 2, ROOM.zWallFace + 0.05], {
    texture: `tex.backdrop.floor${o.floor}`,
  });
  if (o.solidFloor !== false) {
    b.box('floor', [FULL_W, ROOM.apron, 1.5], o.ground, [0, -ROOM.apron / 2, 0.25], { texture: o.groundTexture });
    b.box('floor-lip', [FULL_W, 0.07, 0.04], o.trim, [0, -0.035, ROOM.zApron - 0.02]);
  }
  b.plaque('skirting', [FULL_W, 0.14, 0.05], o.trim, [0, 0.07]);
  b.box('ceiling-beam', [FULL_W, 0.3, 0.45], o.trim, [0, ROOM.height - 0.15, 0.68]);
}

/** A capacitor can standing as a pillar: body, vent cap, base ring. */
export function pillar(b: RoomBuilder, x: number, height: number, radius: number, zone: ZoneId, capZone: ZoneId, z = 0.62): void {
  b.box('pillar-base', [radius * 2.5, 0.14, radius * 2.5], capZone, [x, 0.07, z]);
  b.add('pillar', { kind: 'cylinder', rTop: radius, rBottom: radius, height, sides: 10 }, zone, [x, height / 2 + 0.1, z]);
  b.add('pillar-cap', { kind: 'cylinder', rTop: radius * 0.8, rBottom: radius * 1.12, height: 0.12, sides: 10 }, capZone, [x, height + 0.16, z]);
}

/**
 * An arch as one outline, origin at the middle of its foot line. `sharp` 0 is a round port-shell arch,
 * 1 is a pointed gothic one. `rise` is the height of the curved part.
 */
export function archOutline(width: number, height: number, thick: number, sharp = 0.6, rise = width * 0.6, steps = 6): Vec2[] {
  const curve = (halfW: number, top: number, shoulder: number): Vec2[] => {
    const pts: Vec2[] = [];
    const span = (Math.PI / 2) * (1 - 0.35 * sharp);
    for (let i = 0; i <= steps * 2; i++) {
      const t = i / steps - 1; // −1 (screen-right foot) .. +1
      const a = (1 - Math.abs(t)) * span;
      // Leaves the shoulder going straight up; with span < 90° the two sides meet at a point.
      const x = Math.sign(t) * halfW * (1 - (1 - Math.cos(a)) / (1 - Math.cos(span)));
      const y = shoulder + ((top - shoulder) * Math.sin(a)) / Math.sin(span);
      pts.push([round(x), round(y)]);
    }
    return pts;
  };
  const shoulder = height - rise;
  const outer = curve(width / 2, height, shoulder);
  const inner = curve(width / 2 - thick, height - thick * 1.25, shoulder).reverse();
  return [[-width / 2, 0], ...outer, [width / 2, 0], [width / 2 - thick, 0], ...inner, [-width / 2 + thick, 0]];
}

export function arch(b: RoomBuilder, name: string, x: number, width: number, height: number, thick: number, zone: ZoneId, sharp = 0.6, depth = 0.1): void {
  b.relief(name, archOutline(width, height, thick, sharp), depth, zone, [x, 0]);
}

/**
 * A comb: a bar with teeth. Teeth up = heatsink fins or balusters, teeth down = port pins, a portcullis, stalactites.
 * Origin: middle of the bar's outer edge (the bottom when teeth point up, the top when they point down).
 */
export function combOutline(width: number, height: number, teeth: number, fill = 0.5, bar = 0.08, down = false, taper = 0): Vec2[] {
  const pitch = width / teeth;
  const tw = pitch * fill;
  const pts: Vec2[] = [[-width / 2, 0], [width / 2, 0], [width / 2, bar]];
  for (let i = teeth - 1; i >= 0; i--) {
    const x0 = -width / 2 + i * pitch + (pitch - tw) / 2;
    const x1 = x0 + tw;
    const inset = (tw / 2) * taper;
    pts.push([x1, bar], [x1 - inset, height], [x0 + inset, height], [x0, bar]);
  }
  pts.push([-width / 2, bar]);
  const out = pts.map(([x, y]): Vec2 => [round(x), round(down ? -y : y)]);
  return down ? out.reverse() : out;
}

/** A polyline with thickness, mitred: PCB traces and bus lines. */
export function traceOutline(path: Vec2[], width: number): Vec2[] {
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  const normal = (a: Vec2, c: Vec2): Vec2 => {
    const dx = c[0] - a[0], dy = c[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  };
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    const n0 = i > 0 ? normal(path[i - 1]!, p) : normal(p, path[i + 1]!);
    const n1 = i < path.length - 1 ? normal(p, path[i + 1]!) : n0;
    let mx = n0[0] + n1[0], my = n0[1] + n1[1];
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml; my /= ml;
    const k = width / 2 / Math.max(0.35, mx * n0[0] + my * n0[1]);
    left.push([round(p[0] + mx * k), round(p[1] + my * k)]);
    right.push([round(p[0] - mx * k), round(p[1] - my * k)]);
  }
  return [...left, ...right.reverse()];
}

export function trace(b: RoomBuilder, name: string, path: Vec2[], width: number, zone: ZoneId, depth = 0.03): void {
  b.relief(name, traceOutline(path, width), depth, zone, [0, 0]);
}

/** The same trace on both sides of x = 0: the hall-of-mirrors motif. */
export function mirroredTrace(b: RoomBuilder, name: string, path: Vec2[], width: number, zone: ZoneId): void {
  trace(b, name, path, width, zone);
  trace(b, name, path.map(([x, y]): Vec2 => [-x, y]), width, zone);
}

/** A status LED: a small unlit-outline square that blinks. Signal zones only. */
export function led(b: RoomBuilder, zone: ZoneId, pos: Vec3, speed = 0.8, phase = 0, size = 0.09): void {
  b.box('led', [size, size, 0.04], zone, pos, { outline: false, anim: blink(speed, phase) });
}

/** A case fan in a square frame. The blades are one pinwheel outline tagged `spin`. */
export function fan(b: RoomBuilder, x: number, y: number, size: number, z: number, frameZone: ZoneId, bladeZone: ZoneId, speed = 0.7): void {
  const r = size * 0.42;
  b.box('fan-frame', [size, size, 0.16], frameZone, [x, y, z]);
  b.add('fan-well', { kind: 'cylinder', rTop: r, rBottom: r, height: 0.05, sides: 14 }, 'ink', [x, y, z - 0.09], { rot: [Math.PI / 2, 0, 0], outline: false });
  const blades: Vec2[] = [];
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const at = (ang: number, rad: number): Vec2 => [round(Math.cos(a + ang) * rad), round(Math.sin(a + ang) * rad)];
    blades.push(at(-0.5, r * 0.22), at(-0.3, r * 0.92), at(0.35, r * 0.86), at(0.62, r * 0.22));
  }
  b.add('fan-blades', { kind: 'extrude', outline: blades, depth: 0.04 }, bladeZone, [x, y, z - 0.13], {
    anim: { type: 'spin', axis: 'z', speed, pivot: [x, y, z - 0.13] },
  });
  b.add('fan-hub', { kind: 'cylinder', rTop: r * 0.2, rBottom: r * 0.2, height: 0.05, sides: 8 }, frameZone, [x, y, z - 0.16], { rot: [Math.PI / 2, 0, 0] });
}

/** A ribbon cable sagging across an upper corner like a cobweb. `side` +1 is the screen-left corner. */
export function cobweb(b: RoomBuilder, side: 1 | -1, size: number, zone: ZoneId): void {
  const x = side * ROOM.halfWidth;
  const top = ROOM.height - 0.3;
  const o: Vec2[] = [[0, 0], [-side * size, 0]];
  for (let i = 1; i <= 5; i++) {
    const t = i / 6;
    // A sagging hypotenuse: pulled toward the corner.
    const sag = Math.sin(t * Math.PI) * size * 0.28;
    o.push([round(-side * (size * (1 - t) - sag * 0.7)), round(-size * 0.85 * t + sag * 0.7)]);
  }
  o.push([0, -size * 0.85]);
  b.relief('ribbon-cobweb', o, 0.04, zone, [x, top], { texture: 'tex.ribbon-cable' });
}

/** A cable hanging from the ceiling beam, swinging a little. */
export function hangingCable(b: RoomBuilder, x: number, length: number, zone: ZoneId, phase = 0, z = 0.6): void {
  const top = ROOM.height - 0.3;
  b.add(
    'cable',
    { kind: 'tube', path: [[0, 0, 0], [0.05, -length * 0.5, 0], [-0.04, -length * 0.85, 0], [0.1, -length, 0]], radius: 0.035 },
    zone,
    [x, top, z],
    { anim: { type: 'swing', axis: 'z', speed: 0.22, amp: 0.07, phase, pivot: [x, top, z] } },
  );
}

/** A disk platter (or any disc) hung flat on the wall, with a hub. */
export function platter(b: RoomBuilder, x: number, y: number, radius: number, zone: ZoneId, hubZone: ZoneId, lift = 0): void {
  const z = onWall(0.05) - lift;
  b.add('platter', { kind: 'cylinder', rTop: radius, rBottom: radius, height: 0.05, sides: 16 }, zone, [x, y, z], { rot: [Math.PI / 2, 0, 0], texture: 'tex.platter' });
  b.add('platter-hub', { kind: 'cylinder', rTop: radius * 0.28, rBottom: radius * 0.28, height: 0.05, sides: 8 }, hubZone, [x, y, z - 0.04], { rot: [Math.PI / 2, 0, 0] });
}

/** A log tombstone: a chip package stood on end, with ink lines where the FATAL entries are. */
export function tombstone(b: RoomBuilder, x: number, width: number, height: number, zone: ZoneId, z = 0.6, lean = 0): void {
  const hw = width / 2;
  const s = height - hw * 0.7;
  const o: Vec2[] = [[-hw, 0], [hw, 0], [hw, s], [hw * 0.7, s + hw * 0.5], [0, height], [-hw * 0.7, s + hw * 0.5], [-hw, s]];
  b.add('tombstone', { kind: 'extrude', outline: o, depth: 0.2 }, zone, [x, 0, z], { rot: [0, 0, lean] });
  for (let i = 0; i < 3; i++) {
    const w = width * (0.62 - i * 0.12);
    b.box('tombstone-line', [w, 0.05, 0.02], 'ink', [x - lean * (s * 0.4), s * (0.78 - i * 0.2), z - 0.11], { rot: [0, 0, lean], outline: false });
  }
}

/** A RAM stick standing in its slot like a tall narrow pillar. The gold teeth are hidden in the slot. */
export function ramPillar(b: RoomBuilder, x: number, height: number, z = 0.62): void {
  b.box('ram-slot', [0.82, 0.2, 0.3], 'rubber', [x, 0.1, z]);
  b.box('ram-board', [0.62, height, 0.08], 'pcbDark', [x, 0.2 + height / 2, z]);
  const chips = Math.max(2, Math.floor(height / 0.75));
  for (let i = 0; i < chips; i++) {
    b.box('ram-chip', [0.42, 0.46, 0.06], 'silicon', [x, 0.2 + (height / chips) * (i + 0.5), z - 0.06]);
  }
}

/** A heat pipe: a straight run between two points on the XY plane, with a flange at each end. */
export function pipe(b: RoomBuilder, from: Vec2, to: Vec2, radius: number, zone: ZoneId, z: number, flangeZone: ZoneId | null = 'rubber'): void {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  const rot: Vec3 = [0, 0, round(Math.atan2(dy, dx) - Math.PI / 2)];
  b.add('pipe', { kind: 'cylinder', rTop: radius, rBottom: radius, height: len, sides: 8 }, zone, [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, z], { rot });
  if (flangeZone) {
    for (const p of [from, to]) {
      b.add('pipe-flange', { kind: 'cylinder', rTop: radius * 1.5, rBottom: radius * 1.5, height: 0.1, sides: 8 }, flangeZone, [p[0], p[1], z], { rot });
    }
  }
}

/** A zigzag crack or lightning bolt running down from `top`, as one thin outline. */
export function boltOutline(length: number, width: number, kinks: number, sway: number, seedSign = 1): Vec2[] {
  const mid: Vec2[] = [];
  for (let i = 0; i <= kinks; i++) {
    const t = i / kinks;
    const side = i === 0 || i === kinks ? 0 : (i % 2 === 0 ? 1 : -1) * seedSign;
    mid.push([round(side * sway * (1 - t * 0.4)), round(-length * t)]);
  }
  const a: Vec2[] = [];
  const c: Vec2[] = [];
  mid.forEach(([x, y], i) => {
    const w = (width / 2) * (1 - (i / kinks) * 0.85);
    a.push([round(x + w), y]);
    c.push([round(x - w), y]);
  });
  return [...a, ...c.reverse()];
}

/** Vertical seams that break a big wall into panels. Dark on dark: texture for the eye, not a shape. */
export function seams(b: RoomBuilder, xs: number[], zone: ZoneId, from = 0.14, to = ROOM.height - 0.3): void {
  for (const x of xs) b.plaque('wall-seam', [0.06, to - from, 0.03], zone, [x, (from + to) / 2]);
}
