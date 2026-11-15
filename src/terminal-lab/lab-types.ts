import type { RoomKind } from '../contracts/room-view.js';
import type { KernelEvent } from '../contracts/events.js';
import type { LabCond } from '../chapters/session-lab-types.js';
import type { LevelEnemySpec, LevelFileSpec, LevelPatchChip, LevelPickupSpec, ChapterMechanic, ScriptAgent, ScriptMood, ScriptStep, WinRule } from '../chapters/types.js';

export type { LabCond };

/** The `dialogue` script step without its tag: a bubble anchored on a socket. */
export type LabDialogue = Omit<Extract<ScriptStep, { kind: 'dialogue' }>, 'kind'>;

/**
 * The lab script: one JSON document (`*.lab.json`) that is the single source of truth of a lab.
 * `setup` builds the scene, `steps` drives it. The lab compiles `setup` into a throwaway one-level pack and never writes a spec.
 * Add a setup op here, build it once in `lab-pack.ts`, describe it in `schema.ts`, list it in `catalog.ts` if it is placeable.
 */
export type LabDriverKind = 'chapter' | 'classic';

export interface LabRoom {
  roomKind: RoomKind;
  floorTheme: 1 | 2 | 3 | 4 | 5;
  mechanic: ChapterMechanic;
  cwd: string;
  title: string;
  summary: string;
}

/** What the player already owns when the lab starts. */
export interface LabPlayer {
  ram: number;
  ssd: number;
  /** Open-weight core loaded into Kiro (`qwen`, `mistral`, ...). Empty for the tiny default core. */
  core: string;
}

/** One thing in the scene. Files, enemies, pickups and patches reuse the chapter spec records, so they behave exactly like level data. */
export type LabSetupOp =
  | ({ op: 'file' } & Omit<LevelFileSpec, 'kind'>)
  | ({ op: 'dir' } & Pick<LevelFileSpec, 'path' | 'mode' | 'uid'>)
  | ({ op: 'socket' } & Pick<LevelFileSpec, 'path' | 'content' | 'mode' | 'uid'>)
  | ({ op: 'enemy' } & LevelEnemySpec)
  | ({ op: 'pickup' } & LevelPickupSpec)
  | ({ op: 'patch' } & LevelPatchChip)
  /** A visual prop with no file behind it (any `ModelCatalog` id). `x` is the stage position; the room spans about -1 to 5. */
  | { op: 'prop'; id: string; model: string; x: number; y?: number; label?: string }
  /** An agent cameo that speaks when the level starts. */
  | { op: 'npc'; agent: ScriptAgent; mood: ScriptMood; text: string; print?: string }
  /** The level's taunt when it starts. The agent is the one the text begins with (`CLAUDE: ...`, `KIRO: ...`). */
  | { op: 'taunt'; mood: ScriptMood; text: string; print?: string }
  /** A speech bubble anchored on a socket when the level starts. */
  | ({ op: 'dialogue' } & LabDialogue)
  /** A talking socket. `cat` prints the prompt; writing the answer to it solves it. */
  | { op: 'riddle'; id: string; path: string; prompt: string; answer: string; speaker?: string; hints?: string[]; success?: string; opens?: string; tokens?: string[] }
  /** A game win rule (a task of the level): the checklist, the exit gate, the code validators. */
  | { op: 'task'; id: string; rule: WinRule }
  /** A lab-only condition that is watched live: a command ran, some output, an exit code, an event, a file, a solved riddle. */
  | { op: 'check'; id: string; description: string; when: LabCond };

export type LabSetupKind = LabSetupOp['op'];

/** Snapshot predicate of an `expect`. Every key is optional; all given keys must hold. */
export interface LabExpect {
  code?: number;
  /** Substring, or a `re:` regular expression (`LabPattern`). */
  stdout?: string;
  stderr?: string;
  /** Event types that must appear / must not appear in this step. */
  events?: string[];
  noEvents?: string[];
  cwd?: string;
  enemiesLeft?: number;
  absorbed?: { min?: number; max?: number };
  file?: { path: string; contains?: string; absent?: boolean };
}

/** What a step does. Every step may carry a `note` for the person reading the script. */
export type LabStepAction =
  /** Type a line in the terminal, exactly as Enter does. */
  | { op: 'run'; line: string; expect?: LabExpect }
  /** Advance the world `n` ticks (default 1). */
  | { op: 'tick'; n?: number; expect?: LabExpect }
  /** Fire a raw event on the stage and the terminal. The game rules do not change. */
  | { op: 'emit'; event: KernelEvent }
  /** Put a new enemy or pickup into the running level. */
  | { op: 'inject'; enemy?: LevelEnemySpec; pickup?: LevelPickupSpec }
  /** An agent cameo speaks. */
  | { op: 'say'; agent: ScriptAgent; mood: ScriptMood; text: string }
  /** The taunt line, spoken by the agent the text begins with. */
  | { op: 'taunt'; mood: ScriptMood; text: string }
  /** A speech bubble anchored on a socket. */
  | ({ op: 'dialogue' } & LabDialogue)
  /** Asserts a task, check or riddle by id: `pass` (default) or `fail`. */
  | { op: 'check'; id: string; is?: 'pass' | 'fail' }
  /** Wait on the live clock. Skipped in headless runs, where time does not pass by itself. */
  | { op: 'wait'; ms: number }
  /** Check the state now (`cwd`, `enemiesLeft`, `file`, `absorbed`) and the previous step (`stdout`, `stderr`, `code`, `events`). */
  | { op: 'expect'; expect: LabExpect };

export type LabStep = LabStepAction & { note?: string };
export type LabStepKind = LabStepAction['op'];

export interface LabScript {
  id: string;
  title: string;
  /** `chapter` (default, omitted): synthetic chapter room. `classic`: classic floor 1–5 (`src/game/session.ts`). */
  driver?: LabDriverKind;
  room: LabRoom;
  player: LabPlayer;
  /** `manual`: the world moves on commands and ticks only (deterministic). `live`: one tick per second like the game. */
  clock: 'manual' | 'live';
  /**
   * `live`: enemies attack (the hits are absorbed, never applied). `hold`: enemies that deal damage hold fire (the level's
   * `script.safe`); ransomware still encrypts and a fork bomb still forks.
   */
  enemyFire: 'live' | 'hold';
  setup: LabSetupOp[];
  steps: LabStep[];
}

export const LAB_FLOORS = [1, 2, 3, 4, 5] as const;
