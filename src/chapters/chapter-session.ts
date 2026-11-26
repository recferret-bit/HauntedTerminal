import type { KernelEvent } from '../contracts/events.js';
import type { TerminalSkinId } from '../contracts/terminal-skins.js';
import { createBattle, type BattleHold, type BattleState } from '../game/battle.js';
import type { PickupType } from '../game/bestiary.js';
import type { WorldHost } from '../game/entities.js';
import { starterInventory } from '../game/inventory.js';
import { createOuch, type OuchState } from '../game/ouch.js';
import { KiroCompanion } from '../game/kiro.js';
import type { Session } from '../game/session.js';
import type { Host, Step, Word } from '../game/shell.js';
import { createAppBus, publishKernel, type AppBus } from '../contracts/app-bus.js';
import { createSfx, type Sfx } from '../game/sfx.js';
import { absPath } from '../game/tree.js';
import type { CommandResult, FloorId, GameSnapshot, TickResult } from '../game/types.js';
import { getChapterPack } from './catalog.js';
import { seededRandom } from './pids.js';
import { hasOpeningGate, levelScript, openingActive } from './script.js';
import * as code from './session-code.js';
import * as flow from './session-flow.js';
import * as level from './session-level.js';
import { writeRedirect } from './session-redirect.js';
import * as rules from './session-rules.js';
import type { LabConfig, LabInjection, LabInspect } from './session-lab-types.js';
import type { ChapterSession, ChapterSessionOptions, ChapterState, EditorOpenPayload, LevelRuntime } from './session-state.js';
import * as lab from './session-lab.js';
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

function heard<T extends { events: KernelEvent[] }>(g: DeclarativeChapterGame, result: T): T {
  publishKernel(g.bus, result.events);
  return result;
}

class DeclarativeChapterGame implements ChapterSession, Host, ChapterState {
  readonly isChapterSession = true as const;
  readonly chapterId: string;
  readonly pack: ChapterPack;
  readonly preview: boolean;
  readonly levels: LevelSpec[];
  readonly sfx: Sfx = createSfx();
  readonly bus: AppBus = createAppBus();
  commandCue: 'locked' | null = null;
  readonly kiro = new KiroCompanion();
  readonly chaosMode: boolean;
  readonly chaosSeed: string;
  readonly pidRandom: () => number;
  readonly host: WorldHost;
  readonly lab: LabConfig | null;
  readonly ouch: OuchState;

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
  volume = 1;
  intro = true;
  ended = false;
  reloadedNow = false;
  fullRun = true;
  deadNow = false;
  deathText = '';
  battle: BattleState = createBattle();
  inventory = starterInventory();
  entryInventory = starterInventory();
  seenPickups = new Set<PickupType>();
  pendingEditor: EditorOpenPayload | null = null;
  pendingManual: string | null = null;
  pendingMap: string | null = null;
  pendingSkin: TerminalSkinId | null = null;
  currentRedirectTarget = '';
  rt!: LevelRuntime;

  constructor(options: ChapterSessionOptions) {
    this.chapterId = options.chapterId;
    this.chaosMode = Boolean(options.chaosMode);
    this.lab = options.lab ?? null;
    const pack = options.pack ?? getChapterPack(options.chapterId);
    if (!pack || pack.levels.length === 0) {
      throw new Error(`Chapter "${options.chapterId}" has no executable LevelSpec entries.`);
    }
    this.pack = pack;
    this.chaosSeed = options.chaosSeed || pack.manifest.id;
    this.ouch = createOuch(options.pidSeed === undefined ? Math.random : seededRandom(options.pidSeed + 1));
    this.pidRandom = options.pidSeed === undefined ? Math.random : seededRandom(options.pidSeed);
    this.preview = Boolean(options.preview);
    this.levels = pack.levels;
    this.host = {
      root: () => this.rt.root,
      cwdPath: () => absPath(this.rt.cwd),
      push: (events, ev) => events.push(ev),
      hurt: (amount, source, events) => level.hurt(this, amount, source, events),
      alive: () => !this.deadNow,
      kernelPhase: () => rules.computeBossPhase(this),
      truce: () =>
        this.rt.spec.mechanic === 'hub' ||
        (hasOpeningGate(this) ? openingActive(this) : this.rt.levelCommands === 0) ||
        levelScript(this).safe === true ||
        (this.lab === null && rules.allWinRulesMet(this)),
      bossDown: () => {},
    };

    let startIdx = 0;
    if (options.startLevelId) {
      const found = this.levels.findIndex((l) => l.id === options.startLevelId);
      if (found >= 0) startIdx = found;
    }
    this.fullRun = startIdx === 0;

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
    return heard(this, flow.jumpToLevel(this, levelIdOrIndex));
  }

  isChaosMode(): boolean {
    return flow.isChaosMode(this);
  }

  readEditableFile(nameOrPath: string): ({ ok: true } & EditorOpenPayload) | { ok: false; error: string } {
    return code.readEditableFile(this, nameOrPath);
  }

  saveEditableFile(nameOrPath: string, content: string): CommandResult {
    return heard(this, code.saveEditableFile(this, nameOrPath, content));
  }

  consumeEditorRequest(): EditorOpenPayload | null {
    return flow.consumeEditorRequest(this);
  }

  consumeManualRequest(): string | null {
    return flow.consumeManualRequest(this);
  }

  consumeMapRequest(): string | null {
    return flow.consumeMapRequest(this);
  }

  consumeSkinRequest(): TerminalSkinId | null {
    return flow.consumeSkinRequest(this);
  }

  getChecklist(): Array<{ description: string; done: boolean }> {
    return rules.getChecklist(this);
  }

  arriveLevel(): TickResult {
    return heard(this, flow.arriveLevel(this));
  }

  inspect(): LabInspect {
    return lab.inspect(this);
  }

  labTick(): TickResult {
    return heard(this, lab.labTick(this));
  }

  skipBattleIntro(): TickResult | null {
    const res = flow.skipBattleIntro(this);
    return res ? heard(this, res) : null;
  }

  skipOpeningDialog(): TickResult | null {
    const res = flow.skipOpeningDialog(this);
    return res ? heard(this, res) : null;
  }

  holdTurnTimer(hold: BattleHold, on: boolean): void {
    flow.holdTurnTimer(this, hold, on);
  }

  forceEnemyTurn(): TickResult | null {
    const res = flow.forceEnemyTurn(this);
    return res ? heard(this, res) : null;
  }

  inject(what: LabInjection): TickResult {
    return heard(this, lab.inject(this, what));
  }

  exec(line: string): CommandResult {
    return heard(this, flow.exec(this, this, line));
  }

  tick(): TickResult {
    return heard(this, flow.tick(this));
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

  setVolume(volume: number): void {
    flow.setVolume(this, volume);
  }

  restart(options?: { intro?: boolean }): TickResult {
    return heard(this, flow.restart(this, options));
  }

  restartFloor(): TickResult {
    return heard(this, flow.restartFloor(this));
  }

  debugTeleport(floor: FloorId): TickResult {
    return heard(this, flow.debugTeleport(this, floor));
  }

  debugHeal(): GameSnapshot {
    return flow.debugHeal(this);
  }

  debugDamage(amount = 10): TickResult {
    return heard(this, flow.debugDamage(this, amount));
  }

  skipTutorial(): TickResult {
    return heard(this, flow.skipTutorial(this));
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
    return writeRedirect(this, path, data, append, argv);
  }

  dispatch(argv: string[], stdin: string): Step {
    return shell.dispatch(this, argv, stdin);
  }
}
