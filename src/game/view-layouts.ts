import type {
  RoomSocketId, SceneRotation, SceneScale, SceneTransform, StageAmbientConfig,
} from '../contracts/room-view.js';
import type { EntityView } from './entities.js';
import type { ItemId } from './inventory.js';
import type { ActorKind, ActorState, FloorId, LegacyActorKey } from './types.js';

export interface ViewThing extends SceneTransform {
  name: string;
  type: 'file' | 'dir' | 'symlink' | 'socket' | 'device';
  /** Directory (or link to one) the hero may enter now. */
  open: boolean;
  /** Set when this file is an enemy or pickup: the entity actor stands for it. */
  entity?: string;
  x?: number;
  y?: number;
  model?: string;
  socket?: RoomSocketId;
  label?: string;
  key?: LegacyActorKey;
  kind?: ActorKind;
}

export interface SceneFacts {
  floor: FloorId;
  cwd: string;
  ended: boolean;
  lantern: boolean;
  /** True while he does not hold the lantern: the room is almost black (set by the chapter session). */
  dark?: boolean;
  /** True in the entry room of a floor/level after the first: places an unlocked entrance port at `door.left`. */
  entryDoor?: boolean;
  /** Declarative hero placement/transform override (number = x, object = full transform). */
  hero?: number | ({ x: number; y?: number } & SceneTransform);
  /** Declarative entrance port override when `entryDoor` is active (or explicitly configured). */
  entryPort?: { label?: string; model?: string; x?: number; y?: number; socket?: RoomSocketId } & SceneTransform;
  /** Optional `#rrggbb` panel backdrop override. */
  backdrop?: string;
  /** Optional ambient lighting/bats/storm/loop overrides. */
  ambient?: StageAmbientConfig;
  /** Declarative props supplied directly by config (no layout table needed). */
  props?: Prop[];
  /** Declarative caption text override. */
  captionText?: string;
  /** The item in his hand: picks the hero model. `null` is empty hands; default: the lantern. */
  held?: ItemId | null;
  hp?: number;
  maxHp?: number;
  xray: boolean;
  flood: number;
  /** Children of the cwd. */
  things: ViewThing[];
  /** Enemies and pickups in this room. */
  entities: EntityView[];
  /** Floor exits (dir names) and whether each is open now. */
  exits: Record<string, boolean>;
  ghost: boolean;
  mimic: boolean;
  gateOpen: boolean;
  plankBridged: boolean;
  gargoyle: 'live' | 'stone' | 'gone';
  zombies: number;
  bossDead: boolean;
  bossFrozen: boolean;
  phase1: boolean;
  portal: boolean;
  powerOn: boolean;
  valveOpen: boolean;
  /** Live enemies whose zone is this room. */
  hostiles: number;
  /** Optional self-hosted Kiro Ghost companion hovering near `vibecoder.dev` or cracking a gate. */
  kiro?: {
    x: number;
    y: number;
    state: 'idle' | 'windup';
    target?: string;
    label: string;
    zOrder?: number;
    scale?: SceneScale;
    rotation?: SceneRotation;
    alpha?: number;
  };
}

export interface Slot extends SceneTransform {
  x: number;
  y?: number;
  socket?: RoomSocketId;
  key?: LegacyActorKey;
  model?: string;
  label?: string;
}

export interface Prop extends SceneTransform {
  id: string;
  model: string;
  x: number;
  y?: number;
  socket?: RoomSocketId;
  key?: LegacyActorKey;
  kind?: ActorKind;
  state?: ActorState;
  label?: string;
  target?: string;
  when?: (f: SceneFacts) => boolean;
}

export interface Layout {
  hero?: number;
  slots?: Record<string, Slot>;
  props?: Prop[];
  caption?: (f: SceneFacts) => string;
}

const F1 = '/home/dev/nightmare_workspace';
const F2 = '/var/dungeon/entrance';
export const F3 = '/usr/local/labyrinth';
const F4 = '/proc_mansion/boiler_room';
const F5 = '/sys/kernel/panic_chamber';

