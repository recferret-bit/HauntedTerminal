/**
 * Material variants of the comic material, built WITHOUT editing src/shaders/comic-material.ts:
 * the stock fragment shader is patched at four named points, so a variant inherits the cel bands,
 * the map mix, halftone, the ink rim, emissive and the lightning flash, and only adds its own step.
 *
 *   glitchVariant     malware corruption: stepped magenta / violet blocks and torn rows
 *   frozenVariant     SIGSTOP: an ice skin (tex.ice) that flips in block by block, emissive halved
 *   petrifiedVariant  chmod -x: a stone skin (tex.stone), emissive off
 *
 * Rules a variant keeps (see ../SKILL.md): colours are palette zones passed as uniforms, everything is
 * multiplied by `band`, transitions use step() / floor() and never a smooth fade, the ink rim still
 * runs after the variant's surface code.
 *
 * To ship one, move the code into src/shaders/ and wire it from the stage. The variants here are checked
 * by scripts/check-examples.mjs (patch anchors still match, uniforms exist).
 */
import * as THREE from 'three';
import { COMIC_FRAG, isComic, type ComicMaterial } from '../../../../src/shaders/comic-material.js';
import { TextureCatalog, ZONES, PAPER, toDataTexture } from '../../../../src/procgen/index.js';

export interface ComicPatch {
  /** Uniform declarations and helper functions, placed before main(). Prefix names with `cv`. */
  decl?: string;
  /** First statements of main(). May move `comicUv`, the uMap lookup coordinate (starts as vUv). */
  begin?: string;
  /** Edits `col` after map, stripes and halftone, before the ink rim. In scope: n, shade, band, comicUv. */
  surface?: string;
  /** GLSL float expression multiplied into the emissive add. Default `1.0`. */
  emissive?: string;
  /** Edits `col` after rim, emissive and flash, just before output. In scope: fres, viewDir. */
  final?: string;
}

/** The exact lines of COMIC_FRAG the patch hangs on. If comic-material.ts changes them, patching throws. */
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

export function patchComicFragment(patch: ComicPatch, source: string = COMIC_FRAG): string {
  let out = source;
  const swap = (anchor: string, replacement: string): void => {
    if (!out.includes(anchor)) throw new Error(`comic fragment shader no longer contains "${anchor.trim()}": update ANCHOR in comic-variants.ts`);
    out = out.replace(anchor, replacement);
  };
  swap(ANCHOR.main, `${CV_HASH}\n${patch.decl ?? ''}\n${ANCHOR.main}\n  vec2 comicUv = vUv;\n${patch.begin ?? ''}`);
  swap(ANCHOR.mapSample, 'texture2D(uMap, comicUv)');
  swap(ANCHOR.rim, `${patch.surface ?? ''}\n${ANCHOR.rim}`);
  swap(ANCHOR.emissive, `  col += uColor * uEmissive * (${patch.emissive ?? '1.0'});`);
  swap(ANCHOR.output, `${patch.final ?? ''}\n${ANCHOR.output}`);
  return out;
}

/**
 * A copy of `base` (same colour, flags, map, opacity) running a patched fragment shader.
 * The copy is still a comic material (`userData.comic`), so whatever feeds uTime / uFlash / uFlashPos
 * to comic materials must be given this one too.
 */
export function comicVariant(base: ComicMaterial, patch: ComicPatch, uniforms: Record<string, THREE.IUniform>): ComicMaterial {
  const mat = base.clone();
  mat.fragmentShader = patchComicFragment(patch);
  Object.assign(mat.uniforms, uniforms);
  mat.userData.comic = true;
  mat.needsUpdate = true;
  return mat;
}

const zoneColor = (id: keyof typeof ZONES): THREE.IUniform => ({ value: new THREE.Color(ZONES[id].color) });

// ---------------------------------------------------------------------------------------------
// Malware corruption. World-space blocks (1/8 unit, about 7 screen px) flip to magenta or violet and
// hold for a quarter second; rows 1/16 unit tall tear sideways at 12 steps per second.
// uGlitch 0 = clean, 0.35 = infected idle, 1 = dying.
// ---------------------------------------------------------------------------------------------
export const GLITCH_PATCH: ComicPatch = {
  decl: /* glsl */ `
uniform float uGlitch;
uniform vec3 uGlitchA;
uniform vec3 uGlitchB;
uniform vec3 uGlitchVoid;`,
  begin: /* glsl */ `
  float cvRow = floor(vWorld.y * 16.0);
  float cvTick = floor(uTime * 12.0);
  float cvTear = step(1.0 - 0.3 * uGlitch, cvHash(vec2(cvRow, cvTick)));
  comicUv.x += cvTear * (floor(cvHash(vec2(cvTick, cvRow)) * 5.0) - 2.0) * 0.125;`,
  surface: /* glsl */ `
  vec2 cvCell = floor(vWorld.xy * 8.0);
  float cvEaten = step(1.0 - 0.4 * uGlitch, cvHash(cvCell + floor(uTime * 4.0) * 0.37));
  vec3 cvInk = cvHash(cvCell.yx + 3.1) < 0.5 ? uGlitchA : uGlitchB;
  col = mix(col, cvInk * band, cvEaten);
  col = mix(col, uGlitchVoid, cvTear * step(0.6, cvHash(vec2(cvRow, 9.7))));`,
};

