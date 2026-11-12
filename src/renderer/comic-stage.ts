import * as THREE from 'three';
import type { KernelEvent } from '../contracts/events.js';
import type { AssetRegistry } from '../assets/asset-registry.js';
import { createComicComposer, frameOrtho, type ComicPost } from '../shaders/comic-composer.js';
import { isComic } from '../shaders/comic-material.js';
import { setCrtParams, setCrtSize, type CrtParams } from '../shaders/crt-pass.js';
import { LightningStrikeSystem } from '../shaders/lightning.js';
import { DEFAULT_PIXEL_PARAMS, setPixelArtParams, setPixelArtSize, type PixelArtParams } from '../shaders/pixel-art.js';
import type { BuiltModel, ModelAnimator } from '../procgen/index.js';
import type { RoomKind, RoomView } from './room-view.js';
import { StageLight, type LightMode } from './stage-light.js';
import { TweenManager } from './tween.js';
import { FxPlayer } from './fx-player.js';
import type { StageActor } from './stage-cast.js';
import type { PanelBounds } from './stage-cards.js';
import { StageOverlay } from './stage-overlay.js';
import { installStageDevHook } from './stage-selfcheck.js';
import { CameoDirector } from './stage-cameos.js';
import { ACTOR_Z, CAM_HOME, DESIGN_LEFT, DESIGN_RIGHT, FEET_Y, LOOK_HOME } from './stage-const.js';
import { reportStage } from './stage-actor.js';
import { enqueueStageEvent } from './stage-events.js';
import { buildStageScene, layoutFill } from './stage-layout.js';
import { syncRoomInner } from './stage-sync.js';
import { stepStage } from './stage-frame.js';
import { playFx, say, triggerShake } from './stage-fx.js';

export { HERO_WALK_MS } from './stage-const.js';

export interface SandboxRenderConfig {
  shakeIntensity: number;
  transitionMs: number;
  gutterWidth: number;
  crtOpacity: number;
  lanternRadius: number;
  showHitboxes: boolean;
}

export class ComicStage {
  readonly tweens = new TweenManager();
  readonly config: SandboxRenderConfig = {
    shakeIntensity: 10,
    transitionMs: 420,
    gutterWidth: 14,
    crtOpacity: 0.85,
    lanternRadius: 140,
    showHitboxes: false,
  };

  crtOn = true;
  pixelOn = true;
  /** Errors caught in handleEvent / syncRoom / frame / tween callbacks (the dev self-check asserts it stays empty). */
  readonly errors: string[] = [];

  private readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  private readonly composer: ComicPost['composer'];
  private readonly pixelPass: ComicPost['pixelPass'];
  readonly crtPass: ComicPost['crtPass'];
  readonly lightning: LightningStrikeSystem;
  readonly world = new THREE.Group();
  /** Words, bubbles, the System Hand, xray links. */
  readonly fx = new THREE.Group();
  /** Scene light: source picked in the F8 dock, pinged by `ls`. */
  readonly light = new StageLight();
  fidgetIn = 4;
  /** FX preset emissions. */
  private readonly fxLayer = new THREE.Group();
  /** Page cards and tears, over everything. */
  readonly pageLayer = new THREE.Group();
  readonly fxPlayer: FxPlayer;
  /** The AI agents' video-call cameos (AGENT_TAUNT, TUTORIAL_STEP). */
  readonly cameos: CameoDirector;
  /** Comic materials of models outside the cast (cameo agents), fed uTime / uFlash. */
  readonly extraComics = new Set<THREE.ShaderMaterial>();

  flood!: THREE.Mesh;
  hitboxes = new Map<string, THREE.BoxHelper>();
  comics: THREE.ShaderMaterial[] = [];

  /** The dynamic cast, keyed by RoomActor.id ?? key. */
  readonly actors = new Map<string, StageActor>();
  actorSeed = 1;
  readonly pendingSpawn = new Map<string, { reason: string; at: number }>();
  queue: { at: number; ev: KernelEvent }[] = [];
  cursor = 0;
  clockMs = 0;
  xrayProcs: { pid: number; ppid: number; name: string; cpu: number }[] = [];
  /** Every interface element (text, balloons, cards, plates, pips, links, the neighbour column) in crisp DOM. */
  readonly overlay: StageOverlay;
  revealArmed = 0;
  lastAttack: { id: string; at: number } | null = null;
  /** Clock time an ENTITY_SPAWNED drew the System Hand for a reason (de-duplicates SYSTEM_HAND_SPAWN). */
  readonly handClaims = new Map<string, number>();
  layoutKey = '';
  cardKill: (() => void) | null = null;
  bubble: { drop(): void } | null = null;

