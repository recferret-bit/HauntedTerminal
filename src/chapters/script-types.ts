import type { PosixSignal } from '../contracts/events.js';
import type { ItemId } from '../contracts/inventory.js';
import type { SceneTransform } from '../contracts/room-view.js';
import type { PickupType } from '../game/bestiary.js';

/**
 * Declarative level behaviour. Everything a level says, shows or reacts to is data in `level.spec.json`
 * under `script`; the runtime (`script.ts`) is one generic interpreter. No chapter or level id appears in code.
 * Add a new kind here, interpret it once in `script.ts`, describe it in `src/chapter-editor/schema.ts`.
 */
export type ScriptAgent = 'clod' | 'gork' | 'codec' | 'antigravy' | 'kiro';
export type ScriptMood = 'laugh' | 'order' | 'smug' | 'annoyed';
export type DialogSpeaker = 'vibecoder' | 'dad' | ScriptAgent;

/** Steps that run once, `afterSec` seconds (level ticks) after the level starts. */
export interface ScriptTimed {
  afterSec: number;
  /** Skipped (it never fires) if this holds when the time comes. */
  unless?: ScriptCond;
  steps: ScriptStep[];
}

/** A command that refuses (printing `message`, exit 1) until `until` holds. Matches the first word, so `ls -a` is covered too. */
export interface ScriptLock {
  command: string;
  until: ScriptCond;
  message: string;
}

/** Steps that run once per level load as soon as `when` holds (after commands, saves, or ticks). */
export interface ScriptTrigger {
  when: ScriptCond;
  steps: ScriptStep[];
}

/** Steps that run once per session the very first time a pickup of `pickup` type is collected. */
export interface FirstPickupScript {
  pickup: PickupType;
  steps: ScriptStep[];
}

/** A condition over live level state. `any` / `all` nest. */
export type ScriptCond =
  | { kind: 'ran_command'; name: string }
  | { kind: 'file_absent'; path: string }
  | { kind: 'file_read'; path: string }
  | { kind: 'enemy_dead'; enemyId: string }
  | { kind: 'any_enemy_dead' }
  | { kind: 'core_loaded'; core: string }
  | { kind: 'has_item'; item: ItemId }
  | { kind: 'room_swept' }
  | { kind: 'tutorial_skipped' }
  | { kind: 'any'; of: ScriptCond[] }
  | { kind: 'all'; of: ScriptCond[] };

/** One beat of an arrival / reaction script. Steps run in order; `print` text goes to the terminal. */
export type ScriptStep =
  | { kind: 'print'; text: string }
  | { kind: 'emote'; emote: 'shock' | 'confused' | 'determined' | 'relief' | 'panic' | 'shout'; text?: string }
  | ({ kind: 'spawn'; entityId: string; model: string; /** How the stage brings it in (default `appear`). */ entrance?: 'appear' | 'glide'; x?: number; y?: number; label?: string } & SceneTransform)
  | { kind: 'despawn'; entityId: string }
  | { kind: 'kiro_action'; action: 'scan' | 'load' | 'crack_start' | 'crack_step' | 'crack_done' | 'empower'; core: string; message: string }
  | { kind: 'say'; agent: ScriptAgent; model: string; text: string; mood: ScriptMood; print?: string }
  /** The level's `agentTaunt` from dialogs.json (agent resolved from its prefix); `fallback` if the dialog has none. */
  | { kind: 'taunt'; mood: ScriptMood; fallback?: string; print?: string }
  | {
      kind: 'dialogue';
      obstacleId: string;
      speaker: string;
      portrait?: string;
      mood: 'cryptic' | 'hinting';
      anchorSocket: string;
      text: string;
      highlight: string[];
      banner: string;
    }
  /** One line in the dialog box in the screen corner, with the speaker's avatar. `speaker` is `vibecoder` or a `ScriptAgent`; it also prints to the terminal. */
  | { kind: 'dialog_box'; speaker: DialogSpeaker; text: string; holdSec?: number }
  /** Show tutorial card `step` (1-based) of `script.tutorial`. */
  | { kind: 'tutorial_step'; step: number }
  /** An actor (`kiro` or a spawned entity) picks `item` up and flies it to the hero. Stage only: the inventory does not change. */
  | { kind: 'carry_item'; entityId: string; item: ItemId }
  /** The hero receives `item` (added to the inventory, held when his hands are empty), flown in by `from`. */
  | { kind: 'give_item'; item: ItemId; from?: string }
  /** The item leaves the inventory (a Tensor GPU slotted into the rack). If he held it, his hands go back to the terminal or empty. */
  | { kind: 'take_item'; item: ItemId }
  /** An actor (`kiro` or a spawned entity) flies to `target`: `hero`, `home`, or the name of a socket or entity in the room. Stage only; it does not wait. */
  | { kind: 'fly_to'; entityId: string; target: string; hold?: boolean; ms?: number }
  /** Pauses the steps that follow by `sec` level seconds (paused with the game); the steps before it have already run. */
  | { kind: 'wait'; sec: number }
  /** Plays a one-shot `SFX_IDS` cue at this beat. */
  | { kind: 'sfx'; cue: string }
  /** Plays a one-shot FX preset at optional design coordinates `(x, y)` with optional word override. */
  | { kind: 'fx'; preset: string; x?: number; y?: number; text?: string }
  /** Overrides active level music with a `MusicId`, or `null` to restore stage default. */
  | { kind: 'music'; cue: string | null };

