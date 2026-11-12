import * as THREE from 'three';
import { createComicComposer, frameOrtho, type ComicPost } from '../shaders/comic-composer.js';
import { setCrtSize, setCrtTime } from '../shaders/crt-pass.js';
import { LightningStrikeSystem } from '../shaders/lightning.js';
import { DEFAULT_PIXEL_PARAMS, setPixelArtParams, setPixelArtSize } from '../shaders/pixel-art.js';
import {
  buildModel, createAnimator, createFxEmitter, disposeModel, FxCatalog, ModelCatalog,
  type AnimatorOptions, type BuiltModel, type FxEmitter, type FxEmitterOptions, type ModelAnimator,
} from '../procgen/index.js';

/**
 * A small comic stage for the cinematics: the same renderer, camera convention and post chain as
 * src/renderer/comic-stage.ts (RenderPass -> OutputPass -> pixel-art -> CRT, ACES 1.05, DPR capped at
 * 1.75, pixel and CRT sizes in device pixels), without the game's cast and room plumbing.
 *
 * Camera: orthographic, on -z looking at +z, level. World +x is screen-left. A `Shot` is a world box
 * (centre + size) the camera must show; the frustum grows on the long axis to fit the panel's aspect.
 */
export interface Shot {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Actor {
  model: BuiltModel;
  animator: ModelAnimator;
}

export interface LiveFx {
  fx: FxEmitter;
  /** Seconds of cinematic time at which it was fired. */
  at: number;
}

/** Room-frame limits the camera should not look past (the set's shell bleeds 0.2 past ±4). */
const BOUNDS = { minX: -4.15, maxX: 4.15, minY: -0.55, maxY: 4.95 };

export function fitPanelStage<P extends string>(
  stage: { setSize(w: number, h: number): void },
  page: { panelSize(id: P): { w: number; h: number } },
  panel: P,
): void {
  const { w, h } = page.panelSize(panel);
  stage.setSize(w, h);
}

export class CinematicStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 40);
  readonly lightning: LightningStrikeSystem;
  readonly canvas: HTMLCanvasElement;
  private readonly composer: ComicPost['composer'];
  private readonly pixelPass: ComicPost['pixelPass'];
  private readonly crtPass: ComicPost['crtPass'];
  private readonly actors: Actor[] = [];
  private readonly fxs: LiveFx[] = [];
  private readonly extraMaterials: THREE.ShaderMaterial[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private width = 1;
  private height = 1;
  private pixelSize = DEFAULT_PIXEL_PARAMS.pixelSize;
  shot: Shot = { x: 0, y: 2.45, w: 8, h: 5.35 };
  /** Camera shake in world units, applied on top of the shot. */
  shake = 0;
  /** Extra flash on top of the lightning system's (decays by itself only if you decay it). */
  flash = 0;
  readonly flashPos = new THREE.Vector3();
  /** Clamp the view to the room frame when it fits. */
  clampToRoom = true;

  constructor() {
    const post = createComicComposer({
      antialias: true,
      preserveDrawingBuffer: true,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 1.75),
      addKeyLights: true,
      passWidth: 1,
      passHeight: 1,
      scene: this.scene,
      camera: this.camera,
    });
    ({ renderer: this.renderer, composer: this.composer, pixelPass: this.pixelPass, crtPass: this.crtPass } = post);
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'htc-gl';
    this.lightning = new LightningStrikeSystem(this.scene);
  }

  /** CSS-pixel size of the panel the canvas fills. */
  setSize(w: number, h: number): void {
    this.width = Math.max(1, Math.round(w));
    this.height = Math.max(1, Math.round(h));
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setSize(this.width, this.height);
    const pr = this.renderer.getPixelRatio();
    setPixelArtSize(this.pixelPass, this.width * pr, this.height * pr);
    this.applyPixel();
    setCrtSize(this.crtPass, this.width * pr, this.height * pr, pr);
  }

  /** Pixel-art cell size in CSS px (3.5 is the game default). The teleport dissolves by raising it. */
  setPixelSize(size: number): void {
    if (Math.abs(size - this.pixelSize) < 1e-3) return;
    this.pixelSize = size;
    this.applyPixel();
  }

  private applyPixel(): void {
    setPixelArtParams(this.pixelPass, { ...DEFAULT_PIXEL_PARAMS, pixelSize: this.pixelSize }, this.renderer.getPixelRatio());
  }

  setBackground(color: number): void {
    this.scene.background = new THREE.Color(color);
  }

  /** Build a catalog model with comic materials and an animator, add it to the scene. */
  addModel(id: string, seed = 1, opts: AnimatorOptions = {}): Actor {
    const model = buildModel(ModelCatalog.build(id, seed));
    const animator = createAnimator(model, opts);
    this.scene.add(model.group);
    const actor = { model, animator };
    this.actors.push(actor);
    return actor;
  }

  /** Fire an FX preset at a world position. The stage advances and disposes it. */
  fire(id: string, at: THREE.Vector3, t: number, opts: FxEmitterOptions & { scale?: number } = {}): FxEmitter {
    const fx = createFxEmitter(FxCatalog.get(id), opts);
    fx.group.position.copy(at);
    if (opts.scale) fx.group.scale.setScalar(opts.scale);
    this.scene.add(fx.group);
    this.fxs.push({ fx, at: t });
    return fx;
  }

  /** A shader material that is not a model's (vortex): gets uTime. */
  track<T extends THREE.ShaderMaterial>(mat: T): T {
    this.extraMaterials.push(mat);
    return mat;
  }

  /** Anything else to dispose with the stage (geometries, plain materials). */
  own<T extends { dispose(): void }>(thing: T): T {
    this.disposables.push(thing);
    return thing;
  }

  /** Advance animators, effects and lightning by dt seconds. */
  step(dt: number): void {
    for (const a of this.actors) a.animator.update(dt);
    for (let i = this.fxs.length - 1; i >= 0; i--) {
      const live = this.fxs[i]!;
      live.fx.update(dt * 1000);
      if (live.fx.done) {
        live.fx.dispose();
        this.fxs.splice(i, 1);
      }
    }
    this.lightning.update(dt);
  }

  /** Project a world point to CSS px inside the panel (origin top-left). */
  project(p: THREE.Vector3): { x: number; y: number } {
    this.updateCamera(0);
    const v = p.clone().project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.width, y: (-v.y * 0.5 + 0.5) * this.height };
  }

  /** World units per CSS px at the current shot. */
  get unitsPerPx(): number {
    return (this.camera.top - this.camera.bottom) / this.height;
  }

  private updateCamera(t: number): void {
    const aspect = this.width / this.height;
    let halfH = Math.max(this.shot.h / 2, this.shot.w / 2 / aspect);
    let halfW = halfH * aspect;
    let x = this.shot.x;
    let y = this.shot.y;
    if (this.clampToRoom) {
      const roomHalfW = (BOUNDS.maxX - BOUNDS.minX) / 2;
      if (halfW > roomHalfW) {
        // Too wide for the set: trade height for width, never show past the shell.
        halfW = roomHalfW;
        halfH = halfW / aspect;
      }
      x = Math.min(BOUNDS.maxX - halfW, Math.max(BOUNDS.minX + halfW, x));
      if (halfH * 2 < BOUNDS.maxY - BOUNDS.minY) y = Math.min(BOUNDS.maxY - halfH, Math.max(BOUNDS.minY + halfH, y));
    }
    // World +x is screen-left: the camera looks down +z from -z, so left/right are mirrored for us.
    frameOrtho(this.camera, halfW, halfH);
    const sx = this.shake > 0 ? (hash(t * 61.7) - 0.5) * 2 * this.shake : 0;
    const sy = this.shake > 0 ? (hash(t * 47.3 + 9.1) - 0.5) * 2 * this.shake : 0;
    this.camera.position.set(x + sx, y + sy, -8);
    this.camera.lookAt(x + sx, y + sy, 0);
    this.camera.updateMatrixWorld(true);
  }

  render(t: number): void {
    this.updateCamera(t);
    setCrtTime(this.crtPass, t);
    const flash = this.lightning.flashStrength + this.flash;
    const pos = this.flash > this.lightning.flashStrength ? this.flashPos : this.lightning.flashPos;
    const feed = (mat: THREE.ShaderMaterial): void => {
      const u = mat.uniforms;
      if (u.uTime) u.uTime.value = t;
      if (u.uFlash) u.uFlash.value = flash;
      if (u.uFlashPos) (u.uFlashPos.value as THREE.Vector3).copy(pos);
    };
    // allMaterials is read live: the animator appends split-emissive clones after createAnimator.
    for (const a of this.actors) a.model.allMaterials.forEach(feed);
    for (const live of this.fxs) live.fx.materials.forEach(feed);
    this.extraMaterials.forEach(feed);
    this.composer.render();
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    for (const live of this.fxs) live.fx.dispose();
    this.fxs.length = 0;
    for (const a of this.actors) {
      a.animator.dispose();
      disposeModel(a.model);
    }
    this.actors.length = 0;
    this.extraMaterials.forEach((m) => m.dispose());
    this.disposables.forEach((d) => d.dispose());
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      }
    });
    this.scene.clear();
    this.composer.dispose();
    this.pixelPass.dispose();
    this.crtPass.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}

/** Deterministic 0..1 hash (shake, rain), so a frozen `?t=` frame is the same every time. */
export function hash(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** 0..1 progress of t through [t0, t1]. */
export const span = (t: number, t0: number, t1: number): number => clamp01((t - t0) / Math.max(1e-6, t1 - t0));
export const easeOut = (k: number): number => 1 - (1 - k) * (1 - k) * (1 - k);
export const easeIn = (k: number): number => k * k * k;
export const easeOutBack = (k: number): number => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
};
/** Comic motion is held poses: snap a 0..1 value to `steps` steps. */
export const stepped = (k: number, steps: number): number => Math.round(k * steps) / steps;
