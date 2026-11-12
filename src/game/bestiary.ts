/**
 * Game data for malware and pickups: models, damage, cadence and the Unix lesson each one teaches.
 * Attack cadences come from the animation sheets (ANIM_MALWARE_ACTING) so the stage's tells and the
 * kernel's damage ticks agree. Pure data: no VFS, no session state.
 */
import { ANIM_MALWARE_ACTING } from '../procgen/anim/acting.js';

export type EnemyType =
  | 'virus' | 'worm' | 'trojan' | 'bug' | 'exploit' | 'crack' | 'ransomware'
  | 'spyware' | 'rootkit' | 'zombie' | 'forkbomb' | 'kernel';

export type PickupType = 'energy' | 'ram' | 'ssd';

export interface EnemyInfo {
  type: EnemyType;
  /** procgen ModelCatalog id. */
  model: string;
  kind: 'enemy' | 'boss';
  hp: number;
  /** Damage per attack on the hero. 0 = it never hurts the hero by itself. */
  damage: number;
  /** Ticks between attacks (or between its indirect actions when damage is 0). 0 = never acts. */
  every: number;
  /** Short attack name carried by ENEMY_ATTACK. */
  attack: string;
  /** One line: how to beat it. Used by hints and `status`. */
  weakness: string;
  /** `man <type>` page. */
  man: string[];
}

/** Attack cadence from the animation sheet, or `fallback` when the sheet says 0 / has no entry. */
export function sheetCadence(model: string, fallback: number): number {
  const n = ANIM_MALWARE_ACTING[model]?.attackEveryTicks;
  return typeof n === 'number' && n > 0 ? n : fallback;
}

/** KERNEL_OVERLORD phase cadences (shielded, exposed, panic) from its sheet. */
export function kernelPhaseCadence(phase: number): number {
  const phases = ANIM_MALWARE_ACTING['boss.kernel']?.phases ?? [];
  const n = phases[Math.max(0, Math.min(phases.length - 1, phase))]?.attackEveryTicks;
  return typeof n === 'number' && n > 0 ? n : [3, 2, 1][phase] ?? 2;
}

/** Damage per kernel beam by phase: the beams get weaker and faster. */
export const KERNEL_PHASE_DAMAGE = [12, 6, 3] as const;

/** SIGTERM sent to the fork bomb: it traps the signal and lashes out. */
export const FORKBOMB_RAGE_DAMAGE = 18;
/** Zombies alive at once; the boss stops forking at this many. */
export const ZOMBIE_CAP = 3;
/** Sourcing a malware file: you ran it, it ran you. */
export const SOURCE_MALWARE_DAMAGE = 8;

