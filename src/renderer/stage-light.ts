import * as THREE from 'three';
import { COMIC_LIGHT, comicLightSuspended } from '../shaders/comic-material.js';

/**
 * The stage's light rig. One comic light, shared by every comic material through COMIC_LIGHT, plus a
 * drawn halo with sunburst rays around the source. The player picks the source (radio buttons in the F8
 * dock); `ls` pings the room and brightens the light for a while, `ls -a` / `ls -la` much more.
 *
 * Everything is stepped (12 fps) and banded, so it reads as inked comic lighting, not a soft gradient.
 */
export type LightMode = 'off' | 'lantern' | 'monitor' | 'blacklight' | 'neon' | 'storm';

export const LIGHT_MODES: readonly { id: LightMode; label: string; hint: string }[] = [
  { id: 'lantern', label: 'LANTERN', hint: 'Warm pool of light from the lantern in a dark room' },
  { id: 'monitor', label: 'PHOSPHOR', hint: 'Green terminal glow rising from below, with scanlines' },
  { id: 'blacklight', label: 'BLACKLIGHT', hint: 'UV lantern: malware fluoresces where the light reaches it' },
  { id: 'neon', label: 'NEON', hint: 'Cyan on one side of the lantern, magenta on the other' },
  { id: 'storm', label: 'STORM', hint: 'Cold light from above that stutters with the lightning' },
  { id: 'off', label: 'FLAT', hint: 'No scene light: the classic flat comic look' },
];

interface ModeDef {
  color: number;
  color2?: number;
  dark: number;
  power: number;
  radius: number;
  scan?: number;
  uv?: number;
  halo: number;
  source: 'lantern' | 'below' | 'above';
}

const MODES: Record<LightMode, ModeDef> = {
  off: { color: 0xffd98a, dark: 0, power: 0, radius: 2.4, halo: 0, source: 'lantern' },
  lantern: { color: 0xffd27a, dark: 0.55, power: 0.95, radius: 2.7, halo: 1, source: 'lantern' },
  monitor: { color: 0x58ff9a, dark: 0.6, power: 0.8, radius: 5.6, scan: 1, halo: 0.35, source: 'below' },
  blacklight: { color: 0x9a5cff, dark: 0.72, power: 0.9, radius: 3.1, uv: 1, halo: 0.8, source: 'lantern' },
  neon: { color: 0x35e0ff, color2: 0xff3fa4, dark: 0.62, power: 1.05, radius: 3.4, halo: 0.9, source: 'lantern' },
  storm: { color: 0xa9d4ff, dark: 0.66, power: 0.3, radius: 9, halo: 0, source: 'above' },
};

