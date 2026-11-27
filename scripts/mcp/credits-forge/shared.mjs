// Shared context, errors, and input checks for credits-forge MCP tools.
import { createServer } from 'vite';
import { catalogFile, chaptersDir, listChapterSlugs, readChapter } from '../../harness/lib/chapter-compile.mjs';
import { comixCatalogFile, comixDir, listComixIds, readComix } from '../../harness/lib/comix-compile.mjs';
import { HttpError } from '../../harness/lib/editor-api-common.mjs';
import { projectRoot } from '../../harness/lib/load.mjs';
import { labsDir } from '../../harness/lib/terminal-lab-api.mjs';

export const ID_RE = /^[\w.-]{1,80}$/;
export const MAX_SPEC_CHARS = 200_000;
export const MAX_ISSUES = 200;

/** `code`: invalid_input, not_found, refused or conflict. A refusal never changes a file. */
export class ForgeError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function createContext({
  root = chaptersDir,
  catalog = catalogFile,
  comixRoot = comixDir,
  comixCatalog = comixCatalogFile,
  labsRoot = labsDir,
} = {}) {
  let vite = null;
  return {
    chaptersRoot: root,
    catalog,
    comixRoot,
    comixCatalog,
    labsRoot,
    async load(path) {
      vite ??= await createServer({
        root: projectRoot,
        configFile: false,
        logLevel: 'silent',
        appType: 'custom',
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
        optimizeDeps: { noDiscovery: true, include: [] },
      });
      return vite.ssrLoadModule(path);
    },
    /** After a catalog changed: drop Vite's cached modules so the next call sees the new file. */
    invalidate() {
      vite?.moduleGraph.invalidateAll();
    },
    async close() {
      const v = vite;
      vite = null;
      await v?.close();
    },
  };
}

export function idOf(value, name) {
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    throw new ForgeError('invalid_input', `${name} must be 1-80 characters of letters, digits, "_", "." or "-"`);
  }
  return value;
}

export function objOf(value, name = 'spec') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ForgeError('invalid_input', `${name} must be a JSON object`);
  }
  if (JSON.stringify(value).length > MAX_SPEC_CHARS) {
    throw new ForgeError('invalid_input', `${name} is larger than ${MAX_SPEC_CHARS} characters`);
  }
  return value;
}

export function specOf(value, name = 'spec') {
  const obj = objOf(value, name);
  if (typeof obj.id !== 'string' || !ID_RE.test(obj.id)) {
    throw new ForgeError('invalid_input', `${name}.id must be a level id`);
  }
  return obj;
}

export function chapterOf(ctx, slug) {
  idOf(slug, 'chapter');
  if (!listChapterSlugs(ctx.chaptersRoot).includes(slug)) {
    throw new ForgeError('not_found', `unknown chapter "${slug}"; list_levels shows the chapters`);
  }
  return readChapter(slug, ctx.chaptersRoot);
}

export function comixOf(ctx, slug) {
  idOf(slug, 'comix');
  if (!listComixIds(ctx.comixRoot).includes(slug)) {
    throw new ForgeError('not_found', `unknown comix "${slug}"; list_comix shows the sequences`);
  }
  return readComix(slug, ctx.comixRoot);
}

export function mapSafeTargetError(err) {
  if (err instanceof HttpError) {
    throw new ForgeError(err.status === 404 ? 'not_found' : 'refused', err.message);
  }
  throw err;
}

export const brief = (issue) => ({ severity: issue.severity, where: issue.where, message: issue.message });
