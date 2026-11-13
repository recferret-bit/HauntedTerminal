// Dev-server API behind the comix editor (`/comix-editor`). A Vite plugin: dev server only, never in `vite build`.
//
//   GET /api/comix                 every comix, read fresh from comix/<id>/**/*.json, with file etags
//   GET /api/comix/<id>/etags      { path: etag } for every json file now on disk
//   PUT /api/comix/<id>/file       { path, json, baseEtag }  write one existing json file
//
// Safety matches the chapter API: an existing .json file inside that comix folder (no new paths, no `..`),
// Content-Type application/json, same-origin Host, etag 409, atomic rename. A comix save does not recompile chapters.
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { etagOf } from './chapter-compile.mjs';
import { stringifyComixJson } from './comix-json.mjs';
import { projectRoot } from './load.mjs';

const ID = /^[\w.-]+$/;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const MAX_BODY = 8 * 1024 * 1024;
const comixDir = resolve(projectRoot, 'comix');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

function assertLocal(req) {
  const host = String(req.headers.host ?? '');
  if (!LOCAL_HOST.test(host)) throw new HttpError(403, 'the comix API answers local requests only');
  const origin = req.headers.origin;
  let originHost = '';
  try {
    originHost = origin ? new URL(origin).host : host;
  } catch {
    /* Origin: null falls through to the refusal below */
  }
  if (originHost !== host) throw new HttpError(403, 'cross-origin request refused');
}

function readBody(req) {
  const type = String(req.headers['content-type'] ?? '');
  if (!type.startsWith('application/json')) throw new HttpError(415, 'send Content-Type: application/json');
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        fail(new HttpError(413, 'body too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        ok(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        fail(new HttpError(400, 'body is not valid JSON'));
      }
    });
    req.on('error', fail);
  });
}

function listIds() {
  if (!existsSync(comixDir)) return [];
  return readdirSync(comixDir)
    .filter((name) => statSync(resolve(comixDir, name)).isDirectory() && existsSync(resolve(comixDir, name, 'manifest.json')))
    .sort();
}

function walkJson(dir, base = '') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = resolve(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(abs).isDirectory()) out.push(...walkJson(abs, rel));
    else if (name.endsWith('.json')) out.push(rel.split(sep).join('/'));
  }
  return out.sort();
}

function readComix(id) {
  const dir = resolve(comixDir, id);
  const files = walkJson(dir).map((rel) => {
    const text = readFileSync(resolve(dir, rel), 'utf8');
    return { path: rel, json: JSON.parse(text), etag: etagOf(text) };
  });
  const manifest = files.find((file) => file.path === 'manifest.json')?.json;
  const title = manifest && typeof manifest.title === 'string' ? manifest.title : id;
  return { id, title, files };
}

function safeTarget(id, relPath) {
  if (!ID.test(id) || !listIds().includes(id)) throw new HttpError(404, `unknown comix "${id}"`);
  if (typeof relPath !== 'string' || !relPath.endsWith('.json') || relPath.includes('..') || relPath.includes('\\') || relPath.startsWith('/')) {
    throw new HttpError(400, `path not writable: ${relPath}`);
  }
  const dir = resolve(comixDir, id);
  const target = resolve(dir, relPath);
  if (target !== dir && !target.startsWith(`${dir}${sep}`)) throw new HttpError(400, 'path escapes the comix folder');
  if (!existsSync(target) || !statSync(target).isFile()) throw new HttpError(404, `${relPath} does not exist; add it to the comix first`);
  return target;
}

function writeAtomic(target, text) {
  const tmp = `${target}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, target);
}

async function putFile(req, res, id) {
  const body = await readBody(req);
  const target = safeTarget(id, body.path);
  if (body.json === null || typeof body.json !== 'object') throw new HttpError(400, 'json must be an object or array');
  const current = etagOf(readFileSync(target, 'utf8'));
  if (body.baseEtag !== undefined && body.baseEtag !== current) {
    throw new HttpError(409, `${body.path} changed on disk after you loaded it; reload before saving`);
  }
  const text = stringifyComixJson(body.json);
  writeAtomic(target, text);
  return send(res, 200, { ok: true, etag: etagOf(text) });
}

async function handle(req, res, url) {
  assertLocal(req);
  const parts = url.pathname.split('/').filter(Boolean);
  const id = parts[2] ?? '';
  if (req.method === 'GET' && parts.length === 2) return send(res, 200, { comixes: listIds().map(readComix) });
  if (req.method === 'GET' && parts[3] === 'etags') {
    if (!listIds().includes(id)) throw new HttpError(404, 'unknown comix');
    const etags = {};
    for (const file of readComix(id).files) etags[file.path] = file.etag;
    return send(res, 200, { etags });
  }
  if (req.method === 'PUT' && parts[3] === 'file') return putFile(req, res, id);
  throw new HttpError(404, 'not found');
}

export function comixApi() {
  const middleware = (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/comix')) return next();
    handle(req, res, url).catch((err) => send(res, err instanceof HttpError ? err.status : 500, { error: String(err?.message ?? err) }));
  };
  return { name: 'comix-api', apply: 'serve', configureServer: (server) => { server.middlewares.use(middleware); } };
}
