/** Pure maths of the flying bats (no three, no DOM): a cubic Bézier route, easing, and the flock builder. */

export interface Pt {
  x: number;
  y: number;
}

/** The visible area in world units; a flock starts and ends `MARGIN` outside it. */
export interface BatBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface BatFlight {
  p0: Pt;
  p1: Pt;
  p2: Pt;
  p3: Pt;
  durationSec: number;
  scale: number;
  /** Wing flap phase offset, 0..1. */
  phase: number;
  /** Seconds to wait before this bat leaves the corner (a loose, staggered flock). */
  delaySec: number;
}

const MIN_FLOCK = 1;
const MAX_FLOCK = 6;
const BAT_MARGIN = 1.1;
const FLIGHT_SEC: readonly [number, number] = [2, 3.5];
const SPEED_SPREAD = 0.25;
const SCALE_RANGE: readonly [number, number] = [0.7, 1.3];
export const FLOCK_GAP_SEC: readonly [number, number] = [20, 60];

export type Rand = () => number;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const between = (rand: Rand, lo: number, hi: number): number => lerp(lo, hi, rand());

export function cubicBezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const k = Math.min(1, Math.max(0, t));
  const u = 1 - k;
  const a = u * u * u;
  const b = 3 * u * u * k;
  const c = 3 * u * k * k;
  const d = k * k * k;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** Slow start, fast middle, soft landing; the whole flight is one smooth swoop. */
export function easeInOutSine(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return (1 - Math.cos(Math.PI * k)) / 2;
}

/** Corner index 0..3: bit 0 = right, bit 1 = top. The opposite corner flips both bits. */
function oppositeCorner(corner: number): number {
  return corner ^ 3;
}

function cornerPoint(bounds: BatBounds, corner: number, margin: number = BAT_MARGIN): Pt {
  return {
    x: corner & 1 ? bounds.maxX + margin : bounds.minX - margin,
    y: corner & 2 ? bounds.maxY + margin : bounds.minY - margin,
  };
}

/** One flock: 1 to 6 bats from a random corner to the opposite one, each a little different. */
export function makeFlock(rand: Rand, bounds: BatBounds): BatFlight[] {
  const count = MIN_FLOCK + Math.min(MAX_FLOCK - MIN_FLOCK, Math.floor(rand() * (MAX_FLOCK - MIN_FLOCK + 1)));
  const corner = Math.min(3, Math.floor(rand() * 4));
  const from = cornerPoint(bounds, corner);
  const to = cornerPoint(bounds, oppositeCorner(corner));
  return Array.from({ length: count }, () => flightBetween(rand, from, to));
}

function flightBetween(rand: Rand, from: Pt, to: Pt): BatFlight {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // Unit normal of the corner-to-corner line: the sideways direction of the bow.
  const nx = -dy / len;
  const ny = dx / len;
  const bow1 = between(rand, -0.22, 0.22) * len;
  // Half the time the second bow flips sign, so the route is an S instead of a single arc.
  const bow2 = (rand() < 0.5 ? -1 : 1) * between(rand, 0.06, 0.22) * len;
  const jx = between(rand, -0.8, 0.8);
  const jy = between(rand, -0.8, 0.8);
  const at = (f: number, bow: number): Pt => ({
    x: from.x + dx * f + nx * bow + jx,
    y: from.y + dy * f + ny * bow + jy,
  });
  const speed = 1 + between(rand, -SPEED_SPREAD, SPEED_SPREAD);
  return {
    p0: { x: from.x + jx * 0.5, y: from.y + jy * 0.5 },
    p1: at(1 / 3, bow1),
    p2: at(2 / 3, bow2),
    p3: { x: to.x + jx * 0.5, y: to.y + jy * 0.5 },
    durationSec: between(rand, FLIGHT_SEC[0], FLIGHT_SEC[1]) / speed,
    scale: between(rand, SCALE_RANGE[0], SCALE_RANGE[1]),
    phase: rand(),
    delaySec: between(rand, 0, 0.7),
  };
}
