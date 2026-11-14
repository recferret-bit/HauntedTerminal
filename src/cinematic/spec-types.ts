/**
 * Declarative vocabulary of an animated 3D Comix sequence (`comix/<slug>/`).
 *
 * Every comix lives in its own connected directory:
 *   - `comix/<slug>/comix.manifest.json` — identity, playback/skip policy, stage set, cast, shared cues, and ordered page index.
 *   - `comix/<slug>/pages/page-XX-<slug>/page.spec.json` — self-contained page config with its time window, local cues,
 *     page-turn transition, overlays, page tracks, and panels (each bundling layout, camera, lettering, beats, and tracks).
 *
 * The runtime in `src/cinematic/` names no comix, no page, and no scene. Adding a new spec capability is one change
 * in four places: `spec-types.ts` (type), `src/cinematic/` (interpreter), `src/comix-editor/schema.ts` (form),
 * and `src/comix-editor/check.ts` (validator).
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Named landmark in `manifest.stage.points`, or an inline `{ x, y, z }` world position. */
export type PointRef = string | Vec3;

/**
 * Timestamp expression in seconds:
 *   - `"12.5"` — absolute seconds from `0`
 *   - `"+0.4"` — offset from the enclosing panel's (or page's) `from` timestamp
 *   - `"STRIKE"`, `"STRIKE+0.35"`, `"WHITE-0.1"` — cue from `manifest.cues` or `page.cues`
 */
export type TimeExpr = string;

/** Page-fraction rectangle `[x, y, w, h]` inside `0..1`. */
export type Rect4 = [number, number, number, number];

export type EaseName = 'linear' | 'in' | 'out' | 'outBack';

/** Orthographic world-space box `(x, y)` centre + `(w, h)` size shown by a panel camera. */
export interface ShotBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SkipRule {
  before: TimeExpr;
  to: TimeExpr;
}

// ---- Stage & Cast (`comix.manifest.json`) -------------------------------------------------------------------------

export interface StagePropSpec {
  id: string;
  model: string;
  at: PointRef;
  scale?: number;
}

export type StageFixtureSpec =
  | {
      kind: 'rain';
      id: string;
      x: number;
      y: number;
      w: number;
      h: number;
      z: number;
      drops?: number;
    }
  | {
      kind: 'bolt';
      id: string;
      style: 'bolt' | 'comic';
      from: PointRef;
      to: PointRef;
      seed?: number;
    }
  | {
      kind: 'vortex';
      id: string;
      at: PointRef;
      z: number;
      w: number;
      h: number;
    };

export interface ComixStageSpec {
  room: string;
  background: string;
  clampToRoom?: boolean;
  points: Record<string, Vec3>;
  props?: StagePropSpec[];
  fixtures?: StageFixtureSpec[];
}

export interface ComixActorSpec {
  id: string;
  model: string;
  label?: string;
  at?: PointRef;
  scale?: number;
  rotationZ?: number;
  visible?: boolean;
  look?: [number, number];
}

export interface ComixPageSummary {
  index: number;
  id: string;
  title: string;
  from: number;
  until: number;
  panelCount: number;
  specPath: string;
}

export type ComixRole = 'opening' | 'ending' | 'interlude' | 'standalone';

export interface ComixManifest {
  id: string;
  title: string;
  subtitle: string;
  summary: string;
  role?: ComixRole;
  status: 'playable' | 'draft';
  durationSec: number;
  holdAtEnd?: boolean;
  acceptsKeyFrom?: TimeExpr;
  inputGraceMs?: number;
  skip: 'end' | SkipRule[];
  cues?: Record<string, number>;
  stage: ComixStageSpec;
  cast: ComixActorSpec[];
  pages: ComixPageSummary[];
}

// ---- Panel Camera, Lettering, Beats & Continuous Tracks (`page.spec.json`) ----------------------------------------

export interface PanelCameraSpec {
  from: ShotBox;
  to?: ShotBox;
  span?: [TimeExpr, TimeExpr];
  ease?: EaseName;
  portrait?: ShotBox;
}

export interface TierRowSpec {
  who: string;
  what: string;
  bg: string;
  glow: number;
}

