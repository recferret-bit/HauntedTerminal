import { FLOOR_THEMES, ZONES } from '../core/palette.js';
import { FX_MOMENT_WORDS } from './catalog.js';
import { FX_WORD_DEFAULT_SIZE, FX_WORD_MAX_CHARS, fxLayoutWord, fxWordUnsupported } from './lettering.js';
import { fxShapeSoup } from './shapes.js';
import { fxEvaluate, fxSpawn, fxStepMs } from './simulate.js';
import { FX_LIMITS, fxDeltaE, type FxAdd, type FxIssue } from './validate-core.js';
import type { FxLayer, FxPreset } from './types.js';

const L = FX_LIMITS;

export type Bounds = [number, number, number, number];

/** Primary vs secondary / accent separation, and primary vs floor backdrops. Returns the lowest primary/secondary ΔE, or -1. */
export function checkColors(validLayers: FxLayer[], add: FxAdd): number {
  const zoneColor = (l: FxLayer): number => ZONES[l.zone].color;
  let deltaE = -1;
  const seen = new Set<string>();
  for (const p of validLayers.filter((l) => l.role === 'primary')) {
    for (const other of validLayers) {
      if (other.role === 'primary') continue;
      const d = fxDeltaE(zoneColor(p), zoneColor(other));
      const key = `${p.zone}/${other.zone}/${other.role}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (other.role === 'secondary') {
        deltaE = deltaE < 0 ? d : Math.min(deltaE, d);
        if (d < L.minDeltaE) {
          add('error', 'FX_COLOR_SEPARATION', `primary \`${p.zone}\` and secondary \`${other.zone}\` are ΔE ${d.toFixed(1)} apart (min ${L.minDeltaE}): they will read as one colour`, other.name);
        }
      } else if (d < L.minDeltaE) {
        add('warning', 'FX_COLOR_SEPARATION', `accent \`${other.zone}\` is ΔE ${d.toFixed(1)} from primary \`${p.zone}\`: an accent that matches the mass is not an accent`, other.name);
      }
    }
    // `ink` chunks carry a paper keyline, so they are exempt.
    if (p.zone === 'ink') continue;
    for (const [floor, theme] of Object.entries(FLOOR_THEMES)) {
      const d = fxDeltaE(zoneColor(p), theme.bg);
      if (d < L.minBackgroundDeltaE) {
        add('warning', 'FX_BG_CONTRAST', `primary \`${p.zone}\` is ΔE ${d.toFixed(1)} from the floor ${floor} backdrop (min ${L.minBackgroundDeltaE}): the effect vanishes there`, p.name);
      }
    }
  }
  return deltaE;
}

export function checkBudget(layerCount: number, instances: number, triangles: number, vibecoderShapePx: number, add: FxAdd): void {
  if (instances > L.maxInstances) add('error', 'FX_BUDGET', `${instances} particles (max ${L.maxInstances}): a comic hit is a few big shapes, not a fountain`);
  if (triangles > L.maxTriangles) add('error', 'FX_BUDGET', `${triangles} triangles (max ${L.maxTriangles})`);
  if (layerCount > 0 && vibecoderShapePx < L.minVibecoderShapePx) {
    add('warning', 'FX_NO_BIG_SHAPE', `the largest chunk is ${vibecoderShapePx.toFixed(0)} px (want one of at least ${L.minVibecoderShapePx} px): specks alone do not read as a hit`);
  }
}

export function checkTime(preset: FxPreset, lastParticleMs: number, add: FxAdd): void {
  const [dMin, dMax] = preset.loop ? L.loopMs : L.popMs;
  if (!(preset.durationMs >= dMin && preset.durationMs <= dMax)) {
    add('error', 'FX_DURATION', `durationMs ${preset.durationMs} is outside ${dMin}..${dMax} for ${preset.loop ? 'a looping' : 'a one-shot'} effect`);
  }
  const fps = preset.stepFps ?? 12;
  if (!(fps >= L.stepFps[0] && fps <= L.stepFps[1])) {
    add('error', 'FX_STEPPED', `stepFps ${fps} is outside ${L.stepFps[0]}..${L.stepFps[1]}: animate on twos (12), never smooth`);
  }
  if (lastParticleMs > preset.durationMs + 1e-6) {
    add('error', 'FX_LINGER', `particles can live until ${lastParticleMs.toFixed(0)} ms, past durationMs ${preset.durationMs}`);
  }
}

/** Grow `bounds` by every particle of one simulated frame. */
function growBounds(bounds: Bounds, preset: FxPreset, t: number, spawns: ReturnType<typeof fxSpawn>): void {
  for (const p of fxEvaluate(preset, spawns, t)) {
    const soup = fxShapeSoup(preset.layers[p.layer]!.shape);
    const r = (Math.hypot(soup.size[0], soup.size[1]) / 2) * p.scale;
    bounds[0] = Math.min(bounds[0], p.x - r); bounds[1] = Math.min(bounds[1], p.y - r);
    bounds[2] = Math.max(bounds[2], p.x + r); bounds[3] = Math.max(bounds[3], p.y + r);
  }
}

