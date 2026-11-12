import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createCrtPass } from './crt-pass.js';
import { createPixelArtPass } from './pixel-art.js';

export interface ComicPost {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  pixelPass: ShaderPass;
  crtPass: ShaderPass;
}

export interface ComicPostOptions {
  antialias: boolean;
  preserveDrawingBuffer: boolean;
  pixelRatio: number;
  /** Comic and cinematic stages share this pair. The lab stage does not. */
  addKeyLights: boolean;
  passWidth: number;
  passHeight: number;
  scene: THREE.Scene;
  camera: THREE.Camera;
  /** Lab draw-call stats need the info counters to survive until they are read. */
  autoResetInfo?: boolean;
}

/**
 * WebGLRenderer plus the shared post chain: RenderPass, OutputPass, pixel-art, CRT.
 * OutputPass runs first so tone map / sRGB happen before pixelate and CRT in display space.
 */
export function createComicComposer(opts: ComicPostOptions): ComicPost {
  const renderer = new THREE.WebGLRenderer({
    antialias: opts.antialias,
    preserveDrawingBuffer: opts.preserveDrawingBuffer,
  });
  renderer.setPixelRatio(opts.pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  if (opts.autoResetInfo === false) renderer.info.autoReset = false;
  if (opts.addKeyLights) {
    opts.scene.add(new THREE.AmbientLight(0xf4f1ea, 0.35));
    const key = new THREE.DirectionalLight(0xfff4dd, 1.1);
    key.position.set(-2.4, 6.5, -4.2);
    opts.scene.add(key);
  }
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(opts.scene, opts.camera));
  const pixelPass = createPixelArtPass(opts.passWidth, opts.passHeight);
  const crtPass = createCrtPass(opts.passWidth, opts.passHeight);
  composer.addPass(new OutputPass());
  composer.addPass(pixelPass);
  composer.addPass(crtPass);
  return { renderer, composer, pixelPass, crtPass };
}

export function frameOrtho(camera: THREE.OrthographicCamera, halfW: number, halfH: number): void {
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();
}
