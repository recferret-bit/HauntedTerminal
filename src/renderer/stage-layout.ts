import * as THREE from 'three';
import { createComicMaterial, createFloodMaterial, isComic } from '../shaders/comic-material.js';
import { buildModel, createAnimator, disposeModel, ModelCatalog } from '../procgen/index.js';
import { roomIdForKind, ROOM } from '../procgen/archetypes/rooms.js';
import type { RoomKind, RoomView } from './room-view.js';
import type { ComicStage } from './comic-stage.js';
import { ACTOR_Z, defaultRoom, DESIGN_LEFT, DESIGN_RIGHT, disposeTree, LOOK_HOME, themeFor } from './stage-const.js';
import { removeActor } from './stage-actor.js';
import { floodHeight, roomSocket } from './stage-resolve.js';

export function layoutFill(stage: ComicStage, halfW: number, halfH: number): void {
  if (!stage.backdrop || !stage.plinthMesh) return;
  const margin = 0.02;
  const viewLeft = halfW - margin;
  const viewRight = -halfW + margin;
  const viewTop = LOOK_HOME.y + halfH - margin;
  const viewBottom = LOOK_HOME.y - halfH + margin;
  const viewW = viewLeft - viewRight;
  const viewH = viewTop - viewBottom;
  const midX = (viewLeft + viewRight) / 2;
  const midY = (viewTop + viewBottom) / 2;
  resizePlane(stage.backdrop, viewW, viewH, midX, midY, 1.7);
  const colW = Math.min(2.8, Math.max(1.7, viewW * 0.2));
  const gutter = 0.14;
  stage.panelLeft = viewLeft;
  stage.panelRight = viewRight + colW + gutter;
  stage.feetY = viewBottom + 0.5;
  stage.viewTop = viewTop;
  stage.column = { left: viewRight + colW, right: viewRight, top: viewTop - 0.7, bottom: viewBottom + 0.15 };
  const mainW = Math.max(0.4, stage.panelLeft - stage.panelRight);
  const mainCx = (stage.panelLeft + stage.panelRight) / 2;
  stage.plinthMesh.scale.set(mainW, 1, 1);
  stage.plinthMesh.position.set(mainCx, viewBottom + 0.24, 0.35);
  fitRoom(stage);
}

/** Map an authored actor x into the live panel. World +x stays screen-left. */
export function placeX(stage: ComicStage, designX: number): number {
  const span = DESIGN_LEFT - DESIGN_RIGHT;
  const t = Math.min(1, Math.max(0, (DESIGN_LEFT - designX) / span));
  return stage.panelLeft - t * (stage.panelLeft - stage.panelRight);
}

/** The flood spans the main panel, centred on the room's `flood` socket when it has one. */
export function syncFlood(stage: ComicStage): void {
  if (!stage.flood) return;
  const h = floodHeight(stage);
  const s = roomSocket(stage, 'flood');
  const width = Math.max(0.2, stage.panelLeft - stage.panelRight);
  stage.flood.scale.y = h;
  stage.flood.scale.x = width;
  stage.flood.position.x = s ? Math.min(stage.panelLeft - width / 2, Math.max(stage.panelRight + width / 2, s.x)) : (stage.panelLeft + stage.panelRight) / 2;
  stage.flood.position.y = stage.feetY - 0.45 + h * 0.5;
  stage.flood.position.z = s ? Math.min(0.5, s.z + 0.2) : 0.5;
  stage.flood.visible = stage.floodPercent > 1;
}

export function applyLantern(stage: ComicStage, t: number): void {
  const k = Math.min(1, Math.max(0, t));
  const hero = stage.hero();
  const glow = hero?.glow;
  if (glow) glow.uniforms.uEmissive.value = ((glow.userData.baseEmissive as number | undefined) ?? 0.35) + 1.25 * k;
}

/** Builds (or swaps) the procgen room set for `kind` and lays it over the main panel. */
export function syncRoomModel(stage: ComicStage, kind: RoomKind): void {
  if (stage.room?.kind === kind) return;
  if (stage.room) {
    stage.world.remove(stage.room.model.group);
    stage.room.animator.dispose();
    const old = new Set(stage.room.model.allMaterials);
    stage.comics = stage.comics.filter((m) => !old.has(m));
    disposeModel(stage.room.model);
    stage.room = null;
  }
  const id = roomIdForKind(kind);
  if (!ModelCatalog.has(id)) return;
  const model = buildModel(ModelCatalog.build(id, 1));
  const animator = createAnimator(model);
  for (const mat of model.allMaterials) {
    mat.userData.baseOpacity = mat.uniforms.uOpacity!.value;
    stage.comics.push(mat);
  }
  stage.world.add(model.group);
  stage.room = { kind, model, animator };
  fitRoom(stage);
  stage.applyInk(model.group);
}

