import { kitBox, kitDisc, kitPlate, outlineStroke, SCREEN_LEFT, SCREEN_RIGHT } from '../../kit/greebles.js';
import { pickBoardTheme } from './shared.js';
import type { ModelSpec, PartSpec, Vec2 } from '../../core/types.js';
import { makeRng } from '../../core/rng.js';

// ---------------------------------------------------------------- prop.platter

export function buildPlatter(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const r = rng.range(0.31, 0.37);
  const cy = 0.44;
  const discZone = rng.chance(0.35) ? 'rubber' : 'heatsink';
  const trackZone = discZone === 'rubber' ? 'solder' : 'rubber';
  const parts: PartSpec[] = [
    kitDisc('disc', r, 0.045, discZone, [0, cy, 0], { sides: 16, texture: 'tex.platter' }),
    kitDisc('track', r * 0.56, 0.052, trackZone, [0, cy, -0.006], { sides: 14 }),
    kitDisc('hub', r * 0.28, 0.06, 'silicon', [0, cy, -0.015], { sides: 10 }),
    kitDisc('spindle', r * 0.12, 0.075, 'ink', [0, cy, -0.022], { sides: 8, outline: false }),
    kitBox('bracket', [0.1, 0.16, 0.06], 'copper', [0, cy + r * 0.88, -0.015]),
  ];
  return {
    id: 'prop.platter',
    category: 'prop',
    label: 'Disk platter',
    parts,
    sockets: { label: [0, cy + r + 0.14, 0], fx: [0, cy, -0.08] },
    tags: ['hover', 'wall'],
  };
}

// ---------------------------------------------------------------- prop.shelf

export function buildShelf(_seed: number): ModelSpec {
  const w = 1.85;
  const parts: PartSpec[] = [
    kitBox('plank', [w, 0.09, 0.28], 'rubber', [0, 0.24, 0]),
    kitBox('lip', [w, 0.045, 0.05], 'silicon', [0, 0.26, -0.145]),
    kitBox('bracket.l', [0.1, 0.2, 0.22], 'heatsink', [0.68, 0.12, 0.02]),
    kitBox('bracket.r', [0.1, 0.2, 0.22], 'heatsink', [-0.68, 0.12, 0.02]),
  ];
  return {
    id: 'prop.shelf',
    category: 'prop',
    label: 'Wall shelf',
    parts,
    sockets: { label: [0, 0.44, 0], fx: [0, 0.24, -0.14] },
    tags: ['hover', 'wall'],
  };
}

// ---------------------------------------------------------------- prop.corner_cobweb

export function buildCornerCobweb(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const s = rng.range(0.95, 1.15);
  const o: Vec2[] = [[s * 0.52, s * 0.52], [-s * 0.52, s * 0.52]];
  for (let i = 1; i <= 5; i++) {
    const t = i / 6;
    const sag = Math.sin(t * Math.PI) * s * 0.28;
    o.push([s * 0.52 - s * (1 - t) + sag * 0.65, s * 0.52 - s * 0.9 * t + sag * 0.65]);
  }
  o.push([s * 0.52, -s * 0.38]);
  const cy = 0.65;
  const parts: PartSpec[] = [
    kitPlate('web', o, 0.044, 'heatsink', [0, cy, 0], { texture: 'tex.ribbon-cable' }),
    kitBox('cleat.top', [0.28, 0.12, 0.08], 'rubber', [-s * 0.36, cy + s * 0.49, -0.01]),
    kitBox('cleat.corner', [0.22, 0.22, 0.08], 'silicon', [s * 0.43, cy + s * 0.46, -0.01]),
    kitBox('cleat.side', [0.12, 0.28, 0.08], 'rubber', [s * 0.47, cy - s * 0.26, -0.01]),
  ];
  return {
    id: 'prop.corner_cobweb',
    category: 'prop',
    label: 'Corner cable web',
    parts,
    sockets: { label: [0, cy + s * 0.65, 0], fx: [0, cy, -0.06] },
    tags: ['hover', 'wall'],
  };
}

