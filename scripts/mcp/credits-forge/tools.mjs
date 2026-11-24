// The tools of the credits-forge MCP server, as plain functions. Spec: .kiro/specs/mcp-devtools-and-forge/.
//
//   list_assets    the model, room and FX ids a level or comix spec may reference
//   list_levels    the chapters and their levels (id, index, title, mechanic)
//   get_level      one level spec with the etag to send back to write_level
//   validate_level the chapter editor's Check tab on the chapter with this level in place (disk untouched)
//   solve_level    the level's solution played headlessly under enemy ticks (disk untouched)
//   write_level    validate + solve + etag, then the canonical writer and a catalog recompile; else a refusal and no change
//
// A tool takes `(ctx, input)` and returns a plain object or throws a ForgeError. `ctx` comes from `createContext`; tests
// point it at a temporary copy of chapters/. The game's TypeScript loads through Vite SSR, like the harness scripts.
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { stringifyChapterJson } from '../../harness/lib/chapter-json.mjs';
import { catalogFile, chaptersDir, compileAll, etagOf, listChapterSlugs, readChapter, writeCatalog } from '../../harness/lib/chapter-compile.mjs';
import { HttpError, resolveSafeSpecTarget, writeAtomicText } from '../../harness/lib/editor-api-common.mjs';
import { projectRoot } from '../../harness/lib/load.mjs';

const ID_RE = /^[\w.-]{1,80}$/;
const MAX_SPEC_CHARS = 200_000;
const MAX_ISSUES = 200;
/** The only file a level write may touch: the editor's WRITABLE rule for a level spec. */
const LEVEL_SPEC_RE = /^levels\/[\w.-]+\/level\.spec\.json$/;

