/**
 * A post effect that respects the page: a screen-space glitch for the moment malware hits the hero.
 * It follows the pattern of src/shaders/crt-pass.ts (a ShaderPass plus set* helpers) and goes into the
 * composer BEFORE the pixel-art pass, so its output is quantized, dithered and scanlined like
 * everything else:
 *
 *   RenderPass -> [glitch] -> pixel-art -> CRT -> OutputPass
 *   composer.insertPass(createGlitchPass(w, h), 1)
 *
 * What keeps it on-style: rows move by whole pixel-art cells, time is stepped (15 changes per second),
 * the colour split is exactly one cell, and at uAmount 0 the pass is disabled, not just invisible.
 */
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const GLITCH_PASS_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uTime;
uniform float uAmount;
uniform float uCell;
varying vec2 vUv;

float gpHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 cell = vec2(max(uCell, 1.0)) / uResolution;
  float tick = floor(uTime * 15.0);
  float row = floor(vUv.y / (cell.y * 6.0));
  float torn = step(1.0 - 0.5 * uAmount, gpHash(vec2(row, tick)));
  float cells = floor(gpHash(vec2(tick, row)) * 9.0) - 4.0;
  vec2 uv = vec2(clamp(vUv.x + cells * 2.0 * cell.x * torn, 0.0, 1.0), vUv.y);
  vec3 col = texture2D(tDiffuse, uv).rgb;
  float split = cell.x * torn;
  col.r = texture2D(tDiffuse, uv + vec2(split, 0.0)).r;
  col.b = texture2D(tDiffuse, uv - vec2(split, 0.0)).b;
  gl_FragColor = vec4(col, 1.0);
}`;

const GLITCH_PASS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** `cell` is PixelArtParams.pixelSize, so tears land on the pixel grid. Sizes are in device pixels, as for the other passes. */
export function createGlitchPass(width: number, height: number, cell = 2): ShaderPass {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uResolution: { value: new THREE.Vector2(Math.max(1, width), Math.max(1, height)) },
      uTime: { value: 0 },
      uAmount: { value: 0 },
      uCell: { value: cell },
    },
    vertexShader: GLITCH_PASS_VERT,
    fragmentShader: GLITCH_PASS_FRAG,
  });
  pass.enabled = false;
  return pass;
}

export function setGlitchSize(pass: ShaderPass, width: number, height: number): void {
  (pass.uniforms.uResolution.value as THREE.Vector2).set(Math.max(1, width), Math.max(1, height));
}

/** Call every frame. `amount` 0..1; drive it from a tween that decays in ~250 ms after a hit. */
export function setGlitch(pass: ShaderPass, amount: number, time: number): void {
  pass.uniforms.uAmount.value = amount;
  pass.uniforms.uTime.value = time;
  pass.enabled = amount > 0.01;
}
