import * as THREE from 'three';
import { COMIC_FRAG, COMIC_FX_LIGHTS, COMIC_LIGHT, type ComicMaterial } from './comic-material.js';

/**
 * Stepped 12 fps comic surface variants patched onto COMIC_FRAG without forking it.
 * Every variant preserves cel bands (1.0 / 0.68 / 0.4), albedo map mixing, halftone, ink rim,
 * emissive, and lightning flash, and animates strictly on stepped twos (`floor(uTime * 12.0)`).
 *
 * Layer rule: imports `three` and `./comic-material.js` only (palette hexes are passed by callers).
 */
export type ComicSurfaceKind = 'clay_cracks' | 'coffee_heat' | 'accretion_halo' | 'crt_code';

interface ComicPatch {
  /** Uniform declarations and `cv`-prefixed helper functions inserted before `main()`. */
  decl?: string;
  /** Statements at the top of `main()`; may step `comicUv` before `uMap` is sampled. */
  begin?: string;
  /** Surface colour step inserted after map/stripes/halftone and before the ink rim. */
  surface?: string;
  /** Float expression multiplied into `uColor * uEmissive`. */
  emissive?: string;
  /** Post-rim/flash hook just before final output. */
  final?: string;
}

export interface VariantPalette {
  accentA: number;
  accentB: number;
  hot: number;
  deep: number;
  /** UV normalization half-extents for radial surface patches. */
  uvScale?: [number, number];
}

const ANCHOR = {
  main: 'void main() {',
  mapSample: 'texture2D(uMap, vUv)',
  rim: '  vec3 viewDir = normalize(cameraPosition - vWorld);',
  emissive: '  col += uColor * uEmissive;',
  output: '  if (uGhost > 0.5) {',
} as const;

const CV_HASH = /* glsl */ `
float cvHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}`;

function patchComicFragment(patch: ComicPatch, source: string = COMIC_FRAG): string {
  let out = source;
  const swap = (anchor: string, replacement: string): void => {
    if (!out.includes(anchor)) {
      throw new Error(`comic fragment shader no longer contains "${anchor.trim()}": update ANCHOR in comic-variants.ts`);
    }
    out = out.replace(anchor, replacement);
  };
  swap(ANCHOR.main, `${CV_HASH}\n${patch.decl ?? ''}\n${ANCHOR.main}\n  vec2 comicUv = vUv;\n${patch.begin ?? ''}`);
  swap(ANCHOR.mapSample, 'texture2D(uMap, comicUv)');
  swap(ANCHOR.rim, `${patch.surface ?? ''}\n${ANCHOR.rim}`);
  swap(ANCHOR.emissive, `  col += uColor * uEmissive * (${patch.emissive ?? '1.0'});`);
  swap(ANCHOR.output, `${patch.final ?? ''}\n${ANCHOR.output}`);
  return out;
}

function comicVariant(
  base: ComicMaterial,
  patch: ComicPatch,
  uniforms: Record<string, THREE.IUniform>,
): ComicMaterial {
  const mat = base.clone();
  mat.fragmentShader = patchComicFragment(patch);
  Object.assign(mat.uniforms, COMIC_LIGHT, COMIC_FX_LIGHTS, uniforms);
  mat.userData.comic = true;
  mat.needsUpdate = true;
  return mat;
}

const SHARED_DECL = /* glsl */ `
uniform vec3 uCvAccentA;
uniform vec3 uCvAccentB;
uniform vec3 uCvHot;
uniform vec3 uCvDeep;
uniform vec2 uCvScale;
uniform float uCvFreeze;`;

/** Sculpted clay golem tectonic crack seams pulsing upward in stepped 12 fps beats (`agent.clod`). */
const CLAY_CRACKS_PATCH: ComicPatch = {
  decl: SHARED_DECL,
  begin: /* glsl */ `
  float cvTick = uCvFreeze > 0.5 ? 0.0 : floor(uTime * 12.0);
  float cvJolt = step(0.9, cvHash(vec2(cvTick, floor(vUv.y * 6.0))));
  comicUv.x += cvJolt * 0.025;`,
  surface: /* glsl */ `
  float cvLive = 1.0 - uCvFreeze * 0.65;
  vec2 cvP = floor((vUv / max(uCvScale, vec2(0.05))) * 16.0) / 16.0;
  float cvSlab = step(0.78, cvHash(floor(cvP * 2.5)));
  vec3 cvClay = mix(uColor, uCvAccentB, cvSlab * 0.65) * band;
  float cvJog = (floor(cvHash(vec2(floor(cvP.y * 5.0), 3.7)) * 3.0) - 1.0) * 0.09;
  float cvMask = step(-0.76, cvP.y) * step(cvP.y, 0.76) * step(0.22, abs(cvP.x)) * step(abs(cvP.x), 0.88);
  float cvLeft = abs((cvP.x + 0.52) * 0.85 + (cvP.y - 0.08) * 0.48 + cvJog);
  float cvRight = abs((cvP.x - 0.52) * 0.85 - (cvP.y + 0.06) * 0.48 - cvJog);
  float cvDist = min(cvLeft, cvRight);
  float cvEdge = step(cvDist, 0.085) * cvMask;
  float cvSeam = step(cvDist, 0.048) * cvMask;
  float cvSurge = step(0.5, fract(cvP.y * 0.9 - floor(cvTick * 0.5) * 0.25));
  col = mix(col, cvClay, 0.72 * cvLive);
  col = mix(col, uCvDeep * band, cvEdge * 0.88 * cvLive);
  col = mix(col, uCvAccentA * max(band, 0.78), cvSeam * cvLive);
  col = mix(col, uCvHot * max(band, 0.92), cvSeam * cvSurge * (1.0 - uCvFreeze));`,
};

