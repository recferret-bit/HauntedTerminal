import type { SfxId } from './catalog.js';

export interface SfxTrimWindow {
  offset: number;
  duration?: number;
}

/** One-shot cues capped to `TYPING_SOUND_SOURCES` simultaneous voices. */
export const TYPING_SFX: ReadonlySet<SfxId> = new Set<SfxId>([
  'key_press',
  'key_press_2',
  'key_press_3',
  'key_backspace',
  'key_backspace_2',
  'key_enter',
  'tab_complete',
]);

/** Rapid-typing cues rate-limited to `TYPING_MIN_INTERVAL_MS`. `key_enter` and `tab_complete` always play. */
export const THROTTLED_TYPING_SFX: ReadonlySet<SfxId> = new Set<SfxId>([
  'key_press',
  'key_press_2',
  'key_press_3',
  'key_backspace',
  'key_backspace_2',
]);

export const KEY_VARIANTS: Partial<Record<SfxId, readonly SfxId[]>> = {
  key_press: ['key_press', 'key_press_2', 'key_press_3'],
  key_backspace: ['key_backspace', 'key_backspace_2'],
  bat_wings: ['bat_wings'],
};

export const TAUNT_VARIANTS: Partial<Record<SfxId, readonly SfxId[]>> = {
  taunt_antigravy_1: ['taunt_antigravy_1', 'taunt_antigravy_2', 'taunt_antigravy_3', 'taunt_antigravy_4', 'taunt_antigravy_5', 'taunt_antigravy_6', 'taunt_antigravy_7', 'taunt_antigravy_8', 'taunt_antigravy_9', 'taunt_antigravy_10'],
  taunt_codec_1: ['taunt_codec_1', 'taunt_codec_2', 'taunt_codec_3', 'taunt_codec_4', 'taunt_codec_5', 'taunt_codec_6', 'taunt_codec_7', 'taunt_codec_8', 'taunt_codec_9', 'taunt_codec_10'],
  taunt_gork_1: ['taunt_gork_1', 'taunt_gork_2', 'taunt_gork_3', 'taunt_gork_4', 'taunt_gork_5', 'taunt_gork_6', 'taunt_gork_7', 'taunt_gork_8', 'taunt_gork_9', 'taunt_gork_10'],
  taunt_clod_1: ['taunt_clod_1', 'taunt_clod_2', 'taunt_clod_3', 'taunt_clod_4', 'taunt_clod_5', 'taunt_clod_6', 'taunt_clod_7', 'taunt_clod_8', 'taunt_clod_9', 'taunt_clod_10'],
  kiro_advice: ['kiro_advice', 'kiro_advice_2', 'kiro_advice_3', 'kiro_advice_4', 'kiro_advice_5', 'kiro_advice_6', 'kiro_advice_7', 'kiro_advice_8', 'kiro_advice_9', 'kiro_advice_10'],
  dad_cheer: ['dad_cheer', 'dad_cheer_2', 'dad_cheer_3', 'dad_cheer_4', 'dad_cheer_5', 'dad_cheer_6', 'dad_cheer_7', 'dad_cheer_8', 'dad_cheer_9', 'dad_cheer_10'],
};

export const SPEECH_SFX: ReadonlySet<SfxId> = new Set<SfxId>([
  'dialog_hero',
  ...Object.values(TAUNT_VARIANTS).flatMap((v) => v ?? []),
]);

export const KEY_RATES = [1.0, 1.045, 0.96, 1.02, 0.975, 1.06, 0.945] as const;
export const KEY_GAINS = [0.9, 0.84, 0.94, 0.87, 0.92] as const;
export const DEFAULT_LOOP_GAIN = 0.35;

/** Loop gain per cue (default 0.35): ambience sits under the music and the voices. */
export const LOOP_GAINS: Partial<Record<SfxId, number>> = {
  rain_loop: 0.22,
  lap_fan: 0.28,
  dad_typing_loop: 0.16,
  dad_rig_loop: 0.03,
};

export const LOOP_CUE_IDS: readonly SfxId[] = [
  'rain_loop',
  'lap_fan',
  'dad_typing_loop',
  'dad_rig_loop',
  'low_hp_loop',
  'pickup_hover',
] as const;

/** Seamless single-file ambient loops played via `playBed` overlap crossfade so MP3 padding never clicks at the seam. */
export const CROSSFADE_LOOPS: ReadonlySet<SfxId> = new Set<SfxId>(['dad_rig_loop']);

export interface LoopAccentSpec {
  readonly cues: readonly SfxId[];
  readonly minIntervalMs: number;
  readonly maxIntervalMs: number;
  readonly gain: number;
  readonly rateJitter: number;
}

