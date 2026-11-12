import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { postBaseUniforms } from './post-common.js';

/**
 * Old-TV look: 1 css-px scanlines every 3 px that crawl, a slow rolling bright band, tape grain, rare flicker and a
 * soft vignette. It runs AFTER the pixel-art pass and never resamples the picture, so the pixel grid stays
 * crisp. `distort` (barrel warp) is opt-in and 0 by default because it re-filters the pixel cells.
 */
export interface CrtParams {
  scanlineIntensity: number;
  rollIntensity: number;
  noiseOpacity: number;
  flickerStrength: number;
  vignetteStrength: number;
  mix: number;
  distort: number;
}

export const DEFAULT_CRT_PARAMS: Readonly<CrtParams> = {
  scanlineIntensity: 0.18,
  rollIntensity: 0.045,
  noiseOpacity: 0.05,
  flickerStrength: 0.05,
  vignetteStrength: 0.5,
  mix: 1,
  distort: 0,
};

const CRT_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const CRT_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uDpr;
uniform float uTime;
uniform float uScan;
uniform float uRoll;
uniform float uNoise;
uniform float uFlicker;
uniform float uVignette;
uniform float uMix;
uniform float uDistort;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec3 straight = texture2D(tDiffuse, vUv).rgb;
  vec2 c = vUv * 2.0 - 1.0;
  vec2 uv = vUv;
  if (uDistort > 0.0) {
    uv += c * dot(c, c) * uDistort;
    uv = clamp(uv, 0.001, 0.999);
  }
  vec3 col = uDistort > 0.0 ? texture2D(tDiffuse, uv).rgb : straight;

  // CSS pixels from the top-left, like the DOM overlay.
  vec2 css = vec2(vUv.x, 1.0 - vUv.y) * uResolution / uDpr;

  // Scanlines: 3 px pitch, 1 px dark, crawling one pitch every 0.9 s.
  float pitch = 3.0;
  float scanPhase = mod(css.y + uTime / 0.9 * pitch, pitch);
  col *= 1.0 - step(pitch - 1.0, scanPhase) * uScan;

  // Rolling band: 30% tall, crosses the screen every 8 s.
  float yTop = 1.0 - vUv.y;
  float centre = -0.15 + 1.45 * fract(uTime / 8.0);
  col += vec3(1.0) * uRoll * clamp(1.0 - abs(yTop - centre) / 0.15, 0.0, 1.0);

  // Grain, restepped 10 times a second.
  float n = hash(floor(css * 0.5) + floor(uTime * 10.0));
  col = mix(col, vec3(1.0), n * uNoise);

  // Flicker: two short dips in a 3.7 s cycle.
  float ph = fract(uTime / 3.7);
  float dip = (ph > 0.18 && ph < 0.22) ? uFlicker : (ph > 0.64 && ph < 0.70) ? uFlicker * 0.6 : 0.0;
  col *= 1.0 - dip;

  // Vignette: ellipse centred at 50% 52%, clear until 55% of the corner distance.
  vec2 vc = (vec2(vUv.x, vUv.y) - vec2(0.5, 0.48)) / 0.5;
  float r = length(vc) / 1.41421356;
  col *= 1.0 - smoothstep(0.55, 1.0, r) * uVignette;

  gl_FragColor = vec4(mix(straight, col, clamp(uMix, 0.0, 1.0)), 1.0);
}`;

export function createCrtPass(width: number, height: number, params: CrtParams = DEFAULT_CRT_PARAMS): ShaderPass {
  return new ShaderPass({
    uniforms: {
      ...postBaseUniforms(width, height),
      uDpr: { value: 1 },
      uTime: { value: 0 },
      uScan: { value: params.scanlineIntensity },
      uRoll: { value: params.rollIntensity },
      uNoise: { value: params.noiseOpacity },
      uFlicker: { value: params.flickerStrength },
      uVignette: { value: params.vignetteStrength },
      uMix: { value: params.mix },
      uDistort: { value: params.distort },
    },
    vertexShader: CRT_VERT,
    fragmentShader: CRT_FRAG,
  });
}

/** width/height in device pixels; dpr converts them back to css pixels for the scanline pitch. */
export function setCrtSize(pass: ShaderPass, width: number, height: number, dpr = 1): void {
  (pass.uniforms.uResolution.value as THREE.Vector2).set(Math.max(1, width), Math.max(1, height));
  pass.uniforms.uDpr.value = Math.max(0.5, dpr);
}

export function setCrtMix(pass: ShaderPass, mix: number): void {
  pass.uniforms.uMix.value = mix;
}

export function setCrtParams(pass: ShaderPass, params: CrtParams): void {
  const u = pass.uniforms;
  u.uScan.value = params.scanlineIntensity;
  u.uRoll.value = params.rollIntensity;
  u.uNoise.value = params.noiseOpacity;
  u.uFlicker.value = params.flickerStrength;
  u.uVignette.value = params.vignetteStrength;
  u.uMix.value = params.mix;
  u.uDistort.value = params.distort;
}

export function setCrtTime(pass: ShaderPass, time: number): void {
  pass.uniforms.uTime.value = time;
}
