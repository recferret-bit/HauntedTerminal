import type { KernelEvent } from '../contracts/events.js';
import type { OutroStats } from '../cinematic/index.js';
import type { Session } from '../game/session.js';
import type { GameSnapshot, TickResult } from '../game/types.js';
import type { ComicStage } from '../renderer/comic-stage.js';
import type { CodeEditor } from '../ui/code-editor.js';
import type { Hud } from '../ui/hud.js';
import type { Shell } from '../ui/terminal.js';
import type { TutorialCard } from '../ui/tutorial.js';

export const STORY = [
  '\x1b[1;93mHAUNTED TERMINAL\x1b[0m',
  'Midnight. Your AI agents decided they needed a pair of hands.',
  '\x1b[1;96mKRAKOOM.\x1b[0m They pulled you into your own machine and put you to work.',
  'Five floors of malware stand between you and the desk. A clean \x1b[1;93mexit\x1b[0m takes you home.',
  'Type \x1b[1;93mhelp\x1b[0m.  \x1b[2m? Hint if stuck. F2 dev panel, F8 shaders, F9 CRT, F10 pixel.\x1b[0m',
  '',
].join('\n');

export const FLOOR_NAMES: Record<number, string> = {
  1: 'The Storage Attic',
  2: 'The Firewall Crypt',
  3: 'The Mirror Bus Maze',
  4: 'The CPU Furnace',
  5: 'The Kernel Core',
};

/** How long a floor title card holds the clock and the keyboard. */
export const CARD_MS = 1600;

/** How long the welcome banner takes to type itself out after the terminal powers on. */
export const BANNER_MS = 520;

const SKIP_KEY = 'haunted.skipIntro';

export type Phase = 'boot' | 'intro' | 'play' | 'outro' | 'stats';
/** Every reason the game clock is stopped. Input is blocked for all of them except a hidden tab. */
export type PauseReason = 'intro' | 'card' | 'outro' | 'ended' | 'cinematic' | 'hidden' | 'reveal';

export type GiveItem = 'energy' | 'ram' | 'ssd';
/** Optional debug hook the game module may add; the dev panel enables its buttons only if present. */
export type DebugGive = (item: GiveItem, amount?: number) => TickResult | GameSnapshot;
/** Optional: end the floor-1 tutorial early. The "skip tutorial" link appears only if the session has it. */
export type SkipTutorial = () => TickResult | GameSnapshot | void;

export interface ShaderLab {
  toggle(): void;
  togglePixel(): boolean;
  toggleCrt(): boolean;
}

export interface PlayDom {
  mount: HTMLElement;
  stageWrap: HTMLElement;
  termDockEl: HTMLElement | null;
  editorPaneEl: HTMLElement | null;
  termEl: HTMLElement;
  inspectorEl: HTMLElement;
  toggleBtn: HTMLElement;
  hudEl: HTMLElement;
  statsEl: HTMLElement;
  captionEl: HTMLElement;
  cineEl: HTMLElement;
  mastheadSubEl: HTMLElement | null;
}

export function readSkipPref(): boolean {
  const params = new URLSearchParams(location.search);
  if (params.has('nointro') || params.get('skipIntro') === '1') return true;
  try {
    return sessionStorage.getItem(SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSkipPref(on: boolean): void {
  try {
    sessionStorage.setItem(SKIP_KEY, on ? '1' : '0');
  } catch { /* storage blocked: remembered in memory only */ }
}

export class Play {
  phase: Phase = 'boot';
  reasons = new Set<PauseReason>(['intro']);
  cardTimer = 0;
  endingStarted = false;
  /** FLOOR_ENTERED that arrived while the intro was running; shown once it ends. */
  stashedFloorCard: Extract<KernelEvent, { type: 'FLOOR_ENTERED' }> | null = null;
  hud: Hud | null = null;
  codeEditor: CodeEditor | null = null;
  /** Every event the session produced, newest last (capped). The chapter editor reads it through `__game.events()`. */
  eventLog: KernelEvent[] = [];
  /** While a typed command runs, agent taunts are appended after its output instead of printed above it. */
  execTaunts: string[] | null = null;
  shell!: Shell;
  tutorial!: TutorialCard;
  lab!: ShaderLab;

  syncPause!: () => void;
  paint!: (snap: GameSnapshot) => void;
  apply!: (events: KernelEvent[], snap: GameSnapshot, printed?: string) => void;
  applyTick!: (res: TickResult) => void;
  runCinematic!: (show: () => Promise<void>) => Promise<void>;
  beginEnding!: (stats: OutroStats | null) => void;
  startRun!: () => Promise<void>;

  constructor(
    readonly dom: PlayDom,
    readonly stage: ComicStage,
    readonly session: Session,
    readonly activeBanner: string,
    readonly debugGive: DebugGive | undefined,
    readonly skipTutorial: SkipTutorial | undefined,
    public skipIntroPref: boolean,
  ) {
    if (document.hidden) this.reasons.add('hidden');
    session.setPaused(true);
  }
}
