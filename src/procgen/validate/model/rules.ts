import type { AnimType, ModelCategory } from '../../core/types.js';

/**
 * Every threshold of the model validator, in one place.
 * Mirrored (with the reason for each) in
 * .kiro/skills/model-geometry-validator/references/checks-and-thresholds.md: change both together.
 * Lengths are world units; `Px` values are pixels at game scale (`gamePxPerUnit`).
 */
export const MODEL_RULES = {
  /** The game shows the vibecoder (1.6 units) about 92 px tall. */
  gamePxPerUnit: 58,
  /** The 2D read is measured on a render this many times larger than game scale, then converted back. */
  readScale: 3,

  /** Part and triangle budgets. Below `minParts` is a warning, above the maxima is an error. */
  budgets: {
    vibecoder: { minParts: 6, maxParts: 40, maxTris: 3500 },
    npc: { minParts: 3, maxParts: 40, maxTris: 3500 },
    agent: { minParts: 6, maxParts: 40, maxTris: 3500 },
    malware: { minParts: 6, maxParts: 40, maxTris: 3500 },
    boss: { minParts: 6, maxParts: 40, maxTris: 3500 },
    door: { minParts: 5, maxParts: 40, maxTris: 3500 },
    pickup: { minParts: 4, maxParts: 40, maxTris: 3500 },
    prop: { minParts: 3, maxParts: 40, maxTris: 3500 },
    room: { minParts: 4, maxParts: 80, maxTris: 8000 },
    fx: { minParts: 1, maxParts: 40, maxTris: 3500 },
  } satisfies Record<ModelCategory, { minParts: number; maxParts: number; maxTris: number }>,

  ground: {
    /** |min y| must be within this of 0 for a model that stands on the floor. */
    tol: 0.03,
    /** A `hover` model's lowest point may not be higher than this. */
    hoverMax: 1.6,
    /** A pickup's lowest point must clear the floor by this much (pickups hover around y = 0.5). */
    pickupMinClearance: 0.08,
  },

  contact: {
    /** Two surfaces closer than this are touching. */
    contactTol: 0.004,
    /** A gap up to this is HAIRLINE_GAP (the two ink shells, 0.028 each, still merge); beyond it FLOATING_PART. */
    nearMiss: 0.06,
    /**
     * Depth (z) differences are multiplied by this before distances are measured: the front camera
     * cannot see a gap in depth, so 0.02 in z still counts as touching and 0.3 as a near miss.
     */
    zWeight: 0.2,
    /** Anim types that may legitimately leave the body, when the part or model opts in. */
    detachAnims: ['orbit', 'bob', 'spin'] as AnimType[],
    /** Part-name words that opt a `detachAnims` part out of the floating check. */
    detachNames: ['float', 'orbit', 'satellite'],
    /** Model tag that opts every `detachAnims` part out of the floating check. */
    detachTag: 'detached',
  },

  zfight: {
    /** Faces whose planes are closer than this fight for the same depth value. */
    planeTol: 0.0005,
    /** cos of the largest angle between two "parallel" faces. */
    normalDot: 0.9995,
    /** Only faces the camera can see matter: face normal z below this (the camera looks along +z). */
    facingZ: -0.05,
    /** Overlap smaller than this many game pixels is ignored. */
    minOverlapPx: 6,
  },

  /** Size ranges from the art bible. `major` is the larger of width and height. All are warnings. */
  sizes: {
    tolerance: 0.05,
    vibecoderDevHeight: [1.6, 1.6] as [number, number],
    malwareMajor: [0.6, 1.6] as [number, number],
    bossHeight: [1.8, 2.6] as [number, number],
    pickupMajor: [0.3, 0.5] as [number, number],
    doorHeight: [1.4, 1.9] as [number, number],
    doorWidth: [0.7, 1.1] as [number, number],
  },

  depth: {
    /** z extent may be at most this share of max(width, height). */
    maxRatio: 0.6,
    /** Rooms are wide stages: their limit is absolute. */
    roomMaxDepth: 3,
  },

  read: {
    /** A part showing fewer game pixels than this from the front counts as hidden ... */
    hiddenPx: 1,
    /** ... if on its own it would cover at least this many (otherwise it is just tiny). */
    hiddenMinSoloPx: 4,
    /** Thinnest readable feature, game pixels. */
    minFeaturePx: 2,
    /** Measurement slack on `minFeaturePx`. */
    featureTolPx: 0.3,
    /** Silhouette area / bounding-box area at or above this is "a box" (vibecoder, malware, boss). */
    boxFill: 0.88,
    /** 1 − silhouette area / convex-hull area. Below this the outline has no notches, horns or limbs. */
    minHullDeficit: { vibecoder: 0.06, agent: 0.1, malware: 0.1, boss: 0.1 } as Partial<Record<ModelCategory, number>>,
  },

  color: {
    /** Share of visible front pixels held by the largest zone. */
    dominantMin: 0.35,
    dominantMax: 0.8,
    /** Zones other than the two largest must hold at least this share together. */
    accentMin: 0.01,
    /** Zones per model, not counting `ink`, `paper` and lights (zones with emissive >= emissiveMin). */
    maxZones: 5,
    roomMaxZones: 8,
    /** A zone with at least this emissive strength is a light. */
    emissiveMin: 0.3,
    /** Lights (glass excluded) may cover at most this share of the visible model. Pickups are exempt. */
    emissiveMaxShare: 0.35,
    /** A required light must show at least this many game pixels. */
    minLightPx: 4,
  },

  malware: {
    /** Words one `malwareEye` part must carry in its name. */
    eyeNames: ['eye', 'core', 'keyhole'],
    /** `malwareEye` parts closer than this belong to one cluster. */
    eyeClusterGap: 0.1,
    /** One focal eye, or a pair. */
    maxEyeClusters: 2,
    sockets: ['bubble', 'eye', 'fx'],
  },

  pickup: { anims: ['bob', 'spin', 'pulse'] as AnimType[] },
  door: { ledName: 'led', sockets: ['lock'] },

  sockets: {
    /** A socket may sit this far outside the bounds: max(marginMin, marginRatio * largest extent). */
    marginMin: 0.3,
    marginRatio: 0.25,
  },

  /** Per anim type: largest sane speed (cycles per second) and amp (in the type's unit). */
  anim: {
    spin: { maxSpeed: 4, maxAmp: 1 },
    bob: { maxSpeed: 4, maxAmp: 0.4 },
    pulse: { maxSpeed: 4, maxAmp: 0.5 },
    swing: { maxSpeed: 4, maxAmp: 1.6 },
    jitter: { maxSpeed: 24, maxAmp: 0.12 },
    blink: { maxSpeed: 6, maxAmp: 0.95 },
    breathe: { maxSpeed: 1.5, maxAmp: 0.15 },
    legWalk: { maxSpeed: 4, maxAmp: 1.1 },
    armSwing: { maxSpeed: 4, maxAmp: 1.1 },
    orbit: { maxSpeed: 3, maxAmp: 1.5 },
  } satisfies Record<AnimType, { maxSpeed: number; maxAmp: number }>,
};

