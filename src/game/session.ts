import type { KernelEvent } from '../contracts/events.js';
import { AgentDirector } from './agents.js';
import { PICKUP_INFO, type PickupType } from './bestiary.js';
import { executeRestartCommand, type RestartPending } from './commands-proc.js';
import type { TerminalSkinId } from '../contracts/terminal-skins.js';
import { World, type WorldHost } from './entities.js';
import { FLOOR_TITLES } from './floors.js';
import { starterInventory } from './inventory.js';
import { KiroCompanion } from './kiro.js';
import { observeLab } from './lab-checks.js';
import { applyLabInjection, buildLabInspect } from './lab-support.js';
import { freshLabLevelState, type LabConfig, type LabInjection, type LabInspect, type LabSession } from './lab-types.js';
import { brace, thisPlaceholder, type HeroAction, type Run } from './play.js';
import { classicHintGoals, puzzleHint, stepKiroCrack, threatHint } from './puzzle.js';
import {
  applyPickup, backups, bossDown, completions, elapsedSec, enterFloorEvents, facts, find, glob, hurt,
  kernelPhase, load, maxHp, portal, push, rank, restoreQuests,
} from './runtime.js';
import { dispatchClassicCommand, writeClassicRedirect, type ClassicShellHost } from './session-shell.js';
import { runLine, type Host, type Step, type Word } from './shell.js';
import { createAppBus, publishKernel, type AppBus } from '../contracts/app-bus.js';
import { createSfx, type Sfx } from './sfx.js';
import { absPath } from './tree.js';
import { createOuch } from './ouch.js';
import { finishTabCompletion } from './unix-applets.js';
import type { CommandResult, FloorId, GameSnapshot, TickResult } from './types.js';
import { buildRoom } from './view.js';

export interface Session {
  exec(line: string): CommandResult;
  tick(): TickResult;
  snapshot(): GameSnapshot;
  complete(line: string): { line: string; matches: string[] };
  hint(): string;
  toggleMute(): boolean;
  /** Master volume of the in-game sounds, 0 to 1. */
  setVolume(volume: number): void;
  restart(options?: { intro?: boolean }): TickResult;
  restartFloor(): TickResult;
  debugTeleport(floor: FloorId): TickResult;
  debugHeal(): GameSnapshot;
  debugDamage(amount?: number): TickResult;
  // The concrete session also has `debugGive(item, amount?)` (dev panel); main.ts probes for it.
  /** End the floor-1 tutorial now (the HUD button; the shell has `tutorial skip`). */
  skipTutorial(): TickResult;
  /** Pause/resume the game clock (intro, title cards, outro). While paused `tick()` does nothing. */
  setPaused(paused: boolean): void;
  /** End the intro state without running a command (the intro cinematic finished or was skipped). */
  skipIntro(): void;
  /** Consume a pending `manual [query]` UI open request from the last command. */
  consumeManualRequest?(): string | null;
  /** Consume a pending `map [level]` UI open request from the last command. */
  consumeMapRequest?(): string | null;
  /** Consume a pending `skin <id>` request from the last command (the page applies it). */
  consumeSkinRequest?(): TerminalSkinId | null;
  /** App bus. Pages subscribe; headless tests can read `recent()`. */
  readonly bus?: AppBus;
  readonly sfx?: Sfx;
}

export interface ClassicSessionOptions {
  /** Tools only (the Terminal Lab): runs a classic floor with absorbed damage, manual/live clock, props, riddles and checks. */
  lab?: LabConfig;
}

export function createSession(options?: ClassicSessionOptions): LabSession {
  return new Game(options);
}

