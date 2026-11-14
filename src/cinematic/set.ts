import * as THREE from 'three';
import { createComicMaterial, createVortexMaterial } from '../shaders/comic-material.js';
import type { Vec3 as TupleVec3 } from '../procgen/index.js';
import { hash, type Actor, type CinematicStage } from './stage.js';

interface PartBase {
  pos: TupleVec3;
  rot: TupleVec3;
  scale: TupleVec3;
}

function base(mesh: THREE.Mesh): PartBase {
  return mesh.userData.base as PartBase;
}

/** Set a part to its authored pose turned by `theta` about z through `pivot` (absolute, so it never drifts). */
function turnAbout(mesh: THREE.Mesh | undefined, pivot: [number, number], theta: number): void {
  if (!mesh) return;
  const b = base(mesh);
  const dx = b.pos[0] - pivot[0];
  const dy = b.pos[1] - pivot[1];
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  mesh.position.set(pivot[0] + dx * c - dy * s, pivot[1] + dx * s + dy * c, b.pos[2]);
  mesh.rotation.set(b.rot[0], b.rot[1], b.rot[2] + theta);
}

/** Every part of a model whose name equals `prefix` or starts with `prefix.` (`RoomBuilder` suffixes repeats). */
export function partsNamed(actor: Actor, prefix: string): THREE.Mesh[] {
  return [...actor.model.parts]
    .filter(([name]) => name === prefix || name.startsWith(`${prefix}.`))
    .map(([, m]) => m);
}

/**
 * Generic limb/part rig pose applied after the animator updates:
 * - `typing` (0..1): reaches `arm.l` / `hand.l` forward and taps on twos
 * - `restRightArm`: rests `arm.r` / `hand.r` at the actor's side
 * - `hideParts`: hides any model parts matching those prefixes
 */
export function applyActorRig(
  actor: Actor,
  t: number,
  typing: number,
  restRightArm: boolean,
  hideParts: readonly string[],
): void {
  for (const prefix of hideParts) {
    for (const mesh of partsNamed(actor, prefix)) mesh.visible = false;
  }
  const parts = actor.model.parts;
  if (typing > 0) {
    const beat = Math.floor(t * 9);
    const tap = hash(beat * 1.37) > 0.45 ? 0.08 : -0.03;
    const theta = (0.86 + tap) * typing;
    turnAbout(parts.get('arm.l'), [0.3, 1.04], theta);
    turnAbout(parts.get('hand.l'), [0.3, 1.04], theta);
  }
  if (restRightArm) {
    turnAbout(parts.get('arm.r'), [-0.28, 1.04], 0.92);
    turnAbout(parts.get('hand.r'), [-0.28, 1.04], 0.92);
  }
}

/** Rain streaks in a 2D world rectangle at depth `z`, stepped on twos so they read as drawn ink. */
export class Rain {
  readonly group = new THREE.Group();
  private readonly drops: THREE.Mesh[] = [];
  constructor(stage: CinematicStage, private readonly rect: { x: number; y: number; w: number; h: number }, z: number, count = 26) {
    const mat = stage.track(createComicMaterial(0x9bdcff, { emissive: 0.35 }));
    const geo = stage.own(new THREE.BoxGeometry(0.032, 0.24, 0.01));
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.z = -0.28;
      m.position.z = z;
      this.drops.push(m);
      this.group.add(m);
    }
    this.group.visible = false;
    stage.scene.add(this.group);
  }

  update(t: number): void {
    const ts = Math.floor(t * 12) / 12;
    const { x, y, w, h } = this.rect;
    this.drops.forEach((m, i) => {
      const fall = (ts * 3.4 + hash(i * 3.1 + 0.7) * h) % Math.max(0.2, h - 0.3);
      const px = x - w / 2 + 0.1 + hash(i * 7.7) * Math.max(0.1, w - 0.2) + fall * 0.28;
      m.position.x = Math.min(x + w / 2 - 0.05, px);
      m.position.y = y + h / 2 - 0.35 - fall;
    });
  }
}

/** Shader vortex filling a `(w, h)` plane at `at`. */
export function makeVortex(stage: CinematicStage, at: THREE.Vector3, w: number, h: number): THREE.Mesh {
  const mat = stage.track(createVortexMaterial());
  const geo = stage.own(new THREE.SphereGeometry(0.5, 28, 18));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(at);
  mesh.scale.set(w, h, 0.08);
  mesh.visible = false;
  stage.scene.add(mesh);
  return mesh;
}

/** Additive jagged lightning bolt geometry between `from` and `to`. */
export function makeBolt(stage: CinematicStage, from: THREE.Vector3, to: THREE.Vector3): THREE.Mesh {
  const geo = stage.lightning.buildJaggedBoltGeometry(from, to, 5, 0.035, true) ?? new THREE.BufferGeometry();
  stage.own(geo);
  const mat = stage.own(new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.45 * 5.5, 0.88 * 5.5, 1.0 * 6.0),
    toneMapped: false,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 3;
  mesh.visible = false;
  stage.scene.add(mesh);
  return mesh;
}

export function v3(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z);
}

const lerpN = (a: number, b: number, k: number): number => a + (b - a) * k;

/** Drawn comic zig-zag ribbon bolt with ink keyline, cyan glow, and paper core. */
export function makeComicBolt(stage: CinematicStage, from: THREE.Vector3, to: THREE.Vector3, seed: number): THREE.Group {
  const group = new THREE.Group();
  const steps = 7;
  const centre: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const side = i === 0 || i === steps ? 0 : (i % 2 ? 1 : -1) * (0.08 + hash(seed + i * 3.7) * 0.08);
    centre.push(new THREE.Vector2(lerpN(from.x, to.x, k) + side, lerpN(from.y, to.y, k)));
  }
  const ribbon = (width: number, tip: number): THREE.ShapeGeometry => {
    const left: THREE.Vector2[] = [];
    const right: THREE.Vector2[] = [];
    centre.forEach((p, i) => {
      const a = centre[Math.max(0, i - 1)]!;
      const b = centre[Math.min(steps, i + 1)]!;
      const d = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
      const w = lerpN(width, tip, i / steps) / 2;
      left.push(new THREE.Vector2(p.x - d.y * w, p.y + d.x * w));
      right.push(new THREE.Vector2(p.x + d.y * w, p.y - d.x * w));
    });
    return stage.own(new THREE.ShapeGeometry(new THREE.Shape([...left, ...right.reverse()])));
  };
  const ink = new THREE.Mesh(ribbon(0.36, 0.08), stage.own(new THREE.MeshBasicMaterial({ color: 0x110e1b, side: THREE.DoubleSide })));
  const glow = new THREE.Mesh(ribbon(0.26, 0.04), stage.track(createComicMaterial(0x4cc9f0, { emissive: 1.6 })));
  const core = new THREE.Mesh(ribbon(0.1, 0.015), stage.track(createComicMaterial(0xf4f1ea, { emissive: 1.2 })));
  for (const [mesh, dz] of [[ink, 0.02], [glow, 0], [core, -0.02]] as const) {
    mesh.position.z = from.z + dz;
    (mesh.material as THREE.Material).side = THREE.DoubleSide;
    mesh.renderOrder = 5;
    group.add(mesh);
  }
  group.visible = false;
  stage.scene.add(group);
  return group;
}
