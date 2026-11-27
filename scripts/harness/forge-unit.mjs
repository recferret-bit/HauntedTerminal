#!/usr/bin/env node
// Tests for the credits-forge MCP server (part of `npm run quality` as `quality:mcp`).
//   node scripts/harness/forge-unit.mjs
// Part 1 calls the tools on a temporary copy of chapters/ (writes happen only there). Part 2 starts the real server over
// stdio with the SDK client and only reads or is refused: the repository's own files must be byte-identical afterwards.
// Spec: .kiro/specs/mcp-devtools-and-forge/.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fc from 'fast-check';
import { createContext, ForgeError, TOOLS } from '../mcp/credits-forge/tools.mjs';
import { etagOf } from './lib/chapter-compile.mjs';
import { projectRoot } from './lib/load.mjs';
import { testRunner } from './lib/test-kit.mjs';

const { test, count } = testRunner();
const SLUG = 'chapter-01-kiroween';
const LEVEL = 'level-02-task-ram-heist';
const COMIX = 'intro';
const LAB = 'basics';
const WRITE_TOOLS = new Set(['write_chapter_file', 'write_comix', 'write_lab', 'write_level']);
export const FORGE_TOOLS = [
  'get_chapter_file',
  'get_comix',
  'get_lab',
  'get_level',
  'list_assets',
  'list_comix',
  'list_labs',
  'list_levels',
  'run_lab',
  'solve_level',
  'validate_chapter',
  'validate_comix',
  'validate_lab',
  'validate_level',
  'write_chapter_file',
  'write_comix',
  'write_lab',
  'write_level',
];

/** Hash of every file under `dir` (paths and bytes): "the disk is byte-identical" as one comparable string. */
function treeHash(dir) {
  const h = createHash('sha256');
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(p.slice(dir.length)).update(readFileSync(p));
    }
  };
  walk(dir);
  return h.digest('hex');
}

const refusal = async (promise, code) => {
  await assert.rejects(promise, (err) => err instanceof ForgeError && err.code === code, `expected a ${code} refusal`);
};

// ---- part 1: the tools on a temporary copy ------------------------------------------------------------------------

const tmp = mkdtempSync(join(tmpdir(), 'forge-unit-'));
const chaptersCopy = join(tmp, 'chapters');
cpSync(join(projectRoot, 'chapters', SLUG), join(chaptersCopy, SLUG), { recursive: true, filter: (src) => !src.includes(`${SLUG}/story/out`) });
const catalogCopy = join(tmp, 'catalog-data.ts');
const comixCopy = join(tmp, 'comix');
cpSync(join(projectRoot, 'comix'), comixCopy, { recursive: true });
const comixCatalogCopy = join(tmp, 'comix-catalog-data.ts');
const labsCopy = join(tmp, 'labs');
cpSync(join(projectRoot, 'scripts/harness/terminal-lab'), labsCopy, { recursive: true });
const ctx = createContext({
  root: chaptersCopy,
  catalog: catalogCopy,
  comixRoot: comixCopy,
  comixCatalog: comixCatalogCopy,
  labsRoot: labsCopy,
});
const run = (name, input) => TOOLS[name].run(ctx, input);
const specFile = join(chaptersCopy, SLUG, 'levels', LEVEL, 'level.spec.json');
const realChaptersBefore = treeHash(join(projectRoot, 'chapters'));
const realComixBefore = treeHash(join(projectRoot, 'comix'));
const realLabsBefore = treeHash(join(projectRoot, 'scripts/harness/terminal-lab'));

