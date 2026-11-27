/** What a comic panel shows: the room, its actors and its neighbours. Pure data shared by the game and the asset pipeline. */
export type RoomKind =
  | 'desk' | 'attic' | 'crypt_entrance' | 'crypt_hall' | 'chasm'
  | 'cell' | 'lab_hall' | 'catwalk' | 'furnace' | 'core' | 'outro';

/** Legacy actor roles from the first version of the stage. New things use key 'entity' plus `model`. */
export type LegacyActorKey = 'vibecoder' | 'ghost' | 'crate' | 'socket' | 'gargoyle' | 'gate' | 'boss' | 'minion' | 'hole' | 'mirror' | 'scroll';

export type ActorKind = 'vibecoder' | 'enemy' | 'boss' | 'pickup' | 'door' | 'prop' | 'npc';

/** Standard room-frame door socket ids in `src/procgen/archetypes/rooms/frame.ts`. */
export type RoomSocketId = 'door.left' | 'door.right' | 'door.down';

/** Animation state the stage should show (maps onto AnimState in src/procgen/anim). */
export type ActorState = 'idle' | 'walk' | 'windup' | 'attack' | 'hit' | 'death' | 'hidden' | 'revealed' | 'petrified' | 'frozen' | 'enraged';

/** Uniform scale multiplier or anisotropic [sx, sy, sz] scale tuple. */
export type SceneScale = number | [number, number, number];
/** Z-tilt in degrees (number), or Euler [rx, ry, rz] in degrees. */
export type SceneRotation = number | [number, number, number];

export interface SceneTransform {
  /** Depth layer relative to the actor plane (0 = actor plane, <0 = toward wall, >0 = toward camera + renderOrder). */
  zOrder?: number;
  scale?: SceneScale;
  rotation?: SceneRotation;
}

export type StageLightMode = 'off' | 'lantern' | 'monitor' | 'blacklight' | 'neon' | 'storm';

export type StageBatsAmbient =
  | boolean
  | { enabled?: boolean; minGapSec?: number; maxGapSec?: number; count?: [number, number]; scale?: number };

export type StageStormAmbient = boolean | { enabled?: boolean; intensity?: number };

export interface StageAmbientConfig {
  bats?: StageBatsAmbient;
  storm?: StageStormAmbient;
  lightMode?: StageLightMode;
  loops?: string[];
}

export function normalizeScale(scale?: SceneScale): [number, number, number] {
  if (typeof scale === 'number' && Number.isFinite(scale)) return [scale, scale, scale];
  if (Array.isArray(scale) && scale.length === 3 && scale.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return [scale[0], scale[1], scale[2]];
  }
  return [1, 1, 1];
}

export function normalizeRotationDeg(rotation?: SceneRotation): [number, number, number] {
  if (typeof rotation === 'number' && Number.isFinite(rotation)) return [0, 0, rotation];
  if (Array.isArray(rotation) && rotation.length === 3 && rotation.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return [rotation[0], rotation[1], rotation[2]];
  }
  return [0, 0, 0];
}

const DEG_TO_RAD = Math.PI / 180;

export function normalizeRotationRad(rotation?: SceneRotation): [number, number, number] {
  const [rx, ry, rz] = normalizeRotationDeg(rotation);
  return [rx * DEG_TO_RAD, ry * DEG_TO_RAD, rz * DEG_TO_RAD];
}

/** World Z offset for `zOrder`: camera sits on -z looking toward +z, so positive `zOrder` pulls nearer (negative Z offset). */
export function zOrderToZOffset(zOrder?: number, step = 0.08): number {
  return typeof zOrder === 'number' && Number.isFinite(zOrder) ? -zOrder * step : 0;
}

export function zOrderToRenderOrder(zOrder?: number): number {
  return typeof zOrder === 'number' && Number.isFinite(zOrder) ? Math.round(zOrder * 10) : 0;
}

export function pickTransform(v: SceneTransform): SceneTransform {
  return {
    ...(v.zOrder !== undefined ? { zOrder: v.zOrder } : {}),
    ...(v.scale !== undefined ? { scale: v.scale } : {}),
    ...(v.rotation !== undefined ? { rotation: v.rotation } : {}),
  };
}

export function pickSpatial(v: SceneTransform & { x?: number; y?: number }): SceneTransform & { x?: number; y?: number } {
  return {
    ...(v.x !== undefined ? { x: v.x } : {}),
    ...(v.y !== undefined ? { y: v.y } : {}),
    ...pickTransform(v),
  };
}

export interface RoomActor extends SceneTransform {
  key: LegacyActorKey | 'entity';
  /** Unique within the room; stable across snapshots so the stage can keep the same mesh. Defaults to `key`. */
  id?: string;
  /** procgen ModelCatalog id (`malware.worm`, `pickup.ram`, `door.usb`, `prop.fan`...). Overrides the legacy cast model. */
  model?: string;
  kind?: ActorKind;
  state?: ActorState;
  hp?: number;
  maxHp?: number;
  /** Process id shown by the PS_XRAY overlay. */
  pid?: number;
  /** VFS name the player types to target it (`worm.bin`, `energy.cell`). */
  target?: string;
  /** Semantic port role for transition door targeting (`entry`, `exit`, or `sub`). */
  portRole?: 'entry' | 'exit' | 'sub';
  /** Optional room-frame socket (`door.left`, `door.right`, `door.down`) the stage snaps x to. */
  socket?: RoomSocketId;
  /** Design-space height offset for hovering or wall-mounted things (0 = on the floor). */
  y?: number;
  x: number;
  hidden: boolean;
  petrified?: boolean;
  frozen?: boolean;
  /** Enemy attack countdown: player actions until its hit lands (0 = told, it strikes after the next action). Set only in a battle's player phase. */
  strikeIn?: number;
  alpha?: number;
  label?: string;
}

export interface NeighborPanel {
  label: string;
  path: string;
  relation: 'parent' | 'locked' | 'down' | 'sibling';
}

export interface RoomView {
  floor: number;
  path: string;
  title: string;
  kind: RoomKind;
  /** Deterministic seed for `room.<kind>` set-dressing variation. Defaults to 1. */
  roomSeed?: number;
  /** Optional `#rrggbb` panel sky/backdrop override. */
  backdrop?: string;
  /** Optional ambient lighting, bats, storm, and sound-loop overrides. */
  ambient?: StageAmbientConfig;
  flood: number;
  lantern: boolean;
  /** True while the developer does not hold the lantern: the room is almost black and only a faint self-glow lights him. */
  dark?: boolean;
  xray: boolean;
  actors: RoomActor[];
  /** Feeds door locks only (a `locked` relation locks the door of that name); the stage no longer draws these panels. */
  neighbors: NeighborPanel[];
  caption: string;
}
