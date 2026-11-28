import * as THREE from 'three';
import type { KernelEvent } from '../contracts/events.js';
import { ModelCatalog, ZONES } from '../procgen/index.js';
import { fade } from './stage-actor.js';
import { buildStageActor, disposeStageActor, type StageActor } from './stage-cast.js';
import { ACTOR_Z } from './stage-const.js';
import { playFx, triggerShake } from './stage-fx.js';
import { placeX } from './stage-layout.js';
import { flashActor } from './stage-motion.js';
import { stepped } from './tween.js';
import type { ComicStage } from './comic-stage.js';

const oomActors = new WeakMap<ComicStage, Set<StageActor>>();

function crashPool(stage: ComicStage): Set<StageActor> {
  let pool = oomActors.get(stage);
  if (!pool) {
    pool = new Set();
    oomActors.set(stage, pool);
  }
  return pool;
}

export function clearComposeOomActors(stage: ComicStage): void {
  const pool = oomActors.get(stage);
  if (!pool || pool.size === 0) return;
  for (const a of pool) disposeStageActor(a);
  pool.clear();
}

export function stepComposeEffects(stage: ComicStage, dt: number): void {
  const pool = oomActors.get(stage);
  if (pool) {
    for (const a of [...pool]) {
      if (a.disposed) {
        pool.delete(a);
        continue;
      }
      a.group.position.set(a.base.x + a.offset.x, a.base.y + a.offset.y, a.base.z + a.offset.z);
      a.animator.update(dt);
    }
  }
  for (const a of stage.actors.values()) {
    if (!a.id.startsWith('docker:float:') || a.disposed || a.exiting || a.dead || a.lock) continue;
    if (stage.reducedMotion.on) {
      a.offset.set(0, 0, 0);
      a.body.rotation.z = a.baseRot[2];
      a.body.rotation.y = a.baseRot[1];
    } else {
      const idx = Number(a.id.slice(13)) || 0;
      a.offset.x = Math.round(Math.sin(stage.elapsed * 2.2 + idx * 1.4) * 3) * 0.025;
      a.offset.y = Math.round(Math.cos(stage.elapsed * 3.0 + idx * 1.1) * 3) * 0.032;
      a.body.rotation.z = a.baseRot[2] + Math.round(Math.sin(stage.elapsed * 2.0 + idx) * 2) * 0.045;
      a.body.rotation.y = Math.round(Math.sin(stage.elapsed * 1.5 + idx * 0.9) * 3) * 0.08;
    }
    a.group.position.set(a.base.x + a.offset.x, a.base.y + a.offset.y, a.base.z + a.offset.z);
  }
}

