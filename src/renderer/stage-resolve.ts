import * as THREE from 'three';
import type { KernelEvent } from '../contracts/events.js';
import { eventEntityIds, type FxAnchor } from './event-fx.js';
import { actorSocket, type StageActor } from './stage-cast.js';
import { isLocked } from './stage-actor.js';
import { ACTOR_Z } from './stage-const.js';
import type { ComicStage } from './comic-stage.js';

export function findByKey(stage: ComicStage, key: string): StageActor | null {
  for (const a of stage.actors.values()) if (a.key === key && !a.exiting) return a;
  return null;
}

export function findByModel(stage: ComicStage, model: string): StageActor | null {
  for (const a of stage.actors.values()) if (a.modelId === model && !a.exiting) return a;
  return null;
}

export function firstOfKind(stage: ComicStage, kind: StageActor['kind'], pred?: (a: StageActor) => boolean): StageActor | null {
  for (const a of stage.actors.values()) if (a.kind === kind && !a.exiting && !a.dead && (!pred || pred(a))) return a;
  return null;
}

function findByName(stage: ComicStage, name: string | undefined, exact = false): StageActor | null {
  if (!name) return null;
  const n = name.toLowerCase();
  for (const a of stage.actors.values()) {
    if (a.exiting) continue;
    if (a.target?.toLowerCase() === n || a.label?.toLowerCase() === n || a.id.toLowerCase() === n) return a;
  }
  if (exact) return null;
  for (const a of stage.actors.values()) {
    if (a.exiting) continue;
    const hay = `${a.target ?? ''} ${a.label ?? ''} ${a.modelId}`.toLowerCase();
    if (hay.includes(n) || (n.length > 3 && n.includes((a.label ?? '#').toLowerCase()))) return a;
  }
  return null;
}

function byPid(stage: ComicStage, pid: number): StageActor | null {
  for (const a of stage.actors.values()) if (a.pid === pid && !a.exiting) return a;
  return null;
}

export function subjectFor(stage: ComicStage, ev: KernelEvent): StageActor | null {
  const ids = eventEntityIds(ev);
  for (const id of ids) {
    const a = stage.actors.get(id);
    if (a && !a.disposed) return a;
  }
  // Persistent reactions (kill, freeze, petrify, open, slide) need an exact match: entity id, pid
  // or the legacy key. A guess would kill or open the wrong thing for good, so no match = no subject.
  switch (ev.type) {
    case 'PROC_SIGNALED': {
      const boss = findByKey(stage, 'boss');
      return byPid(stage, ev.pid) ?? (boss && boss.pid === undefined ? boss : null);
    }
    case 'PERMISSION_DENIED_RATTLE':
      // Only a rattle and sparks: a best guess is fine.
      return findByKey(stage, 'gate') ?? firstOfKind(stage, 'door', (a) => a.modelId !== 'door.devnull' && isLocked(stage, a))
        ?? firstOfKind(stage, 'door', (a) => a.modelId !== 'door.devnull') ?? firstOfKind(stage, 'npc');
    case 'INODE_MODE_CHANGED':
      return null;
    case 'OBJECT_MOVED':
      return findByKey(stage, 'crate');
    case 'PUZZLE_DOOR_RESOLVED':
    case 'OBSTACLE_DIALOGUE_RENDERED':
      return findByKey(stage, 'socket') ?? firstOfKind(stage, 'npc');
    case 'SYSTEM_HAND_SPAWN':
      return findByName(stage, ev.name, true);
    case 'FILE_REMOVED':
    case 'FILE_CREATED':
      return findByName(stage, ev.name, true);
    case 'LANTERN_REVEAL':
      return findByKey(stage, 'ghost');
    case 'BATTLE_STARTED':
    case 'AGENT_TAUNT': {
      const modelId = typeof ev.model === 'string' && ev.model
        ? ev.model
        : typeof ev.agent === 'string' && ev.agent
          ? `agent.${ev.agent}`
          : '';
      return modelId ? findByModel(stage, modelId) : null;
    }
    default:
      return null;
  }
}

