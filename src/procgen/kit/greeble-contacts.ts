/** Pin rows, contact teeth, DIP chips and heatsink fins. See `greebles.ts` for the shared conventions. */
import type { ZoneId } from '../core/palette.js';
import type { PartSpec, Vec2 } from '../core/types.js';
import { type GreebleBase, face, mount } from './greeble-base.js';
import {
  kitBox, kitDisc, kitPlate, outlineComb, outlineRoundRect, outlineTransform,
} from './shapes.js';

// ---------------------------------------------------------------- pins and contacts

export interface PinRowOptions extends GreebleBase {
  count: number;
  /** Centre-to-centre spacing. */
  pitch: number;
  /** Width and height of one pin. Default [0.04, 0.1]. */
  size?: Vec2;
  depth?: number;
  zone?: ZoneId;
  /** Lay the row out along x (default) or y. */
  axis?: 'x' | 'y';
}

/** Separate pins `${name}.pin0..n`, one part each: use when pins animate or differ. Otherwise prefer greebleContactTeeth. */
export function greeblePinRow(o: PinRowOptions): PartSpec[] {
  const [w, h] = o.size ?? [0.04, 0.1];
  const depth = o.depth ?? 0.04;
  const parts: PartSpec[] = [];
  for (let i = 0; i < o.count; i++) {
    const t = (i - (o.count - 1) / 2) * o.pitch;
    const x = o.pos[0] + (o.axis === 'y' ? 0 : t);
    const y = o.pos[1] + (o.axis === 'y' ? t : 0);
    parts.push(kitBox(`${o.name}.pin${i}`, [w, h, depth], o.zone ?? 'gold', [x, y, mount(o.pos[2], depth)]));
  }
  return parts;
}

export interface ContactTeethOptions extends GreebleBase {
  /** Length of the row. */
  width: number;
  count: number;
  /** How far the teeth stick out of the bar. */
  toothLength: number;
  /** Thickness of the bar that joins them. Default 0.03. */
  bar?: number;
  depth?: number;
  zone?: ZoneId;
  /** Which way the teeth point ON SCREEN. Default 'down'. */
  dir?: 'down' | 'up' | 'left' | 'right';
  /** Tooth width as a fraction of the pitch. Default 0.55. */
  duty?: number;
}

/** A comb of contact fingers in ONE part (`${name}.pins`): gold edge connectors, chip legs, port contacts. */
export function greebleContactTeeth(o: ContactTeethOptions): PartSpec[] {
  const bar = o.bar ?? 0.03;
  const depth = o.depth ?? 0.03;
  const comb = outlineTransform(outlineComb(o.width, o.count, o.toothLength, bar, o.duty), { move: [0, (o.toothLength - bar) / 2] });
  // Screen-left is +x, so a comb turned +90 degrees points its teeth at the left of the screen.
  const rot = { down: 0, up: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 }[o.dir ?? 'down'];
  return [kitPlate(`${o.name}.pins`, outlineTransform(comb, { rot }), depth, o.zone ?? 'gold', [o.pos[0], o.pos[1], mount(o.pos[2], depth)])];
}

// ---------------------------------------------------------------- chips and heatsinks

export interface DipChipOptions extends GreebleBase {
  width: number;
  height: number;
  depth?: number;
  /** Legs per side. Default 4. */
  legs?: number;
  legLength?: number;
  /** `bottom`: one row under the body (a chip seen from its long side). `x`: both screen sides. `y`: top and bottom. */
  legSides?: 'bottom' | 'x' | 'y' | 'none';
  zone?: ZoneId;
  legZone?: ZoneId;
  /** Pin-1 notch at the screen-left end. Default true. */
  notch?: boolean;
  /** Etched marking lines on the face. Default 2. */
  marks?: number;
  markZone?: ZoneId;
  texture?: string;
}

