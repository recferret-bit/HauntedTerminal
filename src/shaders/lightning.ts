import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Procedural bolts and a Lichtenberg ground web with an electric-surface shader,
 * scaled for a room-sized diorama.
 */

interface ActiveBolt {
  mesh: THREE.Mesh;
  age: number;
  duration: number;
}

interface ActiveWeb {
  mesh: THREE.Mesh;
  age: number;
  duration: number;
}

const ELECTRIC_VERT = /* glsl */ `
varying vec2 vLocalXZ;
void main() {
  vLocalXZ = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const ELECTRIC_FRAG = /* glsl */ `
uniform float uAge;
uniform float uDuration;
uniform float uSeed;
varying vec2 vLocalXZ;

float eHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec2 eHash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
float eNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(eHash(i), eHash(i + vec2(1.0, 0.0)), f.x),
    mix(eHash(i + vec2(0.0, 1.0)), eHash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
float eFbm(vec2 p) {
  float amp = 0.5;
  float sum = 0.0;
  for (int i = 0; i < 3; i++) {
    sum += amp * eNoise(p);
    p = p * 2.07 + vec2(13.7, 9.1);
    amp *= 0.5;
  }
  return sum / 0.875;
}
float eVoronoiEdge(vec2 x) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  vec2 mg = vec2(0.0);
  vec2 mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = eHash2(n + g);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md) { md = d; mr = r; mg = g; }
    }
  }
  md = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = mg + vec2(float(i), float(j));
      vec2 o = eHash2(n + g);
      vec2 r = g + o - f;
      if (dot(mr - r, mr - r) > 0.00001) md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
    }
  }
  return md;
}
void main() {
  vec2 p = vLocalXZ;
  if (max(abs(p.x), abs(p.y)) > 3.05) discard;
  float life = clamp(uAge / max(uDuration, 0.001), 0.0, 1.0);
  float ang = atan(p.y, p.x);
  vec2 warp = vec2(
    eFbm(p * 1.6 + vec2(uSeed, uAge * 1.8)),
    eFbm(p * 1.6 - vec2(uSeed * 0.7, uAge * 1.5))
  ) - 0.5;
  float vEdge1 = eVoronoiEdge(p * 1.45 + warp * 0.65 + vec2(uSeed * 0.13, -uSeed * 0.19));
  float vEdge2 = eVoronoiEdge(p * 3.2 - warp * 0.9 + vec2(-uSeed * 0.29, uSeed * 0.17));
  float primaryBranch = 1.0 - smoothstep(0.0, 0.055, vEdge1);
  float primaryGlow = 1.0 - smoothstep(0.0, 0.16, vEdge1);
  float secondaryFork = (1.0 - smoothstep(0.0, 0.065, vEdge2)) * smoothstep(0.32, 0.02, vEdge1);
  float lobeMask = pow(eFbm(vec2(ang * 1.8 + uSeed, uSeed * 0.41)), 1.6) * 2.4 + 0.55;
  float fineLobe = eNoise(vec2(ang * 5.5 - uSeed * 1.3, uSeed * 0.9)) * 0.55;
  float asymLimit = clamp(lobeMask + fineLobe, 0.55, 2.95);
  float reach = mix(0.3, asymLimit, smoothstep(0.0, 0.22, life));
  float distWarped = length(p + warp * 0.45);
  float branchMask = (1.0 - smoothstep(reach * 0.68, reach, distWarped))
    * (1.0 - smoothstep(2.45, 3.02, max(abs(p.x), abs(p.y))));
  float cellPulse = smoothstep(0.22, 0.78, eNoise(p * 3.8 + vec2(uAge * 22.0, -uAge * 17.0) + uSeed));
  float segFlicker = step(0.18, eNoise(p * 2.4 - vec2(uAge * 15.0, uAge * 19.0)));
  float coreJagged = primaryBranch * (1.0 - smoothstep(0.15, asymLimit * 0.48, distWarped))
    * (1.0 - smoothstep(0.0, 0.45, life));
  float web = (primaryBranch * 1.45 + primaryGlow * 0.42 + secondaryFork * (0.65 + 0.55 * cellPulse))
    * branchMask * (0.55 + 0.45 * cellPulse * segFlicker) + coreJagged * 1.15;
  float fade = pow(1.0 - life, 1.35);
  float alpha = clamp(web * fade, 0.0, 1.0);
  if (alpha < 0.01) discard;
  vec3 hotCore = vec3(0.92, 0.98, 1.0) * 4.5;
  vec3 cyanArc = vec3(0.16, 0.84, 1.0) * 3.3;
  vec3 col = mix(cyanArc, hotCore, clamp(primaryBranch * 0.85 + coreJagged, 0.0, 1.0));
  gl_FragColor = vec4(col * alpha, alpha);
}`;

export class LightningStrikeSystem {
  /** Drives the comic-shader flash. Decays in update(). */
  flashStrength = 0;
  readonly flashPos = new THREE.Vector3();

  private readonly activeBolts: ActiveBolt[] = [];
  private readonly webs: ActiveWeb[] = [];
  private readonly boltMaterial: THREE.MeshBasicMaterial;

  constructor(private readonly scene: THREE.Scene) {
    this.boltMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.45 * 5.5, 0.88 * 5.5, 1.0 * 6.0),
      toneMapped: false,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }

  /**
   * Jagged trunk via recursive midpoint displacement.
   * `trunkRadius` is in world meters of this diorama (defaults suit a ~6m room).
   */
  buildJaggedBoltGeometry(
    start: THREE.Vector3,
    end: THREE.Vector3,
    generations = 5,
    trunkRadius = 0.02,
    spawnForks = true,
  ): THREE.BufferGeometry | null {
    interface Segment {
      a: THREE.Vector3;
      b: THREE.Vector3;
      isFork: boolean;
    }

    let segments: Segment[] = [{ a: start.clone(), b: end.clone(), isFork: false }];
    let sway = start.distanceTo(end) * 0.16;

    for (let g = 0; g < generations; g++) {
      const next: Segment[] = [];
      for (const seg of segments) {
        const mid = seg.a.clone().add(seg.b).multiplyScalar(0.5);
        mid.x += (Math.random() - 0.5) * sway;
        mid.y += (Math.random() - 0.5) * sway * 0.35;
        mid.z += (Math.random() - 0.5) * sway;
        next.push({ a: seg.a, b: mid, isFork: seg.isFork });
        next.push({ a: mid, b: seg.b, isFork: seg.isFork });
        if (spawnForks && !seg.isFork && g <= 2 && Math.random() < 0.32) {
          const dir = seg.b.clone().sub(seg.a).multiplyScalar(0.55);
          dir.x += (Math.random() - 0.5) * sway * 1.4;
          dir.z += (Math.random() - 0.5) * sway * 1.4;
          next.push({ a: mid, b: mid.clone().add(dir), isFork: true });
        }
      }
      segments = next;
      sway *= 0.52;
    }

    const tubes: THREE.BufferGeometry[] = [];
    for (const seg of segments) {
      const r = seg.isFork ? trunkRadius * 0.42 : trunkRadius;
      const curve = new THREE.LineCurve3(seg.a, seg.b);
      tubes.push(new THREE.TubeGeometry(curve, 1, r, 4, false));
    }
    return mergeGeometries(tubes, false);
  }

  strikeAt(targetPos: THREE.Vector3, skyHeight = 5.2): void {
    const skyOrigin = new THREE.Vector3(
      targetPos.x + (Math.random() - 0.5) * 1.2,
      targetPos.y + skyHeight,
      targetPos.z + (Math.random() - 0.5) * 1.2,
    );
    this.spawnBolt(skyOrigin, targetPos, 5, 0.022, true, 0.42);
    const tendrilOrigin = new THREE.Vector3(targetPos.x, targetPos.y + 0.04, targetPos.z);
    const baseRotation = Math.random() * Math.PI * 2;
    for (let i = 0; i < 3; i++) {
      const ang = baseRotation + (i / 3) * Math.PI * 2 + (Math.random() - 0.5) * 0.95;
      const dist = 0.45 + Math.random() * 0.55;
      const tendrilEnd = new THREE.Vector3(
        targetPos.x + Math.cos(ang) * dist,
        targetPos.y + 0.04,
        targetPos.z + Math.sin(ang) * dist,
      );
      this.spawnBolt(tendrilOrigin, tendrilEnd, 4, 0.012, true, 0.22);
    }
    this.spawnSurfaceWeb(targetPos);
    this.flashPos.copy(targetPos);
    this.flashStrength = 5.5;
  }

  spawnGridOverloadArc(p1: THREE.Vector3, p2: THREE.Vector3): void {
    this.spawnBolt(p1, p2, 4, 0.01, false, 0.16);
    this.flashPos.copy(p1).lerp(p2, 0.5);
    this.flashStrength = Math.max(this.flashStrength, 2.2);
  }

  update(dt: number): void {
    this.flashStrength = Math.max(0, this.flashStrength - dt * 14);
    this.ageList(this.activeBolts, dt);
    for (let i = this.webs.length - 1; i >= 0; i--) {
      const web = this.webs[i];
      web.age += dt;
      const mat = web.mesh.material as THREE.ShaderMaterial;
      mat.uniforms.uAge.value = web.age;
      if (web.age >= web.duration) {
        this.scene.remove(web.mesh);
        web.mesh.geometry.dispose();
        mat.dispose();
        this.webs.splice(i, 1);
      }
    }
  }

  private spawnBolt(
    a: THREE.Vector3,
    b: THREE.Vector3,
    generations: number,
    radius: number,
    forks: boolean,
    duration: number,
  ): void {
    const geo = this.buildJaggedBoltGeometry(a, b, generations, radius, forks);
    if (!geo) return;
    const mat = this.boltMaterial.clone();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    this.activeBolts.push({ mesh, age: 0, duration });
  }

  private spawnSurfaceWeb(center: THREE.Vector3): void {
    const geo = new THREE.PlaneGeometry(6.2, 6.2, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const normal = geo.attributes.normal;
    // PlaneGeometry faces +z; rotateX(-PI/2) must leave the deck facing +y.
    if (normal.getY(0) < 0) geo.rotateX(Math.PI);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uAge: { value: 0 },
        uDuration: { value: 0.7 },
        uSeed: { value: Math.random() * 100 },
      },
      vertexShader: ELECTRIC_VERT,
      fragmentShader: ELECTRIC_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(center.x, center.y + 0.03, center.z);
    mesh.scale.setScalar(0.22);
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    this.webs.push({ mesh, age: 0, duration: 0.7 });
  }

  private ageList(list: ActiveBolt[], dt: number): void {
    for (let i = list.length - 1; i >= 0; i--) {
      const bolt = list[i];
      bolt.age += dt;
      if (bolt.age >= bolt.duration) {
        this.scene.remove(bolt.mesh);
        bolt.mesh.geometry.dispose();
        (bolt.mesh.material as THREE.Material).dispose();
        list.splice(i, 1);
      } else {
        const t = bolt.age / bolt.duration;
        const flicker = Math.sin(t * Math.PI * 6) > -0.2 ? 1 - t : 0.2;
        (bolt.mesh.material as THREE.MeshBasicMaterial).opacity = flicker;
      }
    }
  }
}
