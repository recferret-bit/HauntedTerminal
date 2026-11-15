// Dev-server API behind the Terminal Lab (`/terminal-lab`). A Vite plugin: dev server only, never in `vite build`.
//
//   GET  /api/terminal-lab          every lab file in the labs folder, read fresh from disk, with its etag
//   GET  /api/terminal-lab/etags    { etags, files } for the files now on disk (change detection)
//   PUT  /api/terminal-lab/file     { path, json, baseEtag }  create or overwrite one `<id>.lab.json`
//
// The folder is scripts/harness/terminal-lab/, or $TERMINAL_LAB_DIR (the smoke test points it at a temporary folder).
// Same safety as the chapter API: local Host and same-origin only, `Content-Type: application/json` required (which forces a
// CORS preflight this API never grants), JSON object bodies, atomic writes. The only writable names are `<id>.lab.json`
// directly inside the folder, lowercase (so a name means one file on every file system), and the id in the file must equal
// the id in its name. Overwriting needs the file's current etag as `baseEtag`: a stale one is refused with 409, and so is
// creating over a file that already exists. There is no delete.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { assertLocalOrigin, assertPutPayload, devApiPlugin, etagOf, HttpError, readJsonObjectBody, sendJson, writeAtomicText } from './editor-api-common.mjs';
import { stringifyLabJson } from './lab-json.mjs';
import { projectRoot } from './load.mjs';

export const labsDir = resolve(projectRoot, 'scripts/harness/terminal-lab');
/** Same rule as `LAB_ID_RE` in src/terminal-lab/store.ts, plus the extension. */
export const LAB_FILE_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.lab\.json$/;
export const MAX_LAB_FILES = 200;

/** Repo-relative path when `dir` is inside `projectRoot`, otherwise the resolved path (e.g. `$TERMINAL_LAB_DIR`). */
export function displayLabDir(dir = labsDir) {
  const rel = relative(projectRoot, dir).split(sep).join('/');
  return rel && !rel.startsWith('../') && rel !== '..' ? rel : dir.split(sep).join('/');
}

export function displayLabPath(dir, file) {
  return `${displayLabDir(dir)}/${file}`;
}

/** Lab files in `dir`, sorted. Directories with a lab-like name are not labs. */
export function listLabFiles(dir = labsDir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => LAB_FILE_RE.test(f) && statSync(resolve(dir, f)).isFile()).sort();
}

/** Every lab on disk. A file that is not valid JSON is listed with a `problem` instead of hiding it. */
export function readLabs(dir = labsDir) {
  return listLabFiles(dir).map((file) => {
    const text = readFileSync(resolve(dir, file), 'utf8');
    const etag = etagOf(text);
    const id = file.slice(0, -'.lab.json'.length);
    try {
      return { file, id, json: JSON.parse(text), etag };
    } catch (err) {
      return { file, id, json: null, etag, problem: `not valid JSON: ${err.message}` };
    }
  });
}

function assertLabJson(body) {
  assertPutPayload(body);
  if (typeof body.path !== 'string' || !LAB_FILE_RE.test(body.path)) throw new HttpError(400, `path not writable: ${body.path}`);
  const { json } = body;
  if (typeof json.id !== 'string' || `${json.id}.lab.json` !== body.path) throw new HttpError(400, 'the lab id must match its file name');
  if (!Array.isArray(json.setup) || !Array.isArray(json.steps)) throw new HttpError(400, 'a lab needs setup and steps lists');
}

async function putFile(req, res, dir) {
  const body = await readJsonObjectBody(req);
  assertLabJson(body);
  const target = resolve(dir, body.path);
  if (!target.startsWith(`${dir}${sep}`)) throw new HttpError(400, 'path escapes the labs folder');
  const exists = existsSync(target);
  if (exists) {
    if (!statSync(target).isFile()) throw new HttpError(400, `${body.path} is not a file`);
    if (body.baseEtag === undefined) throw new HttpError(409, `${body.path} already exists in the repo; open it first, or rename this lab`);
    if (body.baseEtag !== etagOf(readFileSync(target, 'utf8'))) throw new HttpError(409, `${body.path} changed on disk after you loaded it; reload before saving`);
  } else {
    if (body.baseEtag !== undefined) throw new HttpError(409, `${body.path} is gone from the repo; save it again as a new file`);
    if (listLabFiles(dir).length >= MAX_LAB_FILES) throw new HttpError(400, `the labs folder is full (${MAX_LAB_FILES} files)`);
    mkdirSync(dir, { recursive: true });
  }
  const text = stringifyLabJson(body.json);
  writeAtomicText(target, text);
  return sendJson(res, 200, { ok: true, created: !exists, etag: etagOf(text), path: displayLabPath(dir, body.path) });
}

/** The request handler, with the folder as a parameter so tests can use a temporary one. */
export function createLabHandler(dir = labsDir) {
  return async (req, res, url) => {
    assertLocalOrigin(req, 'terminal lab');
    const parts = url.pathname.split('/').filter(Boolean); // api terminal-lab [action]
    if (req.method === 'GET' && parts.length === 2) return sendJson(res, 200, { writable: true, labs: readLabs(dir) });
    if (req.method === 'GET' && parts[2] === 'etags' && parts.length === 3) {
      const labs = readLabs(dir);
      return sendJson(res, 200, { dir: displayLabDir(dir), etags: Object.fromEntries(labs.map((l) => [l.file, l.etag])), files: labs.map((l) => l.file) });
    }
    if (req.method === 'PUT' && parts[2] === 'file' && parts.length === 3) return putFile(req, res, dir);
    throw new HttpError(404, 'not found');
  };
}

export function terminalLabApi(dir = process.env.TERMINAL_LAB_DIR ? resolve(process.env.TERMINAL_LAB_DIR) : labsDir) {
  return devApiPlugin('terminal-lab-api', '/api/terminal-lab', createLabHandler(dir));
}
