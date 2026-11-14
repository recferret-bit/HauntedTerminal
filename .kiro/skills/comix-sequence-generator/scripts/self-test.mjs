#!/usr/bin/env node
// Unit + edge-case self-test for comix-sequence-generator:
// Exercises expr.ts, timeline.ts, simulate.ts, catalog.ts, and check.ts across valid and malformed ComixPacks.
import assert from 'node:assert/strict';
import { withProcgen } from '../../../../scripts/harness/lib/load.mjs';

await withProcgen(async (_p, vite) => {
  const { cssHex, resolvePoint, resolveTime } = await vite.ssrLoadModule('/src/cinematic/expr.ts');
  const { activePanelAt, compileTimeline, resolveSkipTarget } = await vite.ssrLoadModule('/src/cinematic/timeline.ts');
  const { simulateComixPack } = await vite.ssrLoadModule('/src/cinematic/simulate.ts');
  const { findComixByRole, getComixPack, listComixPacks } = await vite.ssrLoadModule('/src/cinematic/catalog.ts');
  const { checkComixPack } = await vite.ssrLoadModule('/src/comix-editor/check.ts');
  const { ComixModel } = await vite.ssrLoadModule('/src/comix-editor/model.ts');

  // 1. Time & Point expression edge cases
  const cues = { STRIKE: 13.4, BURST: 24.3, ZERO: 0 };
  assert.equal(resolveTime('0', cues, 5), 0);
  assert.equal(resolveTime('12.5', cues, 5), 12.5);
  assert.equal(resolveTime('+0.3', cues, 7.5), 7.8);
  assert.equal(resolveTime('-0.5', cues, 7.5), 7.0);
  assert.equal(resolveTime('STRIKE', cues, 0), 13.4);
  assert.ok(Math.abs(resolveTime('STRIKE+0.35', cues, 0) - 13.75) < 1e-9);
  assert.ok(Math.abs(resolveTime('BURST-0.3', cues, 0) - 24.0) < 1e-9);
  assert.equal(resolveTime('ZERO+1.25', cues, 9), 1.25);
  assert.throws(() => resolveTime('NO_SUCH_CUE', cues, 0), /unknown comix cue/);
  assert.throws(() => resolveTime('STRIKE*2', cues, 0), /bad comix time expression/);
  assert.throws(() => resolveTime('', cues, 0), /bad comix time expression/);

  const pts = { tower: { x: 1, y: 2, z: 3 } };
  assert.deepEqual(resolvePoint('tower', pts, { x: 0.5, y: -1, z: 0 }), { x: 1.5, y: 1, z: 3 });
  assert.deepEqual(resolvePoint({ x: -2, y: 0, z: 1 }, pts), { x: -2, y: 0, z: 1 });
  assert.throws(() => resolvePoint('missing_pt', pts), /unknown comix point/);
  assert.equal(cssHex('#ffd166'), 0xffd166);
  assert.throws(() => cssHex('yellow'), /bad comix colour/);

  // 2. Compiled catalog packs (intro & outro) pass checkComixPack + 60fps simulation with 0 issues
  const packs = listComixPacks();
  assert.ok(packs.length >= 2, 'Expected at least intro and outro in compiled Comix catalog');
  for (const pack of packs) {
    const issues = checkComixPack(pack);
    assert.equal(issues.length, 0, `Expected 0 issues for ${pack.manifest.id}, got: ${JSON.stringify(issues)}`);
    const sim = simulateComixPack(pack);
    assert.equal(sim.ok, true, `Expected 60fps sim pass for ${pack.manifest.id}, got: ${sim.errors.join('; ')}`);
  }

  // 3. Declarative role lookup, stepped skip policy & activePanelAt boundaries
  assert.equal(findComixByRole('opening')?.id, 'intro');
  assert.equal(findComixByRole('ending')?.id, 'outro');
  assert.equal(findComixByRole('interlude'), undefined);

  const intro = getComixPack('intro');
  assert.ok(intro);
  assert.equal(resolveSkipTarget(compileTimeline(intro), 5.0), 'end');

  const outro = getComixPack('outro');
  assert.ok(outro);
  const outroTl = compileTimeline(outro);
  assert.equal(resolveSkipTarget(outroTl, 0.2), 9);
  assert.equal(resolveSkipTarget(outroTl, 9.2), 9.8);
  assert.equal(resolveSkipTarget(outroTl, 9.9), 9.9);
  assert.equal(activePanelAt(outroTl, 0)?.id, 'reverse_storm');
  assert.equal(activePanelAt(outroTl, 6.0)?.id, 'dawn_desk');
  assert.equal(activePanelAt(outroTl, 10.2)?.id, 'final_splash');

  // 3b. camera.to without explicit camera.span defaults cleanly to [panel.from, panel.until]
  const autoSpanPack = structuredClone(outro);
  autoSpanPack.pages[1].panels[0].camera.to = { x: 1.5, y: 2.0, w: 6.0, h: 3.8 };
  delete autoSpanPack.pages[1].panels[0].camera.span;
  const autoTl = compileTimeline(autoSpanPack);
  const splashPanel = autoTl.panels.find((p) => p.id === 'final_splash');
  assert.equal(splashPanel?.camera.spanFrom, 9);
  assert.equal(splashPanel?.camera.spanTo, 9.8);
  assert.equal(checkComixPack(autoSpanPack).length, 0);

  // 4. Negative invariants caught cleanly without throwing (conflicts, leaks, duplicates, bad refs)
  const badPack = structuredClone(outro);
  badPack.manifest.stage.background = 'not-a-hex';
  badPack.manifest.cast[0].at = 'missing_cast_pt';
  badPack.manifest.stage.fixtures.push({ kind: 'vortex', id: 'bad_vx', at: 'missing_vx_pt', z: 0, w: 1, h: 1 });
  badPack.pages[0].cues.TURN = 99; // conflicts with manifest.cues.TURN (9)
  badPack.pages[0].cues.SPLASH = 9.8; // duplicates manifest.cues.SPLASH (9.8)
  badPack.pages[0].cues.LOCAL_BEAT = 2.0;
  badPack.pages[1].cues = { ...(badPack.pages[1].cues ?? {}), LOCAL_BEAT: 9.2 }; // cross-page local cue collision
  badPack.pages[1].panels[0].id = 'reverse_storm'; // duplicate panel id across pages
  badPack.pages[0].panels[0].from = '6'; // > until ('5')
  badPack.pages[0].panels[0].letters.push(
    { kind: 'sfx', text: 'BOOM', at: '0.2', hold: 0.5, color: 'badhex', tilt: 0, anchor: 'point', size: 0.1 },
    { kind: 'bubble', text: 'HI', at: '0.2', style: 'speech', anchor: 'world', x: 0, y: 0, fontH: 0.05, fontW: 0.05, minFont: 12 },
  );
  badPack.pages[0].panels[0].tracks.push(
    {
      kind: 'fixture',
      fixture: 'nonexistent_vortex',
      from: '0',
      until: '12', // leaks past page 1 end (9s)
    },
    {
      kind: 'material_tint',
      target: 'room',
      zone: 'not_a_palette_zone',
      from: '0',
      until: '2',
      color: '#ff0055',
    },
  );
  badPack.pages[0].panels[0].beats.push(
    {
      kind: 'look',
      at: '0.2',
      actors: ['ghost_actor'],
      x: 0,
      y: 0,
    },
    {
      kind: 'state',
      at: '0.3',
      actors: ['hero'],
      state: 'backflip_invalid',
    },
  );

  const badIssues = checkComixPack(badPack);
  const msgs = badIssues.map((i) => i.message).join('\n');
  assert.ok(badIssues.some((i) => i.tab === 'stage' && i.message.includes('stage.background')), 'Must validate stage.background hex statically and route to stage tab');
  assert.ok(badIssues.some((i) => i.tab === 'letters' && i.message.includes('sfx.color')), 'Must validate letter hex statically even when compileTimeline fails');
  assert.ok(msgs.includes('collides with page-01-dawn-return.cues.LOCAL_BEAT'), 'Must flag cross-page duplicate local cue collision');
  assert.ok(msgs.includes('missing_cast_pt'), 'Must flag invalid PointRef on cast actor');
  assert.ok(msgs.includes('missing_vx_pt'), 'Must flag invalid PointRef on stage fixture');
  assert.ok(badIssues.some((i) => i.tab === 'cast' && i.message.includes('missing_cast_pt')), 'Must route cast PointRef error to cast tab');
  assert.ok(badIssues.some((i) => i.tab === 'stage' && i.message.includes('missing_vx_pt')), 'Must route fixture PointRef error to stage tab');
  assert.ok(msgs.includes('anchor "point" requires point'), 'Must flag sfx anchor=point without point');
  assert.ok(msgs.includes('anchor "world" requires tailPoint'), 'Must flag bubble anchor=world without tailPoint');
  assert.ok(msgs.includes('not_a_palette_zone'), 'Must flag unknown palette ZoneId');
  assert.ok(msgs.includes('backflip_invalid'), 'Must flag unknown AnimState');
  assert.ok(msgs.includes('conflicts with manifest.cues.TURN'), 'Must flag conflicting cue');
  assert.ok(msgs.includes('duplicates manifest.cues.SPLASH'), 'Must warn on duplicated cue');
  assert.ok(msgs.includes('duplicate panel id "reverse_storm"'), 'Must flag duplicate panel id');
  assert.ok(msgs.includes('must be > from'), 'Must flag inverted panel window');
  assert.ok(msgs.includes('leaks past page end'), 'Must warn when a track leaks across page boundaries');
  assert.ok(msgs.includes('nonexistent_vortex'), 'Must flag unknown stage fixture');
  assert.ok(msgs.includes('ghost_actor'), 'Must flag unknown actor in beat');

  // 5. Simulator numeric/division-by-zero & camera span edge cases when timeline compiles
  const simBad = structuredClone(outro);
  simBad.pages[0].panels[0].camera.to = { x: 1, y: 2, w: 6, h: 3.8 };
  simBad.pages[0].panels[0].camera.span = ['4', '1'];
  simBad.pages[0].panels[0].beats.push(
    { kind: 'fx_repeat', at: '0.2', preset: 'sparks', point: { x: 0, y: 1, z: 0 }, count: 0, step: 0 },
    { kind: 'key_clicks', from: '0.2', until: '1.0', hz: 0 },
  );
  simBad.pages[0].panels[0].letters.push(
    { kind: 'sfx_seq', words: ['ZAP'], from: '0.2', step: 0.2, hold: 0.4, color: '#ffd166', tilt: 0, point: { x: 0, y: 1, z: 0 }, dxMod: 0, dyMod: 1, size: 0.1 },
    { kind: 'prompt_list', items: ['ls'], from: '0.2', every: 0, x: 0.1, y: 0.1, lineStep: 0.05 },
    { kind: 'glitch_text', texts: ['ERR'], from: '0.2', step: 0 },
    { kind: 'tier_stack', rows: [{ who: 'T1', what: 'TEST', bg: '#ffd166', glow: 0 }], from: '0.2', step: 0 },
    { kind: 'caption', text: 'LATE', from: '1.0', until: '0.5' },
    { kind: 'invert', at: '0.2', fromOffset: 0.3, toOffset: 0.1 },
    { kind: 'panel_flash', at: '0.2', dur: 0.2, opacity: 1.5 },
  );
  simBad.pages[0].panels[0].tracks.push({
    kind: 'camera_shake',
    from: '2.0',
    until: '1.0',
    amp: 0.1,
  });
  const simRes = simulateComixPack(simBad);
  assert.equal(simRes.ok, false, 'Simulator must reject zero-step / inverted-span hazards');
  const simErrs = simRes.errors.join('\n');
  assert.ok(simErrs.includes('camera span end'), 'Must flag inverted camera span');
  assert.ok(simErrs.includes('fx_repeat requires'), 'Must flag invalid fx_repeat count/step');
  assert.ok(simErrs.includes('key_clicks hz'), 'Must flag zero key_clicks hz');
  assert.ok(simErrs.includes('sfx_seq requires'), 'Must flag zero sfx_seq dxMod');
  assert.ok(simErrs.includes('prompt_list every'), 'Must flag zero prompt_list every');
  assert.ok(simErrs.includes('glitch_text requires'), 'Must flag zero glitch_text step');
  assert.ok(simErrs.includes('tier_stack requires'), 'Must flag zero tier_stack step');
  assert.ok(simErrs.includes('caption until must be > from'), 'Must flag inverted caption window');
  assert.ok(simErrs.includes('invert toOffset must be > fromOffset'), 'Must flag inverted invert offsets');
  assert.ok(simErrs.includes('panel_flash requires'), 'Must flag out-of-range panel_flash opacity');
  assert.ok(simErrs.includes('track "camera_shake" until'), 'Must flag inverted track window');

  // 6. ComixModel.changedPaths detects modified, newly added, and deleted page files on disk
  const model = new ComixModel({
    slug: outro.manifest.id,
    manifest: structuredClone(outro.manifest),
    pages: outro.pages.map((spec) => ({ path: `pages/${spec.id}/page.spec.json`, spec: structuredClone(spec) })),
    etags: {
      'comix.manifest.json': 'h-m1',
      'pages/page-01-dawn-return/page.spec.json': 'h-p1',
      'pages/page-02-run-splash/page.spec.json': 'h-p2',
    },
  });
  assert.deepEqual(
    model.changedPaths({
      'comix.manifest.json': 'h-m1',
      'pages/page-01-dawn-return/page.spec.json': 'h-p1-mod',
      'pages/page-03-new/page.spec.json': 'h-p3',
    }).sort(),
    [
      'pages/page-01-dawn-return/page.spec.json',
      'pages/page-02-run-splash/page.spec.json',
      'pages/page-03-new/page.spec.json',
    ],
    'changedPaths must detect modified, deleted, and newly added spec paths',
  );

  console.log('comix-sequence-generator self-test PASS');
});