try {
  await test('list_assets: models with category, rooms, enriched FX metadata, and audio cues', async () => {
    const all = await run('list_assets', {});
    assert.ok(all.models.some((m) => m.id === 'item.tube_transistor' && m.category === 'item'));
    assert.ok(all.rooms.includes('desk') && all.fx.length > 5 && all.fx.every((p) => p.id.startsWith('fx.')));
    const sigkill = all.fx.find((p) => p.id === 'fx.sigkill');
    assert.ok(
      sigkill && sigkill.family && sigkill.anchor && typeof sigkill.durationMs === 'number'
      && typeof sigkill.stepFps === 'number' && sigkill.layerCount === sigkill.layers.length && sigkill.particleCount > 0,
    );
    assert.ok(all.audio && Array.isArray(all.audio.sfx) && all.audio.sfx.includes('hop'));
    assert.ok(Array.isArray(all.audio.music) && all.audio.music.length > 0);
    const audioOnly = await run('list_assets', { kind: 'audio' });
    assert.deepEqual(Object.keys(audioOnly), ['audio']);
    assert.deepEqual(audioOnly.audio, all.audio);
    assert.deepEqual(Object.keys(await run('list_assets', { kind: 'rooms' })), ['rooms']);
    await refusal(run('list_assets', { kind: 'sprites' }), 'invalid_input');
  });

  await test('list_levels and get_level: the chapter, a level and the etag of its file', async () => {
    const { chapters } = await run('list_levels', {});
    assert.equal(chapters.length, 1);
    assert.equal(chapters[0].levels.length, 11);
    assert.deepEqual(chapters[0].levels.map((l) => l.index), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const got = await run('get_level', { chapter: SLUG, levelId: LEVEL });
    assert.equal(got.etag, etagOf(readFileSync(specFile, 'utf8')));
    assert.equal(got.spec.id, LEVEL);
    await refusal(run('get_level', { chapter: SLUG, levelId: 'level-99' }), 'not_found');
    await refusal(run('get_level', { chapter: 'nope', levelId: LEVEL }), 'not_found');
    await refusal(run('get_level', { chapter: '../x', levelId: LEVEL }), 'invalid_input');
  });

  await test('validate_level: a level on disk passes; a draft with an unknown enemy type does not; the disk is untouched', async () => {
    const before = treeHash(tmp);
    assert.deepEqual(await run('validate_level', { chapter: SLUG, levelId: LEVEL }), { ok: true, levelId: LEVEL, errors: 0, blocking: 0, warnings: 0, issues: [], truncated: false });
    const { spec } = await run('get_level', { chapter: SLUG, levelId: LEVEL });
    const bad = structuredClone(spec);
    bad.enemies[0].type = 'nonexistent';
    const res = await run('validate_level', { chapter: SLUG, spec: bad });
    assert.equal(res.ok, false);
    assert.ok(res.issues.some((i) => i.severity === 'error' && i.message.includes('nonexistent')));
    await refusal(run('validate_level', { chapter: SLUG, spec: [] }), 'invalid_input');
    await refusal(run('validate_level', { chapter: SLUG, spec: { id: 'x'.repeat(300_000) } }), 'invalid_input');
    assert.equal(treeHash(tmp), before);
  });

  await test('solve_level: the real solution clears with 0 deaths; a draft whose solution is only `ls` does not', async () => {
    const ok = await run('solve_level', { chapter: SLUG, levelId: LEVEL });
    assert.deepEqual([ok.ok, ok.deaths, ok.problem], [true, 0, null]);
    assert.ok(ok.commands > 1);
    const { spec } = await run('get_level', { chapter: SLUG, levelId: LEVEL });
    const lazy = await run('solve_level', { chapter: SLUG, spec: { ...spec, solutionCommands: ['ls'] } });
    assert.equal(lazy.ok, false);
    assert.match(lazy.problem, /still open/);
  });

  await test('write_level refuses every bad case and leaves the copy byte-identical', async () => {
    const { spec, etag } = await run('get_level', { chapter: SLUG, levelId: LEVEL });
    const before = treeHash(tmp);
    const broken = structuredClone(spec);
    broken.enemies[0].type = 'nonexistent';
    const lazy = { ...structuredClone(spec), solutionCommands: ['ls'] };
    const edited = { ...structuredClone(spec), summary: `${spec.summary} (edited)` };
    await refusal(run('write_level', { chapter: SLUG, levelId: LEVEL, spec: edited, baseEtag: 'stale' }), 'conflict');
    await refusal(run('write_level', { chapter: SLUG, levelId: LEVEL, spec: edited }), 'invalid_input');
    await refusal(run('write_level', { chapter: SLUG, levelId: LEVEL, spec: broken, baseEtag: etag }), 'refused');
    await refusal(run('write_level', { chapter: SLUG, levelId: LEVEL, spec: lazy, baseEtag: etag }), 'refused');
    await refusal(run('write_level', { chapter: SLUG, levelId: LEVEL, spec: { ...edited, id: 'level-other' }, baseEtag: etag }), 'refused');
    await refusal(run('write_level', { chapter: SLUG, levelId: 'level-other', spec: { ...edited, id: 'level-other' }, baseEtag: etag }), 'refused');
    await refusal(run('write_level', { chapter: SLUG, levelId: LEVEL, spec: 'not an object', baseEtag: etag }), 'invalid_input');
    assert.equal(treeHash(tmp), before);
    assert.ok(!existsSync(catalogCopy), 'a refused write must not compile the catalog');
    const details = await run('write_level', { chapter: SLUG, levelId: LEVEL, spec: broken, baseEtag: etag }).catch((e) => e);
    assert.ok(details.details.issues.length > 0, 'a validation refusal carries the issues');
  });

  await test('write_level: a passing change is written canonically, recompiles the catalog, and a repeat changes nothing', async () => {
    const { spec, etag } = await run('get_level', { chapter: SLUG, levelId: LEVEL });
    const edited = { ...structuredClone(spec), summary: `${spec.summary} (edited)` };
    const res = await run('write_level', { chapter: SLUG, levelId: LEVEL, spec: edited, baseEtag: etag });
    assert.deepEqual([res.ok, res.changed, res.regenerated, res.deaths], [true, true, true, 0]);
    const text = readFileSync(specFile, 'utf8');
    assert.equal(res.etag, etagOf(text));
    assert.equal(JSON.parse(text).summary, edited.summary);
    assert.ok(text.endsWith('\n'));
    assert.ok(readFileSync(catalogCopy, 'utf8').includes('(edited)'), 'the temporary catalog was recompiled');
    const again = await run('write_level', { chapter: SLUG, levelId: LEVEL, spec: edited, baseEtag: res.etag });
    assert.deepEqual([again.changed, again.regenerated, again.etag], [false, false, res.etag]);
    await refusal(run('write_level', { chapter: SLUG, levelId: LEVEL, spec: edited, baseEtag: etag }), 'conflict');
  });
  // A property (fast-check, fixed seed): the runner in property-tests.mjs is synchronous, and these tools are async.
  // Any mix of edits to any level: write_level writes only what validate_level and solve_level pass, and a refusal
  // leaves every file byte-identical. Planted-bug check: dropping the solve gate in tools.mjs fails it.
  const EDITS = [
    ['a new summary', (s) => { s.summary = `${s.summary ?? ''} (tuned)`; }],
    ['an unknown enemy type', (s) => { if (s.enemies?.length) s.enemies[0].type = 'dragon'; }],
    ['a solution cut to its first command', (s) => { s.solutionCommands = (s.solutionCommands ?? []).slice(0, 1); }],
    ['a solution without its last command', (s) => { s.solutionCommands = (s.solutionCommands ?? []).slice(0, -1); }],
    ['an unknown room kind', (s) => { s.roomKind = 'nope'; }],
    ['a missing title', (s) => { delete s.title; }],
    ['an extra harmless hint', (s) => { s.hints = [...(s.hints ?? []), 'Look around first.']; }],
  ];
  const { chapters } = await run('list_levels', {});
  const levelIds = chapters[0].levels.map((l) => l.id);
  await test('property: write_level writes only a level that validates and clears with 0 deaths; a refusal changes nothing (seed 20261117, 25 runs)', async () => {
    let wrote = 0;
    let refused = 0;
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...levelIds), fc.subarray([...EDITS.keys()], { minLength: 1, maxLength: 3 }), async (levelId, edits) => {
        const { spec, etag } = await run('get_level', { chapter: SLUG, levelId });
        const draft = structuredClone(spec);
        for (const e of edits) EDITS[e][1](draft);
        const before = treeHash(tmp);
        const res = await run('write_level', { chapter: SLUG, levelId, spec: draft, baseEtag: etag }).catch((err) => err);
        if (res instanceof ForgeError) {
          assert.equal(res.code, 'refused', `${levelId}: unexpected ${res.code}: ${res.message}`);
          assert.equal(treeHash(tmp), before, `${levelId}: a refused write changed a file`);
          refused += 1;
          return;
        }
        if (res instanceof Error) throw res;
        const checked = await run('validate_level', { chapter: SLUG, levelId });
        const solved = await run('solve_level', { chapter: SLUG, levelId });
        assert.ok(checked.ok && solved.ok && solved.deaths === 0, `${levelId}: wrote a level that fails (${EDITS.filter((_, i) => edits.includes(i)).map(([n]) => n).join(', ')})`);
        wrote += 1;
      }),
      { seed: 20261117, numRuns: 25 },
    );
    assert.ok(wrote > 0 && refused > 0, `the property must reach both outcomes (wrote ${wrote}, refused ${refused})`);
  });
  await test('chapter files: get_chapter_file, validate_chapter, and write_chapter_file with conflict & validation fences', async () => {
    const chk = await run('validate_chapter', { chapter: SLUG });
    assert.equal(chk.ok, true);
    const man = await run('get_chapter_file', { chapter: SLUG, path: 'chapter.manifest.json' });
    assert.equal(man.json.id, SLUG);
    await refusal(run('get_chapter_file', { chapter: SLUG, path: '../escape.json' }), 'refused');
    await refusal(run('write_chapter_file', { chapter: SLUG, path: `levels/${LEVEL}/level.spec.json`, json: man.json, baseEtag: man.etag }), 'refused');
    await refusal(run('write_chapter_file', { chapter: SLUG, path: 'story/unreferenced.json', json: man.json, baseEtag: man.etag }), 'refused');
    await refusal(run('write_chapter_file', { chapter: SLUG, path: 'chapter.manifest.json', json: { ...man.json, id: 'other' }, baseEtag: man.etag }), 'refused');
    await refusal(run('write_chapter_file', { chapter: SLUG, path: 'chapter.manifest.json', json: { ...man.json, onFirstPickup: [{ pickup: 'bad', steps: [{ kind: 'dialog_box', speaker: 'nobody', text: '' }] }] }, baseEtag: man.etag }), 'refused');
    await refusal(run('write_chapter_file', { chapter: SLUG, path: 'chapter.manifest.json', json: man.json, baseEtag: 'stale' }), 'conflict');

    const dlg = await run('get_chapter_file', { chapter: SLUG, path: 'story/dialogs.json' });
    const tunedDlg = structuredClone(dlg.json);
    tunedDlg.levels[LEVEL].banner = `${tunedDlg.levels[LEVEL].banner} (tuned)`;
    const wrote = await run('write_chapter_file', { chapter: SLUG, path: 'story/dialogs.json', json: tunedDlg, baseEtag: dlg.etag });
    assert.equal(wrote.ok, true);
    const repeat = await run('write_chapter_file', { chapter: SLUG, path: 'story/dialogs.json', json: tunedDlg, baseEtag: wrote.etag });
    assert.deepEqual([repeat.changed, repeat.regenerated, repeat.etag], [false, false, wrote.etag]);
  });

  await test('comix tools: list_comix, get_comix, validate_comix (60fps sim), and write_comix', async () => {
    const listed = await run('list_comix', {});
    assert.ok(listed.comixes.some((c) => c.comix === COMIX && c.pages.length >= 1));
    const full = await run('get_comix', { comix: COMIX });
    const pagePath = full.pages[0].path;
    const one = await run('get_comix', { comix: COMIX, path: pagePath });
    assert.equal(one.etag, full.pages[0].etag);
    const checked = await run('validate_comix', { comix: COMIX });
    assert.equal(checked.ok, true);
    assert.ok(checked.sim.ok && checked.sim.frames > 10);

    const badPage = structuredClone(one.json);
    badPage.panels[0].layout.landscape = [0, 0, 2, 2];
    const badCheck = await run('validate_comix', { comix: COMIX, path: pagePath, json: badPage });
    assert.equal(badCheck.ok, false);
    await refusal(run('write_comix', { comix: COMIX, path: pagePath, json: badPage, baseEtag: one.etag }), 'refused');
    await refusal(run('write_comix', { comix: COMIX, path: pagePath, json: one.json, baseEtag: 'stale' }), 'conflict');

    const editedPage = { ...structuredClone(one.json), title: `${one.json.title ?? 'Page'} (tuned)` };
    const saved = await run('write_comix', { comix: COMIX, path: pagePath, json: editedPage, baseEtag: one.etag });
    assert.deepEqual([saved.ok, saved.changed, saved.regenerated], [true, true, true]);
    assert.ok(readFileSync(comixCatalogCopy, 'utf8').includes('(tuned)'));
    const repeat = await run('write_comix', { comix: COMIX, path: pagePath, json: editedPage, baseEtag: saved.etag });
    assert.deepEqual([repeat.changed, repeat.regenerated], [false, false]);
  });

  await test('terminal lab tools: list_labs, get_lab, validate_lab, run_lab (+30 soak ticks), and write_lab', async () => {
    const listed = await run('list_labs', {});
    assert.ok(listed.labs.some((l) => l.id === LAB));
    const got = await run('get_lab', { id: LAB });
    const chk = await run('validate_lab', { id: LAB });
    assert.equal(chk.ok, true);
    const ran = await run('run_lab', { id: LAB });
    assert.deepEqual([ran.ok, ran.failed, ran.hurt, ran.soakTicks], [true, 0, null, 30]);

    const broken = structuredClone(got.script);
    broken.steps.push({ op: 'run', line: 'false', expect: { code: 0 } });
    const badRun = await run('run_lab', { script: broken });
    assert.equal(badRun.ok, false);
    assert.ok(badRun.failed >= 1);

    await refusal(run('write_lab', { id: LAB, script: broken, baseEtag: got.etag }), 'refused');
    await refusal(run('write_lab', { id: LAB, script: got.script, baseEtag: 'stale' }), 'conflict');
    await refusal(run('write_lab', { id: LAB, script: got.script }), 'conflict');

    const edited = { ...structuredClone(got.script), title: `${got.script.title} (tuned)` };
    const saved = await run('write_lab', { id: LAB, script: edited, baseEtag: got.etag });
    assert.deepEqual([saved.ok, saved.created, saved.changed], [true, false, true]);
    const fresh = { ...structuredClone(got.script), id: 'forge-created-lab', title: 'Forge Created Lab' };
    const created = await run('write_lab', { id: 'forge-created-lab', script: fresh });
    assert.deepEqual([created.ok, created.created], [true, true]);
  });

} finally {
  await ctx.close();
  rmSync(tmp, { recursive: true, force: true });
}

