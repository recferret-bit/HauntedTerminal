import * as THREE from 'three';
import { setCrtTime } from '../shaders/crt-pass.js';
import type { RoomActor } from './room-view.js';
import type { StageActor } from './stage-cast.js';
import { actorSocket } from './stage-cast.js';
import { queuedFor, removeActor, setRest } from './stage-actor.js';
import { ACTOR_Z, CAM_HOME, LOOK_HOME, themeFor } from './stage-const.js';
import { runStageEvent } from './stage-events.js';
import { playFx } from './stage-fx.js';
import { popOut } from './stage-motion.js';
import { applyActor } from './stage-sync.js';
import type { ComicStage } from './comic-stage.js';

export function stepStage(stage: ComicStage, dt: number): void {
  const dtMs = dt * 1000;
  stage.elapsed += dt;
  stage.clockMs += dtMs;
  // Queued events whose time came.
  if (stage.queue.length) {
    const due = stage.queue.filter((q) => q.at <= stage.clockMs);
    if (due.length) {
      stage.queue = stage.queue.filter((q) => q.at > stage.clockMs);
      for (const q of due) runStageEvent(stage, q.ev);
      for (const a of [...stage.actors.values()]) {
        const ra = (a as StageActor & { deferredRa?: RoomActor }).deferredRa;
        if (ra && !a.disposed && !queuedFor(stage, a)) applyActor(stage, a, ra, 0, false);
      }
    }
  }
  for (const [id, p] of stage.pendingSpawn) if (stage.clockMs - p.at > 4000) stage.pendingSpawn.delete(id);
  stage.tweens.update(dtMs);
  stepActors(stage, dt);
  heroFidget(stage, dt);
  lightFrame(stage, dt);
  applyShake(stage);
  if (stage.stormOn && !stage.devNoStorm) {
    stage.stormIn -= dt;
    if (stage.stormIn <= 0) {
      stage.stormIn = 7 / Math.max(0.35, stage.stormIntensity);
      const x = stage.panelRight + Math.random() * (stage.panelLeft - stage.panelRight);
      playFx(stage, 'fx.lightning-strike', new THREE.Vector3(x, stage.feetY, ACTOR_Z + 0.4), { text: ' ', noShake: true, flashMul: 0.18 * stage.stormIntensity, scale: 0.85 });
    }
  }
  stage.lightning.update(dt);
  stage.fxPlayer.update(dtMs, stage.lightning.flashStrength, stage.lightning.flashPos);
  setCrtTime(stage.crtPass, stage.elapsed);
  feedComics(stage, dt);
  syncOverlayFrame(stage);
  updateXrayLinks(stage);
  updateBadges(stage);
  stage.overlay.update(dtMs);
  stage.cameos.update(dt);
  stage.world.updateMatrixWorld(true);
  updateHitboxes(stage);
}

/** The hero's idle life between commands: a glance, a look up at the agents, a shiver. */
function heroFidget(stage: ComicStage, dt: number): void {
  const hero = stage.hero();
  if (!hero || hero.disposed || hero.animator.state !== 'idle' || queuedFor(stage, hero)) {
    stage.fidgetIn = Math.max(stage.fidgetIn, 2.5);
    return;
  }
  stage.fidgetIn -= dt;
  if (stage.fidgetIn > 0) return;
  stage.fidgetIn = 4 + Math.random() * 4;
  const pick = Math.floor(Math.random() * 4);
  if (pick === 0 || pick === 1) {
    // Glance one way, then the other: stepped, like two drawings.
    const dir = pick === 0 ? 1 : -1;
    stage.tweens.add(1500, (t) => {
      if (!hero.disposed) hero.animator.setLook(t < 0.45 ? dir : t < 0.85 ? -dir : 0, 0);
    }, () => { if (!hero.disposed) hero.animator.setLook(0, 0); });
  } else if (pick === 2) {
    // Look up, where the agents watch from, and shrink a little.
    stage.tweens.add(1300, (t) => {
      if (hero.disposed) return;
      hero.animator.setLook(0, t < 0.8 ? 1 : 0);
      hero.offset.y = t > 0.15 && t < 0.8 ? -0.03 : 0;
    }, () => { if (!hero.disposed) { hero.animator.setLook(0, 0); hero.offset.y = 0; } });
  } else {
    // A shiver: this place is cold.
    stage.tweens.add(420, (t) => {
      if (!hero.disposed) hero.offset.x = t < 1 ? (Math.floor(t * 8) % 2 ? 0.025 : -0.025) : 0;
    }, () => { if (!hero.disposed) hero.offset.x = 0; });
  }
}