/** Random-interval one-shot accents that fire softly while an ambient loop is active. */
export const LOOP_ACCENTS: Partial<Record<SfxId, LoopAccentSpec>> = {
  dad_rig_loop: {
    cues: [
      'dad_rig_beep', 'dad_rig_beep_2', 'dad_rig_beep_3',
      'dad_rig_spark', 'dad_rig_spark_2', 'dad_rig_spark_3',
    ],
    minIntervalMs: 2200,
    maxIntervalMs: 6500,
    gain: 0.08,
    rateJitter: 0.08,
  },
};

/** Active windows (seconds) trimmed from leading and trailing silence so keystrokes and dialog voices fire at 0ms latency. */
export const SFX_TRIM: Partial<Record<SfxId, SfxTrimWindow>> = {
  key_press: { offset: 0.105, duration: 0.215 },
  key_press_2: { offset: 0.098, duration: 0.185 },
  key_press_3: { offset: 0.045, duration: 0.28 },
  key_backspace: { offset: 0.085, duration: 0.22 },
  key_backspace_2: { offset: 0.085, duration: 0.15 },
  kiro_advice: { offset: 0.067, duration: 1.68 },
  kiro_advice_2: { offset: 0.059, duration: 2.57 },
  kiro_advice_3: { offset: 0.128, duration: 2.4 },
  kiro_advice_4: { offset: 0.05, duration: 2.92 },
  kiro_advice_5: { offset: 0.047, duration: 3.02 },
  kiro_advice_6: { offset: 0.092, duration: 2.33 },
  kiro_advice_7: { offset: 0.051, duration: 2.26 },
  kiro_advice_8: { offset: 0.054, duration: 2.43 },
  kiro_advice_9: { offset: 0.083, duration: 3.18 },
  kiro_advice_10: { offset: 0.053, duration: 2.31 },
  taunt_antigravy_1: { offset: 0.075, duration: 3.45 },
  taunt_antigravy_2: { offset: 0, duration: 2.69 },
  taunt_antigravy_3: { offset: 0.064, duration: 2.5 },
  taunt_antigravy_4: { offset: 0.079, duration: 3.67 },
  taunt_antigravy_5: { offset: 0.029, duration: 3.1 },
  taunt_antigravy_6: { offset: 0.058, duration: 2.4 },
  taunt_antigravy_7: { offset: 0.064, duration: 2.96 },
  taunt_antigravy_8: { offset: 0.088, duration: 3.48 },
  taunt_antigravy_9: { offset: 0.137, duration: 2.47 },
  taunt_antigravy_10: { offset: 0.063, duration: 3.19 },
  taunt_codec_1: { offset: 0.052, duration: 2.3 },
  taunt_codec_2: { offset: 0.072, duration: 3.32 },
  taunt_codec_3: { offset: 0.141, duration: 2.05 },
  taunt_codec_4: { offset: 0.08, duration: 2.04 },
  taunt_codec_5: { offset: 0.125, duration: 3.2 },
  taunt_codec_6: { offset: 0.084, duration: 3.81 },
  taunt_codec_7: { offset: 0.073, duration: 2.17 },
  taunt_codec_8: { offset: 0.047, duration: 2.95 },
  taunt_codec_9: { offset: 0.081, duration: 2.39 },
  taunt_codec_10: { offset: 0.112, duration: 2.31 },
  taunt_gork_1: { offset: 0.032, duration: 3.29 },
  taunt_gork_2: { offset: 0.115, duration: 3.24 },
  taunt_gork_3: { offset: 0.066, duration: 2.28 },
  taunt_gork_4: { offset: 0.085, duration: 3.31 },
  taunt_gork_5: { offset: 0.097, duration: 3.5 },
  taunt_gork_6: { offset: 0.079, duration: 2.19 },
  taunt_gork_7: { offset: 0.042, duration: 2.82 },
  taunt_gork_8: { offset: 0.088, duration: 3 },
  taunt_gork_9: { offset: 0.109, duration: 2.42 },
  taunt_gork_10: { offset: 0.051, duration: 2.85 },
  taunt_clod_1: { offset: 0.083, duration: 2.88 },
  taunt_clod_2: { offset: 0.067, duration: 2.94 },
  taunt_clod_3: { offset: 0.12, duration: 2.66 },
  taunt_clod_4: { offset: 0.074, duration: 3.26 },
  taunt_clod_5: { offset: 0.102, duration: 2.17 },
  taunt_clod_6: { offset: 0.103, duration: 3.53 },
  taunt_clod_7: { offset: 0.09, duration: 3.01 },
  taunt_clod_8: { offset: 0.13, duration: 2.12 },
  taunt_clod_9: { offset: 0.079, duration: 3.76 },
  taunt_clod_10: { offset: 0.092, duration: 3.47 },
};
