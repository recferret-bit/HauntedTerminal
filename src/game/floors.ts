import type { EnemyType, PickupType } from './bestiary.js';
import { makeNode, makeRoot, resolve, type VNode } from './tree.js';

function dir(parent: VNode, name: string, mode = 0o755): VNode {
  return makeNode(parent, name, 'dir', mode);
}

function file(parent: VNode, name: string, content: string, mode = 0o644, quest = false): VNode {
  const node = makeNode(parent, name, 'file', mode);
  node.content = content;
  node.questCritical = quest;
  return node;
}

function sock(parent: VNode, name: string): VNode {
  return makeNode(parent, name, 'socket', 0o666);
}

function link(parent: VNode, name: string, target: string): VNode {
  const node = makeNode(parent, name, 'symlink', 0o777);
  node.link = target;
  return node;
}

function root0(node: VNode): VNode {
  node.uid = 0;
  return node;
}

function at(root: VNode, path: string): VNode {
  const found = resolve(root, path, false).node;
  if (!found) throw new Error(`floor path missing: ${path}`);
  return found;
}

/** An enemy placed on a floor. Its file (if any) is created by the floor builder at `path`. */
export interface EnemySpawn {
  /** Stable entity id; equals the RoomActor id and the event entityId. */
  id: string;
  type: EnemyType;
  /** Absolute path of its file. Bosses whose room is created later still have one. */
  path: string;
  pid?: number;
  ppid?: number;
  /** Starts unseen (dotfile): `ls -a` (and `ps`, for processes that are not rootkits) reveals it. */
  hidden?: boolean;
  /** Worm: absolute path of the port directory it lives in. */
  port?: string;
  /** Exploit: absolute path of the buffer it overflows. */
  buffer?: string;
  /** Crack: id of the enemy whose port it keeps picking open. */
  helps?: string;
  /** Extra rooms (absolute paths) where it is drawn, e.g. the mimic seen from the hall. */
  showIn?: string[];
}

export interface PickupSpawn {
  id: string;
  type: PickupType;
  path: string;
  /** Starts encrypted (mode 000) by ransomware. */
  locked?: boolean;
}

export interface FloorTree {
  root: VNode;
  cwd: string;
  enemies: EnemySpawn[];
  pickups: PickupSpawn[];
}

export function buildFloor(floor: 1 | 2 | 3 | 4 | 5): FloorTree {
  if (floor === 1) return floor1();
  if (floor === 2) return floor2();
  if (floor === 3) return floor3();
  if (floor === 4) return floor4();
  return floor5();
}

export const FLOOR_TITLES: Record<number, string> = {
  1: 'The Storage Attic',
  2: 'The Firewall Crypt',
  3: 'The Mirror Bus Maze',
  4: 'The CPU Furnace',
  5: 'The Kernel Core',
};

export const FLOOR_PATHS: Record<number, string> = {
  1: '/home/dev/nightmare_workspace',
  2: '/var/dungeon',
  3: '/usr/local/labyrinth',
  4: '/proc_mansion/boiler_room',
  5: '/sys/kernel/panic_chamber',
};

const ENERGY = '#!/bin/energy\n# ENERGY CELL. source me.\n';
const RAM = '#!/bin/dimm\n# 16 GB DDR5. source me.\n';
const SSD = '#!/bin/ssd\n# 256 GB backup image. source me.\n';

function floor1(): FloorTree {
  const root = makeRoot();
  const home = dir(root, 'home');
  const dev = dir(home, 'dev');
  const work = dir(dev, 'nightmare_workspace');
  const desk = dir(work, 'desk');
  file(desk, 'todo.note', [
    'TODO (3:07 AM, prod is on fire, the agents are watching):',
    ' 1. the bug from prod.py crawled out and bites. find it:  grep BUG prod.py',
    "    patch it in place:  sed -i 's/BUG/FIXED/' prod.py",
    ' 2. that RAM stick looks useful:  source ram_16gb.dimm',
    ' 3. the hatch out of here is one directory up:  cd ..',
    '',
  ].join('\n'));
  file(desk, 'prod.py', [
    '# prod.py :: deployed friday 17:59, untested',
    'RETRIES = 3',
    'while RETRIES:',
    '    deploy()   # BUG: RETRIES never goes down',
    '',
  ].join('\n'));
  file(desk, 'ram_16gb.dimm', RAM);
  file(work, 'readme.txt', [
    'WELCOME, NEW WORKER.',
    'The agents need hands. You have two. Every command you type is a step or a swing.',
    'The hatch does not open for the polite. Ask the intercom.',
    '',
  ].join('\n'));
  sock(work, 'intercom.sock');
  file(work, '.poltergeist.lock', 'spirit\nholding: cellar_hatch\n');
  file(work, '.spycam', 'REC * frame 0001: worker idle\nREC * frame 0002: worker idle\n');
  file(work, 'energy.cell', ENERGY);
  dir(work, 'cellar_hatch');
  const bay = dir(work, 'drive_bay');
  file(bay, 'ssd_256gb.img', SSD);
  file(bay, 'labels.txt', 'bay 0: backups\nbay 1: empty since the lightning\n');
  const base = '/home/dev/nightmare_workspace';
  return {
    root,
    cwd: `${base}/desk`,
    enemies: [
      { id: 'f1-bug', type: 'bug', path: `${base}/desk/prod.py`, pid: 3003 },
      { id: 'f1-spycam', type: 'spyware', path: `${base}/.spycam`, pid: 1984, hidden: true },
      { id: 'f1-poltergeist', type: 'rootkit', path: `${base}/.poltergeist.lock`, pid: 6, hidden: true },
    ],
    pickups: [
      { id: 'f1-ram', type: 'ram', path: `${base}/desk/ram_16gb.dimm` },
      { id: 'f1-energy', type: 'energy', path: `${base}/energy.cell` },
      { id: 'f1-ssd', type: 'ssd', path: `${base}/drive_bay/ssd_256gb.img` },
    ],
  };
}

