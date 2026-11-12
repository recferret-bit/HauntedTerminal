import * as THREE from 'three';
import { createFxEmitter, FxCatalog, type FxEmitter, type FxPreset } from '../procgen/index.js';

/** Every shipped FX preset, as literals (the asset-usage harness counts quoted ids). */
export const FX_IDS = [
  'fx.hop',
  'fx.panel-smash',
  'fx.permission-denied',
  'fx.gate-open',
  'fx.reveal',
  'fx.rm-ash',
  'fx.touch-materialize',
  'fx.mv-dust',
  'fx.sigkill',
  'fx.sigstop-ice',
  'fx.sigterm-rage',
  'fx.fork-spawn',
  'fx.pickup-energy',
  'fx.pickup-ram',
  'fx.pickup-ssd',
  'fx.hit-hero',
  'fx.malware-hit',
  'fx.malware-death',
  'fx.devnull-suck',
  'fx.lightning-strike',
  'fx.flood-splash',
  'fx.door-unlock',
  'fx.coredump',
] as const;

export type FxId = (typeof FX_IDS)[number];

export interface FxHost {
  /** Group the effects are added to (drawn over actors). */
  layer: THREE.Group;
  shake(mul: number): void;
  flash(strength: number, at: THREE.Vector3): void;
  /**
   * The preset's onomatopoeia, drawn by the host outside the WebGL scene (crisp DOM lettering, no
   * post passes). When set, the emitter never draws its word; without it the canvas word is kept.
   */
  word?(preset: FxPreset, at: THREE.Vector3, text: string | undefined, opts: { mirror?: boolean; scale?: number }): void;
}

export interface FxPlayOptions {
  /** Replaces the preset's word (sanitised to the FX font: upper-case, at most 18 characters). */
  text?: string;
  /** Mirror the effect (an effect authored toward screen-right, played toward screen-left). */
  mirror?: boolean;
  /** Skip the preset's own shake (the caller already shook for this event). */
  noShake?: boolean;
  /** Scale of the whole effect. */
  scale?: number;
  /** Multiplies the preset's flash (storm strikes are dimmer than the intro). 0 = no flash. */
  flashMul?: number;
}

const GLYPHS = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?+-/.x()>_#% '.split(''));

/** Fit any string to the FX lettering: upper-case (a lower-case `x` before a digit stays), known glyphs, 18 chars. */
export function fxText(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === 'x' && /[0-9]/.test(text[i + 1] ?? '')) {
      out += 'x';
      continue;
    }
    const up = ch.toUpperCase();
    out += GLYPHS.has(up) ? up : ch === ':' || ch === ',' ? ' ' : '';
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, 18);
}

/** A pool of live `createFxEmitter` emissions, stepped and lit by the stage. */
export class FxPlayer {
  private readonly live: FxEmitter[] = [];
  private plays = 0;
  /** Every preset id played since construction (the dev self-check counts it). */
  readonly played = new Set<string>();
  /** Plays per preset id (the self-check uses it to catch doubled effects). */
  readonly counts = new Map<string, number>();
  /** Last play time per `id@key`, for de-duplicating double events. */
  private readonly recent = new Map<string, number>();
  clock = 0;

  constructor(private readonly host: FxHost) {}

  preset(id: FxId): FxPreset | null {
    return FxCatalog.has(id) ? FxCatalog.get(id) : null;
  }

  /**
   * Play `id` with its origin at `at` (world space). Pulled 0.5 toward the camera so it draws over
   * the actor plane. `dedupeKey`: a second play of the same id and key within 180 ms is skipped.
   */
  play(id: FxId, at: THREE.Vector3, opts: FxPlayOptions = {}, dedupeKey?: string): FxEmitter | null {
    const preset = this.preset(id);
    if (!preset || !Number.isFinite(at.x + at.y + at.z)) return null;
    if (dedupeKey !== undefined) {
      const k = `${id}@${dedupeKey}`;
      const last = this.recent.get(k);
      if (last !== undefined && this.clock - last < 180) return null;
      this.recent.set(k, this.clock);
    }
    // A blank text suppresses the word (the FX font has a blank space glyph).
    let text = opts.text === undefined ? undefined : opts.text.trim() === '' ? ' ' : fxText(opts.text) || undefined;
    if (preset.onomatopoeia && this.host.word) {
      if (text !== ' ') this.host.word(preset, at, text, { mirror: opts.mirror, scale: opts.scale });
      text = ' ';
    }
    const fx = createFxEmitter(preset, { seed: ++this.plays, text });
    fx.group.position.set(at.x, at.y, at.z - 0.5);
    const s = opts.scale ?? 1;
    fx.group.scale.set(opts.mirror ? -s : s, s, s);
    fx.group.renderOrder = 4;
    this.host.layer.add(fx.group);
    this.live.push(fx);
    this.played.add(id);
    this.counts.set(id, (this.counts.get(id) ?? 0) + 1);
    if (preset.shake && !opts.noShake) this.host.shake(preset.shake);
    const flash = (preset.flash ?? 0) * (opts.flashMul ?? 1);
    if (flash > 0) this.host.flash(flash, at);
    return fx;
  }

  get count(): number {
    return this.live.length;
  }

  update(dtMs: number, flashStrength: number, flashPos: THREE.Vector3): void {
    this.clock += dtMs;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const fx = this.live[i]!;
      fx.update(dtMs);
      for (const mat of fx.materials) {
        if (mat.uniforms.uFlash) mat.uniforms.uFlash.value = flashStrength;
        (mat.uniforms.uFlashPos?.value as THREE.Vector3 | undefined)?.copy(flashPos);
      }
      if (fx.done) {
        fx.dispose();
        this.live.splice(i, 1);
      }
    }
    if (this.recent.size > 64) this.recent.clear();
  }

  clear(): void {
    this.live.forEach((fx) => fx.dispose());
    this.live.length = 0;
  }
}
