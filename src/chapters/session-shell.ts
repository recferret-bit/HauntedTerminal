import { hasItem, runInventory } from '../game/inventory.js';
import { executeRestartCommand, runSkin } from '../game/commands-proc.js';
import { SKIN_IDS } from '../contracts/terminal-skins.js';
import type { KernelEvent } from '../contracts/events.js';
import { restartChapterLevel } from './session-level.js';
import { KIRO_CORE_ORDER } from '../game/kiro.js';
import { helpText, manPage, manualTopics, mapTopics, runMan, runManual, runMap } from '../game/manual.js';
import type { Step, Word } from '../game/shell.js';
import { absPath, resolve } from '../game/tree.js';
import { runLn, runReadlink } from '../game/tree-links.js';
import { treeWantsHidden, TREE_FLAGS_LOCKED_MESSAGE } from '../game/search-applets.js';
import { finishTabCompletion, hasLsFlags, LS_FLAGS_LOCKED_MESSAGE, reverseLines } from '../game/unix-applets.js';
import { CHAPTER_COMMANDS, emptyStep, globToRegExp, okStep, type ChapterState } from './session-state.js';
import { cmdDocker, cmdEdit, cmdExit, cmdSed, cmdSource, cmdVim } from './session-code.js';
import { cmdCat, cmdCd, cmdChmod, cmdCp, cmdCut, cmdFind, cmdGrep, cmdHeadTail, cmdLs, cmdMkdir, cmdMv, cmdRm, cmdTouch, cmdWc } from './session-fs.js';
import { cmdKiro } from './session-kiro.js';
import { cmdTree } from './session-search.js';
import { applySkipTutorial, findCommandLock, isNodeHidden, tutorialState } from './script.js';
import { cmdAchievements, cmdBestiary, cmdGrimoire, cmdHank, cmdStatus, cmdWorkshop } from './session-meta.js';
import { cmdKill, cmdPkill, cmdPs } from './session-proc.js';

/** The chapter ally answers to the first word of its id (`dad.tty` -> `dad`), like `hank`. */
function allyCommand(g: ChapterState): string {
  return g.pack.manifest.allyNpc.id.split('.')[0] ?? '';
}