export const LAYOUTS: Record<string, Layout> = {
  [`${F1}/desk`]: {
    hero: 2.4,
    props: [
      { id: 'prop:crt', model: 'prop.crt', x: 4.35, label: 'your monitor' },
      { id: 'prop:cables', model: 'prop.cables', x: -0.85, label: 'ribbon cobweb' },
      { id: 'prop:ram_bank', model: 'prop.ram_bank', x: 3.65, label: 'DDR5 DIMM bank' },
      { id: 'prop:indicator', model: 'prop.indicator', x: -0.35, label: 'status tower' },
      { id: 'prop:cobweb', model: 'prop.cobweb', x: 4.7, y: 3.0, zOrder: -3 },
      { id: 'prop:shelf-left', model: 'prop.shelf', x: 3.25, y: 2.25, zOrder: -3, scale: 0.9 },
      { id: 'prop:platter-1', model: 'prop.platter', x: 3.35, y: 2.52, zOrder: -2, scale: 0.72 },
      { id: 'prop:corner-web-r', model: 'prop.corner_cobweb', x: -1.0, y: 3.2, zOrder: -3, scale: 0.85 },
    ],
    slots: {
      'todo.note': { x: 1.55, key: 'scroll' },
      'ram_16gb.dimm': { x: 0.95 },
      'prod.py': { x: 0.2 },
    },
    caption: (f) => (f.hostiles > 0 ? 'The bug from prod.py crawled out with you. It bites.' : 'The note on the desk points up the stairs.'),
  },
  [F1]: {
    hero: 2.5,
    props: [
      { id: 'prop:cables', model: 'prop.cables', x: 4.75, label: 'ribbon cobweb' },
      { id: 'prop:wire_loom', model: 'prop.wire_loom', x: 4.4, label: 'patch loom' },
      { id: 'prop:transistor', model: 'prop.transistor', x: 3.0, label: 'TO-220FET' },
      { id: 'prop:spider', model: 'prop.spider', x: 3.15, y: 2.35, zOrder: -2 },
      { id: 'prop:corner-web-l', model: 'prop.corner_cobweb', x: 4.7, y: 3.18, zOrder: -3, scale: 0.95 },
      { id: 'prop:shelf-attic', model: 'prop.shelf', x: 1.85, y: 2.35, zOrder: -3, scale: 0.9 },
      { id: 'prop:platter-attic', model: 'prop.platter', x: 2.0, y: 2.6, zOrder: -2, scale: 0.65, rotation: 10 },
      { id: 'prop:fuse', model: 'prop.fuse', x: -0.62, y: 1.0, label: '.power_on', when: (f) => f.powerOn },
    ],
    slots: {
      drive_bay: { x: 4.05, model: 'door.serial' },
      desk: { x: 3.35, model: 'door.usb' },
      'readme.txt': { x: 1.75, key: 'scroll' },
      'energy.cell': { x: 1.2 },
      'intercom.sock': { x: 0.65, key: 'socket' },
      '.spycam': { x: 0.1, y: 0.5 },
      '.poltergeist.lock': { x: -0.4, key: 'ghost' },
      cellar_hatch: { x: -0.95, key: 'gate', model: 'door.ethernet' },
    },
    caption: (f) => (f.ghost ? 'Something unseen holds the hatch. Something else is watching.'
      : !f.powerOn ? 'The relay is waiting for power.' : 'The hatch hums. Down you go.'),
  },
  [`${F1}/drive_bay`]: {
    hero: 2.4,
    props: [
      { id: 'prop:crt', model: 'prop.crt', x: 4.4, label: 'dead CRT' },
      { id: 'prop:cables', model: 'prop.cables', x: 3.65 },
      { id: 'prop:chip', model: 'prop.chip', x: -0.35, label: 'drive controller' },
      { id: 'prop:fuse', model: 'prop.fuse', x: -0.95, label: 'spare fuse' },
    ],
    slots: { 'labels.txt': { x: 1.4 }, 'ssd_256gb.img': { x: 0.6 } },
    caption: () => 'Dusty drive bays. One backup image still spins.',
  },
  [F2]: {
    hero: 2.4,
    props: [
      { id: 'prop:tomb1', model: 'prop.tombstone', x: 4.78, label: 'FATAL' },
      { id: 'prop:tomb2', model: 'prop.tombstone', x: 3.85, label: 'FATAL' },
      { id: 'prop:bat', model: 'prop.bat', x: 4.45, y: 2.95, zOrder: -2 },
      { id: 'prop:cobweb', model: 'prop.cobweb', x: -0.98, y: 3.05, zOrder: -3 },
      { id: 'prop:platter-crypt', model: 'prop.platter', x: 2.55, y: 2.35, zOrder: -3, scale: 0.78 },
    ],
    slots: {
      chronicles: { x: 3.35, model: 'door.usb' },
      'archivist_gate.sock': { x: 1.55, key: 'socket' },
      port_445: { x: 0.85, model: 'door.serial' },
      'worm.bin': { x: 0.4 },
      'keygen.exe': { x: -0.25 },
      iron_gate: { x: -0.9, key: 'gate', model: 'door.firewall' },
    },
    caption: (f) => (f.hostiles > 0 ? 'A worm keeps erupting from port_445. Something picks at locks.'
      : f.gateOpen ? 'The iron can rise.' : 'The archivist counts FATAL lines.'),
  },
  [`${F2}/chronicles`]: {
    hero: 2.4,
    slots: { 'energy.cell': { x: 3.5 }, 'day1.log': { x: 1.35 }, 'day2.log': { x: 0.55 }, 'day3.log': { x: -0.25 } },
    caption: () => 'Log tombstones. Count the FATAL ones.',
  },
  [`${F2}/port_445`]: {
    hero: 2.4,
    slots: { 'worm.bin': { x: 0.4 } },
    caption: () => "Inside port 445: the worm's nest.",
  },
  [`${F2}/iron_gate`]: {
    hero: 2.3,
    props: [{ id: 'prop:capacitor', model: 'prop.capacitor', x: 4.6, label: 'pillar' }],
    slots: {
      'energy.cell': { x: 3.45 },
      'heavy_plank.tar': { x: 1.0, key: 'crate' },
      'stone_gargoyle.bin': { x: -0.2, key: 'gargoyle' },
      chasm: { x: -0.95, model: 'door.hdmi' },
    },
    caption: (f) => (f.gargoyle === 'live' ? 'A plank, a pit, and a statue that bites.'
      : f.plankBridged ? 'The way down is safe.' : 'The statue is quiet. Bridge the gap.'),
  },
  [`${F2}/iron_gate/chasm`]: {
    hero: 2.2,
    props: [{ id: 'hole', key: 'hole', model: 'door.devnull', x: 0.3, label: 'pit' }],
    slots: {
      'ram_16gb.dimm': { x: 1.35 },
      'heavy_plank.tar': { x: 0.3, key: 'crate', label: 'bridge' },
      crypt_stairs: { x: -0.8, model: 'door.ethernet' },
    },
    caption: (f) => (f.plankBridged ? 'The plank bridges the drop.' : 'The gap is still open.'),
  },
  [`${F3}/wing_a/floor_3/cell_9`]: {
    hero: 1.8,
    props: [{ id: 'prop:capacitor', model: 'prop.capacitor', x: 4.78 }],
    slots: {
      'energy.cell': { x: 3.3 },
      north_exit: { x: 0.95, key: 'mirror', model: 'door.loopback' },
      east_exit: { x: 0.1, model: 'door.loopback' },
      south_exit: { x: -0.75, model: 'door.loopback' },
    },
    caption: (f) => `Black water at ${f.flood}%. The mirrors lie.`,
  },
  [F3]: {
    hero: 2.2,
    props: [
      { id: 'prop:capacitor', model: 'prop.capacitor', x: 4.75 },
      { id: 'prop:gpu_card', model: 'prop.gpu_card', x: 3.75, label: 'bus accelerator' },
      { id: 'prop:spider', model: 'prop.spider', x: -0.95, y: 2.35, zOrder: -2 },
      { id: 'prop:pcb-maze', model: 'prop.pcb_plaque', x: 2.85, y: 2.2, zOrder: -3, scale: 0.9 },
      { id: 'prop:led-maze', model: 'prop.led_bar', x: 0.55, y: 2.75, zOrder: -3 },
    ],
    slots: {
      wing_a: { x: 4.15, model: 'door.loopback' },
      ram_slots: { x: 3.35, model: 'door.usb' },
      'pressure_plate.sock': { x: 1.5, key: 'socket' },
      'virus.exe': { x: 0.85 },
      pedestal: { x: 0.05, model: 'door.usb' },
      '.mimic': { x: -0.3, key: 'ghost' },
      hidden_wing: { x: -0.95, model: 'door.hdmi' },
    },
    caption: (f) => (f.hostiles > 0 ? 'A virus buds in the hall. rm only feeds it.' : 'Three runes. No mimic. Whisper align.'),
  },
  [`${F3}/pedestal`]: {
    hero: 2.2,
    slots: { '.mimic': { x: -0.3, key: 'ghost' } },
    caption: (f) => (f.mimic ? 'The pedestal grins back at you.' : 'An empty pedestal, waiting for three runes.'),
  },
  [`${F3}/ram_slots`]: {
    hero: 2.4,
    props: [
      { id: 'prop:chip', model: 'prop.chip', x: 4.45 },
      { id: 'prop:capacitor', model: 'prop.capacitor', x: -1.05 },
    ],
    slots: {
      'stack.buf': { x: 1.55 },
      'overflow.bin': { x: 0.8 },
      'ram_16gb.dimm': { x: 0.05 },
      'ssd_256gb.img': { x: -0.5 },
    },
    caption: (f) => (f.hostiles > 0 ? 'An exploit pumps stack.buf full of AAAA.' : 'RAM slots, quiet now.'),
  },
  [`${F3}/hidden_wing`]: {
    hero: 2.2,
    slots: { 'energy.cell': { x: 1.1 }, boiler_shaft: { x: -0.2, model: 'door.ethernet' } },
    caption: () => 'A shaft drops toward the heat.',
  },
  [`${F4}/catwalk`]: {
    hero: 2.2,
    props: [
      { id: 'prop:fan', model: 'prop.fan', x: 4.78 },
      { id: 'prop:heatsink', model: 'prop.heatsink', x: 3.68 },
      { id: 'prop:water_pipe', model: 'prop.water_pipe', x: 3.92, label: 'coolant line' },
      { id: 'prop:cooler_tower', model: 'prop.cooler_tower', x: 3.05, label: 'fin tower' },
      { id: 'prop:hanging-catwalk', model: 'prop.hanging_cable', x: 1.9, y: 2.95, zOrder: -2 },
      { id: 'prop:led-catwalk', model: 'prop.led_bar', x: -0.15, y: 2.75, zOrder: -3 },
      { id: 'door:furnace_hall', model: 'door.hdmi', x: -0.95, kind: 'door', target: 'furnace_hall', label: 'furnace_hall (sealed)', when: (f) => !f.valveOpen },
    ],
    slots: {
      'energy.cell': { x: 3.25 },
      'boiler.dump': { x: 1.5, key: 'scroll' },
      'valve_lock.sock': { x: 0.95, key: 'socket' },
      'ransom.exe': { x: 0.35 },
      'ram_16gb.dimm': { x: -0.3 },
      furnace_hall: { x: -0.95, model: 'door.hdmi' },
    },
    caption: (f) => (f.hostiles > 0 ? 'ransom.exe chews on your pickups.' : 'The valve wants the password backwards.'),
  },
  [`${F4}/furnace_hall`]: {
    hero: 2.4,
    props: [
      { id: 'prop:heatsink', model: 'prop.heatsink', x: 4.7 },
      { id: 'prop:fan', model: 'prop.fan', x: 4.15 },
      { id: 'prop:water_pipe', model: 'prop.water_pipe', x: 4.45, label: 'feed manifold' },
      { id: 'prop:cooler_aio', model: 'prop.cooler_aio', x: -0.35, label: 'AIO block' },
    ],
    slots: {
      'energy.cell': { x: 3.6 },
      'ssd_256gb.img': { x: 3.05 },
      necromancer_forkd: { x: 0.3, key: 'boss' },
      core_elevator: { x: -0.95, model: 'door.ethernet' },
    },
    caption: (f) => (f.bossDead || f.bossFrozen ? 'The forks have stopped.' : 'SIGTERM only makes it angry.'),
  },
  [F5]: {
    hero: 2.4,
    props: [
      { id: 'prop:gpu_server', model: 'prop.gpu_server', x: -0.82, label: 'compute node' },
      { id: 'prop:bat', model: 'prop.bat', x: 4.65, y: 2.95, zOrder: -2 },
      { id: 'prop:pcb-core', model: 'prop.pcb_plaque', x: 2.25, y: 2.3, zOrder: -3 },
      { id: 'prop:led-core', model: 'prop.led_bar', x: -0.25, y: 2.8, zOrder: -3 },
      { id: 'hole', key: 'hole', model: 'door.devnull', x: -1.05, label: '/dev/null', when: (f) => f.phase1 },
      { id: 'door:portal', model: 'door.ethernet', x: 0.2, kind: 'door', target: 'exit', label: 'exit', when: (f) => f.portal },
    ],
    slots: {
      'energy.cell': { x: 3.88 },
      'energy2.cell': { x: 3.52 },
      'chaos.stream': { x: 3.05 },
      'core_dump.log': { x: 1.55, key: 'scroll' },
      'reality_anchor.conf': { x: 1.0 },
      'overlord.ko': { x: 0.2, key: 'boss' },
      'wakeup.sock': { x: -0.45, key: 'socket' },
    },
    caption: (f) => (f.portal ? 'The portal is open. Type exit.' : f.phase1 ? 'The shield is down. Wake yourself up.' : 'The overlord is still armed.'),
  },
};
