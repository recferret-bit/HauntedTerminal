/**
 * Turns the game state of the current directory into a RoomView for the stage. Actors come from what
 * is really in the cwd (files, sockets, doors), from the live enemies and pickups in that room, and from
 * a per-room layout table that fixes positions and set dressing. Design x runs from 4.9 (screen-left)
 * to -1.15 (screen-right); the hero stands near 2.4.
 */
import type {
  ActorKind, FloorId, LegacyActorKey, NeighborPanel, RoomActor, RoomKind, RoomSocketId, RoomView, SceneTransform,
} from './types.js';
import { hashSeed } from '../procgen/core/rng.js';
import { heroModel } from './inventory.js';
import { F3, LAYOUTS, type Layout, type Prop, type SceneFacts, type ViewThing } from './view-layouts.js';

export type { Prop, SceneFacts, ViewThing };

/** Design-space x matching room-frame socket `door.left` (`roomX = +3.3`). */
const ENTRY_SOCKET_X = 4.37;
/** Design-space x matching room-frame socket `door.right` (`roomX = -3.55`). */
const EXIT_SOCKET_X = -0.81;

function socketAttr(socket: RoomSocketId | undefined): { socket?: RoomSocketId } {
  return socket ? { socket } : {};
}

function transformAttrs(t: SceneTransform | undefined): SceneTransform {
  if (!t) return {};
  return {
    ...(t.zOrder !== undefined ? { zOrder: t.zOrder } : {}),
    ...(t.scale !== undefined ? { scale: t.scale } : {}),
    ...(t.rotation !== undefined ? { rotation: t.rotation } : {}),
  };
}

/** Deterministic positive room seed derived from a VFS path and floor/level salt. */
export function roomSeedForPath(cwd: string, salt = 1): number {
  return (hashSeed(cwd, salt) % 99999) + 1;
}

/** Legacy cast keys for enemies that replaced an actor of the first stage (one per room). */
const LEGACY_BY_MODEL: Record<string, LegacyActorKey> = {
  'malware.rootkit': 'ghost',
  'malware.trojan': 'gargoyle',
  'malware.zombie': 'minion',
  'boss.forkbomb': 'boss',
  'boss.kernel': 'boss',
};

/** Candidate x positions for things without a slot, nearest the middle first. */
const FREE_X = [1.6, 0.95, 0.35, -0.25, -0.85, 3.3, 3.9, 4.5, 1.25, 0.65, 0.05, -0.55];
const MIN_GAP = 0.42;

function kindOf(facts: SceneFacts): RoomKind {
  if (facts.ended) return 'outro';
  const path = facts.cwd;
  if (facts.floor === 1) return path.endsWith('/desk') ? 'desk' : 'attic';
  if (facts.floor === 2) {
    if (path.includes('/chasm')) return 'chasm';
    if (path.includes('/iron_gate')) return 'crypt_hall';
    return 'crypt_entrance';
  }
  if (facts.floor === 3) return path === F3 || (path.startsWith(`${F3}/`) && !path.startsWith(`${F3}/wing_a`)) ? 'lab_hall' : 'cell';
  if (facts.floor === 4) return path.includes('/furnace_hall') ? 'furnace' : 'catwalk';
  return 'core';
}

function thingModel(thing: ViewThing, floor: FloorId, exit: boolean): { model: string; kind: ActorKind } {
  if (thing.type === 'socket') {
    if (/dad|father|greybeard|rig/i.test(thing.name)) return { model: 'npc.greybeard_rig', kind: 'npc' };
    return { model: 'door.socket', kind: 'npc' };
  }
  if (thing.type === 'device') return { model: 'door.devnull', kind: 'door' };
  if (thing.type === 'symlink') return { model: 'door.loopback', kind: 'door' };
  if (thing.type === 'dir') return { model: exit ? 'door.ethernet' : 'door.usb', kind: 'door' };
  if (thing.name.endsWith('.tar')) return { model: 'prop.tar', kind: 'prop' };
  if (thing.name.endsWith('.log') && floor === 2) return { model: 'prop.tombstone', kind: 'prop' };
  if (/power|fuse/.test(thing.name)) return { model: 'prop.fuse', kind: 'prop' };
  return { model: 'prop.file', kind: 'prop' };
}

class Placer {
  private readonly used: number[] = [];

  take(x: number): number {
    this.used.push(x);
    return x;
  }

  free(): number {
    for (const x of FREE_X) {
      if (this.used.every((u) => Math.abs(u - x) >= MIN_GAP)) return this.take(x);
    }
    const x = FREE_X[this.used.length % FREE_X.length] ?? 0.5;
    return this.take(x);
  }
}

