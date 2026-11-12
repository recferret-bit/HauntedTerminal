import type { KernelEvent } from '../contracts/events.js';
import { BESTIARY, PICKUP_INFO, RAM_PER_STEP, SSD_PER_BACKUP, maxHpFor, type PickupType } from './bestiary.js';
import { World, type KillHow, type Pickup } from './entities.js';
import { FLOOR_PATHS, FLOOR_TITLES, buildFloor } from './floors.js';
import { COMMANDS } from './manual.js';
import { KIRO_CORE_ORDER } from './kiro.js';
import {
  ACTION_RANK, LOAD_BEARING, READERS, WRITERS, globReg, out, type HeroAction, type Play,
} from './play.js';
import type { Step } from './shell.js';
import { absPath, findId, hasExec, hasWrite, makeNode, resolve, walk, type VNode } from './tree.js';
import type { FloorId } from './types.js';
import type { SceneFacts, ViewThing } from './view.js';

/** Seconds of play: wall time since the run started, minus paused time, frozen at the ending. */
export function elapsedSec(g: Play): number {
  const now = g.run.endedAt ?? Date.now();
  let ms = now - g.run.startedAt - g.run.pausedMs;
  if (g.pausedAt !== null && g.run.endedAt === null) ms -= now - Math.max(g.pausedAt, g.run.startedAt);
  return Math.max(0, Math.floor(ms / 1000));
}

export function maxHp(g: Play): number {
  return maxHpFor(g.run.ram);
}

export function backups(g: Play): number {
  return Math.floor(g.run.ssd / SSD_PER_BACKUP);
}

export function enterFloorEvents(g: Play, events: KernelEvent[]): void {
  const floor = g.run.floor;
  push(g, events, { type: 'FLOOR_ENTERED', floorId: floor, title: FLOOR_TITLES[floor] ?? `Floor ${floor}`, path: FLOOR_PATHS[floor] ?? absPath(g.run.cwd) });
  spawnRoom(g, events);
}

/** The stage gets an ENTITY_SPAWNED for every enemy and pickup in the room the hero just entered. */
export function spawnRoom(g: Play, events: KernelEvent[]): void {
  for (const ent of g.run.world.presentIn(absPath(g.run.cwd))) {
    events.push({ type: 'ENTITY_SPAWNED', entityId: ent.id, model: ent.model, reason: 'room_enter' });
  }
}

export function cue(g: Play, ev: KernelEvent): void {
  if (ev.type === 'ROOM_TRANSITION') g.sfx.play(ev.viaSymlinkLoop ? 'flood' : ev.upwardPanelsSmashed >= 3 ? 'page' : 'hop');
  else if (ev.type === 'PERMISSION_DENIED_RATTLE') g.sfx.play('denied');
  else if (ev.type === 'LANTERN_REVEAL') g.sfx.play('reveal');
  else if (ev.type === 'PROC_SIGNALED' && ev.outcome === 'KILLED') g.sfx.play('kill');
  else if (ev.type === 'PROC_SIGNALED') g.sfx.play('stone');
  else if (ev.type === 'INODE_MODE_CHANGED') g.sfx.play((ev.newMode & 0o111) === 0 ? 'stone' : 'gate');
  else if (ev.type === 'OBJECT_MOVED') g.sfx.play(ev.suckedIntoNull ? 'flood' : 'page');
  else if (ev.type === 'FLOOR_CLEARED' || ev.type === 'SYSTEM_HAND_SPAWN') g.sfx.play('page');
  else if (ev.type === 'PLAYER_DAMAGED') g.sfx.play('denied');
  else if (ev.type === 'PUZZLE_DOOR_RESOLVED' || ev.type === 'PICKUP_COLLECTED') g.sfx.play('reveal');
  else if (ev.type === 'ENEMY_KILLED') g.sfx.play('kill');
  else if (ev.type === 'KIRO_ACTION') g.sfx.play(ev.action === 'crack_done' || ev.action === 'scan' ? 'reveal' : 'hop');
  else if (ev.type === 'PLAYER_RESPAWNED' || ev.type === 'GAME_ENDED') g.sfx.play('lightning');
}