export interface StatsLabelsSpec {
  rank: string;
  time: string;
  commands: string;
  shortcuts: string;
  press: string;
}

export type PanelLetter =
  | {
      kind: 'caption';
      text: string;
      from: TimeExpr;
      until?: TimeExpr;
      typeDur: number;
      mono?: boolean;
      position?: 'top' | 'bottom';
      maxWidth?: string;
    }
  | {
      kind: 'banner';
      text: string;
      at: TimeExpr;
      until?: TimeExpr;
      edge: 'top' | 'bottom';
    }
  | {
      kind: 'sfx';
      text: string;
      at: TimeExpr;
      hold: number;
      color: string;
      tilt: number;
      anchor: 'frac' | 'point';
      x?: number;
      y?: number;
      point?: PointRef;
      dx?: number;
      dy?: number;
      size: number;
      activePanelOnly?: boolean;
      freezeOnCut?: boolean;
    }
  | {
      kind: 'sfx_seq';
      words: string[];
      tilts: number[];
      from: TimeExpr;
      step: number;
      hold: number;
      lastHold?: number;
      color: string;
      point: PointRef;
      dx: number;
      dy: number;
      dxStep: number;
      dyStep: number;
      dxMod: number;
      dyMod: number;
      size: number;
      activePanelOnly?: boolean;
      freezeOnCut?: boolean;
    }
  | {
      kind: 'bubble';
      text: string;
      at: TimeExpr;
      until?: TimeExpr;
      style: 'speech' | 'shout' | 'thought';
      fill?: string;
      activePanelOnly?: boolean;
      freezeOnCut?: boolean;
      anchor: 'panel' | 'world';
      x: number;
      y: number;
      w?: number;
      wChars?: number;
      yFloor?: number;
      minXChars?: number;
      fontH: number;
      fontW: number;
      minFont: number;
      fontOfMin?: number;
      fontScale?: number;
      tailActor?: string;
      tailPoint?: PointRef;
      tailLift?: number;
      tailZ?: number;
      tailDx?: number;
      tailDy?: number;
    }
    | {
      kind: 'label_tag';
      text: string;
      at: TimeExpr;
      until?: TimeExpr;
      point: PointRef;
      activePanelOnly?: boolean;
      freezeOnCut?: boolean;
    }
  | {
      kind: 'prompt_list';
      title: string;
      baseCount: number;
      from: TimeExpr;
      every: number;
      items: string[];
    }
  | {
      kind: 'glitch_text';
      from: TimeExpr;
      step: number;
      texts: string[];
      jitter?: boolean;
    }
  | {
      kind: 'tier_stack';
      from: TimeExpr;
      step: number;
      rows: TierRowSpec[];
    }
  | {
      kind: 'panel_flash';
      at: TimeExpr;
      dur: number;
      opacity: number;
      fade?: number;
      fadeFrom?: number;
      hold?: boolean;
      activePanelOnly?: boolean;
    }
  | {
      kind: 'invert';
      at: TimeExpr;
      fromOffset: number;
      toOffset: number;
    }
  | {
      kind: 'stats_card';
      title: string;
      at: TimeExpr;
      keyAt: TimeExpr;
      rankColor: Record<string, string>;
      rankWord: Record<string, string>;
      labels: StatsLabelsSpec;
      emptyShortcuts: string;
      fallbackBackground: string;
    };

export type PageOverlay = {
  kind: 'title_card';
  at: TimeExpr;
  title: string;
  subtitle: string;
  typeFrom: TimeExpr;
  typeTo: TimeExpr;
  fadeFrom: TimeExpr;
  fadeTo: TimeExpr;
};

export type AudioCue = 'rain_on' | 'rain_off' | 'thunder' | 'distant_thunder' | 'burst' | 'shatter' | 'zap';

