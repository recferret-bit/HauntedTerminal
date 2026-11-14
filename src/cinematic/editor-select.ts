import * as THREE from 'three';
import type { ComixWorld } from './reel.js';

export type ComixElementKind =
  | 'panel'
  | 'letter'
  | 'overlay'
  | 'actor'
  | 'prop'
  | 'fixture'
  | 'point'
  | 'beat'
  | 'track'
  | 'page_track';

export interface ComixElementRef {
  kind: ComixElementKind;
  itemPath: string;
  label: string;
  pageId?: string;
  panelId?: string;
  panelIndex?: number;
  itemIndex?: number;
  actorId?: string;
  propId?: string;
  fixtureId?: string;
  pointId?: string;
}

interface Box2D {
  left: number;
  top: number;
  width: number;
  height: number;
}

const SEL_STYLE_ID = 'htc-editor-sel-style';
const SEL_CSS = /* css */ `
.htc-root.htc-editor [data-comix-sel-kind] { pointer-events: auto !important; cursor: pointer; }
.htc-root.htc-editor [data-comix-sel-kind]:hover { outline: 1px dashed rgba(76, 201, 240, 0.72); outline-offset: 2px; }
.htc-root.htc-editor [data-comix-sel-kind].htc-is-selected { outline: 2px solid #ffd166; outline-offset: 2px; }
.htc-sel-box {
  position: absolute; z-index: 20; pointer-events: none; display: none;
  border: 2px solid #4cc9f0;
  box-shadow: 0 0 0 1px #110e1b, inset 0 0 0 1px rgba(17, 14, 27, 0.7), 0 0 14px rgba(76, 201, 240, 0.45);
  background: rgba(76, 201, 240, 0.08);
}
.htc-sel-box::before, .htc-sel-box::after {
  content: ""; position: absolute; width: 7px; height: 7px;
  background: #ffd166; border: 1.5px solid #110e1b; pointer-events: none;
}
.htc-sel-box::before { left: -4px; top: -4px; }
.htc-sel-box::after { right: -4px; bottom: -4px; }
.htc-sel-badge {
  position: absolute; left: -2px; top: -21px; padding: 2px 6px;
  background: #ffd166; color: #110e1b; border: 1.5px solid #110e1b;
  font: 700 10px/1.15 "IBM Plex Mono", ui-monospace, monospace;
  letter-spacing: 0.03em; white-space: nowrap; box-shadow: 2px 2px 0 #110e1b;
}
.htc-sel-box.is-top-clipped .htc-sel-badge { top: 4px; left: 4px; }
`;

function ensureSelectStyle(): void {
  if (document.getElementById(SEL_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SEL_STYLE_ID;
  style.textContent = SEL_CSS;
  document.head.appendChild(style);
}

function isDomVisible(el: HTMLElement, stopAt: HTMLElement): boolean {
  let cur: HTMLElement | null = el;
  while (cur) {
    const cs = getComputedStyle(cur);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') <= 0.05) return false;
    if (cur === stopAt) break;
    cur = cur.parentElement;
  }
  return true;
}

function innerPanelRect(panelEl: HTMLElement): DOMRect {
  const canvas = panelEl.querySelector<HTMLCanvasElement>('canvas');
  return canvas ? canvas.getBoundingClientRect() : panelEl.getBoundingClientRect();
}

function toRootBox(clientRect: Box2D, rootRect: DOMRect): Box2D {
  return { left: clientRect.left - rootRect.left, top: clientRect.top - rootRect.top, width: clientRect.width, height: clientRect.height };
}

function collectVisibleMeshes(obj: THREE.Object3D, out: THREE.Mesh[]): void {
  obj.updateMatrixWorld(true);
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    let cur: THREE.Object3D | null = mesh;
    while (cur) {
      if (!cur.visible) return;
      cur = cur.parent;
    }
    out.push(mesh);
  });
}

