import * as THREE from 'three';
import type { KernelEvent } from '../contracts/events.js';
import { buildModel, disposeModel, ModelCatalog, type BuiltModel } from '../procgen/index.js';
import { actorSocket, type StageActor } from './stage-cast.js';
import { setRest } from './stage-actor.js';
import { playFx, say } from './stage-fx.js';
import { stampMaterialBases } from './procgen-cast.js';
import { flyTo, hopInPlace } from './stage-motion.js';
import { findByName } from './stage-resolve.js';
import { easeOutBack, stepped } from './tween.js';
import type { ComicStage } from './comic-stage.js';

const GIVEN_ITEM_SAY: Record<string, { label: string; tint: string }> = {
  terminal: { label: '+TERMINAL SLATE', tint: '#06d6a0' },
  manual: { label: '+FIELD MANUAL', tint: '#4cc9f0' },
  map: { label: '+MOTHERBOARD MAP', tint: '#ffd166' },
};

/** An item a script `carry_item` put into an actor's hands: it rides on the carrier until ITEM_GIVEN. */
interface Carried {
  carrier: StageActor;
  item: THREE.Group;
  model: BuiltModel;
  /** False once it was given or its carrier left: the follow loop stops. */
  alive: boolean;
}

const carried = new WeakMap<ComicStage, Map<string, Carried>>();
const carriedOf = (stage: ComicStage): Map<string, Carried> => {
  let m = carried.get(stage);
  if (!m) carried.set(stage, (m = new Map()));
  return m;
};

const HOLD_Z = -0.2;
const DEFAULT_FLY_MS = 2400;
const POP_MS = 260;

function dropCarried(stage: ComicStage, c: Carried): void {
  c.alive = false;
  c.item.removeFromParent();
  for (const mat of c.model.allMaterials) stage.extraComics.delete(mat);
  disposeModel(c.model);
  const m = carriedOf(stage);
  for (const [id, v] of m) if (v === c) m.delete(id);
}

/** Drops every active carried prop (on floor transitions / scene rebuilds) and releases held carriers back to home. */
export function clearCarried(stage: ComicStage): void {
  const m = carried.get(stage);
  if (!m || m.size === 0) return;
  for (const c of [...m.values()]) {
    const carrier = c.carrier;
    dropCarried(stage, c);
    if (!carrier.disposed) {
      carrier.lock = 0;
      carrier.offset.set(0, 0, 0);
      carrier.base.copy(carrier.home);
      setRest(carrier);
    }
  }
}

/** Keeps the item in front of the carrier's belly, on the side it faces (the body mirrors, the item does not). */
function followCarrier(stage: ComicStage, c: Carried): void {
  if (!c.alive) return;
  if (c.carrier.disposed) {
    dropCarried(stage, c);
    return;
  }
  const front = c.carrier.body.scale.x < 0 ? 1 : -1;
  const at = c.carrier.model.sockets.hand ?? c.carrier.model.sockets.fx ?? [0, c.carrier.height * 0.5, 0];
  c.item.position.x = at[0] + 0.16 * front;
  c.item.position.y = at[1] - 0.1 + c.carrier.animator.hoverOffset;
  stage.tweens.add(83, () => {}, () => followCarrier(stage, c));
}

/** A hover spot at stage x, kept inside the panel and a little above the actor's slot. */
function hoverSpot(stage: ComicStage, a: StageActor, x: number): THREE.Vector3 {
  const lo = stage.panelRight + 0.3;
  const hi = stage.panelLeft - 0.3;
  return new THREE.Vector3(Math.min(hi, Math.max(lo, x)), a.home.y + 0.45, a.home.z);
}

/** Where a carrier hovers while it waits: beside the hero, on the side it came from. */
function waitingSpot(stage: ComicStage, a: StageActor): THREE.Vector3 {
  const hero = stage.hero();
  const side = Math.sign(a.home.x - (hero?.base.x ?? a.home.x)) || 1;
  return hoverSpot(stage, a, (hero?.base.x ?? a.home.x) + 0.85 * side);
}

/** Where a flier hovers beside `other`: on the side it comes from. */
function beside(stage: ComicStage, a: StageActor, other: StageActor): THREE.Vector3 {
  return hoverSpot(stage, a, other.base.x + 0.85 * (Math.sign(a.base.x - other.base.x) || 1));
}

/**
 * ACTOR_FLY_TO: the actor flies to the hero (hovering beside him), back home, or beside the socket or entity named by
 * `target`. An unknown actor or target is ignored. With `hold` it keeps hovering there; otherwise it settles on arrival.
 */
