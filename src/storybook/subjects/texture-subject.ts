import * as THREE from 'three';
import { TextureCatalog } from '../../procgen/core/catalog.js';
import { PAPER } from '../../procgen/core/palette.js';
import { toDataTexture } from '../../procgen/runtime/data-texture.js';
import { createComicMaterial } from '../../shaders/comic-material.js';
import type { Subject, SubjectOptions } from './types.js';

/** Longest edge of the quad a texture is shown on, in world units. */
const QUAD = 2.4;
/** Tileable textures repeat this many times along each axis. */
const TILES = 3;
const labTextures = new Map<string, THREE.DataTexture>();

function cachedTexture(id: string, seed: number): { tex: THREE.DataTexture; width: number; height: number; tileable: boolean } {
  const entry = TextureCatalog.get(id);
  const buf = TextureCatalog.build(id, seed);
  const key = `${id}#${seed}`;
  let tex = labTextures.get(key);
  if (!tex) {
    tex = toDataTexture(buf, entry.tileable);
    labTextures.set(key, tex);
  }
  return { tex, width: buf.width, height: buf.height, tileable: entry.tileable };
}

function quadGeometry(w: number, h: number, tileable: boolean): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(w, h);
  if (tileable) {
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TILES, uv.getY(i) * TILES);
  }
  return geo;
}

/** A texture as the comic material draws it (`uMap`, 86% albedo over the cel band), on a camera-facing quad. Tileable ones repeat 3 x 3. */
export function buildTextureSubject(id: string, opts: SubjectOptions): Subject {
  const entry = TextureCatalog.get(id);
  const { tex, width, height, tileable } = cachedTexture(id, opts.seed);
  const aspect = height / Math.max(1, width);
  const w = aspect > 1 ? QUAD / aspect : QUAD;
  const h = aspect > 1 ? QUAD : QUAD * aspect;
  const geo = quadGeometry(w, h, tileable);
  const mat = createComicMaterial(PAPER);
  mat.uniforms.uMap!.value = tex;
  mat.uniforms.uHasMap!.value = 1;
  const quad = new THREE.Mesh(geo, mat);
  // PlaneGeometry faces +z; the camera sits on −z. Turned around, u still runs screen-left to screen-right.
  quad.rotation.y = Math.PI;
  quad.position.set(0, h / 2 + 0.05, 0);
  const group = new THREE.Group();
  group.name = id;
  group.add(quad);
  return {
    kind: 'texture',
    id,
    label: `${entry.label} · ${entry.usage} · ${width}x${height}${tileable ? ' · tiles 3x3' : ''}`,
    category: 'texture',
    lore: '',
    object: group,
    materials: [mat],
    bounds: { min: [-w / 2, 0.05, 0], max: [w / 2, h + 0.05, 0] },
    glow: [],
    built: null,
    spec: null,
    animator: null,
    sockets: {},
    info: null,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
