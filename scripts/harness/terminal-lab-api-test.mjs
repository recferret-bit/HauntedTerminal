#!/usr/bin/env node
// Safety and conflict tests for the Terminal Lab dev API (scripts/harness/lib/terminal-lab-api.mjs), on a temporary folder.
//   node scripts/harness/terminal-lab-api-test.mjs
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { etagOf, HttpError } from './lib/editor-api-common.mjs';
import { stringifyLabJson } from './lib/lab-json.mjs';
import { createLabHandler, displayLabDir, labsDir, MAX_LAB_FILES, terminalLabApi } from './lib/terminal-lab-api.mjs';
import { fakeReq, fakeRes, testRunner } from './lib/test-kit.mjs';

const dir = mkdtempSync(join(tmpdir(), 'terminal-lab-api-'));
const handler = createLabHandler(dir);
const { test, count } = testRunner();

/** One request through the handler: `{ status, body, headers }`, with errors mapped the way the plugin maps them. */
async function call({ method = 'GET', url = '/api/terminal-lab', host, origin, type = 'application/json', body = null } = {}) {
  const req = fakeReq({ method, host, origin, contentType: type || null, body });
  const res = fakeRes();
  try {
    await handler(req, res, new URL(url, 'http://localhost'));
  } catch (err) {
    if (!(err instanceof HttpError)) throw err;
    return { status: err.status, body: { error: err.message } };
  }
  return { status: res.statusCode, body: res.json(), headers: res.headers };
}

const lab = (id, extra = {}) => ({ id, title: id, room: {}, player: {}, clock: 'manual', enemyFire: 'live', setup: [], steps: [], ...extra });
const put = (path, json, baseEtag) => call({ method: 'PUT', url: '/api/terminal-lab/file', body: { path, json, ...(baseEtag === undefined ? {} : { baseEtag }) } });