await test('part 1 never touched the repository: chapters/, comix/, and terminal-lab/ are byte-identical', () => {
  assert.equal(treeHash(join(projectRoot, 'chapters')), realChaptersBefore);
  assert.equal(treeHash(join(projectRoot, 'comix')), realComixBefore);
  assert.equal(treeHash(join(projectRoot, 'scripts/harness/terminal-lab')), realLabsBefore);
});

// ---- part 2: the real server over stdio ---------------------------------------------------------------------------

const client = new Client({ name: 'forge-unit', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: [resolve(projectRoot, 'scripts/mcp/credits-forge/server.mjs')], cwd: projectRoot, stderr: 'ignore' });
const call = async (name, args) => {
  const res = await client.callTool({ name, arguments: args });
  return { isError: res.isError === true, body: JSON.parse(res.content[0].text) };
};
const realLevel = join(projectRoot, 'chapters', SLUG, 'levels', LEVEL, 'level.spec.json');
const realBefore = treeHash(join(projectRoot, 'chapters'));
const catalogBefore = readFileSync(join(projectRoot, 'src/chapters/generated/catalog-data.ts'), 'utf8');

try {
  await client.connect(transport);

  await test('server: all 18 forge tools, descriptions, schemas, and exact readOnlyHint annotations', async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), FORGE_TOOLS);
    for (const t of tools) assert.ok(t.description.length > 30 && t.inputSchema.type === 'object', t.name);
    for (const name of WRITE_TOOLS) assert.equal(tools.find((t) => t.name === name).annotations.readOnlyHint, false, name);
    assert.ok(tools.filter((t) => !WRITE_TOOLS.has(t.name)).every((t) => t.annotations.readOnlyHint === true));
  });

  await test('server: tool results are JSON text across chapters, comix, and labs; refusals carry code + message', async () => {
    const ok = await call('validate_level', { chapter: SLUG, levelId: LEVEL });
    assert.deepEqual([ok.isError, ok.body.ok], [false, true]);
    const chFile = await call('get_chapter_file', { chapter: SLUG, path: 'chapter.manifest.json' });
    assert.equal(chFile.isError, false);
    const cmx = await call('validate_comix', { comix: COMIX });
    assert.deepEqual([cmx.isError, cmx.body.ok], [false, true]);
    const lab = await call('run_lab', { id: LAB });
    assert.deepEqual([lab.isError, lab.body.ok], [false, true]);
    const got = await call('get_level', { chapter: SLUG, levelId: LEVEL });
    const bad = await call('write_level', { chapter: SLUG, levelId: LEVEL, spec: got.body.spec, baseEtag: 'stale' });
    assert.deepEqual([bad.isError, bad.body.error], [true, 'conflict']);
    const missing = await call('get_level', { chapter: SLUG, levelId: 'level-99' });
    assert.deepEqual([missing.isError, missing.body.error], [true, 'not_found']);
  });

  await test('server: bad input is rejected before the tool runs (schema)', async () => {
    const res = await client.callTool({ name: 'write_level', arguments: { chapter: SLUG, levelId: LEVEL } }).catch((e) => ({ isError: true, thrown: e }));
    assert.equal(res.isError, true);
  });
} finally {
  await client.close().catch(() => {});
}

await test('part 2 never touched the repository: chapters/, comix/, terminal-lab/, the catalog and the level file are unchanged', () => {
  assert.equal(treeHash(join(projectRoot, 'chapters')), realBefore);
  assert.equal(treeHash(join(projectRoot, 'comix')), realComixBefore);
  assert.equal(treeHash(join(projectRoot, 'scripts/harness/terminal-lab')), realLabsBefore);
  assert.equal(readFileSync(join(projectRoot, 'src/chapters/generated/catalog-data.ts'), 'utf8'), catalogBefore);
  assert.ok(readFileSync(realLevel, 'utf8').length > 100);
});

console.log(`\nforge unit: ${count()} tests passed`);