class Game implements LabSession, Host, ClassicShellHost {
  readonly sfx: Sfx = createSfx();
  readonly bus: AppBus = createAppBus();
  private volume = 1;
  readonly kiro = new KiroCompanion();
  readonly agents = new AgentDirector(this.kiro);
  readonly lab: LabConfig | null;
  readonly ouch = createOuch();
  deadNow = false;
  /** Set by a confirmed `restart-level`: the confirming line is not answered by an enemy turn. */
  private reloadedNow = false;
  private restartPending: RestartPending | null = null;
  private ticks = 0;
  deathText = '';
  act: { action: HeroAction; target?: string } = { action: 'type' };
  private lineArgs: string[][] = [];
  private pendingManual: string | null = null;
  private pendingMap: string | null = null;
  private pendingSkin: TerminalSkinId | null = null;
  paused = false;
  pausedAt: number | null = null;
  readonly host: WorldHost = {
    root: () => this.run.root,
    cwdPath: () => absPath(this.run.cwd),
    push: (events, ev) => push(this, events, ev),
    hurt: (amount, source, events) => hurt(this, amount, source, events),
    alive: () => !this.deadNow,
    kernelPhase: () => kernelPhase(this),
    truce: () => (this.agents.active() && this.run.floor === 1) || this.lab?.classic?.enemyFire === 'hold',
    bossDown: (_id, how) => bossDown(this, how),
  };
  run: Run;

  constructor(options?: ClassicSessionOptions) {
    this.lab = options?.lab ?? null;
    this.run = this.blank(false);
  }

  exec(line: string): CommandResult {
    this.deadNow = false;
    this.reloadedNow = false;
    const typed = line.trim();
    if (typed) {
      this.run.commands += 1;
      this.run.intro = false;
    }
    this.run.line = line;
    this.act = { action: 'type' };
    this.lineArgs = [];
    const arrival = typed ? this.agents.arrive() : null;
    const ran = runLine(line, this);
    let output = ran.output;
    const events = ran.events;
    if (arrival) {
      output = arrival.text + output;
      events.unshift(...arrival.events);
    }
    if (typed) {
      const startedCrack = this.lineArgs.some(
        (argv) => argv[0] === 'kiro' && ['crack', 'decrypt', 'hack'].includes((argv[1] ?? '').toLowerCase()),
      );
      if (!startedCrack && this.kiro.activeCrack) {
        output += stepKiroCrack(this, events);
      }
      // Turn-based: the world (quests, enemies) steps once per command, never in real time.
      if (!this.run.ended && !this.reloadedNow) output += this.stepEnemies(events);
      this.agents.cool();
      const tutoring = this.agents.active();
      const progress = this.agents.observe(this.lineArgs, { failed: ran.code !== 0, leftDesk: this.leftDesk() });
      if (tutoring && !this.agents.active()) this.run.world.calm();
      const talk = this.agents.react(events, { hp: this.run.hp, max: maxHp(this) });
      output += progress.text + talk.text;
      events.push(...progress.events, ...talk.events);
      events.unshift({ type: 'VIBECODER_ACTION', action: this.act.action, command: typed, targetEntityId: this.act.target, ...(ran.code !== 0 ? { failed: true } : {}) });
      observeLab(this.lab, this.run.lab, { line: typed, output, code: ran.code, eventTypes: events.map((e) => e.type) });
      this.bus.emit({ kind: 'command', result: ran.code ? 'fail' : 'ok' });
    }
    return this.heard(output, events, {
      stderr: ran.stderr || undefined,
      code: typed ? ran.code : 0,
      clear: ran.clear || undefined,
    });
  }

  /** Publish the batch, then hand it back. One place, so a command cannot forget the bus. */
  private heard(
    output: string,
    events: KernelEvent[],
    extra: Partial<Pick<CommandResult, 'stderr' | 'code' | 'clear'>> = {},
  ): CommandResult {
    publishKernel(this.bus, events);
    return { output, events, snapshot: this.snapshot(), ...extra };
  }

  setPaused(paused: boolean): void {
    const now = Date.now();
    if (paused && this.pausedAt === null) this.pausedAt = now;
    if (!paused && this.pausedAt !== null) {
      if (this.run.endedAt === null) this.run.pausedMs += now - Math.max(this.pausedAt, this.run.startedAt);
      this.pausedAt = null;
    }
    this.paused = paused;
  }

