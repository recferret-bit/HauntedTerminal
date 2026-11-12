import * as THREE from 'three';

/** Uniforms every full-screen post pass starts with: the input texture and the (clamped) pixel size of the target. */
export function postBaseUniforms(width: number, height: number): {
  tDiffuse: { value: THREE.Texture | null };
  uResolution: { value: THREE.Vector2 };
} {
  return {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(Math.max(1, width), Math.max(1, height)) },
  };
}
