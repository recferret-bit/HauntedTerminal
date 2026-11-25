import { SOUND_PREF_KEY } from '../contracts/brand.js';

/** What the player chose for sound, kept between visits. Spec: .kiro/specs/esc-menu-hud-rework/ (D5). */
export interface SoundPref {
  muted: boolean;
  /** Master volume of the in-game sounds, 0 to 1. */
  volume: number;
}

/** The part of `Storage` this file uses, so a test can pass a plain object. */
export interface PrefStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_SOUND_PREF: SoundPref = { muted: false, volume: 1 };

export function clampVolume(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
}

/** Storage is untrusted: anything that is not `{muted: boolean, volume: number}` is treated as absent. */
function parsePref(raw: string | null): SoundPref | null {
  if (raw === null) return null;
  const v: unknown = JSON.parse(raw);
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.muted !== 'boolean' || typeof o.volume !== 'number' || !Number.isFinite(o.volume)) return null;
  return { muted: o.muted, volume: clampVolume(o.volume) };
}

function defaultStore(): PrefStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The saved choice, or null (nothing saved, bad data, or storage blocked). Never throws. */
export function readSoundPref(store: PrefStore | null = defaultStore()): SoundPref | null {
  try {
    return store ? parsePref(store.getItem(SOUND_PREF_KEY)) : null;
  } catch {
    return null;
  }
}

/** Saves the choice. Returns false when storage is blocked or full (the choice then lives in memory only). */
export function writeSoundPref(pref: SoundPref, store: PrefStore | null = defaultStore()): boolean {
  try {
    if (!store) return false;
    store.setItem(SOUND_PREF_KEY, JSON.stringify({ muted: pref.muted, volume: clampVolume(pref.volume) }));
    return true;
  } catch {
    return false;
  }
}