// ---------------------------------------------------------------- prop.hanging_cable

export function buildHangingCable(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const len = rng.range(0.68, 0.92);
  const top = 1.05;
  const pivot: [number, number, number] = [0, top, 0];
  const anim = { type: 'swing' as const, axis: 'z' as const, speed: 0.25, amp: 0.075, phase: rng.next(), pivot };
  const bot = top - len;
  const parts: PartSpec[] = [
    kitBox('anchor', [0.18, 0.08, 0.12], 'silicon', [0, top, 0]),
    {
      name: 'cable',
      shape: {
        kind: 'tube',
        path: [[0, top - 0.02, 0], [0.05, top - len * 0.45, 0], [-0.04, top - len * 0.78, 0], [0.07, bot, 0]],
        radius: 0.042,
      },
      zone: 'rubber',
      pos: [0, 0, 0],
      anim,
    },
    kitBox('plug', [0.14, 0.12, 0.09], 'heatsink', [0.07, bot - 0.04, 0], { anim }),
    kitBox('pins', [0.08, 0.07, 0.05], 'gold', [0.07, bot - 0.11, -0.01], { anim }),
  ];
  return {
    id: 'prop.hanging_cable',
    category: 'prop',
    label: 'Hanging cable',
    parts,
    sockets: { label: [0, top + 0.16, 0], fx: [0.04, (top + bot) * 0.5, -0.08] },
    tags: ['hover', 'wall'],
  };
}

// ---------------------------------------------------------------- prop.pcb_plaque

export function buildPcbPlaque(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const theme = pickBoardTheme(seed, rng, 'pcbAmber');
  const w = 1.05;
  const h = 0.58;
  const cy = 0.44;
  const parts: PartSpec[] = [
    kitBox('board', [w, h, 0.07], theme.zone, [0, cy, 0], { texture: theme.texture }),
    kitBox('ic.a', [0.34, 0.26, 0.06], 'silicon', [0.18 * SCREEN_LEFT, cy, -0.03]),
    kitBox('ic.b', [0.24, 0.2, 0.06], 'silicon', [0.22 * SCREEN_RIGHT, cy - 0.05, -0.03]),
    kitBox('header', [0.38, 0.07, 0.06], 'gold', [0.08 * SCREEN_RIGHT, cy + 0.2, -0.03]),
  ];
  return {
    id: 'prop.pcb_plaque',
    category: 'prop',
    label: 'PCB wall plaque',
    parts,
    sockets: { label: [0, cy + h / 2 + 0.14, 0], fx: [0, cy, -0.08] },
    tags: ['hover', 'wall'],
  };
}

// ---------------------------------------------------------------- prop.led_bar

export function buildLedBar(seed: number): ModelSpec {
  const zones = ['phosphor', 'powerAmber', 'lockRed'] as const;
  const cy = 0.35;
  const parts: PartSpec[] = [
    kitBox('bezel', [0.66, 0.22, 0.08], 'rubber', [0, cy, 0]),
    kitBox('trim', [0.62, 0.04, 0.04], 'heatsink', [0, cy + 0.095, -0.025]),
  ];
  zones.forEach((zone, i) => {
    parts.push(
      kitPlate(
        `led.${i}`,
        outlineStroke([[-0.035, 0], [0.035, 0]], 0.09),
        0.04,
        zone,
        [(i - 1) * 0.17, cy - 0.01, -0.045],
        { outline: false, anim: { type: 'blink', speed: 0.7 + i * 0.25, phase: ((seed * 0.17 + i * 0.27) % 1) } },
      ),
    );
  });
  return {
    id: 'prop.led_bar',
    category: 'prop',
    label: 'Diagnostic LED bar',
    parts,
    sockets: { label: [0, cy + 0.24, 0], fx: [0, cy, -0.08] },
    tags: ['hover', 'wall'],
  };
}
