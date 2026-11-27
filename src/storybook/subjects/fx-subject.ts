import * as THREE from 'three';
import { FxCatalog } from '../../procgen/fx/catalog.js';
import { FX_WORD_MAX_CHARS } from '../../procgen/fx/lettering.js';
import { fxTotalMs, resolveFxLight } from '../../procgen/fx/simulate.js';
import type { FxPreset } from '../../procgen/fx/types.js';
import { validateFxPreset } from '../../procgen/fx/validate.js';
import { createFxEmitter, fxEmitterWorldLight, type FxEmitter } from '../../procgen/runtime/fx-emitter/index.js';
import type { Bounds } from '../domain/framing.js';
import type { PartAnimator } from './part-animator.js';
import type { FxSubjectControl, FxSubjectInfo, Subject, SubjectOptions } from './types.js';

/** Origin height per anchor, against a vibecoder-sized (1.6) actor standing at y = 0. */
const ANCHOR_Y = { feet: 0, center: 0.8, top: 1.6 } as const;
/** Pause between replays of a one-shot effect, so the end state can be read. */
const REPLAY_GAP_MS = 500;
/** `anim=0`: the frame held, as a share of the preset's duration. */
const REST_SHARE = 0.35;
const SAMPLES = 12;

/** Union of the effect's boxes over the whole emission, so framing does not jump while it plays. */
function emissionBounds(emitter: FxEmitter, holder: THREE.Group, durationMs: number): Bounds {
  const box = new THREE.Box3();
  const step = new THREE.Box3();
  for (let i = 0; i <= SAMPLES; i++) {
    emitter.seek((durationMs * i) / SAMPLES);
    holder.updateMatrixWorld(true);
    step.setFromObject(holder, true);
    if (!step.isEmpty()) box.union(step);
  }
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, 0, -0.1), new THREE.Vector3(0.5, 1, 0.1));
  box.min.y = Math.min(box.min.y, 0);
  return { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] };
}

