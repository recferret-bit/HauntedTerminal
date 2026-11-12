import * as THREE from 'three';
import { LANTERN_RADIUS } from './stage-constants.js';

const DARK_VERT = /* glsl */ `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Multiplies the frame: full light inside the cone, one mid ring, then dark. Hard steps, like the cel bands. */
const DARK_FRAG = /* glsl */ `
uniform vec2 uCenter;
uniform float uRadius;
varying vec2 vPos;
void main() {
  float d = distance(vPos, uCenter) / uRadius;
  // Linear-space factors. The pixel-art pass re-maps luma onto a 4-stop ramp whose dark end is steep,
  // so anything gentler than this still comes out the other side as a mid tone.
  vec3 dark = vec3(0.05, 0.05, 0.08);
  vec3 mid = vec3(0.34, 0.32, 0.36);
  vec3 lit = vec3(1.0, 0.97, 0.9);
  vec3 k = d < 0.62 ? lit : d < 1.0 ? mid : dark;
  gl_FragColor = vec4(k, 1.0);
}`;

/** Order after everything else, so the multiply covers the whole frame. */
const DARK_RENDER_ORDER = 10;
/** Light sources are drawn over the dark layer. */
const GLOW_RENDER_ORDER = 20;

interface Lifted {
  mesh: THREE.Mesh;
  transparent: boolean;
}

/** Lantern-dark: a multiply layer in front of everything, then the light sources drawn over it. */
export class LanternLayer {
  private readonly material = new THREE.ShaderMaterial({
    uniforms: { uCenter: { value: new THREE.Vector2() }, uRadius: { value: LANTERN_RADIUS } },
    vertexShader: DARK_VERT,
    fragmentShader: DARK_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor,
    blendDst: THREE.ZeroFactor,
  });
  private readonly mesh = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), this.material);
  private lifted: Lifted[] = [];

  /** The layer rides on the camera, 1 unit in front of it. */
  constructor(camera: THREE.Camera) {
    this.mesh.position.z = -1;
    this.mesh.renderOrder = DARK_RENDER_ORDER;
    this.mesh.visible = false;
    camera.add(this.mesh);
  }

  off(): void {
    this.mesh.visible = false;
  }

  /** Dark everywhere except a cone centred on `centerInCamera`; the `glow` meshes are lifted above the dark layer. */
  on(centerInCamera: THREE.Vector3, glow: readonly THREE.Mesh[]): void {
    this.mesh.visible = true;
    (this.material.uniforms.uCenter!.value as THREE.Vector2).set(centerInCamera.x, centerInCamera.y);
    for (const mesh of glow) {
      const mat = mesh.material as THREE.Material;
      this.lifted.push({ mesh, transparent: mat.transparent });
      mat.transparent = true;
      mesh.renderOrder = GLOW_RENDER_ORDER;
    }
  }

  /** Undo the glow lift after the frame is drawn. */
  restore(): void {
    for (const l of this.lifted) {
      (l.mesh.material as THREE.Material).transparent = l.transparent;
      l.mesh.renderOrder = 0;
    }
    this.lifted = [];
  }
}
