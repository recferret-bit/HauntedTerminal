import * as THREE from 'three';
import {
  buildModel, disposeModel, hashSeed, kitBox, ZONES,
  type BuiltModel, type ModelSpec, type PartSpec, type Vec3, type ZoneId,
} from '../procgen/index.js';
import type { ComicFxLight, ComicMaterial } from '../shaders/comic-material.js';
import { stampMaterialBases } from './procgen-cast.js';
import type { StageActor } from './stage-cast.js';

export type DoorCableVariant = 'floor_trench' | 'wall_conduit' | 'ceiling_drop' | 'mixed_harness';

const CABLE_VARIANTS: readonly DoorCableVariant[] = ['floor_trench', 'wall_conduit', 'ceiling_drop', 'mixed_harness'];
const POWER_DOOR_MODELS = new Set([
  'door.usb', 'door.ethernet', 'door.hdmi', 'door.serial', 'door.firewall', 'door.loopback', 'door.socket',
]);
const DARK_LED_HEX = 0x221d2d;
const DARK_CAVITY_HEX = 0x151220;

interface OwnedDoorPart {
  mesh: THREE.Mesh;
  mat: ComicMaterial;
  baseHex: number;
  baseEmissive: number;
}

interface FirewallBarPart {
  mesh: THREE.Object3D;
  baseY: number;
  kind: 'bar' | 'rail' | 'lock';
}

export interface DoorRig {
  variant: DoorCableVariant;
  roomSeed: number;
  inwardX: 1 | -1;
  locked: boolean;
  firewallProgress: number;
  elapsed: number;
  nextSparkIn: number;
  nextBeepIn: number;
  rngState: number;
  cableModel: BuiltModel;
  primaryLed: OwnedDoorPart | null;
  secondaryLeds: OwnedDoorPart[];
  cavityGlow: OwnedDoorPart | null;
  contacts: OwnedDoorPart[];
  pulses: OwnedDoorPart[];
  firewallBars: FirewallBarPart[];
  sparkPoints: Vec3[];
  lights: ComicFxLight[];
}

export interface DoorStageHost {
  room: { seed: number } | null;
  view?: { dark?: boolean } | null;
  viewTop?: number;
  reducedMotion: { readonly on: boolean };
  devNoStorm: boolean;
  stormPaused: boolean;
  audioBus: { emit(ev: { kind: 'sfx'; cue: 'kiro_crack_step' }): void } | null;
  actors: Map<string, StageActor>;
  applyInk?: (obj: THREE.Object3D) => void;
}

/** True for interactive port/directory/firewall doors and gated/neutral `door.socket` hardware (`door.devnull` excluded). */
export function isPowerDoorActor(actor: Pick<StageActor, 'kind' | 'modelId'>): boolean {
  return (actor.kind === 'door' || actor.modelId === 'door.socket') && POWER_DOOR_MODELS.has(actor.modelId);
}

/** Picks one of the 4 seeded cable-routing topologies from `(seedKey, roomSeed)`. */
export function pickDoorCableVariant(seedKey: string, roomSeed: number): DoorCableVariant {
  return CABLE_VARIANTS[hashSeed(seedKey, roomSeed) % CABLE_VARIANTS.length]!;
}

function nextUnit(state: number): [number, number] {
  const next = (Math.imul(state ^ 0x9e3779b9, 1664525) + 1013904223) >>> 0;
  return [(next & 0xffff) / 0xffff, next || 1];
}

function samplePolyline3(pts: readonly Vec3[], t: number): Vec3 {
  if (pts.length === 0) return [0, 0, 0];
  if (pts.length === 1 || t <= 0) return pts[0]!;
  if (t >= 1) return pts[pts.length - 1]!;
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i]![0] - pts[i - 1]![0];
    const dy = pts[i]![1] - pts[i - 1]![1];
    const dz = pts[i]![2] - pts[i - 1]![2];
    const len = Math.hypot(dx, dy, dz);
    segs.push(len);
    total += len;
  }
  if (total <= 1e-6) return pts[0]!;
  let target = t * total;
  for (let i = 0; i < segs.length; i++) {
    const len = segs[i]!;
    if (target <= len || i === segs.length - 1) {
      const k = len > 1e-6 ? target / len : 0;
      const a = pts[i]!;
      const b = pts[i + 1]!;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    }
    target -= len;
  }
  return pts[pts.length - 1]!;
}