function projectPointToClient(camera: THREE.Camera, worldPos: THREE.Vector3, panelRect: DOMRect): { x: number; y: number } {
  const v = worldPos.clone().project(camera);
  return {
    x: panelRect.left + (v.x * 0.5 + 0.5) * panelRect.width,
    y: panelRect.top + (-v.y * 0.5 + 0.5) * panelRect.height,
  };
}

function projectObjectClientBox(camera: THREE.Camera, obj: THREE.Object3D, panelRect: DOMRect): Box2D | null {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (!cur.visible) return null;
    cur = cur.parent;
  }
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const { min, max } = box;
  const tmp = new THREE.Vector3();
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        const pt = projectPointToClient(camera, tmp.set(x, y, z), panelRect);
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      }
    }
  }
  const cLeft = Math.max(panelRect.left, minX - 4);
  const cTop = Math.max(panelRect.top, minY - 4);
  const cRight = Math.min(panelRect.right, maxX + 4);
  const cBottom = Math.min(panelRect.bottom, maxY + 4);
  if (cRight - cLeft < 2 || cBottom - cTop < 2) return null;
  return { left: cLeft, top: cTop, width: cRight - cLeft, height: cBottom - cTop };
}

function fixtureObject(world: ComixWorld, fixtureId: string): THREE.Object3D | null {
  const fx = world.fixtures.get(fixtureId);
  if (!fx) return null;
  if (fx.kind === 'rain') return fx.rain.group;
  return fx.kind === 'vortex' ? fx.mesh : fx.node;
}

/** Hit-test the rendered 2D overlays/letters, live 3D actors/fixtures/props, and 2D comic panels. */
export function pickComixElementAt(world: ComixWorld, clientX: number, clientY: number): ComixElementRef | null {
  const root = world.page.root;
  const hits = document.elementsFromPoint(clientX, clientY);

  for (const raw of hits) {
    if (!(raw instanceof Element)) continue;
    const candidate = raw.closest<HTMLElement>('[data-comix-sel-kind]');
    if (!candidate || candidate.closest('.htc-sel-box')) continue;
    if (!isDomVisible(candidate, root)) continue;
    if (candidate.classList.contains('htc-brain')) {
      const hasRow = [...candidate.children].some((c) => getComputedStyle(c).visibility === 'visible');
      if (!hasRow || (raw !== candidate && getComputedStyle(raw).visibility === 'hidden')) continue;
    }
    if (candidate.dataset.comixSelKind === 'overlay') {
      const pageId = candidate.dataset.comixPageId ?? '';
      const itemIndex = Number(candidate.dataset.comixItemIdx ?? '0');
      const title = candidate.dataset.comixOverlayTitle ?? 'title_card';
      return { kind: 'overlay', pageId, itemIndex, itemPath: `${pageId}.overview.overlays[${itemIndex}]`, label: `overlay: ${title}` };
    }
    if (candidate.dataset.comixSelKind === 'letter') {
      const pageId = candidate.dataset.comixPageId ?? '';
      const panelId = candidate.dataset.comixPanelId ?? '';
      const panelIndex = Number(candidate.dataset.comixPanelIdx ?? '0');
      const itemIndex = Number(candidate.dataset.comixItemIdx ?? '0');
      const kind = candidate.dataset.comixLetterKind ?? 'letter';
      return { kind: 'letter', pageId, panelId, panelIndex, itemIndex, itemPath: `${pageId}.${panelId}.letters.letters[${itemIndex}]`, label: `${kind} #${itemIndex + 1} (${panelId})` };
    }
  }

  let clickedPanelEl: HTMLElement | null = null;
  for (const raw of hits) {
    if (!(raw instanceof Element)) continue;
    const pEl = raw.closest<HTMLElement>('.htc-panel[data-panel]');
    if (pEl && isDomVisible(pEl, root)) {
      clickedPanelEl = pEl;
      break;
    }
  }
  if (!clickedPanelEl) return null;

  const activeEntry = world.page.panels.get(world.current);
  if (world.stage && activeEntry && clickedPanelEl === activeEntry.el) {
    const picked3D = pick3DInPanel(world, clickedPanelEl, clientX, clientY);
    if (picked3D) return picked3D;
  }

  const panelId = clickedPanelEl.dataset.panel ?? '';
  const resolved = world.timeline.panels.find((p) => p.id === panelId);
  if (!resolved) return null;
  const page = world.pack.pages.find((p) => p.id === resolved.pageId);
  const panelIndex = Math.max(0, page?.panels.findIndex((p) => p.id === panelId) ?? 0);
  return { kind: 'panel', pageId: resolved.pageId, panelId, panelIndex, itemIndex: panelIndex, itemPath: `${resolved.pageId}.panels.panels[${panelIndex}]`, label: `panel: ${panelId}` };
}

