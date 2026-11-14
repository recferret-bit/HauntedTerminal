#!/usr/bin/env node
// Fast, deterministic unit & edge-case suite for shared `src/editor-core/`, `src/chapter-editor/`,
// `src/comix-editor/`, and `scripts/harness/lib/editor-api-common.mjs` (positive, negative, and corner cases).
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
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

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

function fakeReq({ method = 'PUT', host = '127.0.0.1:5173', origin, contentType = 'application/json', body = '' } = {}) {
  const stream = Readable.from(body === null ? [] : [Buffer.from(body, 'utf8')]);
  stream.method = method;
  stream.headers = {
    host,
    ...(origin !== undefined ? { origin } : {}),
    ...(contentType !== undefined ? { 'content-type': contentType } : {}),
  };
  return stream;
}

await withProcgen(async (_procgen, vite) => {
  const dockState = await vite.ssrLoadModule('/src/editor-core/dock-state.ts');
  const formState = await vite.ssrLoadModule('/src/editor-core/form-state.ts');
  const schemaCheck = await vite.ssrLoadModule('/src/editor-core/schema-check.ts');
  const httpMod = await vite.ssrLoadModule('/src/editor-core/http.ts');
  const chapterModelMod = await vite.ssrLoadModule('/src/chapter-editor/chapter-model.ts');
  const chapterCheckMod = await vite.ssrLoadModule('/src/chapter-editor/check.ts');
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
    const brokenChIssues = chapterCheckMod.checkPack(brokenCh);
    assert.ok(brokenChIssues.some((i) => i.severity === 'error'));

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
});

console.log(`\neditor-unit-test PASS (${passed} suites)`);
