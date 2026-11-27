import { makeRng } from '../../core/rng.js';
import type { AnimTag, ModelSpec, PartSpec, Vec2, Vec3 } from '../../core/types.js';
import {
  kitBox, kitDisc, kitPlate, outlineEllipse, outlineFlipX, outlineStroke, outlineTransform, SCREEN_LEFT, SCREEN_RIGHT,
} from '../../kit/greebles.js';
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

// ---------------------------------------------------------------- bats (perched & flying cartoon models)

function quadArc(a: Vec2, ctrl: Vec2, b: Vec2, seg = 4): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 1; i <= seg; i++) {
    const t = i / seg;
    const u = 1 - t;
    out.push([
      u * u * a[0] + 2 * u * t * ctrl[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * ctrl[1] + t * t * b[1],
    ]);
  }
  return out;
}

function taperedCrescent(pts: Vec2[], halfWidths: number[]): Vec2[] {
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const w = halfWidths[i] ?? 0.02;
    left.push([p[0] + nx * w, p[1] + ny * w]);
    right.push([p[0] - nx * w, p[1] - ny * w]);
  }
  return [...left, ...right.reverse()];
}

const flipIf = (pts: Vec2[], flip: boolean): Vec2[] => (flip ? outlineFlipX(pts) : pts);

export function buildBat(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const cy = 0.54;
  const roostPivot: Vec3 = [0, 0.86, 0];
  const roostSway: AnimTag = { type: 'swing', axis: 'z', speed: 0.32, amp: 0.04, phase: rng.next(), pivot: roostPivot };
  const cloakW = rng.range(0.28, 0.31);

  // Scalloped vampire-cloak wing outline (+x outer): slim ankle, flared thumb shoulder, deep bottom points.
  const wingHalf: Vec2[] = [
    [0.032, 0.29],
    ...quadArc([0.032, 0.29], [0.11, 0.22], [cloakW * 0.88, 0.09], 4),
    ...quadArc([cloakW * 0.88, 0.09], [cloakW * 1.04, -0.02], [cloakW * 0.84, -0.19], 5),
    ...quadArc([cloakW * 0.84, -0.19], [cloakW * 0.62, -0.07], [cloakW * 0.44, -0.18], 4),
    ...quadArc([cloakW * 0.44, -0.18], [0.10, -0.06], [0.052, -0.12], 4),
    ...quadArc([0.052, -0.12], [0.08, 0.09], [0.032, 0.29], 4),
  ];
  const earHalf: Vec2[] = [
    [0.034, 0.03],
    ...quadArc([0.034, 0.03], [0.108, -0.02], [0.095, -0.185], 4),
    ...quadArc([0.095, -0.185], [0.046, -0.10], [0.022, -0.04], 4),
  ];
  const earInnerHalf: Vec2[] = [
    [0.046, -0.015],
    ...quadArc([0.046, -0.015], [0.088, -0.042], [0.082, -0.125], 3),
    ...quadArc([0.082, -0.125], [0.054, -0.082], [0.046, -0.015], 3),
  ];
  // Turned head in 3/4 with clean upturned bat snout on SCREEN_RIGHT (-x), zero camera eyes.
  const headPts = outlineFlipX([
    [-0.10, 0.015],
    ...quadArc([-0.10, 0.015], [-0.085, 0.098], [0.005, 0.098], 4),
    ...quadArc([0.005, 0.098], [0.085, 0.095], [0.108, 0.028], 4),
    ...quadArc([0.108, 0.028], [0.15, 0.005], [0.135, -0.035], 3),
    ...quadArc([0.135, -0.035], [0.075, -0.082], [-0.01, -0.10], 4),
    ...quadArc([-0.01, -0.10], [-0.105, -0.07], [-0.10, 0.015], 4),
  ]);
  const ruffPts: Vec2[] = [
    [-0.095, 0.015], [0.0, 0.042], [0.095, 0.015],
    [0.068, -0.038], [0.025, -0.014], [0.0, -0.048], [-0.025, -0.014], [-0.068, -0.038],
  ];
  const fangPts = outlineFlipX([[0.088, -0.024], [0.128, -0.032], [0.106, -0.074]]);

  const parts: PartSpec[] = [
    kitBox('roost', [0.05, 0.036, 0.036], 'rubber', [0, 0.858, 0.022], { outline: false }),
    kitPlate('body', outlineEllipse(0.116, 0.21, 16), 0.084, 'pcbBlue', [0, 0.60, -0.012], {
      bevel: 0.012, anim: roostSway,
    }),
    kitPlate('ruff', ruffPts, 0.036, 'plastic', [0, 0.388, -0.076], { bevel: 0.005, anim: roostSway }),
    kitPlate('head', headPts, 0.068, 'solder', [0.01 * SCREEN_RIGHT, 0.295, -0.048], {
      bevel: 0.01, anim: roostSway,
    }),
    kitPlate('nose.tip', outlineEllipse(0.018, 0.015, 10), 0.018, 'copper', [0.14 * SCREEN_RIGHT, 0.305, -0.072], {
      outline: false, anim: roostSway,
    }),
    kitPlate('fang', fangPts, 0.022, 'paper', [0.01 * SCREEN_RIGHT, 0.292, -0.076], {
      outline: false, anim: roostSway,
    }),
  ];

  for (const [side, sx] of [['l', SCREEN_LEFT], ['r', SCREEN_RIGHT]] as const) {
    const flip = sx === SCREEN_RIGHT;
    parts.push(
      kitPlate(`toe.${side}`, flipIf([[0.01, 0.02], [0.044, 0.026], [0.052, -0.032], [0.012, -0.03]], flip), 0.034, 'copper', [0, 0.854, -0.002], {
        outline: false, anim: roostSway,
      }),
      kitPlate(`wing.${side}`, flipIf(wingHalf, flip), 0.042, 'solder', [0, cy, -0.034], {
        bevel: 0.008, anim: roostSway,
      }),
      kitPlate(`thumb.${side}`, flipIf([[cloakW * 0.80, 0.07], [cloakW * 0.94, 0.14], [cloakW * 1.00, 0.06], [cloakW * 0.85, 0.03]], flip), 0.022, 'copper', [0, cy, -0.054], {
        outline: false, anim: roostSway,
      }),
      kitPlate(`ear.${side}`, flipIf(earHalf, flip), 0.036, 'solder', [0.015 * SCREEN_RIGHT, 0.268, -0.016], {
        bevel: 0.006, anim: roostSway,
      }),
      kitPlate(`ear.inner.${side}`, flipIf(earInnerHalf, flip), 0.016, 'copper', [0.015 * SCREEN_RIGHT, 0.268, -0.040], {
        outline: false, anim: roostSway,
      }),
    );
  }

  return {
    id: 'prop.bat',
    category: 'prop',
    label: 'Perched cartoon bat',
    parts,
    sockets: { label: [0, 0.96, 0], fx: [0, cy, -0.1] },
    tags: ['hover', 'wall'],
  };
}