export type PanelBeat =
  | {
      kind: 'lightning';
      at: TimeExpr;
      point: PointRef;
      power: number;
      flash: number;
      audio?: 'distant' | 'thunder';
    }
  | {
      kind: 'fx';
      at: TimeExpr;
      preset: string;
      point: PointRef;
      offset?: Vec3;
      seed?: number;
      scale?: number;
      text?: string;
    }
  | {
      kind: 'fx_repeat';
      at: TimeExpr;
      step: number;
      count: number;
      preset: string;
      point: PointRef;
      offset?: Vec3;
      seed?: number;
      scale?: number;
    }
  | {
      kind: 'arc';
      at: TimeExpr;
      from: PointRef;
      to: PointRef;
      flash?: number;
    }
  | {
      kind: 'look';
      at: TimeExpr;
      actors: string[];
      x: number;
      y: number;
    }
  | {
      kind: 'state';
      at: TimeExpr;
      actors: string[];
      state: string;
    }
  | {
      kind: 'audio';
      at: TimeExpr;
      cue: AudioCue;
      seconds?: number;
      reverse?: boolean;
    }
  | {
      kind: 'key_clicks';
      from: TimeExpr;
      until: TimeExpr;
      hz: number;
      chance: number;
    };

export type SceneTrack =
  | {
      kind: 'actor_visibility';
      actor: string;
      from: TimeExpr;
      until?: TimeExpr;
      visible: boolean;
      hideWhenDead?: boolean;
    }
  | {
      kind: 'actor_motion';
      actor: string;
      from: TimeExpr;
      until?: TimeExpr;
      span?: [TimeExpr, TimeExpr];
      fromPos: PointRef;
      toPos?: PointRef;
      ease?: EaseName;
      steps?: number;
      arc?: number;
      scaleFrom?: number;
      scaleTo?: number;
      stretchFrom?: [number, number];
      stretchTo?: [number, number];
      rotZFrom?: number;
      rotZTo?: number;
      deform?: 'none' | 'stretch_to_target' | 'squash_land';
      hideWhenDead?: boolean;
    }
  | {
      kind: 'actor_rig';
      actor: string;
      from: TimeExpr;
      until?: TimeExpr;
      typing?: number;
      restRightArm?: boolean;
      hideParts?: string[];
    }
  | {
      kind: 'part_visibility';
      target: string;
      parts: string[];
      from: TimeExpr;
      until?: TimeExpr;
      visible: boolean;
    }
  | {
      kind: 'material_tint';
      target: string;
      zone: string;
      from: TimeExpr;
      until?: TimeExpr;
      color: string;
      glitchColors?: string[];
      glitchHz?: number;
    }
  | {
      kind: 'fixture';
      fixture: string;
      from: TimeExpr;
      until?: TimeExpr;
      growDur?: number;
      steps?: number;
      flickerHz?: number;
      flickerEvery?: number;
      flickerSkip?: number;
      settleAfter?: number;
    }
  | {
      kind: 'stage_light';
      anchor: PointRef;
      from: TimeExpr;
      until: TimeExpr;
      intensity: number;
      intensityTo?: number;
      ease?: 'linear' | 'quad' | 'in' | 'out';
      blinkHz?: number;
      blinkAmp?: number;
    }
  | {
      kind: 'camera_shake';
      from: TimeExpr;
      until: TimeExpr;
      amp: number;
      ampTo?: number;
    }
  | {
      kind: 'pixelate';
      from: TimeExpr;
      until: TimeExpr;
      sizeFrom: number;
      sizeTo: number;
      steps?: number;
      ease?: EaseName;
    };

export interface ComixPanelSpec {
  id: string;
  title: string;
  from: TimeExpr;
  until: TimeExpr;
  snapshotAt?: TimeExpr;
  layout: {
    landscape: Rect4;
    portrait: Rect4;
  };
  camera: PanelCameraSpec;
  letters?: PanelLetter[];
  beats?: PanelBeat[];
  tracks?: SceneTrack[];
}

export interface PageTurnSpec {
  from: TimeExpr;
  to: TimeExpr;
  ease: 'in' | 'quad';
}

export interface ComixPageSpec {
  id: string;
  index: number;
  title: string;
  summary: string;
  from: number;
  until: number;
  cues?: Record<string, number>;
  turn?: PageTurnSpec;
  overlays?: PageOverlay[];
  tracks?: SceneTrack[];
  panels: ComixPanelSpec[];
}

export interface ComixPack {
  manifest: ComixManifest;
  pages: ComixPageSpec[];
}