function lightFrame(stage: ComicStage, dt: number): void {
  const h = stage.hero();
  const lantern = h && !h.disposed && h.group.visible ? actorSocket(h, 'lantern') : null;
  stage.light.update(dt, {
    lantern,
    feetY: stage.feetY,
    panelLeft: stage.panelLeft,
    panelRight: stage.panelRight,
    panelTop: stage.column.top + 0.7,
    flash: stage.lightning.flashStrength,
  });
  // The bulb itself burns brighter while the light is boosted.
  const glow = h?.glow;
  if (!glow) return;
  const base = (glow.userData.baseEmissive as number | undefined) ?? 0.35;
  const want = base + (stage.view?.lantern ? 1.25 : 0) + 0.9 * stage.light.boosted;
  if (glow.uniforms.uEmissive!.value < want || stage.light.boosted > 0) glow.uniforms.uEmissive!.value = want;
}

function feedComics(stage: ComicStage, dt: number): void {
  const flash = stage.lightning.flashStrength;
  const flashPos = stage.lightning.flashPos;
  const feed = (mat: THREE.ShaderMaterial) => {
    if (mat.uniforms.uTime) mat.uniforms.uTime.value = stage.elapsed;
    if (mat.uniforms.uFlash) {
      mat.uniforms.uFlash.value = flash;
      (mat.uniforms.uFlashPos!.value as THREE.Vector3).copy(flashPos);
    }
  };
  for (const mat of stage.comics) feed(mat);
  for (const mat of stage.extraComics) feed(mat);
  for (const a of stage.actors.values()) {
    for (const mat of a.model.allMaterials) feed(mat);
    if (a.vortex) a.vortex.uniforms.uTime!.value = stage.elapsed;
    if (a.vortexMesh) a.vortexMesh.rotation.y += dt * 0.8;
  }
  stage.room?.animator.update(dt);
  const floodMat = stage.flood.material as THREE.ShaderMaterial;
  floodMat.uniforms.uTime!.value = stage.elapsed;
}

/** Walk bases toward homes (stepped), apply offsets, visibility, animators and overlays. */
function stepActors(stage: ComicStage, dt: number): void {
  const dtMs = dt * 1000;
  for (const a of [...stage.actors.values()]) {
    if (a.disposed) continue;
    // An actor the view dropped, with nothing queued for it: pop it out.
    const listed = (a as StageActor & { listed?: boolean }).listed;
    if (listed === false && !a.exiting && !a.dead && a.kind !== 'vibecoder' && !queuedFor(stage, a)) popOut(stage, a);
    if (listed === false && a.dead) {
      removeActor(stage, a);
      continue;
    }
    if (!a.lock && !a.exiting) walkActor(stage, a, dtMs);
    a.group.position.set(a.base.x + a.offset.x, a.base.y + a.offset.y, a.base.z + a.offset.z);
    const viewHidden = (a as StageActor & { viewHidden?: boolean }).viewHidden ?? false;
    a.group.visible = !a.awaitingSpawn && !a.dead && (!viewHidden || a.lock !== 0 || a.exiting);
    a.animator.update(dt);
    if (a.pips) a.pips.visible = a.pips.visible && a.group.visible;
  }
}

function walkActor(stage: ComicStage, a: StageActor, dtMs: number): void {
  if (a.id === 'kiro') {
    walkKiro(stage, a, dtMs);
    return;
  }
  const dx = a.home.x - a.base.x;
  if (Math.abs(dx) > 0.02) {
    (a as StageActor & { moveDir?: number }).moveDir = Math.sign(dx);
    if (a.kind === 'vibecoder') {
      // Stepped walk: one 0.24 jump every 83 ms (12 poses per second).
      a.stepClock += dtMs;
      if (a.animator.state !== 'walk') {
        a.animator.setState('walk');
        a.animator.setFacing(dx > 0 ? 1 : -1);
      }
      while (a.stepClock >= 83) {
        a.stepClock -= 83;
        a.base.x += Math.sign(dx) * Math.min(Math.abs(a.home.x - a.base.x), 0.24);
      }
    } else if (a.stepUnits > 0 && a.stepEveryMs > 0 && Math.abs(dx) < 2.5) {
      a.stepClock += dtMs;
      if (a.stepClock >= a.stepEveryMs) {
        a.stepClock = 0;
        a.base.x += Math.sign(dx) * Math.min(Math.abs(dx), Math.max(0.12, a.stepUnits));
      }
    } else {
      a.base.x = a.home.x;
    }
  } else {
    a.base.x = a.home.x;
    if (a.kind === 'vibecoder' && a.animator.state === 'walk') {
      a.animator.setFacing(-1);
      setRest(a);
    }
  }
  a.base.y = a.home.y;
  a.base.z = a.home.z;
}

