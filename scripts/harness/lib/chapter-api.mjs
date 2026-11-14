// Dev-server API behind the chapter editor (`/editor`). A Vite plugin: dev server only, never in `vite build`.
//
//   GET  /api/chapters                      every chapter as the editor needs it, read fresh from disk, with file etags
//   GET  /api/chapters/<slug>/etags         { etags, slugs } for every spec file now on disk (change detection)
//   PUT  /api/chapters/<slug>/file          { path, json, baseEtag }  write one spec file, then recompile the catalog
//   POST /api/chapters/<slug>/render-comix  redraw the comic pages (scripts/harness/draw-comix.mjs)
//
// Safety: only chapter.manifest.json, levels/<dir>/level.spec.json and story/*.json that already exist can be written.
// Writes need Content-Type: application/json (forces a CORS preflight, which this API never grants) and a same-origin
// Host/Origin, so another web page cannot drive them. A write whose `baseEtag` is not the file's current hash is refused
// with 409: somebody (an agent, git, another tab) changed the file after the editor loaded it.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stringifyChapterJson } from './chapter-json.mjs';
import { chaptersDir, compileAll, etagOf, listChapterSlugs, readChapter, writeCatalog } from './chapter-compile.mjs';
import {
  assertLocalOrigin,
  assertPutPayload,
  HttpError,
  readJsonObjectBody,
  resolveSafeSpecTarget,
  sendJson,
  SLUG_RE,
  writeAtomicText,
} from './editor-api-common.mjs';
import { projectRoot } from './load.mjs';

const WRITABLE = /^(chapter\.manifest\.json|levels\/[\w.-]+\/level\.spec\.json|story\/[\w.-]+\.json)$/;

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
  const body = await readJsonObjectBody(req);
  const target = resolveSafeSpecTarget({
    slug,
    knownSlugs: listChapterSlugs(),
    kindLabel: 'chapter',
    relPath: body.path,
    writableRe: WRITABLE,
    rootDir: chaptersDir,
  });
  assertPutPayload(body);
  const current = etagOf(readFileSync(target, 'utf8'));
  if (body.baseEtag !== undefined && body.baseEtag !== current) {
    throw new HttpError(409, `${body.path} changed on disk after you loaded it; reload before saving`);
  }
  const text = stringifyChapterJson(body.json, body.path);
  writeAtomicText(target, text);
  let regenerated = false;
  let warning;
  try {
    regenerated = writeCatalog(compileAll().ts);
  } catch (err) {
    warning = `saved, but the catalog was not recompiled: ${err.message}`;
  }
  return sendJson(res, 200, { ok: true, regenerated, etag: etagOf(text), warning });
}

async function handle(req, res, url) {
  assertLocalOrigin(req, 'chapter');
  const parts = url.pathname.split('/').filter(Boolean); // api chapters [slug action]
  const slug = parts[2] ?? '';
  if (req.method === 'GET' && parts.length === 2) {
    return sendJson(res, 200, { writable: true, chapters: listChapterSlugs().map(readChapter) });
  }
  if (req.method === 'GET' && parts[3] === 'etags') {
    const slugs = listChapterSlugs();
    if (!slugs.includes(slug)) return sendJson(res, 200, { etags: {}, slugs });
    return sendJson(res, 200, { etags: readChapter(slug).etags, slugs });
  }
  if (req.method === 'PUT' && parts[3] === 'file') return putFile(req, res, slug);
  if (req.method === 'POST' && parts[3] === 'render-comix') {
    if (!SLUG_RE.test(slug) || !existsSync(resolve(chaptersDir, slug))) throw new HttpError(404, 'unknown chapter');
    return sendJson(res, 200, await renderComix(slug));
  }
  throw new HttpError(404, 'not found');
}

export function chapterApi() {
  const middleware = (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/chapters')) return next();
    handle(req, res, url).catch((err) => sendJson(res, err instanceof HttpError ? err.status : 500, { error: String(err?.message ?? err) }));
  };
  return {
    name: 'chapter-api',
    apply: 'serve',
    configureServer: (server) => {
      server.middlewares.use(middleware);
    },
  };
}