function pick3DInPanel(world: ComixWorld, panelEl: HTMLElement, clientX: number, clientY: number): ComixElementRef | null {
  const stage = world.stage;
  if (!stage) return null;
  const rect = innerPanelRect(panelEl);
  if (rect.width < 2 || rect.height < 2) return null;
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;

  const entries: { obj: THREE.Object3D; ref: ComixElementRef }[] = [];
  world.pack.manifest.cast.forEach((spec, idx) => {
    const member = world.actors.get(spec.id);
    if (member) {
      entries.push({ obj: member.actor.model.group, ref: { kind: 'actor', actorId: spec.id, itemIndex: idx, panelId: world.current, itemPath: `manifest.cast.cast[${idx}]`, label: `cast: ${spec.id} (${spec.model})` } });
    }
  });
  (world.pack.manifest.stage.fixtures ?? []).forEach((spec, idx) => {
    const obj = fixtureObject(world, spec.id);
    if (obj) {
      entries.push({ obj, ref: { kind: 'fixture', fixtureId: spec.id, itemIndex: idx, panelId: world.current, itemPath: `manifest.stage.stage.fixtures[${idx}]`, label: `fixture: ${spec.id}` } });
    }
  });
  (world.pack.manifest.stage.props ?? []).forEach((spec, idx) => {
    const prop = world.props.get(spec.id);
    if (prop) {
      entries.push({ obj: prop.actor.model.group, ref: { kind: 'prop', propId: spec.id, itemIndex: idx, panelId: world.current, itemPath: `manifest.stage.stage.props[${idx}]`, label: `prop: ${spec.id} (${spec.model})` } });
    }
  });

  const meshOwner = new Map<THREE.Mesh, ComixElementRef>();
  const allMeshes: THREE.Mesh[] = [];
  for (const entry of entries) {
    const sub: THREE.Mesh[] = [];
    collectVisibleMeshes(entry.obj, sub);
    for (const m of sub) {
      meshOwner.set(m, entry.ref);
      allMeshes.push(m);
    }
  }
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, stage.camera);
  for (const hit of raycaster.intersectObjects(allMeshes, false)) {
    const owner = meshOwner.get(hit.object as THREE.Mesh);
    if (owner) return owner;
  }

  for (const entry of entries) {
    if (entry.ref.kind === 'fixture') continue;
    const box = projectObjectClientBox(stage.camera, entry.obj, rect);
    if (!box) continue;
    if (clientX >= box.left - 4 && clientX <= box.left + box.width + 4 && clientY >= box.top - 4 && clientY <= box.top + box.height + 4) {
      return entry.ref;
    }
  }
  return null;
}

/** Manages the high-contrast selection marquee inside `/cinematic.html?editor=1`. */
export class EditorSelectionOverlay {
  private selected: ComixElementRef | null = null;
  private boxEl: HTMLDivElement | null = null;
  private badgeEl: HTMLSpanElement | null = null;
  private markedEls: HTMLElement[] = [];

  attach(world: ComixWorld): void {
    ensureSelectStyle();
    world.page.root.classList.add('htc-editor');
    if (!this.boxEl) {
      this.boxEl = document.createElement('div');
      this.boxEl.className = 'htc-sel-box';
      this.badgeEl = document.createElement('span');
      this.badgeEl.className = 'htc-sel-badge';
      this.boxEl.append(this.badgeEl);
    }
    world.page.root.appendChild(this.boxEl);
  }