const HALO_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uSplit;
uniform float uGlow;
uniform float uRays;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  vec2 cell = floor(gl_FragCoord.xy / 3.0);
  float dth = (mod(cell.x + cell.y * 2.0, 4.0) / 4.0 - 0.375) * 0.14;
  float f = 1.0 - r + dth;
  // Three inked rings of glow.
  float glow = f > 0.86 ? 1.0 : f > 0.7 ? 0.45 : f > 0.5 ? 0.16 : 0.0;
  // Sunburst rays: wedges that turn slowly, cut into dashes, only while the light is boosted.
  float ang = atan(p.y, p.x);
  float wedge = step(0.62, fract(ang * 12.0 / 6.2831853 + uTime * 0.12));
  float dash = step(0.35, fract(r * 5.0 - uTime * 0.9));
  float rays = wedge * dash * step(0.34, r) * step(r, 0.34 + 0.66 * uRays) * uRays;
  vec3 col = mix(uColor, uColor2, uSplit * step(0.0, p.x));
  float a = glow * uGlow * 0.5 + rays * 0.2;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col * a, a);
}`;

const stepTime = (t: number, fps = 12): number => Math.floor(t * fps) / fps;
const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export interface LightFrame {
  /** World position of the hero's lantern, or null when there is no hero. */
  lantern: THREE.Vector3 | null;
  feetY: number;
  panelLeft: number;
  panelRight: number;
  panelTop: number;
  /** Lightning flash strength this frame (0..1+), for the storm source. */
  flash: number;
}

export class StageLight {
  readonly halo: THREE.Mesh;
  private modeId: LightMode = 'lantern';
  private time = 0;
  /** Boost from ls: 0..2 (1 = ls, 2 = ls -a). */
  private boost = 0;
  private boostHold = 0;
  private boostLevel = 0;
  private pings: { t: number; life: number; reach: number; power: number }[] = [];
  private readonly pos = new THREE.Vector3();
  private readonly haloMat: THREE.ShaderMaterial;

  constructor() {
    this.haloMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color() },
        uColor2: { value: new THREE.Color() },
        uSplit: { value: 0 },
        uGlow: { value: 0 },
        uRays: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: HALO_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.haloMat);
    this.halo.rotation.y = Math.PI;
    this.halo.renderOrder = 50;
    this.halo.frustumCulled = false;
    this.halo.raycast = () => {};
  }

  get mode(): LightMode {
    return this.modeId;
  }

  setMode(mode: LightMode): void {
    this.modeId = MODES[mode] ? mode : 'lantern';
  }

  /** `ls` = level 1, `ls -a` / `ls -la` = level 2: ping the room and hold the light up for a while. */
  ping(level: 1 | 2): void {
    this.boostLevel = Math.max(this.boost > 0.05 ? this.boostLevel : 0, level);
    this.boostHold = level === 2 ? 9 : 4.5;
    this.pings.push({ t: 0, life: level === 2 ? 1.5 : 1.0, reach: level === 2 ? 11 : 6.5, power: level === 2 ? 1 : 0.6 });
    if (level === 2) this.pings.push({ t: -0.28, life: 1.5, reach: 11, power: 0.75 }, { t: -0.56, life: 1.5, reach: 11, power: 0.5 });
  }

  /** How strongly the light is boosted right now, 0..2. The stage uses it for the lantern bulb. */
  get boosted(): number {
    return this.boost;
  }

  update(dt: number, f: LightFrame): void {
    this.time += dt;
    const t = stepTime(this.time);
    const def = MODES[this.modeId];

    // Boost envelope: snaps up in two steps, holds, then steps back down over ~1.6 s.
    if (this.boostHold > 0) {
      this.boostHold -= dt;
      this.boost = Math.min(this.boostLevel, this.boost + dt * 9);
    } else {
      this.boost = Math.max(0, this.boost - dt * (this.boostLevel === 2 ? 1.1 : 0.7));
      if (this.boost === 0) this.boostLevel = 0;
    }
    const k = Math.round(this.boost * 4) / 4;

    // Where the light comes from.
    const lantern = f.lantern;
    const midX = (f.panelLeft + f.panelRight) / 2;
    if (def.source === 'below') this.pos.set(lantern ? lantern.x : midX, f.feetY - 1.3, 0);
    else if (def.source === 'above') this.pos.set(midX + Math.sin(t * 0.4) * 1.5, f.panelTop + 0.6, 0);
    else if (lantern) this.pos.copy(lantern);
    else this.pos.set(midX, f.feetY + 0.8, 0);

    // A boosted FLAT mode still lights up: ls must always do something.
    const basePower = def.power > 0 ? def.power : 0.75 * Math.min(1, k);
    const baseDark = def.dark > 0 ? def.dark : 0.3 * Math.min(1, k);
    const flicker = 1 + (hash(Math.floor(this.time * 12)) - 0.5) * (this.modeId === 'lantern' || this.modeId === 'blacklight' ? 0.14 : 0.05);
    let power = basePower * flicker * (1 + 0.85 * k);
    let radius = def.radius * (1 + 0.5 * k);
    if (this.modeId === 'storm') {
      // The sky stutters: mostly dim, with stepped surges, and it follows real strikes.
      const surge = hash(Math.floor(this.time * 3)) > 0.8 ? 1 : 0;
      power = (0.28 + 0.9 * surge * hash(Math.floor(this.time * 12) + 9) + 1.6 * Math.min(1, f.flash * 3)) * (1 + 0.6 * k);
    }

    const u = COMIC_LIGHT;
    if (comicLightSuspended()) {
      // A cinematic is drawing with the same materials: keep the flat look until it ends.
      u.uLampPower.value = 0;
      u.uLampDark.value = 0;
      u.uPingPower.value = 0;
      u.uLampUv.value = 0;
      this.halo.visible = false;
      return;
    }
    u.uLampPos.value.copy(this.pos);
    u.uLampColor.value.setHex(def.color);
    u.uLampColor2.value.setHex(def.color2 ?? def.color);
    u.uLampSplit.value = def.color2 ? 1 : 0;
    u.uLampPower.value = power;
    u.uLampRadius.value = radius;
    // ls lifts the darkness a little so the room can be read; ls -la lifts it more.
    u.uLampDark.value = baseDark * (1 - 0.22 * Math.min(2, k));
    u.uLampScan.value = def.scan ?? 0;
    u.uLampUv.value = (def.uv ?? 0) + (this.boostLevel === 2 ? 0.35 * Math.min(1, k) : 0);

    // Pings: the strongest live ring wins the single ring the shader draws.
    let pingR = 0;
    let pingPower = 0;
    for (const p of this.pings) {
      p.t += dt;
      if (p.t < 0) continue;
      const q = Math.min(1, p.t / p.life);
      const eased = 1 - (1 - q) * (1 - q);
      const pw = p.power * (1 - q);
      if (pw > pingPower) {
        pingPower = pw;
        pingR = Math.round(eased * p.reach * 8) / 8;
      }
    }
    this.pings = this.pings.filter((p) => p.t < p.life);
    u.uPingR.value = pingR;
    u.uPingPower.value = pingPower;

    // Halo and rays around a lantern source.
    const hu = this.haloMat.uniforms;
    const showHalo = def.source === 'lantern' && !!lantern && (def.halo > 0 || k > 0);
    this.halo.visible = showHalo;
    if (showHalo) {
      const size = (1.5 + 1.9 * k) * (def.halo > 0 ? 1 : 0.8);
      this.halo.position.set(this.pos.x, this.pos.y, this.pos.z - 0.4);
      this.halo.scale.set(size, size, 1);
      (hu.uColor!.value as THREE.Color).setHex(def.color);
      (hu.uColor2!.value as THREE.Color).setHex(def.color2 ?? def.color);
      hu.uSplit!.value = def.color2 ? 1 : 0;
      hu.uGlow!.value = Math.max(def.halo, 0.6 * Math.min(1, k)) * flicker;
      hu.uRays!.value = Math.min(1, k / 2 + (k > 0 ? 0.25 : 0));
      hu.uTime!.value = t;
    }
  }

  /** Back to the flat look (asset lab, cinematics and other pages share COMIC_LIGHT). */
  dispose(): void {
    COMIC_LIGHT.uLampPower.value = 0;
    COMIC_LIGHT.uLampDark.value = 0;
    COMIC_LIGHT.uPingPower.value = 0;
    COMIC_LIGHT.uLampUv.value = 0;
    this.halo.geometry.dispose();
    this.haloMat.dispose();
  }
}
