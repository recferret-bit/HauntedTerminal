import { hashSeed, makeRng } from '../core/rng.js';
import { FX_WORD_DEFAULT_OFFSET } from './lettering.js';
import type { FxKey, FxLayer, FxParticleState, FxPreset, FxWordState } from './types.js';

export const FX_DEFAULT_STEP_FPS = 12;
/** Depth between consecutive layers, toward the camera, so later layers draw on top. */
export const FX_LAYER_Z = 0.02;

const DEG = Math.PI / 180;

/** Everything random about one particle, fixed at spawn. */
export interface FxSpawn {
  layer: number;
  index: number;
  x0: number;
  y0: number;
  /** Radians, page space. */
  angle: number;
  vx: number;
  vy: number;
  delayMs: number;
  lifeMs: number;
  /** Radians. */
  rot0: number;
  /** Radians per second. */
  spin: number;
  size: number;
  z: number;
}

function lerp(range: readonly [number, number] | undefined, t: number, fallback: number): number {
  return range ? range[0] + (range[1] - range[0]) * t : fallback;
}

export function fxStepMs(preset: FxPreset): number {
  return 1000 / (preset.stepFps ?? FX_DEFAULT_STEP_FPS);
}

/** How long the emitter must live: the particles, or the word if it holds longer. */
export function fxTotalMs(preset: FxPreset): number {
  return Math.max(preset.durationMs, preset.onomatopoeia?.holdMs ?? 0);
}

/** The value of a stepped track at life fraction `u`: the last key at or before it. */
export function fxKeyValue(keys: readonly FxKey[] | undefined, u: number, fallback: number): number {
  if (!keys || keys.length === 0) return fallback;
  let value = 0;
  for (const [t, v] of keys) {
    if (t <= u + 1e-9) value = v;
    else break;
  }
  return value;
}

/** The name randomness is hashed from: stable across a preset rename. */
function fxSeedKey(preset: FxPreset): string {
  return preset.seedKey ?? preset.id;
}

function spawnLayer(preset: FxPreset, layer: FxLayer, li: number, seed: number): FxSpawn[] {
  const rng = makeRng(hashSeed(`${fxSeedKey(preset)}/${li}/${layer.name}`, seed));
  const out: FxSpawn[] = [];
  const fan = layer.emit === 'burst' || layer.emit === 'cone' || layer.emit === 'ring' || layer.emit === 'implode';
  const fallbackAngle: [number, number] = layer.emit === 'rain' ? [270, 270] : fan ? [0, 360] : [90, 90];
  const [a0, a1] = layer.angle ?? fallbackAngle;
  for (let i = 0; i < layer.count; i++) {
    // Fixed draw order: adding a field must append, never reorder, or every seed changes its look.
    const rAngle = rng.next(), rSpeed = rng.next(), rRadius = rng.next(), rX = rng.next(), rY = rng.next();
    const rLife = rng.next(), rDelay = rng.next(), rSpin = rng.next(), rRot = rng.next(), rSize = rng.next(), rZ = rng.next();

    // Fans are evenly spaced with a little jitter: a comic burst is a drawn star, not a random spray.
    const angle = fan
      ? (a0 + (a1 - a0) * ((i + 0.5 + (rAngle - 0.5) * 0.6) / layer.count)) * DEG
      : (a0 + (a1 - a0) * rAngle) * DEG;
    const speed = layer.emit === 'implode' ? 0 : lerp(layer.speed, rSpeed, 0);
    const radius = lerp(layer.spawn?.radius, rRadius, 0);
    let x0 = layer.origin?.[0] ?? 0;
    let y0 = layer.origin?.[1] ?? 0;
    if (fan) {
      x0 += Math.cos(angle) * radius;
      y0 += Math.sin(angle) * radius;
    } else {
      x0 += ((i + rX) / layer.count - 0.5) * (layer.spawn?.width ?? 0);
      y0 += layer.emit === 'rain' ? (layer.spawn?.height ?? 0) : (rY - 0.5) * (layer.spawn?.height ?? 0);
    }
    out.push({
      layer: li,
      index: i,
      x0,
      y0,
      angle,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      delayMs: lerp(layer.delayMs, rDelay, 0),
      lifeMs: lerp(layer.lifeMs, rLife, 0),
      rot0: lerp(layer.rotation, rRot, 0) * DEG,
      spin: lerp(layer.spin, rSpin, 0) * DEG,
      size: lerp(layer.size, rSize, 1),
      z: li * FX_LAYER_Z + (rZ - 0.5) * (layer.zSpread ?? 0),
    });
  }
  return out;
}

/** Roll every particle of the preset once. Pure: same preset and seed, same spawns. */
export function fxSpawn(preset: FxPreset, seed = 1): FxSpawn[] {
  return preset.layers.flatMap((layer, li) => spawnLayer(preset, layer, li, seed));
}

