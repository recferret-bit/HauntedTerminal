import type { TerminalSkinId } from '../contracts/terminal-skins.js';
import type { SceneTransform } from '../contracts/room-view.js';
import type { BattleHold, BattleState } from '../game/battle.js';
import type { PickupType } from '../game/bestiary.js';
import type { RestartPending } from '../game/commands-proc.js';
import type { World, WorldHost } from '../game/entities.js';
import type { Inventory } from '../game/inventory.js';
import type { OuchState } from '../game/ouch.js';
import type { KiroCompanion } from '../game/kiro.js';
import { COMMANDS } from '../game/manual.js';
import { ensureLabDirChain, placeLabFile, splitLabParentAndName } from '../game/lab-support.js';
import type { Session } from '../game/session.js';
import type { AppBus } from '../contracts/app-bus.js';
import type { Sfx } from '../game/sfx.js';
import { absPath, hasWrite, lookup, type VNode } from '../game/tree.js';
import type { CommandResult, GameSnapshot, TickResult } from '../game/types.js';
import type { RankGrade } from './catalog.js';
import type { LabConfig, LabInjection, LabInspect, LabLevelState } from './session-lab-types.js';
import type { ChapterPack, LevelDialogEntry, LevelFileSpec, LevelPatchChip, LevelSpec, ScriptStep } from './types.js';

export { empty as emptyStep, out as okStep } from '../game/play.js';

export interface EditorOpenPayload {
  path: string;
  name: string;
  content: string;
  patches: LevelPatchChip[];
}

export interface ChapterSession extends Session {
  readonly isChapterSession: true;
  readonly chapterId: string;
  getCurrentLevel(): LevelSpec;
  getLevels(): readonly LevelSpec[];
  jumpToLevel(levelIdOrIndex: string | number): TickResult;
  isChaosMode(): boolean;
  readEditableFile(
    nameOrPath: string,
  ): ({ ok: true } & EditorOpenPayload) | { ok: false; error: string };
  saveEditableFile(nameOrPath: string, content: string): CommandResult;
  consumeEditorRequest(): EditorOpenPayload | null;
  consumeManualRequest(): string | null;
  consumeMapRequest(): string | null;
  consumeSkinRequest(): TerminalSkinId | null;
  getChecklist(): Array<{ description: string; done: boolean }>;
  arriveLevel(): TickResult;
  /** Read-only view of the whole level for tools (the Terminal Lab). Never changes the game. */
  inspect(): LabInspect;
  /**
   * One world step on request, also with the lab's manual clock: in a battle it forces the enemy turn (as a timer
   * runout would), outside one it steps the world once. Does nothing while paused, in the intro, or ended.
   */
  labTick(): TickResult;
  /** Battle intro -> the player's first turn (Enter on the play page). False when no intro is playing. */
  skipBattleIntro(): TickResult | null;
  /** Skips the opening Vibecoder + Kiro conversation (`openingSec`), unlocking the terminal and firing the Big Four taunt / battle start. */
  skipOpeningDialog(): TickResult | null;
  /** Marks any active mid-level scripted dialog complete after natural DialogBox queue drain. */
  finishScriptDialog?(): GameSnapshot | null;
  /** Stop or restart the battle turn timer while the mini-editor or the laptop is open. */
  holdTurnTimer(hold: BattleHold, on: boolean): void;
  /** The player's turn ends now and the enemies act (the lab's Tick, the solver's timer runouts). Null outside a battle's player turn. */
  forceEnemyTurn(): TickResult | null;
  /**
   * Adds an enemy or a pickup (and the files it needs) to the running level. Throws, changing nothing, when the id is taken,
   * the pid is in use, or its file does not exist.
   */
  inject(what: LabInjection): TickResult;
  setEditorPreviewOptions?(opts: { showHidden?: boolean }): TickResult;
  listPreviewDirs?(): string[];
  setPreviewCwd?(cwd: string): TickResult;
  injectEditorEnemy?(type: string, x?: number): TickResult | null;
  killAllEnemies?(): { count: number; result: TickResult };
}

export interface ChapterSessionOptions {
  chapterId: string;
  startLevelId?: string;
  chaosMode?: boolean;
  chaosSeed?: string;
  /** Seeds the random PIDs (tests and the property suite); the game rolls them with `Math.random`. */
  pidSeed?: number;
  /** Play this pack instead of the compiled catalog (the editor passes unsaved drafts). */
  pack?: ChapterPack;
  /** Preview runs leave progress, scrap and telemetry untouched. */
  preview?: boolean;
  /**
   * Tools only (the Terminal Lab): a lab session. Damage is counted per source in `rt.lab.absorbed` and never reaches HP, so
   * nobody dies; enemies still attack and keep attacking after every win rule is met (the end-of-level truce is off).
   * With `clock: 'manual'`, `tick()` does nothing and the world moves on commands and `labTick()`.
   */
  lab?: LabConfig;
}

