/**
 * Shared 2D relief outline builders and mirroring helpers for the four parody AI agents
 * (`src/procgen/archetypes/agents/{clod,antigravy,gork,codec}.ts`).
 * Pure functions in model space (y up, world +x is screen-left).
 */
import type { PartSpec, Vec2 } from '../../core/types.js';
import type { Rng } from '../../core/rng.js';
import { mirror, stroke, turn, type MalwareDef } from '../malware/parts.js';

const TAU = Math.PI * 2;

export type AgentBuild = ReturnType<MalwareDef['build']>;

export const pickSide = (rng: Rng): 1 | -1 => (rng.chance(0.5) ? 1 : -1);

export function facing(
  parts: PartSpec[],
  side: 1 | -1,
  tags: string[],
  sockets: AgentBuild['sockets'],
): AgentBuild {
  return { parts: side < 0 ? mirror(parts) : parts, tags, sockets };
}

/** Sculpted crab-golem clay carapace: broad shouldered, faceted, flat-bottomed. */
export function crabCarapace(rng: Rng, halfW: number, halfH: number): Vec2[] {
  const j = () => rng.range(-0.025, 0.025);
  return [
    [-halfW * 0.68, -halfH],
    [halfW * 0.68, -halfH],
    [halfW * (0.94 + j()), -halfH * 0.25],
    [halfW * (1.02 + j()), halfH * 0.36],
    [halfW * 0.72, halfH * (0.88 + j())],
    [halfW * 0.24, halfH],
    [-halfW * 0.24, halfH],
    [-halfW * 0.72, halfH * (0.88 + j())],
    [-halfW * (1.02 + j()), halfH * 0.36],
    [-halfW * (0.94 + j()), -halfH * 0.25],
  ];
}

/** Heavy asymmetric crab pincer opening at `angle` (radians) with a serrated jaw notch. */
export function pincerClaw(r: number, angle: number): Vec2[] {
  const raw: Vec2[] = [
    [-r * 0.55, -r * 0.72],
    [r * 0.48, -r * 0.85],
    [r * 0.98, -r * 0.28],
    [r * 0.88, r * 0.14],
    [r * 0.28, -r * 0.04],
    [r * 0.08, r * 0.18],
    [r * 0.82, r * 0.42],
    [r * 0.72, r * 0.86],
    [-r * 0.18, r * 0.94],
    [-r * 0.86, r * 0.44],
    [-r * 0.92, -r * 0.22],
  ];
  return turn(raw, angle);
}

/** Slightly tapered ceramic coffee mug body centred at `(0, 0)`. */
export function mugCupOutline(topHalfW: number, botHalfW: number, halfH: number): Vec2[] {
  return [
    [-botHalfW, -halfH],
    [-botHalfW * 0.88, -halfH * 1.06],
    [botHalfW * 0.88, -halfH * 1.06],
    [botHalfW, -halfH],
    [topHalfW * 0.97, -halfH * 0.2],
    [topHalfW, halfH],
    [-topHalfW, halfH],
    [-topHalfW * 0.97, -halfH * 0.2],
  ];
}

/** Elliptical disk centered at `(0, 0)` (used for the tilted hot coffee brew surface). */
export function ellipseOutline(rx: number, ry: number, steps = 18): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU;
    pts.push([Math.cos(a) * rx, Math.sin(a) * ry]);
  }
  return pts;
}

/** S-curved rising steam ribbon, `height` tall, centred around `(0, 0)`. */
export function steamCurl(height: number, sway: number, width = 0.065): Vec2[] {
  const h = height / 2;
  return stroke(
    [
      [0, -h],
      [sway, -h * 0.35],
      [-sway * 0.9, h * 0.35],
      [sway * 0.45, h],
    ],
    width,
    0.72,
  );
}

/** Teardrop coffee droplet pointing upward (+y). */
export function coffeeDrop(r: number): Vec2[] {
  return [
    [0, r * 1.45],
    [-r * 0.72, r * 0.25],
    [-r * 0.95, -r * 0.35],
    [-r * 0.52, -r * 0.95],
    [0, -r * 1.05],
    [r * 0.52, -r * 0.95],
    [r * 0.95, -r * 0.35],
    [r * 0.72, r * 0.25],
  ];
}

/** Half of a tilted elliptical ring (`a0..a1` = `0..pi` far half, `pi..2pi` near half). */
export function diskHalf(
  inner: Vec2,
  outer: Vec2,
  a0: number,
  a1: number,
  tilt: number,
  steps = 16,
): Vec2[] {
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const at = (r: Vec2, a: number): Vec2 => {
    const u = r[0] * Math.cos(a);
    const v = r[1] * Math.sin(a);
    return [u * ct - v * st, u * st + v * ct];
  };
  const pts: Vec2[] = [];
  for (let i = 0; i <= steps; i++) pts.push(at(outer, a0 + ((a1 - a0) * i) / steps));
  for (let i = steps; i >= 0; i--) pts.push(at(inner, a0 + ((a1 - a0) * i) / steps));
  return pts;
}

/** Point on a tilted orbit ellipse around `c`. */
export function diskPoint(c: Vec2, radii: Vec2, tilt: number, t: number): Vec2 {
  const u = radii[0] * Math.cos(t);
  const v = radii[1] * Math.sin(t);
  return [
    c[0] + u * Math.cos(tilt) - v * Math.sin(tilt),
    c[1] + u * Math.sin(tilt) + v * Math.cos(tilt),
  ];
}

/** Bold upturned comic smile with thick blunt corners so the full curve survives 3.5px pixel-art cells. */
export function comicSmile(halfW: number, rise: number, width: number): Vec2[] {
  return stroke(
    [
      [-halfW, rise],
      [-halfW * 0.58, -rise * 0.42],
      [0, -rise * 0.78],
      [halfW * 0.58, -rise * 0.42],
      [halfW, rise],
    ],
    width,
    0.92,
  );
}

/**
 * Curly-brace `{` or `}` mechanical claw outline, `height` tall, centred at `(0, 0)`.
 * World `+x` is screen-left: `side = 'left'` draws `{` (cusp pointing screen-left `+x`),
 * `side = 'right'` draws `}` (cusp pointing screen-right `-x`).
 */
export function curlyBrace(height: number, side: 'left' | 'right', thickness = 0.075): Vec2[] {
  const h = height / 2;
  const s = side === 'left' ? 1 : -1;
  return stroke(
    [
      [-s * 0.11, h],
      [s * 0.02, h * 0.92],
      [s * 0.04, h * 0.26],
      [s * 0.16, 0],
      [s * 0.04, -h * 0.26],
      [s * 0.02, -h * 0.92],
      [-s * 0.11, -h],
    ],
    thickness,
  );
}