function appendCableTrunk(
  parts: PartSpec[],
  pulseCount: { n: number },
  sparkPoints: Vec3[],
  opts: {
    name: string;
    pts: Vec3[];
    radius: number;
    zone: ZoneId;
    pulseZone: ZoneId;
    beads: number;
  },
): void {
  const from = opts.pts[0]!;
  const relPath: Vec3[] = opts.pts.map(([x, y, z]) => [x - from[0], y - from[1], z - from[2]]);
  parts.push({
    name: opts.name,
    shape: { kind: 'tube', path: relPath, radius: opts.radius },
    zone: opts.zone,
    pos: from,
  });
  const last = opts.pts[opts.pts.length - 1]!;
  parts.push(kitBox(`${opts.name}.clamp`, [0.13, 0.11, opts.radius * 2 + 0.04], 'solder', [last[0], last[1], last[2] - 0.005], { bevel: 0.008 }));
  sparkPoints.push([last[0], last[1], last[2] - opts.radius - 0.02]);
  for (let i = 0; i < opts.beads; i++) {
    const u = 0.85 - (i / Math.max(1, opts.beads - 1)) * 0.65;
    const [px, py, pz] = samplePolyline3(opts.pts, u);
    const pid = `pulse.${pulseCount.n++}`;
    parts.push(kitBox(pid, [0.08, 0.06, 0.032], opts.pulseZone, [px, py, pz - opts.radius - 0.008], { outline: false }));
  }
}

function buildCableRigModelSpec(
  variant: DoorCableVariant,
  inX: 1 | -1,
  doorHeight: number,
  halfW: number,
  pulseZone: ZoneId,
  secondZone: ZoneId,
): { spec: ModelSpec; sparkPoints: Vec3[] } {
  const parts: PartSpec[] = [];
  const sparkPoints: Vec3[] = [];
  const pulseCount = { n: 0 };
  const s = Math.max(1.2, Math.min(2.1, doorHeight));
  const hw = Math.max(0.32, Math.min(0.65, halfW));
  const lugX = inX * (hw * 0.85);

  if (variant === 'floor_trench') {
    const a: Vec3[] = [[lugX, 0.15, 0.08], [lugX + inX * 0.24, 0.06, 0.09], [lugX + inX * 0.68, 0.045, 0.09], [lugX + inX * 1.18, 0.07, 0.09]];
    const b: Vec3[] = [[-lugX * 0.45, 0.11, 0.12], [lugX * 0.15, 0.05, 0.12], [lugX + inX * 0.55, 0.095, 0.12], [lugX + inX * 1.18, 0.13, 0.12]];
    appendCableTrunk(parts, pulseCount, sparkPoints, { name: 'cable.a', pts: a, radius: 0.032, zone: 'rubber', pulseZone, beads: 3 });
    appendCableTrunk(parts, pulseCount, sparkPoints, { name: 'cable.b', pts: b, radius: 0.024, zone: 'heatsink', pulseZone: secondZone, beads: 3 });
    parts.push(kitBox('junction', [0.18, 0.15, 0.09], 'pcbDark', [lugX + inX * 1.24, 0.09, 0.095], { bevel: 0.01 }));
  } else if (variant === 'wall_conduit') {
    const yHi = s * 0.72;
    const yLo = s * 0.42;
    const a: Vec3[] = [[lugX, yHi, 0.09], [lugX + inX * 0.36, yHi - 0.08, 0.1], [lugX + inX * 0.78, yHi - 0.12, 0.1], [lugX + inX * 1.18, yHi - 0.04, 0.1]];
    const b: Vec3[] = [[lugX, yLo, 0.13], [lugX + inX * 0.4, yLo + 0.04, 0.13], [lugX + inX * 0.86, yLo + 0.12, 0.13], [lugX + inX * 1.18, yHi - 0.18, 0.13]];
    appendCableTrunk(parts, pulseCount, sparkPoints, { name: 'cable.a', pts: a, radius: 0.03, zone: 'heatsink', pulseZone, beads: 3 });
    appendCableTrunk(parts, pulseCount, sparkPoints, { name: 'cable.b', pts: b, radius: 0.024, zone: 'rubber', pulseZone: secondZone, beads: 3 });
    parts.push(kitBox('junction', [0.17, 0.28, 0.085], 'pcbDark', [lugX + inX * 1.24, yHi - 0.11, 0.105], { bevel: 0.01 }));
  } else if (variant === 'ceiling_drop') {
    const topY = Math.min(2.8, s + 0.96);
    const a: Vec3[] = [[lugX * 0.72, s * 0.88, 0.09], [lugX + inX * 0.22, s * 1.06, 0.1], [lugX + inX * 0.54, s * 1.28, 0.1], [lugX + inX * 0.88, topY, 0.1]];
    const b: Vec3[] = [[-lugX * 0.32, s * 0.86, 0.13], [inX * 0.15, s * 1.12, 0.13], [lugX + inX * 0.42, topY - 0.18, 0.13], [lugX + inX * 0.78, topY, 0.13]];
    appendCableTrunk(parts, pulseCount, sparkPoints, { name: 'cable.a', pts: a, radius: 0.03, zone: 'rubber', pulseZone, beads: 3 });
    appendCableTrunk(parts, pulseCount, sparkPoints, { name: 'cable.b', pts: b, radius: 0.024, zone: 'solder', pulseZone: secondZone, beads: 3 });
    parts.push(kitBox('junction', [0.24, 0.12, 0.09], 'heatsink', [lugX + inX * 0.84, topY + 0.02, 0.105], { bevel: 0.01 }));
  } else {
    const a: Vec3[] = [[lugX, 0.15, 0.08], [lugX + inX * 0.34, 0.055, 0.09], [lugX + inX * 0.8, 0.065, 0.09], [lugX + inX * 1.15, 0.14, 0.09]];
    const b: Vec3[] = [[lugX, s * 0.8, 0.12], [lugX + inX * 0.36, s * 0.94, 0.125], [lugX + inX * 0.72, s * 1.05, 0.125], [lugX + inX * 1.04, s * 0.92, 0.125]];
    appendCableTrunk(parts, pulseCount, sparkPoints, { name: 'cable.a', pts: a, radius: 0.03, zone: 'rubber', pulseZone, beads: 3 });
    appendCableTrunk(parts, pulseCount, sparkPoints, { name: 'cable.b', pts: b, radius: 0.024, zone: 'heatsink', pulseZone: secondZone, beads: 3 });
    parts.push(kitBox('junction', [0.16, 0.16, 0.085], 'pcbDark', [lugX + inX * 1.08, s * 0.92, 0.1], { bevel: 0.01 }));
  }

  return { spec: { id: 'prop.door_cables', category: 'prop', label: 'Door cable harness', parts, sockets: { fx: [lugX * 0.5, s * 0.5, -0.15] } }, sparkPoints };
}

