import type { KernelEvent } from '../contracts/events.js';
import type { TerminalSkinId } from '../contracts/terminal-skins.js';
import { cmdChmod, cmdCp, cmdLn, cmdMv, cmdRm, cmdTouch, redirect } from './commands-fs.js';
import { cmdCd, cmdFind, cmdLs, cmdReadlink } from './commands-move.js';
import { cmdKill, cmdPkill, cmdPs, cmdSource, runSkin } from './commands-proc.js';
import { cmdCat, cmdCut, cmdEcho, cmdGrep, cmdHeadTail, cmdRev, cmdSed, cmdWc } from './commands-text.js';
import { runInventory } from './inventory.js';
import { helpText, runMan, runManual, runMap } from './manual.js';
import { empty, out, type Play } from './play.js';
import { cmdKiro, statusText } from './puzzle.js';
import { bump, causeOf, elapsedSec, noteAction, portal, push, rank } from './runtime.js';
import type { Step } from './shell.js';
import { absPath, resolve } from './tree.js';

export interface ClassicShellHost extends Play {
  hint(): string;
  recordLineArgs(argv: string[]): void;
  setManualQuery(query: string | null): void;
  setMapQuery(query: string | null): void;
  setSkinRequest(id: TerminalSkinId): void;
  quietSkip(): { text: string; events: KernelEvent[] };
  restartLevel(args: string[]): Step;
  finishStep(step: Step): Step;
}

type ClassicHandler = (g: ClassicShellHost, args: string[], stdin: string) => Step;

function cmdClassicExit(g: Play): Step {
  if (!portal(g)) return empty(1, 'exit: the core still has its hooks in you\n');
  const time = elapsedSec(g);
  g.run.ended = true;
  g.run.endedAt = Date.now();
  const grade = rank(g);
  const events: KernelEvent[] = [];
  push(g, events, { type: 'GAME_ENDED', rank: grade, timeSec: time, commands: g.run.commands });
  return out(
    `The lightning reverses. You yank your hands off the keyboard: the agents can do their own work.\nDawn, at your desk. Rank ${grade}. Time ${time}s. Commands ${g.run.commands}.\n`,
    events,
  );
}

const CLASSIC_HANDLERS: Record<string, ClassicHandler> = {
  pwd: (g) => out(`${absPath(g.run.cwd)}\n`),
  ls: (g, args) => cmdLs(g, args),
  cd: (g, args) => cmdCd(g, args[0]),
  cat: (g, args, stdin) => cmdCat(g, args, stdin),
  readlink: (g, args) => cmdReadlink(g, args),
  find: (g, args) => cmdFind(g, args),
  touch: (g, args) => cmdTouch(g, args),
  rm: (g, args) => cmdRm(g, args),
  mv: (g, args) => cmdMv(g, args),
  cp: (g, args) => cmdCp(g, args),
  chmod: (g, args) => cmdChmod(g, args),
  ln: (g, args) => cmdLn(g, args),
  echo: (g, args) => cmdEcho(g, args),
  grep: (g, args, stdin) => cmdGrep(g, args, stdin),
  wc: (g, args, stdin) => cmdWc(g, args, stdin),
  cut: (g, args, stdin) => cmdCut(g, args, stdin),
  rev: (g, args, stdin) => cmdRev(g, args, stdin),
  sed: (g, args, stdin) => cmdSed(g, args, stdin),
  head: (g, args, stdin) => cmdHeadTail(g, args, stdin, true),
  tail: (g, args, stdin) => cmdHeadTail(g, args, stdin, false),
  ps: (g, args) => cmdPs(g, args, false),
  top: (g, args) => cmdPs(g, args, true),
  kill: (g, args) => cmdKill(g, args),
  pkill: (g, args) => cmdPkill(g, args),
  source: (g, args) => cmdSource(g, args),
  '.': (g, args) => cmdSource(g, args),
  kiro: (g, args, stdin) => cmdKiro(g, args, stdin),
  help: (g) => out(`${helpText(g.hint())}\n`),
  man: (_g, args) => runMan(args),
  'restart-level': (g, args) => g.restartLevel(args),
  retry: (g, args) => g.restartLevel(args),
  manual: (g, args) => {
    const m = runManual(args);
    g.setManualQuery(m.query);
    return m.step;
  },
  map: (g, args) => {
    const m = runMap(args);
    g.setMapQuery(m.query);
    return m.step;
  },
  skin: (g, args) => {
    const r = runSkin(args);
    if (r.request) g.setSkinRequest(r.request);
    return r.step;
  },
  status: (g) => out(statusText(g)),
  tutorial: (g, args) => {
    if (args[0] === 'skip' || args[0] === 'off') {
      const chatter = g.quietSkip();
      return { stdout: chatter.text || 'No tutorial running.\n', stderr: '', code: 0, events: chatter.events };
    }
    return out(g.agents.describe());
  },
  whoami: () => out('dev\n(worker #1 of the agents, apparently. You did not sign anything.)\n'),
  inventory: (g, args) => runInventory(g.run, 'inventory', args),
  inv: (g, args) => runInventory(g.run, 'inv', args),
  hold: (g, args) => runInventory(g.run, 'hold', args),
  clear: () => ({ stdout: '', stderr: '', code: 0, events: [], clear: true }),
  exit: (g) => cmdClassicExit(g),
  logout: (g) => cmdClassicExit(g),
};

export function dispatchClassicCommand(g: ClassicShellHost, argv: string[], stdin: string): Step {
  g.recordLineArgs(argv);
  g.run.world.cause = causeOf(g, argv);
  noteAction(g, argv);
  const name = argv[0] ?? '';
  const handler = Object.hasOwn(CLASSIC_HANDLERS, name) ? CLASSIC_HANDLERS[name] : undefined;
  const step = handler
    ? handler(g, argv.slice(1), stdin)
    : empty(127, `${name}: command not found${name === 'sudo' ? ' (nice try: the agents hold root)' : ''}\n`);
  return g.finishStep(step);
}

export function writeClassicRedirect(
  g: ClassicShellHost,
  path: string,
  data: string,
  append: boolean,
  argv: string[],
): Step {
  const found = resolve(g.run.cwd, path, false);
  const node = found.node;
  g.run.world.cause = node?.device === 'null' || path === '/dev/null' ? 'devnull' : 'other';
  bump(g, 'write');
  return g.finishStep(redirect(g, node, path, data, append, argv));
}
