// Dev-server API behind the comix editor (`/comix-editor`). A Vite plugin: dev server only, never in `vite build`.
//
//   GET /api/comix                 every comix as the editor needs it, read fresh from disk, with file etags
//   GET /api/comix/<slug>/etags    { path: etag } for every spec file now on disk (change detection)
//   PUT /api/comix/<slug>/file     { path, json, baseEtag }  write one spec file, then recompile catalog-data.ts
//
// Safety matches the chapter API: only existing `comix.manifest.json` and `pages/<dir>/page.spec.json` inside that
// comix folder can be written. Requires Content-Type: application/json, same-origin Host/Origin, baseEtag 409 check,
// and atomic rename.
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { comixDir, compileAllComix, etagOf, listComixIds, readComix, writeComixCatalog } from './comix-compile.mjs';
import { stringifyComixJson } from './comix-json.mjs';

const WRITABLE = /^(comix\.manifest\.json|pages\/[\w.-]+\/page\.spec\.json)$/;
const SLUG = /^[\w.-]+$/;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const MAX_BODY = 8 * 1024 * 1024;

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

function safeTarget(slug, relPath) {
  if (!SLUG.test(slug) || !listComixIds().includes(slug)) throw new HttpError(404, `unknown comix "${slug}"`);
  if (typeof relPath !== 'string' || !WRITABLE.test(relPath)) {
    throw new HttpError(400, `path not writable: ${relPath}`);
  }
  const dir = resolve(comixDir, slug);
  const target = resolve(dir, relPath);
  if (!target.startsWith(`${dir}${sep}`)) throw new HttpError(400, 'path escapes the comix folder');
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw new HttpError(404, `${relPath} does not exist; add it to the comix first`);
  }
  return target;
}

function writeAtomic(target, text) {
  const tmp = `${target}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, target);
}

async function putFile(req, res, slug) {
  const body = await readBody(req);
  const target = safeTarget(slug, body.path);
  if (body.json === null || typeof body.json !== 'object' || Array.isArray(body.json)) {
    throw new HttpError(400, 'json must be an object');
  }
  const current = etagOf(readFileSync(target, 'utf8'));
  if (body.baseEtag !== undefined && body.baseEtag !== current) {
    throw new HttpError(409, `${body.path} changed on disk after you loaded it; reload before saving`);
  }
  const text = stringifyComixJson(body.json);
  writeAtomic(target, text);
  let regenerated = false;
  let warning;
  try {
    regenerated = writeComixCatalog(compileAllComix().ts);
  } catch (err) {
    warning = `saved, but the comix catalog was not recompiled: ${err.message}`;
  }
  return send(res, 200, { ok: true, regenerated, etag: etagOf(text), warning });
}

async function handle(req, res, url) {
  assertLocal(req);
  const parts = url.pathname.split('/').filter(Boolean); // api comix [slug action]
  const slug = parts[2] ?? '';
  if (req.method === 'GET' && parts.length === 2) {
    return send(res, 200, { writable: true, comixes: listComixIds().map(readComix) });
  }
  if (req.method === 'GET' && parts[3] === 'etags') {
    const slugs = listComixIds();
    if (!slugs.includes(slug)) return send(res, 200, { etags: {}, slugs });
    return send(res, 200, { etags: readComix(slug).etags, slugs });
  }
  if (req.method === 'PUT' && parts[3] === 'file') return putFile(req, res, slug);
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