function fxLore(preset: FxPreset): string {
  const light = resolveFxLight(preset);
  return [
    preset.trigger?.moment ? `moment: ${preset.trigger.moment}` : '',
    `anchor: ${preset.anchor}`,
    `light: ${light.zone} r=${light.radius} p=${light.power}`,
    preset.flash ? `flash ${preset.flash}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function buildFxInfo(preset: FxPreset): FxSubjectInfo {
  const report = validateFxPreset(preset);
  const totalMs = Math.max(fxTotalMs(preset), preset.durationMs);
  return {
    id: preset.id,
    label: preset.label,
    family: preset.family,
    event: preset.trigger.event,
    moment: preset.trigger.moment,
    when: preset.trigger.when,
    anchor: preset.anchor,
    durationMs: preset.durationMs,
    totalMs,
    stepFps: preset.stepFps ?? 12,
    loop: Boolean(preset.loop),
    fullPanel: Boolean(preset.fullPanel),
    shake: preset.shake ?? 0,
    flash: preset.flash ?? 0,
    light: resolveFxLight(preset),
    word: preset.onomatopoeia
      ? {
          text: preset.onomatopoeia.text,
          style: preset.onomatopoeia.style,
          zone: preset.onomatopoeia.zone,
          holdMs: preset.onomatopoeia.holdMs,
        }
      : null,
    layers: preset.layers.map((l) => ({ name: l.name, role: l.role, zone: l.zone, count: l.count, emit: l.emit })),
    metrics: {
      layers: report.metrics.layers,
      instances: report.metrics.instances,
      triangles: report.metrics.triangles,
      share: {
        primary: Math.round(report.metrics.share.primary * 10) / 10,
        secondary: Math.round(report.metrics.share.secondary * 10) / 10,
        accent: Math.round(report.metrics.share.accent * 10) / 10,
      },
      deltaE: report.metrics.deltaE !== null ? Math.round(report.metrics.deltaE * 10) / 10 : null,
      minParticlePx: Math.round(report.metrics.minParticlePx * 10) / 10,
      bounds: {
        width: Math.round((report.metrics.bounds[2] - report.metrics.bounds[0]) * 100) / 100,
        height: Math.round((report.metrics.bounds[3] - report.metrics.bounds[1]) * 100) / 100,
      },
      lastParticleMs: report.metrics.lastParticleMs,
    },
    pass: report.pass,
    errors: report.errors,
    warnings: report.warnings,
    issues: report.issues.map((i) => ({ code: i.code, severity: i.severity, ...(i.layer ? { layer: i.layer } : {}), message: i.message })),
  };
}

function normalizeWord(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = [...raw.trim()].map((ch) => (ch === 'x' ? 'x' : ch.toUpperCase())).join('').slice(0, FX_WORD_MAX_CHARS);
  return cleaned || null;
}

function effectivePresetForWord(preset: FxPreset, wordOverride: string | null): FxPreset {
  if (!wordOverride) return preset;
  return {
    ...preset,
    onomatopoeia: preset.onomatopoeia
      ? { ...preset.onomatopoeia, text: wordOverride }
      : {
          text: wordOverride,
          zone: preset.layers[0]?.zone ?? 'paper',
          style: 'burst',
          holdMs: Math.min(1400, Math.max(400, preset.durationMs)),
        },
  };
}

/** One emission of a preset, replayed on the lab clock with live workbench inspection and controls. */
export function buildFxSubject(id: string, opts: SubjectOptions): Subject {
  const preset = FxCatalog.get(id);
  const fxInfo = buildFxInfo(preset);
  const totalMs = fxInfo.totalMs;
  const stepFps = fxInfo.stepFps;
  const cycleMs = preset.loop ? Math.max(1, totalMs) : Math.max(1, totalMs + REPLAY_GAP_MS);
  const holder = new THREE.Group();
  holder.name = id;

  const hiddenLayers = new Set<string>();
  let wordOverride: string | null = null;
  let currentMs = 0;

  const materials: Subject['materials'] = [];
  const glow: THREE.Mesh[] = [];

  const mountEmitter = (word: string | null): FxEmitter => {
    const activePreset = effectivePresetForWord(preset, word);
    const built = createFxEmitter(activePreset, {
      seed: opts.seed,
      ...(opts.ink ? {} : { inkWeight: 0 }),
      ...(activePreset.onomatopoeia ? { text: activePreset.onomatopoeia.text } : {}),
    });
    built.group.position.y = ANCHOR_Y[preset.anchor] ?? 0;
    holder.clear();
    holder.add(built.group);
    materials.splice(0, materials.length, ...built.materials);
    glow.splice(0, glow.length);
    built.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && !mesh.userData.outline && mesh.userData.zone !== 'ink') glow.push(mesh);
    });
    return built;
  };

  let emitter = mountEmitter(null);
  const bounds = emissionBounds(emitter, holder, totalMs);

  const applyFrame = (ms: number): void => {
    currentMs = Math.max(0, Math.min(totalMs, ms));
    emitter.seek(currentMs);
    if (hiddenLayers.size > 0) {
      emitter.group.traverse((obj) => {
        const sep = obj.name.lastIndexOf('#');
        if (sep > 0 && hiddenLayers.has(obj.name.slice(0, sep))) obj.visible = false;
      });
    }
  };

  const animator: PartAnimator = {
    apply(time, _state, mode) {
      const ms =
        mode === 'rest'
          ? Math.min(totalMs, preset.durationMs * REST_SHARE)
          : mode === 'seek'
            ? Math.max(0, Math.min(totalMs, time * 1000))
            : Math.min(totalMs, (time * 1000) % cycleMs);
      applyFrame(ms);
    },
    dispose() {},
  };
  animator.apply(0, 'normal', 'rest');

  const fxControl: FxSubjectControl = {
    preset,
    getState: () => ({
      tMs: Math.round(currentMs),
      totalMs,
      stepFps,
      hiddenLayers: [...hiddenLayers],
      wordText: wordOverride ?? preset.onomatopoeia?.text ?? '',
      baseWord: preset.onomatopoeia?.text ?? '',
    }),
    setHiddenLayers: (names) => {
      hiddenLayers.clear();
      for (const n of names) if (preset.layers.some((l) => l.name === n)) hiddenLayers.add(n);
      applyFrame(currentMs);
    },
    toggleLayer: (name) => {
      if (preset.layers.some((l) => l.name === name)) {
        if (hiddenLayers.has(name)) hiddenLayers.delete(name);
        else hiddenLayers.add(name);
        applyFrame(currentMs);
      }
      return [...hiddenLayers];
    },
    setWord: (text) => {
      const next = normalizeWord(text);
      const base = preset.onomatopoeia?.text ?? null;
      wordOverride = next && next !== base ? next : null;
      emitter.dispose();
      emitter = mountEmitter(wordOverride);
      applyFrame(currentMs);
    },
    cycleDurationMs: () => cycleMs,
  };

  return {
    kind: 'fx',
    id,
    label: `${preset.label} · ${preset.family} · ${preset.durationMs} ms${preset.loop ? ' loop' : ''}`,
    category: preset.family,
    lore: fxLore(preset),
    object: holder,
    // The emitter's own array: materials made later (per alpha step) are fed too.
    materials,
    bounds,
    glow,
    built: null,
    spec: null,
    animator,
    sockets: {},
    info: null,
    fxInfo,
    fxControl,
    fxLight: () => fxEmitterWorldLight(emitter),
    dispose: () => emitter.dispose(),
  };
}