export function glitchVariant(base: ComicMaterial, amount = 0.35): ComicMaterial {
  return comicVariant(base, GLITCH_PATCH, {
    uGlitch: { value: amount },
    uGlitchA: zoneColor('corruptMagenta'),
    uGlitchB: zoneColor('corruptViolet'),
    uGlitchVoid: zoneColor('voidPurple'),
  });
}

// ---------------------------------------------------------------------------------------------
// Skin overlay, shared by ice and stone. A tileable comic texture is projected in page space (world
// xy, x negated because world +x is screen-left) and replaces the surface block by block as
// uOverlayAmount goes 0 -> 1. No time term: frozen and petrified things do not move.
// ---------------------------------------------------------------------------------------------
export const OVERLAY_PATCH: ComicPatch = {
  decl: /* glsl */ `
uniform sampler2D uOverlay;
uniform float uOverlayAmount;
uniform float uOverlayScale;
uniform float uOverlayGlint;
uniform vec3 uOverlayGlintColor;
uniform float uOverlayEmissiveCut;`,
  surface: /* glsl */ `
  vec2 cvPage = vec2(-vWorld.x, vWorld.y);
  float cvTurned = step(cvHash(floor(cvPage * 8.0)), uOverlayAmount);
  vec3 cvSkin = texture2D(uOverlay, cvPage * uOverlayScale).rgb * band;
  float cvGlint = uOverlayGlint * step(0.95, band) * step(0.9, fract((cvPage.x + cvPage.y) * 2.5));
  cvSkin = mix(cvSkin, uOverlayGlintColor, cvGlint);
  col = mix(col, cvSkin, cvTurned);`,
  emissive: '1.0 - uOverlayAmount * uOverlayEmissiveCut',
};

const skins = new Map<string, THREE.DataTexture>();
function skin(id: string): THREE.DataTexture {
  let tex = skins.get(id);
  if (!tex) {
    tex = toDataTexture(TextureCatalog.build(id), true);
    skins.set(id, tex);
  }
  return tex;
}

function overlayVariant(base: ComicMaterial, textureId: string, amount: number, glint: number, emissiveCut: number): ComicMaterial {
  return comicVariant(base, OVERLAY_PATCH, {
    uOverlay: { value: skin(textureId) },
    uOverlayAmount: { value: amount },
    uOverlayScale: { value: 0.75 },
    uOverlayGlint: { value: glint },
    uOverlayGlintColor: { value: new THREE.Color(PAPER) },
    uOverlayEmissiveCut: { value: emissiveCut },
  });
}

/** SIGSTOP. Ice shards over the surface, paper glints in the lit band, glow halved. */
export function frozenVariant(base: ComicMaterial, amount = 1): ComicMaterial {
  return overlayVariant(base, 'tex.ice', amount, 1, 0.5);
}

/** chmod -x. Cracked stone over the surface, no glow at all: a petrified eye is a dead eye. */
export function petrifiedVariant(base: ComicMaterial, amount = 1): ComicMaterial {
  return overlayVariant(base, 'tex.stone', amount, 0, 1);
}

/**
 * Swap every comic material under `root` for a variant (ink shells are skipped: ink stays ink).
 * Returns the new materials, to animate their uniforms and feed them uTime / uFlash, and `restore`.
 */
export function applyComicVariant(root: THREE.Object3D, make: (base: ComicMaterial) => ComicMaterial): { materials: ComicMaterial[]; restore: () => void } {
  const made = new Map<ComicMaterial, ComicMaterial>();
  const undo: (() => void)[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    const mat = mesh.material;
    if (obj.userData.outline || !mat || Array.isArray(mat) || !isComic(mat)) return;
    let variant = made.get(mat);
    if (!variant) {
      variant = make(mat);
      made.set(mat, variant);
    }
    mesh.material = variant;
    undo.push(() => { mesh.material = mat; });
  });
  return {
    materials: [...made.values()],
    restore: () => {
      undo.forEach((fn) => fn());
      made.forEach((m) => m.dispose());
    },
  };
}
