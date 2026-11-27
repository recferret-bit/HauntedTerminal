import type { KernelEvent } from './events.js';
import type { ActorKind } from './room-view.js';

export type StageScaleValue = number | [number, number, number];
export type StageRotationValue = number | [number, number, number];

export interface StageActorRef {
  actorId: string;
  kind: ActorKind;
  modelId: string;
  target?: string;
  portRole?: 'entry' | 'exit' | 'sub';
  label?: string;
  x: number;
  y: number;
  zOrder: number;
  scale: StageScaleValue;
  rotation: StageRotationValue;
  socket?: string;
  hidden?: boolean;
}

export interface StageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface StagePickHit {
  ref: StageActorRef;
  bounds: StageRect;
}

export interface StageTransformPatch {
  actorId: string;
  target?: string;
  portRole?: 'entry' | 'exit' | 'sub';
  x?: number;
  y?: number | null;
  scale?: StageScaleValue;
  rotation?: StageRotationValue;
  zOrder?: number;
  detachSocket?: boolean;
  commit: boolean;
}

export interface StageEditorState {
  cwd: string;
  hudVisible: boolean;
  showHidden: boolean;
  aiPaused: boolean;
}

export interface StageEditorCallbacks {
  onSelect?: (hit: StageActorRef | null) => void;
  onTransform?: (patch: StageTransformPatch) => void;
  onState?: (state: StageEditorState) => void;
}

export interface StageEditorApi {
  readonly ready: boolean;
  setHudVisible(visible: boolean): boolean;
  isHudVisible(): boolean;
  setShowHidden(show: boolean): boolean;
  isShowHidden(): boolean;
  setAiPaused(paused: boolean): boolean;
  isAiPaused(): boolean;
  listDirs(): string[];
  getCwd(): string;
  setCwd(cwd: string): boolean;
  getSelectedActor(): StageActorRef | null;
  setSelectedActor(actorId: string | null): boolean;
  listActors(): StageActorRef[];
  pickAt(clientX: number, clientY: number): StagePickHit | null;
  clearDialogs(): void;
  playBeat(events: KernelEvent[], print?: string): void;
  swapDraft(packId: string, levelId: string, cwd?: string): boolean;
  syncDraftInPlace(packId: string, cwd?: string): boolean;
  restartLevel(): boolean;
  injectTestEnemy(type: string, x?: number): boolean;
  killAllEnemies(): number;
  onEditorCallbacks(cbs: StageEditorCallbacks): void;
}
