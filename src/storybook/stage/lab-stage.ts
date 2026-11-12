import * as THREE from 'three';
import { INK, PAPER } from '../../procgen/core/palette.js';
import { createComicComposer, frameOrtho, type ComicPost } from '../../shaders/comic-composer.js';
import { createComicMaterial, type ComicMaterial } from '../../shaders/comic-material.js';
import { setCrtSize, setCrtTime } from '../../shaders/crt-pass.js';
import { LightningStrikeSystem } from '../../shaders/lightning.js';
import { DEFAULT_PIXEL_PARAMS, setPixelArtParams, setPixelArtSize } from '../../shaders/pixel-art.js';
import type { Subject } from '../subjects/index.js';
import { LanternLayer } from './lantern-layer.js';
import { ACTOR_Z, BACKDROP_Z, CAM_DISTANCE, CAM_FAR, CAM_NEAR, HELD_FLASH, PLINTH_COLOR } from './stage-constants.js';

/** Draw calls and triangles of the last frame. */
export interface DrawStats {
  calls: number;
  triangles: number;
}

export interface RenderRequest {
  subject: Subject;
  /** World point at the centre of the frame. */
  centerX: number;
  centerY: number;
  /** CSS pixels per world unit. */
  ppu: number;
  /** Debug yaw in degrees. 0 is the game camera. */
  yaw: number;
  bg: number;
  silhouette: boolean;
  lantern: boolean;
  /** World xy of the lantern. */
  lanternAt: [number, number];
  plinth: boolean;
  flashHold: boolean;
  time: number;
}

/** The scene, camera and post chain the game uses, driven by one render request at a time. */
export class LabStage {
  readonly canvas: HTMLCanvasElement;
  readonly pixelRatio: number;
  pixelOn = true;
  crtOn = true;

