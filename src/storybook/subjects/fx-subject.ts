import * as THREE from 'three';
import { FxCatalog } from '../../procgen/fx/catalog.js';
import type { FxPreset } from '../../procgen/fx/types.js';
import { createFxEmitter, type FxEmitter } from '../../procgen/runtime/fx-emitter/index.js';
import type { Bounds } from '../domain/framing.js';
import type { PartAnimator } from './part-animator.js';
import type { Subject, SubjectOptions } from './types.js';

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

/** Replays the emission on the lab clock. Seeking makes every frame repeatable for `?t=`. */
function replayAnimator(emitter: FxEmitter, preset: FxPreset): PartAnimator {
  const cycle = preset.loop ? preset.durationMs : preset.durationMs + REPLAY_GAP_MS;
  return {
    apply(time, _state, mode) {
      const ms = mode === 'rest' ? preset.durationMs * REST_SHARE : (time * 1000) % Math.max(1, cycle);
      emitter.seek(Math.min(ms, preset.durationMs));
    },
    dispose() {},
  };
}

function fxLore(preset: FxPreset): string {
  return [preset.trigger?.moment ? `moment: ${preset.trigger.moment}` : '', `anchor: ${preset.anchor}`, preset.flash ? `flash ${preset.flash}` : '']
    .filter(Boolean)
    .join(' · ');
}

/** One emission of a preset, replayed on the lab clock. */
export function buildFxSubject(id: string, opts: SubjectOptions): Subject {
  const preset = FxCatalog.get(id);
  const emitter = createFxEmitter(preset, { seed: opts.seed, ...(opts.ink ? {} : { inkWeight: 0 }) });
  const holder = new THREE.Group();
  holder.name = id;
  emitter.group.position.y = ANCHOR_Y[preset.anchor] ?? 0;
  holder.add(emitter.group);
  const bounds = emissionBounds(emitter, holder, preset.durationMs);
  const animator = replayAnimator(emitter, preset);
  animator.apply(0, 'normal', 'rest');

  return {
    kind: 'fx',
    id,
    label: `${preset.label} · ${preset.family} · ${preset.durationMs} ms${preset.loop ? ' loop' : ''}`,
    category: preset.family,
    lore: fxLore(preset),
    object: holder,
    // The emitter's own array: materials made later (per alpha step) are fed too.
    materials: emitter.materials,
    bounds,
    glow: [],
    built: null,
    spec: null,
    animator,
    sockets: {},
    info: null,
    dispose: () => emitter.dispose(),
  };
}
