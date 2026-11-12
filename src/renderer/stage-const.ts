import * as THREE from 'three';
import type { RoomKind, RoomView } from './room-view.js';

export interface FloorTheme {
  title: string;
  name: string;
  bg: number;
  accent: number;
  path: string;
}

export const FLOORS: Record<number, FloorTheme> = {
  1: { title: 'FLOOR 01 // ATTIC WORKSPACE', name: 'ATTIC WORKSPACE', bg: 0x211a36, accent: 0xffd166, path: '/home/dev/nightmare_workspace' },
  2: { title: 'FLOOR 02 // LOCKED CRYPT', name: 'LOCKED CRYPT', bg: 0x1c252c, accent: 0x06d6a0, path: '/var/dungeon' },
  3: { title: 'FLOOR 03 // SYMLINK LABYRINTH', name: 'SYMLINK LABYRINTH', bg: 0x182038, accent: 0x4cc9f0, path: '/usr/local/labyrinth' },
  4: { title: 'FLOOR 04 // DAEMON BOILER ROOM', name: 'DAEMON BOILER ROOM', bg: 0x2e1720, accent: 0xef476f, path: '/proc_mansion/boiler_room' },
  5: { title: 'FLOOR 05 // KERNEL PANIC CORE', name: 'KERNEL PANIC CORE', bg: 0x1f1135, accent: 0xb5179e, path: '/sys/kernel/panic_chamber' },
};

/**
 * Camera sits on −z and looks toward +z, level with the page.
 * A camera on −z yawed 180° has screen-right = world −x, so world +x is screen-left.
 * Cast meshes face local −z, so rotation.y = 0 looks at the camera.
 * assertFrame() checks direction.z > 0.9, |direction.y| < 0.05, and screen-right.x < -0.9.
 */
export const CAM_HOME = new THREE.Vector3(0, 2.45, -8);
export const LOOK_HOME = new THREE.Vector3(0, 2.45, 0);
export const FEET_Y = 0.62;
/** Design-space panel the room actors were authored in. World +x is screen-left. */
export const DESIGN_LEFT = 4.9;
export const DESIGN_RIGHT = -1.15;
export const ACTOR_Z = 0.22;
/** The hero's stepped walk to a target: 6 held poses. */
export const HERO_STEPS = 6;
export const HERO_STEP_MS = 70;
export const HERO_WALK_MS = HERO_STEPS * HERO_STEP_MS;
/** A batch never queues more than this far ahead; past it, events play at once. */
export const MAX_LEAD_MS = 2400;

/** Door names compare without case, spaces or underscores ('iron gate' = 'iron_gate'). */
export function normName(name: string): string {
  return name.toLowerCase().replace(/\[locked\]|\(sealed\)/g, '').trim().replace(/[\s_]+/g, '_');
}

export function lockedNames(view: RoomView | null): Set<string> {
  return new Set((view?.neighbors ?? []).filter((n) => n.relation === 'locked').map((n) => normName(n.label)));
}

export function themeFor(kind: RoomKind): FloorTheme {
  if (kind === 'desk' || kind === 'attic') return FLOORS[1]!;
  if (kind === 'crypt_entrance' || kind === 'crypt_hall' || kind === 'chasm') return FLOORS[2]!;
  if (kind === 'cell' || kind === 'lab_hall') return FLOORS[3]!;
  if (kind === 'catwalk' || kind === 'furnace') return FLOORS[4]!;
  return FLOORS[5]!;
}

export function defaultRoom(): RoomView {
  return {
    floor: 1,
    path: '/home/dev/nightmare_workspace',
    title: 'FLOOR 01 // /home/dev/nightmare_workspace',
    kind: 'attic',
    flood: 0,
    lantern: false,
    xray: false,
    caption: 'The hatch is dark.',
    neighbors: [
      { label: 'desk', path: 'desk', relation: 'parent' },
      { label: 'hatch', path: 'cellar_hatch', relation: 'down' },
    ],
    actors: [
      { key: 'vibecoder', x: 2.5, hidden: false },
      { key: 'scroll', x: 1.3, hidden: false, label: 'readme' },
      { key: 'socket', x: 0.1, hidden: false, label: 'intercom' },
      { key: 'ghost', x: -0.4, hidden: false, alpha: 0.04 },
      { key: 'gate', x: -1.0, hidden: false, label: 'hatch' },
    ],
  };
}

export function disposeTree(root: THREE.Object3D): void {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry && mesh.name !== 'xray-link') geos.add(mesh.geometry);
    const material = mesh.material;
    if (mesh.name === 'xray-link') return;
    if (Array.isArray(material)) material.forEach((m) => mats.add(m));
    else if (material) mats.add(material);
  });
  geos.forEach((geo) => geo.dispose());
  mats.forEach((mat) => {
    const map = (mat as THREE.SpriteMaterial).map;
    if (map?.userData?.ephemeral) map.dispose();
    mat.dispose();
  });
}
