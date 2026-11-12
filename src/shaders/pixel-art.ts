import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { postBaseUniforms } from './post-common.js';

/**
 * Ordered-Bayer pixel quantizer. Samples stay on the cell center (no UV warp).
 * Modes: 0 full RGB, 1 gameboy, 2 amber, 3 cyber neon, 4 comix ink, 5 haunted mansion.
 */
export interface PixelArtParams {
  pixelSize: number;
  colorLevels: number;
  dither: number;
  edgeStrength: number;
  saturation: number;
  contrast: number;
  gridStrength: number;
  paletteMode: number;
}

export const DEFAULT_PIXEL_PARAMS: Readonly<PixelArtParams> = {
  pixelSize: 3.5,
  colorLevels: 16,
  dither: 0.85,
  edgeStrength: 0.65,
  saturation: 1.16,
  contrast: 1.05,
  gridStrength: 0.05,
  paletteMode: 0,
};

export const PIXEL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const BAYER_CHUNK = /* glsl */ `
float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x * 0.5 + a.y * a.y * 0.75);
}
float bayer4x4(vec2 cell) {
  vec2 p = floor(mod(cell, 4.0));
  return bayer2(0.5 * p) * 0.25 + bayer2(p);
}`;

export const EDGE_CHUNK = /* glsl */ `
vec3 samplePixelEdge(sampler2D tex, vec2 centerUv, vec2 texel, float edgeStrength) {
  vec3 c0 = texture2D(tex, centerUv).rgb;
  vec3 cN = texture2D(tex, centerUv + vec2(0.0, texel.y)).rgb;
  vec3 cS = texture2D(tex, centerUv - vec2(0.0, texel.y)).rgb;
  vec3 cE = texture2D(tex, centerUv + vec2(texel.x, 0.0)).rgb;
  vec3 cW = texture2D(tex, centerUv - vec2(texel.x, 0.0)).rgb;
  float l0 = luma(c0);
  float lN = luma(cN), lS = luma(cS), lE = luma(cE), lW = luma(cW);
  float maxL = max(max(lN, lS), max(lE, lW));
  float avgL = 0.25 * (lN + lS + lE + lW);
  float outline = smoothstep(0.10, 0.32, maxL - l0) * edgeStrength;
  float ridge = clamp((l0 - avgL) * 1.35, -0.06, 0.11) * edgeStrength;
  return clamp(c0 * (1.0 - outline * 0.42) + ridge, 0.0, 1.0);
}`;

export const PALETTE_CHUNK = /* glsl */ `
vec3 ramp4(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float q) {
  return q < 0.33 ? mix(c0, c1, q * 3.0)
       : q < 0.66 ? mix(c1, c2, (q - 0.33) * 3.0)
       : mix(c2, c3, (q - 0.66) * 3.0);
}
vec3 applyPaletteMode(vec3 col, float qLuma, float mode) {
  if (mode < 0.5) return col;
  if (mode < 1.5) {
    vec3 c0 = vec3(0.06, 0.22, 0.06), c1 = vec3(0.19, 0.38, 0.19);
    vec3 c2 = vec3(0.55, 0.67, 0.06), c3 = vec3(0.72, 0.84, 0.16);
    return ramp4(c0, c1, c2, c3, qLuma);
  }
  if (mode < 2.5) {
    return mix(vec3(0.05, 0.02, 0.0), vec3(1.0, 0.68, 0.12), qLuma);
  }
  if (mode < 3.5) {
    return qLuma < 0.5 ? mix(vec3(0.04, 0.03, 0.12), vec3(0.12, 0.42, 0.98), qLuma * 2.0)
                       : mix(vec3(0.12, 0.42, 0.98), vec3(1.0, 0.38, 0.72), (qLuma - 0.5) * 2.0);
  }
  if (mode < 4.5) {
    vec3 ramp = ramp4(
      vec3(20.0, 15.0, 18.0) / 255.0,
      vec3(239.0, 71.0, 111.0) / 255.0,
      vec3(255.0, 209.0, 102.0) / 255.0,
      vec3(239.0, 230.0, 210.0) / 255.0,
      qLuma);
    return mix(ramp, col, 0.22);
  }
  vec3 mansion = ramp4(
    vec3(20.0, 15.0, 18.0) / 255.0,
    vec3(58.0, 42.0, 85.0) / 255.0,
    vec3(155.0, 93.0, 229.0) / 255.0,
    vec3(224.0, 177.0, 90.0) / 255.0,
    qLuma);
  return mix(mansion, col, 0.22);
}`;