export function actorFlyTo(stage: ComicStage, ev: Extract<KernelEvent, { type: 'ACTOR_FLY_TO' }>): void {
  const a = stage.actors.get(ev.entityId);
  if (!a || a.disposed || a.exiting) return;
  const other = ev.target === 'hero' ? stage.hero() : ev.target === 'home' ? null : findByName(stage, ev.target, true);
  if (ev.target !== 'home' && (!other || other.disposed || other === a)) return;
  const to = other ? (ev.target === 'hero' ? waitingSpot(stage, a) : beside(stage, a, other)) : a.home.clone();
  const ms = Number.isFinite(ev.ms) && ev.ms > 0 ? ev.ms : DEFAULT_FLY_MS;
  flyTo(stage, a, to, ms, ev.hold ? undefined : () => setRest(a), undefined, ev.hold);
}

/** ITEM_CARRIED: the item pops into the carrier's hands (materialize, stepped scale-in), then the carrier flies next to the hero. */
export function itemCarried(stage: ComicStage, ev: Extract<KernelEvent, { type: 'ITEM_CARRIED' }>): void {
  const a = stage.actors.get(ev.entityId);
  if (!a || a.disposed || a.exiting || !ModelCatalog.has(ev.model)) return;
  const old = carriedOf(stage).get(ev.entityId);
  if (old) dropCarried(stage, old);
  const model = buildModel(ModelCatalog.build(ev.model, 1), { seed: 1 });
  stampMaterialBases(model.allMaterials);
  const item = new THREE.Group();
  item.name = `carried:${ev.item}`;
  item.add(model.group);
  item.position.z = HOLD_Z;
  item.scale.setScalar(0.05);
  a.group.add(item);
  stage.applyInk(item);
  for (const mat of model.allMaterials) stage.extraComics.add(mat);
  const c: Carried = { carrier: a, item, model, alive: true };
  carriedOf(stage).set(ev.entityId, c);
  followCarrier(stage, c);
  playFx(stage, 'fx.touch-materialize', actorSocket(a, 'fx'), { noShake: true, scale: 0.8 }, `carry:${ev.entityId}`);
  stage.tweens.add(POP_MS, (t) => {
    if (c.alive) item.scale.setScalar(Math.max(0.05, easeOutBack(stepped(t, 4))));
  }, () => {
    if (!c.alive) return;
    item.scale.setScalar(1);
    flyTo(stage, a, waitingSpot(stage, a), 2200, undefined, undefined, true);
  });
}

/**
 * ITEM_GIVEN: the carried item crosses to the hero's `hand` socket (about 300 ms, stepped), pops there in a pickup
 * burst, and the carrier flies home. The hero is looked up every frame: the model swap that follows this event
 * replaces the hero actor, and the tween simply lands on the new one. With no carrier it is the pop alone.
 */
export function itemGiven(stage: ComicStage, ev: Extract<KernelEvent, { type: 'ITEM_GIVEN' }>): void {
  const c = ev.from ? carriedOf(stage).get(ev.from) : undefined;
  const info = typeof ev.item === 'string' ? GIVEN_ITEM_SAY[ev.item] : undefined;
  const handAt = (): THREE.Vector3 | null => {
    const h = stage.hero();
    return h && !h.disposed ? actorSocket(h, 'hand') : null;
  };
  const announce = (at: THREE.Vector3): void => {
    if (!info) return;
    say(stage, info.label, at, info.tint, 1.25);
    const h = stage.hero();
    if (h && !h.disposed) hopInPlace(stage, h, 0.12, 200);
  };
  const pop = (): void => {
    const at = handAt();
    if (!at) return;
    playFx(stage, 'fx.pickup-ssd', at, { text: ' ', noShake: true, scale: 0.8 }, `give:${ev.item}`);
    announce(at);
  };
  if (!c || !c.alive) {
    const at = handAt();
    if (at) {
      playFx(stage, 'fx.touch-materialize', at, { noShake: true, scale: 0.8 }, `give:${ev.item}`);
      announce(at);
    }
    return;
  }
  const carrier = c.carrier;
  c.alive = false;
  const grip = c.model.sockets.grip ?? [0, 0, 0];
  const start = new THREE.Vector3();
  c.item.getWorldPosition(start);
  stage.world.attach(c.item);
  stage.tweens.add(300, (t) => {
    const to = handAt();
    if (!to) return;
    const k = stepped(t, 4);
    const s = 1 - 0.35 * k;
    // The item's grip (the handle) lands on the hand.
    c.item.position.set(
      start.x + (to.x - grip[0] * s - start.x) * k,
      start.y + (to.y - grip[1] * s - start.y) * k + Math.sin(k * Math.PI) * 0.25,
      start.z + (to.z - 0.05 - start.z) * k,
    );
    c.item.scale.setScalar(s);
  }, () => {
    pop();
    dropCarried(stage, c);
    if (carrier.disposed) return;
    flyTo(stage, carrier, carrier.home.clone(), 2400, () => setRest(carrier));
  });
}
