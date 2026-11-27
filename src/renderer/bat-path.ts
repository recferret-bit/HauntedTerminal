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

export interface BatHeading {
  facingLeft: boolean;
  pitch: number;
  rotZ: number;
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
const MAX_PITCH_RAD = 0.28;
export const FLOCK_GAP_SEC: readonly [number, number] = [20, 60];

export type Rand = () => number;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
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

/** One flock: 1 to 6 bats crossing from middle/top on one side to the opposite side. */
export function makeFlock(rand: Rand, bounds: BatBounds, countRange?: [number, number]): BatFlight[] {
  const minCount = countRange ? Math.max(1, Math.round(countRange[0])) : MIN_FLOCK;
  const maxCount = countRange ? Math.max(minCount, Math.round(countRange[1])) : MAX_FLOCK;
  const count = minCount + Math.min(maxCount - minCount, Math.floor(rand() * (maxCount - minCount + 1)));
  const fromRight = rand() < 0.5;
  const startX = fromRight ? bounds.minX - BAT_MARGIN : bounds.maxX + BAT_MARGIN;
  const endX = fromRight ? bounds.maxX + BAT_MARGIN : bounds.minX - BAT_MARGIN;
  const spanY = Math.max(0.5, bounds.maxY - bounds.minY);
  const fromY = bounds.minY + spanY * between(rand, 0.5, 0.86);
  const toY = clamp(
    fromY + spanY * between(rand, -0.16, 0.16),
    bounds.minY + spanY * 0.46,
    bounds.maxY - spanY * 0.08,
  );
  return Array.from({ length: count }, () => flightBetween(rand, { x: startX, y: fromY }, { x: endX, y: toY }, bounds));
}

function flightBetween(rand: Rand, from: Pt, to: Pt, bounds: BatBounds): BatFlight {
  const spanY = Math.max(0.5, bounds.maxY - bounds.minY);
  const minY = bounds.minY + spanY * 0.42;
  const maxY = bounds.maxY - spanY * 0.06;
  const jx = between(rand, -0.45, 0.45);
  const p0: Pt = { x: from.x + jx * 0.5, y: clamp(from.y + between(rand, -0.35, 0.35), minY, maxY) };
  const p3: Pt = { x: to.x + jx * 0.5, y: clamp(to.y + between(rand, -0.35, 0.35), minY, maxY) };
  const dx = p3.x - p0.x;
  // Horizontal entry handle (`p1.y = p0.y`) ensures clean level rotation (`rotZ = 0`) as each bat enters.
  const p1: Pt = { x: p0.x + dx / 3, y: p0.y };
  const bow2 = between(rand, -0.09, 0.09) * Math.abs(dx);
  const p2: Pt = {
    x: p0.x + (dx * 2) / 3,
    y: clamp(lerp(p0.y, p3.y, 0.65) + bow2, bounds.minY + spanY * 0.38, bounds.maxY - spanY * 0.05),
  };
  const speed = 1 + between(rand, -SPEED_SPREAD, SPEED_SPREAD);
  return {
    p0,
    p1,
    p2,
    p3,
    durationSec: between(rand, FLIGHT_SEC[0], FLIGHT_SEC[1]) / speed,
    scale: between(rand, SCALE_RANGE[0], SCALE_RANGE[1]),
    phase: rand(),
    delaySec: between(rand, 0, 0.7),
  };
}

/**
 * Travel-aligned orientation for a canonical screen-right (`-x`) flying bat:
 * mirrors `scale.x` to `facingLeft` and pitches `rotation.z` gently along `(ahead - at)`.
 */
export function computeBatHeading(at: Pt, ahead: Pt, prevFacingLeft: boolean): BatHeading {
  const dx = ahead.x - at.x;
  const dy = ahead.y - at.y;
  const facingLeft = Math.abs(dx) > 1e-5 ? dx > 0 : prevFacingLeft;
  const rawPitch = Math.atan2(dy, Math.max(1e-5, Math.abs(dx)));
  const pitch = clamp(rawPitch, -MAX_PITCH_RAD, MAX_PITCH_RAD);
  return { facingLeft, pitch, rotZ: facingLeft ? pitch : -pitch };
}
