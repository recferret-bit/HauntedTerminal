import type { BattlePhase, KernelEvent } from '../contracts/events.js';
import type { ItemId } from '../contracts/inventory.js';
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
  /** Master volume of the in-game sounds, 0 to 1 (absent: 1). */
  volume?: number;
  /** Level mechanic is `hub`. Absent on the classic floors. */
  hub?: boolean;
  /** Level mechanic is `boss`. Absent on the classic floors. */
  bossLevel?: boolean;
  /** The level the hero is in, for the HUD level block and the Esc menu. */
  level?: LevelInfo;
  /** Minimal command-free tasks and goals for the centered `? Hint` dialog. */
  hintGoals?: HintGoals;
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
  /** Items he carries and the one in his hand (drives the HUD items strip). */
  inventory: { items: ItemId[]; held: ItemId | null };
  /** The running battle (turn-based combat), or null outside one. Classic floors never have one. */
  battle: BattleView | null;
  /** True while the level's opening Vibecoder + Kiro conversation is still playing (terminal locked, Skip Dialog shown). */
  openingDialog?: boolean;
}

/** Name, objective and win-rule checklist of the current level. Classic floors have an empty checklist. */
export interface LevelInfo {
  title: string;
  objective: string;
  checklist: { description: string; done: boolean }[];
  bugsLeft: number;
  bugsTotal: number;
}

/** One minimal task row inside the centered Hint dialog (never includes exact shell commands). */
export interface HintTask {
  label: string;
  done: boolean;
  kind?: 'task' | 'exit';
}

/** Command-free tasks and goal summary for the centered `? Hint` dialog. */
export interface HintGoals {
  title: string;
  goal: string;
  tasks: HintTask[];
  exitReady: boolean;
}

/** What the HUD and tools see of a battle (`src/game/battle.ts`). */
export interface BattleView {
  phase: Exclude<BattlePhase, 'idle'>;
  battle: number;
  /** Seconds left on the player's turn timer; null outside the player's turn. */
  secondsLeft: number | null;
  /** True while a hold (editor, laptop) stops the turn timer. */
  held: boolean;
  enemyIds: string[];
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
  /** Exit status of the last command of the line (0 = success). Set by the chapter session; tools read it. */
  code?: number;
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
