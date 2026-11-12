#!/usr/bin/env node
// Self-test of src/procgen/anim: builds a synthetic model that carries every AnimType, steps the
// animator in node (no WebGL, no DOM) and checks the properties the skills promise.
//   node .kiro/skills/procedural-animation-3d/scripts/self-test.mjs
// Prints PASS / FAIL per case and exits 1 if any case fails.
import { withProcgen } from '../../../../scripts/harness/lib/load.mjs';

const results = [];
const check = (name, fn) => {
  try {
    const r = fn();
    const ok = r === true || r === undefined;
    results.push({ name, ok, detail: ok ? '' : String(r) });
  } catch (err) {
    results.push({ name, ok: false, detail: err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : String(err) });
  }
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const flat = (pose) => [...pose.pos, ...pose.rot, ...pose.scale, pose.emissiveMul ?? 1];
const same = (a, b, eps = 0) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= eps);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const ALL_TYPES = ['spin', 'bob', 'pulse', 'swing', 'jitter', 'blink', 'breathe', 'legWalk', 'armSwing', 'orbit'];
const EVENT_TYPES = [
  'ROOM_TRANSITION', 'LANTERN_REVEAL', 'PERMISSION_DENIED_RATTLE', 'INODE_MODE_CHANGED', 'OBJECT_MOVED', 'SYSTEM_HAND_SPAWN',
  'PROC_SIGNALED', 'HUD_OVERLAY_TOGGLED', 'OBSTACLE_DIALOGUE_RENDERED', 'PUZZLE_DOOR_RESOLVED', 'PLAYER_DAMAGED', 'FLOOR_CLEARED',
];

/** A small two-legged glitch thing: one part per AnimType, limbs in counter-phase. */
const makeSpec = () => ({
  id: 'malware.animtest', category: 'malware', label: 'animation test rig',
  parts: [
    { name: 'body', shape: { kind: 'box', size: [0.5, 0.6, 0.3] }, zone: 'silicon', pos: [0, 0.7, 0], anim: { type: 'breathe', pivot: [0, 0.4, 0] } },
    { name: 'leg_l', shape: { kind: 'box', size: [0.14, 0.4, 0.14] }, zone: 'plastic', pos: [0.12, 0.2, 0], anim: { type: 'legWalk', axis: 'z', pivot: [0.12, 0.4, 0], phase: 0 } },
    { name: 'leg_r', shape: { kind: 'box', size: [0.14, 0.4, 0.14] }, zone: 'plastic', pos: [-0.12, 0.2, 0], anim: { type: 'legWalk', axis: 'z', pivot: [-0.12, 0.4, 0], phase: 0.5 } },
    { name: 'arm_l', shape: { kind: 'capsule', radius: 0.05, length: 0.3 }, zone: 'plastic', pos: [0.31, 0.72, 0], anim: { type: 'armSwing', axis: 'z', pivot: [0.31, 0.9, 0], phase: 0 } },
    { name: 'arm_r', shape: { kind: 'capsule', radius: 0.05, length: 0.3 }, zone: 'plastic', pos: [-0.31, 0.72, 0], anim: { type: 'armSwing', axis: 'z', pivot: [-0.31, 0.9, 0], phase: 0.5 } },
    { name: 'eye', shape: { kind: 'sphere', radius: 0.07 }, zone: 'malwareEye', pos: [0, 0.85, -0.16], outline: false, anim: { type: 'blink' } },
    { name: 'core', shape: { kind: 'sphere', radius: 0.09 }, zone: 'corruptMagenta', pos: [0, 0.6, -0.15], anim: { type: 'pulse' } },
    { name: 'fan', shape: { kind: 'cylinder', rTop: 0.08, rBottom: 0.08, height: 0.04, sides: 6 }, zone: 'heatsink', pos: [0.15, 1.12, 0], rot: [Math.PI / 2, 0, 0], anim: { type: 'spin', axis: 'z', pivot: [0, 1.12, 0], speed: 0.7 } },
    { name: 'tail', shape: { kind: 'box', size: [0.06, 0.3, 0.06] }, zone: 'corruptViolet', pos: [0.3, 0.45, 0.1], rot: [0, 0, 0.4], anim: { type: 'swing', pivot: [0.25, 0.58, 0.1], amp: 0.3 } },
    { name: 'horn', shape: { kind: 'extrude', outline: [[0, 0], [0.12, 0], [0.2, 0.3]], depth: 0.08 }, zone: 'corruptMagenta', pos: [-0.2, 1.0, 0], anim: { type: 'jitter' } },
    { name: 'antenna', shape: { kind: 'box', size: [0.04, 0.2, 0.04] }, zone: 'toxicGreen', pos: [0.1, 1.08, 0], anim: { type: 'bob', amp: 0.04, speed: 1.1 } },
    { name: 'mote', shape: { kind: 'sphere', radius: 0.04 }, zone: 'phosphor', pos: [0.2, 1.3, 0], outline: false, anim: { type: 'orbit', pivot: [0, 1.3, 0] } },
    { name: 'plate', shape: { kind: 'box', size: [0.2, 0.1, 0.05] }, zone: 'solder', pos: [0, 0.75, -0.17] },
  ],
});

