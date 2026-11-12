import * as THREE from 'three';

/**
 * Cel comic fill. Lighting is the uniform light direction plus the lightning
 * flash point, so the look does not depend on Three.js light nodes.
 * Local meshes are built facing −z (toward a camera that sits on −z).
 */
export const COMIC_VERT = /* glsl */ `
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
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;

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
    },
    vertexShader: COMIC_VERT,
    fragmentShader: COMIC_FRAG,
    transparent: (opts.opacity ?? 1) < 0.999 || !!opts.ghost,
    depthWrite: !opts.ghost && (opts.opacity ?? 1) > 0.9,
  });
  mat.userData.comic = true;
  return mat;
}

export const VORTEX_FRAG = /* glsl */ `
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

export const FLOOD_FRAG = /* glsl */ `
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
