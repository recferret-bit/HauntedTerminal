import type { EntityView } from './entities.js';
import type { ActorKind, FloorId, LegacyActorKey } from './types.js';

export interface ViewThing {
  name: string;
  type: 'file' | 'dir' | 'symlink' | 'socket' | 'device';
  /** Directory (or link to one) the hero may enter now. */
  open: boolean;
  /** Set when this file is an enemy or pickup: the entity actor stands for it. */
  entity?: string;
}

export interface SceneFacts {
  floor: FloorId;
  cwd: string;
  ended: boolean;
  lantern: boolean;
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
  };
}

interface Slot {
  x: number;
  y?: number;
  key?: LegacyActorKey;
  model?: string;
  label?: string;
}

interface Prop {
  id: string;
  model: string;
  x: number;
  y?: number;
  key?: LegacyActorKey;
  kind?: ActorKind;
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
      { id: 'prop:tomb1', model: 'prop.tombstone', x: 4.7, label: 'FATAL' },
      { id: 'prop:tomb2', model: 'prop.tombstone', x: 4.15, label: 'FATAL' },
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
    props: [{ id: 'prop:capacitor', model: 'prop.capacitor', x: 4.6 }],
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
    props: [{ id: 'prop:capacitor', model: 'prop.capacitor', x: 4.75 }],
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
      { id: 'prop:fan', model: 'prop.fan', x: 4.7 },
      { id: 'prop:heatsink', model: 'prop.heatsink', x: 4.1 },
      { id: 'door:furnace_hall', model: 'door.hdmi', x: -0.95, kind: 'door', target: 'furnace_hall', label: 'furnace_hall (sealed)', when: (f) => !f.valveOpen },
    ],
    slots: {
      'energy.cell': { x: 3.4 },
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
      { id: 'hole', key: 'hole', model: 'door.devnull', x: -1.05, label: '/dev/null', when: (f) => f.phase1 },
      { id: 'door:portal', model: 'door.ethernet', x: 0.2, kind: 'door', target: 'exit', label: 'exit', when: (f) => f.portal },
    ],
    slots: {
      'energy.cell': { x: 4.6 },
      'energy2.cell': { x: 4.05 },
      'chaos.stream': { x: 3.35 },
      'core_dump.log': { x: 1.55, key: 'scroll' },
      'reality_anchor.conf': { x: 1.0 },
      'overlord.ko': { x: 0.2, key: 'boss' },
      'wakeup.sock': { x: -0.45, key: 'socket' },
    },
    caption: (f) => (f.portal ? 'The portal is open. Type exit.' : f.phase1 ? 'The shield is down. Wake yourself up.' : 'The overlord is still armed.'),
  },
  '/mnt/wires_and_chips': {
    hero: 2.5,
    props: [
      { id: 'prop:wires-left', model: 'prop.cables', x: 4.55, label: 'tangled ribbon wires' },
      { id: 'prop:chip-left', model: 'prop.chip', x: 3.75, label: 'burned silicon chip' },
      { id: 'prop:chip-right', model: 'prop.chip', x: -0.25, label: 'motherboard chip' },
      { id: 'prop:wires-right', model: 'prop.cables', x: -1.1, label: 'bus cables' },
    ],
    slots: {
      'kiro_story.txt': { x: 1.55, key: 'scroll' },
      'starter_ram_8gb.dimm': { x: 0.9 },
      'glitch_spark.exe': { x: 0.25 },
      hub_uplink: { x: -0.75, key: 'gate', model: 'door.ethernet' },
    },
  },
  '/srv/kiroween/cache_vault': {
    hero: 2.5,
    props: [
      { id: 'prop:cache-chip', model: 'prop.chip', x: 4.55, label: 'cache controller' },
      { id: 'prop:cache-cables', model: 'prop.cables', x: 3.85, label: 'vault bus' },
    ],
    slots: {
      'ollama_bus.conf': { x: 1.65, key: 'scroll' },
      'ram_16gb.dimm': { x: 1.05 },
      'gpu_tensor_chip_01.img': { x: 0.45 },
      '.agy_spycam': { x: -0.25 },
      gpu_alley: { x: -0.95, key: 'gate', model: 'door.ethernet' },
    },
  },
  '/srv/kiroween/gpu_alley': {
    hero: 2.5,
    props: [
      { id: 'prop:gpu-heatsink', model: 'prop.heatsink', x: 4.55, label: 'vram heatsink' },
    ],
    slots: {
      vram_crate: { x: 3.75, model: 'door.usb' },
      port_445: { x: 3.15, model: 'door.usb' },
      'ram_16gb.dimm': { x: 1.65 },
      'gpu_shader_core_01.img': { x: 1.05 },
      'keygen.exe': { x: 0.25 },
      server_hub_1: { x: -0.88, key: 'gate', model: 'door.ethernet' },
    },
  },
  '/srv/kiroween/gpu_alley/vram_crate': {
    hero: 2.4,
    props: [
      { id: 'prop:vram-chip', model: 'prop.chip', x: 4.35, label: 'GDDR6X bank' },
    ],
    slots: {
      'vram_manifest.txt': { x: 1.2, key: 'scroll' },
    },
  },
  '/srv/kiroween/gpu_alley/port_445': {
    hero: 2.4,
    props: [
      { id: 'prop:port-cables', model: 'prop.cables', x: 4.35, label: 'SMB port wires' },
    ],
    slots: {
      'worm.bin': { x: 0.4 },
    },
  },
  '/srv/kiroween/ui_dashboard': {
    hero: 2.5,
    props: [
      { id: 'prop:ui-crt', model: 'prop.crt', x: 4.55, label: 'telemetry monitor' },
    ],
    slots: {
      'index.html': { x: 3.85, key: 'scroll' },
      'storefront.css': { x: 3.25 },
      'ram_16gb.dimm': { x: 1.65 },
      'gpu_tensor_chip_02.img': { x: 1.05 },
      'css_gremlin.bug': { x: 0.35 },
      logic_cell: { x: -0.88, key: 'gate', model: 'door.ethernet' },
    },
  },
  '/srv/kiroween/logic_cell': {
    hero: 2.5,
    props: [
      { id: 'prop:logic-chip', model: 'prop.chip', x: 4.55, label: 'ALU logic die' },
    ],
    slots: {
      'cart.js': { x: 1.65, key: 'scroll' },
      'ram_16gb.dimm': { x: 1.05 },
      'gpu_shader_core_02.img': { x: 0.45 },
      'token_skimmer.bin': { x: -0.25, key: 'gargoyle' },
      server_hub_2: { x: -0.95, key: 'gate', model: 'door.ethernet' },
    },
  },
  '/srv/kiroween/docker_forge': {
    hero: 2.5,
    props: [
      { id: 'prop:forge-fan', model: 'prop.fan', x: 4.55, label: 'forge blower' },
    ],
    slots: {
      'server.js': { x: 3.85 },
      Dockerfile: { x: 3.25, key: 'scroll' },
      'ram_16gb.dimm': { x: 1.65 },
      'gpu_tensor_chip_03.img': { x: 1.05 },
      'ransom.exe': { x: 0.35 },
      compose_furnace: { x: -0.95, key: 'gate', model: 'door.ethernet' },
    },
  },
  '/srv/kiroween/compose_furnace': {
    hero: 2.5,
    props: [
      { id: 'prop:compose-heatsink', model: 'prop.heatsink', x: 4.65, label: 'furnace heatsink' },
    ],
    slots: {
      'proxy.buf': { x: 4.1, key: 'scroll' },
      'docker-compose.yml': { x: 3.55 },
      'ram_16gb.dimm': { x: 1.85 },
      'gpu_h100_core_03.img': { x: 1.35 },
      'port_hijack.bin': { x: 0.8 },
      server_hub_3: { x: -1.05, key: 'gate', model: 'door.ethernet' },
    },
  },
  '/home/dev': {
    hero: 2.5,
    props: [
      { id: 'prop:matrix-crt', model: 'prop.crt', x: 4.45, label: 'matrix server CRT' },
      { id: 'prop:server-cables', model: 'prop.cables', x: 3.75, label: 'open-weights bus' },
    ],
    slots: {
      'briefing.md': { x: 1.65, key: 'scroll' },
      'server_rack.conf': { x: 1.65, key: 'scroll' },
      'open_weights_node2.conf': { x: 1.65, key: 'scroll' },
      'open_weights_cluster.conf': { x: 1.65, key: 'scroll' },
      'spare_ram_16gb.dimm': { x: 1.05 },
      'hank.tty.sock': { x: 0.35, key: 'socket' },
      'dad.tty.sock': { x: 0.55, key: 'socket' },
      staging_repo: { x: -0.82, key: 'gate', model: 'door.ethernet' },
      sector_ui_grid: { x: -0.82, key: 'gate', model: 'door.ethernet' },
      sector_docker_forge: { x: -0.82, key: 'gate', model: 'door.ethernet' },
      claude_kernel_core: { x: -0.82, key: 'gate', model: 'door.ethernet' },
    },
  },
  '/srv/byterig/checkout_core': {
    hero: 2.35,
    slots: {
      'energy.cell': { x: 4.55 },
      'hank.tty.sock': { x: 3.75, key: 'socket' },
      'chaos_webhook.stream': { x: 1.62 },
      'stripe_audit.log': { x: 1.18, key: 'scroll' },
      'checkout_anchor.conf': { x: 0.74 },
      'payment_verify.sock': { x: 0.15, key: 'socket' },
      'slop_supervisor.ko': { x: -0.65, key: 'boss' },
    },
  },
  '/sys/claude_overlord_core': {
    hero: 2.3,
    slots: {
      'dad.tty.sock': { x: 4.25, key: 'socket' },
      'energy.cell': { x: 3.42 },
      'claude_prompt_flood.stream': { x: 1.62 },
      'open_weights_advisor.log': { x: 1.22, key: 'scroll' },
      'core_anchor.conf': { x: 0.82 },
      'kiro_override.sock': { x: 0.25, key: 'socket' },
      'claude_overlord.ko': { x: -0.45, key: 'boss' },
    },
  },
};