export function onComposeOomCrash(stage: ComicStage, ev: Extract<KernelEvent, { type: 'COMPOSE_OOM_CRASH' }>): void {
  if (!Array.isArray(ev.actors) || ev.actors.length === 0) return;
  clearComposeOomActors(stage);
  const pool = crashPool(stage);

  ev.actors.forEach((rawSpec, idx) => {
    if (!rawSpec || typeof rawSpec !== 'object') return;
    const rawX = Number.isFinite(rawSpec.x) ? rawSpec.x : -0.35 + idx * 1.15;
    const hoverY = Number.isFinite(rawSpec.hoverY) ? Math.max(0.8, Math.min(3.0, rawSpec.hoverY)) : 1.9;
    const model = typeof rawSpec.model === 'string' && ModelCatalog.has(rawSpec.model) ? rawSpec.model : 'prop.file';
    const label = typeof rawSpec.label === 'string' && rawSpec.label ? rawSpec.label : `[svc-${idx}]`;
    const worldX = placeX(stage, rawX);
    const startY = stage.feetY + 0.35;
    const peakY = stage.feetY + hoverY;
    const z = ACTOR_Z + 0.14 + (idx % 2) * 0.03;

    const actor = buildStageActor(
      { key: 'entity', id: `oom-temp:${idx}`, model, kind: 'prop', state: 'idle', x: rawX, y: 0.35, hidden: false, label },
      stage.actorSeed++,
    );
    actor.base.set(worldX, startY, z);
    actor.group.position.copy(actor.base);
    stage.world.add(actor.group);
    stage.applyInk(actor.group);
    pool.add(actor);

    const dropActor = (): void => {
      pool.delete(actor);
      disposeStageActor(actor);
    };

    if (stage.reducedMotion.on) {
      actor.base.y = peakY;
      flashActor(stage, actor, ZONES.faultBright.color, 320, 0);
      if (idx === 0) {
        playFx(stage, 'fx.matrix-fault', new THREE.Vector3(worldX, peakY, z), { scale: 0.85, noShake: true });
      }
      stage.tweens.delay(450, dropActor);
      return;
    }

    const stagger = idx * 55;
    const tiltDir = idx % 2 === 0 ? 1 : -1;

    // Beat 1: Fly upward into cluster orbit.
    stage.tweens.delay(stagger, () => {
      if (actor.disposed) return;
      stage.tweens.add(400, (t) => {
        if (actor.disposed) return;
        const p = stepped(t, 5);
        actor.base.y = startY + (peakY - startY) * p;
        actor.offset.x = Math.sin(p * Math.PI) * 0.08 * tiltDir;
        actor.body.rotation.z = actor.baseRot[2] + p * 0.08 * tiltDir;
      }, () => {
        if (!actor.disposed) actor.offset.x = 0;
      });
    });

    // Beat 2: Mid-air heap fault rattle + flash + OOM banner.
    stage.tweens.delay(stagger + 400, () => {
      if (actor.disposed) return;
      flashActor(stage, actor, ZONES.faultBright.color, 360, 0);
      playFx(stage, 'fx.matrix-fault', new THREE.Vector3(worldX, peakY, z), {
        scale: 0.68,
        noShake: idx > 0,
      });
      if (label.includes('java') || idx === 0) {
        playFx(stage, 'fx.coredump', new THREE.Vector3(worldX, peakY + 0.15, z), {
          text: 'OOM KILLED!',
          scale: 0.8,
          noShake: idx > 0,
        });
      }
      stage.tweens.add(400, (t) => {
        if (actor.disposed) return;
        actor.offset.x = Math.sin(t * Math.PI * 10) * 0.08;
        actor.offset.y = Math.cos(t * Math.PI * 8) * 0.04;
      }, () => {
        if (!actor.disposed) actor.offset.set(0, 0, 0);
      });
    });

    // Beat 3: Killed (Exit 137) and slammed to floor.
    stage.tweens.delay(stagger + 800, () => {
      if (actor.disposed) return;
      stage.tweens.add(360, (t) => {
        if (actor.disposed) return;
        const fall = stepped(t, 4);
        actor.base.y = peakY + (stage.feetY - peakY) * (fall * fall);
        actor.body.rotation.z = actor.baseRot[2] + fall * 0.45 * tiltDir;
      }, () => {
        if (actor.disposed) return;
        actor.base.y = stage.feetY;
        const ground = new THREE.Vector3(worldX, stage.feetY + 0.15, z);
        playFx(stage, 'fx.mv-dust', ground, { scale: 0.72, noShake: true });
        if (idx === 0) {
          triggerShake(stage, 0.08);
          playFx(stage, 'fx.sigkill', ground, { text: 'EXIT 137', scale: 0.7, noShake: true });
        }
      });
    });

    // Beat 4: Fade out & dispose before selfcheck completes.
    stage.tweens.delay(stagger + 1180, () => {
      if (actor.disposed) return;
      stage.tweens.add(300, (t) => {
        if (!actor.disposed) fade(actor, Math.max(0.02, 1 - stepped(t, 3)));
      }, dropActor);
    });
  });
}