/**
 * Closed-form state of the spawned particles at `tMs`. Time is snapped down to the preset's step
 * (`stepFps`), which is what makes the motion read as drawn frames.
 * Only particles that are alive and visible are returned.
 */
export function fxEvaluate(preset: FxPreset, spawns: readonly FxSpawn[], tMs: number): FxParticleState[] {
  const step = fxStepMs(preset);
  let t = Math.max(0, tMs);
  if (preset.loop) t %= preset.durationMs;
  const tq = Math.floor(t / step + 1e-6) * step;
  const out: FxParticleState[] = [];
  for (const s of spawns) {
    const layer = preset.layers[s.layer]!;
    // Delays snap down to the step grid too: a particle is born on a drawn frame, and a delay shorter than one step means frame 1.
    const age = tq - Math.floor(s.delayMs / step + 1e-6) * step;
    if (age < 0 || age >= s.lifeMs || s.lifeMs <= 0) continue;
    const u = age / s.lifeMs;
    const scale = fxKeyValue(layer.scale, u, 1) * s.size;
    const alpha = fxKeyValue(layer.alpha, u, 1);
    if (scale <= 0 || alpha <= 0) continue;
    const sec = age / 1000;
    let x: number, y: number, dirX: number, dirY: number;
    if (layer.emit === 'implode') {
      // Pulled in, accelerating: slow start, snaps into the centre.
      const pull = 1 - u * u;
      const ox = layer.origin?.[0] ?? 0, oy = layer.origin?.[1] ?? 0;
      const a = s.angle + (layer.swirl ?? 0) * DEG * u;
      const r = Math.hypot(s.x0 - ox, s.y0 - oy) * pull;
      x = ox + Math.cos(a) * r;
      y = oy + Math.sin(a) * r;
      dirX = -Math.cos(a);
      dirY = -Math.sin(a);
    } else {
      const k = layer.drag ?? 0;
      const g = layer.gravity ?? 0;
      if (k > 1e-6) {
        const e = Math.exp(-k * sec);
        x = s.x0 + (s.vx * (1 - e)) / k;
        y = s.y0 + ((s.vy + g / k) * (1 - e)) / k - (g * sec) / k;
        dirX = s.vx * e;
        dirY = (s.vy + g / k) * e - g / k;
      } else {
        x = s.x0 + s.vx * sec;
        y = s.y0 + s.vy * sec - 0.5 * g * sec * sec;
        dirX = s.vx;
        dirY = s.vy - g * sec;
      }
      if (Math.hypot(dirX, dirY) < 1e-6) {
        dirX = Math.cos(s.angle);
        dirY = Math.sin(s.angle);
      }
    }
    const rot = layer.align ? Math.atan2(dirY, dirX) : s.rot0 + s.spin * sec;
    out.push({ layer: s.layer, index: s.index, x, y, z: s.z, rot, scale, alpha, life: u });
  }
  return out;
}

/** Pure and deterministic: the visible particles of `preset` at `tMs` for `seed`. */
export function fxSimulate(preset: FxPreset, seed: number, tMs: number): FxParticleState[] {
  return fxEvaluate(preset, fxSpawn(preset, seed), tMs);
}

/**
 * Where the onomatopoeia is at `tMs`, or null when it is off the page.
 * Words pop on at full size on the first frame, hold, and cut off. They never fade.
 */
export function fxWordState(preset: FxPreset, tMs: number, text?: string): FxWordState | null {
  const word = preset.onomatopoeia;
  if (!word) return null;
  let t = Math.max(0, tMs);
  if (preset.loop) t %= preset.durationMs;
  if (t >= word.holdMs) return null;
  const step = fxStepMs(preset);
  const n = Math.floor(t / step + 1e-6);
  const [ox, oy] = word.offset ?? FX_WORD_DEFAULT_OFFSET;
  const state: FxWordState = { text: text ?? word.text, x: ox, y: oy, rot: 0, scale: 1, alpha: 1 };
  switch (word.style) {
    case 'burst':
      state.scale = n === 0 ? 1.3 : n === 1 ? 0.92 : 1;
      state.rot = 6 * DEG;
      break;
    case 'jagged': {
      const h = hashSeed(fxSeedKey(preset), n);
      state.scale = n === 0 ? 1.25 : 1;
      state.x += ((h % 3) - 1) * 0.035;
      state.y += (((h >>> 4) % 3) - 1) * 0.035;
      state.rot = (n % 2 === 0 ? 4 : -4) * DEG;
      break;
    }
    case 'whisper':
      state.scale = 0.85;
      state.alpha = 0.6;
      state.y += 0.03 * n;
      break;
    case 'glitch':
      state.x += [0, 0.07, -0.05, 0, 0.03][n % 5]!;
      if (n % 4 === 2) return null;
      break;
  }
  return state;
}
