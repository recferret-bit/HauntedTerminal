#!/usr/bin/env node
// Runs validateAnimTags over catalog models and plays every animator state on each (NaN check).
//   node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all
//   node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs hero.dev malware.bug
//   node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --category malware [--seed 3]
// Exits 1 if any model has an error (warnings do not fail).
import { withProcgen, parseArgs } from '../../../../scripts/harness/lib/load.mjs';

const args = parseArgs(process.argv.slice(2), ['--category', '--seed']);
const seed = Number(args.val('--seed', 1));

await withProcgen(async (p) => {
  const category = args.val('--category');
  const entries = args.rest.length
    ? args.rest.map((id) => p.ModelCatalog.get(id))
    : p.ModelCatalog.list(category);
  if (!args.rest.length && !args.flag('--all') && !category) {
    console.log('usage: check-tags.mjs --all | --category <c> | <model id>...');
    process.exitCode = 1;
    return;
  }
  let errors = 0;
  let warnings = 0;
  for (const entry of entries) {
    const spec = p.ModelCatalog.build(entry.id, seed);
    const issues = p.validateAnimTags(spec);
    const counts = {};
    for (const part of spec.parts) if (part.anim) counts[part.anim.type] = (counts[part.anim.type] ?? 0) + 1;

    // Play every state for half a second: nothing may go NaN, and reset() must restore the pose.
    const model = p.buildModel(spec, { textures: false });
    const rest = [...model.parts.values()].map((m) => m.position.toArray().join());
    const animator = p.createAnimator(model, p.animActingOptions(spec.id));
    for (const state of p.ANIM_STATE_IDS) {
      animator.setState(state);
      for (let i = 0; i < 30; i++) {
        animator.update(1 / 60);
        for (const mesh of model.parts.values()) {
          const v = [...mesh.position.toArray(), mesh.rotation.x, mesh.rotation.y, mesh.rotation.z, ...mesh.scale.toArray()];
          if (!v.every(Number.isFinite)) issues.push({ severity: 'error', code: 'ANIM_NAN', part: mesh.name, message: `not a number in state ${state}` });
        }
      }
    }
    animator.reset();
    if ([...model.parts.values()].some((m, i) => m.position.toArray().join() !== rest[i])) {
      issues.push({ severity: 'error', code: 'ANIM_RESET', part: '', message: 'reset() did not restore the authored pose' });
    }
    animator.dispose();
    p.disposeModel(model);

    const e = issues.filter((i) => i.severity === 'error').length;
    errors += e;
    warnings += issues.length - e;
    const tags = Object.entries(counts).map(([k, n]) => `${k} x${n}`).join(', ') || 'no tags';
    console.log(`${e ? 'FAIL' : 'PASS'} ${entry.id.padEnd(22)} ${tags}`);
    const seen = new Set();
    for (const i of issues) {
      const line = `     ${i.severity.toUpperCase()} ${i.code}${i.part ? ` [${i.part}]` : ''}: ${i.message}`;
      if (!seen.has(line)) console.log(line);
      seen.add(line);
    }
  }
  console.log(`\n${entries.length} models, ${errors} errors, ${warnings} warnings`);
  process.exitCode = errors ? 1 : 0;
});
