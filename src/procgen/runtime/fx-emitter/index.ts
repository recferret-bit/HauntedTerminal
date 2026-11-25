import * as THREE from 'three';
import type { ComicFxLight, ComicMaterial } from '../../../shaders/comic-material.js';
import { fxEvaluate, fxLightState, fxSpawn, fxTotalMs, fxWordState } from '../../fx/simulate.js';
import type { FxLightState, FxPreset } from '../../fx/types.js';
import { DEFAULT_INK_WEIGHT } from '../build.js';
import { buildPools, hideAll, poseParticle } from './layers.js';
import { createParts, disposeParts } from './parts.js';
import { buildWord, poseWord } from './word.js';

export interface FxEmitterOptions {
  seed?: number;
  /** Ink shell thickness in world units. Default 0.028, the same line as every actor. 0 disables it. */
  inkWeight?: number;
  /** Replaces the preset's word for this one emission (`+16GB` -> `+64GB`, `-10HP`). */
  text?: string;
}

export interface FxEmitter {
  readonly preset: FxPreset;
  /**
   * Add this to the scene at the effect origin (an actor's `fx` socket, a door's `lock`).
   * Its children are authored in page space; the group mirrors x so +x lands on screen-right.
   */
  readonly group: THREE.Group;
  /** Every comic material in the effect. Feed them uFlash / uFlashPos like the rest of the scene. */
  readonly materials: ComicMaterial[];
  /** Elapsed time in ms. */
  readonly timeMs: number;
  /** True once particles and the word are gone (never for looping presets). */
  readonly done: boolean;
  /** Active stepped comic light emitted at `timeMs`, or null once the light turns off. */
  lightState(): FxLightState | null;
  update(dtMs: number): void;
  /** Jump to an absolute time (storybook scrubbing, tests). */
  seek(tMs: number): void;
  dispose(): void;
}

/**
 * Build the scene objects for one emission of `preset`. Node-safe: no DOM, no canvas, no WebGL
 * until it is rendered. A small mesh pool per layer (the comic vertex shader has no instancing
 * path), all sharing one geometry, one ink shell geometry and one material per alpha step.
 *
 *   const fx = createFxEmitter(FxCatalog.get('fx.sigkill'), { seed: pid });
 *   fx.group.position.copy(target); stage.add(fx.group);
 *   // every frame: fx.update(dtMs); if (fx.done) { stage.remove(fx.group); fx.dispose(); }
 */
export function createFxEmitter(preset: FxPreset, opts: FxEmitterOptions = {}): FxEmitter {
  const group = new THREE.Group();
  group.name = preset.id;
  const page = new THREE.Group();
  page.name = 'page';
  page.scale.x = -1; // page +x (screen-right) is world -x
  group.add(page);

  const inkWeight = opts.inkWeight ?? DEFAULT_INK_WEIGHT;
  const parts = createParts();
  const spawns = fxSpawn(preset, opts.seed ?? 1);
  const pools = buildPools(preset.layers, inkWeight, page, parts);
  const word = buildWord(preset, opts.text, inkWeight, page, parts);

  const total = preset.loop ? Infinity : fxTotalMs(preset);
  let timeMs = 0;

  const apply = (): void => {
    hideAll(pools);
    for (const p of fxEvaluate(preset, spawns, timeMs)) poseParticle(pools, p);
    if (word) poseWord(word, fxWordState(preset, timeMs, opts.text), preset.layers.length);
  };
  apply();

  return {
    preset,
    group,
    materials: parts.materials,
    get timeMs() {
      return timeMs;
    },
    get done() {
      return timeMs >= total;
    },
    lightState(): FxLightState | null {
      return fxLightState(preset, timeMs);
    },
    update(dtMs: number): void {
      timeMs += Math.max(0, dtMs);
      apply();
    },
    seek(tMs: number): void {
      timeMs = Math.max(0, tMs);
      apply();
    },
    dispose(): void {
      group.removeFromParent();
      disposeParts(parts);
    },
  };
}

const LIGHT_TMP = new THREE.Vector3();

function isVisibleInHierarchy(obj: THREE.Object3D): boolean {
  for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
    if (!cur.visible) return false;
  }
  return true;
}

/** Active world-space comic light of one mounted emitter, respecting full parent transforms, mirroring, and visibility. */
export function fxEmitterWorldLight(fx: FxEmitter, lightMul = 1): ComicFxLight | null {
  if (!(lightMul > 0) || !isVisibleInHierarchy(fx.group)) return null;
  const l = fx.lightState();
  if (!l) return null;
  fx.group.updateWorldMatrix(true, false);
  const m = fx.group.matrixWorld;
  const e = m.elements;
  const sy = Math.hypot(e[4]!, e[5]!, e[6]!) || 1;
  // Page +x is mirrored onto local -x of fx.group by the `page` child (`page.scale.x = -1`).
  LIGHT_TMP.set(-l.x, l.y, 0).applyMatrix4(m);
  const scalePower = sy < 1 ? 0.55 + 0.45 * sy : 1;
  const power = l.power * scalePower * lightMul;
  if (power <= 0.001) return null;
  return { x: LIGHT_TMP.x, y: LIGHT_TMP.y, radius: l.radius * sy, power, color: l.color };
}

export type FxLightEntry = FxEmitter | { fx: FxEmitter; lightMul?: number };

/** Collect the strongest active world-space FX lights (ranked by power * radius, newest-first tiebreak) up to `max`. */
export function collectTopFxLights(emitters: readonly FxLightEntry[], max = 4): ComicFxLight[] {
  const out: ComicFxLight[] = [];
  for (let i = emitters.length - 1; i >= 0; i--) {
    const item = emitters[i]!;
    const l = 'fx' in item ? fxEmitterWorldLight(item.fx, item.lightMul ?? 1) : fxEmitterWorldLight(item);
    if (l) out.push(l);
  }
  if (out.length <= max) return out;
  return out.sort((a, b) => b.power * b.radius - a.power * a.radius).slice(0, max);
}
