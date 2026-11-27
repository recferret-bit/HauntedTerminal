import { createChapterSession, isChapterSession } from '../chapters/chapter-session.js';
import { readDraftPack } from '../chapters/draft.js';
import type { ChapterPack } from '../chapters/types.js';
import type { KernelEvent } from '../contracts/events.js';
import type { RoomActor } from '../contracts/room-view.js';
import type {
  StageActorRef,
  StageEditorApi,
  StageEditorCallbacks,
  StageRotationValue,
  StageScaleValue,
  StageTransformPatch,
} from '../contracts/stage-editor.js';
import type { ComicStage } from '../renderer/comic-stage.js';
import { applyActorTransform } from '../renderer/stage-cast.js';
import { placeX } from '../renderer/stage-layout.js';
import { mountStageEditorGizmo, type StageEditorGizmo } from './stage-editor-gizmo.js';
import {
  actorRefFromRoomActor,
  clientToDesignPoint,
  listStageActorRefs,
  pickStageActorAt,
  projectActorRect,
} from './stage-editor-pick.js';
import { swapPlaySession } from './session-swap.js';
import type { Play } from './state.js';

const FLOOR_SNAP_Y = 0.12;
const IGNORE_SELECTOR =
  'button, a, input, select, textarea, #topbar, #hud, #sandbox-toggle-btn, .skip-dialog-btn, #dev-inspector, #tutorial-card, #esc-menu, #hint-dialog, #manual-book-modal, #chapter-map-dialog, #code-editor-pane, #laptop-overlay, #outro, #cinematic';

type DragKind = 'move' | 'scale' | 'rotate';

interface ActiveDrag {
  kind: DragKind;
  pointerId: number;
  ref: StageActorRef;
  moved: boolean;
  startClientX: number;
  startClientY: number;
  startDesignX: number;
  startDesignY: number;
  actorStartX: number;
  actorStartY: number;
  centerX: number;
  centerY: number;
  startRadius: number;
  startScale: StageScaleValue;
  startAngle: number;
  startRotation: StageRotationValue;
}

interface EditorController {
  selectedId: string | null;
  showHidden: boolean;
  cbs: StageEditorCallbacks;
  drag: ActiveDrag | null;
}

