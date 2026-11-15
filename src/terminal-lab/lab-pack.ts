import type { RoomActor } from '../contracts/room-view.js';
import type { LabConfig, LabContent } from '../chapters/session-lab-types.js';
import type { ChapterGrant, ChapterPack, LevelFileSpec, LevelSpec, ScriptStep } from '../chapters/types.js';
import { PICKUP_INFO } from '../game/bestiary.js';
import { isSpeech, speechStep } from './lab-steps.js';
import type { LabScript, LabSetupOp } from './lab-types.js';

/**
 * The Terminal Lab plays a throwaway one-level pack through the game's own `?draft=1` path.
 * `buildLabPack` turns the lab script's `setup` into that pack. The manifest is neutral: no chapter title,
 * no comix, no outro. Nothing here is saved to `chapters/`.
 */
export const LAB_LEVEL_ID = 'lab-1';
export const DEFAULT_PROP_X = [3.8, 4.4, -0.9, 2.2, 4.9];

export interface BuiltLab {
  pack: ChapterPack;
  /** What the lab session adds: clock, props, riddles, checks and task ids. */
  config: LabConfig;
}

export function labPackId(script: LabScript): string {
  return `lab-${script.id.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`;
}

/** The files an op needs, exported so a live `inject` creates the same ones. */
export { impliedFiles };

export function newLabScript(id = 'new-lab', title = 'New lab'): LabScript {
  return {
    id,
    title,
    room: { roomKind: 'lab_hall', floorTheme: 2, mechanic: 'terminal', cwd: '/lab', title, summary: 'A test room. Put something in it.' },
    player: { ram: 0, ssd: 0, core: '' },
    clock: 'manual',
    enemyFire: 'live',
    setup: [{ op: 'file', path: '/lab/readme.txt', content: 'Terminal Lab: put something in the room.\n' }],
    steps: [],
  };
}

const SOURCE_ENEMIES: readonly string[] = ['bug', 'spyware', 'rootkit'];

/**
 * An enemy's file. Binaries are executable (a trojan with no x bit counts as petrified, so it would start out beaten);
 * a bug lives in a line of source that says BUG until someone fixes it.
 */
function enemyFile(type: string, path: string): LevelFileSpec {
  if (type === 'bug') return { path, kind: 'file', content: "def total(a, b):\n    return a - b  # BUG: should add\n" };
  return { path, kind: 'file', mode: SOURCE_ENEMIES.includes(type) ? 0o644 : 0o755, content: `# ${type} process\n` };
}

/** The files the game needs for an op to work: enemies and pickups must have a file, a worm its port dir, an exploit its buffer. */
function impliedFiles(op: LabSetupOp): LevelFileSpec[] {
  switch (op.op) {
    case 'enemy': {
      const files: LevelFileSpec[] = [];
      // A zombie is a bare process: its path is the room it haunts, not a file.
      files.push(op.type === 'zombie' ? { path: op.path, kind: 'dir' } : enemyFile(op.type, op.path));
      if (op.port) files.push({ path: op.port, kind: 'dir' });
      if (op.buffer) files.push({ path: op.buffer, kind: 'file', content: '' });
      return files;
    }
    case 'pickup':
      return [{ path: op.path, kind: 'file', content: PICKUP_INFO[op.type].blurb }];
    case 'riddle':
      return [{ path: op.path, kind: 'socket', content: op.prompt }];
    default:
      return [];
  }
}

/** A setup op without its `op` tag: the plain spec record the game reads. */
function bare<T extends { op: string }>(op: T): Omit<T, 'op'> {
  const { op: _tag, ...rest } = op;
  return rest;
}

function explicitFile(op: LabSetupOp): LevelFileSpec | null {
  switch (op.op) {
    case 'file':
      return { ...bare(op), kind: 'file' };
    case 'dir':
    case 'socket':
      return { ...bare(op), kind: op.op };
    default:
      return null;
  }
}

/** Files by path: implied ones first, then the ones the user wrote, which win. */
function collectFiles(setup: readonly LabSetupOp[]): LevelFileSpec[] {
  const byPath = new Map<string, LevelFileSpec>();
  for (const op of setup) for (const f of impliedFiles(op)) if (!byPath.has(f.path)) byPath.set(f.path, f);
  for (const op of setup) {
    const f = explicitFile(op);
    if (f) byPath.set(f.path, f);
  }
  return [...byPath.values()];
}

function propActor(op: Extract<LabSetupOp, { op: 'prop' }>): RoomActor {
  return { key: 'entity', id: `lab:${op.id}`, model: op.model, kind: 'prop', state: 'idle', x: op.x, y: op.y, hidden: false, label: op.label ?? op.id };
}

function arrivalSteps(setup: readonly LabSetupOp[]): ScriptStep[] {
  return setup.flatMap((op) => (isSpeech(op) ? [speechStep(op)] : []));
}

