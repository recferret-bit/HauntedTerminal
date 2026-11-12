// Dev-server API behind the chapter editor (`/editor`). A Vite plugin: dev server only, never in `vite build`.
//
//   GET  /api/chapters                      every chapter as the editor needs it, read fresh from disk, with file etags
//   GET  /api/chapters/<slug>/etags         { path: etag } for every spec file now on disk (change detection)
//   PUT  /api/chapters/<slug>/file          { path, json, baseEtag }  write one spec file, then recompile the catalog
//   POST /api/chapters/<slug>/render-comix  redraw the comic pages (scripts/harness/draw-comix.mjs)
//
// Safety: only chapter.manifest.json, levels/<dir>/level.spec.json and story/*.json that already exist can be written.
// Writes need Content-Type: application/json (forces a CORS preflight, which this API never grants) and a same-origin
// Host/Origin, so another web page cannot drive them. A write whose `baseEtag` is not the file's current hash is refused
// with 409: somebody (an agent, git, another tab) changed the file after the editor loaded it.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { stringifyChapterJson } from './chapter-json.mjs';
import { chaptersDir, compileAll, etagOf, listChapterSlugs, readChapter, writeCatalog } from './chapter-compile.mjs';
import { projectRoot } from './load.mjs';

const WRITABLE = /^(chapter\.manifest\.json|levels\/[\w.-]+\/level\.spec\.json|story\/[\w.-]+\.json)$/;
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

/** Same-origin only: a local Host, and an Origin (when the browser sends one) that matches it. */
function assertLocal(req) {
  const host = String(req.headers.host ?? '');
  if (!LOCAL_HOST.test(host)) throw new HttpError(403, 'the chapter API answers local requests only');
  const origin = req.headers.origin;
  let originHost = '';
  try {
    originHost = origin ? new URL(origin).host : host;
  } catch {
    /* Origin: null (sandboxed frame) falls through to the refusal below */
  }
  if (originHost !== host) throw new HttpError(403, 'cross-origin request refused');
}

function readBody(req) {
  const type = String(req.headers['content-type'] ?? '');
  if (!type.startsWith('application/json')) throw new HttpError(415, 'send Content-Type: application/json');
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        fail(new HttpError(413, 'body too large'));
        req.destroy();
      } else chunks.push(c);
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

/** Resolves a writable, existing spec file inside a chapter folder, or throws. */
function safeTarget(slug, relPath) {
  if (!SLUG.test(slug) || !listChapterSlugs().includes(slug)) throw new HttpError(404, `unknown chapter "${slug}"`);
  if (typeof relPath !== 'string' || !WRITABLE.test(relPath)) throw new HttpError(400, `path not writable: ${relPath}`);
  const dir = resolve(chaptersDir, slug);
  const target = resolve(dir, relPath);
  if (!target.startsWith(dir + sep)) throw new HttpError(400, 'path escapes the chapter folder');
  if (!existsSync(target)) throw new HttpError(404, `${relPath} does not exist; add it to the chapter first`);
  return target;
}

function writeAtomic(target, text) {
  const tmp = `${target}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, target);
}

function renderComix(slug) {
  return new Promise((ok) => {
    const child = spawn(process.execPath, ['scripts/harness/draw-comix.mjs', '--chapter', slug], { cwd: projectRoot });
    let log = '';
    const timer = setTimeout(() => child.kill(), 180_000);
    child.stdout.on('data', (d) => (log += d));
    child.stderr.on('data', (d) => (log += d));
    child.on('close', (code) => {
      clearTimeout(timer);
      ok({ ok: code === 0, code, log: log.slice(-4000) });
    });
  });
}

async function putFile(req, res, slug) {
  const body = await readBody(req);
  const target = safeTarget(slug, body.path);
  if (body.json === null || typeof body.json !== 'object' || Array.isArray(body.json)) throw new HttpError(400, 'json must be an object');
  const current = etagOf(readFileSync(target, 'utf8'));
  if (body.baseEtag !== undefined && body.baseEtag !== current) {
    throw new HttpError(409, `${body.path} changed on disk after you loaded it; reload before saving`);
  }
  const text = stringifyChapterJson(body.json, body.path);
  writeAtomic(target, text);
  let regenerated = false;
  let warning;
  try {
    regenerated = writeCatalog(compileAll().ts);
  } catch (err) {
    warning = `saved, but the catalog was not recompiled: ${err.message}`;
  }
  return send(res, 200, { ok: true, regenerated, etag: etagOf(text), warning });
}

async function handle(req, res, url) {
  assertLocal(req);
  const parts = url.pathname.split('/').filter(Boolean); // api chapters [slug action]
  const slug = parts[2] ?? '';
  if (req.method === 'GET' && parts.length === 2) {
    return send(res, 200, { writable: true, chapters: listChapterSlugs().map(readChapter) });
  }
  if (req.method === 'GET' && parts[3] === 'etags') {
    if (!listChapterSlugs().includes(slug)) throw new HttpError(404, 'unknown chapter');
    return send(res, 200, { etags: readChapter(slug).etags });
  }
  if (req.method === 'PUT' && parts[3] === 'file') return putFile(req, res, slug);
  if (req.method === 'POST' && parts[3] === 'render-comix') {
    if (!SLUG.test(slug) || !existsSync(resolve(chaptersDir, slug))) throw new HttpError(404, 'unknown chapter');
    return send(res, 200, await renderComix(slug));
  }
  throw new HttpError(404, 'not found');
}

export function chapterApi() {
  const middleware = (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/chapters')) return next();
    handle(req, res, url).catch((err) => send(res, err instanceof HttpError ? err.status : 500, { error: String(err?.message ?? err) }));
  };
  return {
    name: 'chapter-api',
    apply: 'serve',
    configureServer: (server) => {
      server.middlewares.use(middleware);
    },
  };
}