function roundStep(val: number, step: number): number {
  return Math.round(val / step) * step;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

function normalizeDeg(deg: number): number {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  if (Object.is(d, -180)) d = 180;
  return d;
}

function scaleValue(base: StageScaleValue, factor: number): StageScaleValue {
  if (typeof base === 'number') {
    return round2(clamp(roundStep(base * factor, 0.02), 0.15, 4));
  }
  return [
    round2(clamp(roundStep(base[0] * factor, 0.02), 0.15, 4)),
    round2(clamp(roundStep(base[1] * factor, 0.02), 0.15, 4)),
    round2(clamp(roundStep(base[2] * factor, 0.02), 0.15, 4)),
  ];
}

function zDegreesOf(rot: StageRotationValue): number {
  return typeof rot === 'number' ? rot : rot[2];
}

function rotateValue(base: StageRotationValue, nextZ: number): StageRotationValue {
  return typeof base === 'number' ? nextZ : [base[0], base[1], nextZ];
}

function syncTutorialPlacementForHud(stageWrap: HTMLElement, visible: boolean): void {
  const tut = document.getElementById('tutorial-card');
  if (!tut) return;
  const titleblock = stageWrap.querySelector<HTMLElement>('#titleblock');
  if (!visible && titleblock && tut.parentElement === titleblock) {
    stageWrap.appendChild(tut);
  } else if (visible && titleblock && tut.parentElement === stageWrap) {
    titleblock.appendChild(tut);
  }
}

function findRoomActor(stage: ComicStage, id: string): RoomActor | undefined {
  return stage.view?.actors.find((a) => (a.id ?? a.key) === id);
}

function resolvePair(stage: ComicStage, id: string) {
  return { actor: stage.actors.get(id), ra: findRoomActor(stage, id) };
}

function makePatch(
  d: ActiveDrag,
  commit: boolean,
  fields: Partial<StageTransformPatch>,
): StageTransformPatch {
  return {
    actorId: d.ref.actorId,
    target: d.ref.target,
    portRole: d.ref.portRole,
    commit,
    ...fields,
  };
}

function applyLiveMove(
  stage: ComicStage,
  d: ActiveDrag,
  ev: PointerEvent,
  commit: boolean,
): StageTransformPatch {
  const cur = clientToDesignPoint(stage, ev.clientX, ev.clientY);
  let dx = cur.x - d.startDesignX;
  let dy = cur.y - d.startDesignY;
  if (ev.shiftKey) {
    if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
    else dx = 0;
  }
  const nextX = round2(clamp(d.actorStartX + dx, -1.5, 5.2));
  const rawY = d.actorStartY + dy;
  const snappedToFloor = !ev.altKey && Math.abs(rawY) < FLOOR_SNAP_Y;
  const nextY = snappedToFloor ? 0 : round2(rawY);
  const { actor, ra } = resolvePair(stage, d.ref.actorId);
  if (actor && ra) {
    const wx = placeX(stage, nextX);
    const wy = stage.feetY + nextY;
    actor.home.set(wx, wy, actor.home.z);
    actor.base.x = wx;
    actor.base.y = wy;
    actor.group.position.x = wx;
    actor.group.position.y = wy;
    ra.x = nextX;
    ra.y = nextY;
    delete ra.socket;
  }
  return makePatch(d, commit, { x: nextX, y: snappedToFloor ? null : nextY, detachSocket: true });
}

function applyLiveScale(
  stage: ComicStage,
  d: ActiveDrag,
  ev: PointerEvent,
  commit: boolean,
): StageTransformPatch {
  const curRadius = Math.hypot(ev.clientX - d.centerX, ev.clientY - d.centerY);
  const nextScale = scaleValue(d.startScale, curRadius / d.startRadius);
  const { actor, ra } = resolvePair(stage, d.ref.actorId);
  if (actor && ra) {
    ra.scale = nextScale;
    applyActorTransform(actor, ra, true);
  }
  return makePatch(d, commit, { scale: nextScale });
}

function applyLiveRotate(
  stage: ComicStage,
  d: ActiveDrag,
  ev: PointerEvent,
  commit: boolean,
): StageTransformPatch {
  const angle = Math.atan2(ev.clientY - d.centerY, ev.clientX - d.centerX);
  const deltaDeg = ((angle - d.startAngle) * 180) / Math.PI;
  const step = ev.shiftKey ? 15 : 1;
  const rawZ = normalizeDeg(zDegreesOf(d.startRotation) + deltaDeg);
  const nextRot = rotateValue(d.startRotation, Math.round(roundStep(rawZ, step)));
  const { actor, ra } = resolvePair(stage, d.ref.actorId);
  if (actor && ra) {
    ra.rotation = nextRot;
    applyActorTransform(actor, ra, true);
  }
  return makePatch(d, commit, { rotation: nextRot });
}

function computePatch(
  stage: ComicStage,
  d: ActiveDrag,
  ev: PointerEvent,
  commit: boolean,
): StageTransformPatch {
  if (d.kind === 'move') return applyLiveMove(stage, d, ev, commit);
  if (d.kind === 'scale') return applyLiveScale(stage, d, ev, commit);
  return applyLiveRotate(stage, d, ev, commit);
}

function buildEditorSession(
  packId: string,
  pack: ChapterPack,
  levelId: string,
  showHidden: boolean,
  cwd?: string,
) {
  const next = createChapterSession({
    chapterId: packId,
    pack,
    preview: true,
    startLevelId: levelId,
  });
  next.skipIntro();
  if (showHidden) next.setEditorPreviewOptions?.({ showHidden: true });
  if (cwd) next.setPreviewCwd?.(cwd);
  return next;
}

function tryCapturePointer(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture?.(pointerId);
  } catch {
    /* synthetic PointerEvent without active browser pointer id */
  }
}

function tryReleasePointer(el: HTMLElement, pointerId: number): void {
  try {
    if (el.hasPointerCapture?.(pointerId)) el.releasePointerCapture(pointerId);
  } catch {
    /* ignore */
  }
}

function toFramePointerEvent(ev: PointerEvent, fromParent: boolean): PointerEvent {
  if (!fromParent) return ev;
  const frame = window.frameElement as HTMLElement | null;
  if (!frame) return ev;
  const rect = frame.getBoundingClientRect();
  const fw = frame.clientWidth || rect.width;
  const fh = frame.clientHeight || rect.height;
  const scaleX = fw > 0 ? window.innerWidth / fw : 1;
  const scaleY = fh > 0 ? window.innerHeight / fh : 1;
  return {
    pointerId: ev.pointerId,
    pointerType: ev.pointerType,
    buttons: ev.buttons,
    shiftKey: ev.shiftKey,
    altKey: ev.altKey,
    clientX: (ev.clientX - rect.left - frame.clientLeft) * scaleX,
    clientY: (ev.clientY - rect.top - frame.clientTop) * scaleY,
  } as PointerEvent;
}