await withProcgen(async (anim, vite) => {
  const { buildModel } = await vite.ssrLoadModule('/src/procgen/core/build.ts');
  const {
    animPoseAt, animStepTime, animRootPoseAt, createAnimator, createAnimMaterialTint, validateAnimTags,
    ANIM_TAG_DEFAULTS, ANIM_STATES, ANIM_STATE_IDS, ANIM_STEP_FPS, ANIM_JITTER_GLITCH_GAIN,
    ANIM_EVENT_MAP, animReactionsFor, animStateForActor,
  } = anim;

  const spec = makeSpec();
  const baseOf = (name) => {
    const p = spec.parts.find((x) => x.name === name);
    return { pos: [...p.pos], rot: [...(p.rot ?? [0, 0, 0])], scale: [...(p.scale ?? [1, 1, 1])] };
  };
  const tagOf = (name) => spec.parts.find((x) => x.name === name).anim;
  const snapshot = (model) => [...model.parts.values()].flatMap((m) => [m.position.x, m.position.y, m.position.z, m.rotation.x, m.rotation.y, m.rotation.z, m.scale.x, m.scale.y, m.scale.z]);
  const uniforms = (model) => model.allMaterials.flatMap((m) => [m.uniforms.uEmissive.value, m.uniforms.uOpacity.value]);
  const emissive = (model) => model.allMaterials.map((m) => m.uniforms.uEmissive.value);
  const opacity = (model) => model.allMaterials.map((m) => m.uniforms.uOpacity.value);

  check('the synthetic spec carries every AnimType and every type has defaults', () => {
    const used = new Set(spec.parts.map((p) => p.anim?.type).filter(Boolean));
    return ALL_TYPES.every((t) => used.has(t) && ANIM_TAG_DEFAULTS[t]) || `missing: ${ALL_TYPES.filter((t) => !used.has(t) || !ANIM_TAG_DEFAULTS[t])}`;
  });

  check('animPoseAt is deterministic and never mutates base (same t -> same pose)', () => {
    for (const part of spec.parts) {
      const base = baseOf(part.name);
      const frozen = JSON.stringify(base);
      for (const t of [0, 0.13, 1.7, 42.42]) {
        const ctx = { name: part.name, locomotion: 1 };
        if (!same(flat(animPoseAt(part.anim, base, t, ctx)), flat(animPoseAt(part.anim, base, t, ctx)))) return `${part.name} differs at t=${t}`;
      }
      if (JSON.stringify(base) !== frozen) return `${part.name}: base was mutated`;
    }
  });

  check('no NaN: every type, 600 time samples, stepped and smooth', () => {
    for (const part of spec.parts) {
      for (let i = 0; i < 600; i++) {
        for (const fps of [ANIM_STEP_FPS, 0]) {
          const pose = animPoseAt(part.anim, baseOf(part.name), i * 0.0371, { fps, name: part.name, locomotion: 1 });
          if (!flat(pose).every(Number.isFinite)) return `${part.name} at sample ${i}`;
        }
      }
    }
  });

  check('untagged part and tag at rest return the base transform', () => {
    const b = baseOf('plate');
    if (!same(flat(animPoseAt(undefined, b, 3.3)), [...b.pos, ...b.rot, ...b.scale, 1])) return 'untagged moved';
    const leg = animPoseAt(tagOf('leg_l'), baseOf('leg_l'), 0.3, { locomotion: 0 });
    return same(leg.pos, baseOf('leg_l').pos, 1e-12) || 'legWalk moved at locomotion 0';
  });

  check('pivoted spin / swing / legWalk keep their distance to the pivot', () => {
    for (const name of ['fan', 'tail', 'leg_l', 'arm_r']) {
      const tag = tagOf(name);
      const base = baseOf(name);
      const d0 = dist(base.pos, tag.pivot);
      let moved = 0;
      for (let i = 0; i < 200; i++) {
        const pose = animPoseAt(tag, base, i * 0.043, { fps: 0, locomotion: 1 });
        if (!near(dist(pose.pos, tag.pivot), d0, 1e-9)) return `${name}: distance ${dist(pose.pos, tag.pivot)} != ${d0}`;
        moved = Math.max(moved, dist(pose.pos, base.pos));
      }
      if (moved < 0.01) return `${name} did not move`;
    }
  });

  check('spin about a pivot also turns the part (translate, rotate, translate back)', () => {
    const tag = { type: 'spin', axis: 'z', pivot: [0, 1, 0], speed: 1 };
    const pose = animPoseAt(tag, { pos: [0.5, 1, 0], rot: [0, 0, 0], scale: [1, 1, 1] }, 0.25, { fps: 0 });
    return (near(pose.pos[0], 0, 1e-9) && near(pose.pos[1], 1.5, 1e-9) && near(pose.rot[2], Math.PI / 2, 1e-9)) || `pos ${pose.pos} rot ${pose.rot}`;
  });

  check('stepped time holds poses: constant inside a 1/12 s step, changes across steps, smooth does not hold', () => {
    const tag = tagOf('antenna');
    const base = baseOf('antenna');
    const t0 = 5 / ANIM_STEP_FPS;
    const a = animPoseAt(tag, base, t0 + 0.002);
    const b = animPoseAt(tag, base, t0 + 0.04);
    const c = animPoseAt(tag, base, t0 + 0.08);
    const d = animPoseAt(tag, base, t0 + 1 / ANIM_STEP_FPS + 0.002);
    if (!same(flat(a), flat(b)) || !same(flat(a), flat(c))) return 'pose changed inside one step';
    if (same(flat(a), flat(d))) return 'pose did not change on the next step';
    const s1 = animPoseAt(tag, base, t0 + 0.002, { fps: 0 });
    const s2 = animPoseAt(tag, base, t0 + 0.04, { fps: 0 });
    if (same(flat(s1), flat(s2))) return 'smooth time held a pose';
    return near(animStepTime(0.999, 12), 11 / 12) || 'animStepTime';
  });

  check('bob stays inside its amplitude and reaches it', () => {
    const tag = tagOf('antenna');
    const base = baseOf('antenna');
    let peak = 0;
    for (let i = 0; i < 2000; i++) {
      const pose = animPoseAt(tag, base, i * 0.0113);
      const dy = pose.pos[1] - base.pos[1];
      if (Math.abs(dy) > tag.amp + 1e-9) return `|dy| ${Math.abs(dy)} > amp ${tag.amp}`;
      if (pose.pos[0] !== base.pos[0] || pose.pos[2] !== base.pos[2]) return 'bob left its axis';
      peak = Math.max(peak, Math.abs(dy));
    }
    return peak > tag.amp * 0.9 || `peak ${peak} never reached amp ${tag.amp}`;
  });

  check('jitter: bounded, in the page plane, rests, glitches, seeded by part name', () => {
    const tag = tagOf('horn');
    const base = baseOf('horn');
    const amp = ANIM_TAG_DEFAULTS.jitter.amp;
    let rests = 0, glitches = 0, differs = 0;
    const n = 600;
    for (let i = 0; i < n; i++) {
      const t = i / ANIM_TAG_DEFAULTS.jitter.speed + 0.01;
      const p = animPoseAt(tag, base, t, { name: 'horn' });
      const q = animPoseAt(tag, base, t, { name: 'other' });
      const dx = p.pos[0] - base.pos[0];
      const dy = p.pos[1] - base.pos[1];
      if (p.pos[2] !== base.pos[2]) return 'jitter moved along z';
      if (Math.max(Math.abs(dx), Math.abs(dy)) > amp * ANIM_JITTER_GLITCH_GAIN + 1e-9) return `offset ${dx}, ${dy} beyond the glitch bound`;
      if (dx === 0 && dy === 0) rests++;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > amp + 1e-9) glitches++;
      if (!same(p.pos, q.pos)) differs++;
    }
    if (rests < n * 0.2 || rests > n * 0.6) return `rest frames ${rests}/${n}`;
    if (glitches < 5 || glitches > n * 0.2) return `glitch frames ${glitches}/${n}`;
    if (differs < n * 0.3) return 'two part names produced the same jitter';
    const off = animPoseAt(tag, base, 1.234, { name: 'horn', jitterMul: 0 });
    return same(off.pos, base.pos) || 'jitterMul 0 still moves';
  });

  check('blink and pulse drive emissiveMul; legs counter-phase; arm counters its own leg', () => {
    const eye = Array.from({ length: 400 }, (_, i) => animPoseAt(tagOf('eye'), baseOf('eye'), i * 0.02).emissiveMul);
    const shut = eye.filter((v) => v < 0.5).length;
    if (shut === 0 || shut > eye.length * 0.3) return `blink shut ${shut}/${eye.length}`;
    const core = Array.from({ length: 200 }, (_, i) => animPoseAt(tagOf('core'), baseOf('core'), i * 0.02));
    if (!core.some((p) => p.emissiveMul > 1.3) || !core.some((p) => p.scale[0] > 1.05)) return 'pulse never peaks';
    const ctx = { fps: 0, locomotion: 1 };
    const t = 0.125; // quarter cycle at 2 Hz: full swing
    const l = animPoseAt(tagOf('leg_l'), baseOf('leg_l'), t, ctx).rot[2];
    const r = animPoseAt(tagOf('leg_r'), baseOf('leg_r'), t, ctx).rot[2];
    const a = animPoseAt(tagOf('arm_l'), baseOf('arm_l'), t, ctx).rot[2];
    if (!(Math.abs(l) > 0.3 && near(l, -r, 1e-9))) return `legs ${l} / ${r}`;
    return Math.sign(a) === -Math.sign(l) || `arm ${a} swings with its leg ${l}`;
  });

  check('animator is deterministic: two animators stepped alike agree, seek(t) repeats', () => {
    const m1 = buildModel(makeSpec());
    const m2 = buildModel(makeSpec());
    const a1 = createAnimator(m1);
    const a2 = createAnimator(m2);
    for (let i = 0; i < 90; i++) {
      if (i === 20) { a1.setState('walk'); a2.setState('walk'); }
      if (i === 50) { a1.setState('attack'); a2.setState('attack'); }
      a1.update(1 / 60);
      a2.update(1 / 60);
      if (!same(snapshot(m1), snapshot(m2)) || !same(uniforms(m1), uniforms(m2))) return `diverged at frame ${i}`;
    }
    a1.seek(2.37);
    const s = snapshot(m1);
    a1.update(0.5);
    a1.seek(2.37);
    return same(s, snapshot(m1)) || 'seek(t) gave two different poses';
  });

  check('animator moves tagged parts, leaves untagged parts and the Group alone, no NaN in any state', () => {
    const model = buildModel(makeSpec());
    model.group.position.set(1.5, 0.3, 0.22);
    model.group.rotation.set(0, 0.1, 0);
    const a = createAnimator(model);
    const rest = snapshot(model);
    let moved = false;
    for (const state of ANIM_STATE_IDS) {
      a.setState(state);
      for (let i = 0; i < 80; i++) {
        a.update(1 / 60);
        const now = snapshot(model);
        if (![...now, ...uniforms(model)].every(Number.isFinite)) return `NaN in ${state}`;
        if (!same(now, rest)) moved = true;
      }
    }
    if (!moved) return 'nothing moved';
    const g = model.group;
    if (g.position.x !== 1.5 || g.position.y !== 0.3 || g.position.z !== 0.22 || g.rotation.y !== 0.1 || g.scale.x !== 1) return 'the Group transform was touched';
    const b = buildModel(makeSpec());
    const idle = createAnimator(b);
    for (let i = 0; i < 40; i++) idle.update(1 / 60);
    const plate = b.parts.get('plate');
    return same([plate.position.x, plate.position.y, plate.position.z], [0, 0.75, -0.17]) || 'an untagged part moved in idle';
  });

  check('stepped animator holds: frames inside one 1/12 s step are identical', () => {
    const model = buildModel(makeSpec());
    const a = createAnimator(model, { state: 'walk' });
    a.update(0.5 + 0.001);
    const s = snapshot(model);
    for (let i = 0; i < 4; i++) {
      a.update(1 / 60);
      if (!same(s, snapshot(model))) return `pose changed ${i + 1} frames into the step`;
    }
    a.update(1 / 60);
    a.update(1 / 60);
    return !same(s, snapshot(model)) || 'pose never advanced';
  });

  for (const state of ['petrified', 'frozen']) {
    check(`${state}: zero motion, whatever came before`, () => {
      const tints = [];
      const model = buildModel(makeSpec());
      const a = createAnimator(model, { state: 'walk', onTint: (t) => tints.push(t) });
      for (let i = 0; i < 47; i++) a.update(1 / 60);
      a.setState(state);
      const s = snapshot(model);
      const o = opacity(model);
      const e0 = emissive(model);
      let glint = false;
      for (let i = 0; i < 240; i++) {
        a.update(1 / 60);
        if (!same(s, snapshot(model))) return `a part moved at frame ${i}`;
        if (!same(o, opacity(model))) return 'opacity changed';
        if (!same(e0, emissive(model))) glint = true;
      }
      if (state === 'frozen' && !glint) return 'frozen has no emissive shimmer';
      const zoneId = state === 'petrified' ? 'heatsink' : 'ice';
      if (!(tints.at(-1) && tints.at(-1).zone === zoneId && tints.at(-1).amount > 0)) return `tint hook not called with ${zoneId}`;
      a.setState('idle');
      if (tints.at(-1) !== null) return 'tint not cleared on leaving the state';
      a.update(0.3);
      return !same(s, snapshot(model)) || 'did not resume after thaw';
    });
  }

  check('reset() restores base transforms and uniforms exactly; setEnabled(false) and dispose() too', () => {
    const model = buildModel(makeSpec());
    const base = snapshot(model);
    const mats = [...model.allMaterials];
    const partMats = [...model.parts.values()].map((m) => m.material);
    const read = () => mats.flatMap((m) => [m.uniforms.uEmissive.value, m.uniforms.uOpacity.value, Number(m.transparent), m.uniforms.uColor.value.getHex()]);
    const uni = read();
    const a = createAnimator(model, { onTint: createAnimMaterialTint(model) });
    const eyeMat = model.parts.get('eye').material;
    const coreMat = model.parts.get('core').material;
    if (model.parts.get('horn').material === coreMat) return 'core (pulse) and horn (jitter) still share one emissive uniform';
    if (coreMat.uniforms.uColor !== model.materials.get('corruptMagenta').uniforms.uColor) return 'a split material lost the shared zone uniforms';
    const exact = () => same(base, snapshot(model)) && same(uni, read())
      && eyeMat.uniforms.uEmissive.value === model.materials.get('malwareEye').uniforms.uEmissive.value
      && coreMat.uniforms.uEmissive.value === model.materials.get('corruptMagenta').uniforms.uEmissive.value;
    const run = (states) => { for (const s of states) { a.setState(s); a.setLocomotion(0.7); for (let i = 0; i < 37; i++) a.update(1 / 60); } };
    run(['walk', 'attack', 'enraged', 'hidden', 'frozen', 'death']);
    if (same(base, snapshot(model))) return 'the run did not move anything';
    a.reset();
    if (!exact()) return 'reset() left a difference';
    if (a.state !== 'idle' || a.time !== 0) return 'reset() kept the state or the clock';
    run(['enraged', 'petrified']);
    a.setEnabled(false);
    if (!exact()) return 'setEnabled(false) left a difference';
    a.update(0.5);
    if (!exact()) return 'a disabled animator still writes';
    a.setEnabled(true);
    run(['hidden']);
    a.dispose();
    if (!exact()) return 'dispose() left a difference';
    a.update(0.5);
    if (model.allMaterials.length !== mats.length || ![...model.parts.values()].every((m, i) => m.material === partMats[i])) return 'dispose() left split materials behind';
    return (same(base, snapshot(model)) && same(uni, read())) || 'a disposed animator still writes';
  });

  check('uniforms compose with the stage: an outside write becomes the base, multipliers apply on top', () => {
    const model = buildModel(makeSpec());
    const a = createAnimator(model);
    const mat = model.materials.get('silicon');
    a.update(0.1);
    mat.uniforms.uOpacity.value = 0.5; // a stage fade
    mat.uniforms.uEmissive.value = 0.4; // a stage glow
    a.update(0.1);
    if (mat.uniforms.uOpacity.value !== 0.5 || mat.uniforms.uEmissive.value !== 0.4) return 'idle overwrote a stage write';
    a.setState('hidden');
    if (!near(mat.uniforms.uOpacity.value, 0.5 * ANIM_STATES.hidden.opacityMul, 1e-12) || !mat.transparent) return 'hidden did not multiply the stage value';
    a.setState('idle');
    a.update(0.1);
    if (mat.uniforms.uOpacity.value !== 0.5 || mat.transparent) return 'leaving hidden did not give the stage value back';
    a.reset();
    return (mat.uniforms.uOpacity.value === 0.5 && mat.uniforms.uEmissive.value === 0.4) || 'reset() dropped the stage value';
  });

  check('lab adapter contract: createModelAnimator, reset(); time = 0; update(t) is an absolute-time pose', () => {
    const model = buildModel(makeSpec());
    const a = anim.createModelAnimator(model);
    const at = (t) => { a.reset(); a.time = 0; a.update(t); return snapshot(model); };
    const s = at(3.21);
    at(0.4);
    return same(s, at(3.21)) || 'not repeatable';
  });

  check('hover bob: rigid (every part same dy), on only when due, still when frozen / petrified / dead, reset exact, repeatable', () => {
    const hoverSpec = () => {
      const spec = { ...makeSpec(), tags: ['hover'] };
      spec.parts.find((x) => x.name === 'antenna').anim.axis = 'x'; // no y-bob part of its own
      return spec;
    };
    const model = buildModel(hoverSpec());
    const rest = snapshot(model);
    const a = createAnimator(model, { state: 'petrified' });
    a.setState('idle');
    let seen = 0;
    for (let i = 0; i < 120; i++) {
      a.update(1 / 60);
      const dy = model.parts.get('plate').position.y - 0.75;
      if (!near(dy, a.hoverOffset, 1e-12)) return `plate dy ${dy} != hoverOffset ${a.hoverOffset}`;
      const leg = model.parts.get('leg_r');
      if (!near(leg.position.y - 0.2, dy, 1e-12)) return 'parts do not share the hover offset';
      seen = Math.max(seen, Math.abs(dy));
    }
    if (!(seen > 0.03 && seen <= 0.04 + 1e-12)) return `hover amplitude ${seen}`;
    for (const state of ['frozen', 'petrified']) {
      a.setState(state);
      const s = snapshot(model);
      for (let i = 0; i < 60; i++) { a.update(1 / 60); if (!same(s, snapshot(model))) return `${state} hover still moves`; }
      a.setState('idle');
      a.update(0.3);
    }
    a.setState('death');
    a.update(1);
    const dead = snapshot(model);
    a.update(1.3);
    if (!same(dead, snapshot(model))) return 'dead hover still moves';
    a.reset();
    if (!same(rest, snapshot(model))) return 'reset() not exact with hover';
    const at = (t) => { a.reset(); a.time = 0; a.update(t); return snapshot(model); };
    const s1 = at(2.71); at(0.3);
    if (!same(s1, at(2.71))) return 'hover pose not repeatable';
    // Off by default for non-hover or non-hostile models; on by option; a stray y bob rides on top of it.
    const off = (spec, o) => { const m = buildModel(spec); const x = createAnimator(m, o); x.update(0.4); return x.hoverOffset === 0; };
    if (!off(makeSpec())) return 'hover bob on a model without the hover tag';
    if (!off({ ...hoverSpec(), category: 'prop' })) return 'hover bob on a prop';
    const stray = hoverSpec(); stray.parts.find((x) => x.name === 'antenna').anim.axis = 'y';
    if (off(stray)) return 'one stray y bob switched the body hover off';
    if (!off(hoverSpec(), { hoverBob: false })) return 'hoverBob: false ignored';
    return !off(makeSpec(), { hoverBob: { amp: 0.03 } }) || 'hoverBob option did not switch it on';
  });

  check('hover fill-in: a pickup whose body bobs through its tags lifts its untagged / pulsing parts by the same dy', () => {
    const bob = { type: 'bob', amp: 0.05, speed: 0.8 };
    const spec = {
      id: 'pickup.animtest', category: 'pickup', label: 'hover pickup rig', tags: ['hover'],
      parts: [
        { name: 'shell', shape: { kind: 'box', size: [0.3, 0.4, 0.1] }, zone: 'silicon', pos: [0, 0.5, 0], anim: bob },
        { name: 'cap', shape: { kind: 'box', size: [0.3, 0.05, 0.1] }, zone: 'gold', pos: [0, 0.72, 0], anim: bob },
        { name: 'label', shape: { kind: 'box', size: [0.2, 0.2, 0.02] }, zone: 'plastic', pos: [0, 0.5, -0.06], anim: bob },
        { name: 'light', shape: { kind: 'sphere', radius: 0.05 }, zone: 'powerAmber', pos: [0, 0.5, -0.08], anim: { type: 'pulse', amp: 0.1 } },
        { name: 'foot', shape: { kind: 'box', size: [0.3, 0.05, 0.1] }, zone: 'gold', pos: [0, 0.28, 0] },
      ],
    };
    const model = buildModel(spec);
    const a = createAnimator(model);
    let peak = 0;
    for (let i = 0; i < 90; i++) {
      a.update(1 / 60);
      const dy = (n, y) => model.parts.get(n).position.y - y;
      const ref = dy('shell', 0.5);
      for (const [n, y] of [['cap', 0.72], ['label', 0.5], ['light', 0.5], ['foot', 0.28]]) {
        if (!near(dy(n, y), ref, 1e-9)) return `${n} dy ${dy(n, y)} != shell dy ${ref} at frame ${i}`;
      }
      if (!near(a.hoverOffset, ref, 1e-9)) return 'hoverOffset does not report the body bob';
      peak = Math.max(peak, Math.abs(ref));
    }
    return peak > 0.04 || `body bob peak ${peak}`;
  });

  check('freezing keeps the pose on screen (from walk with locomotion 0, from enraged)', () => {
    for (const from of ['walk', 'enraged']) {
      for (const to of ['frozen', 'petrified']) {
        const model = buildModel(makeSpec());
        const a = createAnimator(model);
        a.setState(from);
        for (let i = 0; i < 31; i++) a.update(1 / 60);
        const before = snapshot(model);
        a.setState(to);
        if (!same(before, snapshot(model), 1e-12)) return `${from} -> ${to}: the pose changed on entry`;
        for (let i = 0; i < 50; i++) a.update(1 / 60);
        if (!same(before, snapshot(model), 1e-12)) return `${from} -> ${to}: the pose drifted`;
      }
    }
  });

  check('locomotion: 0 keeps limbs at rest, 1 swings them and bounces the body', () => {
    const model = buildModel(makeSpec());
    const a = createAnimator(model, { smooth: true });
    const leg = model.parts.get('leg_l');
    const plate = model.parts.get('plate');
    a.update(0.125);
    if (leg.rotation.z !== 0 || plate.position.y !== 0.75) return 'moved at locomotion 0';
    a.setLocomotion(1);
    let swing = 0, lift = 0;
    for (let i = 0; i < 60; i++) {
      a.update(1 / 60);
      swing = Math.max(swing, Math.abs(leg.rotation.z));
      lift = Math.max(lift, plate.position.y - 0.75);
      if (plate.position.y < 0.75 - 1e-12) return 'the bounce went below the ground line';
    }
    if (swing < 0.3) return `leg swing ${swing}`;
    if (!(lift > 0.02 && lift <= 0.035 + 1e-9)) return `body bounce ${lift}`;
    a.setLocomotion(0);
    a.setState('walk');
    let forced = 0;
    for (let i = 0; i < 60; i++) { a.update(1 / 60); forced = Math.max(forced, Math.abs(leg.rotation.z)); }
    return forced > 0.3 || 'walk state does not force locomotion';
  });

  check('attack: anticipation -> strike -> recover in order, then back to the looping state', () => {
    const beats = [];
    const ends = [];
    const model = buildModel(makeSpec());
    const a = createAnimator(model, { state: 'walk', facing: 1, onBeat: (s, b) => beats.push(`${s}:${b}`), onStateEnd: (s, n) => ends.push(`${s}>${n}`) });
    const body = model.parts.get('plate');
    a.update(0.2);
    a.setState('attack');
    const xs = [];
    for (let i = 0; i < 40; i++) { a.update(1 / 60); xs.push(body.position.x); }
    if (beats.join(',') !== 'attack:anticipation,attack:strike,attack:recover') return `beats: ${beats}`;
    if (ends.join(',') !== 'attack>walk' || a.state !== 'walk') return `ended: ${ends}, state ${a.state}`;
    if (!(Math.min(...xs.slice(0, 12)) < -0.05)) return 'no anticipation pull-back';
    if (!(Math.max(...xs) > 0.25)) return 'no forward strike';
    const strike = ANIM_STATES.attack.keys.find((k) => k.beat === 'strike');
    const before = animRootPoseAt('attack', strike.at - 0.09);
    const after = animRootPoseAt('attack', strike.at + 0.001);
    return (before.forward < 0 && after.forward > 0.3) || 'the strike is not a snap from the held anticipation';
  });

  check('hit flashes and snaps back; death runs 0..1, fades out and holds; hidden / revealed / enraged modulate', () => {
    const model = buildModel(makeSpec());
    const ends = [];
    const a = createAnimator(model, { onStateEnd: (s, n) => ends.push(`${s}>${n}`) });
    a.update(0.1);
    const e0 = emissive(model);
    const o0 = opacity(model);
    a.setState('hit');
    if (!emissive(model).every((v, i) => v > e0[i] + 0.5)) return 'hit does not flash';
    a.update(0.4);
    if (a.state !== 'idle') return 'hit did not return to idle';

    a.setState('hidden');
    a.update(0.1);
    if (!opacity(model).every((v, i) => v <= o0[i] * 0.1)) return 'hidden is not faint';
    const horn = model.parts.get('horn');
    for (let i = 0; i < 60; i++) { a.update(1 / 60); if (horn.position.x !== -0.2 || horn.position.y !== 1.0) return 'hidden still jitters'; }
    a.setState('revealed');
    a.update(0.6);
    if (a.state !== 'idle' || !same(opacity(model), o0, 1e-12)) return 'revealed did not end opaque in idle';

    a.setState('enraged');
    a.update(0.5);
    const eye = model.materials.get('malwareEye').uniforms.uEmissive.value;
    a.setState('idle');
    a.update(0.01);
    const calm = model.materials.get('malwareEye').uniforms.uEmissive.value;
    if (!(eye > calm * 1.3 || calm < 0.2)) return `enraged emissive ${eye} vs idle ${calm}`;

    a.setState('death');
    let last = -1;
    for (let i = 0; i < 60; i++) {
      a.update(1 / 60);
      if (a.deathProgress < last) return 'deathProgress went backwards';
      last = a.deathProgress;
    }
    if (last !== 1 || a.progress !== 1 || a.state !== 'death') return `death ended at ${last} in ${a.state}`;
    if (!opacity(model).every((v) => v === 0)) return 'death did not fade out';
    const s = snapshot(model);
    a.update(1);
    if (!same(s, snapshot(model))) return 'the dead pose is not held';
    return ends.filter((e) => e === 'death>null').length === 1 || `death end reported ${ends}`;
  });

  check('validateAnimTags: the test rig is clean', () => {
    const errors = validateAnimTags(makeSpec()).filter((i) => i.severity === 'error');
    return errors.length === 0 || errors.map((i) => `${i.code} ${i.part}`).join('; ');
  });

  const broken = (code, mutate) => check(`validateAnimTags catches ${code}`, () => {
    const s = makeSpec();
    mutate(s, (name) => s.parts.find((p) => p.name === name));
    const found = validateAnimTags(s).map((i) => i.code);
    return found.includes(code) || `got [${[...new Set(found)]}]`;
  });
  broken('ANIM_PIVOT_OUTSIDE', (s, p) => { p('fan').anim.pivot = [0, 4, 0]; });
  broken('ANIM_PIVOT_DETACHED', (s, p) => { p('tail').anim.pivot = [-0.2, 0.9, 0]; });
  broken('ANIM_DETACH', (s, p) => { p('antenna').anim.amp = 0.35; });
  broken('ANIM_BELOW_GROUND', (s, p) => { p('leg_l').anim = { type: 'bob', amp: 0.2 }; });
  broken('ANIM_SPEED_RANGE', (s, p) => { p('core').anim.speed = 40; });
  broken('ANIM_AMP_RANGE', (s, p) => { p('tail').anim.amp = 5; });
  broken('ANIM_PHASE_RANGE', (s, p) => { p('eye').anim.phase = 1.5; });
  broken('ANIM_SIDE_PHASE', (s, p) => { p('leg_r').anim.phase = 0; });
  broken('ANIM_NO_COUNTER_PHASE', (s, p) => { p('leg_r').anim.phase = 0.2; });
  broken('ANIM_ARM_PHASE', (s, p) => { p('arm_l').anim.phase = 0.5; });
  broken('ANIM_LIMB_SPLIT', (s) => { s.parts.push({ name: 'foot_l', shape: { kind: 'box', size: [0.16, 0.06, 0.2] }, zone: 'plastic', pos: [0.12, 0.03, -0.03], anim: { type: 'legWalk', axis: 'z', pivot: [0.12, 0.4, 0], phase: 0.25 } }); });
  broken('ANIM_INVISIBLE_AXIS', (s, p) => { p('antenna').anim.axis = 'z'; });
  broken('ANIM_BLINK_NOT_EMISSIVE', (s, p) => { p('plate').anim = { type: 'blink' }; });
  broken('ANIM_MALWARE_NO_JITTER', (s, p) => { delete p('horn').anim; });
  broken('ANIM_PICKUP_STILL', (s) => { s.category = 'pickup'; s.parts.forEach((p) => { if (['bob', 'spin', 'pulse', 'orbit'].includes(p.anim?.type)) delete p.anim; }); });

  check('ANIM_EVENT_MAP covers every KernelEvent with valid states; animReactionsFor picks the variant', () => {
    for (const type of EVENT_TYPES) if (!ANIM_EVENT_MAP.some((r) => r.event === type)) return `no row for ${type}`;
    for (const r of ANIM_EVENT_MAP) {
      if (!EVENT_TYPES.includes(r.event)) return `unknown event ${r.event}`;
      if (r.state && !ANIM_STATES[r.state]) return `unknown state ${r.state}`;
      if (!(r.durationMs >= 0 && r.delayMs >= 0 && r.beatMs >= 0 && r.shake >= 0)) return `bad timing in ${r.event}/${r.variant}`;
    }
    const pick = (ev) => animReactionsFor(ev).map((r) => `${r.role}:${r.state ?? '-'}`).join(',');
    const sig = (signal, outcome) => pick({ type: 'PROC_SIGNALED', pid: 666, signal, outcome });
    if (sig('SIGSTOP', 'FROZEN') !== 'subject:frozen') return sig('SIGSTOP', 'FROZEN');
    if (sig('SIGTERM', 'TRAPPED_ENRAGED') !== 'subject:enraged') return sig('SIGTERM', 'TRAPPED_ENRAGED');
    if (sig('SIGKILL', 'KILLED') !== 'subject:death,children:death') return sig('SIGKILL', 'KILLED');
    if (pick({ type: 'INODE_MODE_CHANGED', inodeId: 1, oldMode: 0o755, newMode: 0o644 }) !== 'subject:petrified') return 'chmod -x';
    const cd = (n, loop) => animReactionsFor({ type: 'ROOM_TRANSITION', fromDir: 1, toDir: 2, toPath: '/', upwardPanelsSmashed: n, viaSymlinkLoop: loop })[0].variant;
    if (cd(1, false) !== 'hop' || cd(3, false) !== 'panel_smash' || cd(0, true) !== 'eloop') return 'cd variants';
    return pick({ type: 'PLAYER_DAMAGED', amount: 5, hpRemaining: 10, sourceName: 'x' }) === 'source:attack,hero:hit' || 'PLAYER_DAMAGED';
  });

  check('animStateForActor: petrified > frozen > hidden > fallback', () => {
    const f = (o, fb) => animStateForActor({ hidden: false, ...o }, fb);
    return (f({}) === 'idle' && f({}, 'walk') === 'walk' && f({ alpha: 0.04 }) === 'hidden' && f({ hidden: true }) === 'hidden'
      && f({ frozen: true, alpha: 0.04 }) === 'frozen' && f({ petrified: true, frozen: true }) === 'petrified') || 'wrong priority';
  });

  const BESTIARY = ['malware.virus', 'malware.worm', 'malware.trojan', 'malware.bug', 'malware.exploit', 'malware.crack',
    'malware.ransomware', 'malware.spyware', 'malware.rootkit', 'malware.zombie', 'boss.forkbomb', 'boss.kernel'];
  check('ANIM_MALWARE_ACTING: a sheet for every enemy, attacks fit inside one tick, beats in order, deaths end gone', () => {
    const { ANIM_MALWARE_ACTING, ANIM_TICK_MS } = anim;
    for (const id of BESTIARY) {
      const s = ANIM_MALWARE_ACTING[id];
      if (!s || s.id !== id) return `no sheet for ${id}`;
      if (!(s.fps >= 6 && s.fps <= 12)) return `${id}: fps ${s.fps}`;
      if (s.attackEveryTicks > 0 && s.telegraphMs > s.attackEveryTicks * ANIM_TICK_MS) return `${id}: tell longer than the attack period`;
      for (const [state, over] of Object.entries(s.states)) {
        const def = { ...ANIM_STATES[state], ...over };
        const keys = def.keys ?? [];
        for (let i = 1; i < keys.length; i++) if (keys[i].at <= keys[i - 1].at) return `${id}.${state}: keys out of order`;
        if (!def.loop && keys.length && Math.abs(keys.at(-1).at - def.duration) > 1e-9) return `${id}.${state}: duration ${def.duration} != last key ${keys.at(-1).at}`;
        if (over.keys && state === 'attack') {
          if (def.duration * 1000 >= ANIM_TICK_MS) return `${id}: attack lasts a tick or more`;
          const beats = keys.map((k) => k.beat).filter(Boolean).join('>');
          if (beats !== 'anticipation>strike>recover') return `${id}: attack beats ${beats}`;
        }
        if (over.keys && state === 'death') {
          const last = keys.at(-1);
          if (last.beat !== 'gone' || last.opacity !== 0 || !keys.some((k) => k.beat === 'collapse')) return `${id}: death needs collapse and gone (opacity 0)`;
        }
      }
      if (id.startsWith('boss.') && !(s.phases?.length >= 3)) return `${id}: bosses need phases`;
    }
    if (Object.keys(ANIM_MALWARE_ACTING).length !== BESTIARY.length) return 'a sheet for an enemy that is not in the bestiary';
    const t = anim.animSteppedTravel;
    return (t(0) === 0 && t(0.3) === 0.25 && t(0.99) === 0.75 && t(1) === 1) || 'animSteppedTravel';
  });

  check('per-model acting: state overrides change the pose and timing, dropped frames, eye tracking', () => {
    const model = buildModel(makeSpec());
    const ends = [];
    const a = createAnimator(model, { ...anim.animActingOptions('malware.exploit'), facing: 1, onStateEnd: (s) => ends.push(s) });
    const plate = model.parts.get('plate');
    a.setState('attack');
    a.update(0.45);
    if (!(plate.position.x < -0.2)) return 'exploit wind-up is not held at 0.45 s';
    a.update(0.1);
    if (!(plate.position.x > 0.9)) return `exploit lunge reached only ${plate.position.x}`;
    a.update(0.5);
    if (ends.join() !== 'attack' || a.state !== 'idle') return 'override duration ignored';
    const z = buildModel(makeSpec());
    const slow = createAnimator(z, { ...anim.animActingOptions('malware.zombie'), state: 'walk' });
    slow.update(1 / 6 + 0.001);
    const s = snapshot(z);
    for (let i = 0; i < 8; i++) { slow.update(1 / 60); if (!same(s, snapshot(z))) return 'zombie is not held on sixes'; }
    const eye = model.parts.get('eye');
    a.setLook(0, 0);
    a.update(0.01);
    const x0 = eye.position.x;
    a.setLook(3, 0.05);
    a.update(0.01);
    if (!near(eye.position.x - x0, 0.02, 1e-9)) return `gaze moved ${eye.position.x - x0}`;
    a.setState('frozen');
    a.setLook(-3, 0);
    a.update(0.1);
    return near(eye.position.x - x0, 0.02, 1e-9) || 'a frozen eye still tracks';
  });

  {
    const ex = await vite.ssrLoadModule('/.kiro/skills/procedural-animation-3d/examples/tagged-model.ts');
    check('examples/tagged-model.ts runs against the real API', () => {
      const r = ex.runTaggedModelExample();
      if (r.issues.length) return `the example model has tag issues: ${r.issues.join('; ')}`;
      if (!(r.beats.anticipation > 0 && r.beats.strike < -0.3)) return `attack beats ${JSON.stringify(r.beats)}`;
      return (r.restState === 'hidden' && r.statesVisited.join() === 'walk,frozen') || `states ${r.statesVisited}, rest ${r.restState}`;
    });
    const mal = await vite.ssrLoadModule('/.kiro/skills/procedural-malware-animation/examples/malware-acting.ts');
    check('procedural-malware-animation/examples/malware-acting.ts: tell, bite, petrify, kill', () => {
      const r = mal.runMalwareActingExample();
      if (r.ticks.join() !== '2:telegraph,3:attack') return `ticks ${r.ticks}`;
      const want = ['attack:anticipation', 'attack:strike', 'attack:recover', 'attack -> idle', 'petrified:set', 'death:impact', 'death:collapse', 'death:gone', 'death -> held'];
      let at = -1;
      for (const w of want) { at = r.log.indexOf(w, at + 1); if (at < 0) return `log misses "${w}": ${r.log}`; }
      if (new Set(r.xs.map((x) => x.toFixed(4))).size !== 5) return `stepped travel made ${new Set(r.xs.map((x) => x.toFixed(4))).size} positions, not 5`;
      return (r.finalState === 'death' && r.deathProgress === 1) || `ended ${r.finalState} at ${r.deathProgress}`;
    });
  }

  // The whole procgen barrel must still export the animator (name clashes with other modules would break this).
  try {
    const all = await vite.ssrLoadModule('/src/procgen/index.ts');
    check('src/procgen/index.ts re-exports the animation API', () =>
      ['createAnimator', 'animPoseAt', 'validateAnimTags', 'ANIM_STATES', 'ANIM_EVENT_MAP'].every((n) => all[n] === anim[n]) || 'a name is missing or shadowed');
  } catch (err) {
    console.log(`SKIP src/procgen/index.ts could not be loaded (another module is broken): ${String(err).split('\n')[0]}`);
  }
}, '/src/procgen/anim/index.ts');

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : `\n     ${r.detail}`}`);
}
console.log(`\n${results.length - failed}/${results.length} cases passed`);
process.exitCode = failed ? 1 : 0;
