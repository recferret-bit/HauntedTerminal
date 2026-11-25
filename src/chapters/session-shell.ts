import { runInventory } from '../game/inventory.js';
import { armMessage, decideRestart, parseRestartArgs, runSkin } from '../game/commands-proc.js';
import { SKIN_IDS } from '../contracts/terminal-skins.js';
import type { KernelEvent } from '../contracts/events.js';
import { rebootLevel } from './session-level.js';
import { KIRO_CORE_ORDER } from '../game/kiro.js';
import { helpText, manPage, manualTopics, mapTopics, runMan, runManual, runMap } from '../game/manual.js';
import type { Step, Word } from '../game/shell.js';
import { absPath, resolve } from '../game/tree.js';
import { runLn, runReadlink } from '../game/tree-links.js';
import { CHAPTER_COMMANDS, emptyStep, globToRegExp, okStep, type ChapterState } from './session-state.js';
import { cmdDocker, cmdEdit, cmdExit, cmdSed, cmdSource } from './session-code.js';
import { cmdCat, cmdCd, cmdChmod, cmdCp, cmdCut, cmdFind, cmdGrep, cmdHeadTail, cmdLs, cmdMkdir, cmdMv, cmdRm, cmdTouch, cmdWc } from './session-fs.js';
import { cmdKiro } from './session-kiro.js';
import { applySkipTutorial, isNodeHidden, lockMessage, tutorialState } from './script.js';
import { cmdAchievements, cmdBestiary, cmdGrimoire, cmdHank, cmdStatus, cmdWorkshop } from './session-meta.js';
import { cmdKill, cmdPkill, cmdPs } from './session-proc.js';

/** The chapter ally answers to the first word of its id (`dad.tty` -> `dad`), like `hank`. */
function allyCommand(g: ChapterState): string {
  return g.pack.manifest.allyNpc.id.split('.')[0] ?? '';
}