export function push(g: Play, events: KernelEvent[], ev: KernelEvent): void {
  events.push(ev);
  cue(g, ev);
}

export function find(g: Play, path: string): VNode | null {
  return resolve(g.run.root, path, false).node;
}

export function findNamed(g: Play, name: string): VNode | null {
  let found: VNode | null = null;
  walk(g.run.root, (node) => {
    if (node.name === name) found = node;
  });
  return found;
}

export function gateOpen(g: Play): boolean {
  const gate = find(g, '/var/dungeon/entrance/iron_gate');
  return !!gate && hasExec(gate);
}

export function gargoyleNode(g: Play): VNode | null {
  return find(g, '/var/dungeon/entrance/iron_gate/stone_gargoyle.bin');
}

export function gargoyleNeutral(g: Play): boolean {
  const node = gargoyleNode(g);
  if (!node) return true;
  return !hasExec(node);
}

export function plankBridged(g: Play): boolean {
  const plank = findNamed(g, 'heavy_plank.tar');
  return !!plank?.parent && absPath(plank.parent).includes('/chasm');
}

export function boss(g: Play): { dead: boolean; frozen: boolean } {
  const boss = g.run.world.get('f4-necromancer');
  return { dead: !!boss?.dead, frozen: !!boss?.frozen };
}

export function phase1(g: Play): boolean {
  if (g.run.phase1) return true;
  return g.run.floor === 5 && !find(g, '/sys/kernel/panic_chamber/chaos.stream');
}

export function anchorFree(g: Play): boolean {
  const conf = find(g, '/sys/kernel/panic_chamber/reality_anchor.conf');
  const text = conf?.content ?? '';
  return text.includes('player_trapped=false') && !text.includes('player_trapped=true');
}

export function kernelPhase(g: Play): number {
  if (g.run.floor !== 5) return 0;
  return (phase1(g) ? 1 : 0) + (g.run.tokenOk ? 1 : 0) + (anchorFree(g) ? 1 : 0);
}

export function portal(g: Play): boolean {
  return g.run.floor === 5 && phase1(g) && g.run.tokenOk && anchorFree(g);
}

export function bossDown(g: Play, how: 'frozen' | 'thawed' | 'killed'): void {
  if (how === 'thawed') return;
  ensure(g, '/proc_mansion/boiler_room/furnace_hall/core_elevator');
  cut(g, how === 'frozen' ? 'floor4-freeze' : 'floor4-sigkill');
}

export function enterable(g: Play, node: VNode): boolean {
  if (node.kind === 'dir') return hasExec(node);
  if (node.kind !== 'symlink') return false;
  const target = resolve(node.parent ?? g.run.root, node.name, true).node;
  return !!target && target.kind === 'dir' && hasExec(target);
}