function ownComicPart(mesh: THREE.Mesh, actor: StageActor, matList: ComicMaterial[]): OwnedDoorPart | null {
  if (Array.isArray(mesh.material)) return null;
  const mat = mesh.material as ComicMaterial;
  if (!mat?.uniforms?.uColor || !mat.uniforms.uEmissive) return null;
  let own = mat;
  if (!mat.userData.doorOwn) {
    own = mat.clone() as ComicMaterial;
    for (const key of Object.keys(mat.uniforms)) own.uniforms[key] = mat.uniforms[key]!;
    own.uniforms.uColor = { value: (mat.uniforms.uColor.value as THREE.Color).clone() };
    own.uniforms.uEmissive = { value: Number(mat.uniforms.uEmissive.value ?? 0) };
    own.userData.comic = true;
    own.userData.doorOwn = true;
    own.userData.baseOpacity = mat.userData.baseOpacity ?? 1;
    own.userData.baseEmissive = Number(mat.uniforms.uEmissive.value ?? 0);
    mesh.material = own;
    matList.push(own);
    actor.all.push(own);
  }
  const color = own.uniforms.uColor!.value as THREE.Color;
  return { mesh, mat: own, baseHex: color.getHex(), baseEmissive: Number(own.userData.baseEmissive ?? 0) };
}

function collectFirewallBars(model: BuiltModel): FirewallBarPart[] {
  const out: FirewallBarPart[] = [];
  for (const [name, obj] of model.parts) {
    if (/^bar\d+$/.test(name)) {
      out.push({ mesh: obj, baseY: obj.position.y, kind: 'bar' });
    } else if (name === 'rail.bottom') {
      out.push({ mesh: obj, baseY: obj.position.y, kind: 'rail' });
    } else if (name === 'plate' || name.startsWith('padlock') || name === 'led' || name === 'bit.w.led' || name === 'bit.x.led') {
      out.push({ mesh: obj, baseY: obj.position.y, kind: 'lock' });
    }
  }
  return out;
}