/** A DIP package: `${name}.body`, `${name}.pins.a` / `.b`, `${name}.notch`, `${name}.mark0..`. */
export function greebleDipChip(o: DipChipOptions): PartSpec[] {
  const depth = o.depth ?? 0.08;
  const legs = o.legs ?? 4;
  const len = o.legLength ?? 0.06;
  const sides = o.legSides ?? 'bottom';
  const [x, y, z] = o.pos;
  const front = face(z, depth);
  const parts: PartSpec[] = [];
  const legDepth = Math.min(depth * 0.6, 0.05);
  const legRow = (suffix: string, dir: 'down' | 'up' | 'left' | 'right', px: number, py: number, span: number): void => {
    parts.push(...greebleContactTeeth({
      name: `${o.name}.${suffix}`, pos: [px, py, z - (depth - legDepth) / 2], width: span, count: legs,
      toothLength: len, bar: 0.03, depth: legDepth, zone: o.legZone ?? 'solder', dir, duty: 0.5,
    }).map((p) => ({ ...p, name: `${o.name}.pins.${suffix}` })));
  };
  // Legs first so the body overlaps their bars.
  if (sides === 'bottom') legRow('a', 'down', x, y - o.height / 2 - len / 2 + 0.015, o.width * 0.86);
  if (sides === 'y') {
    legRow('a', 'down', x, y - o.height / 2 - len / 2 + 0.015, o.width * 0.86);
    legRow('b', 'up', x, y + o.height / 2 + len / 2 - 0.015, o.width * 0.86);
  }
  if (sides === 'x') {
    legRow('a', 'left', x + o.width / 2 + len / 2 - 0.015, y, o.height * 0.86);
    legRow('b', 'right', x - o.width / 2 - len / 2 + 0.015, y, o.height * 0.86);
  }
  const body = kitPlate(`${o.name}.body`, outlineRoundRect(o.width, o.height, Math.min(o.width, o.height) * 0.08, 1), depth, o.zone ?? 'silicon', [x, y, mount(z, depth)]);
  if (o.texture) body.texture = o.texture;
  parts.push(body);
  if (o.notch !== false) {
    const r = Math.min(o.height * 0.16, 0.05);
    parts.push(kitDisc(`${o.name}.notch`, r, 0.012, 'ink', [x + o.width / 2 - r * 0.2, y, mount(front, 0.012)], { outline: false, sides: 8 }));
  }
  const marks = o.marks ?? 2;
  for (let i = 0; i < marks; i++) {
    const my = y + (marks === 1 ? 0 : (0.5 - i / (marks - 1)) * o.height * 0.36);
    const mw = o.width * (i % 2 ? 0.34 : 0.5);
    parts.push(kitBox(`${o.name}.mark${i}`, [mw, Math.max(0.03, o.height * 0.1), 0.012], o.markZone ?? 'solder', [x - o.width * 0.04 + (o.width * 0.56 - mw) / 2, my, mount(front, 0.012)], { outline: false }));
  }
  return parts;
}

export interface HeatsinkFinsOptions extends GreebleBase {
  width: number;
  /** Total height including the base. */
  height: number;
  /** Thickness along z. Default 0.2. */
  depth?: number;
  fins?: number;
  /** Height of the solid base under the fins. Default 0.06. */
  base?: number;
  zone?: ZoneId;
  /**
   * `comb` (default): fins stand up and are seen edge-on as a comb silhouette, ONE part (`${name}.fins`).
   * `ribs`: a back plate with fins facing the camera as vertical ribs (`${name}.plate`, `${name}.rib0..`).
   */
  style?: 'comb' | 'ribs';
  /** `comb` only: relative height of each fin, 0..1, for an organ-pipe profile. */
  heights?: number[];
  texture?: string;
}

export function greebleHeatsinkFins(o: HeatsinkFinsOptions): PartSpec[] {
  const depth = o.depth ?? 0.2;
  const fins = Math.max(2, o.fins ?? 6);
  const base = o.base ?? 0.06;
  const zone = o.zone ?? 'heatsink';
  const [x, y, z] = o.pos;
  if ((o.style ?? 'comb') === 'comb') {
    const pitch = o.width / fins;
    const tw = pitch * 0.56;
    const y0 = -o.height / 2;
    const outline: Vec2[] = [[o.width / 2, y0], [o.width / 2, y0 + base]];
    for (let i = fins - 1; i >= 0; i--) {
      const cx = -o.width / 2 + pitch * (i + 0.5);
      const top = y0 + base + (o.height - base) * Math.max(0.15, o.heights?.[i] ?? 1);
      outline.push([cx + tw / 2, y0 + base], [cx + tw / 2, top], [cx - tw / 2, top], [cx - tw / 2, y0 + base]);
    }
    outline.push([-o.width / 2, y0 + base], [-o.width / 2, y0]);
    const part = kitPlate(`${o.name}.fins`, outline, depth, zone, [x, y, mount(z, depth)]);
    if (o.texture) part.texture = o.texture;
    return [part];
  }
  const plateDepth = depth * 0.4;
  const ribDepth = depth * 0.6;
  const parts: PartSpec[] = [kitBox(`${o.name}.plate`, [o.width, o.height, plateDepth], zone, [x, y, mount(z, plateDepth)])];
  const pitch = o.width / fins;
  for (let i = 0; i < fins; i++) {
    parts.push(kitBox(`${o.name}.rib${i}`, [pitch * 0.5, o.height * 0.94, ribDepth], zone, [x - o.width / 2 + pitch * (i + 0.5), y, mount(face(z, plateDepth), ribDepth)]));
  }
  return parts;
}