  currentFloor = 1;
  view: RoomView | null = null;
  room: { kind: RoomKind; model: BuiltModel; animator: ModelAnimator } | null = null;
  zoom = 1;
  backdrop: THREE.Mesh | null = null;
  frameMesh: THREE.Mesh | null = null;
  plinthMesh: THREE.Mesh | null = null;
  readonly neighbors = new THREE.Group();
  panelLeft = DESIGN_LEFT;
  panelRight = DESIGN_RIGHT;
  feetY = FEET_Y;
  viewTop = 4.9;
  column = { left: -1.6, right: -4.5, top: 4.85, bottom: 0.15 };
  stormOn = true;
  stormIntensity = 0.65;
  stormIn = 1.4;
  lastPath = '';
  lastFlood = 0;
  floodPercent = 0;
  xrayOn = false;
  elapsed = 0;
  shakeLeft = 0;
  shakeAmp = 0;
  private running = false;
  built = false;
  private pixelParams: PixelArtParams | null = null;
  private lastInk = { outline: 1, halftone: 1 };
  private lastNow = 0;

  /** Dev: while set, syncRoom ignores every other view (the game's ticks), so a test room stays up. */
  devPin: RoomView | null = null;
  /** Dev: stop the rAF clock; `__stage.advance(ms)` still steps and draws. */
  devFrozen = false;
  /** Dev: no ambient storm strikes (the self-check counts fx plays). */
  devNoStorm = false;

  constructor(
    readonly mount: HTMLElement,
    readonly registry: AssetRegistry,
  ) {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 40);
    this.camera.position.copy(CAM_HOME);
    this.camera.lookAt(LOOK_HOME);