function floor2(): FloorTree {
  const root = makeRoot();
  const dungeon = dir(dir(root, 'var'), 'dungeon');
  const entrance = dir(dungeon, 'entrance');
  const gate = dir(entrance, 'iron_gate', 0);
  file(gate, 'heavy_plank.tar', 'oak\n', 0o644, true);
  file(gate, 'stone_gargoyle.bin', '\x7fELF gargoyle :: a gift for you. run me.\n', 0o555);
  file(gate, 'energy.cell', ENERGY);
  const chasm = dir(gate, 'chasm');
  dir(chasm, 'crypt_stairs');
  file(chasm, 'ram_16gb.dimm', RAM);
  const chronicles = dir(entrance, 'chronicles');
  file(chronicles, 'day1.log', 'boot ok\nFATAL seal cracked\nnote\nFATAL second bell\n', 0o644, true);
  file(chronicles, 'day2.log', 'FATAL the third\nok\n', 0o644, true);
  file(chronicles, 'day3.log', 'warn\nFATAL four\nFATAL five\nFATAL six\n', 0o644, true);
  file(chronicles, 'energy.cell', ENERGY);
  sock(entrance, 'archivist_gate.sock');
  const port = dir(entrance, 'port_445');
  file(port, 'worm.bin', '\x7fELF worm v4.45 :: spreading via port_445\n', 0o755);
  file(entrance, 'keygen.exe', '\x7fELF keygen :: picks any lock. *chiptune*\n', 0o755);
  const base = '/var/dungeon/entrance';
  return {
    root,
    cwd: base,
    enemies: [
      { id: 'f2-worm', type: 'worm', path: `${base}/port_445/worm.bin`, pid: 445, port: `${base}/port_445` },
      { id: 'f2-keygen', type: 'crack', path: `${base}/keygen.exe`, pid: 1337, helps: 'f2-worm' },
      { id: 'f2-gargoyle', type: 'trojan', path: `${base}/iron_gate/stone_gargoyle.bin`, pid: 3133 },
    ],
    pickups: [
      { id: 'f2-energy-logs', type: 'energy', path: `${base}/chronicles/energy.cell` },
      { id: 'f2-energy-hall', type: 'energy', path: `${base}/iron_gate/energy.cell` },
      { id: 'f2-ram', type: 'ram', path: `${base}/iron_gate/chasm/ram_16gb.dimm` },
    ],
  };
}

function floor3(): FloorTree {
  const root = makeRoot();
  const labyrinth = dir(dir(dir(root, 'usr'), 'local'), 'labyrinth');
  const cell = dir(dir(dir(labyrinth, 'wing_a'), 'floor_3'), 'cell_9');
  const target = '/usr/local/labyrinth/wing_a/floor_3/cell_9';
  link(cell, 'north_exit', target);
  link(cell, 'east_exit', target);
  link(cell, 'south_exit', target);
  file(cell, 'energy.cell', ENERGY);
  const pedestal = dir(labyrinth, 'pedestal');
  file(pedestal, '.mimic', 'teeth\n');
  sock(labyrinth, 'pressure_plate.sock');
  file(labyrinth, 'virus.exe', '\x7fELF virus :: copy me, copy me, copy me\n', 0o755);
  const slots = dir(labyrinth, 'ram_slots');
  root0(file(slots, 'overflow.bin', '\x7fELF exploit :: uid=0(root) gid=0(root)\n', 0o755));
  file(slots, 'stack.buf', 'AAAAAAAA\n', 0o666);
  file(slots, 'ram_16gb.dimm', RAM);
  file(slots, 'ssd_256gb.img', SSD);
  const base = '/usr/local/labyrinth';
  return {
    root,
    cwd: target,
    enemies: [
      { id: 'f3-virus', type: 'virus', path: `${base}/virus.exe`, pid: 404 },
      { id: 'f3-exploit', type: 'exploit', path: `${base}/ram_slots/overflow.bin`, pid: 1024, buffer: `${base}/ram_slots/stack.buf` },
      { id: 'f3-mimic', type: 'rootkit', path: `${base}/pedestal/.mimic`, hidden: true, showIn: [base] },
    ],
    pickups: [
      { id: 'f3-energy-cell', type: 'energy', path: `${target}/energy.cell` },
      { id: 'f3-ram', type: 'ram', path: `${base}/ram_slots/ram_16gb.dimm` },
      { id: 'f3-ssd', type: 'ssd', path: `${base}/ram_slots/ssd_256gb.img` },
    ],
  };
}

