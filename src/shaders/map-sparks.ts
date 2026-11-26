/**
 * WebGL GLSL shaders for fast yellow electricity sparks travelling along the Chapter Map's PCB wires.
 * Adapted from TerraAgent's `cableArcMaterial.ts` (vertex-jittered jagged arcs + sharp leading-edge
 * travelling spark packets + exact-cycle time wrapping so sparks never jump).
 */

/**
 * `uTime` wraps at this many seconds so hash inputs stay small for GPU float precision.
 * Every state's `speed * MAP_SPARK_TIME_WRAP_S / spacing` and jitter/sputter rates are exact integers,
 * so packets never jump at the wrap boundary.
 */
export const MAP_SPARK_TIME_WRAP_S = 120;

/** Exact integer cycle counts per wrap period across all spark states (verified by unit tests). */
export const MAP_SPARK_STATES = {
  standby: { code: 1, speed: 210, spacing: 84, sparkLen: 13, speed2: 0, spacing2: 1, sparkLen2: 0 },
  powered: { code: 2, speed: 280, spacing: 96, sparkLen: 15, speed2: 420, spacing2: 140, sparkLen2: 11 },
  active: { code: 3, speed: 360, spacing: 90, sparkLen: 16, speed2: 520, spacing2: 120, sparkLen2: 12 },
} as const;

const glslFloat = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n));

const ACT = MAP_SPARK_STATES.active;
const PWR = MAP_SPARK_STATES.powered;
const STB = MAP_SPARK_STATES.standby;

const SPARK_SHARED_GLSL = /* glsl */ `
float arcHash(float n) {
  return fract(sin(mod(n, 3571.0)) * 43758.5453123);
}

float arcPacket(float distPx, float speed, float spacing, float sparkLen, float seed, float time) {
  float head = fract((distPx - time * speed) / spacing + seed);
  float w = clamp(sparkLen / spacing, 0.05, 0.36);
  float tail = smoothstep(0.0, w * 0.68, head);
  float front = 1.0 - smoothstep(w * 0.88, w, head);
  return tail * front;
}

float sparkEnergy(float distPx, float lenPx, float state, float seed, float time) {
  float shortScale = lenPx < 64.0 ? 0.5 : 1.0;
  float lenScale = lenPx < 64.0 ? 0.56 : 1.0;
  if (state > 2.5) {
    float p1 = arcPacket(distPx, ${glslFloat(ACT.speed)}, ${glslFloat(ACT.spacing)} * shortScale, ${glslFloat(ACT.sparkLen)} * lenScale, seed, time);
    float p2 = arcPacket(distPx, ${glslFloat(ACT.speed2)}, ${glslFloat(ACT.spacing2)} * shortScale, ${glslFloat(ACT.sparkLen2)} * lenScale, fract(seed * 1.73 + 0.37), time);
    return clamp(p1 * 1.15 + p2 * 0.96, 0.0, 1.45);
  }
  if (state > 1.5) {
    float p1 = arcPacket(distPx, ${glslFloat(PWR.speed)}, ${glslFloat(PWR.spacing)} * shortScale, ${glslFloat(PWR.sparkLen)} * lenScale, seed, time);
    float p2 = arcPacket(distPx, ${glslFloat(PWR.speed2)}, ${glslFloat(PWR.spacing2)} * shortScale, ${glslFloat(PWR.sparkLen2)} * lenScale, fract(seed * 1.61 + 0.43), time);
    return clamp(p1 * 1.05 + p2 * 0.88, 0.0, 1.32);
  }
  return arcPacket(distPx, ${glslFloat(STB.speed)}, ${glslFloat(STB.spacing)} * shortScale, ${glslFloat(STB.sparkLen)} * lenScale, seed, time) * 0.95;
}

float sparkSputter(float state, float seed, float time) {
  if (state < 0.5) return 0.0;
  if (state < 1.5) {
    float h = arcHash(floor(time * 8.0) + seed * 71.0);
    return h < 0.06 ? 0.0 : mix(0.76, 1.0, smoothstep(0.06, 0.38, h));
  }
  return 1.0;
}
`;