// ---------------------------------------------------------------- prop.bat_flying

const wx = (x: number): number => x * SCREEN_RIGHT;

function buildFlyingWings(span: number, nearPivot: Vec3, farPivot: Vec3): PartSpec[] {
  const nearInnerSwing: AnimTag = { type: 'swing', axis: 'z', speed: 2.2, amp: -0.28, phase: 0, pivot: nearPivot };
  const nearOuterSwing: AnimTag = { type: 'swing', axis: 'z', speed: 2.2, amp: -0.44, phase: 0.07, pivot: nearPivot };
  const farInnerSwing: AnimTag = { type: 'swing', axis: 'z', speed: 2.2, amp: 0.24, phase: 0, pivot: farPivot };
  const farOuterSwing: AnimTag = { type: 'swing', axis: 'z', speed: 2.2, amp: 0.36, phase: 0.07, pivot: farPivot };

  // Keep wings attached behind/at the mid-back so the plump pcbBlue furry chest reads clearly (~15-20% front share),
  // with inner parts IN FRONT OF outer parts along the curved finger bone (W -> S1) so ink shells draw clean wing ribs.
  const nearInnerPts = outlineFlipX([
    [-0.03, 0.04],
    ...quadArc([-0.03, 0.04], [-0.13, 0.20], [-0.21, 0.25], 4),
    [-0.20, 0.285],
    [-0.24, 0.235],
    ...quadArc([-0.24, 0.235], [-0.215, 0.05], [-0.255, -0.175], 5),
    ...quadArc([-0.255, -0.175], [-0.15, -0.05], [-0.07, -0.08], 5),
    [-0.01, -0.01],
  ]);
  const nearOuterPts = outlineFlipX([
    [-0.12, 0.16],
    [-0.22, 0.23],
    ...quadArc([-0.22, 0.23], [-span * 0.66, 0.355], [-span, 0.18], 6),
    ...quadArc([-span, 0.18], [-span * 0.80, 0.05], [-span * 0.72, -0.195], 5),
    ...quadArc([-span * 0.72, -0.195], [-span * 0.52, -0.035], [-0.245, -0.165], 5),
    [-0.13, -0.04],
  ]);
  const nearSheenPts = outlineFlipX(taperedCrescent(
    [
      [-0.08, 0.10],
      ...quadArc([-0.08, 0.10], [-0.16, 0.21], [-0.22, 0.22], 2),
      ...quadArc([-0.22, 0.22], [-span * 0.64, 0.32], [-span * 0.94, 0.19], 5),
    ],
    [0.014, 0.022, 0.028, 0.032, 0.034, 0.032, 0.026, 0.012],
  ));
  const farInnerPts = outlineFlipX([
    [-0.02, 0.04],
    ...quadArc([-0.02, 0.04], [0.06, 0.18], [0.165, 0.21], 4),
    [0.16, 0.24],
    [0.195, 0.195],
    ...quadArc([0.195, 0.195], [0.185, 0.04], [0.215, -0.11], 5),
    ...quadArc([0.215, -0.11], [0.11, -0.02], [-0.01, -0.065], 4),
  ]);
  const farOuterPts = outlineFlipX([
    [0.09, 0.14],
    [0.18, 0.195],
    ...quadArc([0.18, 0.195], [span * 0.52, 0.31], [span * 0.78, 0.175], 6),
    ...quadArc([span * 0.78, 0.175], [span * 0.63, 0.04], [span * 0.56, -0.13], 5),
    ...quadArc([span * 0.56, -0.13], [span * 0.41, -0.01], [0.205, -0.105], 5),
    [0.10, -0.02],
  ]);
  const farSheenPts = outlineFlipX(taperedCrescent(
    quadArc([0.19, 0.175], [span * 0.50, 0.28], [span * 0.73, 0.18], 5),
    [0.016, 0.028, 0.032, 0.028, 0.020, 0.010],
  ));

  return [
    kitPlate('wing.near.inner', nearInnerPts, 0.03, 'solder', [nearPivot[0], nearPivot[1], -0.064], {
      bevel: 0.005, anim: nearInnerSwing,
    }),
    kitPlate('wing.near.outer', nearOuterPts, 0.026, 'solder', [nearPivot[0], nearPivot[1], -0.018], {
      bevel: 0.004, anim: nearOuterSwing,
    }),
    kitPlate('wing.near.sheen', nearSheenPts, 0.014, 'plastic', [nearPivot[0], nearPivot[1], -0.044], {
      outline: false, anim: nearOuterSwing,
    }),
    kitPlate('wing.far.inner', farInnerPts, 0.028, 'solder', [farPivot[0], farPivot[1], 0.036], {
      bevel: 0.004, anim: farInnerSwing,
    }),
    kitPlate('wing.far.outer', farOuterPts, 0.026, 'solder', [farPivot[0], farPivot[1], 0.082], {
      bevel: 0.004, anim: farOuterSwing,
    }),
    kitPlate('wing.far.sheen', farSheenPts, 0.014, 'plastic', [farPivot[0], farPivot[1], 0.054], {
      outline: false, anim: farOuterSwing,
    }),
  ];
}

