import * as THREE from 'three';
import type { ComixCastActor, ComixPanelSpec } from '../chapters/types.js';
import { CinematicStage } from '../cinematic/stage.js';

/**
 * Comix spec `x` grows to image-right (the same axis draw-comix.mjs uses).
 * CinematicStage looks along +z from z = −8, and on that camera world +x is screen-left,
 * so image-right is world −x. `halfW` is the camera's visible half-width.
 */
export function specXToWorld(specX: number, halfW: number): number {
  return -specX * halfW * 0.78;
}

const SEED = 7;

const ENTRANCE = 1.7;

export interface LivePanel {
  step(dt: number): void;
  render(t: number): void;
  resize(): void;
  dispose(): void;
  /** Start, or play the entrance again. Idle keeps running after it finishes. */
  replay(): void;
  started(): boolean;
  /** The entrance has reached the held pose. */
  complete(): boolean;
  /** The entrance is currently moving. */
  busy(): boolean;
}

function parseHex(hex: string | undefined, fallback: number): number {
  const n = Number.parseInt((hex ?? '').replace('#', ''), 16);
  return Number.isFinite(n) && (hex ?? '').replace('#', '').length === 6 ? n : fallback;
}

function addModel(stage: CinematicStage, id: string): ReturnType<CinematicStage['addModel']> | null {
  try {
    return stage.addModel(id, SEED);
  } catch (err) {
    console.warn(`comix: skipped "${id}"`, err);
    return null;
  }
}

/** How tall this prop reads next to a person, after each model is fitted to a target height. */
function actorMul(id: string): number {
  if (id.startsWith('pickup.')) return 0.46;
  if (id === 'npc.kiro_ghost') return 0.72;
  if (id.startsWith('prop.')) return 0.55;
  if (id.startsWith('malware.')) return 0.8;
  if (id.startsWith('door.')) return 0.88;
  if (id.startsWith('boss.')) return 1.05;
  return 1;
}

interface PlacedCast {
  group: THREE.Object3D;
  animator: { seek(t: number): void };
  specX: number;
  heightMul: number;
  homeX: number;
  homeY: number;
  homeZ: number;
  homeScale: number;
}

/** Held comic poses: four snaps, then ease into the last one. */
function comicIn(k: number): number {
  const stepped = Math.round(Math.min(1, Math.max(0, k)) * 4) / 4;
  return 1 - (1 - stepped) * (1 - stepped);
}

/** Feet on y = 0, height in world units. The box is measured after a unit scale so resize is not cumulative. */
function stand(group: THREE.Object3D, height: number, x: number, z: number): void {
  group.scale.setScalar(1);
  group.position.set(0, 0, z);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const measured = Math.max(0.05, box.max.y - box.min.y);
  group.scale.setScalar(height / measured);
  group.position.set(x, 0, z);
  group.updateMatrixWorld(true);
  group.position.y -= new THREE.Box3().setFromObject(group).min.y;
}

/**
 * The picture is the lower band of the panel (lettering sits above it).
 * Show feet at the bottom and full bodies, and spread the cast across that view.
 * shot.w stays tiny so CinematicStage keeps this height instead of pulling back to fit the room width.
 */
function frameCast(stage: CinematicStage, cast: PlacedCast[], aspect: number): void {
  const aspectSafe = Math.max(0.55, aspect);
  // Keep this height even on a very wide panel. Clamping to the room would
  // shrink a short strip until the cast's feet fall out of the picture.
  const halfH = 1.75;
  stage.clampToRoom = false;
  stage.shot = { x: 0, y: 1.2, w: 0.02, h: halfH * 2 };
  const visibleHalfW = Math.min(3.6, halfH * aspectSafe);
  const span = (visibleHalfW * 0.7) / 0.78;
  const crowd = cast.length >= 4 ? 0.62 : 1;
  cast.forEach((actor, index) => {
    const height = 1.55 * actor.heightMul * crowd;
    const z = -0.12 - index * 0.05;
    stand(actor.group, height, specXToWorld(actor.specX, span), z);
    actor.homeX = actor.group.position.x;
    actor.homeY = actor.group.position.y;
    actor.homeZ = actor.group.position.z;
    actor.homeScale = actor.group.scale.x;
  });
}

function applyEntrance(cast: PlacedCast[], k: number): void {
  const rise = (1 - k) * 0.95;
  const scale = 0.12 + 0.88 * k;
  for (const actor of cast) {
    actor.group.position.set(actor.homeX, actor.homeY + rise, actor.homeZ);
    actor.group.scale.setScalar(actor.homeScale * scale);
  }
}

function placeCast(stage: CinematicStage, cast: ComixCastActor[]): PlacedCast[] {
  const placed: PlacedCast[] = [];
  cast.forEach((actor) => {
    const live = addModel(stage, actor.model);
    if (!live) return;
    placed.push({
      group: live.model.group,
      animator: live.animator,
      specX: actor.x ?? 0,
      heightMul: actorMul(actor.model) * (actor.scale ?? 1),
      homeX: 0,
      homeY: 0,
      homeZ: 0,
      homeScale: 1,
    });
  });
  return placed;
}

const dead: LivePanel = {
  step() {},
  render() {},
  resize() {},
  dispose() {},
  replay() {},
  started: () => false,
  complete: () => true,
  busy: () => false,
};

/** One panel: the game's comic renderer, room behind the cast, idle animation on the stage clock. */
export function mountPanel(host: HTMLElement, panel: ComixPanelSpec): LivePanel {
  let stage: CinematicStage;
  try {
    stage = new CinematicStage();
  } catch (err) {
    console.warn('comix: no WebGL for this panel', err);
    host.classList.add('comix-gl-fail');
    return dead;
  }
  host.appendChild(stage.canvas);
  stage.setBackground(parseHex(panel.bgHex, 0x12091c));
  if (panel.room) addModel(stage, panel.room);
  const cast = placeCast(stage, panel.cast ?? []);

  let age = -1;
  const pose = (): void => {
    if (age < 0) return;
    applyEntrance(cast, comicIn(Math.min(1, age / ENTRANCE)));
  };
  const resize = (): void => {
    const rect = host.getBoundingClientRect();
    const width = Math.max(2, rect.width);
    const height = Math.max(2, rect.height);
    stage.setSize(width, height);
    frameCast(stage, cast, width / height);
    pose();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  return {
    step(dt) {
      if (age < 0) return;
      age += dt;
      pose();
      stage.step(dt);
    },
    render: (t) => stage.render(t),
    resize,
    dispose: () => {
      observer.disconnect();
      stage.dispose();
    },
    replay() {
      age = 0;
      for (const actor of cast) actor.animator.seek(0);
      pose();
    },
    started: () => age >= 0,
    complete: () => age >= ENTRANCE,
    busy: () => age >= 0 && age < ENTRANCE,
  };
}

export function mountPagePanels(sheet: HTMLElement, panels: ComixPanelSpec[]): LivePanel[] {
  const hosts = [...sheet.querySelectorAll<HTMLElement>('.comix-gl')];
  return panels.map((panel, index) => mountPanel(hosts[index] ?? sheet, panel));
}

export function disposePanels(panels: LivePanel[]): void {
  for (const panel of panels) panel.dispose();
  panels.length = 0;
}