function wirePointerDrag(
  play: Play,
  stageWrap: HTMLElement,
  ctrl: EditorController,
  refreshGizmo: () => void,
): void {
  stageWrap.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const target = ev.target as Element | null;
    if (target?.closest(IGNORE_SELECTOR)) return;
    const hit = pickStageActorAt(play.stage, stageWrap, ev.clientX, ev.clientY);
    if (!hit) {
      ctrl.selectedId = null;
      refreshGizmo();
      ctrl.cbs.onSelect?.(null);
      return;
    }
    ctrl.selectedId = hit.ref.actorId;
    refreshGizmo();
    ctrl.cbs.onSelect?.(hit.ref);
    const startPt = clientToDesignPoint(play.stage, ev.clientX, ev.clientY);
    ctrl.drag = {
      kind: 'move',
      pointerId: ev.pointerId,
      ref: hit.ref,
      moved: false,
      startClientX: ev.clientX,
      startClientY: ev.clientY,
      startDesignX: startPt.x,
      startDesignY: startPt.y,
      actorStartX: hit.ref.x,
      actorStartY: hit.ref.y,
      centerX: 0,
      centerY: 0,
      startRadius: 1,
      startScale: hit.ref.scale,
      startAngle: 0,
      startRotation: hit.ref.rotation,
    };
    tryCapturePointer(stageWrap, ev.pointerId);
  });

  const endDrag = (rawEv: PointerEvent, fromParent = false): void => {
    if (!ctrl.drag || rawEv.pointerId !== ctrl.drag.pointerId) return;
    const ev = toFramePointerEvent(rawEv, fromParent);
    const active = ctrl.drag;
    ctrl.drag = null;
    tryReleasePointer(stageWrap, rawEv.pointerId);
    if (active.moved) {
      ctrl.cbs.onTransform?.(computePatch(play.stage, active, ev, true));
    }
    refreshGizmo();
  };

  const onMove = (rawEv: PointerEvent, fromParent = false): void => {
    if (!ctrl.drag || rawEv.pointerId !== ctrl.drag.pointerId) return;
    if (rawEv.pointerType !== 'touch' && rawEv.buttons === 0) {
      endDrag(rawEv, fromParent);
      return;
    }
    const ev = toFramePointerEvent(rawEv, fromParent);
    if (!ctrl.drag.moved) {
      if (Math.hypot(ev.clientX - ctrl.drag.startClientX, ev.clientY - ctrl.drag.startClientY) < 3) return;
      ctrl.drag.moved = true;
    }
    const patch = computePatch(play.stage, ctrl.drag, ev, false);
    refreshGizmo();
    ctrl.cbs.onTransform?.(patch);
  };

  window.addEventListener('pointermove', (ev) => onMove(ev, false));
  window.addEventListener('pointerup', (ev) => endDrag(ev, false));
  window.addEventListener('pointercancel', (ev) => endDrag(ev, false));
  try {
    if (window.parent && window.parent !== window && window.frameElement) {
      const parentWin = window.parent;
      const pMove = (ev: PointerEvent) => { if (ctrl.drag) onMove(ev, true); };
      const pUp = (ev: PointerEvent) => { if (ctrl.drag) endDrag(ev, true); };
      parentWin.addEventListener('pointermove', pMove);
      parentWin.addEventListener('pointerup', pUp);
      parentWin.addEventListener('pointercancel', pUp);
      window.addEventListener('unload', () => {
        parentWin.removeEventListener('pointermove', pMove);
        parentWin.removeEventListener('pointerup', pUp);
        parentWin.removeEventListener('pointercancel', pUp);
      }, { once: true });
    }
  } catch {
    /* cross-origin parent */
  }
}

