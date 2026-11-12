import type { KernelEvent } from '../contracts/events.js';
import type {
  ActorKind, ActorState, LegacyActorKey, NeighborPanel, RoomActor, RoomKind, RoomView,
} from '../contracts/room-view.js';

export type { ActorKind, ActorState, LegacyActorKey, NeighborPanel, RoomActor, RoomKind, RoomView };

export interface GameSnapshot {
  cwd: string;
  floor: 1 | 2 | 3 | 4 | 5;
  hp: number;
  maxHp: number;
  commands: number;
  prompt: string;
  promptGold: boolean;
  muted: boolean;
  ended: boolean;
  rank: 'C' | 'B' | 'A' | 'S' | null;
  timeSec: number;
  shortcuts: string[];
  room: RoomView;
  intro: boolean;
  /** GB of RAM collected (pickup.ram). Each 16 GB raises maxHp by 10. Persists across floors. */
  ram: number;
  /** GB of SSD collected (pickup.ssd). 256 GB = one backup: death restores you in place instead of restarting the floor. */
  ssd: number;
  /** Whole backups available (floor(ssd / 256)). */
  backups: number;
  /** True while the game clock is paused (intro, floor title cards, outro). Ticks do nothing. */
  paused: boolean;
  /** Enemies still alive on this floor / in total on this floor. */
  enemiesLeft: number;
  enemiesTotal: number;
  /** The current tutorial prompt (floor 1 arrival), or null once it is finished or skipped. */
  tutorial: TutorialState | null;
}

export interface TutorialState {
  step: number;
  total: number;
  agent: 'clod' | 'gork' | 'codec' | 'antigravy' | 'kiro';
  prompt: string;
  command: string;
}

export interface CommandResult {
  /** Everything the command printed, stdout and stderr interleaved in order. */
  output: string;
  /** Only the error text (also contained in `output`), so the terminal can colour it. */
  stderr?: string;
  events: KernelEvent[];
  snapshot: GameSnapshot;
  clear?: boolean;
}

export interface TickResult {
  output: string;
  /** Only the error text (also contained in `output`). */
  stderr?: string;
  events: KernelEvent[];
  snapshot: GameSnapshot;
}

export type FloorId = 1 | 2 | 3 | 4 | 5;
