// Comix (animated 3D comic sequences) tools for credits-forge.
import { readFileSync } from 'node:fs';
import { etagOf } from '../../harness/lib/chapter-compile.mjs';
import { compileAllComix, listComixIds, readComix, writeComixCatalog } from '../../harness/lib/comix-compile.mjs';
import { stringifyComixJson } from '../../harness/lib/comix-json.mjs';
import { resolveSafeSpecTarget, writeAtomicText } from '../../harness/lib/editor-api-common.mjs';
import { brief, comixOf, ForgeError, mapSafeTargetError, MAX_ISSUES, objOf } from './shared.mjs';

const COMIX_FILE_RE = /^(comix\.manifest\.json|pages\/[\w.-]+\/page\.spec\.json)$/;

function packWithComixDraft(comix, relPath, json) {
  const manifest = relPath === 'comix.manifest.json' ? json : comix.manifest;
  let pages = comix.pages.map((p) => p.spec);
  if (relPath && relPath !== 'comix.manifest.json') {
    const idx = comix.pages.findIndex((p) => p.path === relPath);
    if (idx >= 0) pages = pages.map((s, i) => (i === idx ? json : s));
    else pages = [...pages, json];
  }
  return { manifest, pages: [...pages].sort((a, b) => a.index - b.index) };
}

function resolveComixTarget(ctx, slug, relPath) {
  try {
    return resolveSafeSpecTarget({
      slug,
      knownSlugs: listComixIds(ctx.comixRoot),
      kindLabel: 'comix',
      relPath,
      writableRe: COMIX_FILE_RE,
      rootDir: ctx.comixRoot,
    });
  } catch (err) {
    mapSafeTargetError(err);
  }
}

export async function listComix(ctx, input = {}) {
  const slugs = input.comix === undefined ? listComixIds(ctx.comixRoot) : [comixOf(ctx, input.comix).slug];
  return {
    comixes: slugs.map((slug) => {
      const c = readComix(slug, ctx.comixRoot);
      return {
        comix: slug,
        id: c.manifest.id,
        title: c.manifest.title,
        pages: c.pages.map((p) => ({ id: p.spec.id, index: p.spec.index, title: p.spec.title, from: p.spec.from, until: p.spec.until, path: p.path })),
      };
    }),
  };
}

export async function getComix(ctx, input) {
  const c = comixOf(ctx, input.comix);
  if (input.path === undefined) {
    return {
      comix: c.slug,
      manifestPath: 'comix.manifest.json',
      manifestEtag: c.etags['comix.manifest.json'],
      manifest: c.manifest,
      pages: c.pages.map((p) => ({ id: p.spec.id, index: p.spec.index, path: p.path, etag: c.etags[p.path], spec: p.spec })),
    };
  }
  if (typeof input.path !== 'string' || !input.path) throw new ForgeError('invalid_input', 'path must be comix.manifest.json or pages/<id>/page.spec.json');
  const file = resolveComixTarget(ctx, c.slug, input.path);
  const text = readFileSync(file, 'utf8');
  return { comix: c.slug, path: input.path, etag: etagOf(text), json: JSON.parse(text) };
}

async function checkComixDraft(ctx, c, relPath, json) {
  const { checkComixPack, runComixSim } = await ctx.load('/src/comix-editor/check.ts');
  const before = new Set(checkComixPack(packWithComixDraft(c)).filter((i) => i.severity === 'error').map((i) => `${i.where}|${i.message}`));
  const draftPack = relPath ? packWithComixDraft(c, relPath, json) : packWithComixDraft(c);
  const issues = checkComixPack(draftPack);
  const errors = issues.filter((i) => i.severity === 'error');
  const targetWhere = !relPath ? null : relPath === 'comix.manifest.json' ? 'comix' : c.pages.find((p) => p.path === relPath)?.spec.id ?? json?.id ?? null;
  const blocking = relPath
    ? errors.filter((i) => i.where === targetWhere || !before.has(`${i.where}|${i.message}`))
    : errors;
  const sim = runComixSim(draftPack);
  return { issues, errors, blocking, sim };
}