export type ModelRules = typeof MODEL_RULES;

export type ModelSeverity = 'error' | 'warning' | 'info';

export interface ModelIssue {
  /** Stable code, documented in checks-and-thresholds.md. */
  code: string;
  severity: ModelSeverity;
  /** The part to look at first. */
  part?: string;
  /** Every part concerned, when there is more than one. */
  parts?: string[];
  message: string;
  /** What to change in the ModelSpec. */
  fix: string;
}

export interface ModelStats {
  parts: number;
  tris: number;
  /** [width, height, depth] in world units. */
  size: [number, number, number];
  minY: number;
  /** Share of visible front pixels per zone (0..1). Empty when the 2D read did not run. */
  zoneShare: Record<string, number>;
  emissiveShare: number;
  /** Silhouette area / bounding-box area. */
  boxFill: number;
  /** 1 − silhouette area / convex-hull area. */
  hullDeficit: number;
  ms: number;
}

export interface ModelReport {
  id: string;
  category: string;
  seed?: number;
  /** No errors (and no warnings under `strict`). */
  ok: boolean;
  errors: number;
  warnings: number;
  infos: number;
  issues: ModelIssue[];
  stats: ModelStats;
}

export interface ModelValidateOptions {
  /** Structure and 3D geometry only: skip the 2D read and the palette / category rules. */
  geometryOnly?: boolean;
  /** Warnings fail the model too. */
  strict?: boolean;
  /** Issue codes to drop, or whole groups: `geometry`, `read`, `semantics`. */
  disable?: string[];
  /** Seed for `validateModel` and for textures in the 2D read. Default 1. */
  seed?: number;
  /** Replacement thresholds (start from a copy of MODEL_RULES). */
  rules?: ModelRules;
}

/** Collects issues; checks never throw for a bad model. */
export class ModelIssueSink {
  readonly issues: ModelIssue[] = [];
  private readonly off: Set<string>;

  constructor(disable: string[] = []) {
    this.off = new Set(disable);
  }

  disabled(codeOrGroup: string): boolean {
    return this.off.has(codeOrGroup);
  }

  add(severity: ModelSeverity, code: string, message: string, fix: string, parts?: string | string[]): void {
    if (this.off.has(code)) return;
    const list = parts === undefined ? [] : Array.isArray(parts) ? parts : [parts];
    const issue: ModelIssue = { code, severity, message, fix };
    if (list.length) issue.part = list[0];
    if (list.length > 1) issue.parts = list;
    this.issues.push(issue);
  }

  has(code: string): boolean {
    return this.issues.some((i) => i.code === code);
  }
}

export function modelPartList(names: string[], max = 6): string {
  const shown = names.slice(0, max).join(', ');
  return names.length > max ? `${shown} and ${names.length - max} more` : shown;
}
