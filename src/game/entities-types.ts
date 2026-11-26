import type { KernelEvent, ProcState } from '../contracts/events.js';
import type { EnemyType, PickupType } from './bestiary.js';
import type { EnemySpawn } from './floors.js';
import type { VNode } from './tree.js';
import type { ActorState } from './types.js';

export type KillHow = Extract<KernelEvent, { type: 'ENEMY_KILLED' }>['how'];
export type ShownState = Extract<KernelEvent, { type: 'ENEMY_STATE' }>['state'];

export interface WorldHost {
  root(): VNode;
  cwdPath(): string;
  push(events: KernelEvent[], ev: KernelEvent): void;
  /** Damage the hero; returns terminal text (a death message when it kills). */
  hurt(amount: number, source: string, events: KernelEvent[]): string;
  /** False once the hero died (and maybe the floor reloaded) during the current call: stop at once. */
  alive(): boolean;
  /** KERNEL_OVERLORD phases broken so far, 0..3. */
  kernelPhase(): number;
  /** True while the tutorial runs: enemies hold their fire so a new player can read. */
  truce(): boolean;
  /** The fork bomb was frozen, thawed or killed (opens the elevator, records shortcuts). */
  bossDown(id: string, how: 'frozen' | 'thawed' | 'killed'): void;
}

export interface Enemy {
  id: string;
  type: EnemyType;
  model: string;
  boss: boolean;
  /** Spawned at runtime (zombie, virus copy): not counted in enemiesLeft / enemiesTotal. */
  minion: boolean;
  /** What the player types to target it: its file name, or its PID for zombies. */
  name: string;
  inode: number | null;
  /** Absolute path of the room it lives in when it has no file. */
  home: string;
  pid: number | null;
  ppid: number;
  user: 'dev' | 'root';
  hp: number;
  maxHp: number;
  dead: boolean;
  frozen: boolean;
  enraged: boolean;
  revealed: boolean;
  /** Ticks its port has been closed (worm). */
  sealed: number;
  clock: number;
  told: boolean;
  deathTicks: number;
  revealTick: number;
  port: number | null;
  buffer: number | null;
  bufferPath: string | null;
  helps: string | null;
  showIn: string[];
  family: number;
  /** Rooms it was in when it died (the stage plays the death there). */
  deathZone: string[];
  shown: ShownState;
  shownHp: number;
}

export interface Pickup {
  id: string;
  type: PickupType;
  model: string;
  inode: number;
  name: string;
  amount: number;
  collected: boolean;
}

export interface ProcRow {
  pid: number;
  ppid: number;
  name: string;
  user: string;
  cpu: number;
  state: ProcState;
  entityId?: string;
}

export interface SignalResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** What the stage needs to draw an enemy or a pickup in the current room. */
export interface EntityView {
  id: string;
  model: string;
  kind: 'enemy' | 'boss' | 'pickup';
  target: string;
  state: ActorState;
  hp?: number;
  maxHp?: number;
  pid?: number;
  /** Present but unseen (dotfile before the lantern, a worm sunk into its port). */
  unseen: boolean;
  label: string;
  locked?: boolean;
}

/** Breathing room after a floor loads or a backup restores you. */
export const GRACE_TICKS = 3;

/** Structural view of `World` used by `entities-combat.ts` so combat logic stays decoupled from `World` class definition. */
export interface WorldLike {
  readonly enemies: Enemy[];
  readonly pickups: Pickup[];
  cause: KillHow;
  notes: string[];
  ticks: number;
  grace: number;
  holdFire: boolean;
  nextPid: number;
  nextZombie: number;
  readonly host: WorldHost;
  node(path: string): VNode | null;
  file(e: Enemy): VNode | null;
  addEnemy(spec: EnemySpawn, minion?: boolean): Enemy;
  get(id: string): Enemy | undefined;
  drain(): string;
  enemyByInode(id: number): Enemy | undefined;
  enemyByPid(pid: number): Enemy | undefined;
  petrified(e: Enemy): boolean;
  sealedPort(e: Enemy): boolean;
  zone(e: Enemy): string[];
}
