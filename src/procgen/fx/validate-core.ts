import { hexToRgb, type ZoneFamily } from '../core/palette.js';
import type { FxFamily, FxRole } from './types.js';

/** Thresholds, in one place. Documented in .kiro/skills/particle-effect-validator/references/checks-and-thresholds.md */
export const FX_LIMITS = {
  /** Game scale: pixels per world unit. */
  pxPerUnit: 58,
  minLayers: 2,
  maxLayers: 6,
  maxInstances: 120,
  maxTriangles: 2500,
  /** Share of emitted area, percent. Target 60 / 30 / 10. */
  share: { primary: [40, 85], secondary: [8, 45], accent: [2, 25] } as Record<FxRole, [number, number]>,
  minDeltaE: 15,
  minBackgroundDeltaE: 25,
  popMs: [150, 1500] as [number, number],
  loopMs: [400, 6000] as [number, number],
  stepFps: [6, 15] as [number, number],
  maxKeys: 5,
  minParticlePx: 3,
  minVibecoderShapePx: 14,
  /** Page-space extent [width, height] in world units. */
  maxExtent: [3.4, 2.8] as [number, number],
  maxFullPanelExtent: [7, 5.6] as [number, number],
  minExtent: 0.3,
  maxZSpread: 0.25,
  maxDepthRatio: 0.6,
  wordHoldMs: [300, 1400] as [number, number],
  minWordCapPx: 10,
  maxWordWidth: 3.6,
  maxShake: 2,
  maxFlash: 6,
} as const;

/** Which palette families a family of effect may draw with. */
export const FX_FAMILY_ZONES: Record<FxFamily, ZoneFamily[]> = {
  system: ['neutral', 'signal', 'hardware', 'glass'],
  malware: ['neutral', 'malware', 'hardware'],
  vibecoder: ['neutral', 'human', 'signal'],
};

export type FxSeverity = 'error' | 'warning';

export interface FxIssue {
  code: string;
  severity: FxSeverity;
  message: string;
  /** Layer name, when the issue belongs to one. */
  layer?: string;
}

export interface FxReport {
  id: string;
  label: string;
  pass: boolean;
  errors: number;
  warnings: number;
  issues: FxIssue[];
  metrics: {
    layers: number;
    instances: number;
    triangles: number;
    /** Percent of emitted area per role. */
    share: Record<FxRole, number>;
    /** Lowest CIE Lab distance between the primary colour and any secondary colour. -1 when there is no pair. */
    deltaE: number;
    /** Smallest particle at its peak, in pixels at game scale. */
    minParticlePx: number;
    /** Largest single chunk at its peak, in pixels at game scale. */
    vibecoderShapePx: number;
    /** Page-space bounds over the whole effect: [minX, minY, maxX, maxY]. */
    bounds: [number, number, number, number];
    /** Latest moment any particle is still alive. */
    lastParticleMs: number;
  };
}

function srgbToLab(hex: number): [number, number, number] {
  const lin = hexToRgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  const x = (lin[0] * 0.4124564 + lin[1] * 0.3575761 + lin[2] * 0.1804375) / 0.95047;
  const y = lin[0] * 0.2126729 + lin[1] * 0.7151522 + lin[2] * 0.072175;
  const z = (lin[0] * 0.0193339 + lin[1] * 0.119192 + lin[2] * 0.9503041) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (t * (24389 / 27) + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIE76 colour distance between two sRGB hex colours. Around 2 is just noticeable; under 15 reads as one colour in motion. */
export function fxDeltaE(a: number, b: number): number {
  const p = srgbToLab(a), q = srgbToLab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** Collects issues in the order rules report them. */
export type FxAdd = (severity: FxSeverity, code: string, message: string, layer?: string) => void;

export function createIssueSink(): { issues: FxIssue[]; add: FxAdd } {
  const issues: FxIssue[] = [];
  const add: FxAdd = (severity, code, message, layer) => {
    issues.push(layer ? { code, severity, message, layer } : { code, severity, message });
  };
  return { issues, add };
}