export interface QuestBackup {
  path: string;
  name: string;
  parentPath: string;
  mode: number;
  uid: number;
  content: string;
  missingTicks: number;
}

export interface BuiltImage {
  tag: string;
  baseImage: string;
  exposePort: number;
}

export interface RunningContainer {
  id: string;
  name: string;
  image: string;
  ports: string;
  status: 'Up (healthy)';
}

export interface LevelRuntime {
  spec: LevelSpec;
  filesByPath: ReadonlyMap<string, LevelFileSpec>;
  musicOverride?: string;
  root: VNode;
  cwd: VNode;
  world: World;
  quests: QuestBackup[];
  filesRead: Set<string>;
  talkedSockets: Set<string>;
  socketInputs: Map<string, string>;
  loadedCores: Set<string>;
  hintRung: number;
  usedSpoilerRung: boolean;
  levelCommands: number;
  levelDeaths: number;
  levelStartedAt: number;
  builtImages: Map<string, BuiltImage>;
  containers: RunningContainer[];
  composeHealthyServices: Set<string>;
  lantern: boolean;
  xray: boolean;
  streamDrained: boolean;
  completionEmitted: boolean;
  completionNote: string;
  levelArrived: boolean;
  arrivalNote: string;
  /** First words of commands the player ran in this level (`ls`, `ps`): feeds script conditions. */
  commandsRun: Set<string>;
  /** Full successful command invocations `{ name, args }` on this level for flag/arg `ran_command` checks. */
  commandLog: Array<{ name: string; args: string[] }>;
  tutorialSkipped: boolean;
  tutorialLastStep: number;
  /** The script's hidden enemy has been shown. */
  hiddenRevealed: boolean;
  /** Entity ids a `spawn` step has brought in on this level (Kiro stays off stage until his is, with `hideWhen: before_spawn`). */
  spawned: Set<string>;
  /** Non-`kiro` actors materialized onto the stage by `spawn` script steps (removed by `despawn`). */
  spawnedActors: Map<string, { model: string; x: number; y?: number; label?: string } & SceneTransform>;
  /** Seconds (world ticks) since the level started: drives `script.timed`. */
  levelTicks: number;
  /** The PIDs rolled for this load, by enemy id (`{pid:<enemy id>}` in text). Empty in a lab session. */
  pids: ReadonlyMap<string, number>;
  /** This level's `dialogs.json` entry with its PIDs filled in. */
  dialog: LevelDialogEntry | undefined;
  /** Indexes of `script.timed` entries that already fired. */
  timedFired: Set<number>;
  /** Steps a `wait` step pushed back: they run on the level tick `dueTick` (in order), or are flushed when the opening is skipped. */
  /** Kiro skills (`heal`, `hint`) already spent on this level: the level's own charge. */
  skillsUsed: Set<string>;
  /** Hint lines already given per riddle id (the next `kiro hint` reads the next line). */
  hintUses: Map<string, number>;
  deferred: Array<{ dueTick: number; steps: ScriptStep[]; vars: Record<string, string> }>;
  /** True once the player swept the room with `ls -a` / `ls -la` / `ls -A` on this level. */
  roomSwept: boolean;
  /** Pickup ids whose `appearWhen` condition has triggered and dropped onto the ground. */
  droppedPickups: Set<string>;
  /** Indexes of `script.triggers` entries that already fired on this level load. */
  triggersFired: Set<number>;
  /** True once the opening Vibecoder + Kiro conversation (`openingSec`) has finished or been skipped. */
  openingDone: boolean;
  /** Level tick until which an active scripted `dialog_box` beat holds (`dialog_done` is false). */
  dialogBusyUntilTick: number;
  /** Per-level script flags set by `set_flag` steps and read by `flag` conditions. */
  flags: Set<string>;
  /** Battles started in this level runtime (used to wire the level's Big Four `agentTaunt` onto Battle #1). */
  levelBattles: number;
  /** Armed `restart-level` confirm; dies with the level runtime (a load or reboot builds a new one). */
  restartPending: RestartPending | null;
  /** Lab session state for this level (absorbed damage, solved riddles, latched checks). Empty in the game. */
  lab: LabLevelState;
}