export interface TutorialStepSpec {
  prompt: string;
  command: string;
  /** Spoken when the step completes. */
  doneText: string;
  /** Step is complete when any of these hold. Omit on the last step: it completes when the level is cleared. */
  doneWhen?: ScriptCond[];
}

export interface ScriptTutorial {
  /** Prefix of the terminal line announcing a step, e.g. `KIRO TUTORIAL`. */
  label?: string;
  agent: ScriptAgent;
  model: string;
  steps: TutorialStepSpec[];
  /** An enemy and its file stay out of sight until `revealWhen` holds. */
  hide?: { enemyId: string; node: string; model: string; revealWhen: ScriptCond };
  /** Printed when the player runs `tutorial skip`. */
  skipText?: string;
}

export interface ScriptBullying {
  /** Fire once the level has seen at least this many commands... */
  after: number;
  /** ...and then on every Nth command. */
  every: number;
  mood: ScriptMood;
  /** `{text}` is the line. */
  print: string;
  lines: Array<{ agent: ScriptAgent; text: string }>;
}

export interface ScriptCoreReaction {
  foe: { agent: ScriptAgent; model: string; text: string };
  kiro: string;
  /** Terminal banner; `{foe}`, `{kiro}`, `{gguf}` are filled in. */
  banner: string;
}

export interface ScriptKiro {
  /** `crack_only`: Kiro stands in the room only while cracking a lock here. */
  stage?: 'show' | 'crack_only' | 'hidden';
  /** With `show`: also hide Kiro while the intro runs, once the exit is open, or until a `spawn` step names him (`before_spawn`). */
  hideWhen?: Array<'intro' | 'exit_open' | 'before_spawn'>;
  label?: string;
  /** Replaces `label` once any of `cores` is loaded. */
  labelLoaded?: { cores: string[]; label: string };
  /** Kiro still runs the tiny core (`ps` and `kiro status` show it)... */
  weak?: boolean;
  /** ...until this core is loaded. */
  weakUntilCore?: string;
  /** Printed above `kiro status` while Kiro is weak. */
  weakNote?: string;
  /** Printed instead of loading when the player runs `kiro load` here. */
  loadRefusal?: string;
  /** Printed when a hub's `kiro_loaded` rule wants another core; `{core}` is the wanted one. */
  wrongCoreLine?: string;
  /** Other names that satisfy a wanted core, e.g. `{ "llama": ["mistral"] }`. */
  coreAliases?: Record<string, string[]>;
  /** Keyed by the `kiro_loaded` rule core. */
  reactions?: Record<string, ScriptCoreReaction>;
}

export interface LevelScript {
  /** Runs once when the player arrives. Omit it and the dialog `agentTaunt` plays as a smug cameo. */
  arrival?: ScriptStep[];
  /** Seconds the opening Vibecoder + Kiro conversation holds the terminal locked before Big Four taunt / battle begins (skippable via Skip Dialog). */
  openingSec?: number;
  /** Steps fired once by the level tick counter (`tick()`), each at its `afterSec`. */
  timed?: ScriptTimed[];
  /** Steps fired once per level load as soon as their condition `when` holds. */
  triggers?: ScriptTrigger[];
  /** Commands refused until a condition holds. */
  locks?: ScriptLock[];
  /** Name used by `hank` / `dad` here (default: the ally id). */
  allySpeaker?: string;
  /** No damage here and enemies hold fire (a tutorial). */
  safe?: boolean;
  /** Enemy ticks are frozen until this holds. */
  holdEnemiesUntil?: ScriptCond;
  /** Signal rewrites, e.g. `{ "SIGTERM": "SIGKILL" }`. */
  signalAliases?: Partial<Record<PosixSignal, PosixSignal>>;
  tutorial?: ScriptTutorial;
  bullying?: ScriptBullying;
  kiro?: ScriptKiro;
  /** Runs when the boss anchor process (PID 1) dies. `{boss}` in `print` is the boss name. */
  onBossKill?: ScriptStep[];
}

/** Hardware and cores the player already owns when a level is entered directly. Cumulative. */
export interface ChapterGrant {
  /** Applies when the start level index (1-based) is greater than this. */
  afterLevel: number;
  ram?: number;
  ssd?: number;
  /** Spare skill charges (VRAM modules) he already holds from this point on. */
  vram?: number;
  /** Open-weight core loaded into Kiro. The last matching grant wins. */
  core?: string;
  /** Items he owns from this point on (the tube transistor for a player who skips the level that gives it). */
  items?: ItemId[];
}

export interface ChapterOutro {
  /** Runs when the player types the final `exit`. `{rank}`, `{commands}`, `{scrap}`, `{scrapTotal}` are filled in. */
  finale?: ScriptStep[];
  caption: string;
  actors?: Array<{ id: string; model: string; label: string; x: number; y?: number } & SceneTransform>;
}
