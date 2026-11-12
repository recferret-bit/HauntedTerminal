#!/usr/bin/env node
// Behaviour fingerprint of the whole procgen module: one hash per model / texture / FX preset, covering
// specs, validator reports, software rasters, built meshes, animator poses and emitter geometry.
// Refactors must keep this output byte-identical:
//   node scripts/quality/fingerprint.mjs > /tmp/after.txt && diff /tmp/before.txt /tmp/after.txt
import { createHash } from 'node:crypto';
import { withProcgen } from '../harness/lib/load.mjs';

const round = (k, v) => (k === 'ms' ? 0 : typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v instanceof Map ? [...v] : v);
const hash = (x) => createHash('sha1').update(typeof x === 'string' || x instanceof Uint8Array || x instanceof Uint8ClampedArray ? x : JSON.stringify(x, round)).digest('hex').slice(0, 12);

/** Transforms of every mesh under `root`, rounded: pose-sensitive and material-insensitive. */
function poseHash(root) {
  const rows = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.isMesh) rows.push([o.name, o.position.toArray(), o.rotation.toArray().slice(0, 3), o.scale.toArray(), o.material?.uniforms?.uEmissive?.value ?? null, o.material?.uniforms?.uOpacity?.value ?? null]); });
  return hash(rows);
}

await withProcgen(async (p) => {
  const out = [];
  for (const e of p.ModelCatalog.list()) {
    const spec = p.ModelCatalog.build(e.id, 1);
    const report = p.validateModel(e.id);
    const raster = p.rasterizeModel(spec, { size: 96, seed: 1 });
    const built = p.buildModel(spec, { seed: 1 });
    const poses = ['idle', 'walk', 'attack', 'hit', 'death', 'petrified', 'frozen', 'enraged'].map((state) => {
      const m = p.buildModel(spec, { seed: 1 });
      const a = p.createAnimator(m, { ...p.animActingOptions(e.id) });
      a.setState(state);
      a.seek(0.37);
      const h = poseHash(m.group);
      a.dispose();
      p.disposeModel(m);
      return h;
    });
    const animIssues = p.validateAnimTags(spec);
    out.push(`model   ${e.id.padEnd(28)} spec=${hash(spec)} report=${hash(report)} raster=${hash(raster.buffer?.data ?? raster.pixels?.data ?? raster)} mesh=${poseHash(built.group)} tags=${hash(animIssues)} poses=${hash(poses)}`);
    p.disposeModel(built);
  }
  for (const e of p.TextureCatalog.list()) {
    const buf = p.TextureCatalog.build(e.id, 1);
    out.push(`texture ${e.id.padEnd(28)} px=${hash(buf.data)} report=${hash(p.validateTexture(e, buf))}`);
  }
  for (const preset of p.FxCatalog.list()) {
    const mid = Math.round(p.fxTotalMs(preset) / 2);
    const frame = p.fxRenderFrame(preset, mid, {});
    const em = p.createFxEmitter(preset, { seed: 1 });
    em.seek(mid);
    out.push(`fx      ${preset.id.padEnd(28)} preset=${hash(preset)} report=${hash(p.validateFxPreset(preset))} sim=${hash(p.fxSimulate(preset, 1, mid))} frame=${hash(frame.data)} emitter=${poseHash(em.group)}`);
    em.dispose();
  }
  console.log(out.join('\n'));
});