function rigActorSide(actor: StageActor): 1 | -1 {
  const x = Number.isFinite(actor.home.x) && Math.abs(actor.home.x) > 0.05 ? actor.home.x : actor.viewX;
  return Number.isFinite(x) && x <= 0 ? 1 : -1;
}

/** Builds or refreshes a door's procedural cable rig and isolates its emissive materials for power control. */
export function ensureDoorRig(stage: DoorStageHost, actor: StageActor): DoorRig | null {
  if (!isPowerDoorActor(actor) || actor.disposed) return null;
  const roomSeed = stage.room?.seed ?? 1;
  const inwardX = rigActorSide(actor);
  if (actor.doorRig && actor.doorRig.roomSeed === roomSeed && actor.doorRig.inwardX === inwardX) {
    return actor.doorRig;
  }
  if (actor.doorRig) disposeDoorRig(actor);

  const variant = pickDoorCableVariant(actor.id || actor.target || actor.modelId, roomSeed);
  const isExit = actor.portRole === 'exit';
  const pulseZone: ZoneId = 'phosphor';
  const secondZone: ZoneId = 'powerAmber';
  const { spec, sparkPoints } = buildCableRigModelSpec(
    variant,
    inwardX,
    actor.height,
    actor.rawHalfWidthX * Math.abs(actor.scaleVec[0] || 1),
    pulseZone,
    secondZone,
  );

  const cableModel = buildModel(spec, { seed: hashSeed(actor.id, roomSeed) || 1 });
  stampMaterialBases(cableModel.allMaterials);
  stage.applyInk?.(cableModel.group);
  cableModel.group.renderOrder = Math.max(0, actor.renderOrder - 1);
  actor.group.add(cableModel.group);
  for (const m of cableModel.allMaterials) actor.all.push(m);

  let primaryLed: OwnedDoorPart | null = null;
  const secondaryLeds: OwnedDoorPart[] = [];
  let cavityGlow: OwnedDoorPart | null = null;
  const contacts: OwnedDoorPart[] = [];
  for (const [name, obj] of actor.model.parts) {
    if (!(obj instanceof THREE.Mesh)) continue;
    if (name === 'led') {
      primaryLed = ownComicPart(obj, actor, actor.model.allMaterials);
    } else if (name.endsWith('.led')) {
      const part = ownComicPart(obj, actor, actor.model.allMaterials);
      if (part) secondaryLeds.push(part);
    } else if (name === 'cavity.glow') {
      cavityGlow = ownComicPart(obj, actor, actor.model.allMaterials);
    } else if (/^(contact|blade\.|portcullis\.|loop\.)/.test(name)) {
      const part = ownComicPart(obj, actor, actor.model.allMaterials);
      if (part) contacts.push(part);
    }
  }

  const pulses: OwnedDoorPart[] = [];
  for (const [name, obj] of cableModel.parts) {
    if (name.startsWith('pulse.') && obj instanceof THREE.Mesh) {
      const part = ownComicPart(obj, actor, cableModel.allMaterials);
      if (part) pulses.push(part);
    }
  }
  pulses.sort((a, b) => a.mesh.name.localeCompare(b.mesh.name));

  let rng = hashSeed(`${actor.id}:${roomSeed}`, actor.seed) || 1;
  const [f1, r1] = nextUnit(rng);
  const [f2, r2] = nextUnit(r1);
  rng = r2;
  const rig: DoorRig = {
    variant,
    roomSeed,
    inwardX,
    locked: actor.viewLocked ?? false,
    firewallProgress: (actor.viewLocked ?? false) ? 0 : 1,
    elapsed: f1 * 2,
    nextSparkIn: (isExit ? 1.8 : 2.8) + f1 * 1.4,
    nextBeepIn: 4.2 + f2 * 1.6,
    rngState: rng,
    cableModel,
    primaryLed,
    secondaryLeds,
    cavityGlow,
    contacts,
    pulses,
    firewallBars: actor.modelId === 'door.firewall' ? collectFirewallBars(actor.model) : [],
    sparkPoints,
    lights: [],
  };
  actor.doorRig = rig;
  return rig;
}

/** Disposes procedural cable geometry and detaches its materials cleanly when a door actor is torn down. */
export function disposeDoorRig(actor: StageActor): void {
  const rig = actor.doorRig;
  if (!rig) return;
  const drop = new Set<ComicMaterial>(rig.cableModel.allMaterials);
  actor.all = actor.all.filter((m) => !drop.has(m));
  rig.cableModel.group.removeFromParent();
  disposeModel(rig.cableModel);
  actor.doorRig = null;
}