export function buildRoom(facts: SceneFacts): RoomView {
  const kind = kindOf(facts);
  const floor = facts.floor;
  const base: Omit<RoomView, 'caption' | 'neighbors' | 'actors'> = {
    floor,
    path: facts.cwd,
    title: `FLOOR ${String(floor).padStart(2, '0')} // ${facts.cwd}`,
    kind,
    roomSeed: roomSeedForPath(facts.cwd, floor),
    ...(facts.backdrop ? { backdrop: facts.backdrop } : {}),
    ...(facts.ambient ? { ambient: facts.ambient } : {}),
    flood: kind === 'cell' ? facts.flood : 0,
    lantern: facts.lantern,
    dark: facts.dark ?? false,
    xray: facts.xray,
  };
  if (kind === 'outro') {
    return {
      ...base,
      title: 'DAWN // BACK AT THE DESK',
      caption: 'The lightning throws you back. The agents lose their worker.',
      neighbors: [],
      actors: [{ key: 'vibecoder', id: 'vibecoder', model: heroModel(facts.held), kind: 'vibecoder', state: 'idle', hp: facts.hp, maxHp: facts.maxHp, x: 0.4, hidden: false, label: 'dev' }],
    };
  }

  const layout = LAYOUTS[facts.cwd] ?? {};
  const slots = layout.slots ?? {};
  const place = new Placer();
  const legacy = new Set<LegacyActorKey>(['vibecoder']);
  const keyFor = (wanted: LegacyActorKey | undefined): RoomActor['key'] => {
    if (!wanted || legacy.has(wanted)) return 'entity';
    legacy.add(wanted);
    return wanted;
  };
  const actors: RoomActor[] = [];
  const AUTO = Number.NaN;
  const heroCfg = typeof facts.hero === 'object' ? facts.hero : undefined;
  const heroX = place.take(heroCfg?.x ?? (typeof facts.hero === 'number' ? facts.hero : layout.hero ?? 2.4));
  actors.push({
    key: 'vibecoder',
    id: 'vibecoder',
    model: heroModel(facts.held),
    kind: 'vibecoder',
    state: 'idle',
    hp: facts.hp,
    maxHp: facts.maxHp,
    x: heroX,
    ...(heroCfg?.y !== undefined ? { y: heroCfg.y } : {}),
    ...transformAttrs(heroCfg),
    hidden: false,
    label: 'dev',
  });
  if (facts.entryDoor || facts.entryPort) {
    const ep = facts.entryPort;
    const epSocket = ep?.socket ?? 'door.left';
    actors.push({
      key: 'entity',
      id: 'door:entry',
      model: ep?.model ?? 'door.serial',
      kind: 'door',
      portRole: 'entry',
      state: 'idle',
      ...socketAttr(epSocket),
      x: place.take(ep?.x ?? ENTRY_SOCKET_X),
      ...(ep?.y !== undefined ? { y: ep.y } : {}),
      ...transformAttrs(ep),
      hidden: false,
      label: ep?.label ?? 'sector_in',
    });
  }
  const mergedProps = [...(layout.props ?? []), ...(facts.props ?? [])];
  const ctx: BuildCtx = { facts, slots, place, actors, keyFor };
  placeProps(ctx, mergedProps);
  const maxThingsActors = 14 + mergedProps.length + (facts.kiro ? 1 : 0) + (facts.entryDoor || facts.entryPort ? 1 : 0);
  placeThings(ctx, maxThingsActors);
  placeEntities(ctx, AUTO);

  for (const actor of actors) if (Number.isNaN(actor.x)) actor.x = place.free();

  if (facts.kiro) {
    const targetActor = facts.kiro.target ? actors.find((a) => a.target === facts.kiro!.target) : undefined;
    const slotX = facts.kiro.target ? (targetActor?.x ?? slots[facts.kiro.target]?.x) : undefined;
    actors.push({
      key: 'entity',
      id: 'kiro',
      model: 'npc.kiro_ghost',
      kind: 'npc',
      state: facts.kiro.state,
      target: facts.kiro.target,
      x: slotX !== undefined ? slotX + 0.18 : facts.kiro.x,
      y: facts.kiro.y,
      ...transformAttrs(facts.kiro),
      hidden: false,
      label: facts.kiro.label,
    });
  }

  return {
    ...base,
    caption: facts.captionText ?? (layout.caption ? layout.caption(facts) : facts.hostiles > 0 ? 'Something here wants you deleted.' : 'A quiet corner of the machine.'),
    neighbors: buildNeighbors(facts),
    actors,
  };
}

interface BuildCtx {
  facts: SceneFacts;
  slots: NonNullable<Layout['slots']>;
  place: Placer;
  actors: RoomActor[];
  keyFor: (wanted: LegacyActorKey | undefined) => RoomActor['key'];
}

function placeProps(ctx: BuildCtx, props: Prop[]): void {
  const { facts, place, actors, keyFor } = ctx;
  for (const prop of props) {
    if (prop.when && !prop.when(facts)) continue;
    const isWallDecor = (prop.zOrder ?? 0) < 0 || (prop.y ?? 0) >= 1.5;
    actors.push({
      key: keyFor(prop.key),
      id: prop.id.startsWith('prop:') || prop.id.startsWith('door:') || prop.id === 'hole' ? prop.id : `prop:${prop.id}`,
      model: prop.model,
      kind: prop.kind ?? (prop.model.startsWith('door.') ? 'door' : 'prop'),
      state: prop.state ?? 'idle',
      target: prop.target,
      ...socketAttr(prop.socket),
      x: isWallDecor ? prop.x : place.take(prop.x),
      y: prop.y,
      ...transformAttrs(prop),
      hidden: false,
      label: prop.label,
    });
  }
}

