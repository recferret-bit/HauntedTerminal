/**
 * Turns the game state of the current directory into a RoomView for the stage. Actors come from what
 * is really in the cwd (files, sockets, doors), from the live enemies and pickups in that room, and from
 * a per-room layout table that fixes positions and set dressing. Design x runs from 4.9 (screen-left)
 * to -1.15 (screen-right); the hero stands near 2.4.
 */
import type { ActorKind, FloorId, LegacyActorKey, NeighborPanel, RoomActor, RoomKind, RoomView } from './types.js';
import { F3, LAYOUTS, type Layout, type SceneFacts, type ViewThing } from './view-layouts.js';

export type { SceneFacts, ViewThing };

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
  const base = {
    floor,
    path: facts.cwd,
    title: `FLOOR ${String(floor).padStart(2, '0')} // ${facts.cwd}`,
    kind,
    flood: kind === 'cell' ? facts.flood : 0,
    lantern: facts.lantern,
    xray: facts.xray,
  };
  if (kind === 'outro') {
    return {
      ...base,
      title: 'DAWN // BACK AT THE DESK',
      caption: 'The lightning throws you back. The agents lose their worker.',
      neighbors: [],
      actors: [{ key: 'vibecoder', id: 'vibecoder', model: 'vibecoder.dev', kind: 'vibecoder', state: 'idle', x: 0.4, hidden: false, label: 'dev' }],
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
  const heroX = place.take(layout.hero ?? 2.4);
  actors.push({ key: 'vibecoder', id: 'vibecoder', model: 'vibecoder.dev', kind: 'vibecoder', state: 'idle', x: heroX, hidden: false, label: 'dev' });
  if (facts.kiro) {
    const slotX = facts.kiro.target ? slots[facts.kiro.target]?.x : undefined;
    actors.push({
      key: 'entity',
      id: 'kiro',
      model: 'npc.kiro_ghost',
      kind: 'npc',
      state: facts.kiro.state,
      target: facts.kiro.target,
      x: slotX !== undefined ? slotX + 0.18 : facts.kiro.x,
      y: facts.kiro.y,
      hidden: false,
      label: facts.kiro.label,
    });
  }
  const maxThingsActors = facts.kiro ? 15 : 14;

  for (const prop of layout.props ?? []) {
    if (prop.when && !prop.when(facts)) continue;
    actors.push({
      key: keyFor(prop.key),
      id: prop.id,
      model: prop.model,
      kind: prop.kind ?? (prop.model.startsWith('door.') ? 'door' : 'prop'),
      state: 'idle',
      target: prop.target,
      x: place.take(prop.x),
      y: prop.y,
      hidden: false,
      label: prop.label,
    });
  }

  placeThings(facts, slots, place, actors, keyFor, maxThingsActors);

  for (const ent of facts.entities) {
    const slot = slots[ent.target];
    const legacyKey = slot?.key ?? LEGACY_BY_MODEL[ent.model];
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
      x: slot ? place.take(slot.x) : AUTO,
      y: slot?.y,
      hidden: false,
      alpha: ent.unseen ? 0.04 : 1,
      petrified: ent.state === 'petrified' || undefined,
      frozen: ent.state === 'frozen' || undefined,
      label: ent.label,
    });
  }

  for (const actor of actors) if (Number.isNaN(actor.x)) actor.x = place.free();

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

  return {
    ...base,
    caption: layout.caption ? layout.caption(facts) : facts.hostiles > 0 ? 'Something here wants you deleted.' : 'A quiet corner of the machine.',
    neighbors,
    actors,
  };
}

function placeThings(
  facts: SceneFacts,
  slots: NonNullable<Layout['slots']>,
  place: Placer,
  actors: RoomActor[],
  keyFor: (wanted: LegacyActorKey | undefined) => RoomActor['key'],
  maxThingsActors: number,
): void {
  const floor = facts.floor;
  const autoX = Number.NaN;
  for (const thing of facts.things) {
    if (thing.entity || thing.type === 'device') continue;
    const slot = slots[thing.name];
    const dot = thing.name.startsWith('.');
    if (dot && !slot && !facts.lantern) continue;
    if (!slot && actors.length >= maxThingsActors) continue;
    const exit = thing.name in facts.exits;
    const look = thingModel(thing, floor, exit);
    const lockedDoor = (thing.type === 'dir' || thing.type === 'symlink') && (!thing.open || (exit && !facts.exits[thing.name]));
    actors.push({
      key: keyFor(slot?.key),
      id: `${thing.type === 'dir' || thing.type === 'symlink' ? 'door' : thing.type === 'socket' ? 'sock' : 'file'}:${thing.name}`,
      model: slot?.model ?? look.model,
      kind: look.kind,
      state: 'idle',
      target: thing.name,
      x: slot ? place.take(slot.x) : autoX,
      y: slot?.y,
      hidden: false,
      label: slot?.label ?? (lockedDoor ? `${thing.name} [locked]` : thing.name),
    });
  }
}