function applyFirewallBars(rig: DoorRig): void {
  const p = rig.firewallProgress;
  for (const part of rig.firewallBars) {
    if (part.kind === 'bar') {
      part.mesh.position.y = part.baseY + 1.15 * p;
      part.mesh.scale.y = 1 - 0.68 * p;
    } else if (part.kind === 'rail') {
      part.mesh.position.y = part.baseY + 0.92 * p;
    } else {
      part.mesh.position.y = part.baseY + 0.56 * p;
    }
  }
}

/** Retracts `door.firewall` iron bars upward inside the grounded archway (`0` closed .. `1` open). */
export function setFirewallOpenProgress(actor: StageActor, progress: number): void {
  const rig = actor.doorRig;
  if (!rig || rig.firewallBars.length === 0) return;
  rig.firewallProgress = Math.max(0, Math.min(1, progress));
  applyFirewallBars(rig);
}

function setPartGlow(part: OwnedDoorPart, hex: number, emissive: number, visible = true): void {
  part.mesh.visible = visible;
  (part.mat.uniforms.uColor!.value as THREE.Color).setHex(hex);
  part.mat.uniforms.uEmissive!.value = emissive;
}

function applyDoorPowerVisuals(rig: DoorRig, actor: StageActor, locked: boolean, reducedMotion: boolean): void {
  if (locked) {
    if (rig.primaryLed) setPartGlow(rig.primaryLed, DARK_LED_HEX, 0, true);
    for (const led of rig.secondaryLeds) setPartGlow(led, DARK_LED_HEX, 0, true);
    if (rig.cavityGlow) setPartGlow(rig.cavityGlow, DARK_CAVITY_HEX, 0, true);
    for (const c of rig.contacts) setPartGlow(c, c.baseHex, 0, true);
    for (const p of rig.pulses) setPartGlow(p, DARK_LED_HEX, 0, false);
    return;
  }

  const isExit = actor.portRole === 'exit';
  const step = Math.floor(rig.elapsed * 12);
  if (rig.primaryLed) {
    const glow = reducedMotion ? 0.95 : isExit ? 0.95 + ((step % 6) < 3 ? 0.22 : 0) : 0.88;
    setPartGlow(rig.primaryLed, ZONES.phosphor.color, glow, true);
  }
  for (let i = 0; i < rig.secondaryLeds.length; i++) {
    const led = rig.secondaryLeds[i]!;
    const hot = reducedMotion || ((step + i * 2) % 6) < 3;
    setPartGlow(led, led.baseHex, hot ? (isExit ? 0.95 : 0.78) : 0.15, true);
  }
  if (rig.cavityGlow) {
    const cavGlow = reducedMotion ? (isExit ? 0.8 : 0.62) : isExit ? 0.72 + ((step % 8) < 4 ? 0.16 : 0) : 0.56 + ((step % 8) < 4 ? 0.12 : 0);
    setPartGlow(rig.cavityGlow, rig.cavityGlow.baseHex, cavGlow, true);
  }
  for (const c of rig.contacts) {
    const contactGlow = reducedMotion ? 0.16 : isExit ? 0.16 + ((step % 6) < 2 ? 0.1 : 0) : 0.12;
    setPartGlow(c, c.baseHex, contactGlow, true);
  }
  const nPulses = rig.pulses.length;
  const wave = nPulses > 0 ? step % (nPulses + 1) : 0;
  for (let i = 0; i < nPulses; i++) {
    const pulse = rig.pulses[i]!;
    if (reducedMotion) {
      setPartGlow(pulse, pulse.baseHex, 0.75, true);
      continue;
    }
    const dist = Math.abs((i % Math.max(1, nPulses)) - wave);
    const em = dist === 0 ? 1.65 : dist === 1 ? 0.75 : 0.16;
    setPartGlow(pulse, pulse.baseHex, em, true);
  }
}

/** Immediately reconciles door power visuals and `door.firewall` bar position after sync or unlock. */
export function syncDoorPowerImmediate(stage: DoorStageHost, actor: StageActor, locked: boolean): void {
  const rig = ensureDoorRig(stage, actor);
  if (!rig) return;
  rig.locked = locked;
  if (rig.firewallBars.length > 0 && !actor.exiting) {
    setFirewallOpenProgress(actor, locked ? 0 : 1);
  }
  applyDoorPowerVisuals(rig, actor, locked, stage.reducedMotion.on);
}

