/**
 * The game's lightning lives in src/shaders/lightning.ts. This file is NOT a copy of it: it shows
 * how the real class is driven (exactly what ComicStage does), and adds one recipe, a seeded
 * comic bolt outline, for drawing lightning as an ink-edged shape instead of a glowing tube.
 * Numbers and behaviour: ../references/lighting-model.md
 */
import * as THREE from 'three';
import { LightningStrikeSystem } from '../../../../src/shaders/lightning.js';
import { isComic, type ComicMaterial } from '../../../../src/shaders/comic-material.js';
import { makeRng, type ShapeSpec, type Vec2 } from '../../../../src/procgen/index.js';

/** Collect the materials that must receive the flash. ComicStage.buildScene does this for `world`. */
export function collectComicMaterials(root: THREE.Object3D): ComicMaterial[] {
  const out: ComicMaterial[] = [];
  root.traverse((obj) => {
    const mat = (obj as THREE.Mesh).material;
    if (mat && !Array.isArray(mat) && isComic(mat)) out.push(mat);
  });
  return out;
}

/**
 * One frame of the lightning loop, as in ComicStage.frame(): age the bolts, then push the flash
 * point and strength into every comic material. `dt` is in seconds.
 */
export function stepLightning(lightning: LightningStrikeSystem, comics: ComicMaterial[], dt: number): void {
  lightning.update(dt); // flashStrength decays by 14 per second
  for (const mat of comics) {
    mat.uniforms.uFlash!.value = lightning.flashStrength;
    (mat.uniforms.uFlashPos!.value as THREE.Vector3).copy(lightning.flashPos);
  }
}

/** The three ways the game strikes today. */
export function lightningCalls(scene: THREE.Scene): LightningStrikeSystem {
  const lightning = new LightningStrikeSystem(scene);
  // Intro: a 5.4-unit bolt onto the desk. Sets flashStrength = 5.5 at the target.
  lightning.strikeAt(new THREE.Vector3(0.1, 0.02, 0.7), 5.4);
  // Storm: a stub of a bolt high on the screen-right side; what the player sees is the flash.
  const intensity = 0.65;
  lightning.strikeAt(new THREE.Vector3(-2.4, 4.2, 1.2), 0.35 * intensity);
  // SIGTERM trapped: a short arc across the boss. Flash at least 2.2 at its midpoint.
  lightning.spawnGridOverloadArc(new THREE.Vector3(-0.2, 1.5, 0), new THREE.Vector3(0.35, 0.4, 0.1));
  return lightning;
}

/**
 * Recipe: a jagged bolt as a page-plane outline, top at y = height / 2, tip at -height / 2.
 * Seeded midpoint displacement in x only (z is invisible to the front camera), then given width
 * that tapers to the tip. Feed it to an FxLayer (`shape`) or to shapeToGeometry + inkShellGeometry.
 * Hold it 2 to 3 frames at 12 fps; do not fade it.
 */
export function comicBoltOutline(seed: number, height = 4, width = 0.5, generations = 3): ShapeSpec {
  const rng = makeRng(seed);
  let spine: Vec2[] = [[0, height / 2], [0, -height / 2]];
  let sway = height * 0.16; // the same 16% the game's bolt starts with
  for (let g = 0; g < generations; g++) {
    const next: Vec2[] = [spine[0]!];
    for (let i = 1; i < spine.length; i++) {
      const a = spine[i - 1]!, b = spine[i]!;
      next.push([(a[0] + b[0]) / 2 + rng.range(-0.5, 0.5) * sway, (a[1] + b[1]) / 2], b);
    }
    spine = next;
    sway *= 0.52;
  }
  const left: Vec2[] = [], right: Vec2[] = [];
  spine.forEach(([x, y], i) => {
    const taper = 1 - i / (spine.length - 1);          // full width at the top, a point at the tip
    const half = (width / 2) * (0.15 + 0.85 * taper);
    // Alternate the kink so the edges zigzag like a drawn bolt instead of following the spine evenly.
    const kink = (i % 2 === 0 ? 1 : -1) * half * 0.5;
    left.push([x - half + kink, y]);
    right.push([x + half + kink, y]);
  });
  return { kind: 'extrude', outline: [...left, ...right.reverse()], depth: 0.05 };
}