export function buildFlyingBat(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const cy = 0.52;
  const span = rng.range(0.62, 0.68);
  // Phase 0 matches wing downstroke so body recoils UP as wings clap DOWN on the 12 fps stepped clock.
  const recoilBob: AnimTag = { type: 'bob', axis: 'y', speed: 2.2, amp: 0.028, phase: 0 };
  const nearPivot: Vec3 = [wx(-0.04), cy + 0.02, -0.062];
  const farPivot: Vec3 = [wx(0.10), cy + 0.04, 0.046];

  const headPts = outlineFlipX([
    [-0.10, 0.01],
    ...quadArc([-0.10, 0.01], [-0.075, 0.115], [0.02, 0.11], 4),
    ...quadArc([0.02, 0.11], [0.075, 0.08], [0.11, 0.055], 3),
    ...quadArc([0.11, 0.055], [0.16, 0.07], [0.155, 0.025], 3),
    ...quadArc([0.155, 0.025], [0.12, -0.045], [0.02, -0.09], 4),
    ...quadArc([0.02, -0.09], [-0.08, -0.08], [-0.10, 0.01], 3),
  ]);
  const nearEarPts = outlineFlipX([
    [-0.045, -0.01],
    ...quadArc([-0.045, -0.01], [-0.04, 0.14], [-0.01, 0.28], 4),
    ...quadArc([-0.01, 0.28], [0.055, 0.13], [0.055, -0.01], 4),
  ]);
  const nearEarInnerPts = outlineFlipX([
    [-0.022, 0.03],
    ...quadArc([-0.022, 0.03], [-0.018, 0.13], [-0.002, 0.215], 3),
    ...quadArc([-0.002, 0.215], [0.032, 0.125], [0.03, 0.03], 3),
  ]);
  const farEarPts = outlineFlipX([
    [-0.04, -0.01],
    ...quadArc([-0.04, -0.01], [0.005, 0.13], [0.065, 0.25], 4),
    ...quadArc([0.065, 0.25], [0.075, 0.11], [0.04, -0.015], 4),
  ]);
  const farEarInnerPts = outlineFlipX([
    [-0.016, 0.03],
    ...quadArc([-0.016, 0.03], [0.012, 0.115], [0.052, 0.19], 3),
    ...quadArc([0.052, 0.19], [0.048, 0.105], [0.026, 0.03], 3),
  ]);
  const ruffPts = outlineFlipX([
    [-0.09, 0.05], [0.04, 0.065], [0.095, 0.015],
    [0.08, -0.055], [0.025, -0.025], [-0.01, -0.075], [-0.06, -0.03], [-0.10, -0.055],
  ]);
  const fangPts = outlineFlipX([[0.0, 0.025], [0.048, 0.01], [0.015, -0.032]]);
  const tailPts = outlineFlipX([[0.05, 0.03], [-0.11, -0.015], [-0.04, -0.048], [0.05, -0.02]]);
  const feetPts = outlineFlipX([[0.03, 0.015], [-0.055, -0.015], [-0.04, -0.045], [0.02, -0.02]]);

  const parts: PartSpec[] = [
    kitPlate('body', outlineTransform(outlineEllipse(0.15, 0.18, 16), { rot: -0.26 }), 0.088, 'pcbBlue', [wx(-0.02), cy - 0.045, -0.012], {
      bevel: 0.014, anim: recoilBob,
    }),
    kitPlate('ruff', ruffPts, 0.04, 'plastic', [wx(0.035), cy - 0.01, -0.068], {
      bevel: 0.005, anim: recoilBob,
    }),
    // Head sits in front of ear bases (z -0.044 vs -0.018) so zero ink cheek-seams cut across the face.
    kitPlate('head', headPts, 0.068, 'solder', [wx(0.09), cy + 0.058, -0.044], {
      bevel: 0.012, anim: recoilBob,
    }),
    kitPlate('fang', fangPts, 0.022, 'paper', [wx(0.195), cy + 0.022, -0.072], {
      outline: false, anim: recoilBob,
    }),
    kitPlate('nose.tip', outlineEllipse(0.022, 0.018, 10), 0.02, 'copper', [wx(0.228), cy + 0.088, -0.066], {
      outline: false, anim: recoilBob,
    }),
    kitPlate('ear.far', farEarPts, 0.036, 'solder', [wx(0.125), cy + 0.11, 0.018], {
      bevel: 0.006, anim: recoilBob,
    }),
    kitPlate('ear.far.inner', farEarInnerPts, 0.016, 'copper', [wx(0.125), cy + 0.11, -0.004], {
      outline: false, anim: recoilBob,
    }),
    kitPlate('ear.near', nearEarPts, 0.036, 'solder', [wx(0.015), cy + 0.10, -0.018], {
      bevel: 0.006, anim: recoilBob,
    }),
    kitPlate('ear.near.inner', nearEarInnerPts, 0.016, 'copper', [wx(0.015), cy + 0.10, -0.042], {
      outline: false, anim: recoilBob,
    }),
    kitPlate('tail', tailPts, 0.032, 'solder', [wx(-0.155), cy - 0.075, 0.018], {
      bevel: 0.004, anim: recoilBob,
    }),
    kitPlate('feet', feetPts, 0.028, 'copper', [wx(-0.11), cy - 0.135, -0.018], {
      bevel: 0.003, anim: recoilBob,
    }),
    ...buildFlyingWings(span, nearPivot, farPivot),
  ];

  return {
    id: 'prop.bat_flying',
    category: 'prop',
    label: 'Flying cartoon bat',
    parts,
    sockets: { label: [0, 0.96, 0], fx: [0, cy, -0.12] },
    tags: ['hover'],
  };
}