const SPARK_VERT_MAIN = /* glsl */ `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
attribute vec2 aPos;
attribute vec2 aPerp;
attribute float aCross;
attribute vec4 aWire;
varying float vCross;
varying float vCrossPx;
varying float vDist;
varying float vLen;
varying float vSeed;
varying float vState;
varying float vSputter;
varying float vPin;
${SPARK_SHARED_GLSL}
void main() {
  float t = aWire.x;
  float lenPx = aWire.y;
  float seed = aWire.z;
  float state = aWire.w;
  float distPx = t * lenPx;
  float sputter = sparkSputter(state, seed, uTime);
  float on = step(0.5, state) * step(0.01, sputter);
  float pkt = sparkEnergy(distPx, lenPx, state, seed, uTime);
  float pktClamp = clamp(pkt, 0.0, 1.0);
  float padPx = max(0.5, min(6.0, lenPx * 0.14));
  float pin = smoothstep(0.0, padPx, distPx) * smoothstep(0.0, padPx, lenPx - distPx);
  float widthScale = state > 2.5 ? 1.1 : (state > 1.5 ? 1.0 : 0.88);
  float halfWidth = mix(3.6, 7.6, pktClamp) * widthScale;
  vec2 px = aPos + aPerp * (aCross * halfWidth);
  vec2 clip = (px / max(uResolution, vec2(1.0))) * 2.0 - 1.0;
  vCross = aCross;
  vCrossPx = aCross * halfWidth;
  vDist = distPx;
  vLen = lenPx;
  vSeed = seed;
  vState = state;
  vSputter = sputter;
  vPin = pin;
  gl_Position = on > 0.0 ? vec4(clip.x, -clip.y, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const SPARK_FRAG_MAIN = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float uTime;
varying float vCross;
varying float vCrossPx;
varying float vDist;
varying float vLen;
varying float vSeed;
varying float vState;
varying float vSputter;
varying float vPin;
${SPARK_SHARED_GLSL}
float boltNode(float seg, float frame, float seed) {
  float r = arcHash(seg * 12.9898 + frame * 78.233 + seed * 37.719);
  float alt = fract(seg * 0.5 + 0.25) < 0.5 ? 1.0 : -1.0;
  return alt * (0.48 + 0.52 * r);
}
float boltY(float seg, float jagStep, float frame, float seed, float lenPx, float amp) {
  float x = clamp(seg * jagStep, 0.0, lenPx);
  float padPx = max(0.5, min(6.0, lenPx * 0.14));
  float endPin = smoothstep(0.0, padPx, x) * smoothstep(0.0, padPx, lenPx - x);
  return boltNode(seg, frame, seed) * amp * endPin;
}
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h);
}
void main() {
  if (vState < 0.5 || vSputter <= 0.0) discard;
  float pkt = sparkEnergy(vDist, vLen, vState, vSeed, uTime);
  float pktClamp = clamp(pkt, 0.0, 1.0);
  float jagStep = vLen < 64.0 ? 3.2 : 3.8;
  float jagPos = vDist / jagStep;
  float seg = floor(jagPos);
  float f = fract(jagPos);
  float frame = floor(uTime * 24.0);
  float jagScale = vState > 2.5 ? 1.18 : (vState > 1.5 ? 1.0 : 0.82);
  float amp = (0.45 + 3.45 * pktClamp) * jagScale;
  float y0 = boltY(seg, jagStep, frame, vSeed, vLen, amp);
  float y1 = boltY(seg + 1.0, jagStep, frame, vSeed, vLen, amp);
  vec2 p = vec2(vDist, vCrossPx);
  vec2 a = vec2(seg * jagStep, y0);
  vec2 b = vec2((seg + 1.0) * jagStep, y1);
  float dPx = sdSeg(p, a, b);
  if (f < 0.5) {
    vec2 prev = vec2((seg - 1.0) * jagStep, boltY(seg - 1.0, jagStep, frame, vSeed, vLen, amp));
    dPx = min(dPx, sdSeg(p, prev, a));
  } else {
    vec2 next = vec2((seg + 2.0) * jagStep, boltY(seg + 2.0, jagStep, frame, vSeed, vLen, amp));
    dPx = min(dPx, sdSeg(p, b, next));
  }
  float crackle = arcHash(seg * 39.3467 + frame * 11.135 + vSeed * 53.171);
  float edgeFade = smoothstep(1.0, 0.78, abs(vCross));
  float core = exp(-dPx * dPx * 1.65);
  float halo = exp(-dPx * dPx * 0.28) * edgeFade;
  float wireLine = exp(-vCrossPx * vCrossPx * 1.4);
  float resting = vState > 2.5 ? 0.055 : (vState > 1.5 ? 0.022 : 0.0);
  float spark = pkt * (core * 1.85 + halo * 0.72) + resting * wireLine * vPin;
  float alpha = clamp(spark * vSputter * (0.86 + 0.14 * crackle), 0.0, 1.0);
  if (alpha < 0.02) discard;
  vec3 outerYellow = vec3(1.0, 0.72, 0.0);
  vec3 brightYellow = vec3(1.0, 0.94, 0.08);
  vec3 hotCore = vec3(1.0, 0.99, 0.78);
  vec3 col = mix(outerYellow, brightYellow, smoothstep(0.08, 0.48, halo * pkt + resting));
  col = mix(col, hotCore, smoothstep(0.36, 0.84, core * pkt));
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

export function buildMapSparkVertexShader(): string {
  return SPARK_VERT_MAIN;
}

export function buildMapSparkFragmentShader(): string {
  return SPARK_FRAG_MAIN;
}
