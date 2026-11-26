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

export interface RoomActor {
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
