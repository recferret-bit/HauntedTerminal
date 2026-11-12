#!/usr/bin/env node
// Proves the FX validator catches what it claims: one known-good preset, then the same preset broken
// in one way per check, each with the code it must raise. Also checks the simulator is deterministic,
// the emitter builds without a DOM, and every shipped preset passes.
//   node .kiro/skills/particle-effect-validator/scripts/self-test.mjs
// Prints PASS/FAIL per case. Exit code 1 on any failure.
import { withProcgen } from '../../../../scripts/harness/lib/load.mjs';

await withProcgen(async (p) => {
  const good = () => ({
    id: 'fx.selftest',
    label: 'self-test hit',
    family: 'system',
    trigger: { event: 'COMMAND', moment: 'rm-ash', when: 'self-test' },
    anchor: 'center',
    durationMs: 400,
    layers: [
      { name: 'flash', role: 'primary', zone: 'powerAmber', shape: p.fxStarburst(8, 0.4, 0.2), count: 1, emit: 'burst', lifeMs: [250, 250], scale: [[0, 1.3], [0.34, 1], [0.67, 0.7]] },
      { name: 'chunk', role: 'secondary', zone: 'lockRed', shape: p.fxShard(0.26, 0.14), count: 7, emit: 'burst', speed: [2, 3], drag: 5, lifeMs: [250, 380], scale: [[0, 1], [0.6, 0.6]] },
      { name: 'glint', role: 'accent', zone: 'paper', shape: p.fxSparkle(0.12), count: 4, emit: 'ring', spawn: { radius: [0.5, 0.6] }, lifeMs: [160, 240], scale: [[0, 1], [0.5, 0.6]] },
    ],
    onomatopoeia: { text: 'ZAP!', zone: 'paper', style: 'burst', holdMs: 400 },
  });
  const layer = (preset, name) => preset.layers.find((l) => l.name === name);

  // [name, expected code (null = must be clean), mutation]
  const cases = [
    ['known-good preset is clean', null, () => {}],
    ['bad id', 'FX_ID', (x) => { x.id = 'sparkles'; }],
    ['single layer', 'FX_LAYERS', (x) => { x.layers = [x.layers[0]]; }],
    ['duplicate layer name', 'FX_LAYERS', (x) => { layer(x, 'glint').name = 'chunk'; }],
    ['no accent layer', 'FX_ROLES', (x) => { layer(x, 'glint').role = 'secondary'; }],
    ['no primary layer', 'FX_ROLES', (x) => { layer(x, 'flash').role = 'secondary'; }],
    ['accent bigger than the mass', 'FX_ROLE_BALANCE', (x) => { layer(x, 'glint').shape = p.fxSparkle(0.5); }],
    ['unknown zone', 'FX_ZONE', (x) => { layer(x, 'chunk').zone = 'lavaOrange'; }],
    ['system effect in malware colours', 'FX_FAMILY', (x) => { layer(x, 'chunk').zone = 'corruptMagenta'; }],
    ['system effect in the vibecoder\'s colours', 'FX_FAMILY', (x) => { layer(x, 'chunk').zone = 'hoodie'; }],
    ['malware effect without a malware zone', 'FX_FAMILY', (x) => { x.family = 'malware'; layer(x, 'flash').zone = 'paper'; layer(x, 'chunk').zone = 'solder'; layer(x, 'glint').zone = 'ink'; x.onomatopoeia.zone = 'paper'; }],
    ['primary and secondary nearly the same colour', 'FX_COLOR_SEPARATION', (x) => { layer(x, 'chunk').zone = 'gold'; }],
    ['primary invisible on the backdrop', 'FX_BG_CONTRAST', (x) => { layer(x, 'flash').zone = 'silicon'; }],
    ['particle fountain', 'FX_BUDGET', (x) => { layer(x, 'chunk').count = 140; }],
    ['triangle budget', 'FX_BUDGET', (x) => { layer(x, 'chunk').shape = { kind: 'sphere', radius: 0.1 }; layer(x, 'chunk').count = 20; }],
    ['only specks', 'FX_NO_BIG_SHAPE', (x) => { for (const l of x.layers) l.shape = p.fxBlock(0.1); }],
    ['one-shot lasting three seconds', 'FX_DURATION', (x) => { x.durationMs = 3000; }],
    ['smooth 60 fps motion', 'FX_STEPPED', (x) => { x.stepFps = 60; }],
    ['particles outlive the effect', 'FX_LINGER', (x) => { layer(x, 'chunk').lifeMs = [300, 900]; }],
    ['scale track not starting at 0', 'FX_KEYS', (x) => { layer(x, 'chunk').scale = [[0.2, 1]]; }],
    ['smooth fade drawn with many keys', 'FX_KEYS', (x) => { layer(x, 'chunk').alpha = [[0, 1], [0.1, 0.9], [0.2, 0.8], [0.3, 0.7], [0.4, 0.6], [0.5, 0.5], [0.6, 0.4]]; }],
    ['effect grows in instead of popping', 'FX_POP', (x) => { layer(x, 'flash').scale = [[0, 0.2], [0.3, 0.6], [0.6, 1.3]]; }],
    ['nothing on the first frame', 'FX_NO_POP', (x) => { for (const l of x.layers) l.delayMs = [100, 100]; x.durationMs = 520; }],
    ['sub-pixel dust', 'FX_SIZE', (x) => { layer(x, 'glint').shape = p.fxBlock(0.03); }],
    ['covers the panel without fullPanel', 'FX_EXTENT', (x) => { layer(x, 'chunk').speed = [14, 16]; layer(x, 'chunk').drag = 0; }],
    ['depth spread', 'FX_IN_PLANE', (x) => { layer(x, 'chunk').zSpread = 1.5; }],
    ['chunk deeper than it is wide', 'FX_IN_PLANE', (x) => { layer(x, 'chunk').shape = { kind: 'box', size: [0.2, 0.2, 0.6] }; }],
    ['cone without a direction', 'FX_EMIT', (x) => { layer(x, 'chunk').emit = 'cone'; }],
    ['implode without a start radius', 'FX_EMIT', (x) => { layer(x, 'chunk').emit = 'implode'; }],
    ['design-doc word missing', 'FX_WORD_REQUIRED', (x) => { x.trigger.moment = 'sigkill'; delete x.onomatopoeia; }],
    ['design-doc word changed', 'FX_WORD_REQUIRED', (x) => { x.trigger.moment = 'sigkill'; x.onomatopoeia.text = 'BOOM!'; }],
    ['lower-case word', 'FX_WORD_TEXT', (x) => { x.onomatopoeia.text = 'Zap!'; }],
    ['a sentence instead of a word', 'FX_WORD_TEXT', (x) => { x.onomatopoeia.text = 'THE PROCESS HAS BEEN KILLED'; }],
    ['word flashes by', 'FX_WORD_HOLD', (x) => { x.onomatopoeia.holdMs = 90; }],
    ['word too small to read', 'FX_WORD_SIZE', (x) => { x.onomatopoeia.size = 0.1; }],
    ['shake off the scale', 'FX_IMPACT', (x) => { x.shake = 9; }],
  ];

  let failed = 0;
  const check = (ok, name, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
    if (!ok) failed++;
  };

  for (const [name, code, mutate] of cases) {
    const preset = good();
    mutate(preset);
    const report = p.validateFxPreset(preset);
    const codes = [...new Set(report.issues.map((i) => i.code))];
    if (code === null) check(report.issues.length === 0, name, codes.join(', '));
    else check(codes.includes(code), `${name} -> ${code}`, codes.includes(code) ? '' : `got ${codes.join(', ') || 'nothing'}`);
  }

  // The multiplier x is the one lower-case letter a word may carry.
  const smash = good();
  smash.onomatopoeia.text = 'SMASH x3!';
  check(!p.validateFxPreset(smash).issues.some((i) => i.code === 'FX_WORD_TEXT'), 'multiplier `x3` is accepted');

  // Simulator: deterministic, seed-sensitive, stepped, and empty after the end.
  const preset = good();
  const a = JSON.stringify(p.fxSimulate(preset, 7, 130));
  check(a === JSON.stringify(p.fxSimulate(preset, 7, 130)), 'fxSimulate is deterministic for a seed');
  check(a !== JSON.stringify(p.fxSimulate(preset, 8, 130)), 'fxSimulate changes with the seed');
  check(JSON.stringify(p.fxSimulate(preset, 7, 90)) === JSON.stringify(p.fxSimulate(preset, 7, 160)), 'fxSimulate holds a pose between steps (12 fps)');
  check(p.fxSimulate(preset, 7, 0).length > 0, 'fxSimulate shows the hit on frame 1');
  check(p.fxSimulate(preset, 7, 420).length === 0, 'fxSimulate is empty after durationMs');
  check(p.fxWordState(preset, 0)?.scale > 1 && p.fxWordState(preset, 200)?.scale === 1 && p.fxWordState(preset, 400) === null, 'word pops, holds, cuts');

  // Emitter: builds in node, mirrors the simulator, finishes, disposes.
  const fx = p.createFxEmitter(preset, { seed: 7 });
  const visible = () => fx.group.getObjectByName('page').children.filter((c) => c.name !== 'word' && c.visible).length;
  check(visible() === p.fxSimulate(preset, 7, 0).length, 'createFxEmitter shows the simulated particles at t = 0');
  fx.update(130);
  check(visible() === p.fxSimulate(preset, 7, 130).length && !fx.done, 'createFxEmitter follows the simulator');
  fx.update(400);
  check(visible() === 0 && fx.done, 'createFxEmitter is done and empty after the effect');
  fx.dispose();

  // Preview: draws something, and the same thing twice.
  const frame = p.fxRenderFrame(preset, 0, { background: null });
  const inked = frame.data.reduce((n, v, i) => n + (i % 4 === 3 && v > 0 ? 1 : 0), 0);
  check(inked > 400, 'fxRenderFrame draws the first frame', `${inked} px`);
  check(Buffer.compare(Buffer.from(frame.data), Buffer.from(p.fxRenderFrame(preset, 0, { background: null }).data)) === 0, 'fxRenderFrame is deterministic');

  // The shipped catalog.
  const shipped = p.FxCatalog.list().map((e) => p.validateFxPreset(e));
  const bad = shipped.filter((r) => !r.pass);
  check(shipped.length > 0 && bad.length === 0, `all ${shipped.length} shipped presets pass`, bad.map((r) => r.id).join(', '));
  const catalog = p.validateFxCatalog();
  check(catalog.length === 0, 'every game moment has exactly one preset', catalog.map((i) => i.message).join('; '));

  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} particle-effect-validator self-test: ${failed} failure${failed === 1 ? '' : 's'}`);
  process.exitCode = failed === 0 ? 0 : 1;
});
