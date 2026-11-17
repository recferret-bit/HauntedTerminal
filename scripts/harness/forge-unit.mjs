#!/usr/bin/env node
// Tests for the haunted-forge MCP server (part of `npm run quality` as `quality:mcp`).
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
import { createContext, ForgeError, TOOLS } from '../mcp/haunted-forge/tools.mjs';
import { etagOf } from './lib/chapter-compile.mjs';
import { projectRoot } from './lib/load.mjs';
import { testRunner } from './lib/test-kit.mjs';

const { test, count } = testRunner();
const SLUG = 'chapter-01-kiroween';
const LEVEL = 'level-02-task-ram-heist';
export const FORGE_TOOLS = ['get_level', 'list_assets', 'list_levels', 'solve_level', 'validate_level', 'write_level'];

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
const ctx = createContext({ root: chaptersCopy, catalog: catalogCopy });
const run = (name, input) => TOOLS[name].run(ctx, input);
const specFile = join(chaptersCopy, SLUG, 'levels', LEVEL, 'level.spec.json');
const realChaptersBefore = treeHash(join(projectRoot, 'chapters'));

try {
  await test('list_assets: the catalogs the game uses (models with category, rooms, fx)', async () => {
    const all = await run('list_assets', {});
    assert.ok(all.models.some((m) => m.id === 'item.lantern' && m.category === 'item'));
    assert.ok(all.rooms.includes('desk') && all.fx.length > 5 && all.fx.every((p) => p.id.startsWith('fx.')));
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
} finally {
  await ctx.close();
  rmSync(tmp, { recursive: true, force: true });
}

await test('part 1 never touched the repository: chapters/ is byte-identical', () => {
  assert.equal(treeHash(join(projectRoot, 'chapters')), realChaptersBefore);
});

// ---- part 2: the real server over stdio ---------------------------------------------------------------------------

const client = new Client({ name: 'forge-unit', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: [resolve(projectRoot, 'scripts/mcp/haunted-forge/server.mjs')], cwd: projectRoot, stderr: 'ignore' });
const call = async (name, args) => {
  const res = await client.callTool({ name, arguments: args });
  return { isError: res.isError === true, body: JSON.parse(res.content[0].text) };
};
const realLevel = join(projectRoot, 'chapters', SLUG, 'levels', LEVEL, 'level.spec.json');
const realBefore = treeHash(join(projectRoot, 'chapters'));
const catalogBefore = readFileSync(join(projectRoot, 'src/chapters/generated/catalog-data.ts'), 'utf8');

try {
  await client.connect(transport);

  await test('server: exactly the six forge tools, each with a description and an input schema', async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), FORGE_TOOLS);
    for (const t of tools) assert.ok(t.description.length > 40 && t.inputSchema.type === 'object', t.name);
    assert.equal(tools.find((t) => t.name === 'write_level').annotations.readOnlyHint, false);
    assert.ok(tools.filter((t) => t.name !== 'write_level').every((t) => t.annotations.readOnlyHint === true));
  });

  await test('server: a tool result is JSON text; a refusal is an MCP error with a code and a message', async () => {
    const ok = await call('validate_level', { chapter: SLUG, levelId: LEVEL });
    assert.deepEqual([ok.isError, ok.body.ok], [false, true]);
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

await test('part 2 never touched the repository: chapters/, the catalog and the level file are unchanged', () => {
  assert.equal(treeHash(join(projectRoot, 'chapters')), realBefore);
  assert.equal(readFileSync(join(projectRoot, 'src/chapters/generated/catalog-data.ts'), 'utf8'), catalogBefore);
  assert.ok(readFileSync(realLevel, 'utf8').length > 100);
});

console.log(`\nforge unit: ${count()} tests passed`);