/** Steps 12 fps LEDs, wire pulses, emitted light pools, periodic sparks, and soft exit-ready audio beacons. */
export function stepDoorPower(
  stage: DoorStageHost,
  dt: number,
  onSpark?: (actor: StageActor, worldPos: THREE.Vector3) => void,
): void {
  const dark = Boolean(stage.view?.dark);
  const reduced = stage.reducedMotion.on;
  const liveAmbient = !reduced && !stage.devNoStorm && !stage.stormPaused;
  const tmp = new THREE.Vector3();

  for (const actor of stage.actors.values()) {
    const rig = actor.doorRig ?? (isPowerDoorActor(actor) ? ensureDoorRig(stage, actor) : null);
    if (!rig || actor.disposed) continue;
    rig.elapsed += dt;
    const visible = !actor.exiting && !actor.dead && actor.group.visible && actor.rest !== 'hidden';
    rig.cableModel.group.visible = !actor.dead && actor.rest !== 'hidden';
    applyDoorPowerVisuals(rig, actor, rig.locked, reduced);
    if (rig.firewallBars.length > 0) applyFirewallBars(rig);

    if (rig.locked || !visible) {
      rig.lights = [];
      continue;
    }

    const isExit = actor.portRole === 'exit';
    const step = Math.floor(rig.elapsed * 12);
    const shimmer = reduced ? 0 : (step % 8) < 4 ? 0.025 : -0.015;
    const doorX = actor.base.x + actor.offset.x;
    const doorY = actor.base.y + actor.offset.y;
    const h = Math.max(1.1, actor.height);
    rig.lights = [
      {
        x: doorX - rig.inwardX * 0.05,
        y: doorY + Math.min(1.15, h * 0.62),
        radius: isExit ? (dark ? 1.05 : 0.85) : dark ? 0.78 : 0.62,
        power: (isExit ? (dark ? 0.30 : 0.19) : dark ? 0.18 : 0.11) + shimmer,
        color: ZONES.powerAmber.color,
      },
      {
        x: doorX + rig.inwardX * 0.16,
        y: doorY + Math.min(0.95, h * 0.42),
        radius: isExit ? (dark ? 1.48 : 1.18) : dark ? 1.05 : 0.84,
        power: (isExit ? (dark ? 0.27 : 0.17) : dark ? 0.15 : 0.09) - shimmer * 0.5,
        color: ZONES.phosphor.color,
      },
    ];

    if (!liveAmbient) continue;
    rig.nextSparkIn -= dt;
    if (rig.nextSparkIn <= 0) {
      const [u, next] = nextUnit(rig.rngState);
      rig.rngState = next;
      rig.nextSparkIn = (isExit ? 1.85 : 2.95) + u * 1.45;
      const pts = rig.sparkPoints;
      const local = pts[step % pts.length] ?? ([0, actor.height * 0.65, -0.15] as Vec3);
      tmp.set(local[0], local[1], local[2]);
      actor.group.updateWorldMatrix(true, false);
      actor.group.localToWorld(tmp);
      onSpark?.(actor, tmp);
    }

    if (isExit) {
      rig.nextBeepIn -= dt;
      if (rig.nextBeepIn <= 0) {
        const [u, next] = nextUnit(rig.rngState);
        rig.rngState = next;
        rig.nextBeepIn = 4.5 + u * 1.6;
        stage.audioBus?.emit({ kind: 'sfx', cue: 'kiro_crack_step' });
      }
    }
  }
}

/** Combined yellow + green light pairs for up to 2 unlocked doors (`<= 4` lights), exit doors prioritized first. */
export function activeDoorLights(stage: DoorStageHost): ComicFxLight[] {
  const candidates: { lights: ComicFxLight[]; isExit: boolean; score: number }[] = [];
  for (const actor of stage.actors.values()) {
    const lights = actor.doorRig?.lights;
    if (!lights || lights.length === 0 || actor.disposed || actor.exiting || actor.dead || !actor.group.visible || actor.rest === 'hidden') continue;
    const score = lights.reduce((sum, l) => sum + l.power * l.radius, 0);
    candidates.push({ lights, isExit: actor.portRole === 'exit', score });
  }
  candidates.sort((a, b) => Number(b.isExit) - Number(a.isExit) || b.score - a.score);
  return candidates.slice(0, 2).flatMap((c) => c.lights);
}
