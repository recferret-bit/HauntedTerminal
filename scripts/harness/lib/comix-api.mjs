// Dev-server API behind the comix editor (`/comix-editor`). A Vite plugin: dev server only, never in `vite build`.
//
//   GET /api/comix                 every comix as the editor needs it, read fresh from disk, with file etags
//   GET /api/comix/<slug>/etags    { etags, slugs } for every spec file now on disk (change detection)
//   PUT /api/comix/<slug>/file     { path, json, baseEtag }  write one spec file, then recompile catalog-data.ts
//
// Safety matches the chapter API: only existing `comix.manifest.json` and `pages/<dir>/page.spec.json` inside that
// comix folder can be written. Requires Content-Type: application/json, same-origin Host/Origin, baseEtag 409 check,
// and atomic rename.
import { readFileSync } from 'node:fs';
import { comixDir, compileAllComix, etagOf, listComixIds, readComix, writeComixCatalog } from './comix-compile.mjs';
import { stringifyComixJson } from './comix-json.mjs';
import {
  assertLocalOrigin,
  assertPutPayload,
  HttpError,
  readJsonObjectBody,
  resolveSafeSpecTarget,
  sendJson,
  writeAtomicText,
} from './editor-api-common.mjs';

const WRITABLE = /^(comix\.manifest\.json|pages\/[\w.-]+\/page\.spec\.json)$/;

async function putFile(req, res, slug) {
  const body = await readJsonObjectBody(req);
  const target = resolveSafeSpecTarget({
    slug,
    knownSlugs: listComixIds(),
    kindLabel: 'comix',
    relPath: body.path,
    writableRe: WRITABLE,
    rootDir: comixDir,
  });
  assertPutPayload(body);
  const current = etagOf(readFileSync(target, 'utf8'));
  if (body.baseEtag !== undefined && body.baseEtag !== current) {
    throw new HttpError(409, `${body.path} changed on disk after you loaded it; reload before saving`);
  }
  const text = stringifyComixJson(body.json);
  writeAtomicText(target, text);
  let regenerated = false;
  let warning;
  try {
    regenerated = writeComixCatalog(compileAllComix().ts);
  } catch (err) {
    warning = `saved, but the comix catalog was not recompiled: ${err.message}`;
  }
  return sendJson(res, 200, { ok: true, regenerated, etag: etagOf(text), warning });
}

async function handle(req, res, url) {
  assertLocalOrigin(req, 'comix');
  const parts = url.pathname.split('/').filter(Boolean); // api comix [slug action]
  const slug = parts[2] ?? '';
  if (req.method === 'GET' && parts.length === 2) {
    return sendJson(res, 200, { writable: true, comixes: listComixIds().map(readComix) });
  }
  if (req.method === 'GET' && parts[3] === 'etags') {
    const slugs = listComixIds();
    if (!slugs.includes(slug)) return sendJson(res, 200, { etags: {}, slugs });
    return sendJson(res, 200, { etags: readComix(slug).etags, slugs });
  }
  if (req.method === 'PUT' && parts[3] === 'file') return putFile(req, res, slug);
  throw new HttpError(404, 'not found');
}

export function comixApi() {
  const middleware = (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/comix')) return next();
    handle(req, res, url).catch((err) => sendJson(res, err instanceof HttpError ? err.status : 500, { error: String(err?.message ?? err) }));
  };
  return { name: 'comix-api', apply: 'serve', configureServer: (server) => { server.middlewares.use(middleware); } };
}
