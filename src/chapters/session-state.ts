import type { World, WorldHost } from '../game/entities.js';
import type { Inventory } from '../game/inventory.js';
import type { KiroCompanion } from '../game/kiro.js';
import { COMMANDS } from '../game/manual.js';
import { ensureLabDirChain, placeLabFile, splitLabParentAndName } from '../game/lab-support.js';
import type { Session } from '../game/session.js';
import type { Sfx } from '../game/sfx.js';
import { absPath, hasWrite, lookup, type VNode } from '../game/tree.js';
import type { CommandResult, TickResult } from '../game/types.js';
import type { RankGrade } from './catalog.js';
import type { LabConfig, LabInjection, LabInspect, LabLevelState } from './session-lab-types.js';
import type { ChapterPack, LevelPatchChip, LevelSpec } from './types.js';

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
  isTacticalMode(): boolean;
  setTacticalMode(enabled: boolean): void;
  isChaosMode(): boolean;
  readEditableFile(
    nameOrPath: string,
  ): ({ ok: true } & EditorOpenPayload) | { ok: false; error: string };
  saveEditableFile(nameOrPath: string, content: string): CommandResult;
  consumeEditorRequest(): EditorOpenPayload | null;
  getChecklist(): Array<{ description: string; done: boolean }>;
  arriveLevel(): TickResult;
  /** Read-only view of the whole level for tools (the Terminal Lab). Never changes the game. */
  inspect(): LabInspect;
  /** One world tick on request, also with the lab's manual clock and in tactical mode. Does nothing while paused, in the intro, or ended. */
  labTick(): TickResult;
  /**
   * Adds an enemy or a pickup (and the files it needs) to the running level. Throws, changing nothing, when the id is taken,
   * the pid is in use, or its file does not exist.
   */
  inject(what: LabInjection): TickResult;
}

export interface ChapterSessionOptions {
  chapterId: string;
  startLevelId?: string;
  tacticalMode?: boolean;
  chaosMode?: boolean;
  chaosSeed?: string;
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
  tutorialSkipped: boolean;
  tutorialLastStep: number;
  /** The script's hidden enemy has been shown. */
  hiddenRevealed: boolean;
  /** Seconds (world ticks) since the level started: drives `script.timed`. */
  levelTicks: number;
  /** Indexes of `script.timed` entries that already fired. */
  timedFired: Set<number>;
  /** Lab session state for this level (absorbed damage, solved riddles, latched checks). Empty in the game. */
  lab: LabLevelState;
}

export interface ChapterState {
  readonly chapterId: string;
  readonly pack: ChapterPack;
  readonly preview: boolean;
  readonly levels: LevelSpec[];
  readonly sfx: Sfx;
  readonly kiro: KiroCompanion;
  readonly chaosMode: boolean;
  readonly chaosSeed: string;
  readonly host: WorldHost;
  /** The lab session's config, or null in the game. */
  readonly lab: LabConfig | null;
  levelIdx: number;
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
  intro: boolean;
  ended: boolean;
  /** True when the run started on Level 1 and never teleported via `jumpToLevel`. */
  fullRun: boolean;
  deadNow: boolean;
  deathText: string;
  tacticalMode: boolean;
  /** What he carries and holds; kept across levels. */
  inventory: Inventory;
  pendingEditor: EditorOpenPayload | null;
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
  'tactical',
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

export function globToRegExp(pattern: string): RegExp {
  const esc = pattern
    .split('')
    .map((c) => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${esc}$`);
}

export function computeRunRank(commands: number, deaths: number, levelCount: number): RankGrade {
  const par = Math.max(12, levelCount * 6);
  if (deaths === 0 && commands <= par) return 'S';
  if (deaths <= 1 && commands <= Math.round(par * 1.45)) return 'A';
  if (deaths <= 3 && commands <= Math.round(par * 2.1)) return 'B';
  return 'C';
}

export function computeLevelRank(levelCommands: number, levelDeaths: number, usedSpoilerRung: boolean): RankGrade {
  const par = 8;
  if (!usedSpoilerRung && levelDeaths === 0 && levelCommands <= par) return 'S';
  if (levelDeaths <= 1 && levelCommands <= 12) return 'A';
  if (levelDeaths <= 2 && levelCommands <= 18) return 'B';
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