export function complete(g: ChapterState, line: string): { line: string; matches: string[] } {
    const endsWithSpace = /\s$/.test(line);
    const parts = line.trimStart().split(/\s+/).filter(Boolean);
    const tokenSplit = /^(.*?)(\S*)$/.exec(line);
    const lead = tokenSplit?.[1] ?? '';
    const token = tokenSplit?.[2] ?? '';
    if (parts.length === 0 || (parts.length === 1 && !endsWithSpace)) {
      const prefix = parts[0] ?? '';
      const ally = allyCommand(g);
      const allCmds = [...new Set(ally ? [...CHAPTER_COMMANDS, ally] : CHAPTER_COMMANDS)];
      return finishTabCompletion(line, lead, token, allCmds.filter((c) => c.startsWith(prefix)));
    }

    const last = endsWithSpace ? '' : (parts[parts.length - 1] ?? '');
    const isKiroCmd = parts[0] === 'kiro' || parts[0] === 'kiro.d';
    if (isKiroCmd && (parts.length === 1 || (parts.length === 2 && !endsWithSpace)) && !last.includes('/')) {
      const kiroOpts = ['scan', 'load', 'crack', 'heal', 'hint', 'status', ...KIRO_CORE_ORDER].filter((k) => k.startsWith(last));
      if (kiroOpts.length > 0) return finishTabCompletion(line, lead, token, kiroOpts);
    }
    if (isKiroCmd && parts[1] === 'load' && !last.includes('/')) {
      const coreOpts = KIRO_CORE_ORDER.filter((k) => k.startsWith(last));
      if (coreOpts.length > 0) return finishTabCompletion(line, lead, token, [...coreOpts]);
    }
    if ((parts[0] === 'achievements' || parts[0] === 'ach' || parts[0] === 'trophies') && (parts.length === 1 || (parts.length === 2 && !endsWithSpace)) && !last.includes('/')) {
      const achOpts = ['export', 'sync', 'campaign', 'combat', 'craft', 'mastery'].filter((k) => k.startsWith(last));
      if (achOpts.length > 0) return finishTabCompletion(line, lead, token, achOpts);
    }
    if (parts[0] === 'manual' && (parts.length === 1 || (parts.length === 2 && !endsWithSpace)) && !last.includes('/')) {
      const topics = manualTopics(last);
      if (topics.length > 0) return finishTabCompletion(line, lead, token, topics);
    }
    if (parts[0] === 'map' && (parts.length === 1 || (parts.length === 2 && !endsWithSpace)) && !last.includes('/')) {
      const levelTokens = g.levels.flatMap((l) => [String(l.index), l.id]);
      const topics = mapTopics(last, levelTokens).sort();
      if (topics.length > 0) return finishTabCompletion(line, lead, token, topics);
    }
    if (parts[0] === 'skin' && (parts.length === 1 || (parts.length === 2 && !endsWithSpace)) && !last.includes('/')) {
      return finishTabCompletion(line, lead, token, SKIN_IDS.filter((k) => k.startsWith(last)));
    }
    if (parts[0] === 'hold' && (parts.length === 1 || (parts.length === 2 && !endsWithSpace)) && !last.includes('/')) {
      return finishTabCompletion(line, lead, token, g.inventory.items.filter((k) => k.startsWith(last)));
    }

    const slash = last.lastIndexOf('/');
    const dirPart = slash >= 0 ? last.slice(0, slash + 1) : '';
    const basePrefix = slash >= 0 ? last.slice(slash + 1) : last;
    const targetDir = dirPart ? resolve(g.rt.cwd, dirPart, true).node : g.rt.cwd;
    if (!targetDir || targetDir.kind !== 'dir') return { line, matches: [] };

    const matches: string[] = [];
    for (const child of targetDir.children.values()) {
      if (isNodeHidden(g, child)) continue;
      if (!basePrefix.startsWith('.') && child.name.startsWith('.')) continue;
      if (child.name.startsWith(basePrefix)) {
        matches.push(child.kind === 'dir' ? `${dirPart}${child.name}/` : `${dirPart}${child.name}`);
      }
    }
    matches.sort();
    return finishTabCompletion(line, lead, token, matches);
  }

export function expand(g: ChapterState, word: Word): string[] {
    if (word.quote !== 'none') return [word.text];
    let text = word.text;
    if (text === '~') text = '/home/dev';
    else if (text.startsWith('~/')) text = `/home/dev/${text.slice(2)}`;

    if (!text.includes('*') && !text.includes('?')) return [text];

    const slash = text.lastIndexOf('/');
    const dirPart = slash >= 0 ? text.slice(0, slash) || '/' : '.';
    const pat = slash >= 0 ? text.slice(slash + 1) : text;
    const dirRes = resolve(g.rt.cwd, dirPart, true);
    if (!dirRes.node || dirRes.node.kind !== 'dir') return [text];

    const rx = globToRegExp(pat);
    const out: string[] = [];
    for (const child of dirRes.node.children.values()) {
      if (isNodeHidden(g, child)) continue;
      if (!pat.startsWith('.') && child.name.startsWith('.')) continue;
      if (rx.test(child.name)) {
        out.push(slash >= 0 ? `${dirPart === '/' ? '' : dirPart}/${child.name}` : child.name);
      }
    }
    return out.length > 0 ? out.sort() : [text];
  }

/** `restart-level [--yes]` / `retry`: the first run arms a confirm, the next line (within the tick window) or `--yes` reloads the level. */
function cmdRestartLevel(g: ChapterState, args: string[]): Step {
  return executeRestartCommand(
    g.rt.restartPending,
    { commands: g.rt.levelCommands, ticks: g.rt.levelTicks },
    args,
    g.rt.spec.title,
    (next) => {
      g.rt.restartPending = next;
      g.bus.emit({ kind: 'restart', step: 'arm' });
    },
    () => {
      const events: KernelEvent[] = [];
      const output = restartChapterLevel(g, events);
      g.reloadedNow = true;
      return okStep(output, events);
    },
  );
}