export const QUANTIZE_CHUNK = /* glsl */ `
vec3 quantizePixelArt(vec3 col, vec2 cell, vec2 subUv, float levels, float ditherAmt, float sat, float con, float pixelSize, float gridStr, float mode) {
  col = clamp((col - 0.5) * con + 0.5, 0.0, 1.0);
  float lum = luma(col);
  col = clamp(mix(vec3(lum), col, sat), 0.0, 1.0);
  float dither = (bayer4x4(cell) - 0.46875) * (ditherAmt / levels);
  col = clamp(col + dither, 0.0, 1.0);
  col = floor(col * levels + 0.5) / levels;
  float qLuma = floor(clamp(lum + dither, 0.0, 1.0) * levels + 0.5) / levels;
  col = applyPaletteMode(col, qLuma, mode);
  float border = step(1.0 - 1.0 / max(pixelSize, 2.0), max(subUv.x, subUv.y));
  return col * (1.0 - border * gridStr);
}`;

export const PIXEL_MAIN = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uPixelSize;
uniform float uColorLevels;
uniform float uDither;
uniform float uEdgeStrength;
uniform float uSaturation;
uniform float uContrast;
uniform float uGridStrength;
uniform float uPaletteMode;
varying vec2 vUv;

void main() {
  vec2 grid = max(floor(uResolution / max(uPixelSize, 1.0)), vec2(1.0));
  vec2 cell = floor(vUv * grid);
  vec2 subUv = fract(vUv * grid);
  vec2 centerUv = (cell + 0.5) / grid;
  vec2 texel = 1.0 / grid;
  vec3 col = samplePixelEdge(tDiffuse, centerUv, texel, uEdgeStrength);
  col = quantizePixelArt(col, cell, subUv, uColorLevels, uDither, uSaturation, uContrast, uPixelSize, uGridStrength, uPaletteMode);
  gl_FragColor = vec4(col, 1.0);
}`;

export const buildPixelArtFrag = () =>
  [BAYER_CHUNK, EDGE_CHUNK, PALETTE_CHUNK, QUANTIZE_CHUNK, PIXEL_MAIN].join('\n');

export function createPixelArtPass(width: number, height: number, params: PixelArtParams = DEFAULT_PIXEL_PARAMS): ShaderPass {
  return new ShaderPass({
    uniforms: {
      ...postBaseUniforms(width, height),
      uPixelSize: { value: params.pixelSize },
      uColorLevels: { value: params.colorLevels },
      uDither: { value: params.dither },
      uEdgeStrength: { value: params.edgeStrength },
      uSaturation: { value: params.saturation },
      uContrast: { value: params.contrast },
      uGridStrength: { value: params.gridStrength },
      uPaletteMode: { value: params.paletteMode },
    },
    vertexShader: PIXEL_VERT,
    fragmentShader: buildPixelArtFrag(),
  });
}

export function setPixelArtSize(pass: ShaderPass, width: number, height: number): void {
  (pass.uniforms.uResolution.value as THREE.Vector2).set(Math.max(1, width), Math.max(1, height));
}

/**
 * `pixelSize` is in CSS pixels; the pass works in device pixels, so on a 2x display the grid would be half
 * as coarse and read as a colour filter. Pass the renderer's pixel ratio to keep the same block size on screen.
 */
export function setPixelArtParams(pass: ShaderPass, params: PixelArtParams, pixelRatio = 1): void {
  const u = pass.uniforms;
  u.uPixelSize.value = params.pixelSize * Math.max(0.5, pixelRatio);
  u.uColorLevels.value = params.colorLevels;
  u.uDither.value = params.dither;
  u.uEdgeStrength.value = params.edgeStrength;
  u.uSaturation.value = params.saturation;
  u.uContrast.value = params.contrast;
  u.uGridStrength.value = params.gridStrength;
  u.uPaletteMode.value = params.paletteMode;
}