  setSelected(ref: ComixElementRef | null, world: ComixWorld | null): void {
    this.selected = ref;
    this.update(world);
  }

  getSelected(): ComixElementRef | null {
    return this.selected;
  }

  private clearMarks(): void {
    for (const el of this.markedEls) el.classList.remove('htc-is-selected');
    this.markedEls = [];
  }

  update(world: ComixWorld | null): void {
    this.clearMarks();
    if (!this.boxEl || !this.badgeEl) return;
    if (!this.selected || !world) {
      this.boxEl.style.display = 'none';
      return;
    }
    const clientBox = this.resolveBox(world, this.selected);
    if (!clientBox) {
      this.boxEl.style.display = 'none';
      return;
    }
    const local = toRootBox(clientBox, world.page.root.getBoundingClientRect());
    this.boxEl.style.display = 'block';
    this.boxEl.style.left = `${Math.round(local.left)}px`;
    this.boxEl.style.top = `${Math.round(local.top)}px`;
    this.boxEl.style.width = `${Math.max(8, Math.round(local.width))}px`;
    this.boxEl.style.height = `${Math.max(8, Math.round(local.height))}px`;
    this.boxEl.classList.toggle('is-top-clipped', local.top < 24);
    this.badgeEl.textContent = this.selected.label;
  }

  private resolveBox(world: ComixWorld, sel: ComixElementRef): Box2D | null {
    const root = world.page.root;
    if (sel.kind === 'letter') {
      const els = [...root.querySelectorAll<HTMLElement>(`[data-comix-sel-kind="letter"][data-comix-page-id="${sel.pageId}"][data-comix-panel-id="${sel.panelId}"][data-comix-item-idx="${sel.itemIndex}"]`)];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const el of els) {
        if (!isDomVisible(el, root)) continue;
        el.classList.add('htc-is-selected');
        this.markedEls.push(el);
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        minX = Math.min(minX, r.left);
        minY = Math.min(minY, r.top);
        maxX = Math.max(maxX, r.right);
        maxY = Math.max(maxY, r.bottom);
      }
      if (Number.isFinite(minX)) return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
    } else if (sel.kind === 'overlay') {
      const el = root.querySelector<HTMLElement>(`[data-comix-sel-kind="overlay"][data-comix-page-id="${sel.pageId}"][data-comix-item-idx="${sel.itemIndex}"]`);
      if (el && isDomVisible(el, root)) {
        el.classList.add('htc-is-selected');
        this.markedEls.push(el);
        const r = el.getBoundingClientRect();
        if (r.width >= 2 && r.height >= 2) return { left: r.left, top: r.top, width: r.width, height: r.height };
      }
    } else if (sel.kind === 'panel' && sel.panelId) {
      const pEl = world.page.panels.get(sel.panelId)?.el;
      if (pEl && isDomVisible(pEl, root)) {
        const r = pEl.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      }
      return null;
    }

    const panelId = sel.panelId && (!world.current || sel.panelId === world.current) ? sel.panelId : world.current;
    const activePanel = world.page.panels.get(panelId)?.el;
    if (!activePanel || !isDomVisible(activePanel, root)) return null;
    const panelRect = innerPanelRect(activePanel);
    if (world.stage && world.current === panelId) {
      const obj = sel.actorId
        ? world.actors.get(sel.actorId)?.actor.model.group
        : sel.propId
          ? world.props.get(sel.propId)?.actor.model.group
          : sel.fixtureId
            ? fixtureObject(world, sel.fixtureId)
            : null;
      if (obj) return projectObjectClientBox(world.stage.camera, obj, panelRect);
      if (sel.pointId && world.timeline.points[sel.pointId]) {
        const pt = world.timeline.points[sel.pointId]!;
        const scr = projectPointToClient(world.stage.camera, new THREE.Vector3(pt.x, pt.y, pt.z), panelRect);
        return { left: scr.x - 16, top: scr.y - 16, width: 32, height: 32 };
      }
    }
    const pr = activePanel.getBoundingClientRect();
    return { left: pr.left, top: pr.top, width: pr.width, height: pr.height };
  }
}
