import type { WorldHost } from '../game/entities.js';
import { KiroCompanion } from '../game/kiro.js';
import type { Session } from '../game/session.js';
import type { Host, Step, Word } from '../game/shell.js';
import { createSfx, type Sfx } from '../game/sfx.js';
import { absPath } from '../game/tree.js';
import type { CommandResult, FloorId, GameSnapshot, TickResult } from '../game/types.js';
import { getChapterPack } from './catalog.js';
import { levelScript } from './script.js';
import * as code from './session-code.js';
import * as flow from './session-flow.js';
import * as level from './session-level.js';
import * as rules from './session-rules.js';
import type { ChapterSession, ChapterSessionOptions, ChapterState, EditorOpenPayload, LevelRuntime } from './session-state.js';
import * as shell from './session-shell.js';
import * as snap from './session-snapshot.js';
import type { ChapterPack, LevelSpec } from './types.js';

export type { ChapterSession, ChapterSessionOptions, EditorOpenPayload } from './session-state.js';

export function isChapterSession(s: Session): s is ChapterSession {
  return (s as Partial<ChapterSession>).isChapterSession === true;
}

export function createChapterSession(options: ChapterSessionOptions): ChapterSession {
  return new DeclarativeChapterGame(options);
}

class DeclarativeChapterGame implements ChapterSession, Host, ChapterState {
  readonly isChapterSession = true as const;
  readonly chapterId: string;
  readonly pack: ChapterPack;
  readonly preview: boolean;
  readonly levels: LevelSpec[];
  readonly sfx: Sfx = createSfx();
  readonly kiro = new KiroCompanion();
  readonly chaosMode: boolean;
  readonly chaosSeed: string;
  readonly host: WorldHost;

  levelIdx = 0;
  lastCmdStartedCrack = false;
  hp = 100;
  ram = 0;
  ssd = 0;
  entryRam = 0;
  entrySsd = 0;
  commands = 0;
  deaths = 0;
  startedAt = Date.now();
  pausedMs = 0;
  pausedAt: number | null = null;
  endedAt: number | null = null;
  paused = false;
  muted = false;
  intro = true;
  ended = false;
  deadNow = false;
  deathText = '';
  tacticalMode = false;
  pendingEditor: EditorOpenPayload | null = null;
  currentRedirectTarget = '';
  rt!: LevelRuntime;

  constructor(options: ChapterSessionOptions) {
    this.chapterId = options.chapterId;
    this.tacticalMode = Boolean(options.tacticalMode);
    this.chaosMode = Boolean(options.chaosMode);
    const pack = options.pack ?? getChapterPack(options.chapterId);
    if (!pack || pack.levels.length === 0) {
      throw new Error(`Chapter "${options.chapterId}" has no executable LevelSpec entries.`);
    }
    this.pack = pack;
    this.chaosSeed = options.chaosSeed || pack.manifest.id;
    this.preview = Boolean(options.preview);
    this.levels = pack.levels;
    this.host = {
      root: () => this.rt.root,
      cwdPath: () => absPath(this.rt.cwd),
      push: (events, ev) => events.push(ev),
      hurt: (amount, source, events) => rules.hurt(this, amount, source, events),
      alive: () => !this.deadNow,
      kernelPhase: () => rules.computeBossPhase(this),
      truce: () =>
        this.rt.spec.mechanic === 'hub' ||
        this.rt.levelCommands === 0 ||
        levelScript(this).safe === true ||
        rules.allWinRulesMet(this),
      bossDown: () => {},
    };

    let startIdx = 0;
    if (options.startLevelId) {
      const found = this.levels.findIndex((l) => l.id === options.startLevelId);
      if (found >= 0) startIdx = found;
    }

    flow.applyInitialLoadout(this, startIdx);
    level.loadLevel(this, startIdx, false, []);
  }

  getCurrentLevel(): LevelSpec {
    return flow.getCurrentLevel(this);
  }

  getLevels(): readonly LevelSpec[] {
    return flow.getLevels(this);
  }

  jumpToLevel(levelIdOrIndex: string | number): TickResult {
    return flow.jumpToLevel(this, levelIdOrIndex);
  }

  isTacticalMode(): boolean {
    return flow.isTacticalMode(this);
  }

  setTacticalMode(enabled: boolean): void {
    return flow.setTacticalMode(this, enabled);
  }

  isChaosMode(): boolean {
    return flow.isChaosMode(this);
  }

  readEditableFile(nameOrPath: string): ({ ok: true } & EditorOpenPayload) | { ok: false; error: string } {
    return code.readEditableFile(this, nameOrPath);
  }

  saveEditableFile(nameOrPath: string, content: string): CommandResult {
    return code.saveEditableFile(this, nameOrPath, content);
  }

  consumeEditorRequest(): EditorOpenPayload | null {
    return flow.consumeEditorRequest(this);
  }

  getChecklist(): Array<{ description: string; done: boolean }> {
    return rules.getChecklist(this);
  }

  arriveLevel(): TickResult {
    return flow.arriveLevel(this);
  }

  exec(line: string): CommandResult {
    return flow.exec(this, this, line);
  }

  tick(): TickResult {
    return flow.tick(this);
  }

  snapshot(): GameSnapshot {
    return snap.snapshot(this);
  }

  complete(line: string): { line: string; matches: string[] } {
    return shell.complete(this, line);
  }

  hint(): string {
    return flow.hint(this);
  }

  toggleMute(): boolean {
    return flow.toggleMute(this);
  }

  restart(): TickResult {
    return flow.restart(this);
  }

  restartFloor(): TickResult {
    return flow.restartFloor(this);
  }

  debugTeleport(floor: FloorId): TickResult {
    return flow.debugTeleport(this, floor);
  }

  debugHeal(): GameSnapshot {
    return flow.debugHeal(this);
  }

  skipTutorial(): TickResult {
    return flow.skipTutorial(this);
  }

  setPaused(paused: boolean): void {
    return flow.setPaused(this, paused);
  }

  skipIntro(): void {
    return flow.skipIntro(this);
  }

  expand(word: Word): string[] {
    return shell.expand(this, word);
  }

  writeRedirect(path: string, data: string, append: boolean, argv: string[]): Step {
    return code.writeRedirect(this, path, data, append, argv);
  }

  dispatch(argv: string[], stdin: string): Step {
    return shell.dispatch(this, argv, stdin);
  }
}
