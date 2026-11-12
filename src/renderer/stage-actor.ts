import * as THREE from 'three';
import { eventEntityIds } from './event-fx.js';
import { disposeStageActor, type StageActor } from './stage-cast.js';
import { lockedNames, normName } from './stage-const.js';
import type { ComicStage } from './comic-stage.js';

export function reportStage(stage: ComicStage, where: string, err: unknown): void {
  const msg = `${where}: ${err instanceof Error ? err.message : String(err)}`;
  if (stage.errors.length < 200) stage.errors.push(msg);
  console.warn('[ComicStage]', msg, err);
}

/** Put the actor back in its resting state (after one-shots end, the animator resumes by itself). */
export function setRest(a: StageActor): void {
  if (a.disposed || a.exiting) return;
  const target = a.rest === 'walk' && a.kind === 'vibecoder' ? 'idle' : a.rest;
  if (a.animator.state !== target) a.animator.setState(target);
}

export function removeActor(stage: ComicStage, a: StageActor): void {
  stage.actors.delete(a.id);
  const box = stage.hitboxes.get(a.id);
  if (box) {
    box.removeFromParent();
    box.dispose();
    stage.hitboxes.delete(a.id);
  }
  disposeStageActor(a);
}

/** Scales every material's own opacity (ghost and glass zones keep their base transparency). */
export function fade(actor: StageActor, opacity: number): void {
  for (const mat of actor.all) {
    if (!mat.uniforms.uOpacity) continue;
    const value = opacity * ((mat.userData.baseOpacity as number | undefined) ?? 1);
    mat.uniforms.uOpacity.value = value;
    const ghost = (mat.uniforms.uGhost?.value as number) > 0.5;
    mat.transparent = ghost || value < 0.99;
    mat.depthWrite = !ghost && value > 0.9;
  }
  actor.body.traverse((obj) => {
    if (!obj.userData.outline) return;
    const basic = (obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
    basic.transparent = opacity < 0.98;
    basic.opacity = opacity;
    basic.depthWrite = opacity > 0.9;
  });
}

/** A queued event still names this actor (entity id, target, or its pid). */
export function queuedFor(stage: ComicStage, a: StageActor): boolean {
  return stage.queue.some((q) => eventEntityIds(q.ev).includes(a.id) || (q.ev.type === 'PROC_SIGNALED' && a.pid !== undefined && q.ev.pid === a.pid));
}

export function pendingQueuedSpawn(stage: ComicStage, id: string): boolean {
  return stage.queue.some((q) => (q.ev.type === 'ENTITY_SPAWNED' || q.ev.type === 'FILE_CREATED') && eventEntityIds(q.ev).includes(id));
}

/** A door is locked when the view says so: `[locked]` / `(sealed)` in its label, or a 'locked' neighbour with its exact name. */
export function isLocked(stage: ComicStage, a: StageActor, lockedLabels?: Set<string>): boolean {
  return doorLocked(a, lockedLabels ?? lockedNames(stage.view));
}

export function doorLocked(a: StageActor, lockedLabels: Set<string>): boolean {
  if (a.kind !== 'door') return false;
  const label = (a.label ?? '').toLowerCase();
  if (label.includes('[locked]') || label.includes('(sealed)') || a.viewState === 'petrified') return true;
  const target = normName(a.target ?? '');
  const name = normName(label);
  return (target !== '' && lockedLabels.has(target)) || (name !== '' && lockedLabels.has(name));
}
