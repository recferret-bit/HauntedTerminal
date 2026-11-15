import type { EnemySpawn, PickupSpawn } from './floors.js';
import type { Session } from './session.js';
import type { FloorId, RoomActor, TickResult } from './types.js';

/**
 * Types of the tool-only session features (the Terminal Lab). A session created with `lab` is a lab session:
 * nobody takes damage, the clock can be manual, and the extra content below is live. A game session has `lab: null`.
 */

/**
 * A text pattern: plain text matches as a substring (riddle answers: the exact text). `re:<regex>` or `re:/<regex>/<flags>`
 * is a regular expression. The prefix is explicit so a path such as `/dev/null` stays plain text.
 */
export type LabPattern = string;

/** A talking socket: `cat` prints the prompt, writing the answer to it solves it. */
export interface LabRiddle {
  id: string;
  /** Absolute path of the socket. */
  path: string;
  speaker: string;
  prompt: string;
  answer: LabPattern;
  /** One line per wrong attempt, the last repeated. */
  hints: string[];
  success: string;
  /** Absolute path of a door that opens when the riddle is solved. */
  opens?: string;
  /** Commands the speech bubble highlights. */
  tokens: string[];
}

/** What a lab check watches for. `ran`, `output`, `code` and `event` latch: once seen, they stay passed. */
export type LabCond =
  | { kind: 'ran'; pattern: LabPattern }
  | { kind: 'output'; pattern: LabPattern }
  | { kind: 'code'; code: number; line?: LabPattern }
  | { kind: 'event'; type: string }
  | { kind: 'file'; path: string; contains?: LabPattern; absent?: boolean }
  | { kind: 'riddle'; riddleId: string };

export interface LabCheckSpec {
  id: string;
  description: string;
  when: LabCond;
}

export interface LabContent {
  riddles: LabRiddle[];
  checks: LabCheckSpec[];
  /** Ids of the level's win rules, in order (the lab calls them tasks). */
  taskIds: string[];
}

export interface ClassicLabFile {
  path: string;
  kind: 'file' | 'dir' | 'socket';
  mode?: number;
  uid?: number;
  questCritical?: boolean;
  content?: string;
}

/** Classic-driver lab payload (`src/game/session.ts`), stored inside `LabConfig` when `driver === 'classic'`. */
export interface ClassicLabSpec {
  floor: FloorId;
  cwd?: string;
  ram: number;
  ssd: number;
  core: string;
  enemyFire: 'live' | 'hold';
  files: ClassicLabFile[];
  enemies: EnemySpawn[];
  pickups: PickupSpawn[];
}

/** Everything a lab adds to a session. The lab page writes it next to the draft pack; the game reads it with `?lab=1`. */
export interface LabConfig {
  /** `manual`: the world moves on commands and `labTick()` only. `live`: one tick per second, like the game. */
  clock: 'manual' | 'live';
  /** Visual props appended to the room view (no file behind them). */
  extraActors: RoomActor[];
  content: LabContent;
  /** Present when the lab runs on classic floors (`src/game/session.ts`) instead of `ChapterSession`. */
  classic?: ClassicLabSpec;
}

/** Per-level lab state. It lives on the level/floor runtime, so a floor reload starts it over. */
export interface LabLevelState {
  /** Damage absorbed by the invulnerable player, per source name. */
  absorbed: Record<string, number>;
  /** Ids of solved riddles. */
  solved: Set<string>;
  /** Wrong answers per riddle id. */
  attempts: Record<string, number>;
  /** Ids of latched checks that were seen to pass. */
  hits: Set<string>;
}

export function freshLabLevelState(): LabLevelState {
  return { absorbed: {}, solved: new Set(), attempts: {}, hits: new Set() };
}

/** One VFS node as `inspect()` reports it. */
export interface LabNode {
  /** Inode id: what a speech bubble anchors on. */
  id: number;
  name: string;
  path: string;
  kind: 'file' | 'dir' | 'socket' | 'symlink' | 'device';
  mode: number;
  uid: number;
  content?: string;
  children?: LabNode[];
}

/** One enemy or pickup as `inspect()` reports it. */
export interface LabEntity {
  id: string;
  model: string;
  kind: 'enemy' | 'boss' | 'pickup';
  target: string;
  /** The animation state the stage shows (`World.stateOf`). */
  state: string;
  hp?: number;
  maxHp?: number;
  pid?: number;
  unseen: boolean;
  /** Enemies only: the attack clock, and the cadence in ticks (0 = never attacks). */
  clock?: number;
  every?: number;
  /** Enemies only: ticks until its next ENEMY_ATTACK (1 = the next tick), or null when it will not attack. */
  attackIn?: number | null;
}

/** A thing to do in a lab level and whether it is done: a task (win rule), a check, or a riddle. */
export interface LabGoal {
  id: string;
  kind: 'task' | 'check' | 'riddle';
  description: string;
  done: boolean;
  /** Riddles only: wrong answers so far. */
  attempts?: number;
}

export interface LabInspect {
  levelId: string;
  cwd: string;
  hp: number;
  maxHp: number;
  /** Hostile processes still alive (the HUD's BUGS counter). */
  enemiesLeft: number;
  /** Damage absorbed by the invulnerable player, per source name. */
  absorbed: Record<string, number>;
  absorbedTotal: number;
  tree: LabNode;
  /** The last answer written to each socket, by socket name. */
  sockets: Record<string, string>;
  filesRead: string[];
  entities: LabEntity[];
  goals: LabGoal[];
}

/** What `inject()` adds to a running level. `files` are created first (an enemy and a pickup need theirs). */
export interface LabInjection {
  files?: Array<{ path: string; kind: 'file' | 'dir' | 'socket'; mode?: number; uid?: number; content?: string }>;
  enemy?: EnemySpawn;
  pickup?: PickupSpawn;
}

/** Common tool hooks implemented by both `ChapterSession` and classic `Session`. */
export interface LabSession extends Session {
  inspect(): LabInspect;
  labTick(): TickResult;
  inject(what: LabInjection): TickResult;
}

export function isLabSession(session: Session): session is LabSession {
  return typeof (session as Partial<LabSession>).inspect === 'function';
}
