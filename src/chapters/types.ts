import type { ItemId } from '../contracts/inventory.js';
import type { ActorKind, RoomSocketId, SceneTransform, StageAmbientConfig } from '../contracts/room-view.js';
import type { EnemyType } from '../game/bestiary.js';
import type { EnemySpawn, PickupSpawn } from '../game/floors.js';
import type { ClassicLabFile } from '../game/lab-types.js';
import type { FloorId, RoomKind } from '../game/types.js';
import type { ChapterGrant, ChapterOutro, FirstPickupScript, LevelScript, ScriptCond } from './script-types.js';

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
  /** Optional placement and SceneTransform override for the cameo supervisor. */
  cameoTransform?: SceneTransform & { x?: number; y?: number; label?: string };
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
  /** Items he carries when a run starts (default `['tube_transistor', 'terminal']`). */
  startItems?: ItemId[];
  /** Dialogs or beats fired once per session the very first time each pickup type is collected. */
  onFirstPickup?: FirstPickupScript[];
  /** Closing card shown after the last level. */
  outro?: ChapterOutro;
  /** Codex cards this chapter adds to the `bestiary` command and the binder. */
  dossier?: DossierEntry[];
  levels: ChapterLevelSummary[];
}

export interface LevelFileSpec extends ClassicLabFile, SceneTransform {
  x?: number;
  y?: number;
  model?: string;
  socket?: RoomSocketId;
  label?: string;
  sfx?: string;
}

/** Same spawn record as a classic floor. `showIn` stays optional and unused by chapter JSON. */
/** A level enemy. Its `pid` only marks that it has one: the number the player sees is rolled on every load (`pids.ts`), and text names it `{pid:<enemy id>}`. */
export type LevelEnemySpec = EnemySpawn;

export interface LevelPickupSpec extends PickupSpawn {
  /** Optional condition: pickup and its file stay hidden until this holds, then land on the ground. */
  appearWhen?: ScriptCond;
  /** Optional design-space origin `(dropFromX, dropFromY)` when `appearWhen` triggers, arcing onto `x`. */
  dropFromX?: number;
  dropFromY?: number;
}

export interface LevelPropSpec extends SceneTransform {
  id: string;
  model: string;
  x: number;
  y?: number;
  socket?: RoomSocketId;
  kind?: ActorKind;
  label?: string;
  sfx?: string;
  /** Optional VFS subdirectory path where this prop appears (defaults to `level.cwd`). */
  cwd?: string;
}

export interface LevelStageHeroSpec extends SceneTransform {
  x: number;
  y?: number;
}

export interface LevelStageEntryPortSpec extends SceneTransform {
  label?: string;
  model?: string;
  x?: number;
  y?: number;
  socket?: RoomSocketId;
  sfx?: string;
}

export interface LevelStageKiroSpec extends SceneTransform {
  x?: number;
  y?: number;
  target?: string;
  label?: string;
}

export interface LevelStageSubdirSpec {
  hero?: number | LevelStageHeroSpec;
  entryPort?: false | LevelStageEntryPortSpec;
  backdrop?: string;
  ambient?: StageAmbientConfig;
  music?: string;
  sfx?: string;
  caption?: string;
}

export interface LevelStageSpec {
  hero?: number | LevelStageHeroSpec;
  entryPort?: false | LevelStageEntryPortSpec;
  kiro?: LevelStageKiroSpec;
  backdrop?: string;
  ambient?: StageAmbientConfig;
  music?: string;
  sfx?: { enter?: string; deny?: string; exit?: string };
  subdirs?: Record<string, LevelStageSubdirSpec>;
}

export interface LevelPatchChip {
  file: string;
  label: string;
  find: string;
  replace: string;
}

export interface LevelRiddleSpec {
  id: string;
  path: string;
  prompt: string;
  answer: string;
  speaker?: string;
  hints?: string[];
  success?: string;
  opens?: string;
  tokens?: string[];
}

export type WinRule =
  | { kind: 'read_file'; path: string; description: string }
  | { kind: 'talk_ally'; socket: string; description: string }
  | { kind: 'riddle_solved'; riddleId: string; description: string }
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

/** A seeded decoy folder tree built under `root` when the level loads (`src/chapters/tree-gen.ts`). The author places the real file and the clue trail in `files`. */
export interface LevelTreeGenerate {
  kind: 'tree';
  /** Existing or new directory the decoys grow under. */
  root: string;
  /** How many decoy folders (at least). */
  folders: number;
  /** How many hidden (dot) decoy files. */
  hiddenFiles: number;
  /** Same seed, same tree. */
  seed: string;
}

export interface LevelSpec {
  id: string;
  index: number;
  title: string;
  cwd: string;
  roomKind: RoomKind;
  floorTheme: FloorId;
  /** Optional deterministic seed for background room variations (`>= 1`). */
  roomSeed?: number;
  mechanic: ChapterMechanic;
  exitDir?: string;
  exitCommand?: string;
  summary: string;
  files: LevelFileSpec[];
  enemies: LevelEnemySpec[];
  pickups: LevelPickupSpec[];
  patches: LevelPatchChip[];
  /** Optional generated decoy trees that hide a file in a big folder structure. */
  generate?: LevelTreeGenerate[];
  /** Optional talking-socket riddles (`cat <sock>`, `echo <answer> > <sock>`). */
  riddles?: LevelRiddleSpec[];
  /** Optional declarative visual stage props (`ModelCatalog` ids). */
  props?: LevelPropSpec[];
  /** Optional declarative stage placement, backdrop, ambient, and audio config. */
  stage?: LevelStageSpec;
  winRules: WinRule[];
  solutionCommands: string[];
  /** Arrival beats, tutorial, taunts, Kiro behaviour: see `script-types.ts`. */
  script?: LevelScript;
}

export interface ComixCastActor extends SceneTransform {
  model: string;
  x: number;
  y?: number;
  view?: 'front' | 'side' | 'top';
}

export interface ComixPropSpec extends SceneTransform {
  id?: string;
  model: string;
  x: number;
  y?: number;
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
  backdrop?: string;
  room?: string;
  caption?: string;
  cast: ComixCastActor[];
  props?: ComixPropSpec[];
  bubbles?: ComixBubbleSpec[];
  sfx?: {
    text: string;
    x: number;
    y: number;
    color: string;
    cue?: string;
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
