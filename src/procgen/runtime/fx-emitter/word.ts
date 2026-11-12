import * as THREE from 'three';
import type { ComicMaterial } from '../../../shaders/comic-material.js';
import { ZONES, type ZoneDef, type ZoneId } from '../../core/palette.js';
import { FX_WORD_DEFAULT_SIZE, fxLayoutWord, fxWordSoup } from '../../fx/lettering.js';
import type { FxSoup } from '../../fx/shapes.js';
import type { FxPreset, FxWordState } from '../../fx/types.js';
import { zoneMaterial, type EmitterParts } from './parts.js';

export interface WordView {
  group: THREE.Group;
  material: ComicMaterial;
}

function soupGeometry(soup: FxSoup): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const normals = new Float32Array(soup.triCount * 9);
  for (let t = 0; t < soup.triCount; t++) {
    for (let v = 0; v < 3; v++) normals.set(soup.nrm.subarray(t * 3, t * 3 + 3), t * 9 + v * 3);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(soup.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(soup.triCount * 6), 2));
  return geo;
}

/** The word: camera-facing quads in the comic material, over a grown copy in ink. Null when the preset has no word. */
export function buildWord(preset: FxPreset, text: string | undefined, inkWeight: number, page: THREE.Group, parts: EmitterParts): WordView | null {
  const word = preset.onomatopoeia;
  if (!word) return null;
  const zoneId: ZoneId = word.zone;
  const zone: ZoneDef = ZONES[zoneId];
  const layout = fxLayoutWord(text ?? word.text, word.size ?? FX_WORD_DEFAULT_SIZE);
  const face = soupGeometry(fxWordSoup(layout));
  const back = soupGeometry(fxWordSoup(layout, Math.max(inkWeight, layout.cell * 0.45)));
  parts.geometries.push(face, back);
  const material = zoneMaterial(zone, 1);
  material.side = THREE.DoubleSide;
  parts.materials.push(material);
  const backMat = new THREE.MeshBasicMaterial({ color: zoneId === 'ink' ? 0xf4f1ea : 0x110e1b, side: THREE.DoubleSide });
  parts.keylines.set(-1, backMat);
  const group = new THREE.Group();
  group.name = 'word';
  const backMesh = new THREE.Mesh(back, backMat);
  backMesh.position.z = 0.012;
  backMesh.userData.outline = true;
  group.add(backMesh, new THREE.Mesh(face, material));
  group.visible = false;
  group.renderOrder = 4;
  page.add(group);
  return { group, material };
}

/** Pose the word for the current frame; `state` is null while it is not on screen. */
export function poseWord(view: WordView, state: FxWordState | null, layerCount: number): void {
  view.group.visible = state !== null;
  if (!state) return;
  view.group.position.set(state.x, state.y, -(layerCount + 1) * 0.02);
  view.group.rotation.z = state.rot;
  view.group.scale.setScalar(state.scale);
  view.material.uniforms.uOpacity!.value = state.alpha;
  view.material.transparent = state.alpha < 0.999;
}
