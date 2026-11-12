/** Chains, padlocks and plain panels. See `greebles.ts` for the shared conventions. */
import type { ZoneId } from '../core/palette.js';
import type { PartSpec, Vec2 } from '../core/types.js';
import {
  kitBox, kitDisc, kitPlate, kitRing, offsetParts, outlineRect, outlineRoundRect, outlineStroke, sagPath, tiltParts,
} from './shapes.js';
import { type GreebleBase, face, mount } from './greeble-base.js';

// ---------------------------------------------------------------- chains and locks

export interface ChainOptions {
  name: string;
  from: Vec2;
  to: Vec2;
  /** Surface z. */
  z: number;
  links?: number;
  sag?: number;
  /** Half-length of a link. Default: fitted to the span. */
  linkRadius?: number;
  zone?: ZoneId;
}

/** A chain seen face-on: oval rings alternating with edge-on links, `${name}.link0..`. About 80 triangles per ring. */
export function greebleChain(o: ChainOptions): PartSpec[] {
  const links = Math.max(2, o.links ?? 6);
  const path = sagPath(o.from, o.to, o.sag ?? 0, links * 2);
  let length = 0;
  for (let i = 1; i < path.length; i++) length += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
  const r = o.linkRadius ?? (length / links) * 0.68;
  const tube = Math.max(0.018, r * 0.3);
  const parts: PartSpec[] = [];
  for (let i = 0; i < links; i++) {
    const c = path[i * 2 + 1]!;
    const a = path[i * 2]!, b = path[i * 2 + 2]!;
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const name = `${o.name}.link${i}`;
    const link = i % 2 === 0
      ? kitRing(name, r, r - tube, tube * 1.4, o.zone ?? 'solder', [0, 0, 0], { sides: 10, scale: [1, 1, 0.62] })
      : kitBox(name, [r * 1.7, tube * 1.3, tube * 2.2], o.zone ?? 'solder', [0, 0, 0], { bevel: tube * 0.4 });
    parts.push(...offsetParts(tiltParts([link], angle), [c[0], c[1], mount(o.z, tube * 2.2)]));
  }
  return parts;
}

export interface PadlockOptions extends GreebleBase {
  /** Body width and height. The shackle adds about 60% of the height on top. */
  width?: number;
  height?: number;
  depth?: number;
  zone?: ZoneId;
  shackleZone?: ZoneId;
  keyholeZone?: ZoneId;
  /** Swing the shackle open. */
  open?: boolean;
}

/** A padlock centred on its body: `${name}.shackle`, `${name}.body`, `${name}.keyhole`, `${name}.keyslot`. */
export function greeblePadlock(o: PadlockOptions): PartSpec[] {
  const w = o.width ?? 0.24;
  const h = o.height ?? 0.2;
  const depth = o.depth ?? 0.1;
  const [x, y, z] = o.pos;
  const half = w * 0.28;
  const rise = h * 0.32;
  const t = Math.max(0.04, w * 0.16);
  const u: Vec2[] = [[-half, -h * 0.2], [-half, rise]];
  for (let i = 1; i < 6; i++) {
    const a = Math.PI - (i / 6) * Math.PI;
    u.push([Math.cos(a) * half, rise + Math.sin(a) * half]);
  }
  u.push([half, rise], [half, -h * 0.2]);
  let shackle: PartSpec[] = [kitPlate(`${o.name}.shackle`, outlineStroke(u, t), depth * 0.5, o.shackleZone ?? 'solder', [0, h / 2, 0])];
  if (o.open) shackle = offsetParts(tiltParts(shackle, -0.5, [half, h / 2 + rise * 0.3]), [0, h * 0.12, 0]);
  const front = face(z, depth);
  const kr = Math.min(w, h) * 0.15;
  return [
    ...offsetParts(shackle, [x, y, mount(z, depth * 0.5) - depth * 0.25]),
    kitPlate(`${o.name}.body`, outlineRoundRect(w, h, Math.min(w, h) * 0.16, 2), depth, o.zone ?? 'gold', [x, y, mount(z, depth)], { bevel: 0.012 }),
    kitDisc(`${o.name}.keyhole`, kr, 0.012, o.keyholeZone ?? 'ink', [x, y + h * 0.08, mount(front, 0.012)], { outline: false, sides: 8 }),
    kitPlate(`${o.name}.keyslot`, [[-kr * 0.45, 0], [kr * 0.45, 0], [kr * 0.8, -kr * 2.1], [-kr * 0.8, -kr * 2.1]], 0.012, o.keyholeZone ?? 'ink', [x, y + h * 0.08, mount(front, 0.012)], { outline: false }),
  ];
}

// ---------------------------------------------------------------- small conveniences

/** A plain rectangular plate mounted on a surface: the "one more layer of relief" helper. */
export function greeblePanel(o: GreebleBase & { width: number; height: number; depth?: number; zone: ZoneId; radius?: number; texture?: string }): PartSpec[] {
  const depth = o.depth ?? 0.03;
  const outline = o.radius ? outlineRoundRect(o.width, o.height, o.radius, 2) : outlineRect(o.width, o.height);
  const part = kitPlate(o.name, outline, depth, o.zone, [o.pos[0], o.pos[1], mount(o.pos[2], depth)]);
  if (o.texture) part.texture = o.texture;
  return [part];
}
