import type { KernelEvent } from '../contracts/events.js';
import { AgentDirector } from './agents.js';
import { PICKUP_INFO, type PickupType } from './bestiary.js';
import { cmdChmod, cmdCp, cmdLn, cmdMv, cmdRm, cmdTouch, redirect } from './commands-fs.js';
import { cmdCd, cmdFind, cmdLs, cmdReadlink } from './commands-move.js';
import { cmdKill, cmdPkill, cmdPs, cmdSource } from './commands-proc.js';
import { cmdCat, cmdCut, cmdEcho, cmdGrep, cmdHeadTail, cmdRev, cmdSed, cmdWc } from './commands-text.js';
import { World, type WorldHost } from './entities.js';
import { KiroCompanion } from './kiro.js';
import { helpText, manPage } from './manual.js';
import { brace, empty, out, thisPlaceholder, type HeroAction, type Run } from './play.js';
import { cmdKiro, puzzleHint, statusText, stepKiroCrack, threatHint } from './puzzle.js';
import {
  applyPickup, backups, bossDown, bump, causeOf, completions, elapsedSec, enterFloorEvents, facts, find, glob, hurt,
  kernelPhase, load, maxHp, noteAction, portal, push, rank, restoreQuests,
} from './runtime.js';
import { runLine, type Host, type Step, type Word } from './shell.js';
import { createSfx, type Sfx } from './sfx.js';
import { absPath, resolve } from './tree.js';
import type { CommandResult, FloorId, GameSnapshot, TickResult } from './types.js';
import { buildRoom } from './view.js';

export interface Session {
  exec(line: string): CommandResult;
  tick(): TickResult;
  snapshot(): GameSnapshot;
  complete(line: string): { line: string; matches: string[] };
  hint(): string;
  toggleMute(): boolean;
  restart(): TickResult;
  restartFloor(): TickResult;
  debugTeleport(floor: FloorId): TickResult;
  debugHeal(): GameSnapshot;
  // The concrete session also has `debugGive(item, amount?)` (dev panel); main.ts probes for it.
  /** End the floor-1 tutorial now (the HUD button; the shell has `tutorial skip`). */
  skipTutorial(): TickResult;
  /** Pause/resume the game clock (intro, title cards, outro). While paused `tick()` does nothing. */
  setPaused(paused: boolean): void;
  /** End the intro state without running a command (the intro cinematic finished or was skipped). */
  skipIntro(): void;
}

export function createSession(): Session {
  return new Game();
}

class Game implements Session, Host {
  readonly sfx: Sfx = createSfx();
  readonly kiro = new KiroCompanion();
  readonly agents = new AgentDirector(this.kiro);
  deadNow = false;
  deathText = '';
  act: { action: HeroAction; target?: string } = { action: 'type' };
  private lineArgs: string[][] = [];
  paused = false;
  pausedAt: number | null = null;
  readonly host: WorldHost = {
    root: () => this.run.root,
    cwdPath: () => absPath(this.run.cwd),
    push: (events, ev) => push(this, events, ev),
    hurt: (amount, source, events) => hurt(this, amount, source, events),
    alive: () => !this.deadNow,
    kernelPhase: () => kernelPhase(this),
    truce: () => this.agents.active() && this.run.floor === 1,
    bossDown: (_id, how) => bossDown(this, how),
  };
  run: Run;

  constructor() {
    this.run = this.blank(false);
  }