export function sourceFor(stage: ComicStage, ev: KernelEvent): StageActor | null {
  if (ev.type !== 'PLAYER_DAMAGED') return null;
  // The attacker: named by sourceName (including entities-combat's `stderr` / `necromancer_forkd` / `zombie_worker`), else whoever holds windup.
  if (ev.sourceName === 'stderr') {
    const kernel = findByModel(stage, 'boss.kernel') ?? firstOfKind(stage, 'boss');
    if (kernel && !kernel.dead) return kernel;
  }
  if (ev.sourceName === 'necromancer_forkd') {
    const forkbomb = findByModel(stage, 'boss.forkbomb') ?? firstOfKind(stage, 'boss');
    if (forkbomb && !forkbomb.dead) return forkbomb;
  }
  const named = findByName(stage, ev.sourceName);
  if (named && !named.dead && (named.kind === 'enemy' || named.kind === 'boss')) return named;
  let tell: StageActor | null = null;
  for (const a of stage.actors.values()) {
    if (a.exiting || a.dead || a.animator.state !== 'windup') continue;
    if (!tell || (stage.lastAttack?.id === a.id)) tell = a;
  }
  if (tell) return tell;
  if (ev.sourceName === 'zombie_worker') {
    const last = stage.lastAttack ? stage.actors.get(stage.lastAttack.id) : undefined;
    if (last && !last.exiting && !last.dead && last.modelId === 'malware.zombie') return last;
    const z = findByModel(stage, 'malware.zombie');
    if (z && !z.dead) return z;
  }
  return null;
}

export function childrenOf(stage: ComicStage, parent: StageActor): StageActor[] {
  const out: StageActor[] = [];
  const childPids = new Set(stage.xrayProcs.filter((p) => p.ppid === parent.pid).map((p) => p.pid));
  for (const a of stage.actors.values()) {
    if (a === parent || a.exiting) continue;
    if (a.pid !== undefined && childPids.has(a.pid)) out.push(a);
    else if (parent.key === 'boss' && a.key === 'minion') out.push(a);
  }
  return out;
}

export function roomSocket(stage: ComicStage, name: string): THREE.Vector3 | null {
  const s = stage.room?.model.sockets[name];
  if (!s || !stage.room) return null;
  stage.room.model.group.updateWorldMatrix(true, false);
  return stage.room.model.group.localToWorld(new THREE.Vector3(s[0], s[1], s[2]));
}

export function floodHeight(stage: ComicStage): number {
  return 0.02 + (stage.floodPercent / 100) * Math.max(1.2, stage.viewTop - stage.feetY - 0.35);
}

export function anchorPoint(stage: ComicStage, anchor: FxAnchor, subject: StageActor | null): THREE.Vector3 {
  const hero = stage.hero();
  const panelX = (stage.panelLeft + stage.panelRight) / 2;
  const panel = new THREE.Vector3(panelX, (stage.feetY + stage.viewTop) / 2, ACTOR_Z);
  switch (anchor) {
    case 'vibecoder':
      return hero ? actorSocket(hero, 'fx') : panel;
    case 'vibecoder-body':
      return hero ? new THREE.Vector3(hero.group.position.x, hero.group.position.y + hero.height * 0.52, hero.group.position.z) : panel;
    case 'hero-feet':
      return hero ? hero.group.position.clone() : panel.setY(stage.feetY);
    case 'subject':
    case 'hand':
      return subject ? actorSocket(subject, 'fx') : panel;
    case 'subject-feet':
      return subject ? subject.group.position.clone() : panel.setY(stage.feetY);
    case 'subject-lock':
      return subject ? actorSocket(subject, subject.model.sockets.lock ? 'lock' : 'fx') : panel;
    case 'devnull': {
      const hole = findByModel(stage, 'door.devnull');
      if (hole) return actorSocket(hole, 'vortex');
      return roomSocket(stage, 'devnull') ?? (subject ? actorSocket(subject, 'fx') : panel);
    }
    case 'flood': {
      const s = roomSocket(stage, 'flood');
      const top = stage.feetY - 0.45 + floodHeight(stage);
      return new THREE.Vector3(s ? s.x : panelX, Math.max(stage.feetY - 0.1, top), ACTOR_Z);
    }
    case 'panel':
      return panel;
    case 'agent':
      return subject
        ? actorSocket(subject, 'fx')
        : new THREE.Vector3(stage.panelRight + (stage.panelLeft - stage.panelRight) * 0.18, stage.viewTop - 0.85, ACTOR_Z);
    case 'panel-floor':
      return panel.setY(stage.feetY);
    default:
      return panel;
  }
}
