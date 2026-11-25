import { makeRng } from '../../core/rng.js';
import type { AnimTag, ModelSpec, PartSpec, Vec2 } from '../../core/types.js';
import { kitBox, kitDisc, kitPlate, outlineStroke, SCREEN_LEFT, SCREEN_RIGHT } from '../../kit/greebles.js';
import { pickBoardTheme } from './shared.js';

// ---------------------------------------------------------------- prop.cobweb

export function buildCobweb(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const cx = 0, cy = 0.58;
  const r = rng.range(0.42, 0.48);
  const spokes = 8;
  const angle = (i: number): number => (i / spokes) * Math.PI * 2 + 0.15;
  const pt = (i: number, rad: number): Vec2 => [cx + Math.cos(angle(i)) * rad, cy + Math.sin(angle(i)) * rad];
  const tip1 = pt(1, r * 0.94);
  const tip3 = pt(3, r * 0.94);
  const parts: PartSpec[] = [
    kitDisc('hub', 0.065, 0.045, 'silicon', [cx, cy, 0.01], { sides: 8 }),
    kitBox('anchor.l', [0.1, 0.08, 0.08], 'rubber', [tip1[0], tip1[1], 0.02]),
    kitBox('anchor.r', [0.1, 0.08, 0.08], 'rubber', [tip3[0], tip3[1], 0.02]),
  ];
  // Radial solder-wire spokes + octagonal silk-trace rings (zero malware zones).
  for (let i = 0; i < spokes; i++) {
    parts.push(kitPlate(`spoke${i}`, outlineStroke([[cx, cy], pt(i, r)], 0.044), 0.032, 'solder', [0, 0, 0.018]));
  }
  for (const [k, frac] of [0.46, 0.82].entries()) {
    const ring: Vec2[] = [];
    for (let i = 0; i <= spokes; i++) ring.push(pt(i, r * frac));
    parts.push(kitPlate(`ring${k}`, outlineStroke(ring, 0.04), 0.032, 'heatsink', [0, 0, -0.004 - k * 0.01]));
  }
  const nA = pt(2, r * 0.46);
  const nB = pt(6, r * 0.82);
  parts.push(kitDisc('node.a', 0.045, 0.025, 'gold', [nA[0], nA[1], -0.024], { outline: false, sides: 8 }));
  parts.push(kitDisc('node.b', 0.045, 0.025, 'gold', [nB[0], nB[1], -0.024], { outline: false, sides: 8 }));
  return { id: 'prop.cobweb', category: 'prop', label: 'Solder cobweb', parts, sockets: { label: [0, 1.15, 0], fx: [cx, cy, -0.08] }, tags: ['hover', 'wall'] };
}

// ---------------------------------------------------------------- prop.spider

export function buildSpider(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const topY = 1.05;
  const bodyY = 0.46;
  const abdomen = pickBoardTheme(seed, rng, 'pcbAmber');
  const pivot: [number, number, number] = [0, topY, 0];
  const sway: AnimTag = { type: 'swing', axis: 'z', speed: 0.35, amp: 0.08, phase: rng.next(), pivot };
  const parts: PartSpec[] = [
    kitBox('anchor', [0.14, 0.08, 0.1], 'rubber', [0, topY - 0.02, 0.02]),
    kitPlate('thread', outlineStroke([[0, topY], [0, bodyY + 0.16]], 0.042), 0.03, 'solder', [0, 0, 0.02], { anim: sway }),
    kitBox('abdomen', [0.3, 0.24, 0.14], abdomen.zone, [0, bodyY + 0.16, 0.01], { texture: abdomen.texture, anim: sway }),
    kitBox('thorax', [0.22, 0.18, 0.12], 'silicon', [0, bodyY - 0.01, -0.01], { anim: sway }),
    // Tiny amber status-LED eyes & copper fangs (strictly non-malware so never mistaken for enemies).
    kitDisc('eye.l', 0.028, 0.016, 'powerAmber', [0.05 * SCREEN_LEFT, bodyY - 0.04, -0.075], { outline: false, sides: 8, anim: sway }),
    kitDisc('eye.r', 0.028, 0.016, 'powerAmber', [0.05 * SCREEN_RIGHT, bodyY - 0.04, -0.075], { outline: false, sides: 8, anim: sway }),
    kitBox('fang.l', [0.045, 0.08, 0.04], 'copper', [0.05 * SCREEN_LEFT, bodyY - 0.12, -0.03], { anim: sway }),
    kitBox('fang.r', [0.045, 0.08, 0.04], 'copper', [0.05 * SCREEN_RIGHT, bodyY - 0.12, -0.03], { anim: sway }),
  ];
  for (let i = 0; i < 4; i++) {
    const dy = (1.5 - i) * 0.065;
    const reach = 0.24 + (i === 1 || i === 2 ? 0.08 : 0);
    const drop = i < 2 ? 0.14 : -0.14;
    for (const [side, sx] of [['l', SCREEN_LEFT], ['r', SCREEN_RIGHT]] as const) {
      const hip: Vec2 = [0.09 * sx, bodyY + dy];
      const legAnim: AnimTag = { type: 'swing', axis: 'z', speed: 0.8, amp: 0.12 * sx, phase: (i % 2) * 0.5, pivot: [hip[0], hip[1], 0] };
      parts.push(kitPlate(
        `leg.${side}${i}`,
        outlineStroke([hip, [0.22 * sx, bodyY + dy + 0.08], [reach * sx, bodyY + dy + drop]], 0.045),
        0.035,
        'solder',
        [0, 0, 0.01],
        { anim: legAnim },
      ));
    }
  }
  return { id: 'prop.spider', category: 'prop', label: 'IC spider', parts, sockets: { label: [0, 1.2, 0], fx: [0, bodyY, -0.1] }, tags: ['hover', 'wall'] };
}