export const BESTIARY: Record<EnemyType, EnemyInfo> = {
  bug: {
    type: 'bug', model: 'malware.bug', kind: 'enemy', hp: 1,
    damage: 1, every: sheetCadence('malware.bug', 1), attack: 'nip',
    weakness: 'it lives in the code: grep BUG <file>, then sed -i \'s/BUG/FIXED/\' <file>',
    man: [
      'BUG(6)  a software bug, the one you shipped on friday',
      'It lives in a line of source code and nips you every second while you stand next to it.',
      'kill only restarts the service (Restart=always). rm is refused: you cannot delete prod.',
      'Find it:   grep BUG prod.py      (or find . -name "*.py")',
      "Fix it:    sed -i 's/BUG/FIXED/' prod.py",
    ],
  },
  spyware: {
    type: 'spyware', model: 'malware.spyware', kind: 'enemy', hp: 1,
    damage: 2, every: sheetCadence('malware.spyware', 2), attack: 'flash',
    weakness: 'invisible to ls: ls -a or ps shows it, then rm it or kill its PID',
    man: [
      'SPYWARE(6)  a webcam drone that reports you to the agents',
      'It hides as a dotfile, so plain ls never shows it, but its process shows in ps.',
      'It flashes you every 2 seconds while you share a room.',
      'Find it:   ls -a   or   ps',
      'Kill it:   rm .spycam   or   kill <PID>',
    ],
  },
  rootkit: {
    type: 'rootkit', model: 'malware.rootkit', kind: 'enemy', hp: 1,
    damage: 0, every: 0, attack: 'hold',
    weakness: 'a hidden dotfile holding a door: ls -a reveals it, rm removes it',
    man: [
      'ROOTKIT(6)  a ghost hiding as a dotfile',
      'It does not bite. It holds doors shut and hides from ls and even from ps.',
      'Light the lantern with ls -a (or ls -la) and it shows. Then rm it by name.',
    ],
  },
  worm: {
    type: 'worm', model: 'malware.worm', kind: 'enemy', hp: 1,
    damage: 6, every: sheetCadence('malware.worm', 3), attack: 'burrow strike',
    weakness: 'kill its PID, or cut it off: chmod 000 on its port directory (it starves in 3 s)',
    man: [
      'WORM(6)  a network worm living in an open port',
      'It burrows out of its port directory and strikes anyone in the next room every 3 seconds.',
      'Kill it:      ps, then kill <PID>',
      'Or cut it off: chmod 000 port_445  (a closed port starves it in 3 seconds)',
      'A crack nearby will pick that lock open again. Deal with the crack first.',
    ],
  },
  crack: {
    type: 'crack', model: 'malware.crack', kind: 'enemy', hp: 1,
    damage: 0, every: 2, attack: 'lock pick',
    weakness: 'its binary is busy: find it with ps and kill the PID',
    man: [
      'CRACK(6)  a keygen that picks locks for other malware',
      'It never bites. Every 2 seconds it picks a closed port back open.',
      'rm says "Text file busy" while it runs.',
      'Catch it:  ps   then   kill <PID>',
    ],
  },
  trojan: {
    type: 'trojan', model: 'malware.trojan', kind: 'enemy', hp: 1,
    damage: 12, every: sheetCadence('malware.trojan', 3), attack: 'bite',
    weakness: 'chmod -x petrifies it; chmod +w then rm deletes it; kill only relaunches it',
    man: [
      'TROJAN(6)  a gift you installed yourself (stone_gargoyle.bin)',
      'While its file is executable it relaunches and bites every 3 seconds.',
      'Petrify:  chmod -x stone_gargoyle.bin',
      'Destroy:  chmod +w stone_gargoyle.bin && rm stone_gargoyle.bin',
      'kill is pointless: the binary just runs again.',
    ],
  },
  virus: {
    type: 'virus', model: 'malware.virus', kind: 'enemy', hp: 1,
    damage: 4, every: sheetCadence('malware.virus', 2), attack: 'spike burst',
    weakness: 'rm on a running virus splits it: kill -9 its PID first (that also kills its copies)',
    man: [
      'VIRUS(6)  self-copying code',
      'While its process runs, rm only makes it copy itself: one virus becomes two.',
      'It traps SIGTERM. SIGKILL cannot be trapped.',
      'Kill it:  ps   then   kill -9 <PID>     (its copies die with it)',
      'Or:       kill -STOP <PID>   then   rm virus.exe',
    ],
  },
  exploit: {
    type: 'exploit', model: 'malware.exploit', kind: 'enemy', hp: 1,
    damage: 12, every: sheetCadence('malware.exploit', 4), attack: 'overflow lunge',
    weakness: 'it runs as root, so kill fails: make its buffer read-only, chmod -w stack.buf',
    man: [
      'EXPLOIT(6)  a buffer overflow that escalated to root',
      'It pumps payload into stack.buf and lunges every 4 seconds. Signals: Operation not permitted.',
      'But the buffer is still yours. A read-only page makes it segfault:',
      '          chmod -w stack.buf      (or chmod 444 stack.buf)',
    ],
  },
  ransomware: {
    type: 'ransomware', model: 'malware.ransomware', kind: 'enemy', hp: 1,
    damage: 0, every: 4, attack: 'encrypt',
    weakness: 'it locks pickups with chmod 000: kill its PID, then chmod 644 the locked files',
    man: [
      'RANSOMWARE(6)  a padlock with a jaw',
      'It does not bite you. Every 4 seconds it encrypts a pickup in its room (mode 000).',
      'Kill it:     ps   then   kill <PID>',
      'Decrypt:     chmod 644 energy.cell     then   source energy.cell',
    ],
  },
  zombie: {
    type: 'zombie', model: 'malware.zombie', kind: 'enemy', hp: 1,
    damage: 4, every: sheetCadence('malware.zombie', 2), attack: 'swipe',
    weakness: 'killing one is useless, its parent forks more: kill -9 the parent PID',
    man: [
      'ZOMBIE(6)  a defunct child process',
      'Forked by necromancer_forkd. Each one swipes every 2 seconds.',
      'kill <PID> drops one, and the parent forks another.',
      'Reap them all:  kill -9 666',
    ],
  },
  forkbomb: {
    type: 'forkbomb', model: 'boss.forkbomb', kind: 'boss', hp: 1,
    damage: 0, every: sheetCadence('boss.forkbomb', 4), attack: 'fork()',
    weakness: 'kill -9 666 (or freeze it with kill -STOP 666). A polite kill only enrages it',
    man: [
      'NECROMANCER_FORKD(6)  the fork bomb, PID 666',
      'It forks a zombie_worker every 4 seconds while you are in the furnace hall.',
      'kill 666 (SIGTERM) is trapped: it gets angry and hits you.',
      'kill -STOP 666 freezes it.   kill -9 666 ends it and every zombie.',
    ],
  },
  kernel: {
    type: 'kernel', model: 'boss.kernel', kind: 'boss', hp: 3,
    damage: KERNEL_PHASE_DAMAGE[0], every: kernelPhaseCadence(0), attack: 'eye beam',
    weakness: 'PID 1 cannot be killed: break its three phases',
    man: [
      'KERNEL_OVERLORD(6)  PID 1, the core of the agents that pulled you in',
      'Signals do nothing to PID 1. Break it in three phases:',
      '  1. send chaos.stream to /dev/null       (mv chaos.stream /dev/null)',
      '  2. feed the wakeup token to wakeup.sock (grep "WAKEUP_TOKEN=" core_dump.log > wakeup.sock)',
      "  3. patch the anchor                      (sed -i 's/player_trapped=true/player_trapped=false/' reality_anchor.conf)",
      'Then: exit.',
    ],
  },
};

