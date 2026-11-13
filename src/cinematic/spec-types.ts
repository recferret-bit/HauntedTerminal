/**
 * Vocabulary of a cinematic comix (`comix/<id>/`). The player in this folder interprets it.
 * A new kind is added here, interpreted once, and given a form in `src/comix-editor/schema.ts`.
 * Times are mark expressions: a mark name (`STRIKE`), a sum (`STRIKE+0.35`, `WHITE-0.1`) or a number (`1.5`).
 */

export type MarkExpr = string;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Shot {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SkipRule {
  before: MarkExpr;
  to: MarkExpr;
}

export interface ComixManifest {
  id: string;
  title: string;
  room: string;
  background: string;
  pageCount: number;
  end: MarkExpr;
  holdAtEnd?: boolean;
  /** `"end"` resolves immediately. A list jumps to the first `to` whose `before` is still ahead; otherwise time stays. */
  skip: 'end' | SkipRule[];
  acceptsKeyFrom?: MarkExpr;
  inputGraceMs?: number;
  hero?: string;
  /** Extra stills, taken only while that panel is the live one. */
  keyframes?: Array<{ panel: string; at: MarkExpr }>;
}

export interface CastActor {
  id: string;
  model: string;
  name?: string;
  role?: 'hero' | 'agent';
  /** Starting look (x, y) passed to the animator. */
  look?: [number, number];
  /** Seated at this point. */
  home?: string;
  inX?: number;
  to?: [number, number];
  scale?: number;
  mock?: string;
  order?: number;
  slot?: number;
  /** Named point the outro flings this actor toward. */
  fling?: string;
}

export interface CastSpec {
  actors: CastActor[];
}

export interface SetSpec {
  points: Record<string, Vec3>;
  monitor?: { x: number; y: number; w: number; h: number };
  props?: Array<{ id: string; model: string; at: string }>;
  parts?: {
    glass?: string;
    code?: string[];
    screen?: string;
    glassMaterial?: string;
    amberMaterial?: string;
  };
  rain?: { x: number; y: number; w: number; h: number; z: number } | null;
  bolts?: Array<{ id: string; from: Vec3; to: Vec3; style?: 'bolt' | 'comic'; seed?: number }>;
  vortex?: { at: string; z: number; inset: number } | null;
}

export interface PanelSpec {
  id: string;
  landscape: [number, number, number, number];
  portrait: [number, number, number, number];
  /** When this panel becomes the live one. */
  at: MarkExpr;
}

export interface PageFile {
  page: number;
  panels: PanelSpec[];
}

export interface CaptionLetter {
  kind: 'caption';
  panel: string;
  text: string;
  from: MarkExpr;
  /** Seconds spent typing the line (absolute end is `from` + this). */
  typeFor: number;
  mono?: boolean;
  anchor?: 'bottom';
  maxWidth?: string;
}

export interface MemeLetter {
  kind: 'meme';
  panel: string;
  text: string;
  at: MarkExpr;
  edge: 'top' | 'bottom';
}

export interface SfxLetter {
  kind: 'sfx';
  panel: string;
  text: string;
  at: MarkExpr;
  hold: number;
  color: string;
  tilt: number;
  /** Draw only while this panel is current; `keep` freezes the last place on other panels. */
  only?: string;
  keep?: boolean;
  place:
    | { mode: 'frac'; x: number; y: number; size: number }
    | { mode: 'point'; point: string; dx: number; dy: number; size: number };
}

/** Several onomatopoeia. Offset is `dx + (i % dxMod) * dxStep` (same for y). */
export interface SfxBurstLetter {
  kind: 'sfx_burst';
  panel: string;
  words: string[];
  from: MarkExpr;
  step: number;
  hold: number;
  lastHold?: number;
  color: string;
  tilts: number[];
  point: string;
  dx: number;
  dy: number;
  dxStep: number;
  dyStep: number;
  dxMod: number;
  dyMod: number;
  size: number;
  only?: string;
  keep?: boolean;
}

export interface BubbleLetter {
  kind: 'bubble';
  panel: string;
  text: string;
  at: MarkExpr;
  until?: MarkExpr;
  style: 'speech' | 'shout' | 'thought';
  fill?: string;
  only?: string;
  place:
    | {
        mode: 'frac';
        x: number;
        y: number;
        w: number;
        fontH: number;
        fontW: number;
        minFont: number;
        /** When set, font = max(minFont, min(panel) * fontOfMin) instead of min(h*fontH, w*fontW). */
        fontOfMin?: number;
        /** cy = max(h * y, fontPx * yFloor). Otherwise cy = h * y. */
        yFloor?: number;
        /** width = min(w * w, fontPx * wChars). Otherwise width = w * w. */
        wChars?: number;
        tail: string;
        tailLift: number;
        tailZ: number;
        /** `live` aims the tail at the actor's group. `point` aims at a named point (or the actor home). */
        tailFrom?: 'live' | 'point';
        tailPoint?: string;
      }
    | {
        mode: 'follow';
        actor: string;
        lift: number;
        z: number;
        x: number;
        y: number;
        wChars: number;
        fontScale: number;
        tailDx: number;
        tailDy: number;
        minXChars: number;
        fontH: number;
        fontW: number;
        minFont: number;
      };
}

/** One speech bubble per cast agent, laid out by `slot`. */
export interface CastBubblesLetter {
  kind: 'cast_bubbles';
  panel: string;
  at: MarkExpr;
  step: MarkExpr;
  until: MarkExpr;
  width: number;
  x0: number;
  xStep: number;
  yEven: number;
  yOdd: number;
  fontH: number;
  fontW: number;
  minFont: number;
  headLift: number;
}

export interface QueueLetter {
  kind: 'queue';
  panel: string;
  title: string;
  base: number;
  from: MarkExpr;
  every: number;
  prompts: string[];
}

export interface TagsLetter {
  kind: 'tags';
  panel: string;
  from: MarkExpr;
  step: number;
  dy: number;
  z: number;
}

export interface LinesLetter {
  kind: 'lines';
  panel: string;
  from: MarkExpr;
  step: number;
  texts: string[];
  jitter?: boolean;
}

export interface BrainRow {
  who: string;
  what: string;
  bg: string;
  glow: number;
}

export interface BrainLetter {
  kind: 'brain';
  panel: string;
  from: MarkExpr;
  step: number;
  rows: BrainRow[];
}

export interface CardLetter {
  kind: 'card';
  at: MarkExpr;
  title: string;
  path: string;
  typeFrom: MarkExpr;
  typeTo: MarkExpr;
  fadeFrom: MarkExpr;
  fadeTo: MarkExpr;
}

export interface PageTurnLetter {
  kind: 'page_turn';
  page: number;
  from: MarkExpr;
  to: MarkExpr;
  /** `in` uses easeIn; `quad` uses t*t. Both are stepped by 8. */
  ease: 'in' | 'quad';
}

export interface PanelFlashLetter {
  kind: 'panel_flash';
  panel: string;
  at: MarkExpr;
  dur: number;
  opacity: number;
  /** After `dur`, fade this extra span from `opacity` (or 0.55 of it) down to 0. */
  fade?: number;
  fadeFrom?: number;
  /** Once `at` is reached, opacity stays at max(span(at, at+dur), opacity) instead of cutting. */
  hold?: boolean;
  only?: string;
}

export interface InvertLetter {
  kind: 'invert';
  panel: string;
  at: MarkExpr;
  from: number;
  to: number;
}

export type Letter =
  | CaptionLetter
  | MemeLetter
  | SfxLetter
  | SfxBurstLetter
  | BubbleLetter
  | CastBubblesLetter
  | QueueLetter
  | TagsLetter
  | LinesLetter
  | BrainLetter
  | CardLetter
  | PageTurnLetter
  | PanelFlashLetter
  | InvertLetter;

export interface SplashSpec {
  panel: string;
  title: string;
  at: MarkExpr;
  keyAt: MarkExpr;
  caption: { text: string; from: MarkExpr; typeFor: number };
  rankColor: Record<string, string>;
  rankWord: Record<string, string>;
  labels: { rank: string; time: string; commands: string; shortcuts: string; press: string };
  emptyShortcuts: string;
  fallbackBackground: string;
}

export type Beat =
  | { kind: 'lightning'; at: MarkExpr; point: string | Vec3; power: number; flash: number; audio?: 'thunder' | 'distant' }
  | { kind: 'fx'; at: MarkExpr; preset: string; point: string; z?: number; dy?: number; seed: number; scale?: number; text?: string }
  | { kind: 'fx_repeat'; at: MarkExpr; step: number; count: number; preset: string; point: string; z?: number; seed: number; scale?: number }
  | { kind: 'look'; at: MarkExpr; actor?: string; role?: 'hero' | 'agent'; x: number; y: number }
  | { kind: 'audio'; at: MarkExpr; cue: 'rain_on' | 'rain_off' | 'thunder' | 'burst' | 'shatter' | 'zap'; seconds?: number; reverse?: boolean }
  | { kind: 'state'; at: MarkExpr; actor: string; state: string }
  | { kind: 'arcs'; at: MarkExpr; step: number; count: number; y: number; z: number; flash: number }
  | { kind: 'keys'; from: MarkExpr; until: MarkExpr; hz: number; chance: number }
  | { kind: 'shatter_cast'; at: MarkExpr; fxFirst: string; fxRest: string; seed: number; scale: number; lift: number; z: number };

export type EaseName = 'linear' | 'in' | 'out' | 'outBack';

export interface ShotTrack {
  panel: string;
  from: Shot;
  to?: Shot;
  span?: [MarkExpr, MarkExpr];
  ease?: EaseName;
  /** Splash panel: choose by the panel's own aspect (taller than wide). */
  portrait?: Shot;
  landscape?: Shot;
}

export interface ShakeWindow {
  at: MarkExpr;
  dur: number;
  amp: number;
}

export type PoseProgram =
  | { kind: 'seated'; actor: string; typingUntil: MarkExpr; typingMidUntil?: MarkExpr; typingMid?: number; lantern?: boolean }
  | {
      kind: 'suck';
      actor: string;
      from: MarkExpr;
      to: MarkExpr;
      hideAt: MarkExpr;
      target: string;
      home: string;
      recoilAt?: MarkExpr;
      recoilDur?: number;
      steps: number;
    }
  | { kind: 'rain'; until: MarkExpr }
  | {
      kind: 'monitor';
      hideGlassAt: MarkExpr;
      hideCodeAt: MarkExpr;
      vortexFrom: MarkExpr;
      vortexUntil: MarkExpr;
      grow: number;
      steps: number;
      amberAt: MarkExpr;
      amberOn: string;
      amberOff: string;
      glitch: Array<[MarkExpr, MarkExpr]>;
      glitchHz: number;
      glitchColors: string[];
    }
  | {
      kind: 'emerge';
      showFrom: MarkExpr;
      hideAt: MarkExpr;
      wakeAt: MarkExpr;
      wakeDur: number;
      riseAt: MarkExpr;
      riseDur: number;
      stagger: number;
      leanFrom: MarkExpr;
      leanTo: MarkExpr;
      inScale: number;
      awakeScale: number;
      awakeSteps: number;
      inZ: number;
      outZ: number;
      riseSteps: number;
      slump: number;
    }
  | { kind: 'flight'; actor: string; from: MarkExpr; to: MarkExpr; origin: string; dest: string; arc: number; steps: number; originDy: number }
  | {
      kind: 'fling';
      from: MarkExpr;
      to: MarkExpr;
      stagger: number;
      origin: string;
      originDy: number;
      scale: number;
      steps: number;
      hideAt: MarkExpr;
      z: number;
    }
  | { kind: 'screen_blaze'; until: MarkExpr; anchor: string; calm: number; blinkUntil: MarkExpr; blinkHz: number; blinkBase: number; blinkAmp: number }
  | { kind: 'bolt_flicker'; id: string; at: MarkExpr; dur: number; hz: number; every: number; skip: number; settleAfter?: number }
  | { kind: 'shake'; windows: ShakeWindow[]; pull?: { from: MarkExpr; until: MarkExpr; base: number; gain: number; spanFrom: MarkExpr; spanTo: MarkExpr } }
  | {
      kind: 'stage_flash';
      anchor: string;
      rules: Array<{ from: MarkExpr; until?: MarkExpr; dur?: number; amp?: number; hz?: number; add?: number; pull?: boolean; pullGain?: number }>;
    }
  | { kind: 'pixelate'; from: MarkExpr; to: MarkExpr; base: number; gain: number; steps: number };

export interface PosesSpec {
  programs: PoseProgram[];
}

/** One comix folder, assembled from its spec files. */
export interface ComixPack {
  id: string;
  manifest: ComixManifest;
  marks: Record<string, number>;
  cast: CastSpec;
  set: SetSpec;
  pages: PageFile[];
  letters: Letter[];
  beats: Beat[];
  camera: ShotTrack[];
  poses: PosesSpec;
  splash?: SplashSpec;
}