/** `code`: invalid_input, not_found, refused or conflict. A refusal never changes a file. */
export class ForgeError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function createContext({ root = chaptersDir, catalog = catalogFile } = {}) {
  let vite = null;
  return {
    chaptersRoot: root,
    catalog,
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
    /** After the catalog changed: drop Vite's cached modules so the next call sees the new file. */
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

// ---- input checks -----------------------------------------------------------------------------------------------

function idOf(value, name) {
  if (typeof value !== 'string' || !ID_RE.test(value)) throw new ForgeError('invalid_input', `${name} must be 1-80 characters of letters, digits, "_", "." or "-"`);
  return value;
}

function specOf(value, name = 'spec') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ForgeError('invalid_input', `${name} must be a level spec object`);
  if (JSON.stringify(value).length > MAX_SPEC_CHARS) throw new ForgeError('invalid_input', `${name} is larger than ${MAX_SPEC_CHARS} characters`);
  if (typeof value.id !== 'string' || !ID_RE.test(value.id)) throw new ForgeError('invalid_input', `${name}.id must be a level id`);
  return value;
}

function chapterOf(ctx, slug) {
  idOf(slug, 'chapter');
  if (!listChapterSlugs(ctx.chaptersRoot).includes(slug)) throw new ForgeError('not_found', `unknown chapter "${slug}"; list_levels shows the chapters`);
  return readChapter(slug, ctx.chaptersRoot);
}

/** The chapter as the game consumes it, with `draft` in place of the level of the same id (or added, when the id is new). */
function packWith(chapter, draft) {
  const specs = chapter.levels.map((l) => l.spec);
  const at = draft ? specs.findIndex((s) => s.id === draft.id) : -1;
  const levels = !draft ? specs : at >= 0 ? specs.map((s, i) => (i === at ? draft : s)) : [...specs, draft];
  return { manifest: chapter.manifest, levels: [...levels].sort((a, b) => a.index - b.index), dialogs: chapter.dialogs, comix: chapter.comix };
}

/** The draft to check: `spec` when given, else the level `levelId` as it is on disk. */
function draftOf(chapter, { spec, levelId }) {
  if (spec !== undefined) return specOf(spec);
  const id = idOf(levelId, 'levelId');
  const found = chapter.levels.find((l) => l.spec.id === id);
  if (!found) throw new ForgeError('not_found', `level "${id}" is not in chapter "${chapter.slug}"; list_levels shows the levels`);
  return found.spec;
}

const brief = (issue) => ({ severity: issue.severity, where: issue.where, message: issue.message });

// ---- tools ---------------------------------------------------------------------------------------------------------

export async function listAssets(ctx, input = {}) {
  const kind = input.kind ?? 'all';
  if (!['all', 'models', 'rooms', 'fx'].includes(kind)) throw new ForgeError('invalid_input', 'kind must be all, models, rooms or fx');
  const out = {};
  if (kind === 'all' || kind === 'models') {
    const { ModelCatalog } = await ctx.load('/src/procgen/index.ts');
    out.models = ModelCatalog.list().map((m) => ({ id: m.id, category: m.category }));
  }
  if (kind === 'all' || kind === 'rooms') out.rooms = [...(await ctx.load('/src/procgen/archetypes/rooms/frame.ts')).ROOM_KINDS];
  if (kind === 'all' || kind === 'fx') {
    const { FxCatalog } = await ctx.load('/src/procgen/index.ts');
    out.fx = FxCatalog.list().map((p) => ({ id: p.id, moment: p.trigger?.moment ?? null }));
  }
  return out;
}

export async function listLevels(ctx, input = {}) {
  const slugs = input.chapter === undefined ? listChapterSlugs(ctx.chaptersRoot) : [chapterOf(ctx, input.chapter).slug];
  return {
    chapters: slugs.map((slug) => {
      const chapter = readChapter(slug, ctx.chaptersRoot);
      return {
        chapter: slug,
        id: chapter.manifest.id,
        levels: chapter.levels.map((l) => ({ id: l.spec.id, index: l.spec.index, title: l.spec.title, mechanic: l.spec.mechanic, path: l.path })),
      };
    }),
  };
}

export async function getLevel(ctx, input) {
  const chapter = chapterOf(ctx, input.chapter);
  const id = idOf(input.levelId, 'levelId');
  const found = chapter.levels.find((l) => l.spec.id === id);
  if (!found) throw new ForgeError('not_found', `level "${id}" is not in chapter "${chapter.slug}"`);
  return { chapter: chapter.slug, levelId: id, path: found.path, etag: chapter.etags[found.path], spec: found.spec };
}

/** Issues of the draft chapter, and the ones that block a write: this level's, plus any the chapter did not already have. */
async function checkDraft(ctx, chapter, draft) {
  const { checkPack } = await ctx.load('/src/chapter-editor/check.ts');
  const before = new Set(checkPack(packWith(chapter)).filter((i) => i.severity === 'error').map((i) => `${i.where}|${i.message}`));
  const issues = checkPack(packWith(chapter, draft));
  const errors = issues.filter((i) => i.severity === 'error');
  const blocking = errors.filter((i) => i.where === draft.id || !before.has(`${i.where}|${i.message}`));
  return { issues, errors, blocking };
}

export async function validateLevel(ctx, input) {
  const chapter = chapterOf(ctx, input.chapter);
  const draft = draftOf(chapter, input);
  const { issues, errors, blocking } = await checkDraft(ctx, chapter, draft);
  return {
    ok: blocking.length === 0,
    levelId: draft.id,
    errors: errors.length,
    blocking: blocking.length,
    warnings: issues.length - errors.length,
    issues: issues.slice(0, MAX_ISSUES).map(brief),
    truncated: issues.length > MAX_ISSUES,
  };
}

async function solveDraft(ctx, chapter, draft) {
  const { solvePack } = await ctx.load('/src/chapters/solve.ts');
  const report = solvePack(packWith(chapter, draft), { ticks: 2, levelId: draft.id });
  const level = report.levels.find((l) => l.levelId === draft.id);
  if (!level) return { ok: false, commands: 0, deaths: 0, problem: `level "${draft.id}" did not run`, lastOutput: '' };
  return { ok: level.ok && level.deaths === 0, commands: level.commands, deaths: level.deaths, problem: level.problem ?? null, lastOutput: level.lastOutput ?? '' };
}

export async function solveLevel(ctx, input) {
  const chapter = chapterOf(ctx, input.chapter);
  const draft = draftOf(chapter, input);
  return { levelId: draft.id, ...(await solveDraft(ctx, chapter, draft)) };
}

function targetOf(ctx, chapter, levelId) {
  const entry = chapter.manifest.levels.find((l) => l.id === levelId);
  if (!entry?.specPath) throw new ForgeError('refused', `level "${levelId}" is not in the manifest of "${chapter.slug}". Add it in /editor first; write_level updates existing levels only`);
  try {
    return { relPath: entry.specPath, file: resolveSafeSpecTarget({ slug: chapter.slug, knownSlugs: listChapterSlugs(ctx.chaptersRoot), kindLabel: 'chapter', relPath: entry.specPath, writableRe: LEVEL_SPEC_RE, rootDir: ctx.chaptersRoot }) };
  } catch (err) {
    if (err instanceof HttpError) throw new ForgeError('refused', err.message);
    throw err;
  }
}

export async function writeLevel(ctx, input) {
  const chapter = chapterOf(ctx, input.chapter);
  const levelId = idOf(input.levelId, 'levelId');
  const spec = specOf(input.spec);
  if (spec.id !== levelId) throw new ForgeError('refused', `spec.id "${spec.id}" differs from levelId "${levelId}"; renaming a level is a manifest change for /editor`);
  if (typeof input.baseEtag !== 'string' || !input.baseEtag) throw new ForgeError('invalid_input', 'baseEtag is required: send the etag get_level returned');
  const { relPath, file } = targetOf(ctx, chapter, levelId);
  const original = readFileSync(file, 'utf8');
  if (etagOf(original) !== input.baseEtag) throw new ForgeError('conflict', `${relPath} changed on disk after you read it; call get_level again and redo the change on the new spec`);

  const { blocking } = await checkDraft(ctx, chapter, spec);
  if (blocking.length) throw new ForgeError('refused', `validation failed: ${blocking.length} error(s); nothing was written`, { issues: blocking.slice(0, MAX_ISSUES).map(brief) });
  const solved = await solveDraft(ctx, chapter, spec);
  if (!solved.ok) throw new ForgeError('refused', `the level does not clear with 0 deaths (${solved.problem ?? `${solved.deaths} death(s)`}); nothing was written`, { solve: solved });

  const text = stringifyChapterJson(spec, relPath);
  writeAtomicText(file, text);
  try {
    const regenerated = writeCatalog(compileAll(ctx.chaptersRoot).ts, ctx.catalog);
    ctx.invalidate();
    return { ok: true, path: relPath, changed: text !== original, regenerated, etag: etagOf(text), commands: solved.commands, deaths: solved.deaths };
  } catch (err) {
    writeAtomicText(file, original);
    throw new ForgeError('refused', `the catalog did not recompile (${err.message}); the spec was restored and nothing changed`);
  }
}

/** Every tool: name, one-paragraph description for the agent, and the function. The server adds the input schemas. */
export const TOOLS = {
  list_assets: { run: listAssets, description: 'List the ids a level or comix spec may reference: models (with category), room kinds and FX presets. Use before writing a spec that names an asset. kind: all (default), models, rooms or fx.' },
  list_levels: { run: listLevels, description: 'List the chapters and their levels (id, index, title, mechanic, spec path). Pass chapter to list one.' },
  get_level: { run: getLevel, description: 'Read one level spec from disk with its etag. Send the etag back to write_level.' },
  validate_level: { run: validateLevel, description: "Run the chapter editor's Check tab on the chapter with this level in place. Pass a draft `spec`, or `levelId` to check the one on disk. Writes nothing. ok is false when this level has an error or the draft adds one." },
  solve_level: { run: solveLevel, description: "Play the level's solutionCommands headlessly under enemy ticks and report ok, commands, deaths, problem and the last output. Pass a draft `spec`, or `levelId` for the one on disk. Writes nothing." },
  write_level: { run: writeLevel, description: 'Save a level spec: only if it validates, clears with 0 deaths, and baseEtag matches the file. Writes through the canonical JSON writer and recompiles the catalog like /editor. Updates an existing level (same id); otherwise refuses and changes nothing.' },
};