// ---------------------------------------------------------------- prop.bat

export function buildBat(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const cy = 0.54;
  const span = rng.range(0.42, 0.48);
  const wingOutline = (sx: number): Vec2[] => [
    [0, 0.09],
    [0.18 * sx, 0.19],
    [span * sx, 0.14],
    [span * 0.72 * sx, -0.14],
    [0.24 * sx, -0.05],
    [0.12 * sx, -0.14],
    [0, -0.08],
  ];
  const parts: PartSpec[] = [
    kitBox('body', [0.18, 0.28, 0.12], 'silicon', [0, cy, 0]),
    kitBox('chest', [0.12, 0.14, 0.04], 'copper', [0, cy - 0.02, -0.065]),
    kitPlate('ear.l', [[0, 0], [0.05, 0.12], [0.09, 0]], 0.04, 'heatsink', [0.04 * SCREEN_LEFT, cy + 0.13, -0.01]),
    kitPlate('ear.r', [[0, 0], [-0.05, 0.12], [-0.09, 0]], 0.04, 'heatsink', [0.04 * SCREEN_RIGHT, cy + 0.13, -0.01]),
    kitBox('claw.l', [0.045, 0.08, 0.04], 'gold', [0.045 * SCREEN_LEFT, cy - 0.17, 0]),
    kitBox('claw.r', [0.045, 0.08, 0.04], 'gold', [0.045 * SCREEN_RIGHT, cy - 0.17, 0]),
    kitDisc('eye.l', 0.024, 0.015, 'powerAmber', [0.04 * SCREEN_LEFT, cy + 0.06, -0.065], { outline: false, sides: 8 }),
    kitDisc('eye.r', 0.024, 0.015, 'powerAmber', [0.04 * SCREEN_RIGHT, cy + 0.06, -0.065], { outline: false, sides: 8 }),
    kitPlate('wing.l', wingOutline(SCREEN_LEFT), 0.04, 'pcbBlack', [0.08 * SCREEN_LEFT, cy + 0.02, 0.01], {
      texture: 'tex.pcb-black',
      anim: { type: 'swing', axis: 'z', speed: 0.9, amp: 0.22, phase: 0, pivot: [0.08 * SCREEN_LEFT, cy + 0.02, 0.01] },
    }),
    kitPlate('wing.r', wingOutline(SCREEN_RIGHT), 0.04, 'pcbBlack', [0.08 * SCREEN_RIGHT, cy + 0.02, 0.01], {
      texture: 'tex.pcb-black',
      anim: { type: 'swing', axis: 'z', speed: 0.9, amp: -0.22, phase: 0, pivot: [0.08 * SCREEN_RIGHT, cy + 0.02, 0.01] },
    }),
  ];
  return { id: 'prop.bat', category: 'prop', label: 'Circuit bat', parts, sockets: { label: [0, 0.92, 0], fx: [0, cy, -0.1] }, tags: ['hover', 'wall'] };
}