  skipIntro(): void {
    this.run.intro = false;
  }

  consumeManualRequest(): string | null {
    const q = this.pendingManual;
    this.pendingManual = null;
    return q;
  }

  consumeMapRequest(): string | null {
    const q = this.pendingMap;
    this.pendingMap = null;
    return q;
  }

  consumeSkinRequest(): TerminalSkinId | null {
    const id = this.pendingSkin; this.pendingSkin = null; return id;
  }

  quietSkip(): { text: string; events: KernelEvent[] } {
    const tutoring = this.agents.active();
    const chatter = this.agents.skip();
    if (tutoring) this.run.world.calm();
    return chatter;
  }

  recordLineArgs(argv: string[]): void {
    this.lineArgs.push(argv);
  }

  setManualQuery(query: string | null): void {
    this.pendingManual = query;
  }

  setMapQuery(query: string | null): void {
    this.pendingMap = query;
  }

  setSkinRequest(id: TerminalSkinId): void {
    this.pendingSkin = id;
  }

  skipTutorial(): TickResult {
    const chatter = this.quietSkip();
    return this.heard(chatter.text, chatter.events);
  }

  /** The tutorial's last prompt is done once the hero is no longer at the desk he woke up at. */
  private leftDesk(): boolean {
    return this.run.floor !== 1 || absPath(this.run.cwd) !== '/home/dev/nightmare_workspace/desk';
  }

  private enemiesHeld(): boolean {
    return this.lab !== null && this.run.commands === 0;
  }

  /** One real second: the agents' arrival and commentary only. Nothing hurts in real time (turn-based). */
  tick(): TickResult {
    if (this.run.ended || this.paused || (this.lab !== null && (this.run.intro || this.lab.clock === 'manual'))) {
      return { output: '', events: [], snapshot: this.snapshot() };
    }
    this.ticks += 1;
    return this.stepWorld(false);
  }

  /** One world step on request (the lab's Tick, the classic playthrough's idle steps). */
  labTick(): TickResult {
    if (this.run.ended || this.paused || this.run.intro) return { output: '', events: [], snapshot: this.snapshot() };
    return this.stepWorld(true);
  }

  /** Quest files grow back and enemies act: one world step. */
  private stepEnemies(events: KernelEvent[]): string {
    let output = restoreQuests(this, events);
    if (!this.enemiesHeld()) output += this.run.world.tick(events);
    return output;
  }

  private stepWorld(world: boolean): TickResult {
    this.deadNow = false;
    this.deathText = '';
    const events: KernelEvent[] = [];
    let output = '';
    const arrival = this.agents.arrive();
    if (arrival) {
      output += arrival.text;
      events.push(...arrival.events);
    }
    if (world && this.kiro.activeCrack) {
      output += stepKiroCrack(this, events);
    }
    if (world) output += this.stepEnemies(events);
    this.agents.cool();
    const talk = this.agents.react(events, { hp: this.run.hp, max: maxHp(this) });
    output += talk.text;
    events.push(...talk.events);
    observeLab(this.lab, this.run.lab, { output, eventTypes: events.map((e) => e.type) });
    return this.heard(output, events, { stderr: this.deathText || undefined });
  }

  inspect(): LabInspect {
    return buildLabInspect({
      levelId: `floor-${this.run.floor}`,
      root: this.run.root,
      cwd: this.run.cwd,
      world: this.run.world,
      hp: this.run.hp,
      maxHp: maxHp(this),
      enemiesLeft: this.run.world.counts().left,
      held: this.enemiesHeld(),
      lab: this.lab,
      state: this.run.lab,
      socketInputs: this.run.socketInputs,
      filesRead: this.run.filesRead,
      checklist: [],
    });
  }