  private palette = DEFAULT_PIXEL_PARAMS.paletteMode;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, CAM_NEAR, CAM_FAR);
  private readonly composer: ComicPost['composer'];
  private readonly pixelPass: ComicPost['pixelPass'];
  private readonly crtPass: ComicPost['crtPass'];
  private readonly lightning: LightningStrikeSystem;
  private readonly lantern: LanternLayer;
  private readonly slot = new THREE.Group();
  private readonly backdrop: THREE.Mesh;
  private readonly backdropMat: ComicMaterial;
  private readonly plinth: THREE.Mesh;
  private readonly plinthMat: ComicMaterial;
  private readonly inkFlat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.DoubleSide });
  private readonly bgColor = new THREE.Color();
  private readonly paper = new THREE.Color(PAPER);
  private readonly target = new THREE.Vector3();
  private readonly heldFlashPos = new THREE.Vector3();
  private width = 1;
  private height = 1;

  constructor(pixelRatio: number) {
    this.pixelRatio = pixelRatio;
    this.backdropMat = createComicMaterial(0x211a36, { halftone: true });
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.backdropMat);
    this.backdrop.rotation.y = Math.PI;
    this.plinthMat = createComicMaterial(PLINTH_COLOR, { halftone: true, stripes: true });
    this.plinth = new THREE.Mesh(new THREE.BoxGeometry(1, 0.48, 0.42), this.plinthMat);
    this.lantern = new LanternLayer(this.camera);

    this.scene.add(this.camera, this.backdrop, this.plinth, this.slot);
    // preserveDrawingBuffer keeps the canvas readable for lab screenshots.
    const post = createComicComposer({
      antialias: true,
      preserveDrawingBuffer: true,
      pixelRatio,
      addKeyLights: false,
      passWidth: 1,
      passHeight: 1,
      scene: this.scene,
      camera: this.camera,
      autoResetInfo: false,
    });
    this.renderer = post.renderer;
    this.canvas = this.renderer.domElement;
    this.composer = post.composer;
    this.pixelPass = post.pixelPass;
    this.crtPass = post.crtPass;
    this.lightning = new LightningStrikeSystem(this.scene);
    this.setSize(320, 240);
  }

  /** Size in CSS pixels. The post passes get device pixels, as in ComicStage.resize(). */
  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    setPixelArtSize(this.pixelPass, w * this.pixelRatio, h * this.pixelRatio);
    setPixelArtParams(this.pixelPass, { ...DEFAULT_PIXEL_PARAMS, paletteMode: this.palette }, this.pixelRatio);
    setCrtSize(this.crtPass, w * this.pixelRatio, h * this.pixelRatio, this.pixelRatio);
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /** Pixel-art pass palette mode (0..5). Every other parameter stays at the game's DEFAULT_PIXEL_PARAMS. */
  setPalette(mode: number): void {
    this.palette = mode;
    setPixelArtParams(this.pixelPass, { ...DEFAULT_PIXEL_PARAMS, paletteMode: mode }, this.pixelRatio);
  }

  /** A real strike: bolts, ground web and the flash uniform, like the game's intro flash. */
  strike(at: THREE.Vector3): void {
    this.lightning.strikeAt(at, 5.4);
  }

  /** Advance the lightning decay. Once per frame, not once per cell. */
  tick(dt: number): void {
    this.lightning.update(dt);
  }

  get flashActive(): boolean {
    return this.lightning.flashStrength > 0.001 || this.scene.children.length > 4;
  }

  render(req: RenderRequest): void {
    const { subject } = req;
    const halfW = this.width / req.ppu / 2;
    const halfH = this.height / req.ppu / 2;
    this.aimCamera(req, halfW, halfH);
    this.placeSubject(subject);
    this.placeBackdrop(req, halfW, halfH);
    this.placePlinth(req, halfW, subject);
    this.feedUniforms(req);
    this.pixelPass.enabled = this.pixelOn;
    this.crtPass.enabled = this.crtOn;

    this.applyLantern(req, subject);
    this.scene.overrideMaterial = req.silhouette ? this.inkFlat : null;
    this.renderer.info.reset();
    this.composer.render();
    this.scene.overrideMaterial = null;

    this.lantern.restore();
    this.slot.remove(subject.object);
  }

  /** Orthographic window of `halfW` x `halfH` world units, camera on −z, optionally yawed for debugging. */
  private aimCamera(req: RenderRequest, halfW: number, halfH: number): void {
    const cam = this.camera;
    frameOrtho(cam, halfW, halfH);
    const yaw = THREE.MathUtils.degToRad(req.yaw);
    this.target.set(req.centerX, req.centerY, ACTOR_Z);
    cam.position.set(req.centerX + Math.sin(yaw) * CAM_DISTANCE, req.centerY, ACTOR_Z - Math.cos(yaw) * CAM_DISTANCE);
    cam.lookAt(this.target);
    cam.updateMatrixWorld(true);
  }

  private placeSubject(subject: Subject): void {
    subject.object.position.set(0, 0, subject.kind === 'texture' ? 0 : ACTOR_Z);
    this.slot.add(subject.object);
  }

  private placeBackdrop(req: RenderRequest, halfW: number, halfH: number): void {
    const backZ = Math.max(BACKDROP_Z, req.subject.bounds.max[2] + ACTOR_Z + 0.3);
    this.backdrop.position.set(req.centerX, req.centerY, backZ);
    this.backdrop.scale.set(halfW * 2 + 30, halfH * 2 + 30, 1);
    this.backdrop.visible = !req.silhouette;
    (this.backdropMat.uniforms.uColor!.value as THREE.Color).setHex(req.bg);
    this.bgColor.setHex(req.bg);
    this.scene.background = req.silhouette ? this.paper : this.bgColor;
  }

  /** The game's plinth: actors stand 0.02 above its top face. */
  private placePlinth(req: RenderRequest, halfW: number, subject: Subject): void {
    const isActor = subject.kind === 'fx' || (subject.kind === 'model' && subject.category !== 'room');
    this.plinth.visible = req.plinth && isActor && !req.silhouette;
    this.plinth.position.set(req.centerX, -0.26, 0.35);
    this.plinth.scale.set(halfW * 2 + 30, 1, 1);
  }

  /** Same uniform feed as ComicStage.frame(): time, flash strength and flash position to every comic material. */
  private feedUniforms(req: RenderRequest): void {
    this.heldFlashPos.set(req.centerX - 0.6, Math.max(0.6, req.centerY), ACTOR_Z - 0.9);
    const flash = Math.max(this.lightning.flashStrength, req.flashHold ? HELD_FLASH : 0);
    const flashPos = this.lightning.flashStrength > 0.001 ? this.lightning.flashPos : this.heldFlashPos;
    const feed = (mat: ComicMaterial): void => {
      mat.uniforms.uTime!.value = req.time;
      mat.uniforms.uFlash!.value = flash;
      (mat.uniforms.uFlashPos!.value as THREE.Vector3).copy(flashPos);
    };
    req.subject.materials.forEach(feed);
    feed(this.backdropMat);
    feed(this.plinthMat);
    setCrtTime(this.crtPass, req.time);
  }

  private applyLantern(req: RenderRequest, subject: Subject): void {
    if (!req.lantern || req.silhouette) {
      this.lantern.off();
      return;
    }
    const centre = this.target.set(req.lanternAt[0], req.lanternAt[1], ACTOR_Z).applyMatrix4(this.camera.matrixWorldInverse);
    this.lantern.on(centre, subject.glow);
  }

  /** World point -> CSS pixel in the last rendered frame. */
  project(x: number, y: number, z: number): [number, number] {
    const p = this.target.set(x, y, z).project(this.camera);
    return [(p.x * 0.5 + 0.5) * this.width, (0.5 - p.y * 0.5) * this.height];
  }

  /** CSS pixel -> world xy on the actor plane, for the un-yawed camera of the last frame. */
  unproject(px: number, py: number): [number, number] {
    const p = this.target.set((px / this.width) * 2 - 1, 1 - (py / this.height) * 2, 0).unproject(this.camera);
    return [p.x, p.y];
  }

  /** The numbers ComicStage.assertFrame() checks: looking +z, level, screen-right = world −x. */
  cameraFrame(): { direction: [number, number, number]; screenRightX: number; game: boolean } {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    return {
      direction: [dir.x, dir.y, dir.z],
      screenRightX: right.x,
      game: dir.z >= 0.9 && Math.abs(dir.y) <= 0.05 && right.x <= -0.9,
    };
  }

  /** Draw calls and triangles of the last frame, post passes included (3 quads). */
  drawStats(): DrawStats {
    return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
  }
}