/** The neighbour column: crisp DOM comic panels over the column area (no canvas text). */
export function drawNeighbors(stage: ComicStage, view: RoomView): void {
  const cards = (view.neighbors ?? []).slice(0, 3).map((n) => ({
    mark: n.relation === 'parent' ? '..' : n.relation === 'down' ? 'DOWN' : n.relation === 'locked' ? 'LOCKED' : 'NEXT',
    label: n.label,
    kind: n.relation === 'locked' ? 'locked' : n.relation === 'down' ? 'down' : '',
  }));
  stage.overlay.neighbors(cards, stage.column);
}

export function buildStageScene(stage: ComicStage): void {
  stage.tweens.clear();
  stage.fxPlayer.clear();
  stage.cameos.clear();
  stage.cardKill = null;
  stage.bubble = null;
  for (const a of [...stage.actors.values()]) removeActor(stage, a);
  stage.queue = [];
  stage.pendingSpawn.clear();
  stage.overlay.clearTransient();
  stage.overlay.pruneBadges(new Set());
  stage.overlay.links([]);
  disposeTree(stage.world);
  disposeTree(stage.fx);
  disposeTree(stage.pageLayer);
  stage.world.clear();
  stage.fx.clear();
  stage.pageLayer.clear();
  stage.comics = [];
  if (stage.room) {
    stage.room.animator.dispose();
    stage.room = null;
  }
  stage.lastPath = '';
  stage.layoutKey = '';

  const theme = themeFor(stage.view?.kind ?? 'attic');
  stage.scene.background = new THREE.Color(0xefe6d2);

  const paper = new THREE.Mesh(new THREE.PlaneGeometry(28, 16), createComicMaterial(0xefe6d2, { halftone: true }));
  paper.rotation.y = Math.PI;
  paper.position.set(0, 2.45, 2.4);
  stage.world.add(paper);

  stage.frameMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x140f12 }));
  stage.frameMesh.rotation.y = Math.PI;
  stage.frameMesh.visible = false;
  stage.world.add(stage.frameMesh);

  stage.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), createComicMaterial(theme.bg, { halftone: true }));
  stage.backdrop.rotation.y = Math.PI;
  stage.backdrop.position.set(0, 2.45, 1.7);
  stage.world.add(stage.backdrop);

  stage.plinthMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.48, 0.42), createComicMaterial(0x3a2a28, { halftone: true, stripes: true }));
  stage.plinthMesh.position.set(0, 0.38, 0.35);
  stage.plinthMesh.visible = false;
  stage.world.add(stage.plinthMesh);

  stage.flood = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.2), createFloodMaterial());
  stage.flood.position.set(0, 0.7, 0.5);
  stage.flood.visible = false;
  stage.world.add(stage.flood);
  stage.neighbors.position.set(0, 0, 0);
  stage.world.add(stage.neighbors);
  stage.neighbors.clear();

  const caption = document.getElementById('stage-caption');
  if (caption) caption.textContent = `${theme.title}   ${theme.path}`;

  stage.world.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    const mat = mesh.material;
    if (mat && !Array.isArray(mat) && isComic(mat)) stage.comics.push(mat);
  });
  if (!stage.view) stage.view = defaultRoom();
  const w = Math.max(1, stage.mount.clientWidth);
  const h = Math.max(1, stage.mount.clientHeight);
  const halfH = (5.35 / stage.zoom) / 2;
  layoutFill(stage, halfH * (w / h), halfH);
  stage.built = true;
  stage.syncRoom(stage.view);
  stage.applyConfigVisuals();
  assertFrame(stage);
}

/** Room frame y = 0 is the feet line; x is stretched so room sockets line up with placeX. */
function fitRoom(stage: ComicStage): void {
  if (!stage.room) return;
  const width = Math.max(0.4, stage.panelLeft - stage.panelRight);
  stage.room.model.group.position.set((stage.panelLeft + stage.panelRight) / 2, stage.feetY, ACTOR_Z);
  stage.room.model.group.scale.set(width / ROOM.width, 1, 1);
}

function resizePlane(mesh: THREE.Mesh, width: number, height: number, x: number, y: number, z: number): void {
  mesh.scale.set(Math.max(0.2, width), Math.max(0.2, height), 1);
  mesh.position.set(x, y, z);
}

function assertFrame(stage: ComicStage): void {
  if (!stage.backdrop) return;
  stage.camera.updateMatrixWorld(true);
  stage.backdrop.updateWorldMatrix(true, false);
  const dir = new THREE.Vector3();
  stage.camera.getWorldDirection(dir);
  if (dir.z < 0.9 || Math.abs(dir.y) > 0.05) {
    throw new Error(`comic camera is tilted (${dir.x.toFixed(2)}, ${dir.y.toFixed(2)}, ${dir.z.toFixed(2)})`);
  }
  const right = new THREE.Vector3().setFromMatrixColumn(stage.camera.matrixWorld, 0);
  if (right.x > -0.9) throw new Error(`screen-right.x=${right.x.toFixed(2)}; expected world -x`);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(stage.backdrop.quaternion);
  if (normal.z > -0.9) throw new Error(`backdrop faces away (${normal.z.toFixed(2)})`);
}