export interface PickupInfo {
  type: PickupType;
  model: string;
  amount: number;
  label(amount: number): string;
  /** What `cat <pickup>` prints. */
  blurb: string;
}

export const PICKUP_INFO: Record<PickupType, PickupInfo> = {
  energy: {
    type: 'energy', model: 'pickup.energy', amount: 25,
    label: (n) => `+${n}HP`,
    blurb: '#!/bin/energy\n# ENERGY CELL: restores 25 HP.\n# use: source <file>   (or: . <file>)\nexport HP="$HP+25"\n',
  },
  ram: {
    type: 'ram', model: 'pickup.ram', amount: 16,
    label: (n) => `+${n}GB RAM`,
    blurb: '#!/bin/dimm\n# RAM STICK: 16 GB. Every 16 GB adds 10 max HP (and heals 10).\n# use: source <file>\nexport MEM="$MEM+16G"\n',
  },
  ssd: {
    type: 'ssd', model: 'pickup.ssd', amount: 256,
    label: (n) => `+${n}GB SSD`,
    blurb: '#!/bin/ssd\n# SSD IMAGE: 256 GB = one backup. Die with a backup and you restore in place at half HP.\n# use: source <file>\nexport SWAP="$SWAP+256G"\n',
  },
};

/** Pickup type from a file name (`*.cell`, `*.dimm`, `*.img`). */
export function pickupTypeOf(name: string): PickupType | null {
  if (name.endsWith('.cell')) return 'energy';
  if (name.endsWith('.dimm')) return 'ram';
  if (name.endsWith('.img')) return 'ssd';
  return null;
}

/** GB of SSD that make one backup. */
export const SSD_PER_BACKUP = 256;
/** GB of RAM per +10 max HP. */
export const RAM_PER_STEP = 16;
export const BASE_MAX_HP = 100;

export function maxHpFor(ramGb: number): number {
  return BASE_MAX_HP + 10 * Math.floor(ramGb / RAM_PER_STEP);
}