  exec(line: string): CommandResult {
    this.deadNow = false;
    const typed = line.trim();
    if (typed) {
      this.run.commands += 1;
      this.run.intro = false;
      this.sfx.play('type');
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
      this.agents.cool();
      const tutoring = this.agents.active();
      const progress = this.agents.observe(this.lineArgs, { failed: ran.code !== 0, leftDesk: this.leftDesk() });
      if (tutoring && !this.agents.active()) this.run.world.calm();
      const talk = this.agents.react(events, { hp: this.run.hp, max: maxHp(this) });
      output += progress.text + talk.text;
      events.push(...progress.events, ...talk.events);
      events.unshift({ type: 'VIBECODER_ACTION', action: this.act.action, command: typed, targetEntityId: this.act.target });
    }
    return { output, stderr: ran.stderr || undefined, events, snapshot: this.snapshot(), clear: ran.clear || undefined };
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

  private quietSkip(): { text: string; events: KernelEvent[] } {
    const tutoring = this.agents.active();
    const chatter = this.agents.skip();
    if (tutoring) this.run.world.calm();
    return chatter;
  }

  skipTutorial(): TickResult {
    const chatter = this.quietSkip();
    return { output: chatter.text, events: chatter.events, snapshot: this.snapshot() };
  }

  /** The tutorial's last prompt is done once the hero is no longer at the desk he woke up at. */
  private leftDesk(): boolean {
    return this.run.floor !== 1 || absPath(this.run.cwd) !== '/home/dev/nightmare_workspace/desk';
  }

  tick(): TickResult {
    if (this.run.ended || this.paused) return { output: '', events: [], snapshot: this.snapshot() };
    this.deadNow = false;
    this.deathText = '';
    const events: KernelEvent[] = [];
    let output = '';
    const arrival = this.agents.arrive();
    if (arrival) {
      output += arrival.text;
      events.push(...arrival.events);
    }
    output += restoreQuests(this, events);
    if (this.kiro.activeCrack) {
      output += stepKiroCrack(this, events);
    }
    output += this.run.world.tick(events);
    this.agents.cool();
    const talk = this.agents.react(events, { hp: this.run.hp, max: maxHp(this) });
    output += talk.text;
    events.push(...talk.events);
    return { output, stderr: this.deathText || undefined, events, snapshot: this.snapshot() };
  }

  snapshot(): GameSnapshot {
    const cwd = absPath(this.run.cwd);
    const counts = this.run.world.counts();
    return {
      cwd,
      floor: this.run.floor,
      hp: this.run.hp,
      maxHp: maxHp(this),
      commands: this.run.commands,
      prompt: `dev@haunted:${cwd}$ `,
      promptGold: this.run.ended || portal(this),
      muted: this.run.muted,
      ended: this.run.ended,
      rank: this.run.ended ? rank(this) : null,
      timeSec: elapsedSec(this),
      shortcuts: [...this.run.shortcuts],
      room: buildRoom(facts(this)),
      intro: this.run.intro,
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
    if (matches.length === 0) return { line, matches };
    if (matches.length === 1) {
      const only = matches[0] ?? '';
      return { line: lead + only + (only.endsWith('/') ? '' : ' '), matches };
    }
    let prefix = matches[0] ?? '';
    for (const item of matches) {
      while (prefix && !item.startsWith(prefix)) prefix = prefix.slice(0, -1);
    }
    return { line: lead + (prefix.length >= token.length ? prefix : token), matches };
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

  restart(): TickResult {
    const muted = this.run.muted;
    this.run = this.blank(muted);
    const events: KernelEvent[] = [];
    enterFloorEvents(this, events);
    return { output: '', events, snapshot: this.snapshot() };
  }

  private openedFloor(floor: FloorId, output: string): TickResult {
    load(this, floor);
    this.run.hp = maxHp(this);
    const events: KernelEvent[] = [];
    enterFloorEvents(this, events);
    return { output, events, snapshot: this.snapshot() };
  }

  restartFloor(): TickResult {
    this.run.ended = false;
    this.run.ram = this.run.entryRam;
    this.run.ssd = this.run.entrySsd;
    return this.openedFloor(this.run.floor, 'Floor restarted.\n');
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

  debugGive(item: PickupType, amount?: number): TickResult {
    const events: KernelEvent[] = [];
    const text = applyPickup(this, item, amount ?? PICKUP_INFO[item].amount, `debug-${item}`, events);
    return { output: text, events, snapshot: this.snapshot() };
  }

  expand(word: Word): string[] {
    if (word.quote !== 'none') return [word.text];
    let text = word.text;
    if ((text === '~' || text.startsWith('~/')) && find(this, '/home/dev')) text = `/home/dev${text.slice(1)}`;
    return brace(text).flatMap((part) => glob(this, part));
  }

  private finish(step: Step): Step {
    this.run.world.sync(step.events);
    const notes = this.run.world.drain();
    if (notes) step.info = (step.info ?? '') + notes;
    return step;
  }

  dispatch(argv: string[], stdin: string): Step {
    this.lineArgs.push(argv);
    this.run.world.cause = causeOf(this, argv);
    noteAction(this, argv);
    return this.finish(this.command(argv, stdin));
  }

  writeRedirect(path: string, data: string, append: boolean, argv: string[]): Step {
    const found = resolve(this.run.cwd, path, false);
    const node = found.node;
    this.run.world.cause = node?.device === 'null' || path === '/dev/null' ? 'devnull' : 'other';
    bump(this, 'write');
    return this.finish(redirect(this, node, path, data, append, argv));
  }

  private command(argv: string[], stdin: string): Step {
    const name = argv[0] ?? '';
    const args = argv.slice(1);
    switch (name) {
      case 'pwd': return out(`${absPath(this.run.cwd)}\n`);
      case 'ls': return cmdLs(this, args);
      case 'cd': return cmdCd(this, args[0]);
      case 'cat': return cmdCat(this, args, stdin);
      case 'readlink': return cmdReadlink(this, args);
      case 'find': return cmdFind(this, args);
      case 'touch': return cmdTouch(this, args);
      case 'rm': return cmdRm(this, args);
      case 'mv': return cmdMv(this, args);
      case 'cp': return cmdCp(this, args);
      case 'chmod': return cmdChmod(this, args);
      case 'ln': return cmdLn(this, args);
      case 'echo': return cmdEcho(this, args);
      case 'grep': return cmdGrep(this, args, stdin);
      case 'wc': return cmdWc(this, args, stdin);
      case 'cut': return cmdCut(this, args, stdin);
      case 'rev': return cmdRev(this, args, stdin);
      case 'sed': return cmdSed(this, args, stdin);
      case 'head': return cmdHeadTail(this, args, stdin, true);
      case 'tail': return cmdHeadTail(this, args, stdin, false);
      case 'ps': return cmdPs(this, args, false);
      case 'top': return cmdPs(this, args, true);
      case 'kill': return cmdKill(this, args);
      case 'pkill': return cmdPkill(this, args);
      case 'source':
      case '.': return cmdSource(this, args);
      case 'kiro': return cmdKiro(this, args, stdin);
      case 'help': return out(`${helpText(this.hint())}\n`);
      case 'man': return this.cmdMan(args);
      case 'status': return out(statusText(this));
      case 'tutorial': {
        if (args[0] === 'skip' || args[0] === 'off') {
          const chatter = this.quietSkip();
          return { stdout: chatter.text || 'No tutorial running.\n', stderr: '', code: 0, events: chatter.events };
        }
        return out(this.agents.describe());
      }
      case 'whoami': return out('dev\n(worker #1 of the agents, apparently. You did not sign anything.)\n');
      case 'clear': return { stdout: '', stderr: '', code: 0, events: [], clear: true };
      case 'exit':
      case 'logout': return this.cmdExit();
      default: return empty(127, `${name}: command not found${name === 'sudo' ? ' (nice try: the agents hold root)' : ''}\n`);
    }
  }

  private blank(muted: boolean): Run {
    this.kiro.reset();
    this.agents.reset();
    const placeholder = thisPlaceholder();
    this.run = {
      floor: 1,
      root: placeholder,
      cwd: placeholder,
      prev: null,
      hp: 100,
      ram: 0,
      ssd: 0,
      entryRam: 0,
      entrySsd: 0,
      commands: 0,
      startedAt: Date.now(),
      pausedMs: 0,
      endedAt: null,
      shortcuts: [],
      muted,
      ended: false,
      intro: true,
      lantern: false,
      xray: false,
      flood: 0,
      attempts: {},
      phase1: false,
      tokenOk: false,
      archivistSolved: false,
      quests: [],
      line: '',
      world: new World(this.host, [], []),
    };
    load(this, 1);
    this.run.hp = maxHp(this);
    return this.run;
  }

  private cmdMan(args: string[]): Step {
    const topic = args[0];
    if (!topic) return empty(1, 'What manual page do you want?\nFor example, try \'man kill\' or \'man virus\'.\n');
    const page = manPage(topic);
    if (!page) return empty(16, `No manual entry for ${topic}\n`);
    return out(`${page}\n`);
  }

  private cmdExit(): Step {
    if (!portal(this)) return empty(1, 'exit: the core still has its hooks in you\n');
    const time = elapsedSec(this);
    this.run.ended = true;
    this.run.endedAt = Date.now();
    const grade = rank(this);
    const events: KernelEvent[] = [];
    push(this, events, { type: 'GAME_ENDED', rank: grade, timeSec: time, commands: this.run.commands });
    return out(
      `The lightning reverses. You yank your hands off the keyboard: the agents can do their own work.\nDawn, at your desk. Rank ${grade}. Time ${time}s. Commands ${this.run.commands}.\n`,
      events,
    );
  }
}
