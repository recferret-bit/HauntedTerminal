// Chapter, level, and game asset tools for credits-forge.
import { readFileSync } from 'node:fs';
import { stringifyChapterJson } from '../../harness/lib/chapter-json.mjs';
import { compileAll, etagOf, listChapterSlugs, readChapter, writeCatalog } from '../../harness/lib/chapter-compile.mjs';
import { resolveSafeSpecTarget, writeAtomicText } from '../../harness/lib/editor-api-common.mjs';
import { brief, chapterOf, ForgeError, idOf, mapSafeTargetError, MAX_ISSUES, objOf, specOf } from './shared.mjs';

const LEVEL_SPEC_RE = /^levels\/[\w.-]+\/level\.spec\.json$/;
const CHAPTER_FILE_READ_RE = /^(chapter\.manifest\.json|levels\/[\w.-]+\/level\.spec\.json|story\/[\w.-]+\.json)$/;
const CHAPTER_FILE_WRITE_RE = /^(chapter\.manifest\.json|story\/[\w.-]+\.json)$/;

/** The chapter as the game consumes it, with `draft` in place of the level of the same id (or added, when the id is new). */
function packWith(chapter, draft) {
  const specs = chapter.levels.map((l) => l.spec);
  const at = draft ? specs.findIndex((s) => s.id === draft.id) : -1;
  const levels = !draft ? specs : at >= 0 ? specs.map((s, i) => (i === at ? draft : s)) : [...specs, draft];
  return { manifest: chapter.manifest, levels: [...levels].sort((a, b) => a.index - b.index), dialogs: chapter.dialogs, comix: chapter.comix };
}

function packWithChapterFile(chapter, relPath, json) {
  const manifest = relPath === 'chapter.manifest.json' ? json : chapter.manifest;
  const dialogs = relPath === chapter.dialogsPath ? json : chapter.dialogs;
  const comix = relPath === chapter.comixPath ? json : chapter.comix;
  let levels = chapter.levels.map((l) => l.spec);
  if (LEVEL_SPEC_RE.test(relPath)) {
    const idx = chapter.levels.findIndex((l) => l.path === relPath);
    if (idx >= 0) levels = levels.map((s, i) => (i === idx ? json : s));
    else levels = [...levels, json];
  }
  return { manifest, levels: [...levels].sort((a, b) => a.index - b.index), dialogs, comix };
}

function draftOf(chapter, { spec, levelId }) {
  if (spec !== undefined) return specOf(spec);
  const id = idOf(levelId, 'levelId');
  const found = chapter.levels.find((l) => l.spec.id === id);
  if (!found) throw new ForgeError('not_found', `level "${id}" is not in chapter "${chapter.slug}"; list_levels shows the levels`);
  return found.spec;
}