export async function validateComix(ctx, input) {
  const c = comixOf(ctx, input.comix);
  const hasDraft = input.path !== undefined || input.json !== undefined;
  if (hasDraft && (typeof input.path !== 'string' || input.json === undefined)) {
    throw new ForgeError('invalid_input', 'provide both path and json, or omit both to validate the comix on disk');
  }
  if (hasDraft && !COMIX_FILE_RE.test(input.path)) {
    throw new ForgeError('invalid_input', `unsupported comix path "${input.path}"`);
  }
  const draftJson = hasDraft ? objOf(input.json, 'json') : undefined;
  const { issues, errors, blocking, sim } = await checkComixDraft(ctx, c, input.path, draftJson);
  return {
    ok: blocking.length === 0 && sim.ok,
    comix: c.slug,
    errors: errors.length,
    blocking: blocking.length,
    warnings: issues.length - errors.length,
    issues: issues.slice(0, MAX_ISSUES).map(brief),
    truncated: issues.length > MAX_ISSUES,
    sim: {
      ok: sim.ok,
      durationSec: sim.durationSec,
      frames: sim.frames,
      cuts: sim.panelCuts.length,
      snapshots: sim.snapshots.length,
      turnsCompleted: sim.turnsCompleted,
      beatsFired: sim.beatsFired,
      activeTracksPeak: sim.activeTracksPeak,
      errors: sim.errors,
    },
  };
}

export async function writeComix(ctx, input) {
  const c = comixOf(ctx, input.comix);
  if (typeof input.path !== 'string' || !input.path) throw new ForgeError('invalid_input', 'path must be comix.manifest.json or pages/<id>/page.spec.json');
  const file = resolveComixTarget(ctx, c.slug, input.path);
  const json = objOf(input.json, 'json');
  if (input.path === 'comix.manifest.json' && json.id !== c.manifest.id) {
    throw new ForgeError('refused', `manifest.id "${json.id}" differs from "${c.manifest.id}"; renaming a comix is not allowed`);
  }
  const pageEntry = c.pages.find((p) => p.path === input.path);
  if (pageEntry && json.id !== pageEntry.spec.id) {
    throw new ForgeError('refused', `page.id "${json.id}" differs from "${pageEntry.spec.id}"; renaming a page requires updating comix.manifest.json and pages/<id>/page.spec.json on disk and compiling via generate-comix.mjs`);
  }
  if (typeof input.baseEtag !== 'string' || !input.baseEtag) {
    throw new ForgeError('invalid_input', 'baseEtag is required: send the etag get_comix returned');
  }
  const original = readFileSync(file, 'utf8');
  if (etagOf(original) !== input.baseEtag) {
    throw new ForgeError('conflict', `${input.path} changed on disk after you read it; call get_comix again`);
  }

  const { blocking, sim } = await checkComixDraft(ctx, c, input.path, json);
  if (blocking.length || !sim.ok) {
    throw new ForgeError('refused', `comix validation/sim failed: ${blocking.length} error(s), ${sim.errors.length} sim error(s); nothing was written`, {
      issues: blocking.slice(0, MAX_ISSUES).map(brief),
      simErrors: sim.errors,
    });
  }

  const text = stringifyComixJson(json);
  writeAtomicText(file, text);
  try {
    const regenerated = writeComixCatalog(compileAllComix(ctx.comixRoot).ts, ctx.comixCatalog);
    ctx.invalidate();
    return {
      ok: true,
      comix: c.slug,
      path: input.path,
      changed: text !== original,
      regenerated,
      etag: etagOf(text),
      sim: { durationSec: sim.durationSec, frames: sim.frames, beatsFired: sim.beatsFired, turnsCompleted: sim.turnsCompleted },
    };
  } catch (err) {
    writeAtomicText(file, original);
    throw new ForgeError('refused', `the comix catalog did not recompile (${err.message}); the file was restored and nothing changed`);
  }
}
