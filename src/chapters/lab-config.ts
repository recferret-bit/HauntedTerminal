import type { EnemySpawn, PickupSpawn } from '../game/floors.js';
import type { ClassicLabFile, ClassicLabSpec } from '../game/lab-types.js';
import type { FloorId, RoomActor } from '../game/types.js';
import { isRec } from './record.js';
import type { LabCheckSpec, LabConfig, LabRiddle } from './session-lab-types.js';
import { ENEMY_TYPES, PICKUP_TYPES } from './validate-pack.js';

/**
 * The Terminal Lab hands the game its `LabConfig` through localStorage, next to the draft pack (`draft.ts`).
 * The game reads it only with `?lab=1`. Anything in storage is untrusted: `normaliseLabConfig` keeps only well-formed parts,
 * so a stale entry from an older lab can never take the session down.
 */
const KEY = 'credits.lab.config:';
const COND_KINDS = new Set(['ran', 'output', 'code', 'event', 'file', 'riddle']);
const FILE_KINDS = new Set(['file', 'dir', 'socket']);

const str = (v: unknown): v is string => typeof v === 'string';
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter(str) : []);

function riddle(v: unknown): LabRiddle | null {
  if (!isRec(v) || !str(v.id) || !str(v.path) || !str(v.answer)) return null;
  return {
    id: v.id,
    path: v.path,
    answer: v.answer,
    speaker: str(v.speaker) ? v.speaker : 'Socket',
    prompt: str(v.prompt) ? v.prompt : '',
    hints: strings(v.hints),
    success: str(v.success) ? v.success : 'The lock clicks open.',
    opens: str(v.opens) ? v.opens : undefined,
    tokens: strings(v.tokens),
  };
}

function check(v: unknown): LabCheckSpec | null {
  if (!isRec(v) || !str(v.id) || !isRec(v.when) || !COND_KINDS.has(String(v.when.kind))) return null;
  return { id: v.id, description: str(v.description) ? v.description : v.id, when: v.when as LabCheckSpec['when'] };
}

function actor(v: unknown): RoomActor | null {
  if (!isRec(v) || !str(v.id) || !str(v.model) || !num(v.x)) return null;
  return { key: 'entity', id: v.id, model: v.model, kind: 'prop', state: 'idle', x: v.x, y: num(v.y) ? v.y : undefined, hidden: false, label: str(v.label) ? v.label : v.id };
}

function classicFile(v: unknown): ClassicLabFile | null {
  if (!isRec(v) || !str(v.path) || !v.path.startsWith('/') || !str(v.kind) || !FILE_KINDS.has(v.kind)) return null;
  return {
    path: v.path,
    kind: v.kind as ClassicLabFile['kind'],
    ...(num(v.mode) ? { mode: v.mode } : {}),
    ...(num(v.uid) ? { uid: v.uid } : {}),
    ...(typeof v.questCritical === 'boolean' ? { questCritical: v.questCritical } : {}),
    ...(str(v.content) ? { content: v.content } : {}),
  };
}

function classicEnemy(v: unknown): EnemySpawn | null {
  if (!isRec(v) || !str(v.id) || !str(v.path) || !str(v.type) || !(ENEMY_TYPES as readonly string[]).includes(v.type)) return null;
  return {
    id: v.id,
    type: v.type as EnemySpawn['type'],
    path: v.path,
    ...(num(v.pid) ? { pid: v.pid } : {}),
    ...(num(v.ppid) ? { ppid: v.ppid } : {}),
    ...(typeof v.hidden === 'boolean' ? { hidden: v.hidden } : {}),
    ...(str(v.port) ? { port: v.port } : {}),
    ...(str(v.buffer) ? { buffer: v.buffer } : {}),
    ...(str(v.helps) ? { helps: v.helps } : {}),
  };
}

function classicPickup(v: unknown): PickupSpawn | null {
  if (!isRec(v) || !str(v.id) || !str(v.path) || !str(v.type) || !(PICKUP_TYPES as readonly string[]).includes(v.type)) return null;
  return {
    id: v.id,
    type: v.type as PickupSpawn['type'],
    path: v.path,
    ...(typeof v.locked === 'boolean' ? { locked: v.locked } : {}),
  };
}

const keep = <T>(list: unknown, fn: (v: unknown) => T | null): T[] => (Array.isArray(list) ? list.map(fn).filter((x): x is T => x !== null) : []);

function classicSpec(v: unknown): ClassicLabSpec | undefined {
  if (!isRec(v) || ![1, 2, 3, 4, 5].includes(Number(v.floor))) return undefined;
  return {
    floor: Number(v.floor) as FloorId,
    ...(str(v.cwd) && v.cwd.startsWith('/') ? { cwd: v.cwd } : {}),
    ram: num(v.ram) ? v.ram : 0,
    ssd: num(v.ssd) ? v.ssd : 0,
    core: str(v.core) ? v.core : '',
    enemyFire: v.enemyFire === 'hold' ? 'hold' : 'live',
    files: keep(v.files, classicFile),
    enemies: keep(v.enemies, classicEnemy),
    pickups: keep(v.pickups, classicPickup),
  };
}

/** A complete, well-formed config from anything (the defaults for what is missing or broken). */
export function normaliseLabConfig(raw: unknown): LabConfig {
  const v = isRec(raw) ? raw : {};
  const content = isRec(v.content) ? v.content : {};
  const classic = classicSpec(v.classic);
  return {
    clock: v.clock === 'live' ? 'live' : 'manual',
    extraActors: keep(v.extraActors, actor),
    content: { riddles: keep(content.riddles, riddle), checks: keep(content.checks, check), taskIds: strings(content.taskIds) },
    ...(classic ? { classic } : {}),
  };
}

export function writeLabConfig(packId: string, config: LabConfig): void {
  try {
    localStorage.setItem(KEY + packId, JSON.stringify(config));
  } catch {
    /* storage blocked: the lab game runs without props, riddles and checks */
  }
}

export function readLabConfig(packId: string): LabConfig {
  try {
    return normaliseLabConfig(JSON.parse(localStorage.getItem(KEY + packId) ?? 'null'));
  } catch {
    return normaliseLabConfig(null);
  }
}