export async function listAssets(ctx, input = {}) {
  const kind = input.kind ?? 'all';
  if (!['all', 'models', 'rooms', 'fx', 'audio'].includes(kind)) throw new ForgeError('invalid_input', 'kind must be all, models, rooms, fx or audio');
  const out = {};
  if (kind === 'all' || kind === 'models') {
    const { ModelCatalog } = await ctx.load('/src/procgen/index.ts');
    out.models = ModelCatalog.list().map((m) => ({ id: m.id, category: m.category }));
  }
  if (kind === 'all' || kind === 'rooms') out.rooms = [...(await ctx.load('/src/procgen/archetypes/rooms/frame.ts')).ROOM_KINDS];
  if (kind === 'all' || kind === 'fx') {
    const { FxCatalog } = await ctx.load('/src/procgen/index.ts');
    out.fx = FxCatalog.list().map((p) => ({
      id: p.id,
      label: p.label,
      family: p.family,
      anchor: p.anchor,
      durationMs: p.durationMs,
      stepFps: p.stepFps ?? 12,
      loop: Boolean(p.loop),
      wrapActor: Boolean(p.wrapActor),
      fullPanel: Boolean(p.fullPanel),
      shake: p.shake ?? null,
      flash: p.flash ?? null,
      word: p.onomatopoeia?.text ?? null,
      moment: p.trigger?.moment ?? null,
      trigger: p.trigger ? { event: p.trigger.event, moment: p.trigger.moment, when: p.trigger.when } : null,
      layerCount: p.layers.length,
      particleCount: p.layers.reduce((sum, l) => sum + l.count, 0),
      layers: p.layers.map((l) => ({ name: l.name, role: l.role, zone: l.zone, emit: l.emit, count: l.count })),
    }));
  }
  if (kind === 'all' || kind === 'audio') {
    const { SFX_IDS, MUSIC_IDS } = await ctx.load('/src/contracts/audio-cues.ts');
    out.audio = { sfx: [...SFX_IDS], music: [...MUSIC_IDS] };
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

function resolveChapterTarget(ctx, slug, relPath, writableRe) {
  try {
    return resolveSafeSpecTarget({
      slug,
      knownSlugs: listChapterSlugs(ctx.chaptersRoot),
      kindLabel: 'chapter',
      relPath,
      writableRe,
      rootDir: ctx.chaptersRoot,
    });
  } catch (err) {
    mapSafeTargetError(err);
  }
}

export async function writeLevel(ctx, input) {
  const chapter = chapterOf(ctx, input.chapter);
  const levelId = idOf(input.levelId, 'levelId');
  const spec = specOf(input.spec);
  if (spec.id !== levelId) throw new ForgeError('refused', `spec.id "${spec.id}" differs from levelId "${levelId}"; renaming a level requires updating chapter.manifest.json and its levels/<id>/level.spec.json path on disk`);
  if (typeof input.baseEtag !== 'string' || !input.baseEtag) throw new ForgeError('invalid_input', 'baseEtag is required: send the etag get_level returned');
  const entry = chapter.manifest.levels.find((l) => l.id === levelId);
  if (!entry?.specPath) throw new ForgeError('refused', `level "${levelId}" is not in the manifest of "${chapter.slug}". Scaffold levels/<id>/level.spec.json on disk, register it in chapter.manifest.json, and compile via generate-chapter.mjs first; write_level updates existing levels only`);
  const file = resolveChapterTarget(ctx, chapter.slug, entry.specPath, LEVEL_SPEC_RE);
  const original = readFileSync(file, 'utf8');
  if (etagOf(original) !== input.baseEtag) throw new ForgeError('conflict', `${entry.specPath} changed on disk after you read it; call get_level again and redo the change on the new spec`);

  const { blocking } = await checkDraft(ctx, chapter, spec);
  if (blocking.length) throw new ForgeError('refused', `validation failed: ${blocking.length} error(s); nothing was written`, { issues: blocking.slice(0, MAX_ISSUES).map(brief) });
  const solved = await solveDraft(ctx, chapter, spec);
  if (!solved.ok) throw new ForgeError('refused', `the level does not clear with 0 deaths (${solved.problem ?? `${solved.deaths} death(s)`}); nothing was written`, { solve: solved });

  const text = stringifyChapterJson(spec, entry.specPath);
  writeAtomicText(file, text);
  try {
    const regenerated = writeCatalog(compileAll(ctx.chaptersRoot).ts, ctx.catalog);
    ctx.invalidate();
    return { ok: true, path: entry.specPath, changed: text !== original, regenerated, etag: etagOf(text), commands: solved.commands, deaths: solved.deaths };
  } catch (err) {
    writeAtomicText(file, original);
    throw new ForgeError('refused', `the catalog did not recompile (${err.message}); the spec was restored and nothing changed`);
  }
}

export async function getChapterFile(ctx, input) {
  const chapter = chapterOf(ctx, input.chapter);
  if (typeof input.path !== 'string' || !input.path) throw new ForgeError('invalid_input', 'path must be a chapter spec path');
  const file = resolveChapterTarget(ctx, chapter.slug, input.path, CHAPTER_FILE_READ_RE);
  const text = readFileSync(file, 'utf8');
  return { chapter: chapter.slug, path: input.path, etag: etagOf(text), json: JSON.parse(text) };
}

export async function validateChapter(ctx, input) {
  const chapter = chapterOf(ctx, input.chapter);
  const hasDraft = input.path !== undefined || input.json !== undefined;
  if (hasDraft && (typeof input.path !== 'string' || input.json === undefined)) {
    throw new ForgeError('invalid_input', 'provide both path and json, or omit both to validate the chapter on disk');
  }
  const pack = hasDraft
    ? (() => {
        if (!CHAPTER_FILE_READ_RE.test(input.path)) throw new ForgeError('invalid_input', `unsupported chapter path "${input.path}"`);
        return packWithChapterFile(chapter, input.path, objOf(input.json, 'json'));
      })()
    : packWith(chapter);
  const { checkPack } = await ctx.load('/src/chapter-editor/check.ts');
  const issues = checkPack(pack);
  const errors = issues.filter((i) => i.severity === 'error');
  return {
    ok: errors.length === 0,
    chapter: chapter.slug,
    errors: errors.length,
    warnings: issues.length - errors.length,
    issues: issues.slice(0, MAX_ISSUES).map(brief),
    truncated: issues.length > MAX_ISSUES,
  };
}

export async function writeChapterFile(ctx, input) {
  const chapter = chapterOf(ctx, input.chapter);
  if (typeof input.path !== 'string' || !input.path) throw new ForgeError('invalid_input', 'path must be chapter.manifest.json or story/<file>.json');
  if (LEVEL_SPEC_RE.test(input.path)) throw new ForgeError('refused', 'use write_level for level.spec.json so solve_level verifies 0 deaths');
  if (input.path !== 'chapter.manifest.json' && input.path !== chapter.dialogsPath && input.path !== chapter.comixPath) {
    throw new ForgeError('refused', `"${input.path}" is not referenced by chapter.manifest.json (comix.dialogsPath / comix.specPath)`);
  }
  const file = resolveChapterTarget(ctx, chapter.slug, input.path, CHAPTER_FILE_WRITE_RE);
  const json = objOf(input.json, 'json');
  if (input.path === 'chapter.manifest.json' && typeof json.id === 'string' && json.id !== chapter.manifest.id) {
    throw new ForgeError('refused', `manifest.id "${json.id}" differs from "${chapter.manifest.id}"; renaming a chapter is not allowed`);
  }
  if (typeof input.baseEtag !== 'string' || !input.baseEtag) {
    throw new ForgeError('invalid_input', 'baseEtag is required: send the etag get_chapter_file returned');
  }
  const original = readFileSync(file, 'utf8');
  if (etagOf(original) !== input.baseEtag) {
    throw new ForgeError('conflict', `${input.path} changed on disk after you read it; call get_chapter_file again`);
  }

  const { checkPack } = await ctx.load('/src/chapter-editor/check.ts');
  const before = new Set(checkPack(packWith(chapter)).filter((i) => i.severity === 'error').map((i) => `${i.where}|${i.message}`));
  const targetWhere = input.path === 'chapter.manifest.json' ? 'chapter' : input.path === chapter.dialogsPath ? 'dialogs' : 'comix';
  const issues = checkPack(packWithChapterFile(chapter, input.path, json));
  const blocking = issues.filter((i) => i.severity === 'error' && (i.where === targetWhere || !before.has(`${i.where}|${i.message}`)));
  if (blocking.length) {
    throw new ForgeError('refused', `chapter validation failed: ${blocking.length} error(s); nothing was written`, { issues: blocking.slice(0, MAX_ISSUES).map(brief) });
  }

  const text = stringifyChapterJson(json, input.path);
  writeAtomicText(file, text);
  try {
    const regenerated = writeCatalog(compileAll(ctx.chaptersRoot).ts, ctx.catalog);
    ctx.invalidate();
    return { ok: true, chapter: chapter.slug, path: input.path, changed: text !== original, regenerated, etag: etagOf(text) };
  } catch (err) {
    writeAtomicText(file, original);
    throw new ForgeError('refused', `the catalog did not recompile (${err.message}); the file was restored and nothing changed`);
  }
}