  inject(what: LabInjection): TickResult {
    const events = applyLabInjection(this.run.root, this.run.world, what);
    observeLab(this.lab, this.run.lab, { output: '', eventTypes: events.map((e) => e.type) });
    return this.heard('', events);
  }

  snapshot(): GameSnapshot {
    const cwd = absPath(this.run.cwd);
    const counts = this.run.world.counts();
    const room = buildRoom(facts(this));
    if (this.lab && !this.run.ended) room.actors.push(...this.lab.extraActors);
    return {
      cwd,
      floor: this.run.floor,
      hp: this.run.hp,
      maxHp: maxHp(this),
      commands: this.run.commands,
      prompt: `dev@haunted:${cwd}$ `,
      promptGold: this.run.ended || portal(this),
      muted: this.run.muted,
      volume: this.volume,
      level: {
        title: FLOOR_TITLES[this.run.floor] ?? `Floor ${this.run.floor}`,
        objective: 'Find the way down.',
        checklist: [],
        bugsLeft: counts.left,
        bugsTotal: counts.total,
      },
      hintGoals: classicHintGoals(this),
      ended: this.run.ended,
      rank: this.run.ended ? rank(this) : null,
      timeSec: elapsedSec(this),
      shortcuts: [...this.run.shortcuts],
      room,
      intro: this.run.intro,
      inventory: { items: [...this.run.inventory.items], held: this.run.inventory.held },
      battle: null,
      ram: this.run.ram,
      ssd: this.run.ssd,
      backups: backups(this),
      paused: this.paused,
      enemiesLeft: counts.left,
      enemiesTotal: counts.total,
      tutorial: this.agents.state(),
    };
  }

  complete(line: string): { line: string; matches: string[] } {
    const match = /^(.*?)(\S*)$/.exec(line);
    const lead = match?.[1] ?? '';
    const token = match?.[2] ?? '';
    const words = lead.trim() ? lead.trim().split(/\s+/) : [];
    const command = words.length === 0 || /[;|&]$/.test(lead.trim());
    const matches = completions(this, token, command, words[0] ?? '');
    return finishTabCompletion(line, lead, token, matches);
  }

  hint(): string {
    const puzzle = puzzleHint(this);
    const threat = threatHint(this);
    return threat ? `${threat}\n${puzzle}` : puzzle;
  }

