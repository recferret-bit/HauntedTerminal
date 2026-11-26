import type { KernelEvent } from '../contracts/events.js';
import type { AgentDirector } from './agents.js';
import type { World, WorldHost } from './entities.js';
import type { LabConfig, LabLevelState } from './lab-types.js';
import type { Inventory } from './inventory.js';
import type { FloorId } from './types.js';
import type { KiroCompanion } from './kiro.js';
import type { Sfx } from './sfx.js';
import type { Step } from './shell.js';
import type { VNode } from './tree.js';

export interface Quest {
  id: number;
  name: string;
  content: string;
  mode: number;
  uid: number;
  parentPath: string;
  missing: number;
}

export interface Run {
  floor: FloorId;
  root: VNode;
  cwd: VNode;
  prev: VNode | null;
  hp: number;
  /** GB of RAM / SSD collected. Persist across floors. */
  ram: number;
  ssd: number;
  /** RAM / SSD when this floor was entered: a floor restart puts them back. */
  entryRam: number;
  entrySsd: number;
  commands: number;
  startedAt: number;
  /** Milliseconds spent paused (intro, title cards, outro): not part of the run time or the rank. */
  pausedMs: number;
  /** When `exit` succeeded: the clock stops. */
  endedAt: number | null;
  shortcuts: string[];
  muted: boolean;
  ended: boolean;
  intro: boolean;
  lantern: boolean;
  /** What he carries and holds; kept across floors. */
  inventory: Inventory;
  xray: boolean;
  flood: number;
  attempts: Record<string, number>;
  phase1: boolean;
  tokenOk: boolean;
  archivistSolved: boolean;
  quests: Quest[];
  line: string;
  world: World;
  filesRead: Set<string>;
  socketInputs: Map<string, string>;
  lab: LabLevelState;
}

export type HeroAction = Extract<KernelEvent, { type: 'VIBECODER_ACTION' }>['action'];
export const ACTION_RANK: Record<HeroAction, number> = { type: 0, read: 1, write: 2, lantern: 3, cast: 4, collect: 5 };
export const READERS = new Set(['cat', 'grep', 'head', 'tail', 'wc', 'cut', 'rev', 'find', 'readlink', 'ps', 'top', 'ls', 'man', 'manual', 'help', 'status', 'pwd', 'whoami']);
export const WRITERS = new Set(['touch', 'cp', 'ln', 'mv', 'rm', 'chmod', 'sed', 'echo']);
export const SHELL_PID = 4242;
/** Rooms the floors cannot be finished without (cron_restorer only restores files). */
export const LOAD_BEARING = new Set(['cellar_hatch', 'iron_gate', 'chasm', 'crypt_stairs', 'pedestal', 'hidden_wing', 'boiler_shaft', 'furnace_hall', 'core_elevator', 'catwalk', 'entrance']);

export interface Play {
  readonly sfx: Sfx;
  readonly kiro: KiroCompanion;
  readonly agents: AgentDirector;
  readonly host: WorldHost;
  readonly lab: LabConfig | null;
  run: Run;
  deadNow: boolean;
  deathText: string;
  act: { action: HeroAction; target?: string };
  paused: boolean;
  pausedAt: number | null;
}

export const empty = (code = 0, stderr = ''): Step => ({ stdout: '', stderr, code, events: [] });
export const out = (stdout: string, events: KernelEvent[] = [], code = 0, stderr = ''): Step => ({ stdout, stderr, code, events });

/** `-rf` and `--force` contribute their letters. A bare `-` stays a path. */
export function splitShortFlags(args: string[]): { flags: string; paths: string[] } {
  let flags = '';
  const paths: string[] = [];
  for (const arg of args) {
    if (arg.startsWith('-') && arg.length > 1) flags += arg.slice(1);
    else paths.push(arg);
  }
  return { flags, paths };
}

export { globToRegExp as globReg } from './unix-applets.js';

export function brace(word: string): string[] {
  const open = word.indexOf('{');
  const close = word.indexOf('}', open + 1);
  if (open < 0 || close < 0 || word.slice(open + 1, close).includes('{')) return [word];
  const pre = word.slice(0, open);
  const body = word.slice(open + 1, close);
  const post = word.slice(close + 1);
  if (!body.includes(',')) return [word];
  return body.split(',').flatMap((piece) => brace(pre + piece + post));
}

export function splitPath(path: string): { dir: string; base: string } {
  const slash = path.replace(/\/+$/, '').lastIndexOf('/');
  const trimmed = path.replace(/\/+$/, '') || path;
  return { dir: slash < 0 ? '.' : trimmed.slice(0, slash) || '/', base: slash < 0 ? trimmed : trimmed.slice(slash + 1) };
}

export function thisPlaceholder(): VNode {
  return {
    id: 0,
    name: '',
    kind: 'dir',
    mode: 0o755,
    uid: 0,
    content: '',
    parent: null,
    children: new Map(),
  };
}