function startGizmoHandleDrag(
  play: Play,
  stageWrap: HTMLElement,
  ctrl: EditorController,
  kind: 'scale' | 'rotate',
  ev: PointerEvent,
  refreshGizmo: () => void,
): void {
  if (!ctrl.selectedId) return;
  const ra = findRoomActor(play.stage, ctrl.selectedId);
  const actor = ra ? play.stage.actors.get(ra.id ?? ra.key) : undefined;
  if (!ra || !actor) return;
  const bounds = projectActorRect(play.stage, actor, stageWrap);
  if (!bounds) return;
  const ref = actorRefFromRoomActor(play.stage, ra, actor);
  const hostRect = stageWrap.getBoundingClientRect();
  const centerX = hostRect.left + bounds.left + bounds.width / 2;
  const centerY = hostRect.top + bounds.top + bounds.height / 2;
  ctrl.drag = {
    kind,
    pointerId: ev.pointerId,
    ref,
    moved: false,
    startClientX: ev.clientX,
    startClientY: ev.clientY,
    startDesignX: 0,
    startDesignY: 0,
    actorStartX: ref.x,
    actorStartY: ref.y,
    centerX,
    centerY,
    startRadius: Math.max(20, Math.hypot(ev.clientX - centerX, ev.clientY - centerY)),
    startScale: ref.scale,
    startAngle: Math.atan2(ev.clientY - centerY, ev.clientX - centerX),
    startRotation: ref.rotation,
  };
  tryCapturePointer(stageWrap, ev.pointerId);
  refreshGizmo();
}

function syncGizmo(play: Play, stageWrap: HTMLElement, gizmo: StageEditorGizmo, ctrl: EditorController): void {
  if (!ctrl.selectedId) {
    gizmo.update(null, null);
    return;
  }
  const actor = play.stage.actors.get(ctrl.selectedId);
  const ra = findRoomActor(play.stage, ctrl.selectedId);
  if (!actor || !ra) {
    gizmo.update(null, null);
    return;
  }
  gizmo.update(projectActorRect(play.stage, actor, stageWrap), actorRefFromRoomActor(play.stage, ra, actor), ctrl.drag?.kind ?? 'idle');
}

function createEditorApi(
  play: Play,
  stageWrap: HTMLElement,
  ctrl: EditorController,
  refreshGizmo: () => void,
  emitState: () => void,
  clearDialogs: () => void,
  reloadSession: (packId: string, levelId: string | undefined, cwd: string | undefined, soft: boolean) => boolean,
): StageEditorApi {
  const api: StageEditorApi = {
    get ready() { return play.lifecycle.phase() === 'play'; },
    setHudVisible(visible) {
      document.body.classList.toggle('editor-hud-off', !visible);
      syncTutorialPlacementForHud(stageWrap, visible);
      emitState();
      return visible;
    },
    isHudVisible: () => !document.body.classList.contains('editor-hud-off'),
    setShowHidden(show) {
      ctrl.showHidden = show;
      if (isChapterSession(play.session) && play.session.setEditorPreviewOptions) {
        play.events.emit({ kind: 'apply-tick', res: play.session.setEditorPreviewOptions({ showHidden: show }) });
      }
      refreshGizmo();
      emitState();
      return ctrl.showHidden;
    },
    isShowHidden: () => ctrl.showHidden,
    setAiPaused(paused) {
      play.aiPaused = paused;
      play.events.emit({ kind: 'sync-pause' });
      emitState();
      return play.aiPaused;
    },
    isAiPaused: () => play.aiPaused,
    listDirs: () => isChapterSession(play.session) && play.session.listPreviewDirs ? play.session.listPreviewDirs() : [play.session.snapshot().cwd],
    getCwd: () => play.session.snapshot().cwd,
    setCwd(cwd) {
      if (!isChapterSession(play.session) || !play.session.setPreviewCwd) return false;
      const res = play.session.setPreviewCwd(cwd);
      play.events.emit({ kind: 'apply-tick', res });
      ctrl.selectedId = null;
      refreshGizmo();
      emitState();
      return res.snapshot.cwd === cwd || play.session.listPreviewDirs?.().includes(res.snapshot.cwd) === true;
    },
    getSelectedActor: () => {
      if (!ctrl.selectedId) return null;
      const ra = findRoomActor(play.stage, ctrl.selectedId);
      return ra ? actorRefFromRoomActor(play.stage, ra, play.stage.actors.get(ra.id ?? ra.key)) : null;
    },
    setSelectedActor(actorId) {
      ctrl.selectedId = actorId && findRoomActor(play.stage, actorId) ? actorId : null;
      refreshGizmo();
      return ctrl.selectedId !== null;
    },
    listActors: () => listStageActorRefs(play.stage),
    pickAt: (clientX, clientY) => pickStageActorAt(play.stage, stageWrap, clientX, clientY),
    clearDialogs,
    playBeat(events: KernelEvent[], print?: string) {
      play.events.emit({ kind: 'apply-events', events, snap: play.session.snapshot(), ...(print ? { printed: print } : {}) });
    },
    swapDraft: (packId, levelId, cwd) => reloadSession(packId, levelId, cwd, false),
    syncDraftInPlace: (packId, cwd) => reloadSession(packId, undefined, cwd ?? api.getCwd(), true),
    restartLevel() {
      if (!isChapterSession(play.session)) return false;
      return reloadSession(play.session.chapterId, play.session.getCurrentLevel().id, api.getCwd(), false);
    },
    injectTestEnemy(type, x) {
      if (!isChapterSession(play.session) || !play.session.injectEditorEnemy) return false;
      const res = play.session.injectEditorEnemy(type, x);
      if (!res) return false;
      play.events.emit({ kind: 'apply-tick', res });
      refreshGizmo();
      return true;
    },
    killAllEnemies() {
      if (!isChapterSession(play.session) || !play.session.killAllEnemies) return 0;
      const { count, result } = play.session.killAllEnemies();
      play.events.emit({ kind: 'apply-tick', res: result });
      if (ctrl.selectedId && !findRoomActor(play.stage, ctrl.selectedId)) {
        ctrl.selectedId = null;
        ctrl.cbs.onSelect?.(null);
      }
      refreshGizmo();
      return count;
    },
    onEditorCallbacks(nextCbs) { ctrl.cbs = nextCbs; },
  };
  return api;
}