try {
  await test('GET lists nothing in an empty folder, and says it is writable', async () => {
    const r = await call();
    assert.deepEqual([r.status, r.body, r.headers['cache-control']], [200, { writable: true, labs: [] }, 'no-store']);
  });

  await test('PUT creates a lab in the canonical format and returns its etag', async () => {
    const json = lab('first', { setup: [{ op: 'dir', path: '/lab/x' }] });
    const r = await put('first.lab.json', json);
    assert.deepEqual([r.status, r.body.created], [200, true]);
    const text = readFileSync(join(dir, 'first.lab.json'), 'utf8');
    assert.equal(text, stringifyLabJson(json));
    assert.equal(r.body.etag, etagOf(text));
    assert.equal(r.body.path, `${dir.split(sep).join('/')}/first.lab.json`, 'PUT reports the actual TERMINAL_LAB_DIR file path');
    assert.equal(displayLabDir(labsDir), 'scripts/harness/terminal-lab', 'default labsDir formats relative to repo root');
    const list = (await call()).body.labs;
    assert.deepEqual(list.map((l) => [l.file, l.id, l.etag]), [['first.lab.json', 'first', r.body.etag]]);
    assert.deepEqual(list[0].json, json);
  });

  await test('creating over an existing file without its etag is a 409, and the file is untouched', async () => {
    const before = readFileSync(join(dir, 'first.lab.json'), 'utf8');
    assert.equal((await put('first.lab.json', lab('first', { title: 'other' }))).status, 409);
    assert.equal(readFileSync(join(dir, 'first.lab.json'), 'utf8'), before);
  });

  await test('overwriting needs the current etag: right one saves, stale one is a 409, a non-string is a 400', async () => {
    const etag = (await call()).body.labs[0].etag;
    const ok = await put('first.lab.json', lab('first', { title: 'v2' }), etag);
    assert.deepEqual([ok.status, ok.body.created], [200, false]);
    assert.notEqual(ok.body.etag, etag);
    assert.equal((await put('first.lab.json', lab('first', { title: 'v3' }), etag)).status, 409, 'the old etag is stale now');
    assert.equal(JSON.parse(readFileSync(join(dir, 'first.lab.json'), 'utf8')).title, 'v2');
    assert.equal((await call({ method: 'PUT', url: '/api/terminal-lab/file', body: { path: 'first.lab.json', json: lab('first'), baseEtag: 7 } })).status, 400);
  });

  await test('a baseEtag for a file that is not there is a 409', async () => {
    assert.equal((await put('ghost.lab.json', lab('ghost'), 'abc')).status, 409);
    assert.equal(existsSync(join(dir, 'ghost.lab.json')), false);
  });

  await test('only lowercase <id>.lab.json names directly in the folder are writable', async () => {
    for (const path of ['../evil.lab.json', 'sub/x.lab.json', '..\\x.lab.json', 'x.json', '.lab.json', 'x.lab.json.tmp', '/etc/passwd', 'a b.lab.json', 'BASICS.lab.json', 'x-.lab.json', '', undefined, 5]) {
      assert.equal((await put(path, lab(typeof path === 'string' ? path.replace('.lab.json', '') : 'x'))).status, 400, `${JSON.stringify(path)} should be refused`);
    }
    assert.deepEqual(readdirSync(dir), ['first.lab.json'], 'nothing else was written');
  });

  await test('a directory with a lab name is not listed, and writing over it is a 400', async () => {
    mkdirSync(join(dir, 'x.lab.json'));
    try {
      assert.deepEqual((await call()).body.labs.map((l) => l.file), ['first.lab.json']);
      assert.equal((await put('x.lab.json', lab('x'))).status, 400);
    } finally {
      rmSync(join(dir, 'x.lab.json'), { recursive: true });
    }
  });

  await test('the id must match the file name, and a lab needs setup and steps lists', async () => {
    assert.equal((await put('one.lab.json', lab('two'))).status, 400);
    assert.equal((await put('one.lab.json', { id: 'one', setup: [] })).status, 400);
    assert.equal((await put('one.lab.json', { id: 'one', steps: [], setup: 'no' })).status, 400);
    for (const json of [null, []]) assert.equal((await call({ method: 'PUT', url: '/api/terminal-lab/file', body: { path: 'one.lab.json', json } })).status, 400);
  });

  await test('the body must be a JSON object with Content-Type application/json', async () => {
    const send = (body, type) => call({ method: 'PUT', url: '/api/terminal-lab/file', type, body });
    assert.equal((await send('{}', 'text/plain')).status, 415);
    assert.equal((await send('{}', '')).status, 415);
    for (const body of ['[1]', 'null', '{nope']) assert.equal((await send(body)).status, 400, body);
  });

  await test('only local, same-origin requests are answered', async () => {
    assert.equal((await call({ host: 'evil.example' })).status, 403);
    assert.equal((await call({ origin: 'http://evil.example' })).status, 403);
    assert.equal((await call({ host: 'localhost:5173', origin: 'http://localhost:5173' })).status, 200);
    assert.equal((await call({ method: 'PUT', url: '/api/terminal-lab/file', origin: 'null', body: { path: 'x.lab.json', json: lab('x') } })).status, 403);
  });

  await test('there is no delete, and unknown routes are 404', async () => {
    assert.equal((await call({ method: 'DELETE', url: '/api/terminal-lab/file' })).status, 404);
    assert.equal((await call({ method: 'POST', url: '/api/terminal-lab' })).status, 404);
    assert.equal((await call({ url: '/api/terminal-lab/nope' })).status, 404);
    assert.ok(existsSync(join(dir, 'first.lab.json')));
  });

  await test('the plugin answers its prefix only (/api/terminal-labX goes to the next handler) and maps errors to JSON', async () => {
    let middleware = null;
    terminalLabApi(dir).configureServer({ middlewares: { use: (fn) => { middleware = fn; } } });
    const through = (url, extra = {}) => new Promise((done) => {
      const req = fakeReq({ method: 'GET', ...extra });
      req.url = url;
      const res = fakeRes();
      res.end = (text) => done({ status: res.statusCode, body: JSON.parse(text) });
      middleware(req, res, () => done('next'));
    });
    assert.equal(await through('/api/terminal-labX'), 'next');
    assert.equal(await through('/api/terminal-lab-other/file'), 'next');
    const listed = await through('/api/terminal-lab');
    assert.deepEqual([listed.status, listed.body.labs.length], [200, 1]);
    assert.deepEqual(await through('/api/terminal-lab/nope'), { status: 404, body: { error: 'not found' } });
    assert.equal((await through('/api/terminal-lab', { host: 'evil.example' })).status, 403);
  });

  await test('etags follow the disk, including edits made outside the API; a broken file is listed with a problem', async () => {
    const e1 = (await call({ url: '/api/terminal-lab/etags' })).body;
    assert.equal(e1.dir, dir.split(sep).join('/'), 'etags reports the actual TERMINAL_LAB_DIR folder');
    assert.deepEqual(e1.files, ['first.lab.json']);
    writeFileSync(join(dir, 'first.lab.json'), stringifyLabJson(lab('first', { title: 'edited by git' })));
    const e2 = (await call({ url: '/api/terminal-lab/etags' })).body;
    assert.notEqual(e2.etags['first.lab.json'], e1.etags['first.lab.json']);
    assert.equal((await put('first.lab.json', lab('first'), e1.etags['first.lab.json'])).status, 409, 'saving over the outside edit is refused');
    writeFileSync(join(dir, 'broken.lab.json'), '{nope');
    const broken = (await call()).body.labs.find((l) => l.file === 'broken.lab.json');
    assert.ok(broken.problem && broken.json === null);
    rmSync(join(dir, 'broken.lab.json'));
  });

  await test(`the folder holds at most ${MAX_LAB_FILES} labs, and no temp files are left behind`, async () => {
    const have = readdirSync(dir).length;
    for (let i = 0; i < MAX_LAB_FILES - have; i++) assert.equal((await put(`bulk-${i}.lab.json`, lab(`bulk-${i}`))).status, 200);
    assert.equal((await put('one-too-many.lab.json', lab('one-too-many'))).status, 400);
    assert.ok(readdirSync(dir).every((f) => f.endsWith('.lab.json')));
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`terminal-lab-api-test: ${count()} checks passed`);