/** Pickup placed when the altar opens the hidden wing (the wing must not exist before: `find` is the puzzle). */
export const F3_WING_PICKUP: PickupSpawn = { id: 'f3-energy-wing', type: 'energy', path: '/usr/local/labyrinth/hidden_wing/energy.cell' };
export const F3_WING_ENERGY = ENERGY;

function floor4(): FloorTree {
  const root = makeRoot();
  const room = dir(dir(root, 'proc_mansion'), 'boiler_room');
  const catwalk = dir(room, 'catwalk');
  sock(catwalk, 'valve_lock.sock');
  file(catwalk, 'boiler.dump', 'TEMP=910\nWARN drift\nPASS=9042_ECANRUF\nSTATUS=UNSTABLE\n', 0o644, true);
  file(catwalk, 'ransom.exe', '\x7fELF ransomware :: YOUR FILES ARE MINE. 1 BTC.\n', 0o755);
  file(catwalk, 'energy.cell', 'ENCRYPTED BY ransom.exe. PAY 1 BTC.\n', 0);
  file(catwalk, 'ram_16gb.dimm', RAM);
  const hall = dir(room, 'furnace_hall', 0);
  root0(file(hall, 'necromancer_forkd', '\x7fELF :(){ :|:& };:\n', 0o755));
  file(hall, 'energy.cell', ENERGY);
  file(hall, 'ssd_256gb.img', SSD);
  const base = '/proc_mansion/boiler_room';
  return {
    root,
    cwd: `${base}/catwalk`,
    enemies: [
      { id: 'f4-ransom', type: 'ransomware', path: `${base}/catwalk/ransom.exe`, pid: 7777 },
      { id: 'f4-necromancer', type: 'forkbomb', path: `${base}/furnace_hall/necromancer_forkd`, pid: 666 },
    ],
    pickups: [
      { id: 'f4-energy-catwalk', type: 'energy', path: `${base}/catwalk/energy.cell`, locked: true },
      { id: 'f4-ram', type: 'ram', path: `${base}/catwalk/ram_16gb.dimm` },
      { id: 'f4-energy-hall', type: 'energy', path: `${base}/furnace_hall/energy.cell` },
      { id: 'f4-ssd', type: 'ssd', path: `${base}/furnace_hall/ssd_256gb.img` },
    ],
  };
}

function floor5(): FloorTree {
  const root = makeRoot();
  const chamber = dir(dir(dir(root, 'sys'), 'kernel'), 'panic_chamber');
  file(chamber, 'chaos.stream', 'stderr stderr stderr\n');
  const junk = [
    'core panic 0x00',
    'stack junk',
    'page fault',
    'inode storm',
    'WAKEUP_TOKEN=LIGHTNING_777',
    'orphan page',
    'soft lockup',
    'rcu stall',
    'lost ticks',
    'hung task',
    'nmi watchdog',
    'slab leak',
    'dma fault',
    'irq storm',
    'null deref',
    'end dump',
  ];
  file(chamber, 'core_dump.log', `${junk.join('\n')}\n`, 0o644, true);
  sock(chamber, 'wakeup.sock');
  file(chamber, 'reality_anchor.conf', 'anchor=core\nplayer_trapped=true\nvoltage=storm\n', 0o644, true);
  root0(file(chamber, 'overlord.ko', '\x7fELF KERNEL_OVERLORD :: the agents\' core. workers: 1\n', 0o400));
  file(chamber, 'energy.cell', ENERGY);
  file(chamber, 'energy2.cell', ENERGY);
  const base = '/sys/kernel/panic_chamber';
  return {
    root,
    cwd: base,
    enemies: [
      { id: 'f5-kernel', type: 'kernel', path: `${base}/overlord.ko`, pid: 1, ppid: 0 },
    ],
    pickups: [
      { id: 'f5-energy-a', type: 'energy', path: `${base}/energy.cell` },
      { id: 'f5-energy-b', type: 'energy', path: `${base}/energy2.cell` },
    ],
  };
}

export function must(root: VNode, path: string): VNode {
  return at(root, path);
}
