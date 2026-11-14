// Shared safety and HTTP primitives for dev-only editor Vite plugins (`chapter-api.mjs` and `comix-api.mjs`).
import { existsSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

export const SLUG_RE = /^[\w.-]+$/;
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
let atomicSeq = 0;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

/** Same-origin only: a local Host, and an Origin (when the browser sends one) that matches it. */
export function assertLocalOrigin(req, label) {
  const host = String(req.headers.host ?? '');
  if (!LOCAL_HOST_RE.test(host)) throw new HttpError(403, `the ${label} API answers local requests only`);
  const origin = req.headers.origin;
  let originHost = '';
  try {
    originHost = origin ? new URL(origin).host : host;
  } catch {
    /* Origin: null (sandboxed frame or invalid URL) falls through to refusal below */
  }
  if (originHost !== host) throw new HttpError(403, 'cross-origin request refused');
}

/** Parses a JSON object body (`Content-Type: application/json`, <= 8 MiB, non-null non-array object). */
export function readJsonObjectBody(req) {
  const type = String(req.headers['content-type'] ?? '');
  if (!type.startsWith('application/json')) throw new HttpError(415, 'send Content-Type: application/json');
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        fail(new HttpError(413, 'body too large'));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        fail(new HttpError(400, 'body is not valid JSON'));
        return;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        fail(new HttpError(400, 'body must be a JSON object'));
        return;
      }
      ok(parsed);
    });
    req.on('error', fail);
  });
}

/** Validates `{ json, baseEtag }` fields on a `PUT .../file` payload. */
export function assertPutPayload(body) {
  if (body.json === null || typeof body.json !== 'object' || Array.isArray(body.json)) {
    throw new HttpError(400, 'json must be an object');
  }
  if (body.baseEtag !== undefined && typeof body.baseEtag !== 'string') {
    throw new HttpError(400, 'baseEtag must be a string');
  }
}

/** Resolves an existing whitelisted spec file inside `<rootDir>/<slug>/` or throws `HttpError`. */
export function resolveSafeSpecTarget({ slug, knownSlugs, kindLabel, relPath, writableRe, rootDir }) {
  if (!SLUG_RE.test(slug) || !knownSlugs.includes(slug)) {
    throw new HttpError(404, `unknown ${kindLabel} "${slug}"`);
  }
  if (typeof relPath !== 'string' || !writableRe.test(relPath)) {
    throw new HttpError(400, `path not writable: ${relPath}`);
  }
  const dir = resolve(rootDir, slug);
  const target = resolve(dir, relPath);
  if (!target.startsWith(`${dir}${sep}`)) throw new HttpError(400, `path escapes the ${kindLabel} folder`);
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw new HttpError(404, `${relPath} does not exist; add it to the ${kindLabel} first`);
  }
  return target;
}

/** Collision-safe atomic file write via unique temp file + rename. */
export function writeAtomicText(target, text) {
  atomicSeq = (atomicSeq + 1) % 1_000_000;
  const tmp = `${target}.${process.pid}.${Date.now()}-${atomicSeq}.tmp`;
  try {
    writeFileSync(tmp, text);
    renameSync(tmp, target);
  } catch (err) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* ignore secondary cleanup error */
    }
    throw err;
  }
}