function walkKiro(stage: ComicStage, a: StageActor, dtMs: number): void {
  const hero = stage.hero();
  const wantX = !a.target && hero && !hero.disposed
    ? Math.min(stage.panelLeft - 0.25, hero.base.x + 0.56)
    : a.home.x;
  const kdx = wantX - a.base.x;
  if (Math.abs(kdx) > 0.02) {
    a.stepClock += dtMs;
    while (a.stepClock >= 83) {
      a.stepClock -= 83;
      a.base.x += Math.sign(kdx) * Math.min(Math.abs(wantX - a.base.x), 0.28);
    }
  } else {
    a.base.x = wantX;
  }
  a.base.y = a.home.y;
  a.base.z = a.home.z;
  const fig8X = Math.round(Math.sin(stage.elapsed * (a.target ? 5.5 : 2.1)) * 2) * 0.022;
  const fig8Y = Math.round(Math.cos(stage.elapsed * (a.target ? 7.0 : 3.1)) * 2) * 0.025;
  a.offset.x = fig8X;
  a.offset.y = fig8Y;
}

function updateHitboxes(stage: ComicStage): void {
  if (!stage.config.showHitboxes) {
    for (const box of stage.hitboxes.values()) box.visible = false;
    return;
  }
  for (const a of stage.actors.values()) {
    let box = stage.hitboxes.get(a.id);
    if (!box) {
      box = new THREE.BoxHelper(a.body, themeFor(stage.view?.kind ?? 'attic').accent);
      stage.world.add(box);
      stage.hitboxes.set(a.id, box);
    }
    box.visible = a.group.visible;
    box.update();
  }
}

/** PS_XRAY parent -> child links: ink-backed green quads, pulsing in two held widths. */
function updateXrayLinks(stage: ComicStage): void {
  const pairs: [StageActor, StageActor][] = [];
  if (stage.xrayOn) {
    const live = [...stage.actors.values()].filter((a) => !a.exiting && !a.dead && a.group.visible && a.pid !== undefined);
    const byPid = new Map(live.map((a) => [a.pid!, a]));
    const fromProcs = stage.xrayProcs.length > 0;
    if (fromProcs) {
      for (const p of stage.xrayProcs) {
        const parent = byPid.get(p.ppid);
        const child = byPid.get(p.pid);
        if (parent && child && parent !== child) pairs.push([parent, child]);
      }
    }
    if (pairs.length === 0) {
      const boss = live.find((a) => a.kind === 'boss');
      if (boss) for (const a of live) if (a !== boss && a.kind === 'enemy') pairs.push([boss, a]);
    }
  }
  stage.overlay.links(pairs.map(([p, c]) => [
    new THREE.Vector3(p.group.position.x, p.group.position.y + p.height + 0.62, p.group.position.z),
    new THREE.Vector3(c.group.position.x, c.group.position.y + c.height + 0.62, c.group.position.z),
  ]));
}

/** Per-actor badges (pips, PID plate, padlock) placed over the projected actor every step. */
function updateBadges(stage: ComicStage): void {
  const live = new Set<string>();
  for (const a of stage.actors.values()) {
    if (a.disposed) continue;
    live.add(a.id);
    const b = (a as StageActor & { badge?: { pips: { lit: number; cells: number } | null; plate: { pid: number; name?: string } | null; locked: boolean } }).badge;
    if (!b) continue;
    const visible = a.group.visible && !a.exiting && !a.dead;
    const top = new THREE.Vector3(a.group.position.x, a.group.position.y + a.height + 0.12 + a.animator.hoverOffset, a.group.position.z);
    stage.overlay.badge(a.id, {
      top,
      visible: visible || (b.locked && a.group.visible),
      pips: visible ? b.pips : null,
      plate: visible ? b.plate : null,
      lock: b.locked && a.group.visible ? actorSocket(a, a.model.sockets.lock ? 'lock' : 'fx') : null,
    });
  }
  stage.overlay.pruneBadges(live);
}

/** Re-project the DOM overlay with this frame's camera (shake included) and panel. */
function syncOverlayFrame(stage: ComicStage): void {
  const h = Math.max(1, stage.mount.clientHeight);
  stage.overlay.sync(stage.camera, stage.panelBounds(), h / (5.35 / stage.zoom));
}

function applyShake(stage: ComicStage): void {
  if (stage.shakeLeft <= 0) {
    stage.camera.position.copy(CAM_HOME);
    stage.camera.lookAt(LOOK_HOME);
    return;
  }
  stage.shakeLeft -= 16;
  const amp = stage.shakeAmp * Math.max(0, stage.shakeLeft / 280);
  stage.camera.position.set(
    CAM_HOME.x + (Math.random() - 0.5) * 2 * amp,
    CAM_HOME.y + (Math.random() - 0.5) * 2 * amp,
    CAM_HOME.z,
  );
  stage.camera.lookAt(LOOK_HOME);
}
