import * as THREE from 'three';

/**
 * Cel comic fill. Lighting is the uniform light direction plus the lightning
 * flash point, so the look does not depend on Three.js light nodes.
 * Local meshes are built facing −z (toward a camera that sits on −z).
 */
const COMIC_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

export const COMIC_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uInk;
uniform vec3 uLightDir;
uniform vec3 uFlashPos;
uniform float uEmissive;
uniform float uOpacity;
uniform float uGhost;
uniform float uStripes;
uniform float uHalftone;
uniform float uFlash;
uniform float uHasMap;
uniform sampler2D uMap;
uniform float uTime;
// Scene light (shared by every comic material, see COMIC_LIGHT). All zero = the flat look.
uniform vec3 uLampPos;
uniform vec3 uLampColor;
uniform vec3 uLampColor2;
uniform float uLampSplit;
uniform float uLampPower;
uniform float uLampRadius;
uniform float uLampDark;
uniform float uLampScan;
uniform float uLampUv;
uniform float uPingR;
uniform float uPingPower;
uniform float uUvReact;
// Dynamic comic FX lights (shared by every comic material, see COMIC_FX_LIGHTS). w = power (0 = off).
uniform vec4 uFxPos0;
uniform vec3 uFxCol0;
uniform vec4 uFxPos1;
uniform vec3 uFxCol1;
uniform vec4 uFxPos2;
uniform vec3 uFxCol2;
uniform vec4 uFxPos3;
uniform vec3 uFxCol3;
uniform vec4 uFxPos4;
uniform vec3 uFxCol4;
uniform vec4 uFxPos5;
uniform vec3 uFxCol5;
uniform vec4 uFxPos6;
uniform vec3 uFxCol6;
uniform vec4 uFxPos7;
uniform vec3 uFxCol7;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;

vec3 comicFxLight(vec4 lp, vec3 lc, vec3 baseCol, vec3 n, float dth, float darkBoost) {
  if (lp.w <= 0.001) return vec3(0.0);
  vec2 toFx = lp.xy - vWorld.xy;
  float dist = length(toFx);
  float fall = 1.0 - dist / max(lp.z, 0.001) + dth;
  float ring = fall > 0.64 ? 1.0 : fall > 0.34 ? 0.56 : fall > 0.0 ? 0.24 : 0.0;
  if (ring <= 0.0) return vec3(0.0);
  vec3 fxDir = normalize(vec3(toFx, -0.65));
  float facing = dot(n, fxDir) > 0.2 ? 1.0 : 0.62;
  float lit = min(ring * facing * lp.w, 1.25);
  return baseCol * lc * lit * darkBoost + lc * lit * (0.06 + 0.08 * darkBoost);
}