function checkExtent(preset: FxPreset, bounds: Bounds, add: FxAdd): void {
  if (!Number.isFinite(bounds[0])) {
    add('error', 'FX_EXTENT', 'no particle is ever visible');
    return;
  }
  const w = bounds[2] - bounds[0], h = bounds[3] - bounds[1];
  const [maxW, maxH] = preset.fullPanel ? L.maxFullPanelExtent : L.maxExtent;
  if (w > maxW || h > maxH) {
    add('error', 'FX_EXTENT', `covers ${w.toFixed(1)} x ${h.toFixed(1)} units (max ${maxW} x ${maxH}${preset.fullPanel ? '' : '; set fullPanel if it is meant to fill the panel'})`);
  }
  if (Math.max(w, h) < L.minExtent) add('warning', 'FX_EXTENT', `covers only ${w.toFixed(2)} x ${h.toFixed(2)} units: too small to notice`);
}

/**
 * Simulated bounds, plus a second opinion on the first frame and on lingering particles.
 * Skipped when the effect is already structurally broken. Returns [0,0,0,0] when nothing was measured.
 */
export function checkSimulation(preset: FxPreset, issues: readonly FxIssue[], add: FxAdd): Bounds {
  const bounds: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const structurallySound = !issues.some((i) => i.code === 'FX_KEYS' || i.code === 'FX_EMIT' || i.code === 'FX_ZONE') && preset.durationMs > 0;
  if (structurallySound) {
    for (const seed of [1, 2]) {
      const spawns = fxSpawn(preset, seed);
      const step = fxStepMs(preset);
      for (let t = 0; t < preset.durationMs; t += step) growBounds(bounds, preset, t, spawns);
      if (fxEvaluate(preset, spawns, 0).length === 0 && !issues.some((i) => i.code === 'FX_NO_POP')) {
        add('error', 'FX_NO_POP', 'nothing is visible on the first frame: the hit must land the moment the event fires (give one layer no delay)');
      }
      // Time is stepped, so look at the first drawn frame at or after durationMs.
      const after = Math.ceil(preset.durationMs / step - 1e-6) * step;
      if (!preset.loop && fxEvaluate(preset, spawns, after).length > 0 && !issues.some((i) => i.code === 'FX_LINGER')) {
        add('error', 'FX_LINGER', `particles are still alive at durationMs ${preset.durationMs}`);
      }
    }
    checkExtent(preset, bounds, add);
  }
  if (!Number.isFinite(bounds[0])) bounds.fill(0);
  return bounds;
}

function checkWordText(text: string, add: FxAdd): string[] {
  // A lower-case x is the multiplier sign (`x3`), the one lower-case letter comics allow.
  const shouted = text.replace(/x(?=\d)/g, 'X');
  if (text.length === 0 || text.length > FX_WORD_MAX_CHARS) add('error', 'FX_WORD_TEXT', `"${text}" is ${text.length} characters (1..${FX_WORD_MAX_CHARS})`);
  if (shouted !== shouted.toUpperCase()) add('error', 'FX_WORD_TEXT', `"${text}" must be upper-case`);
  const bad = fxWordUnsupported(text);
  if (bad.length) add('error', 'FX_WORD_TEXT', `the lettering font cannot draw: ${bad.join(' ')}`);
  return bad;
}

/** Onomatopoeia: required word per moment, text, hold and size rules. */
export function checkWord(preset: FxPreset, checkZone: (zoneId: string, where: string) => boolean, add: FxAdd): void {
  const required = FX_MOMENT_WORDS[preset.trigger?.moment];
  const word = preset.onomatopoeia;
  if (required && !word) add('error', 'FX_WORD_REQUIRED', `moment \`${preset.trigger.moment}\` has a word in the design doc: ${required}`);
  if (required && word && word.text !== required) add('error', 'FX_WORD_REQUIRED', `word is "${word.text}", the design doc says "${required}"`);
  if (!word) return;
  checkZone(word.zone, 'onomatopoeia');
  const text = word.text ?? '';
  const bad = checkWordText(text, add);
  if (!(word.holdMs >= L.wordHoldMs[0] && word.holdMs <= L.wordHoldMs[1])) {
    add('error', 'FX_WORD_HOLD', `holdMs ${word.holdMs} is outside ${L.wordHoldMs[0]}..${L.wordHoldMs[1]}: too short to read or long enough to cover the next action`);
  }
  const cap = word.size ?? FX_WORD_DEFAULT_SIZE;
  if (cap * L.pxPerUnit < L.minWordCapPx) add('error', 'FX_WORD_SIZE', `cap height is ${(cap * L.pxPerUnit).toFixed(0)} px (min ${L.minWordCapPx}): each font pixel must survive the pixel-art pass`);
  if (!bad.length && text.length) {
    const width = fxLayoutWord(text, cap).width;
    if (width > L.maxWordWidth) add('warning', 'FX_WORD_SIZE', `the word is ${width.toFixed(1)} units wide (max ${L.maxWordWidth}): shorten it or lower \`size\``);
  }
}

export function checkImpact(preset: FxPreset, add: FxAdd): void {
  if ((preset.shake ?? 0) < 0 || (preset.shake ?? 0) > L.maxShake) add('error', 'FX_IMPACT', `shake ${preset.shake} is outside 0..${L.maxShake}`);
  if ((preset.flash ?? 0) < 0 || (preset.flash ?? 0) > L.maxFlash) add('error', 'FX_IMPACT', `flash ${preset.flash} is outside 0..${L.maxFlash}`);
}