function placeEntities(ctx: BuildCtx, autoX: number): void {
  const { facts, slots, place, actors, keyFor } = ctx;
  for (const ent of facts.entities) {
    const slot = slots[ent.target];
    const legacyKey = slot?.key ?? LEGACY_BY_MODEL[ent.model];
    const xVal = ent.x ?? slot?.x;
    actors.push({
      key: keyFor(legacyKey),
      id: ent.id,
      model: ent.model,
      kind: ent.kind,
      state: ent.state,
      hp: ent.hp,
      maxHp: ent.maxHp,
      pid: ent.pid,
      target: ent.target,
      ...socketAttr(ent.socket ?? slot?.socket),
      x: xVal !== undefined ? place.take(xVal) : autoX,
      y: ent.y ?? slot?.y,
      ...transformAttrs(ent),
      ...(!ent.zOrder && slot?.zOrder !== undefined ? { zOrder: slot.zOrder } : {}),
      ...(!ent.scale && slot?.scale !== undefined ? { scale: slot.scale } : {}),
      ...(!ent.rotation && slot?.rotation !== undefined ? { rotation: slot.rotation } : {}),
      hidden: false,
      alpha: ent.unseen ? 0.04 : 1,
      petrified: ent.state === 'petrified' || undefined,
      frozen: ent.state === 'frozen' || undefined,
      label: ent.label,
    });
  }
}

function buildNeighbors(facts: SceneFacts): NeighborPanel[] {
  const parent = facts.cwd.slice(0, facts.cwd.lastIndexOf('/')) || '/';
  const neighbors: NeighborPanel[] = [{ label: parent.slice(parent.lastIndexOf('/') + 1) || '/', path: '..', relation: 'parent' }];
  for (const thing of facts.things) {
    if (neighbors.length >= 4) break;
    if (thing.type !== 'dir' && thing.type !== 'symlink') continue;
    if (thing.name.startsWith('.')) continue;
    const exit = thing.name in facts.exits;
    const open = thing.open && (!exit || facts.exits[thing.name] === true);
    neighbors.push({ label: thing.name, path: thing.name, relation: !open ? 'locked' : exit ? 'down' : 'sibling' });
  }
  return neighbors;
}

function placeThings(ctx: BuildCtx, maxThingsActors: number): void {
  const { facts, slots, place, actors, keyFor } = ctx;
  const floor = facts.floor;
  const autoX = Number.NaN;
  for (const thing of facts.things) {
    if (thing.entity || thing.type === 'device') continue;
    const slot = slots[thing.name];
    const dot = thing.name.startsWith('.');
    const explicitlyPlaced = slot !== undefined || thing.x !== undefined || thing.socket !== undefined;
    if (dot && !explicitlyPlaced && !facts.lantern) continue;
    if (!explicitlyPlaced && actors.length >= maxThingsActors) continue;
    const exit = thing.name in facts.exits;
    const look = thingModel(thing, floor, exit);
    const lockedDoor = (thing.type === 'dir' || thing.type === 'symlink') && (!thing.open || (exit && !facts.exits[thing.name]));
    const socket = thing.socket ?? (exit ? 'door.right' : slot?.socket);
    const explicitX = thing.x ?? slot?.x;
    const x = exit ? place.take(explicitX ?? EXIT_SOCKET_X) : explicitX !== undefined ? place.take(explicitX) : autoX;
    actors.push({
      key: keyFor(thing.key ?? slot?.key ?? (exit ? 'gate' : undefined)),
      id: `${thing.type === 'dir' || thing.type === 'symlink' ? 'door' : thing.type === 'socket' ? 'sock' : 'file'}:${thing.name}`,
      model: thing.model ?? slot?.model ?? look.model,
      kind: thing.kind ?? look.kind,
      ...(thing.type === 'dir' || thing.type === 'symlink'
        ? { portRole: facts.exits[thing.name] !== undefined ? ('exit' as const) : ('sub' as const) }
        : {}),
      state: 'idle',
      target: thing.name,
      ...socketAttr(socket),
      x,
      y: thing.y ?? slot?.y,
      ...transformAttrs(thing),
      ...(thing.zOrder === undefined && slot?.zOrder !== undefined ? { zOrder: slot.zOrder } : {}),
      ...(thing.scale === undefined && slot?.scale !== undefined ? { scale: slot.scale } : {}),
      ...(thing.rotation === undefined && slot?.rotation !== undefined ? { rotation: slot.rotation } : {}),
      hidden: false,
      label: thing.label ?? slot?.label ?? (lockedDoor ? `${thing.name} [locked]` : thing.name),
    });
  }
}