export function complete(g: ChapterState, line: string): { line: string; matches: string[] } {
    const endsWithSpace = /\s$/.test(line);
    const parts = line.trimStart().split(/\s+/).filter(Boolean);
    if (parts.length === 0 || (parts.length === 1 && !endsWithSpace)) {
      const prefix = parts[0] ?? '';
      const ally = allyCommand(g);
      const allCmds = [...new Set(ally ? [...CHAPTER_COMMANDS, ally] : CHAPTER_COMMANDS)];
      const matches = allCmds.filter((c) => c.startsWith(prefix));
      if (matches.length === 1) return { line: `${matches[0]} `, matches: [...matches] };
      return { line, matches: [...matches] };
    }

    const last = endsWithSpace ? '' : (parts[parts.length - 1] ?? '');
    if (parts[0] === 'kiro' && (parts.length === 1 || (parts.length === 2 && !endsWithSpace)) && !last.includes('/')) {
      const kiroOpts = ['scan', 'load', 'crack', 'status', ...KIRO_CORE_ORDER].filter((k) => k.startsWith(last));
      if (kiroOpts.length === 1) return { line: `kiro ${kiroOpts[0]} `, matches: kiroOpts };
      if (kiroOpts.length > 1) return { line, matches: kiroOpts };
    }
    if (parts[0] === 'kiro' && parts[1] === 'load' && !last.includes('/')) {
      const coreOpts = KIRO_CORE_ORDER.filter((k) => k.startsWith(last));
      if (coreOpts.length === 1) return { line: `kiro load ${coreOpts[0]} `, matches: [...coreOpts] };
      if (coreOpts.length > 1) return { line, matches: [...coreOpts] };
    }
    if ((parts[0] === 'achievements' || parts[0] === 'ach' || parts[0] === 'trophies') && (parts.length === 1 || (parts.length === 2 && !endsWithSpace)) && !last.includes('/')) {
      const achOpts = ['export', 'sync', 'campaign', 'combat', 'craft', 'mastery'].filter((k) => k.startsWith(last));
      if (achOpts.length === 1) return { line: `${parts[0]} ${achOpts[0]} `, matches: achOpts };
      if (achOpts.length > 1) return { line, matches: achOpts };
    }
    if (parts[0] === 'manual' && (parts.length === 1 || (parts.length === 2 && !endsWithSpace)) && !last.includes('/')) {
      const topics = manualTopics(last);
      if (topics.length === 1) return { line: `manual ${topics[0]} `, matches: topics };
      if (topics.length > 1) return { line, matches: topics };
    }
    if (parts[0] === 'map' && (parts.length === 1 || (parts.length === 2 && !endsWithSpace)) && !last.includes('/')) {
      const levelTokens = g.levels.flatMap((l) => [String(l.index), l.id]);
      const topics = mapTopics(last, levelTokens).sort();
      if (topics.length === 1) return { line: `map ${topics[0]} `, matches: topics };
      if (topics.length > 1) return { line, matches: topics };
    }
    if (parts[0] === 'skin' && (parts.length === 1 || (parts.length === 2 && !endsWithSpace)) && !last.includes('/')) {
      const skins = SKIN_IDS.filter((k) => k.startsWith(last));
      if (skins.length === 1) return { line: `skin ${skins[0]} `, matches: [...skins] };
      if (skins.length > 1) return { line, matches: [...skins] };
      return { line, matches: [] };
    }
    if (parts[0] === 'hold' && (parts.length === 1 || (parts.length === 2 && !endsWithSpace)) && !last.includes('/')) {
      const items = g.inventory.items.filter((k) => k.startsWith(last));
      if (items.length === 1) return { line: `hold ${items[0]} `, matches: [...items] };
      if (items.length > 1) return { line, matches: [...items] };
      return { line, matches: [] };
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
    if (matches.length === 1) {
      const head = endsWithSpace ? line : line.slice(0, line.length - last.length);
      const chosen = matches[0]!;
      return { line: `${head}${chosen}${chosen.endsWith('/') ? '' : ' '}`, matches };
    }
    return { line, matches };
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
  const parsed = parseRestartArgs(args);
  if ('error' in parsed) return emptyStep(2, parsed.error);
  const now = { commands: g.rt.levelCommands, ticks: g.rt.levelTicks };
  if (decideRestart(g.rt.restartPending, now, parsed.yes) === 'arm') {
    g.rt.restartPending = { armedAtCommand: now.commands, armedAtTick: now.ticks };
    g.bus.emit({ kind: 'restart', step: 'arm' });
    return okStep(armMessage(g.rt.spec.title));
  }
  const events: KernelEvent[] = [];
  g.bus.emit({ kind: 'restart', step: 'go' });
  const arrival = rebootLevel(g, events);
  g.reloadedNow = true;
  return okStep(`[RETRY] Reloaded ${g.rt.spec.title}.\n${arrival}`, events);
}

/** A `script.locks` entry refuses the command before it runs (`ls`, `ls -a`, `ls -la`: the first word decides). */
export function dispatch(g: ChapterState, argv: string[], stdin: string): Step {
    const locked = lockMessage(g, argv[0] ?? '');
    if (locked !== undefined) {
      g.commandCue = 'locked';
      return emptyStep(1, locked.replace(/\n?$/, '\n'));
    }
    return dispatchCommand(g, argv, stdin);
  }

function dispatchManual(g: ChapterState, args: string[]): Step {
    const m = runManual(args);
    g.pendingManual = m.query;
    return m.step;
  }

function dispatchMap(g: ChapterState, args: string[]): Step {
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

function dispatchCommand(g: ChapterState, argv: string[], stdin: string): Step {
    const cmd = argv[0] ?? '';
    const args = argv.slice(1);
    g.currentRedirectTarget = '';

    switch (cmd) {
      case 'pwd':
        return okStep(`${absPath(g.rt.cwd)}\n`, [{ type: 'VIBECODER_ACTION', action: 'read', command: 'pwd' }]);
      case 'whoami':
        return okStep('dev\n');
      case 'inventory':
      case 'inv':
      case 'hold':
        return runInventory(g, cmd, args);
      case 'clear':
        return { stdout: '', stderr: '', code: 0, events: [], clear: true };
      case 'help':
        return okStep(
          `${helpText(g.rt.spec.summary)}\nCHAPTER & METAGAME TOOLS:\n  kiro [scan|load|crack] local .gguf Ghost companion (${g.kiro.activeCore.gguf})\n  edit <file>            open Split Code Mini-Editor (Ctrl+S saves)\n  hank [status]          ask hank.tty for Socratic hint (or live checklist audit)\n  docker build / run     build & run Dockerfile container image\n  docker compose up -d   orchestrate multi-service Compose stack\n  grimoire / bestiary    open Command Grimoire or Malware Dossier\n  workshop [perk-id]     view Silicon Scrap & toggle ~/.bashrc Rig Perks\n  achievements [export]  inspect 12 local trophies & Steamworks ACH_* payload\n  restart-level [--yes]  reload this level (asks twice; alias: retry)\n`,
        );
      case 'man': {
        const ally = allyCommand(g);
        if (ally && args[0] === ally && !manPage(ally)) {
          return okStep(`${ally} [status]: ask ${g.pack.manifest.allyNpc.name} (${g.pack.manifest.allyNpc.id}) for a Socratic hint, or audit the mission checklist.\n`);
        }
        return runMan(args);
      }
      case 'manual':
        return dispatchManual(g, args);
      case 'map':
        return dispatchMap(g, args);
      case 'skin':
        return dispatchSkin(g, args);
      case 'tutorial':
        return dispatchTutorial(g, args);
      case 'hank':
        return cmdHank(g, args);
      case 'status':
        return cmdStatus(g);
      case 'grimoire':
        return cmdGrimoire(g, args);
      case 'bestiary':
      case 'dossier':
        return cmdBestiary(g, args);
      case 'workshop':
      case 'rig':
        return cmdWorkshop(g, args);
      case 'achievements':
      case 'ach':
      case 'trophies':
        return cmdAchievements(g, args);
      case 'ls':
        return cmdLs(g, args);
      case 'cd':
        return cmdCd(g, args);
      case 'cat':
        return cmdCat(g, args, stdin);
      case 'head':
      case 'tail':
        return cmdHeadTail(g, cmd, args, stdin);
      case 'grep':
        return cmdGrep(g, args, stdin);
      case 'wc':
        return cmdWc(g, args, stdin);
      case 'cut':
        return cmdCut(g, args, stdin);
      case 'rev':
        return okStep(
          stdin
            .split('\n')
            .map((l) => l.split('').reverse().join(''))
            .join('\n'),
        );
      case 'find':
        return cmdFind(g, args);
      case 'readlink':
        return runReadlink(g.rt.cwd, g.rt.root, args, (node) => isNodeHidden(g, node));
      case 'ln':
        return runLn(g.rt.cwd, args);
      case 'echo':
        return okStep(`${args.join(' ')}\n`);
      case 'touch':
        return cmdTouch(g, args);
      case 'mkdir':
        return cmdMkdir(g, args);
      case 'rm':
        return cmdRm(g, args);
      case 'cp':
        return cmdCp(g, args);
      case 'mv':
        return cmdMv(g, args);
      case 'chmod':
        return cmdChmod(g, args);
      case 'sed':
        return cmdSed(g, args, stdin);
      case 'source':
      case '.':
        return cmdSource(g, args);
      case 'kiro':
        return cmdKiro(g, args, stdin);
      case 'ps':
      case 'top':
        return cmdPs(g, cmd);
      case 'kill':
        return cmdKill(g, args);
      case 'pkill':
        return cmdPkill(g, args);
      case 'edit':
      case 'nano':
      case 'vim':
      case 'code':
        return cmdEdit(g, args);
      case 'docker':
        return cmdDocker(g, args);
      case 'docker-compose':
        return cmdDocker(g, ['compose', ...args]);
      case 'exit':
      case 'logout':
        return cmdExit(g);
      case 'restart-level':
      case 'retry':
        return cmdRestartLevel(g, args);
      default:
        if (cmd === allyCommand(g)) return cmdHank(g, args);
        return emptyStep(127, `bash: ${cmd}: command not found (try 'help' or 'hank')\n`);
    }
  }