export function exposeStageEditorHooks(play: Play): void {
  if (!play.editorMode) return;

  const stageWrap = play.dom.stageWrap;
  const ctrl: EditorController = { selectedId: null, showHidden: false, cbs: {}, drag: null };
  let rafSync = 0;

  const refreshGizmo = (): void => syncGizmo(play, stageWrap, gizmo, ctrl);
  const gizmo = mountStageEditorGizmo(stageWrap, {
    onScaleStart: (ev) => startGizmoHandleDrag(play, stageWrap, ctrl, 'scale', ev, refreshGizmo),
    onRotateStart: (ev) => startGizmoHandleDrag(play, stageWrap, ctrl, 'rotate', ev, refreshGizmo),
  });

  const emitState = (): void => {
    ctrl.cbs.onState?.({
      cwd: play.session.snapshot().cwd,
      hudVisible: !document.body.classList.contains('editor-hud-off'),
      showHidden: ctrl.showHidden,
      aiPaused: play.aiPaused,
    });
  };

  wirePointerDrag(play, stageWrap, ctrl, refreshGizmo);
  play.onPaint = () => {
    cancelAnimationFrame(rafSync);
    rafSync = requestAnimationFrame(refreshGizmo);
  };
  window.addEventListener('resize', () => requestAnimationFrame(refreshGizmo));

  const clearDialogs = (): void => {
    play.previewTutorialOverride = null;
    play.dialogs?.clear();
    play.tutorial.hide();
    play.stage.overlay.clearTransient();
  };

  const reloadSession = (packId: string, levelId: string | undefined, cwd: string | undefined, soft: boolean): boolean => {
    if (soft && ctrl.drag !== null) return false;
    const draft = readDraftPack(packId);
    if (!draft) return false;
    const targetLevelId = levelId ?? (isChapterSession(play.session) ? play.session.getCurrentLevel().id : draft.levels[0]?.id);
    if (!targetLevelId) return false;
    const next = buildEditorSession(packId, draft, targetLevelId, ctrl.showHidden, cwd);
    if (!soft) clearDialogs();
    swapPlaySession(play, { next, manifest: draft.manifest, terminalLab: null, emitFloorCard: false, arrive: !soft, resetShell: false, soft });
    if (soft && ctrl.selectedId && !findRoomActor(play.stage, ctrl.selectedId)) ctrl.selectedId = null;
    refreshGizmo();
    emitState();
    return true;
  };

  const api = createEditorApi(play, stageWrap, ctrl, refreshGizmo, emitState, clearDialogs, reloadSession);
  (window as unknown as { __stageEditor?: StageEditorApi }).__stageEditor = api;
}