    this.scene.add(this.world, this.fx, this.fxLayer, this.pageLayer);
    this.scene.add(this.light.halo);
    const w = this.mount.clientWidth || 800;
    const h = this.mount.clientHeight || 450;
    const post = createComicComposer({
      antialias: true,
      preserveDrawingBuffer: false,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 1.75),
      addKeyLights: true,
      passWidth: w,
      passHeight: h,
      scene: this.scene,
      camera: this.camera,
    });
    this.renderer = post.renderer;
    this.composer = post.composer;
    this.pixelPass = post.pixelPass;
    this.crtPass = post.crtPass;
    this.mount.appendChild(this.renderer.domElement);

    this.lightning = new LightningStrikeSystem(this.scene);
    this.overlay = new StageOverlay(this.mount.parentElement ?? this.mount);
    this.fxPlayer = new FxPlayer({
      word: (preset, at, text, opts) => this.overlay.word(preset, at, text, opts),
      layer: this.fxLayer,
      shake: (mul) => triggerShake(this, mul),
      flash: (strength, at) => {
        this.lightning.flashStrength = Math.max(this.lightning.flashStrength, strength);
        this.lightning.flashPos.copy(at);
      },
    });
    this.tweens.onError = (err) => reportStage(this, 'tween', err);
    this.cameos = new CameoDirector(this.overlay);
    window.setTimeout(() => {
      try {
        this.cameos.warm();
      } catch (err) {
        reportStage(this, 'cameo warm-up', err);
      }
    }, 300);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop((now) => this.frame(now));
    this.running = true;
    installStageDevHook(this);
  }

  resize(): void {
    const w = Math.max(1, this.mount.clientWidth);
    const h = Math.max(1, this.mount.clientHeight);
    const pageH = 5.35 / this.zoom;
    const halfH = pageH / 2;
    const halfW = halfH * (w / h);
    this.camera.near = 0.05;
    this.camera.far = 40;
    frameOrtho(this.camera, halfW, halfH);
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    setPixelArtSize(this.pixelPass, w * pr, h * pr);
    if (this.pixelParams) setPixelArtParams(this.pixelPass, this.pixelParams, pr);
    else setPixelArtParams(this.pixelPass, DEFAULT_PIXEL_PARAMS, pr);
    setCrtSize(this.crtPass, w * pr, h * pr, pr);
    layoutFill(this, halfW, halfH);
    if (this.built && this.view) this.syncRoom(this.view);
  }

  setZoom(zoom: number): void {
    this.zoom = Math.min(1.6, Math.max(0.75, zoom));
    this.resize();
  }

  setPixelParams(params: PixelArtParams): void {
    this.pixelParams = params;
    setPixelArtParams(this.pixelPass, params, this.renderer.getPixelRatio());
    this.pixelPass.enabled = this.pixelOn;
  }

  setCrtParams(params: CrtParams): void {
    setCrtParams(this.crtPass, params);
    this.crtPass.enabled = this.crtOn;
  }

  setInk(params: { outline: number; halftone: number }): void {
    this.lastInk = params;
    this.applyInk(this.world);
  }

  applyInk(root: THREE.Object3D): void {
    const shell = 1 + 0.045 * this.lastInk.outline;
    const dots = this.lastInk.halftone > 0.05 ? 1 : 0;
    root.traverse((obj) => {
      if (obj.userData.outline) obj.scale.setScalar(shell);
      const mesh = obj as THREE.Mesh;
      const mat = mesh.material;
      if (mat && !Array.isArray(mat) && isComic(mat)) mat.uniforms.uHalftone.value = dots;
    });
  }

  /** Light source for the scene: 'lantern' | 'monitor' | 'blacklight' | 'neon' | 'storm' | 'off'. */
  setLightMode(mode: LightMode): void {
    this.light.setMode(mode);
  }

  get lightMode(): LightMode {
    return this.light.mode;
  }

  setStorm(on: boolean, intensity: number): void {
    this.stormOn = on;
    this.stormIntensity = intensity;
    if (!on) this.lightning.flashStrength = 0;
  }

  syncRoom(view: RoomView): void {
    if (this.devPin && view !== this.devPin) return;
    try {
      syncRoomInner(this, view);
    } catch (err) {
      reportStage(this, 'syncRoom', err);
    }
  }

  toggleCrt(): boolean {
    this.crtOn = !this.crtOn;
    this.applyConfigVisuals();
    return this.crtOn;
  }

  togglePixel(): boolean {
    this.pixelOn = !this.pixelOn;
    this.applyConfigVisuals();
    return this.pixelOn;
  }

  applyConfigVisuals(): void {
    this.pixelPass.enabled = this.pixelOn;
    this.crtPass.enabled = this.crtOn;
    for (const box of this.hitboxes.values()) box.visible = this.config.showHitboxes;
  }

  setFloorTheme(floorId: number): void {
    this.currentFloor = floorId;
    this.floodPercent = floorId === 3 ? 20 : 0;
    this.buildScene();
    say(this, 'STAGE LOAD!', new THREE.Vector3(-0.4, 1.6, 1.2), '#ffd166', 0.2);
  }

  triggerLightningIntro(): void {
    const at = new THREE.Vector3((this.panelLeft + this.panelRight) / 2 + 0.6, this.feetY, ACTOR_Z);
    playFx(this, 'fx.lightning-strike', at);
  }

  buildScene(): void {
    buildStageScene(this);
  }

  /** Never throws. Events of one batch are sequenced: a hero action or an enemy wind-up holds the rest briefly. */
  handleEvent(ev: KernelEvent): void {
    enqueueStageEvent(this, ev);
  }

  hero(): StageActor | null {
    const h = this.actors.get('vibecoder');
    if (h && !h.disposed) return h;
    for (const a of this.actors.values()) if (a.kind === 'vibecoder' && !a.disposed) return a;
    return null;
  }

  panelBounds(): PanelBounds {
    return { left: this.panelLeft, right: this.panelRight, top: this.viewTop, bottom: this.feetY - 0.5 };
  }

  private frame(now: number): void {
    if (!this.running || !this.built) return;
    if (this.devFrozen) {
      this.lastNow = now;
      return;
    }
    const dt = Math.min(0.05, this.lastNow ? (now - this.lastNow) / 1000 : 0.016);
    this.lastNow = now;
    this.step(dt);
    this.render();
  }

  /** Advance the whole stage by `dt` seconds (the dev hook calls this to step deterministically). */
  step(dt: number): void {
    try {
      stepStage(this, dt);
    } catch (err) {
      reportStage(this, 'frame', err);
    }
  }

  render(): void {
    try {
      this.composer.render();
    } catch (err) {
      reportStage(this, 'render', err);
    }
  }

  /** The last RoomView passed to syncRoom (the dev self-check restores it). */
  currentView(): RoomView | null {
    return this.view;
  }

  /** Dev: the live cast and queue, for the self-check and the console. */
  debugState(): { actors: { id: string; model: string; kind: string; state: string; visible: boolean; x: number; exiting: boolean; dead: boolean }[]; queued: number; fx: number; played: string[]; errors: string[]; cameos: { visible: number; pending: number; maxConcurrent: number; shown: number }; overlay: ReturnType<StageOverlay['counts']> } {
    return {
      actors: [...this.actors.values()].map((a) => ({
        id: a.id, model: a.modelId, kind: a.kind, state: a.animator.state, visible: a.group.visible, x: +a.group.position.x.toFixed(2), exiting: a.exiting, dead: a.dead,
      })),
      queued: this.queue.length,
      overlay: this.overlay.counts(),
      cameos: { visible: this.cameos.visible, pending: this.cameos.pending, maxConcurrent: this.cameos.maxConcurrent, shown: this.cameos.shown },
      fx: this.fxPlayer.count,
      played: [...this.fxPlayer.played].sort(),
      errors: [...this.errors],
    };
  }
}