/** The riddles, lab checks and task ids the session needs next to the pack. */
function contentOf(setup: readonly LabSetupOp[]): LabContent {
  return {
    riddles: setup.flatMap((op) =>
      op.op === 'riddle'
        ? [{ id: op.id, path: op.path, speaker: op.speaker ?? 'Socket', prompt: op.prompt, answer: op.answer, hints: op.hints ?? [], success: op.success ?? 'The lock clicks open.', opens: op.opens, tokens: op.tokens ?? [] }]
        : [],
    ),
    checks: setup.flatMap((op) => (op.op === 'check' ? [{ id: op.id, description: op.description, when: op.when }] : [])),
    taskIds: setup.flatMap((op) => (op.op === 'task' ? [op.id] : [])),
  };
}

/** Three hint rungs for `hank` and the HINT button: the first riddle's hints, the last one repeated. */
function hankRungs(setup: readonly LabSetupOp[]): [string, string, string] {
  const riddle = setup.find((op) => op.op === 'riddle');
  const hints = riddle?.op === 'riddle' && riddle.hints && riddle.hints.length > 0 ? riddle.hints : ['This is a test room. Try ls.', 'Everything you placed is in this directory.', 'Nothing here can hurt you.'];
  return [hints[0]!, hints[1] ?? hints[0]!, hints[2] ?? hints[1] ?? hints[0]!];
}

function grantsOf(script: LabScript): ChapterGrant[] {
  const { ram, ssd, core } = script.player;
  if (!ram && !ssd && !core) return [];
  return [{ afterLevel: 0, ram: ram || undefined, ssd: ssd || undefined, core: core || undefined }];
}

function levelOf(script: LabScript): LevelSpec {
  const { room, setup } = script;
  const arrival = arrivalSteps(setup);
  const level: LevelSpec = {
    id: LAB_LEVEL_ID,
    index: 1,
    title: room.title || script.title,
    cwd: room.cwd,
    roomKind: room.roomKind,
    floorTheme: room.floorTheme,
    mechanic: room.mechanic,
    summary: room.summary,
    files: collectFiles(setup),
    enemies: setup.flatMap((op) => (op.op === 'enemy' ? [bare(op)] : [])),
    pickups: setup.flatMap((op) => (op.op === 'pickup' ? [bare(op)] : [])),
    patches: setup.flatMap((op) => (op.op === 'patch' ? [bare(op)] : [])),
    winRules: setup.flatMap((op) => (op.op === 'task' ? [op.rule] : [])),
    solutionCommands: [],
  };
  const safe = script.enemyFire === 'hold';
  if (arrival.length > 0 || safe) level.script = { ...(arrival.length > 0 ? { arrival } : {}), ...(safe ? { safe: true } : {}) };
  return level;
}

/** Compiles a lab script into the pack the game plays and the config the lab session adds. Pure. */
export function buildLabPack(script: LabScript): BuiltLab {
  const level = levelOf(script);
  const id = labPackId(script);
  const pack: ChapterPack = {
    manifest: {
      id,
      issueNumber: 0,
      title: script.title,
      subtitle: 'A test bench for the terminal.',
      status: 'playable',
      badge: 'TERMINAL LAB',
      estimatedMinutes: 0,
      clientName: 'You',
      summary: 'A synthetic level built in the browser. Nothing is saved to the chapter.',
      allyNpc: { id: 'lab.tty', name: 'Lab Ally (lab.tty)', role: 'Test ally', model: 'npc.greybeard_rig', paletteFamily: 'ally' },
      boss: {
        id: 'lab-boss',
        name: 'Lab Boss (lab_boss.ko)',
        processName: 'lab_boss.ko',
        pid: 1,
        model: 'boss.kernel',
        ...(level.mechanic === 'boss' ? { cameoModel: 'agent.clod', cameoLabel: 'SUPERVISOR' } : {}),
      },
      mechanicsSummary: [],
      grants: grantsOf(script),
      levels: [
        {
          index: 1,
          id: level.id,
          title: level.title,
          cwd: level.cwd,
          roomKind: level.roomKind,
          floorTheme: level.floorTheme,
          mechanic: level.mechanic,
          mechanicLabel: 'Lab',
          difficulty: 1,
          teaches: [],
          enemies: level.enemies.map((e) => e.type),
        },
      ],
    },
    levels: [level],
    dialogs: {
      chapterId: id,
      cast: {},
      levels: {
        [level.id]: {
          banner: level.title,
          hankRungs: hankRungs(script.setup),
        },
      },
    },
  };
  const actors = script.setup.flatMap((op) => (op.op === 'prop' ? [propActor(op)] : []));
  const classic =
    script.driver === 'classic'
      ? {
          floor: script.room.floorTheme,
          cwd: script.room.cwd,
          ram: script.player.ram,
          ssd: script.player.ssd,
          core: script.player.core,
          enemyFire: script.enemyFire,
          files: level.files,
          enemies: level.enemies,
          pickups: level.pickups,
        }
      : undefined;
  return { pack, config: { extraActors: actors, clock: script.clock, content: contentOf(script.setup), ...(classic ? { classic } : {}) } };
}
