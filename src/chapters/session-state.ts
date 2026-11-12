import type { World, WorldHost } from '../game/entities.js';
import type { KiroCompanion } from '../game/kiro.js';
import { COMMANDS } from '../game/manual.js';
import type { Session } from '../game/session.js';
import type { Sfx } from '../game/sfx.js';
import { absPath, hasWrite, lookup, makeNode, type VNode } from '../game/tree.js';
import type { CommandResult, TickResult } from '../game/types.js';
import type { RankGrade } from './catalog.js';
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
  deadNow: boolean;
  deathText: string;
  tacticalMode: boolean;
  pendingEditor: EditorOpenPayload | null;
  currentRedirectTarget: string;
  rt: LevelRuntime;
}

export const CHAPTER_COMMANDS = [
  ...COMMANDS,
  'edit',
  'nano',
  'docker',
  'hank',
  'tactical',
  'status',
  'grimoire',
  'bestiary',
  'workshop',
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

export function ensureDirChain(root: VNode, fullDirPath: string): VNode {
  const parts = fullDirPath.split('/').filter(Boolean);
  let cur = root;
  for (const part of parts) {
    let child = cur.children.get(part);
    if (!child) {
      child = makeNode(cur, part, 'dir', 0o755);
    }
    cur = child;
  }
  return cur;
}

export function splitParentAndName(fullPath: string): { parentPath: string; name: string } {
  const clean = fullPath.replace(/\/+$/, '');
  const idx = clean.lastIndexOf('/');
  if (idx <= 0) return { parentPath: '/', name: clean.slice(1) };
  return { parentPath: clean.slice(0, idx), name: clean.slice(idx + 1) };
}

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
  if (head.startsWith('AGY') || head.startsWith('GEM')) return 'antigravy';
  if (head.startsWith('CLAWD') || head.startsWith('CLAUDE')) return 'clod';
  if (head.startsWith('GR0NK') || head.startsWith('GROK')) return 'gork';
  return 'codec';
}