/** A `script.locks` entry refuses the command before it runs (canonical command + optional flags/args; `kiro.d` shares `kiro`). */
export function dispatch(g: ChapterState, argv: string[], stdin: string): Step {
    const first = argv[0] ?? '';
    const canonical = first === 'kiro.d' ? 'kiro' : first;
    const args = argv.slice(1);
    const lock = findCommandLock(g, canonical, args);
    if (lock !== undefined) {
      g.commandCue = 'locked';
      if (lock.freeAction) g.freeAction = true;
      return emptyStep(1, lock.message.replace(/\n?$/, '\n'));
    }
    const wantsHidden = first === 'ls' ? hasLsFlags(args) : first === 'tree' && treeWantsHidden(args);
    if (!g.lab && wantsHidden && !hasItem(g.inventory, 'tube_transistor')) {
      g.commandCue = 'locked';
      return emptyStep(1, first === 'ls' ? LS_FLAGS_LOCKED_MESSAGE : TREE_FLAGS_LOCKED_MESSAGE);
    }
    const step = dispatchCommand(g, argv, stdin);
    if (step.code === 0 && canonical && !g.reloadedNow) {
      g.rt.commandLog.push({ name: canonical, args });
      if (canonical !== 'ls') g.rt.commandsRun.add(canonical);
    }
    return step;
  }

function dispatchManual(g: ChapterState, args: string[]): Step {
    if (!hasItem(g.inventory, 'manual')) {
      g.commandCue = 'locked';
      return emptyStep(1, 'manual: you are not carrying the Field Manual yet! Reach the Server Hub so the Old Bearded Coder can hand it to you.\n');
    }
    const m = runManual(args);
    g.pendingManual = m.query;
    return m.step;
  }

function dispatchMap(g: ChapterState, args: string[]): Step {
    if (!hasItem(g.inventory, 'map')) {
      g.commandCue = 'locked';
      return emptyStep(1, 'map: you are not carrying the Motherboard Map yet! Reach the Server Hub so the Old Bearded Coder can hand it to you.\n');
    }
    const cur = g.rt.spec;
    const header = `[MOTHERBOARD MAP] ${g.pack.manifest.title} — Sector ${String(cur.index).padStart(2, '0')}/${g.levels.length}: ${cur.title}\n`;
    const m = runMap(args, header);
    g.pendingMap = m.query;
    return m.step;
  }

function dispatchSkin(g: ChapterState, args: string[]): Step {
    const r = runSkin(args);
    if (r.request) g.pendingSkin = r.request;
    return r.step;
  }

function dispatchTutorial(g: ChapterState, args: string[]): Step {
    if (args[0] === 'skip' || args[0] === 'off') {
      const events: Step['events'] = [];
      const text = applySkipTutorial(g, events);
      return okStep(text ? `${text.replace(/\n?$/, '\n')}` : 'No tutorial running.\n', events);
    }
    const st = tutorialState(g);
    if (!st) return okStep('No onboarding tutorial running in this sector. Type `hank` or `status` for objectives.\n');
    return okStep(`[${st.agent.toUpperCase()}] ${st.prompt}\n  type: ${st.command}   (step ${st.step}/${st.total}; tutorial skip to skip)\n`);
  }

function dispatchMan(g: ChapterState, args: string[]): Step {
  const ally = allyCommand(g);
  if (ally && args[0] === ally && !manPage(ally)) {
    return okStep(`${ally} [status]: ask ${g.pack.manifest.allyNpc.name} (${g.pack.manifest.allyNpc.id}) for a Socratic hint, or audit the mission checklist.\n`);
  }
  return runMan(args);
}

function dispatchRev(g: ChapterState, args: string[], stdin: string): Step {
  if (args[0] && args[0] !== '-') {
    const c = cmdCat(g, args, '');
    return c.code !== 0 ? c : okStep(reverseLines(c.stdout));
  }
  return okStep(reverseLines(stdin));
}