/** Swirling dark-roast espresso, golden crema spiral, and stepped rising heat-wave shimmer (`agent.antigravy`). */
const COFFEE_HEAT_PATCH: ComicPatch = {
  decl: SHARED_DECL,
  begin: /* glsl */ `
  float cvTick = uCvFreeze > 0.5 ? 0.0 : floor(uTime * 12.0);
  float cvWave = step(0.5, fract(vUv.y * 10.0 - cvTick * 0.25)) * 2.0 - 1.0;
  comicUv.x += cvWave * 0.035;`,
  surface: /* glsl */ `
  vec2 cvQ = floor((vUv / max(uCvScale, vec2(0.05))) * 14.0) / 14.0;
  float cvR = length(cvQ);
  float cvAng = atan(cvQ.y, cvQ.x);
  float cvTurn = cvTick * 0.28;
  float cvArm = fract((cvAng + cvTurn) / 6.2831853 * 2.0 + cvR * 1.35);
  float cvRim = step(0.58, cvR) * step(cvR, 0.96);
  float cvSwirl = step(0.62, cvArm) * step(0.16, cvR) * step(cvR, 0.82);
  float cvCrema = max(cvRim, cvSwirl);
  float cvWell = step(cvR, 0.28);
  float cvHeat = step(0.68, fract(cvQ.y * 2.2 - cvTick * 0.16 + step(0.5, fract(cvQ.x * 2.5)) * 0.3));
  col = mix(col, uCvDeep * band, cvWell * 0.85);
  col = mix(col, uCvAccentA * band, cvCrema * 0.9);
  col = mix(col, uCvHot * band, cvCrema * cvHeat * (1.0 - uCvFreeze));`,
};

/** Concentric planetary accretion ring circles framing the separated event-horizon core (`agent.gork`). */
const ACCRETION_HALO_PATCH: ComicPatch = {
  decl: SHARED_DECL,
  begin: /* glsl */ `
  float cvTick = uCvFreeze > 0.5 ? 0.0 : floor(uTime * 12.0);`,
  surface: /* glsl */ `
  float cvRad = floor((cos(vUv.y * 6.2831853) * 0.5 + 0.5) * 12.0) / 12.0;
  float cvArc = fract((floor(vUv.x * 24.0) / 24.0 + (1.0 - uCvScale.x) * 0.0) * 3.0 - cvTick * 0.04);
  float cvInnerRim = step(cvRad, 0.26);
  float cvCassini = step(0.52, cvRad) * step(cvRad, 0.70);
  float cvOuter = step(0.70, cvRad);
  vec3 cvRingCol = mix(uCvAccentA, uCvAccentB, cvOuter);
  cvRingCol = mix(cvRingCol, uCvHot, cvInnerRim * (0.65 + 0.35 * step(0.35, cvArc)));
  cvRingCol = mix(cvRingCol, uCvDeep, cvCassini);
  col = mix(col, cvRingCol * band, 0.92 * (1.0 - uCvFreeze * 0.55));`,
};

/** Clean dark recessed CRT glass screen behind the `>_` prompt symbols, with no moving lines (`agent.codec`). */
const CRT_CODE_PATCH: ComicPatch = {
  decl: SHARED_DECL,
  begin: /* glsl */ `
  float cvTick = uCvFreeze > 0.5 ? 0.0 : floor(uTime * 12.0);`,
  surface: /* glsl */ `
  float cvLive = 1.0 - uCvFreeze * 0.4 + step(999999.0, cvTick) * 0.0;
  vec2 cvB = abs(vUv - vec2(0.5));
  float cvRim = max(step(0.41, cvB.x), step(0.38, cvB.y));
  vec3 cvWell = mix(uCvDeep * band, mix(col, uCvDeep * band, 0.42), cvRim);
  col = mix(col, cvWell, 0.94 * cvLive);`,
};

const SURFACE_PATCHES: Record<ComicSurfaceKind, ComicPatch> = {
  clay_cracks: CLAY_CRACKS_PATCH,
  coffee_heat: COFFEE_HEAT_PATCH,
  accretion_halo: ACCRETION_HALO_PATCH,
  crt_code: CRT_CODE_PATCH,
};

export function createSurfaceVariant(
  base: ComicMaterial,
  kind: ComicSurfaceKind,
  palette: VariantPalette,
): ComicMaterial {
  const [sx, sy] = palette.uvScale ?? [0.5, 0.5];
  return comicVariant(base, SURFACE_PATCHES[kind], {
    uCvAccentA: { value: new THREE.Color(palette.accentA) },
    uCvAccentB: { value: new THREE.Color(palette.accentB) },
    uCvHot: { value: new THREE.Color(palette.hot) },
    uCvDeep: { value: new THREE.Color(palette.deep) },
    uCvScale: { value: new THREE.Vector2(sx, sy) },
    uCvFreeze: { value: 0 },
  });
}
