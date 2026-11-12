import type { EnemyType, PickupType } from '../game/bestiary.js';
import type { EnemySpawn } from '../game/floors.js';
import type { FloorId, RoomKind } from '../game/types.js';
import type { ChapterGrant, ChapterOutro, LevelScript } from './script-types.js';

export type * from './script-types.js';

export type ChapterMechanic =
  | 'hub'
  | 'terminal'
  | 'html-css'
  | 'terminal-code'
  | 'docker-image'
  | 'docker-compose'
  | 'boss';

export interface ChapterAllySpec {
  id: string;
  name: string;
  role: string;
  model: string;
  paletteFamily: string;
}

/** One codex card in `bestiary`: chapter-specific allies, bosses and enemies live in the manifest, not in code. */
export interface DossierEntry {
  id: string;
  name: string;
  model: string;
  role: 'ALLY' | 'MALWARE' | 'BOSS';
  hostHardware: string;
  counterplay: string;
}

export interface ChapterBossSpec {
  id: string;
  name: string;
  processName: string;
  pid: number;
  model: string;
  cameoModel?: string;
  /** Stage label of the cameo supervisor. */
  cameoLabel?: string;
}

export interface ChapterLevelSummary {
  index: number;
  id: string;
  title: string;
  cwd: string;
  roomKind: RoomKind;
  floorTheme: FloorId;
  mechanic: ChapterMechanic;
  mechanicLabel: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  teaches: string[];
  enemies: EnemyType[];
  classicFloor?: FloorId;
  specPath?: string;
}

export interface ChapterManifest {
  id: string;
  issueNumber: number;
  title: string;
  subtitle: string;
  status: 'playable' | 'spec';
  badge: string;
  estimatedMinutes: number;
  clientName: string;
  summary: string;
  allyNpc: ChapterAllySpec;
  boss: ChapterBossSpec;
  comix?: {
    specPath: string;
    dialogsPath: string;
    pageCount: number;
  };
  mechanicsSummary: string[];
  /** Hardware and cores owned when a level is entered directly (see `ChapterGrant`). */
  grants?: ChapterGrant[];
  /** Closing card shown after the last level. */
  outro?: ChapterOutro;
  /** Codex cards this chapter adds to the `bestiary` command and the binder. */
  dossier?: DossierEntry[];
  levels: ChapterLevelSummary[];
}

export interface LevelFileSpec {
  path: string;
  kind: 'file' | 'dir' | 'socket';
  mode?: number;
  uid?: number;
  questCritical?: boolean;
  content?: string;
}

/** Same spawn record as a classic floor. `showIn` stays optional and unused by chapter JSON. */
export type LevelEnemySpec = EnemySpawn;

export interface LevelPickupSpec {
  id: string;
  type: PickupType;
  path: string;
  locked?: boolean;
}

export interface LevelPatchChip {
  file: string;
  label: string;
  find: string;
  replace: string;
}

export type WinRule =
  | { kind: 'read_file'; path: string; description: string }
  | { kind: 'talk_ally'; socket: string; description: string }
  | { kind: 'file_absent'; path: string; description: string }
  | { kind: 'file_contains'; path: string; pattern: string; description: string }
  | { kind: 'dir_accessible'; path: string; description: string }
  | { kind: 'kiro_decrypted'; path: string; description: string }
  | { kind: 'kiro_loaded'; core: string; description: string }
  | { kind: 'enemy_neutralized'; enemyId: string; description: string }
  | { kind: 'html_css_valid'; htmlPath: string; cssPath: string; description: string }
  | { kind: 'cart_js_valid'; jsPath: string; description: string }
  | { kind: 'docker_image_running'; imageTag: string; port: number; description: string }
  | { kind: 'docker_compose_healthy'; services: string[]; description: string }
  | {
      kind: 'boss_defeated';
      bossId: string;
      streamPath: string;
      verifySocket: string;
      expectedToken: string;
      anchorPath: string;
      anchorPattern: string;
      description: string;
    };

export interface LevelSpec {
  id: string;
  index: number;
  title: string;
  cwd: string;
  roomKind: RoomKind;
  floorTheme: FloorId;
  mechanic: ChapterMechanic;
  exitDir?: string;
  exitCommand?: string;
  summary: string;
  files: LevelFileSpec[];
  enemies: LevelEnemySpec[];
  pickups: LevelPickupSpec[];
  patches: LevelPatchChip[];
  winRules: WinRule[];
  solutionCommands: string[];
  /** Arrival beats, tutorial, taunts, Kiro behaviour: see `script-types.ts`. */
  script?: LevelScript;
}

export interface ComixCastActor {
  model: string;
  x: number;
  scale?: number;
  view?: 'front' | 'side' | 'top';
}

export interface ComixBubbleSpec {
  speaker: string;
  style: 'normal' | 'shout' | 'whisper';
  text: string;
  x: number;
  y: number;
}

export interface ComixPanelSpec {
  id: string;
  rect: [number, number, number, number];
  bgHex: string;
  room?: string;
  caption?: string;
  cast: ComixCastActor[];
  bubbles?: ComixBubbleSpec[];
  sfx?: {
    text: string;
    x: number;
    y: number;
    color: string;
  };
}

export interface ComixPageSpec {
  pageNumber: number;
  title: string;
  panels: ComixPanelSpec[];
}

export interface ComixStorySpec {
  chapterId: string;
  issueNumber: number;
  title: string;
  subtitle: string;
  pages: ComixPageSpec[];
}

export interface LevelDialogEntry {
  banner: string;
  hankRungs: [string, string, string];
  agentTaunt?: string;
  completion?: string;
}

export interface ChapterDialogs {
  chapterId: string;
  allyId?: string;
  cast: Record<string, { displayName: string; color: string }>;
  levels: Record<string, LevelDialogEntry>;
}

/** Everything the runtime needs to play one chapter. The editor passes an unsaved draft; the game passes the compiled one. */
export interface ChapterPack {
  manifest: ChapterManifest;
  levels: LevelSpec[];
  dialogs?: ChapterDialogs;
  comix?: ComixStorySpec;
}