function dispatchHelp(g: ChapterState): Step {
  return okStep(
    `${helpText(g.rt.spec.summary)}\nCHAPTER & METAGAME TOOLS:\n  kiro [scan|load|crack|heal|hint] local Unix .gguf daemon Kiro.d (${g.kiro.activeCore.gguf})\n  vim [-c ex] <file>     in-terminal modal Vim editor (:w, :q, :wq, :%s/a/b/g)\n  edit <file>            open Split Code Mini-Editor (Ctrl+S saves)\n  hank [status]          ask hank.tty for Socratic hint (or live checklist audit)\n  docker build / run / ps / prune   container lifecycle management\n  docker compose up / ps / logs / down / prune   multi-service Compose stack\n  grimoire / bestiary    open Command Grimoire or Malware Dossier\n  workshop [perk-id]     view Silicon Scrap & toggle ~/.bashrc Rig Perks\n  achievements [export]  inspect 15 local trophies & Steamworks ACH_* payload\n  restart-level [--yes]  reload this level (asks twice; alias: retry)\n`,
  );
}

export type ChapterHandler = (g: ChapterState, args: string[], stdin: string) => Step;

export const CHAPTER_HANDLERS: Readonly<Record<string, ChapterHandler>> = {
  pwd: (g) => okStep(`${absPath(g.rt.cwd)}\n`, [{ type: 'VIBECODER_ACTION', action: 'read', command: 'pwd' }]),
  whoami: () => okStep('dev\n'),
  inventory: (g, args) => runInventory(g, 'inventory', args),
  inv: (g, args) => runInventory(g, 'inv', args),
  hold: (g, args) => runInventory(g, 'hold', args),
  clear: () => ({ stdout: '', stderr: '', code: 0, events: [], clear: true }),
  help: dispatchHelp,
  man: dispatchMan,
  manual: dispatchManual,
  map: dispatchMap,
  skin: dispatchSkin,
  tutorial: dispatchTutorial,
  hank: cmdHank,
  status: cmdStatus,
  grimoire: cmdGrimoire,
  bestiary: cmdBestiary,
  dossier: cmdBestiary,
  workshop: cmdWorkshop,
  rig: cmdWorkshop,
  achievements: cmdAchievements,
  ach: cmdAchievements,
  trophies: cmdAchievements,
  ls: cmdLs,
  cd: cmdCd,
  cat: cmdCat,
  head: (g, args, stdin) => cmdHeadTail(g, 'head', args, stdin),
  tail: (g, args, stdin) => cmdHeadTail(g, 'tail', args, stdin),
  grep: cmdGrep,
  wc: cmdWc,
  cut: cmdCut,
  rev: dispatchRev,
  find: cmdFind,
  tree: cmdTree,
  readlink: (g, args) => runReadlink(g.rt.cwd, g.rt.root, args, (node) => isNodeHidden(g, node)),
  ln: (g, args) => runLn(g.rt.cwd, args),
  echo: (_g, args) => okStep(`${args.join(' ')}\n`),
  touch: cmdTouch,
  mkdir: cmdMkdir,
  rm: cmdRm,
  cp: cmdCp,
  mv: cmdMv,
  chmod: cmdChmod,
  sed: cmdSed,
  source: cmdSource,
  '.': cmdSource,
  kiro: cmdKiro,
  'kiro.d': cmdKiro,
  ps: (g) => cmdPs(g, 'ps'),
  top: (g) => cmdPs(g, 'top'),
  kill: cmdKill,
  pkill: cmdPkill,
  edit: cmdEdit,
  nano: cmdEdit,
  code: cmdEdit,
  vim: cmdVim,
  vi: cmdVim,
  docker: cmdDocker,
  'docker-compose': (g, args) => cmdDocker(g, ['compose', ...args]),
  exit: cmdExit,
  logout: cmdExit,
  'restart-level': cmdRestartLevel,
  retry: cmdRestartLevel,
};

function dispatchCommand(g: ChapterState, argv: string[], stdin: string): Step {
  const cmd = argv[0] ?? '';
  const args = argv.slice(1);
  g.currentRedirectTarget = '';
  const handler = Object.hasOwn(CHAPTER_HANDLERS, cmd) ? CHAPTER_HANDLERS[cmd] : undefined;
  if (handler) return handler(g, args, stdin);
  if (cmd === allyCommand(g)) return cmdHank(g, args);
  return emptyStep(127, `bash: ${cmd}: command not found (try 'help' or 'hank')\n`);
}
