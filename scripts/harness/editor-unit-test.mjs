#!/usr/bin/env node
// Fast, deterministic unit & edge-case suite for shared `src/editor-core/`, `src/chapter-editor/`,
// `src/comix-editor/`, and `scripts/harness/lib/editor-api-common.mjs` (positive, negative, and corner cases).
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listChapterSlugs, readChapter } from './lib/chapter-compile.mjs';
import { listComixIds, readComix } from './lib/comix-compile.mjs';
import {
  assertLocalOrigin,
  assertPutPayload,
  HttpError,
  readJsonObjectBody,
  resolveSafeSpecTarget,
  writeAtomicText,
} from './lib/editor-api-common.mjs';
import { withProcgen } from './lib/load.mjs';
import { fakeReq, testRunner } from './lib/test-kit.mjs';

const { test, count } = testRunner();

await withProcgen(async (_procgen, vite) => {
  const dockState = await vite.ssrLoadModule('/src/editor-core/dock-state.ts');
  const formState = await vite.ssrLoadModule('/src/editor-core/form-state.ts');
  const schemaCheck = await vite.ssrLoadModule('/src/editor-core/schema-check.ts');
  const httpMod = await vite.ssrLoadModule('/src/editor-core/http.ts');
  const chapterModelMod = await vite.ssrLoadModule('/src/chapter-editor/chapter-model.ts');
  const chapterCheckMod = await vite.ssrLoadModule('/src/chapter-editor/check.ts');
  const chapterSuggestMod = await vite.ssrLoadModule('/src/chapter-editor/suggest.ts');
  const chapterSchemaMod = await vite.ssrLoadModule('/src/chapter-editor/schema.ts');
  const chapterSchemaScriptMod = await vite.ssrLoadModule('/src/chapter-editor/schema-script.ts');
  const actorMutatorMod = await vite.ssrLoadModule('/src/chapter-editor/actor-mutator.ts');
  const dialogRunnerMod = await vite.ssrLoadModule('/src/chapter-editor/dialog-runner.ts');
  const stageLayoutMod = await vite.ssrLoadModule('/src/renderer/stage-layout.ts');
  const stageConstMod = await vite.ssrLoadModule('/src/renderer/stage-const.ts');
  const viewMod = await vite.ssrLoadModule('/src/game/view.ts');
  const validatePackMod = await vite.ssrLoadModule('/src/chapters/validate-pack.ts');
  const comixModelMod = await vite.ssrLoadModule('/src/comix-editor/model.ts');
  const comixCheckMod = await vite.ssrLoadModule('/src/comix-editor/check.ts');
  const comixSelMod = await vite.ssrLoadModule('/src/comix-editor/selection.ts');
  const comixSchemaMod = await vite.ssrLoadModule('/src/comix-editor/schema.ts');

  console.log('=== [1/6] dock-state: sanitizeLayout & clamp corner cases ===');
  await test('sanitizeLayout handles null, primitives, NaN/Infinity, and out-of-range dimensions', () => {
    for (const bad of [null, undefined, 42, 'bad', [], true]) {
      const def = dockState.sanitizeLayout(bad, { leftWidth: 250, rightWidth: 410 });
      assert.equal(def.leftWidth, 250);
      assert.equal(def.rightWidth, 410);
      assert.equal(def.bottomHeight, null);
      assert.deepEqual(def.slots, { left: 'left', right: 'right', timeline: 'bottom' });
    }
    const clamped = dockState.sanitizeLayout({
      leftWidth: -999,
      rightWidth: 99999,
      bottomHeight: 12,
      slots: { left: 'right', right: 'left', timeline: 'float' },
      floats: {
        left: { x: -500, y: -200, w: 50, h: 20, z: Number.NaN },
        right: { x: Number.POSITIVE_INFINITY, y: 50, w: 400, h: 500, z: 40 },
      },
    });
    assert.equal(clamped.leftWidth, dockState.MIN_SIDE_W);
    assert.equal(clamped.rightWidth, dockState.clampSideWidth(99999));
    assert.equal(clamped.bottomHeight, dockState.MIN_BOTTOM_H);
    assert.deepEqual(clamped.slots, { left: 'right', right: 'left', timeline: 'float' });
    assert.ok(clamped.floats.left.x >= 4 && clamped.floats.left.y >= 4);
    assert.ok(clamped.floats.left.w >= 220 && clamped.floats.left.h >= 180);
  });

  await test('sanitizeLayout repairs duplicate side slots and illegal panel slot assignments', () => {
    const dupLeft = dockState.sanitizeLayout({
      slots: { left: 'left', right: 'left', timeline: 'left' },
    });
    assert.deepEqual(dupLeft.slots, { left: 'left', right: 'right', timeline: 'bottom' });

    const dupRight = dockState.sanitizeLayout({
      slots: { left: 'right', right: 'right', timeline: 'right' },
    });
    assert.deepEqual(dupRight.slots, { left: 'right', right: 'left', timeline: 'bottom' });

    const illegalSideBottom = dockState.sanitizeLayout({
      slots: { left: 'bottom', right: 'bottom', timeline: 'bottom' },
    });
    assert.deepEqual(illegalSideBottom.slots, { left: 'left', right: 'right', timeline: 'bottom' });
  });

  console.log('=== [2/6] form-state: remapArrayPaths & blankOf/blankUnion ===');
  await test('remapArrayPaths preserves open state across move up/down, duplicate, and remove (including nested paths)', () => {
    const open = new Set([
      'p1.panels[0]',
      'p1.panels[1]',
      'p1.panels[1].letters[2]',
      'p1.panels[2].beats[0]',
      'other.panels[0]',
      'p1.panelsExtra[0]',
      'p1.panels[bad]',
    ]);
    // Move index 1 up to 0: 0 <-> 1
    formState.remapArrayPaths(open, 'p1.panels', (idx) => (idx === 1 ? 0 : idx === 0 ? 1 : idx));
    assert.ok(open.has('p1.panels[0].letters[2]'));
    assert.ok(open.has('p1.panels[2].beats[0]'));
    assert.ok(open.has('other.panels[0]') && open.has('p1.panelsExtra[0]') && open.has('p1.panels[bad]'));

    // Duplicate at index 0 -> shifts idx > 0 by +1
    open.delete('p1.panels[1]');
    formState.remapArrayPaths(open, 'p1.panels', (idx) => (idx > 0 ? idx + 1 : idx));
    assert.ok(open.has('p1.panels[0]') && !open.has('p1.panels[1]'));
    assert.ok(open.has('p1.panels[3].beats[0]'));

    // Remove index 0 -> drops 0 and shifts >0 down by 1
    formState.remapArrayPaths(open, 'p1.panels', (idx) => (idx === 0 ? null : idx > 0 ? idx - 1 : idx));
    assert.ok(!open.has('p1.panels[0]') && !open.has('p1.panels[0].letters[2]'));
    assert.ok(open.has('p1.panels[2].beats[0]'));
  });

  await test('blankOf and blankUnion populate required defaults and omit optional keys', () => {
    const sampleFields = [
      { type: 'text', key: 'id', label: 'ID' },
      { type: 'text', key: 'note', label: 'Note', optional: true },
      { type: 'number', key: 'count', label: 'Count' },
      { type: 'bool', key: 'enabled', label: 'Enabled', defaultTrue: true },
      { type: 'select', key: 'mode', label: 'Mode', options: ['alpha', 'beta'] },
      { type: 'textOrVec', key: 'anchor', label: 'Anchor' },
      { type: 'color', key: 'tint', label: 'Tint' },
    ];
    const blank = formState.blankOf(sampleFields);
    assert.deepEqual(blank, {
      id: '',
      count: 0,
      enabled: true,
      mode: 'alpha',
      anchor: '',
      tint: '#000000',
    });
    assert.ok(!('note' in blank));
    const u = formState.blankUnion({ speech: [{ type: 'text', key: 'text', label: 'Text' }] }, 'speech');
    assert.deepEqual(u, { kind: 'speech', text: '' });
  });

  console.log('=== [3/6] schema-check & pack validators: positive, negative & finite-number checks ===');
  await test('SchemaWalk rejects NaN, Infinity, non-objects, unknown keys, bad pairs, and bad union kinds', () => {
    const fields = [
      { type: 'text', key: 'name', label: 'Name' },
      { type: 'number', key: 'dur', label: 'Duration' },
      { type: 'numbers', key: 'coords', label: 'Coords', optional: true },
      { type: 'pairs', key: 'aliases', label: 'Aliases', optional: true },
      { type: 'textOrVec', key: 'pos', label: 'Pos' },
      { type: 'record', key: 'cues', label: 'Cues', keyLabel: 'cue', value: 'number', optional: true },
      {
        type: 'union',
        key: 'action',
        label: 'Action',
        optional: true,
        union: () => ({ ping: [{ type: 'text', key: 'target', label: 'Target' }] }),
      },
    ];

    assert.equal(schemaCheck.objectShape(null, fields, 'root').length, 1);
    assert.equal(schemaCheck.objectShape({ name: 'ok', dur: 2.5, pos: 'desk' }, fields, 'root').length, 0);
    assert.equal(
      schemaCheck.objectShape({ name: 'ok', dur: 1, pos: { x: 1, y: 2, z: 3 }, cues: { start: 0 } }, fields, 'root').length,
      0,
    );

    const badIssues = schemaCheck.objectShape(
      {
        dur: Number.POSITIVE_INFINITY,
        coords: [1, Number.NaN],
        aliases: [['only-one']],
        pos: { x: 0, y: Number.NEGATIVE_INFINITY, z: 0 },
        cues: { broken: Number.NaN },
        action: { kind: 'unknown_kind' },
        typoField: 123,
      },
      fields,
      'root',
    );
    const msgs = badIssues.map((i) => i.message);
    assert.ok(msgs.some((m) => m.includes('root.name: required field is missing')));
    assert.ok(msgs.some((m) => m.includes('root.dur: expected a finite number')));
    assert.ok(msgs.some((m) => m.includes('root.coords: expected a list of finite numbers')));
    assert.ok(msgs.some((m) => m.includes('root.aliases: expected a list of [string, string]')));
    assert.ok(msgs.some((m) => m.includes('root.pos: expected a point name or {x, y, z}')));
    assert.ok(msgs.some((m) => m.includes('root.cues.broken: expected a finite number')));
    assert.ok(msgs.some((m) => m.includes('root.action.kind: unknown kind "unknown_kind"')));
    assert.ok(msgs.some((m) => m.includes('root.typoField: unknown field')));
  });

  await test('checkPack & checkComixPack pass real repo packs with 0 errors and catch broken references', () => {
    const chSlug = listChapterSlugs()[0];
    const chModel = new chapterModelMod.ChapterModel(readChapter(chSlug));
    const cleanChIssues = chapterCheckMod.checkPack(chModel.pack()).filter((i) => i.severity === 'error');
    assert.equal(cleanChIssues.length, 0, `Expected 0 errors on ${chSlug}, got ${JSON.stringify(cleanChIssues)}`);

    const brokenCh = chModel.pack();
    brokenCh.levels[0].enemies.push({ id: 'ghost-bad', type: 'nonexistent_enemy_kind', path: '/missing/dir' });
    brokenCh.levels[0].roomSeed = 0;
    brokenCh.levels[0].props = [{ id: 'dup', model: 'prop.missing_xyz', x: 3.5 }, { id: 'dup', model: 'prop.wire_loom', x: 4.1 }];
    brokenCh.levels[0].pickups.push({ id: 'gpu-bad', type: 'ssd', path: brokenCh.levels[0].files[0].path, model: 'pickup.missing_xyz' });
    brokenCh.levels[0].script = {
      ...(brokenCh.levels[0].script ?? {}),
      arrival: [
        { kind: 'spawn', entityId: 'ghost_orb', model: 'prop.fan', x: 2.2, y: 0.4, scale: [1.5, 1.5, 1.5], zOrder: 1, label: 'ORB' },
        { kind: 'spawn', entityId: '   ', model: 'prop.fan' },
        { kind: 'fx', preset: 'fx.missing_nope', x: 2.2, y: 1.0, text: 'WHOOSH' },
        { kind: 'despawn', entityId: 'ghost_orb' },
        { kind: 'set_flag', name: '  ' },
      ],
      locks: [
        { command: 'ls', args: 're:[', until: { kind: 'dialog_done' }, message: 'blocked' },
      ],
    };
    const brokenChIssues = chapterCheckMod.checkPack(brokenCh);
    assert.ok(brokenChIssues.some((i) => i.severity === 'error'));
    assert.ok(brokenChIssues.some((i) => i.tab === 'overview' && i.message.includes('roomSeed')));
    assert.ok(brokenChIssues.some((i) => i.tab === 'entities' && i.message.includes('duplicate prop id "dup"')));
    assert.ok(brokenChIssues.some((i) => i.tab === 'entities' && i.message.includes('prop.missing_xyz')));
    assert.ok(brokenChIssues.some((i) => i.tab === 'entities' && i.message.includes('pickup.missing_xyz')));
    assert.ok(brokenChIssues.some((i) => i.tab === 'script' && i.message.includes('spawn missing entityId')));
    assert.ok(brokenChIssues.some((i) => i.tab === 'script' && i.message.includes('fx.missing_nope')));
    assert.ok(brokenChIssues.some((i) => i.tab === 'script' && i.message.includes('set_flag')));
    assert.ok(brokenChIssues.some((i) => i.tab === 'script' && i.message.includes('args')));

    const suggest = chapterSuggestMod.makeSuggest(() => chModel.draft.levels[0]);
    const fxList = suggest('fx');
    assert.ok(Array.isArray(fxList) && fxList.includes('fx.sigkill') && fxList.every((id) => id.startsWith('fx.')));

    const variants = chapterSchemaScriptMod.STEP_VARIANTS();
    assert.ok(variants.spawn.some((f) => f.key === 'x') && variants.spawn.some((f) => f.key === 'scale'));
    assert.ok(variants.despawn.some((f) => f.key === 'entityId'));
    assert.ok(variants.fx.some((f) => f.key === 'preset' && f.suggest === 'fx'));
    assert.ok(variants.set_flag.some((f) => f.key === 'name'));
    const conds = chapterSchemaScriptMod.COND_VARIANTS();
    assert.ok(conds.ran_command.some((f) => f.key === 'flags') && conds.ran_command.some((f) => f.key === 'args'));
    assert.ok(Array.isArray(conds.dialog_done) && conds.flag.some((f) => f.key === 'name') && conds.not.some((f) => f.key === 'of'));
    const pickupKeys = chapterSchemaMod.PICKUP_FIELDS.map((f) => f.key);
    assert.ok(pickupKeys.includes('dropFromX') && pickupKeys.includes('dropFromY'));

    for (const cxSlug of listComixIds()) {
      const cxModel = new comixModelMod.ComixModel(readComix(cxSlug));
      const errs = comixCheckMod.checkComixPack(cxModel.pack()).filter((i) => i.severity === 'error');
      assert.equal(errs.length, 0, `Expected 0 errors on comix/${cxSlug}, got ${JSON.stringify(errs)}`);
    }

    const cxModel = new comixModelMod.ComixModel(readComix(listComixIds()[0]));
    const brokenCx = structuredClone(cxModel.pack());
    brokenCx.manifest.cast.push({ id: 'bad-actor', model: 'nonexistent_3d_model_xyz', at: 'missing_point' });
    const brokenCxIssues = comixCheckMod.checkComixPack(brokenCx);
    assert.ok(brokenCxIssues.some((i) => i.message.includes('nonexistent_3d_model_xyz')));
    assert.ok(brokenCxIssues.some((i) => i.message.includes('missing_point')));
  });

  console.log('=== [4/6] ChapterModel & ComixModel: baselines, identity preservation & disk change detection ===');
  await test('ChapterModel preserves immutable ids/indices on replace() and detects modified/added/deleted disk files', () => {
    const chFiles = readChapter(listChapterSlugs()[0]);
    const model = new chapterModelMod.ChapterModel(chFiles);
    assert.deepEqual(model.dirtyKeys(), []);

    const lvl0 = model.draft.levels[0];
    const origId = lvl0.id;
    const origIdx = lvl0.index;
    model.replace(`level:${origId}`, { ...structuredClone(lvl0), id: 'corrupted-id', index: 999, title: 'Updated Title' });
    assert.equal(model.draft.levels[0].id, origId, 'level.id must be preserved on raw JSON replace');
    assert.equal(model.draft.levels[0].index, origIdx, 'level.index must be preserved on raw JSON replace');
    assert.equal(model.isDirty(`level:${origId}`), true);

    model.syncSummaries();
    assert.equal(model.draft.manifest.levels.find((s) => s.id === origId)?.title, 'Updated Title');

    model.revert(`level:${origId}`);
    model.revert('manifest');
    assert.deepEqual(model.dirtyKeys(), []);

    // Disk change detection: clean -> modified -> added -> deleted
    assert.deepEqual(model.changedOnDisk(chFiles.etags), []);
    const modEtags = { ...chFiles.etags, 'chapter.manifest.json': 'deadbeef' };
    assert.deepEqual(model.changedOnDisk(modEtags), ['chapter.manifest.json']);
    const addedEtags = { ...chFiles.etags, 'levels/level-99-secret/level.spec.json': 'cafebabe' };
    assert.deepEqual(model.changedOnDisk(addedEtags), ['levels/level-99-secret/level.spec.json']);
    const removedEtags = { ...chFiles.etags };
    delete removedEtags['chapter.manifest.json'];
    assert.deepEqual(model.changedOnDisk(removedEtags), ['chapter.manifest.json']);
  });

  await test('ComixModel preserves manifest/page identity on replace() and syncs page summaries accurately', () => {
    const cxFiles = readComix(listComixIds()[0]);
    const model = new comixModelMod.ComixModel(cxFiles);
    assert.equal(model.anyDirty(), false);

    const p0 = model.draft.pages[0];
    const origPageId = p0.id;
    const origIndex = p0.index;
    model.replace(`page:${origPageId}`, { ...structuredClone(p0), id: 'wrong-page-id', index: 77, title: 'Edited Page' });
    assert.equal(model.draft.pages[0].id, origPageId);
    assert.equal(model.draft.pages[0].index, origIndex);
    assert.equal(model.dirty(`page:${origPageId}`), true);

    model.replace('manifest', { ...structuredClone(model.draft.manifest), id: 'wrong-manifest-id' });
    assert.equal(model.draft.manifest.id, cxFiles.slug);

    model.syncSummaries();
    assert.equal(model.draft.manifest.pages.find((s) => s.id === origPageId)?.title, 'Edited Page');

    model.revert(`page:${origPageId}`);
    model.revert('manifest');
    assert.equal(model.anyDirty(), false);
  });

  console.log('=== [5/6] comix-editor selection: routeForElement, resolveSelectionFromPath & visibilityJump ===');
  await test('Every ComixElementKind routes to a real tab in COMIX_TABS/PAGE_TABS and round-trips itemPath', () => {
    const validManifestTabs = new Set(['manifest', 'stage', 'cast', 'json', 'check']);
    const validPageTabs = new Set(['overview', 'panels', 'letters', 'beats', 'json', 'check']);
    assert.ok(comixSchemaMod.PAGE_TRACKS_FIELD.key === 'tracks');

    const pack = structuredClone(new comixModelMod.ComixModel(readComix('intro')).pack());
    // Ensure in-memory pack has at least one prop, fixture, overlay, letter, beat, track & page_track
    const pointId = Object.keys(pack.manifest.stage.points)[0];
    if (!pack.manifest.stage.props?.length) {
      pack.manifest.stage.props = [{ id: 'test-prop', model: pack.manifest.cast[0].model, at: pointId }];
    }
    if (!pack.manifest.stage.fixtures?.length) {
      pack.manifest.stage.fixtures = [{ kind: 'vortex', id: 'test-fx', at: pointId, color: '#06d6a0' }];
    }
    const p0 = pack.pages[0];
    p0.overlays = [{ kind: 'title_card', title: 'TEST', at: p0.from, until: p0.from + 1 }];
    p0.tracks = [{ kind: 'camera_shake', from: p0.from, until: p0.from + 0.5, intensity: 0.02 }];
    const panel0 = p0.panels[0];
    if (!panel0.letters?.length) panel0.letters = [{ kind: 'caption', text: 'cap', at: p0.from, until: p0.from + 1 }];
    if (!panel0.beats?.length) panel0.beats = [{ kind: 'flash', at: p0.from, color: '#ffffff' }];
    if (!panel0.tracks?.length) panel0.tracks = [{ kind: 'camera_shake', from: p0.from, until: p0.from + 0.5, intensity: 0.01 }];
    const testPack = pack;
    const actorId = testPack.manifest.cast[0].id;
    const propId = testPack.manifest.stage.props[0].id;
    const fixtureId = testPack.manifest.stage.fixtures[0].id;

    const samples = [
      { kind: 'actor', actorId, label: `actor:${actorId}` },
      { kind: 'prop', propId, label: `prop:${propId}` },
      { kind: 'fixture', fixtureId, label: `fixture:${fixtureId}` },
      { kind: 'point', pointId, label: `point:${pointId}` },
      { kind: 'overlay', pageId: p0.id, itemIndex: 0, label: 'overlay:title_card' },
      { kind: 'panel', pageId: p0.id, panelId: panel0.id, panelIndex: 0, label: `panel:${panel0.id}` },
      { kind: 'letter', pageId: p0.id, panelId: panel0.id, panelIndex: 0, itemIndex: 0, label: 'letter:0' },
      { kind: 'beat', pageId: p0.id, panelId: panel0.id, panelIndex: 0, itemIndex: 0, label: 'beat:0' },
      { kind: 'track', pageId: p0.id, panelId: panel0.id, panelIndex: 0, itemIndex: 0, label: 'track:0' },
      { kind: 'page_track', pageId: p0.id, itemIndex: 0, label: 'page-track:camera_shake' },
    ];

    for (const ref of samples) {
      const route = comixSelMod.routeForElement(testPack, ref);
      if (route.target === 'manifest') {
        assert.ok(validManifestTabs.has(route.tab), `Invalid manifest tab "${route.tab}" for ${ref.kind}`);
      } else {
        assert.ok(validPageTabs.has(route.tab), `Invalid page tab "${route.tab}" for ${ref.kind}`);
      }
      assert.equal(route.openPaths.length, 1, `Expected 1 openPath for ${ref.kind}`);
      const resolved = comixSelMod.resolveSelectionFromPath(testPack, route.openPaths[0]);
      assert.ok(resolved, `resolveSelectionFromPath returned null for ${route.openPaths[0]}`);
      assert.equal(resolved.kind, ref.kind);
    }

    // Specific regression check for page_track -> 'beats' tab
    const pageTrackRoute = comixSelMod.routeForElement(testPack, {
      kind: 'page_track',
      pageId: p0.id,
      itemIndex: 0,
      label: 'page-track:0',
    });
    assert.equal(pageTrackRoute.tab, 'beats');
    assert.deepEqual(pageTrackRoute.openPaths, [`${p0.id}.tracks.tracks[0]`]);

    // Malformed / unknown paths & visibility jumps
    assert.equal(comixSelMod.resolveSelectionFromPath(testPack, ''), null);
    assert.equal(comixSelMod.resolveSelectionFromPath(testPack, 'manifest.unknown[abc]'), null);
    const jumpFromOtherPage = comixSelMod.visibilityJumpForElement(
      testPack,
      { kind: 'panel', pageId: p0.id, panelId: panel0.id, panelIndex: 0, label: 'p' },
      testPack.manifest.durationSec - 0.1,
    );
    assert.ok(typeof jumpFromOtherPage === 'number' && jumpFromOtherPage >= p0.from && jumpFromOtherPage < p0.until);
    const noJumpWhenVisible = comixSelMod.visibilityJumpForElement(
      testPack,
      { kind: 'panel', pageId: p0.id, panelId: panel0.id, panelIndex: 0, label: 'p' },
      jumpFromOtherPage,
    );
    assert.equal(noJumpWhenVisible, null);
  });

  console.log('=== [6/6] HTTP client & dev API security/atomic-write corner cases ===');
  await test('requestEditorJson handles 200 JSON, 409 ConflictError, non-JSON 500 HTML, and bad 200 payloads', async () => {
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, value: 7 }), { status: 200 });
      const ok = await httpMod.requestEditorJson('/api/test');
      assert.deepEqual(ok, { ok: true, value: 7 });

      globalThis.fetch = async () => new Response('plain text conflict', { status: 409, statusText: 'Conflict' });
      await assert.rejects(
        () => httpMod.requestEditorJson('/api/test', undefined, 'fallback conflict'),
        (err) => err instanceof httpMod.ConflictError && err.message === 'fallback conflict',
      );

      globalThis.fetch = async () =>
        new Response('<html><body>502 Bad Gateway</body></html>', { status: 502, statusText: 'Bad Gateway' });
      await assert.rejects(
        () => httpMod.requestEditorJson('/api/test'),
        (err) => err instanceof Error && err.message === '502 Bad Gateway',
      );

      globalThis.fetch = async () => new Response('not-json', { status: 200 });
      await assert.rejects(
        () => httpMod.requestEditorJson('/api/test'),
        (err) => err instanceof Error && err.message.includes('Invalid JSON'),
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  await test('editor-api-common enforces Host/Origin, JSON object bodies, baseEtag string, path sandbox & atomic writes', async () => {
    // Host & Origin checks
    assert.doesNotThrow(() => assertLocalOrigin(fakeReq({ host: 'localhost:5173' }), 'test'));
    assert.doesNotThrow(() =>
      assertLocalOrigin(fakeReq({ host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173' }), 'test'),
    );
    assert.doesNotThrow(() => assertLocalOrigin(fakeReq({ host: '[::1]:5173', origin: 'http://[::1]:5173' }), 'test'));
    assert.throws(() => assertLocalOrigin(fakeReq({ host: 'evil.example.com' }), 'test'), (e) => e.status === 403);
    assert.throws(
      () => assertLocalOrigin(fakeReq({ host: 'localhost:5173', origin: 'http://evil.example.com' }), 'test'),
      (e) => e.status === 403,
    );
    assert.throws(() => assertLocalOrigin(fakeReq({ host: 'localhost:5173', origin: 'null' }), 'test'), (e) => e.status === 403);

    // Body parsing: Content-Type, invalid JSON, null/array/primitive JSON
    assert.throws(
      () => readJsonObjectBody(fakeReq({ contentType: 'text/plain', body: '{}' })),
      (e) => e instanceof HttpError && e.status === 415,
    );
    await assert.rejects(() => readJsonObjectBody(fakeReq({ body: '{broken' })), (e) => e.status === 400);
    for (const nonObj of ['null', '[]', '"str"', '123', 'true']) {
      await assert.rejects(
        () => readJsonObjectBody(fakeReq({ body: nonObj })),
        (e) => e instanceof HttpError && e.status === 400 && e.message.includes('JSON object'),
      );
    }

    // assertPutPayload
    assert.throws(() => assertPutPayload({ json: null }), (e) => e.status === 400);
    assert.throws(() => assertPutPayload({ json: [] }), (e) => e.status === 400);
    assert.throws(() => assertPutPayload({ json: {}, baseEtag: 12345 }), (e) => e.status === 400);
    assert.doesNotThrow(() => assertPutPayload({ json: { ok: 1 }, baseEtag: 'abc123' }));

    // Temp directory sandbox & concurrent atomic writes
    const tmpRoot = mkdtempSync(join(tmpdir(), 'ht-editor-unit-'));
    try {
      const slugDir = join(tmpRoot, 'pack-a');
      writeAtomicText(join(tmpRoot, 'bootstrap.txt'), 'init');
      rmSync(join(tmpRoot, 'bootstrap.txt'));
      const { mkdirSync, writeFileSync } = await import('node:fs');
      mkdirSync(slugDir, { recursive: true });
      const manifestFile = join(slugDir, 'comix.manifest.json');
      writeFileSync(manifestFile, '{"id":"pack-a"}\n');

      const resolved = resolveSafeSpecTarget({
        slug: 'pack-a',
        knownSlugs: ['pack-a'],
        kindLabel: 'comix',
        relPath: 'comix.manifest.json',
        writableRe: /^comix\.manifest\.json$/,
        rootDir: tmpRoot,
      });
      assert.equal(resolved, manifestFile);

      assert.throws(
        () =>
          resolveSafeSpecTarget({
            slug: 'pack-a',
            knownSlugs: ['pack-a'],
            kindLabel: 'comix',
            relPath: '../escape.json',
            writableRe: /.*/,
            rootDir: tmpRoot,
          }),
        (e) => e.status === 400,
      );
      assert.throws(
        () =>
          resolveSafeSpecTarget({
            slug: 'unknown',
            knownSlugs: ['pack-a'],
            kindLabel: 'comix',
            relPath: 'comix.manifest.json',
            writableRe: /^comix\.manifest\.json$/,
            rootDir: tmpRoot,
          }),
        (e) => e.status === 404,
      );

      await Promise.all(
        Array.from({ length: 12 }, (_, idx) =>
          Promise.resolve().then(() => writeAtomicText(manifestFile, JSON.stringify({ step: idx }))),
        ),
      );
      assert.ok(existsSync(manifestFile));
      const parsedFinal = JSON.parse(readFileSync(manifestFile, 'utf8'));
      assert.equal(typeof parsedFinal.step, 'number');
      const leftovers = readdirSync(slugDir).filter((name) => name.endsWith('.tmp'));
      assert.deepEqual(leftovers, [], 'Expected zero leftover .tmp files after concurrent atomic writes');
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  console.log('=== [7/9] stage-layout: unplaceX / unplaceY exact inverse round-trips ===');
  await test('unplaceX and unplaceY invert placeX and feetY + y across symmetric and asymmetric panels', () => {
    const stages = [
      { panelLeft: 4.9, panelRight: -1.15, feetY: 0.5 },
      { panelLeft: 6.4, panelRight: -2.8, feetY: 0.35 },
      { panelLeft: 3.1, panelRight: -0.4, feetY: 1.1 },
    ];
    for (const stage of stages) {
      for (const designX of [stageConstMod.DESIGN_RIGHT, -0.5, 0, 1.5, 2.75, 4.2, stageConstMod.DESIGN_LEFT]) {
        const wx = stageLayoutMod.placeX(stage, designX);
        const backX = stageLayoutMod.unplaceX(stage, wx);
        assert.ok(Math.abs(backX - designX) < 1e-9, `unplaceX round-trip failed for ${designX}: got ${backX}`);
      }
      for (const designY of [-0.5, 0, 0.35, 1.8]) {
        const backY = stageLayoutMod.unplaceY(stage, stage.feetY + designY);
        assert.ok(Math.abs(backY - designY) < 1e-9, `unplaceY round-trip failed for ${designY}: got ${backY}`);
      }
    }
  });

  console.log('=== [8/9] actor-mutator: mapping, socket detach, hero upgrade, + Add to Level ===');
  await test('resolveActorTarget, applyStageTransformPatch, actorIdForItemPath, and addObjectToLevel cover every spec slot', () => {
    const slug = listChapterSlugs()[0];
    const ch = readChapter(slug);
    const pack = structuredClone({ manifest: ch.manifest, levels: ch.levels.map((l) => l.spec), dialogs: ch.dialogs, comix: ch.comix });
    const lvl1 = pack.levels[0];
    const cwd = lvl1.cwd;

    // 1. Numeric hero upgrades to object when y/scale/rotation edited, stays clean when x-only
    lvl1.stage = { ...(lvl1.stage ?? {}), hero: 4.1 };
    const rHeroX = actorMutatorMod.applyStageTransformPatch(pack, lvl1, cwd, { actorId: 'vibecoder', x: 3.5, y: null, commit: true });
    assert.equal(rHeroX?.kind, 'hero');
    assert.equal(lvl1.stage.hero, 3.5);
    actorMutatorMod.applyStageTransformPatch(pack, lvl1, cwd, { actorId: 'vibecoder', x: 3.2, y: 0.4, scale: 1.2, rotation: 15, commit: true });
    assert.deepEqual(lvl1.stage.hero, { x: 3.2, y: 0.4, scale: 1.2, rotation: 15 });
    assert.equal(actorMutatorMod.actorIdForItemPath(pack, lvl1, cwd, `${lvl1.id}.overview.stage.hero`), 'vibecoder');

    // 2. Entry port upgrades and detaches socket
    lvl1.stage.entryPort = { socket: 'door.left', x: 4.8 };
    const rEntry = actorMutatorMod.applyStageTransformPatch(pack, lvl1, cwd, { actorId: 'door:entry', portRole: 'entry', x: 4.4, detachSocket: true, commit: true });
    assert.equal(rEntry?.kind, 'entryPort');
    assert.equal(lvl1.stage.entryPort.x, 4.4);
    assert.equal('socket' in lvl1.stage.entryPort, false);

    // 2b. Unset hero scale-only edit defaults x=2.4; unset entryPort scale-only preserves door.left & 4.37
    delete lvl1.stage.hero;
    actorMutatorMod.applyStageTransformPatch(pack, lvl1, cwd, { actorId: 'vibecoder', scale: 1.25, commit: true });
    assert.deepEqual(lvl1.stage.hero, { x: 2.4, scale: 1.25 });
    delete lvl1.stage.entryPort;
    actorMutatorMod.applyStageTransformPatch(pack, lvl1, cwd, { actorId: 'door:entry', portRole: 'entry', scale: 1.2, commit: true });
    assert.equal(lvl1.stage.entryPort.socket, 'door.left');
    assert.equal(lvl1.stage.entryPort.x, 4.37);
    assert.equal(lvl1.stage.entryPort.scale, 1.2);

    // 2c. view.buildRoom respects detached entryPort & exit door explicit x without snapping back to sockets
    const detachedRoom = viewMod.buildRoom({
      floor: 1,
      cwd: '/tmp/test-room',
      hp: 5,
      maxHp: 5,
      held: [],
      lantern: false,
      flood: 0,
      xray: false,
      entryPort: { x: 3.84 },
      things: [{ name: 'exit', type: 'dir', open: false, x: 1.5 }],
      exits: { exit: false },
      entities: [],
    });
    const entryActor = detachedRoom.actors.find((a) => a.id === 'door:entry');
    const exitActor = detachedRoom.actors.find((a) => a.id === 'door:exit');
    assert.equal(entryActor?.x, 3.84);
    assert.equal(entryActor?.socket, undefined);
    assert.equal(exitActor?.x, 1.5);
    assert.equal(exitActor?.socket, undefined);

    const defaultRoom = viewMod.buildRoom({
      floor: 1,
      cwd: '/tmp/test-room-default',
      hp: 5,
      maxHp: 5,
      held: [],
      lantern: false,
      flood: 0,
      xray: false,
      entryPort: {},
      things: [{ name: 'exit', type: 'dir', open: false }],
      exits: { exit: false },
      entities: [],
    });
    assert.equal(defaultRoom.actors.find((a) => a.id === 'door:entry')?.socket, 'door.left');
    assert.equal(defaultRoom.actors.find((a) => a.id === 'door:exit')?.socket, 'door.right');

    // 3. Kiro clears target when dragged in X
    lvl1.stage.kiro = { target: 'app.py', x: 2.0 };
    actorMutatorMod.applyStageTransformPatch(pack, lvl1, cwd, { actorId: 'kiro', x: 2.6, y: 0.5, commit: true });
    assert.equal(lvl1.stage.kiro.x, 2.6);
    assert.equal(lvl1.stage.kiro.y, 0.5);
    assert.equal('target' in lvl1.stage.kiro, false);

    // 4. Backing file socket detach + scale/rotation + reverse lookup
    const firstFileIdx = lvl1.files.findIndex((f) => f.kind === 'dir' || f.kind === 'socket' || f.kind === 'file');
    if (firstFileIdx >= 0) {
      const f = lvl1.files[firstFileIdx];
      const base = f.path.split('/').pop();
      f.socket = 'door.right';
      const prefix = f.kind === 'dir' ? 'door' : f.kind === 'socket' ? 'sock' : 'file';
      const rFile = actorMutatorMod.applyStageTransformPatch(pack, lvl1, cwd, {
        actorId: `${prefix}:${base}`,
        target: base,
        x: 1.1,
        detachSocket: true,
        scale: 1.3,
        commit: true,
      });
      assert.equal(rFile?.kind, 'file');
      assert.equal(f.x, 1.1);
      assert.equal('socket' in f, false);
      assert.equal(f.scale, 1.3);
    }

    // 5. Boss cameo + outro actor transforms
    const bossLevel = pack.levels.find((l) => l.mechanic === 'boss');
    if (bossLevel) {
      const rCameo = actorMutatorMod.applyStageTransformPatch(pack, bossLevel, bossLevel.cwd, { actorId: 'boss:cameo', x: -0.9, y: 0.25, commit: true });
      assert.equal(rCameo?.target, 'chapter');
      assert.equal(pack.manifest.boss.cameoTransform?.x, -0.9);
    }
    const outroActor = pack.manifest.outro?.actors?.[0];
    if (outroActor) {
      const rOutro = actorMutatorMod.applyStageTransformPatch(pack, lvl1, cwd, { actorId: outroActor.id, x: 2.2, rotation: -10, commit: true });
      assert.equal(rOutro?.kind, 'outro');
      assert.equal(outroActor.x, 2.2);
      assert.equal(outroActor.rotation, -10);
    }

    // 6. + Add to Level presets pass validatePack cleanly
    for (const preset of ['prop', 'enemy', 'pickup', 'pickup:ssd', 'pickup:tensor_gpu', 'door', 'socket']) {
      const added = actorMutatorMod.addObjectToLevel(lvl1, cwd, preset);
      assert.ok(added.actorId.length > 0 && added.itemPath.startsWith(lvl1.id));
    }
    const packIssues = validatePackMod.validatePack(pack);
    const addErrors = packIssues.filter((i) => i.where === lvl1.id && i.level === 'error');
    assert.deepEqual(addErrors, [], `Expected zero validation errors after + Add to Level presets, got: ${JSON.stringify(addErrors)}`);
  });

  console.log('=== [9/9] dialog-runner: collectDialogCatalog & playback state ===');
  await test('collectDialogCatalog indexes dialogs.json, arrival, timed, triggers, tutorial, riddles, and manifest beats', () => {
    const slug = listChapterSlugs()[0];
    const ch = readChapter(slug);
    const pack = structuredClone({ manifest: ch.manifest, levels: ch.levels.map((l) => l.spec), dialogs: ch.dialogs, comix: ch.comix });
    const lvl1 = pack.levels[0];
    const catalog1 = dialogRunnerMod.collectDialogCatalog(pack, lvl1);
    assert.ok(catalog1.some((b) => b.id === 'dialogs:banner'));
    assert.ok(catalog1.some((b) => b.id === 'dialogs:agentTaunt'));
    assert.ok(catalog1.some((b) => b.id.startsWith('dialogs:hankRungs:')));
    assert.ok(catalog1.some((b) => b.id.startsWith('arrival:')));
    assert.ok(catalog1.some((b) => b.id.startsWith('tutorial:')));
    assert.ok(catalog1.some((b) => b.id.startsWith('outro:')));

    const riddleLvl = pack.levels.find((l) => (l.riddles?.length ?? 0) > 0);
    if (riddleLvl) {
      const catRiddle = dialogRunnerMod.collectDialogCatalog(pack, riddleLvl);
      assert.ok(catRiddle.some((b) => b.id.startsWith('riddle:')));
    }

    const played = [];
    let cleared = 0;
    const runner = dialogRunnerMod.createDialogRunner(() => ({
      clearDialogs: () => { cleared += 1; },
      playBeat: (events) => { played.push(events); },
    }));
    const targetBeat = catalog1[0];
    assert.equal(runner.runSpecific(catalog1, targetBeat.id), true);
    assert.equal(cleared, 1);
    assert.equal(played.length, 1);
    runner.stop();
    assert.equal(cleared, 2);

    // Narrative sequence excludes hankRungs/bossKill/pickup/outro and orders banner -> arrival -> timed -> agentTaunt -> tutorial -> completion
    const narrative = dialogRunnerMod.collectNarrativeSequence(pack, lvl1);
    assert.ok(narrative.length >= 2);
    assert.equal(narrative.some((b) => b.id.startsWith('dialogs:hankRungs:') || b.id.startsWith('outro:')), false);
    const ids = narrative.map((b) => b.id);
    const idxBanner = ids.indexOf('dialogs:banner');
    const idxArrival = ids.findIndex((id) => id.startsWith('arrival:'));
    const idxCompletion = ids.indexOf('dialogs:completion');
    if (idxBanner >= 0 && idxArrival >= 0) assert.ok(idxBanner < idxArrival);
    if (idxArrival >= 0 && idxCompletion >= 0) assert.ok(idxArrival < idxCompletion);

    // runAll + nextBeat clears stale overlay dialogs before advancing
    const b1 = { id: 't1', group: 'test', label: 'beat 1', delayMs: 800, events: [{ type: 'AGENT_TAUNT', agent: 'clod', model: 'agent.clod', text: 'first', mood: 'laugh' }] };
    const b2 = { id: 't2', group: 'test', label: 'beat 2', delayMs: 800, events: [{ type: 'DIALOG_BOX', speaker: 'kiro', name: 'KIRO', model: 'npc.kiro_ghost', text: 'second', holdMs: 3000 }] };
    cleared = 0;
    played.length = 0;
    runner.runAll([b1, b2]);
    assert.equal(cleared, 1);
    assert.equal(played.length, 1);
    assert.equal(runner.state().index, 1);
    assert.equal(runner.state().currentLabel, 'beat 1');
    runner.nextBeat();
    assert.equal(cleared, 2);
    assert.equal(played.length, 2);
    assert.equal(runner.state().index, 2);
    assert.equal(runner.state().currentLabel, 'beat 2');
    assert.equal(runner.state().running, false);
    runner.stop();
  });
});

console.log(`\neditor-unit-test PASS (${count()} suites)`);
