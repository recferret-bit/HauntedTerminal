import * as THREE from 'three';
import { createComicMaterial, createVortexMaterial } from '../shaders/comic-material.js';
import type { Vec3 } from '../procgen/index.js';
import { hash, type Actor, type CinematicStage } from './stage.js';

/** Hero parts that belong to the lantern (hidden at the desk: the lantern is a thing of the machine). */
const LANTERN = /^lantern\./;

interface PartBase {
  pos: Vec3;
  rot: Vec3;
  scale: Vec3;
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
  const c = Math.cos(theta), s = Math.sin(theta);
  mesh.position.set(pivot[0] + dx * c - dy * s, pivot[1] + dx * s + dy * c, b.pos[2]);
  mesh.rotation.set(b.rot[0], b.rot[1], b.rot[2] + theta);
}

/**
 * The developer seated at the desk. Call after the animator has updated (it rewrites part transforms).
 * `typing` 0..1 reaches the screen-left arm to the keyboard and taps it; `lantern` shows the lantern arm
 * as authored, otherwise that arm hangs by his side.
 */
export function poseSeated(hero: Actor, t: number, typing: number, lantern: boolean): void {
  const parts = hero.model.parts;
  for (const [name, mesh] of parts) if (LANTERN.test(name)) mesh.visible = lantern;
  if (typing > 0) {
    // Taps on twos: a new key every 1/9 s, pseudo-random depth.
    const beat = Math.floor(t * 9);
    const tap = hash(beat * 1.37) > 0.45 ? 0.08 : -0.03;
    const theta = (0.86 + tap) * typing + 0.0 * (1 - typing);
    turnAbout(parts.get('arm.l'), [0.3, 1.04], theta);
    turnAbout(parts.get('hand.l'), [0.3, 1.04], theta);
  }
  if (!lantern) {
    turnAbout(parts.get('arm.r'), [-0.28, 1.04], 0.92);
    turnAbout(parts.get('hand.r'), [-0.28, 1.04], 0.92);
  }
}

/** Rain behind the window glass: thin slanted streaks, moving on twos so it reads as drawn. */
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
    stage.scene.add(this.group);
  }

  update(t: number): void {
    const ts = Math.floor(t * 12) / 12;
    const { x, y, w, h } = this.rect;
    this.drops.forEach((m, i) => {
      const fall = (ts * 3.4 + hash(i * 3.1 + 0.7) * h) % (h - 0.3);
      const px = x - w / 2 + 0.1 + hash(i * 7.7) * (w - 0.2) + fall * 0.28;
      m.position.x = Math.min(x + w / 2 - 0.05, px);
      m.position.y = y + h / 2 - 0.35 - fall;
    });
  }
}

/** A purple shader vortex filling a rectangle (the monitor's broken screen). */
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

/** A jagged reverse bolt (outro): built once, flickers by time. */
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

/** Every part of a model whose name starts with `prefix` (RoomBuilder suffixes repeats with `.2`, `.3`). */
export function partsNamed(actor: Actor, prefix: string): THREE.Mesh[] {
  return [...actor.model.parts].filter(([name]) => name === prefix || name.startsWith(`${prefix}.`)).map(([, m]) => m);
}

export function v3(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z);
}

/**
 * A drawn comic bolt: a flat zig-zag ribbon (cyan, glowing) with a paper core and an ink keyline, from
 * `from` to `to` in the page plane. Wide enough to survive the pixel-art pass, deterministic per `seed`.
 */
export function makeComicBolt(stage: CinematicStage, from: THREE.Vector3, to: THREE.Vector3, seed: number): THREE.Group {
  const group = new THREE.Group();
  const steps = 7;
  const centre: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const side = i === 0 || i === steps ? 0 : (i % 2 ? 1 : -1) * (0.08 + hash(seed + i * 3.7) * 0.08);
    centre.push(new THREE.Vector2(lerpN(from.x, to.x, k) + side, lerpN(from.y, to.y, k)));
  }
  // A stroke with true perpendicular width (a diagonal zig never thins out), tapering to the tip.
  const ribbon = (width: number, tip: number): THREE.ShapeGeometry => {
    const left: THREE.Vector2[] = [];
    const right: THREE.Vector2[] = [];
    centre.forEach((p, i) => {
      const a = centre[Math.max(0, i - 1)]!, b = centre[Math.min(steps, i + 1)]!;
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

const lerpN = (a: number, b: number, k: number): number => a + (b - a) * k;
