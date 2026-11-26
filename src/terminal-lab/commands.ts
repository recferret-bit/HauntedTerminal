import { manPage } from '../game/manual.js';
import { buildLabPack, newLabScript } from './lab-pack.js';
import type { LabDriverKind, LabScript } from './lab-types.js';
import { openLabSession } from './node-driver.js';

/**
 * The Commands panel's data. The list of commands comes from the game session's own Tab completion, so it can never drift from
 * the shell; this file only says how to group and illustrate them. `ungrouped()` reports a command the game added that is not here yet.
 */
const GROUP_ORDER = ['Look', 'Move', 'Files', 'Text', 'Fight', 'Loot & Ghost', 'Code', 'Help & game'] as const;
export type CommandGroup = (typeof GROUP_ORDER)[number];

const GROUPS: Record<CommandGroup, readonly string[]> = {
  Look: ['pwd', 'ls', 'cat', 'readlink', 'find', 'status', 'whoami', 'inventory', 'inv', 'hold'],
  Move: ['cd'],
  Files: ['touch', 'mkdir', 'rm', 'mv', 'cp', 'chmod', 'ln', 'echo'],
  Text: ['grep', 'wc', 'cut', 'rev', 'sed', 'head', 'tail'],
  Fight: ['ps', 'top', 'kill', 'pkill'],
  'Loot & Ghost': ['source', '.', 'kiro', 'kiro.d'],
  Code: ['edit', 'nano', 'docker'],
  'Help & game': ['help', 'man', 'manual', 'map', 'tutorial', 'clear', 'exit', 'logout', 'hank', 'grimoire', 'bestiary', 'workshop', 'achievements', 'restart-level', 'retry', 'skin'],
};

/** A line that runs when the command's Run button is clicked in the default lab room (it has `/lab/readme.txt`). */
const EXAMPLES: Record<string, string> = {
  pwd: 'pwd', ls: 'ls -a', cd: 'cd /lab', cat: 'cat readme.txt', readlink: 'readlink readme.txt', find: 'find . -name "*.txt"',
  touch: 'touch new.txt', mkdir: 'mkdir -p sub', rm: 'rm -f new.txt', mv: 'mv new.txt moved.txt', cp: 'cp readme.txt copy.txt', chmod: 'chmod 644 readme.txt',
  ln: 'ln -s readme.txt link', echo: 'echo hello', grep: 'grep -i lab readme.txt', wc: 'wc -l readme.txt', cut: 'cut -d: -f1 readme.txt',
  rev: 'rev readme.txt', sed: "sed 's/lab/LAB/' readme.txt", head: 'head -n 1 readme.txt', tail: 'tail -n 1 readme.txt', ps: 'ps', top: 'top',
  kill: 'kill -l', pkill: 'pkill nothing', source: 'source readme.txt', '.': '. readme.txt', kiro: 'kiro', 'kiro.d': 'kiro.d', help: 'help', man: 'man ls', manual: 'manual chmod', map: 'map',
  status: 'status', whoami: 'whoami', inventory: 'inventory', inv: 'inv', hold: 'hold tube_transistor', tutorial: 'tutorial', clear: 'clear', exit: 'exit', logout: 'logout', edit: 'edit readme.txt',
  nano: 'nano readme.txt', docker: 'docker images', hank: 'hank', grimoire: 'grimoire', bestiary: 'bestiary', workshop: 'workshop', achievements: 'achievements',
  'restart-level': 'restart-level --yes', retry: 'restart-level --yes', skin: 'skin',
};

/** One-line usage for commands that have no `man` page of their own. */
const USAGE: Record<string, string> = {
  hank: 'hank [status]: the ally gives a Socratic hint, or audits the checklist.',
  edit: 'edit <file>: open the split code editor (Ctrl+S saves).',
  nano: 'nano <file>: same as edit.',
  docker: 'docker build -t <tag> . | run -d -p <port>:<port> <tag> | images | compose up -d',
  grimoire: 'grimoire: the command book of what you have practiced.',
  bestiary: 'bestiary: the malware dossier.',
  workshop: 'workshop [perk-id]: Silicon Scrap and rig perks.',
  'restart-level': 'restart-level [--yes]: reload this level; run it twice to confirm, or add --yes.',
  retry: 'retry [--yes]: same as restart-level.',
};

export interface CommandEntry {
  name: string;
  group: CommandGroup;
  /** First line of the manual, or the usage line. */
  usage: string;
  /** The whole manual page, when there is one. */
  man: string | null;
  /** What Run sends. */
  example: string;
}

const groupOf = (name: string, ally: string): CommandGroup | null => {
  for (const group of GROUP_ORDER) if (GROUPS[group].includes(name)) return group;
  return name === ally ? 'Help & game' : null;
};

/** Commands the game lists that this panel has no group for: the drift check. */
export function ungrouped(names: readonly string[], ally: string): string[] {
  return names.filter((n) => groupOf(n, ally) === null);
}

export function commandEntries(names: readonly string[], ally: string): CommandEntry[] {
  const seen = new Set<string>();
  const out: CommandEntry[] = [];
  for (const name of names) {
    const group = groupOf(name, ally);
    if (!group || seen.has(name)) continue;
    seen.add(name);
    const man = manPage(name) ?? (name === ally ? `${ally} [status]: ask your ally (${ally}.tty) for a Socratic hint, or audit the mission checklist.` : null);
    out.push({
      name,
      group,
      usage: USAGE[name] ?? man?.split('\n')[0] ?? name,
      man,
      example: name === ally ? name : (EXAMPLES[name] ?? name),
    });
  }
  return out.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
}

export function groupedCommands(entries: readonly CommandEntry[]): Array<{ group: CommandGroup; entries: CommandEntry[] }> {
  return GROUP_ORDER.flatMap((group) => {
    const here = entries.filter((e) => e.group === group);
    return here.length > 0 ? [{ group, entries: here }] : [];
  });
}

export interface CommandProbe {
  /** Every name the session completes, in its order. */
  names: string[];
  /** The ally's command (`lab`), which is chapter data. */
  ally: string;
  /** Listed by Tab but answered with "command not found" (exit 127): the shell does not implement it. */
  missing: string[];
}

/** Asks a throwaway session what it completes and which of those it actually runs. */
export function probeCommands(driver: LabDriverKind = 'chapter'): CommandProbe {
  const script: LabScript = driver === 'classic' ? { ...newLabScript('probe', 'Probe'), driver: 'classic' } : newLabScript('probe', 'Probe');
  const names = openLabSession(script).complete('').matches;
  const missing = names.filter((n) => openLabSession(script).exec(n).code === 127);
  const ally = driver === 'classic' ? '' : (buildLabPack(script).pack.manifest.allyNpc.id.split('.')[0] ?? '');
  return { names, ally, missing };
}