void main() {
  vec3 n = normalize(vNormal);
  float ndl = dot(n, normalize(uLightDir));
  float shade = ndl * 0.5 + 0.5;
  float band = shade > 0.66 ? 1.0 : shade > 0.4 ? 0.68 : 0.4;
  vec3 col = uColor * band;
  if (uHasMap > 0.5) {
    vec3 albedo = texture2D(uMap, vUv).rgb;
    col = mix(col, albedo * band, 0.86);
  }
  if (uStripes > 0.5) {
    float stripe = step(0.5, fract(vUv.y * 7.0));
    col *= mix(0.7, 1.0, stripe);
  }
  if (uHalftone > 0.5 && band < 0.95) {
    vec2 cell = fract(vWorld.xz * 16.0) - 0.5;
    float dotMask = step(length(cell), 0.16);
    col *= mix(1.0, 0.78, dotMask);
  }
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 2.6);
  col = mix(col, uInk, smoothstep(0.55, 0.92, fres) * 0.55);
  vec3 baseCol = col;
  if (uLampDark > 0.001 || uLampPower > 0.001 || uPingPower > 0.001) {
    // A comic light on the page plane: distance is measured in xy, so it reads as a drawn pool of light.
    vec2 toLamp = uLampPos.xy - vWorld.xy;
    float dist = length(toLamp);
    // Ordered 2x2 screen dither breaks the ring edges into Ben-Day dots instead of a gradient.
    vec2 cellId = floor(gl_FragCoord.xy / 3.0);
    float dth = (mod(cellId.x + cellId.y * 2.0, 4.0) / 4.0 - 0.375) * 0.16;
    float fall = 1.0 - dist / max(uLampRadius, 0.001) + dth;
    float ring = fall > 0.62 ? 1.0 : fall > 0.34 ? 0.62 : fall > 0.0 ? 0.3 : 0.0;
    // Surfaces turned toward the lamp catch more of it (two steps, no gradient).
    vec3 lampDir = normalize(vec3(toLamp, -0.7));
    float facing = dot(n, lampDir) > 0.25 ? 1.0 : 0.6;
    float scan = 1.0 - uLampScan * 0.35 * step(0.5, fract(vWorld.y * 5.0 - uTime * 0.7));
    float lit = min(ring * facing * uLampPower * scan, 1.25);
    vec3 lampCol = mix(uLampColor, uLampColor2, uLampSplit * step(0.0, -toLamp.x));
    // Darkness first (cool, so the warm pool pops), then the pool of light.
    vec3 dark = col * mix(vec3(1.0), vec3(0.34, 0.36, 0.52), uLampDark);
    col = dark + col * lampCol * lit * 0.8 + lampCol * lit * 0.05;
    // Blacklight: corruption fluoresces where the lamp reaches it.
    col += uColor * uUvReact * uLampUv * lit * 1.4;
    // The ls ping: an expanding ring that sweeps the room and briefly lights what it passes.
    float band = abs(dist - uPingR);
    float pingEdge = step(band, 0.09) + 0.45 * step(band, 0.3) * step(dist, uPingR);
    col += lampCol * pingEdge * uPingPower * (0.55 + 0.45 * facing);
  }
  if (
    uFxPos0.w > 0.001 || uFxPos1.w > 0.001 || uFxPos2.w > 0.001 || uFxPos3.w > 0.001
    || uFxPos4.w > 0.001 || uFxPos5.w > 0.001 || uFxPos6.w > 0.001 || uFxPos7.w > 0.001
  ) {
    vec2 fxCell = floor(gl_FragCoord.xy / 3.0);
    float fxDth = (mod(fxCell.x + fxCell.y * 2.0, 4.0) / 4.0 - 0.375) * 0.16;
    float darkBoost = mix(0.32, 0.85, clamp(uLampDark, 0.0, 1.0));
    vec3 fxAdd = comicFxLight(uFxPos0, uFxCol0, baseCol, n, fxDth, darkBoost)
      + comicFxLight(uFxPos1, uFxCol1, baseCol, n, fxDth, darkBoost)
      + comicFxLight(uFxPos2, uFxCol2, baseCol, n, fxDth, darkBoost)
      + comicFxLight(uFxPos3, uFxCol3, baseCol, n, fxDth, darkBoost)
      + comicFxLight(uFxPos4, uFxCol4, baseCol, n, fxDth, darkBoost)
      + comicFxLight(uFxPos5, uFxCol5, baseCol, n, fxDth, darkBoost)
      + comicFxLight(uFxPos6, uFxCol6, baseCol, n, fxDth, darkBoost)
      + comicFxLight(uFxPos7, uFxCol7, baseCol, n, fxDth, darkBoost);
    // Hue-preserving soft knee prevents multi-FX whiteout and keeps self-emissive FX geometry crisp.
    float fxPeak = max(max(fxAdd.r, fxAdd.g), fxAdd.b);
    float fxCap = mix(0.72, 1.12, clamp(uLampDark, 0.0, 1.0));
    if (fxPeak > 0.001) fxAdd *= fxCap / (fxCap + fxPeak);
    col += fxAdd * (1.0 - min(uEmissive, 0.78));
  }
  col += uColor * uEmissive;
  vec3 toFlash = uFlashPos - vWorld;
  float att = uFlash / (1.0 + dot(toFlash, toFlash) * 0.45);
  col += vec3(0.55, 0.86, 1.0) * att;
  if (uGhost > 0.5) {
    float alpha = clamp(uOpacity * (0.12 + fres * 1.15), 0.0, 0.92);
    gl_FragColor = vec4(col + vec3(0.25, 0.08, 0.35) * fres, alpha);
    return;
  }
  gl_FragColor = vec4(col, uOpacity);
}`;

export type ComicMaterial = THREE.ShaderMaterial;

export interface ComicOptions {
  emissive?: number;
  opacity?: number;
  ghost?: boolean;
  stripes?: boolean;
  halftone?: boolean;
  /** 1 = fluoresces under the blacklight lamp (malware zones). */
  uvReact?: number;
}

const LIGHT = new THREE.Vector3(-0.35, 0.82, -0.48).normalize();

/**
 * The scene light, shared by reference by EVERY comic material: set a value once and the whole world
 * follows. All zeros (the default) leaves the classic flat cel look, which is what the storybook, the
 * cinematics and the software preview (src/procgen/core/raster.ts) show. The game's stage drives it
 * (src/renderer/stage-light.ts).
 */
/** While > 0 the scene light is held off (cinematics draw with the flat look on the same page). */
let lightSuspended = 0;
export function suspendComicLight(on: boolean): void {
  lightSuspended = Math.max(0, lightSuspended + (on ? 1 : -1));
}
export function comicLightSuspended(): boolean {
  return lightSuspended > 0;
}

export const COMIC_LIGHT = {
  uLampPos: { value: new THREE.Vector3() },
  uLampColor: { value: new THREE.Color(1, 0.82, 0.45) },
  uLampColor2: { value: new THREE.Color(1, 0.2, 0.7) },
  uLampSplit: { value: 0 },
  uLampPower: { value: 0 },
  uLampRadius: { value: 3 },
  uLampDark: { value: 0 },
  uLampScan: { value: 0 },
  uLampUv: { value: 0 },
  uPingR: { value: 0 },
  uPingPower: { value: 0 },
};

/** One live FX light source in world xy. */
export interface ComicFxLight {
  x: number;
  y: number;
  radius: number;
  power: number;
  color: number;
}

export const MAX_COMIC_FX_LIGHTS = 8;

export const COMIC_FX_LIGHTS = {
  uFxPos0: { value: new THREE.Vector4(0, 0, 1, 0) },
  uFxCol0: { value: new THREE.Color(1, 1, 1) },
  uFxPos1: { value: new THREE.Vector4(0, 0, 1, 0) },
  uFxCol1: { value: new THREE.Color(1, 1, 1) },
  uFxPos2: { value: new THREE.Vector4(0, 0, 1, 0) },
  uFxCol2: { value: new THREE.Color(1, 1, 1) },
  uFxPos3: { value: new THREE.Vector4(0, 0, 1, 0) },
  uFxCol3: { value: new THREE.Color(1, 1, 1) },
  uFxPos4: { value: new THREE.Vector4(0, 0, 1, 0) },
  uFxCol4: { value: new THREE.Color(1, 1, 1) },
  uFxPos5: { value: new THREE.Vector4(0, 0, 1, 0) },
  uFxCol5: { value: new THREE.Color(1, 1, 1) },
  uFxPos6: { value: new THREE.Vector4(0, 0, 1, 0) },
  uFxCol6: { value: new THREE.Color(1, 1, 1) },
  uFxPos7: { value: new THREE.Vector4(0, 0, 1, 0) },
  uFxCol7: { value: new THREE.Color(1, 1, 1) },
};

const FX_LIGHT_SLOTS: ReadonlyArray<{ pos: { value: THREE.Vector4 }; col: { value: THREE.Color } }> = [
  { pos: COMIC_FX_LIGHTS.uFxPos0, col: COMIC_FX_LIGHTS.uFxCol0 },
  { pos: COMIC_FX_LIGHTS.uFxPos1, col: COMIC_FX_LIGHTS.uFxCol1 },
  { pos: COMIC_FX_LIGHTS.uFxPos2, col: COMIC_FX_LIGHTS.uFxCol2 },
  { pos: COMIC_FX_LIGHTS.uFxPos3, col: COMIC_FX_LIGHTS.uFxCol3 },
  { pos: COMIC_FX_LIGHTS.uFxPos4, col: COMIC_FX_LIGHTS.uFxCol4 },
  { pos: COMIC_FX_LIGHTS.uFxPos5, col: COMIC_FX_LIGHTS.uFxCol5 },
  { pos: COMIC_FX_LIGHTS.uFxPos6, col: COMIC_FX_LIGHTS.uFxCol6 },
  { pos: COMIC_FX_LIGHTS.uFxPos7, col: COMIC_FX_LIGHTS.uFxCol7 },
];

/** Push up to 8 active FX lights into the shared comic shader uniforms (unused slots zeroed). */
export function setComicFxLights(lights: readonly ComicFxLight[]): void {
  for (let i = 0; i < FX_LIGHT_SLOTS.length; i++) {
    const slot = FX_LIGHT_SLOTS[i]!;
    const l = lights[i];
    if (l && l.power > 0.001 && l.radius > 0.001) {
      slot.pos.value.set(l.x, l.y, l.radius, l.power);
      slot.col.value.setHex(l.color);
    } else {
      slot.pos.value.set(0, 0, 1, 0);
    }
  }
}

export function clearComicFxLights(): void {
  setComicFxLights([]);
}

/** Merge multiple FX light lists and keep the strongest `max` (by power * radius). */
export function mergeComicFxLights(
  sources: readonly (readonly ComicFxLight[])[],
  max = MAX_COMIC_FX_LIGHTS,
): ComicFxLight[] {
  const out: ComicFxLight[] = [];
  for (const list of sources) {
    for (const l of list) {
      if (l.power > 0.001 && l.radius > 0.001) out.push(l);
    }
  }
  if (out.length <= max) return out;
  return out.sort((a, b) => b.power * b.radius - a.power * a.radius).slice(0, max);
}

export function createComicMaterial(color: number, opts: ComicOptions = {}): ComicMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uInk: { value: new THREE.Color(0x110e1b) },
      uLightDir: { value: LIGHT.clone() },
      uFlashPos: { value: new THREE.Vector3() },
      uEmissive: { value: opts.emissive ?? 0 },
      uOpacity: { value: opts.opacity ?? 1 },
      uGhost: { value: opts.ghost ? 1 : 0 },
      uStripes: { value: opts.stripes ? 1 : 0 },
      uHalftone: { value: opts.halftone ? 1 : 0 },
      uFlash: { value: 0 },
      uHasMap: { value: 0 },
      uMap: { value: null },
      uTime: { value: 0 },
      uUvReact: { value: opts.uvReact ?? 0 },
      ...COMIC_LIGHT,
      ...COMIC_FX_LIGHTS,
    },
    vertexShader: COMIC_VERT,
    fragmentShader: COMIC_FRAG,
    transparent: (opts.opacity ?? 1) < 0.999 || !!opts.ghost,
    depthWrite: !opts.ghost && (opts.opacity ?? 1) > 0.9,
  });
  mat.userData.comic = true;
  return mat;
}

const VORTEX_FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNormal);
  vec3 view = normalize(cameraPosition - vWorld);
  vec3 axis = view;
  vec3 helper = abs(axis.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 right = normalize(cross(helper, axis));
  vec3 camUp = cross(axis, right);
  float x = dot(n, right);
  float y = dot(n, camUp);
  float r = length(vec2(x, y));
  float ang = atan(y, x);
  float arm = sin(ang * 6.0 - uTime * 3.2 + r * 24.0);
  float ring = smoothstep(0.04, 0.62, r) * (0.4 + 0.6 * arm);
  vec3 col = mix(vec3(0.02, 0.0, 0.05), vec3(0.62, 0.14, 0.95), clamp(ring, 0.0, 1.0));
  col = mix(col, vec3(0.0), smoothstep(0.34, 0.06, r));
  float rim = pow(1.0 - max(dot(n, view), 0.0), 2.2);
  col += vec3(0.5, 0.12, 0.85) * rim;
  gl_FragColor = vec4(col, 1.0);
}`;

export function createVortexMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: VORTEX_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

const FLOOD_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
void main() {
  float band = 0.65 + 0.35 * sin(vUv.y * 28.0 + uTime * 2.4);
  float scan = 0.85 + 0.15 * sin(vUv.x * 40.0 - uTime * 3.0);
  vec3 col = vec3(0.15, 0.75, 0.95) * band * scan;
  gl_FragColor = vec4(col, 0.38);
}`;

export function createFloodMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: FLOOD_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function isComic(mat: THREE.Material): mat is ComicMaterial {
  return mat.userData?.comic === true;
}
