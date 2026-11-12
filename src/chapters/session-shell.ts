import { KIRO_CORE_ORDER } from '../game/kiro.js';
import { helpText, manPage } from '../game/manual.js';
import type { Step, Word } from '../game/shell.js';
import { absPath, resolve } from '../game/tree.js';
import { CHAPTER_COMMANDS, emptyStep, globToRegExp, okStep, type ChapterState } from './session-state.js';
import { cmdDocker, cmdEdit, cmdExit, cmdSed, cmdSource } from './session-code.js';
import { cmdCat, cmdCd, cmdChmod, cmdCp, cmdCut, cmdFind, cmdGrep, cmdHeadTail, cmdLs, cmdMkdir, cmdMv, cmdRm, cmdTouch, cmdWc } from './session-fs.js';
import { cmdKiro } from './session-kiro.js';
import { isNodeHidden } from './script.js';
import { cmdBestiary, cmdGrimoire, cmdHank, cmdStatus, cmdWorkshop } from './session-meta.js';
import { cmdKill, cmdPs } from './session-proc.js';

/** The chapter ally answers to the first word of its id (`dad.tty` -> `dad`), like `hank`. */
function allyCommand(g: ChapterState): string {
  return g.pack.manifest.allyNpc.id.split('.')[0] ?? '';
}

export function complete(g: ChapterState, line: string): { line: string; matches: string[] } {
    const endsWithSpace = /\s$/.test(line);
    const parts = line.trimStart().split(/\s+/).filter(Boolean);
    if (parts.length === 0 || (parts.length === 1 && !endsWithSpace)) {
      const prefix = parts[0] ?? '';
      const matches = [...CHAPTER_COMMANDS, allyCommand(g)].filter((c) => c.startsWith(prefix));
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

export function dispatch(g: ChapterState, argv: string[], stdin: string): Step {
    const cmd = argv[0] ?? '';
    const args = argv.slice(1);
    g.currentRedirectTarget = '';

    switch (cmd) {
      case 'pwd':
        return okStep(`${absPath(g.rt.cwd)}\n`, [{ type: 'VIBECODER_ACTION', action: 'read', command: 'pwd' }]);
      case 'whoami':
        return okStep('dev\n');
      case 'clear':
        return { stdout: '', stderr: '', code: 0, events: [], clear: true };
      case 'help':
        return okStep(
          `${helpText(g.rt.spec.summary)}\nCHAPTER & METAGAME TOOLS:\n  kiro [scan|load|crack] local .gguf Ghost companion (${g.kiro.activeCore.gguf})\n  edit <file>            open Split Code Mini-Editor (Ctrl+S saves)\n  hank [status]          ask hank.tty for Socratic hint (or live checklist audit)\n  docker build / run     build & run Dockerfile container image\n  docker compose up -d   orchestrate multi-service Compose stack\n  grimoire / bestiary    open Command Grimoire or Malware Dossier\n  workshop [perk-id]     view Silicon Scrap & toggle ~/.bashrc Rig Perks\n  tactical               toggle turn-based Tactical Mode (${g.tacticalMode ? 'ON' : 'OFF'})\n`,
        );
      case 'man':
        return okStep(`${manPage(args[0] ?? '')}\n`);
      case 'tactical': {
        g.tacticalMode = args[0] === 'off' ? false : args[0] === 'on' ? true : !g.tacticalMode;
        return okStep(`Tactical Mode: ${g.tacticalMode ? 'ENABLED (turn-based clock)' : 'DISABLED (real-time clock)'}\n`);
      }
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
        return cmdExit(g);
      default:
        if (cmd === allyCommand(g)) return cmdHank(g, args);
        return emptyStep(127, `bash: ${cmd}: command not found (try 'help' or 'hank')\n`);
    }
  }