  toggleMute(): boolean {
    this.run.muted = !this.run.muted;
    this.sfx.setMuted(this.run.muted);
    return this.run.muted;
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1));
    this.sfx.setVolume(this.volume);
  }

  restart(options?: { intro?: boolean }): TickResult {
    this.restartPending = null;
    const muted = this.run.muted;
    this.run = this.blank(muted);
    const events: KernelEvent[] = [];
    if (!options?.intro) enterFloorEvents(this, events);
    return this.heard('', events);
  }

  /** Loads a floor and builds its enter events. Does not publish: callers that return the batch do. */
  private floorEvents(floor: FloorId, output: string): TickResult {
    this.restartPending = null;
    load(this, floor);
    this.run.hp = maxHp(this);
    const events: KernelEvent[] = [];
    enterFloorEvents(this, events);
    return { output, events, snapshot: this.snapshot() };
  }

  private openedFloor(floor: FloorId, output: string): TickResult {
    const res = this.floorEvents(floor, output);
    return this.heard(res.output, res.events);
  }

  restartFloor(): TickResult {
    this.run.ended = false;
    this.run.ram = this.run.entryRam;
    this.run.ssd = this.run.entrySsd;
    this.bus.emit({ kind: 'restart', step: 'go' });
    return this.openedFloor(this.run.floor, 'Floor restarted.\n');
  }

  /** `restart-level` / `retry`: arm, then confirm on the next line (or `--yes`). Same rule as the chapter shell. */
  restartLevel(args: string[]): Step {
    return executeRestartCommand(
      this.restartPending,
      { commands: this.run.commands, ticks: this.ticks },
      args,
      FLOOR_TITLES[this.run.floor] ?? `Floor ${this.run.floor}`,
      (next) => {
        this.restartPending = next;
        this.bus.emit({ kind: 'restart', step: 'arm' });
      },
      () => {
        this.run.ended = false;
        this.run.ram = this.run.entryRam;
        this.run.ssd = this.run.entrySsd;
        const res = this.floorEvents(this.run.floor, 'Floor restarted.\n');
        this.reloadedNow = true;
        this.bus.emit({ kind: 'restart', step: 'go' });
        return { stdout: res.output, stderr: '', code: 0, events: res.events };
      },
    );
  }

  debugTeleport(floor: FloorId): TickResult {
    if (floor !== 1) this.agents.abandon();
    this.run.ended = false;
    this.run.intro = false;
    this.run.entryRam = this.run.ram;
    this.run.entrySsd = this.run.ssd;
    return this.openedFloor(floor, `Teleported to floor ${floor}.\n`);
  }

  debugHeal(): GameSnapshot {
    this.run.hp = maxHp(this);
    return this.snapshot();
  }

  debugDamage(amount = 10): TickResult {
    const dmg = Math.max(1, Math.round(amount));
    this.run.hp = Math.max(0, this.run.hp - dmg);
    const events: KernelEvent[] = [
      { type: 'PLAYER_DAMAGED', amount: dmg, hpRemaining: this.run.hp, sourceName: 'dev_panel' },
    ];
    return this.heard('', events);
  }

  debugGive(item: PickupType, amount?: number): TickResult {
    const events: KernelEvent[] = [];
    const text = applyPickup(this, item, amount ?? PICKUP_INFO[item].amount, `debug-${item}`, events);
    return this.heard(text, events);
  }

  expand(word: Word): string[] {
    if (word.quote !== 'none') return [word.text];
    let text = word.text;
    if ((text === '~' || text.startsWith('~/')) && find(this, '/home/dev')) text = `/home/dev${text.slice(1)}`;
    return brace(text).flatMap((part) => glob(this, part));
  }

  finishStep(step: Step): Step {
    this.run.world.sync(step.events);
    const notes = this.run.world.drain();
    if (notes) step.info = (step.info ?? '') + notes;
    return step;
  }

  dispatch(argv: string[], stdin: string): Step {
    return dispatchClassicCommand(this, argv, stdin);
  }

  writeRedirect(path: string, data: string, append: boolean, argv: string[]): Step {
    return writeClassicRedirect(this, path, data, append, argv);
  }

  private blank(muted: boolean): Run {
    this.kiro.reset();
    this.agents.reset();
    const classic = this.lab?.classic;
    const startFloor: FloorId = classic?.floor ?? 1;
    const ram = classic?.ram ?? 0;
    const ssd = classic?.ssd ?? 0;
    if (classic?.core) this.kiro.loadCore(classic.core);
    const placeholder = thisPlaceholder();
    this.run = {
      floor: startFloor,
      root: placeholder,
      cwd: placeholder,
      prev: null,
      hp: 100,
      ram,
      ssd,
      entryRam: ram,
      entrySsd: ssd,
      commands: 0,
      startedAt: Date.now(),
      pausedMs: 0,
      endedAt: null,
      shortcuts: [],
      muted,
      ended: false,
      intro: true,
      lantern: false,
      inventory: starterInventory(),
      xray: false,
      flood: 0,
      attempts: {},
      phase1: false,
      tokenOk: false,
      archivistSolved: false,
      quests: [],
      line: '',
      world: new World(this.host, [], []),
      filesRead: new Set(),
      socketInputs: new Map(),
      lab: freshLabLevelState(),
    };
    load(this, startFloor);
    if (startFloor !== 1 || absPath(this.run.cwd) !== '/home/dev/nightmare_workspace/desk') {
      this.agents.abandon();
    }
    this.run.hp = maxHp(this);
    return this.run;
  }
}
