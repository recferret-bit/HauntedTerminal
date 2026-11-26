import { pickBoardTheme, type ZoneId } from '../../core/palette.js';
import type { AnimTag, PartSpec, Vec2, Vec3 } from '../../core/types.js';
import { kitBox, kitDisc, kitPlate, outlineRoundRect } from '../../kit/greebles.js';

export { pickBoardTheme };

/** Pinwheel fan rotor in a recessed ink well with central hub, built for GPU shrouds and CPU coolers. */
export function makeFanUnit(o: {
  name: string;
  pos: Vec3;
  radius: number;
  blades?: number;
  speed?: number;
  bladeZone?: ZoneId;
  hubZone?: ZoneId;
  ringZone?: ZoneId;
}): PartSpec[] {
  const [x, y, z] = o.pos;
  const blades = o.blades ?? 5;
  const r = o.radius;
  const hub = r * 0.34;
  const wheel: Vec2[] = [];
  const step = (Math.PI * 2) / blades;
  const pt = (a: number, rad: number): Vec2 => [Math.cos(a) * rad, Math.sin(a) * rad];
  for (let i = 0; i < blades; i++) {
    const a = i * step;
    wheel.push(
      pt(a, hub * 0.85),
      pt(a + step * 0.14, r * 0.94),
      pt(a + step * 0.52, r * 0.96),
      pt(a + step * 0.84, r * 0.84),
      pt(a + step * 0.64, hub * 0.85),
    );
  }
  const rotAnim: AnimTag = { type: 'spin', axis: 'z', speed: o.speed ?? 1.5, pivot: [x, y, z - 0.03] };
  return [
    kitDisc(`${o.name}.bezel`, r + 0.035, 0.04, o.ringZone ?? 'rubber', [x, y, z], { sides: 14 }),
    kitDisc(`${o.name}.well`, r * 0.96, 0.025, 'ink', [x, y, z - 0.015], { outline: false, sides: 14 }),
    kitPlate(`${o.name}.blades`, wheel, 0.025, o.bladeZone ?? 'heatsink', [x, y, z - 0.03], { anim: rotAnim }),
    kitDisc(`${o.name}.hub`, hub, 0.035, o.hubZone ?? 'copper', [x, y, z - 0.048], { sides: 10 }),
  ];
}

/** A tall vertical DIMM stick standing inside a slot, with surface DRAM chips on the `-z` face. */
export function makeRamStick(o: {
  name: string;
  x: number;
  baseY: number;
  z: number;
  width: number;
  height: number;
  zone: ZoneId;
  texture?: string;
  chipZone?: ZoneId;
  spreader?: boolean;
}): PartSpec[] {
  const cy = o.baseY + o.height / 2;
  const parts: PartSpec[] = [
    kitPlate(`${o.name}.board`, outlineRoundRect(o.width, o.height, 0.018, 1), 0.055, o.zone, [o.x, cy, o.z], {
      ...(o.texture ? { texture: o.texture } : {}),
    }),
  ];
  if (o.spreader) {
    parts.push(
      kitBox(`${o.name}.crest`, [o.width + 0.03, 0.08, 0.08], 'gold', [o.x, o.baseY + o.height - 0.035, o.z - 0.01]),
      kitBox(`${o.name}.armor`, [o.width * 0.88, o.height * 0.56, 0.04], 'heatsink', [o.x, cy - 0.04, o.z - 0.03]),
    );
  } else {
    const chips = 3;
    const pitch = (o.height - 0.12) / chips;
    for (let i = 0; i < chips; i++) {
      parts.push(
        kitBox(`${o.name}.ic${i}`, [o.width * 0.68, pitch * 0.62, 0.03], o.chipZone ?? 'silicon', [
          o.x,
          o.baseY + 0.08 + pitch * (i + 0.5),
          o.z - 0.035,
        ]),
      );
    }
  }
  return parts;
}
