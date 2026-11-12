import * as THREE from 'three';
import type { ComicMaterial } from '../../../shaders/comic-material.js';
import { fxEvaluate, fxSpawn, fxTotalMs, fxWordState } from '../../fx/simulate.js';
import type { FxPreset } from '../../fx/types.js';
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