export interface ChapterState {
  readonly chapterId: string;
  readonly pack: ChapterPack;
  readonly preview: boolean;
  editorShowHidden: boolean;
  readonly levels: LevelSpec[];
  readonly sfx: Sfx;
  readonly bus: AppBus;
  /** Set by a `script.locks` refusal so the command event is `locked`, not `fail`. */
  commandCue: 'locked' | null;
  readonly kiro: KiroCompanion;
  readonly chaosMode: boolean;
  readonly chaosSeed: string;
  /** Random source of the PID roll. */
  readonly pidRandom: () => number;
  /** The rare ouch comments on a hit (`src/game/ouch.ts`). */
  readonly ouch: OuchState;
  readonly host: WorldHost;
  /** The lab session's config, or null in the game. */
  readonly lab: LabConfig | null;
  levelIdx: number;
  /** The highest level index this session has loaded (-1 before the first load): a map deploy to a level at or below it keeps the run. */
  reachedIdx: number;
  lastCmdStartedCrack: boolean;
  hp: number;
  ram: number;
  ssd: number;
  entryRam: number;
  entrySsd: number;
  commands: number;
  deaths: number;
  startedAt: number;
  pausedMs: number;
  pausedAt: number | null;
  endedAt: number | null;
  paused: boolean;
  muted: boolean;
  /** Master volume of the in-game sounds, 0 to 1. */
  volume: number;
  intro: boolean;
  ended: boolean;
  /** Set by `restart-level` when it reloaded the level during this line; `exec` then skips the post-command block. */
  reloadedNow: boolean;
  /** Set by a `kiro heal` / `kiro hint` that is not a player action (refused, or no battle): `exec` then runs no enemy turn or world step for the line. */
  freeAction: boolean;
  /** True when the run started on Level 1 and never teleported via `jumpToLevel`. */
  fullRun: boolean;
  deadNow: boolean;
  deathText: string;
  /** The turn-based battle state machine (`src/game/battle.ts`). */
  battle: BattleState;
  /** What he carries and holds; kept across levels. */
  inventory: Inventory;
  /** What he carried when this level was entered; a floor restart puts it back. */
  entryInventory: Inventory;
  /** Pickup types already collected once during this session (drives `manifest.onFirstPickup`). */
  seenPickups: Set<PickupType>;
  pendingEditor: EditorOpenPayload | null;
  pendingManual: string | null;
  pendingMap: string | null;
  pendingSkin: TerminalSkinId | null;
  currentRedirectTarget: string;
  rt: LevelRuntime;
}

export const CHAPTER_COMMANDS = [
  ...COMMANDS,
  'mkdir',
  'edit',
  'nano',
  'docker',
  'hank',
  'grimoire',
  'bestiary',
  'workshop',
  'achievements',
] as const;

export function creatableParent(root: VNode, cwd: VNode, raw: string): { parent: VNode; name: string } | null {
  const full = raw.startsWith('/') ? raw : `${absPath(cwd)}/${raw}`;
  const { parentPath, name } = splitParentAndName(full);
  const parent = lookup(root, parentPath);
  if (!parent || parent.kind !== 'dir' || !hasWrite(parent)) return null;
  return { parent, name };
}

export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

export const ensureDirChain = ensureLabDirChain;
export const placeFile = placeLabFile;
export const splitParentAndName = splitLabParentAndName;

export { globToRegExp } from '../game/unix-applets.js';

export function computeRunRank(commands: number, deaths: number, levels: readonly Pick<LevelSpec, 'solutionCommands'>[] | number): RankGrade {
  const count = typeof levels === 'number' ? levels : levels.length;
  const solTotal = typeof levels === 'number' ? 0 : levels.reduce((sum, l) => sum + l.solutionCommands.length, 0);
  const par = Math.max(12, count * 6, solTotal);
  if (deaths === 0 && commands <= par) return 'S';
  if (deaths <= 1 && commands <= Math.round(par * 1.45)) return 'A';
  if (deaths <= 3 && commands <= Math.round(par * 2.1)) return 'B';
  return 'C';
}

export function computeLevelRank(levelCommands: number, levelDeaths: number, usedSpoilerRung: boolean, solutionLen = 0): RankGrade {
  const par = Math.max(8, solutionLen);
  if (!usedSpoilerRung && levelDeaths === 0 && levelCommands <= par) return 'S';
  if (levelDeaths <= 1 && levelCommands <= Math.max(12, Math.round(par * 1.5))) return 'A';
  if (levelDeaths <= 2 && levelCommands <= Math.max(18, Math.round(par * 2.25))) return 'B';
  return 'C';
}

export function resolveTauntAgent(taunt: string): 'clod' | 'gork' | 'codec' | 'antigravy' | 'kiro' {
  const head = taunt.slice(0, 22).toUpperCase();
  if (head.startsWith('KIRO') || head.startsWith('ADVISOR KIRO')) return 'kiro';
  if (head.startsWith('ANTI-GRAVY') || head.startsWith('ANTIGRAVY') || head.startsWith('GRAVY')) return 'antigravy';
  if (head.startsWith('CLOD')) return 'clod';
  if (head.startsWith('GORK')) return 'gork';
  return 'codec';
}