export function facts(g: Play): SceneFacts {
  const cwd = absPath(g.run.cwd);
  const world = g.run.world;
  const things: ViewThing[] = [...g.run.cwd.children.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((child) => ({ name: child.name, type: child.kind, open: enterable(g, child), entity: world.entityOf(child.id) }));
  const entities = world.views(cwd);
  const garg = gargoyleNode(g);
  const necromancer = boss(g);
  const zombies = world.enemies.filter((e) => e.type === 'zombie' && !e.dead).length;
  return {
    floor: g.run.floor,
    cwd,
    ended: g.run.ended,
    lantern: g.run.lantern,
    xray: g.run.xray,
    flood: g.run.flood,
    things,
    entities,
    exits: {
      cellar_hatch: !find(g, '/home/dev/nightmare_workspace/.poltergeist.lock') && !!find(g, '/home/dev/nightmare_workspace/cellar_hatch/.power_on'),
      crypt_stairs: plankBridged(g) && gargoyleNeutral(g),
      boiler_shaft: true,
      core_elevator: necromancer.dead || necromancer.frozen,
    },
    ghost: !!find(g, '/home/dev/nightmare_workspace/.poltergeist.lock'),
    mimic: !!find(g, '/usr/local/labyrinth/pedestal/.mimic'),
    gateOpen: gateOpen(g),
    plankBridged: plankBridged(g),
    gargoyle: !garg ? 'gone' : hasExec(garg) ? 'live' : 'stone',
    zombies,
    bossDead: necromancer.dead,
    bossFrozen: necromancer.frozen,
    phase1: phase1(g),
    portal: portal(g),
    powerOn: !!find(g, '/home/dev/nightmare_workspace/cellar_hatch/.power_on'),
    valveOpen: !!find(g, '/proc_mansion/boiler_room/catwalk/furnace_hall'),
    hostiles: entities.filter((e) => e.kind !== 'pickup' && !e.unseen && !['death', 'petrified', 'frozen'].includes(e.state)).length,
    kiro: g.kiro.stageActorProps(cwd, 2.4),
  };
}

export function rank(g: Play): 'C' | 'B' | 'A' | 'S' {
  const time = elapsedSec(g);
  if (g.run.shortcuts.includes('floor1-oneliner') && time < 480) return 'S';
  if (time < 720) return 'A';
  if (g.run.commands < 40) return 'B';
  return 'C';
}

export function cut(g: Play, id: string): void {
  if (!g.run.shortcuts.includes(id)) g.run.shortcuts.push(id);
}

export function ensure(g: Play, path: string): VNode {
  const parts = path.split('/').filter(Boolean);
  let cursor = g.run.root;
  for (const part of parts) {
    let child = cursor.children.get(part);
    if (!child) child = makeNode(cursor, part, 'dir', 0o755);
    if (child.kind !== 'dir') return child;
    cursor = child;
  }
  return cursor;
}

export function hurt(g: Play, amount: number, source: string, events: KernelEvent[]): string {
  if (g.run.ended || g.deadNow || amount <= 0) return '';
  const { amount: mitigated } = g.kiro.mitigateDamage(amount);
  g.run.hp = Math.max(0, g.run.hp - mitigated);
  push(g, events, { type: 'PLAYER_DAMAGED', amount: mitigated, hpRemaining: g.run.hp, sourceName: source });
  if (g.run.hp > 0) return '';
  return die(g, events);
}

/** The one death path: an SSD backup restores you in place, otherwise the floor restarts. */
export function die(g: Play, events: KernelEvent[]): string {
  g.deadNow = true;
  if (backups(g) > 0) {
    g.run.ssd -= SSD_PER_BACKUP;
    g.run.hp = Math.ceil(maxHp(g) / 2);
    g.run.flood = 0;
    g.run.world.calm();
    push(g, events, { type: 'PLAYER_RESPAWNED', from: 'ssd_backup', hp: g.run.hp });
    g.deathText = `KERNEL COREDUMP ... restored from SSD backup. HP ${g.run.hp}/${maxHp(g)}, ${backups(g)} backup(s) left.\n`;
    return g.deathText;
  }
  g.run.ram = g.run.entryRam;
  g.run.ssd = g.run.entrySsd;
  load(g, g.run.floor);
  g.run.hp = maxHp(g);
  push(g, events, { type: 'PLAYER_RESPAWNED', from: 'floor_restart', hp: g.run.hp });
  enterFloorEvents(g, events);
  g.deathText = 'KERNEL COREDUMP // TRY AGAIN (no SSD backup: the floor restarts)\n';
  return g.deathText;
}

export function applyPickup(g: Play, type: PickupType, amount: number, entityId: string, events: KernelEvent[]): string {
  const info = PICKUP_INFO[type];
  let gained = amount;
  if (type === 'energy') {
    gained = Math.max(0, Math.min(amount, maxHp(g) - g.run.hp));
    g.run.hp += gained;
  } else if (type === 'ram') {
    g.run.ram += amount;
    const boost = 10 * Math.floor(amount / RAM_PER_STEP);
    g.run.hp = Math.min(maxHp(g), g.run.hp + boost);
  } else {
    g.run.ssd += amount;
  }
  push(g, events, { type: 'PICKUP_COLLECTED', entityId, item: type, amount: gained, label: info.label(gained) });
  if (type === 'energy') return `+${gained} HP. HP ${g.run.hp}/${maxHp(g)}.\n`;
  if (type === 'ram') return `+${amount} GB RAM (${g.run.ram} GB). Max HP ${maxHp(g)}, HP ${g.run.hp}.\n`;
  return `+${amount} GB SSD (${g.run.ssd} GB): ${backups(g)} backup(s). Die now and you restore in place.\n`;
}

export function collect(g: Play, pickup: Pickup, node: VNode, events: KernelEvent[]): string {
  unlink(g, node);
  push(g, events, { type: 'FILE_REMOVED', inodeId: node.id, name: node.name, entityId: pickup.id });
  g.run.world.collect(pickup);
  g.act = { action: 'collect', target: pickup.id };
  return `${node.name}: ${applyPickup(g, pickup.type, pickup.amount, pickup.id, events)}`;
}

export function bump(g: Play, action: HeroAction, target?: string): void {
  if (ACTION_RANK[action] < ACTION_RANK[g.act.action]) return;
  if (ACTION_RANK[action] === ACTION_RANK[g.act.action] && g.act.target && !target) return;
  g.act = { action, target: target ?? (action === g.act.action ? g.act.target : undefined) };
}

/** A command touched this inode: if it is an enemy, the hero casts at it. */
export function target(g: Play, node: VNode): void {
  const enemy = g.run.world.enemyTouching(node.id);
  if (enemy) bump(g, 'cast', enemy.id);
}

export function noteAction(g: Play, argv: string[]): void {
  const name = argv[0] ?? '';
  if (name === 'ls' && argv.some((arg) => /^-[a-zA-Z]*a/.test(arg))) bump(g, 'lantern');
  else if (READERS.has(name)) bump(g, 'read');
  else if (WRITERS.has(name)) bump(g, 'write');
}

export function causeOf(_g: Play, argv: string[]): KillHow {
  const name = argv[0] ?? '';
  if (name === 'rm') return 'rm';
  if (name === 'chmod') return 'chmod';
  if (name === 'mv' && argv.slice(2).some((arg) => arg === '/dev/null')) return 'devnull';
  if (name === 'kill' || name === 'pkill') return argv.some((arg) => /^-(9|KILL|SIGKILL)$/.test(arg)) ? 'SIGKILL' : 'SIGTERM';
  return 'other';
}

export function denied(g: Play, node: VNode, message: string, command: string): Step {
  const events: KernelEvent[] = [];
  push(g, events, { type: 'PERMISSION_DENIED_RATTLE', targetId: node.id, command });
  return { stdout: '', stderr: message, code: 1, events };
}

export function load(g: Play, floor: FloorId): void {
  g.kiro.clearRoomTransient();
  const built = buildFloor(floor);
  const cwd = resolve(built.root, built.cwd, false).node;
  if (!cwd) throw new Error(`missing start for floor ${floor}`);
  g.run.floor = floor;
  g.run.root = built.root;
  g.run.cwd = cwd;
  g.run.prev = null;
  g.run.lantern = false;
  g.run.xray = false;
  g.run.flood = 0;
  g.run.attempts = {};
  g.run.phase1 = false;
  g.run.tokenOk = false;
  g.run.archivistSolved = false;
  g.run.quests = [];
  walk(built.root, (node) => {
    if (!node.questCritical || !node.parent) return;
    g.run.quests.push({
      id: node.id,
      name: node.name,
      content: node.content,
      mode: node.mode,
      uid: node.uid,
      parentPath: absPath(node.parent),
      missing: 0,
    });
  });
  g.run.world = new World(g.host, built.enemies, built.pickups);
}

export function canUnlink(_g: Play, node: VNode): boolean {
  const parent = node.parent;
  if (!parent) return false;
  return hasExec(parent) && (hasWrite(parent) || hasWrite(node));
}

/** Sockets and the rooms a floor needs cannot be deleted or moved: that would soft-lock the floor. */
export function busy(_g: Play, node: VNode): boolean {
  let found = false;
  walk(node, (child) => {
    if (child.kind === 'socket' || child.questCritical || (child.kind === 'dir' && LOAD_BEARING.has(child.name))) found = true;
  });
  return found && !node.questCritical;
}

/** Ask every entity file in the subtree whether it may be deleted. */
export function vetoSubtree(g: Play, node: VNode, events: KernelEvent[]): string | null {
  let veto: string | null = null;
  walk(node, (child) => {
    if (veto) return;
    veto = g.run.world.vetoRemove(child, events);
  });
  return veto;
}

export function isCwdInside(g: Play, node: VNode): boolean {
  let cursor: VNode | null = g.run.cwd;
  while (cursor) {
    if (cursor === node) return true;
    cursor = cursor.parent;
  }
  return false;
}

export function unlink(_g: Play, node: VNode): void {
  node.parent?.children.delete(node.name);
  node.parent = null;
}

export function collectStep(g: Play, pickup: Pickup, node: VNode, path: string): Step {
  if ((node.mode & 0o400) === 0) {
    return denied(g, node, `${path}: Permission denied (encrypted: chmod 644 ${path})\n`, `collect ${path}`);
  }
  const events: KernelEvent[] = [];
  const text = collect(g, pickup, node, events);
  return out(text, events);
}

export function glob(g: Play, word: string): string[] {
  if (!word.includes('*') && !word.includes('?')) return [word];
  const slash = word.lastIndexOf('/');
  const dirPart = slash >= 0 ? word.slice(0, slash) || '/' : '.';
  const base = slash >= 0 ? word.slice(slash + 1) : word;
  const dir = resolve(g.run.cwd, dirPart, true).node;
  if (!dir || dir.kind !== 'dir') return [word];
  const rx = globReg(base);
  const names = [...dir.children.keys()].filter((name) => rx.test(name) && (base.startsWith('.') || !name.startsWith('.'))).sort();
  if (names.length === 0) return [word];
  const prefix = slash >= 0 ? `${word.slice(0, slash)}/` : '';
  return names.map((name) => prefix + name);
}

export function completions(g: Play, token: string, command: boolean, first: string): string[] {
  if (command && !token.includes('/')) return COMMANDS.filter((name) => name.startsWith(token)).sort();
  if (first === 'kiro' && !token.includes('/')) {
    const kiroSub = ['scan', 'load', 'crack', 'status', ...KIRO_CORE_ORDER];
    const childNames = [...g.run.cwd.children.keys()];
    return [...new Set([...kiroSub, ...childNames].filter((name) => name.startsWith(token)))].sort();
  }
  if (first === 'man' && !token.includes('/')) {
    const topics = [...COMMANDS, ...Object.keys(BESTIARY)];
    return [...new Set(topics.filter((name) => name.startsWith(token)))].sort();
  }
  const slash = token.lastIndexOf('/');
  const dirPart = slash >= 0 ? token.slice(0, slash) || '/' : '.';
  const frag = slash >= 0 ? token.slice(slash + 1) : token;
  const dir = resolve(g.run.cwd, dirPart, true).node;
  if (!dir || dir.kind !== 'dir' || !hasExec(dir)) return [];
  const prefix = slash >= 0 ? `${token.slice(0, slash)}/` : '';
  const dirsOnly = first === 'cd';
  return [...dir.children.values()]
    .filter((child) => child.name.startsWith(frag) && (frag.startsWith('.') || !child.name.startsWith('.')))
    .filter((child) => !dirsOnly || child.kind === 'dir' || child.kind === 'symlink')
    .map((child) => prefix + child.name + (child.kind === 'dir' ? '/' : ''))
    .sort();
}

export function restoreQuests(g: Play, events: KernelEvent[]): string {
  let output = '';
  for (const quest of g.run.quests) {
    if (findId(g.run.root, quest.id)) {
      quest.missing = 0;
      continue;
    }
    quest.missing += 1;
    if (quest.missing < 3) continue;
    const parent = ensure(g, quest.parentPath);
    if (parent.kind !== 'dir') continue;
    const node = makeNode(parent, quest.name, 'file', quest.mode);
    node.id = quest.id;
    node.content = quest.content;
    node.uid = quest.uid;
    node.questCritical = true;
    quest.missing = 0;
    push(g, events, { type: 'SYSTEM_HAND_SPAWN', entityKind: 'inode', id: quest.id, name: quest.name, reason: 'cron_restore' });
    output += `cron_restorer: recovered ${quest.name} from /var/backups\n`;
  }
  return output;
}
