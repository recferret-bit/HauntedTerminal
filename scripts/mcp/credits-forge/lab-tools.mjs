// Terminal Lab tools for credits-forge.
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { etagOf, writeAtomicText } from '../../harness/lib/editor-api-common.mjs';
import { stringifyLabJson } from '../../harness/lib/lab-json.mjs';
import { SOAK_TICKS } from '../../harness/lib/lab-run.mjs';
import { displayLabDir, displayLabPath, LAB_FILE_RE, listLabFiles, MAX_LAB_FILES, readLabs } from '../../harness/lib/terminal-lab-api.mjs';
import { brief, ForgeError, MAX_ISSUES, MAX_SPEC_CHARS } from './shared.mjs';

const LAB_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const HURT_EVENTS = new Set(['PLAYER_DAMAGED', 'PLAYER_RESPAWNED']);

function labIdOf(raw) {
  if (typeof raw !== 'string' || !raw) throw new ForgeError('invalid_input', 'id must be a lowercase lab id');
  const trimmed = raw.endsWith('.lab.json') ? raw.slice(0, -'.lab.json'.length) : raw;
  if (!LAB_ID_RE.test(trimmed)) {
    throw new ForgeError('invalid_input', `lab id "${raw}" must match ${LAB_ID_RE}`);
  }
  return trimmed;
}

function labTarget(labsRoot, id) {
  const file = `${id}.lab.json`;
  if (!LAB_FILE_RE.test(file)) throw new ForgeError('invalid_input', `invalid lab file name "${file}"`);
  const target = resolve(labsRoot, file);
  const base = resolve(labsRoot);
  if (!target.startsWith(`${base}${sep}`)) throw new ForgeError('invalid_input', 'lab path escapes labs folder');
  return { file, target };
}

function labObjectOf(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ForgeError('invalid_input', 'script must be a Terminal Lab JSON object');
  }
  if (JSON.stringify(value).length > MAX_SPEC_CHARS) {
    throw new ForgeError('invalid_input', `script is larger than ${MAX_SPEC_CHARS} characters`);
  }
  return value;
}

async function loadLabTextFromInput(ctx, input) {
  if (input.script !== undefined) {
    const obj = labObjectOf(input.script);
    return { id: typeof obj.id === 'string' ? obj.id : '(draft)', text: JSON.stringify(obj) };
  }
  const id = labIdOf(input.id);
  const { file, target } = labTarget(ctx.labsRoot, id);
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw new ForgeError('not_found', `unknown lab "${file}"; list_labs shows the committed labs`);
  }
  return { id, text: readFileSync(target, 'utf8') };
}

export async function listLabs(ctx) {
  const labs = readLabs(ctx.labsRoot);
  return {
    dir: displayLabDir(ctx.labsRoot),
    labs: labs.map((l) => ({
      id: l.id,
      file: l.file,
      title: l.json?.title ?? null,
      driver: l.json?.driver ?? 'chapter',
      setupCount: Array.isArray(l.json?.setup) ? l.json.setup.length : 0,
      stepCount: Array.isArray(l.json?.steps) ? l.json.steps.length : 0,
      etag: l.etag,
      ...(l.problem ? { problem: l.problem } : {}),
    })),
  };
}

export async function getLab(ctx, input) {
  const id = labIdOf(input.id);
  const { file, target } = labTarget(ctx.labsRoot, id);
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw new ForgeError('not_found', `unknown lab "${file}"; list_labs shows the committed labs`);
  }
  const text = readFileSync(target, 'utf8');
  return { id, file, path: displayLabPath(ctx.labsRoot, file), etag: etagOf(text), script: JSON.parse(text) };
}

export async function validateLabTool(ctx, input) {
  if (input.id === undefined && input.script === undefined) {
    throw new ForgeError('invalid_input', 'provide id or script to validate_lab');
  }
  const { id, text } = await loadLabTextFromInput(ctx, input);
  const store = await ctx.load('/src/terminal-lab/store.ts');
  const check = await ctx.load('/src/terminal-lab/lab-check.ts');
  const { script, problems } = store.parseLabText(text);
  if (!script) {
    return {
      ok: false,
      id,
      errors: problems.length,
      warnings: 0,
      issues: problems.slice(0, MAX_ISSUES).map((message) => ({ severity: 'error', where: 'lab', message })),
      truncated: problems.length > MAX_ISSUES,
    };
  }
  const issues = check.checkLab(script);
  const errors = issues.filter((i) => i.severity === 'error');
  return {
    ok: errors.length === 0,
    id: script.id,
    errors: errors.length,
    warnings: issues.length - errors.length,
    issues: issues.slice(0, MAX_ISSUES).map(brief),
    truncated: issues.length > MAX_ISSUES,
  };
}

export async function runLab(ctx, input) {
  if (input.id === undefined && input.script === undefined) {
    throw new ForgeError('invalid_input', 'provide id or script to run_lab');
  }
  const { id, text } = await loadLabTextFromInput(ctx, input);
  const store = await ctx.load('/src/terminal-lab/store.ts');
  const check = await ctx.load('/src/terminal-lab/lab-check.ts');
  const driverMod = await ctx.load('/src/terminal-lab/node-driver.ts');
  const runner = await ctx.load('/src/terminal-lab/runner.ts');

  const { script, problems } = store.parseLabText(text);
  if (!script) {
    return { ok: false, id, reason: 'invalid', problems, issues: [], results: [], hurt: null, absorbed: 0 };
  }
  const issues = check.checkLab(script);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    return { ok: false, id: script.id, reason: 'check_failed', problems: [], issues: errors.slice(0, MAX_ISSUES).map(brief), results: [], hurt: null, absorbed: 0 };
  }

  const driver = driverMod.createNodeDriver(script);
  const { results, reason } = await runner.runSteps(driver, script.steps, { stopOnFail: false });
  const hurtStep = results.find((r) => r.eventTypes.some((t) => HURT_EVENTS.has(t)));
  let hurt = hurtStep ? `step ${hurtStep.index + 1}` : null;
  for (let i = 0; i < SOAK_TICKS && !hurt; i++) {
    if ((await driver.tick()).events.some((e) => HURT_EVENTS.has(e.type))) hurt = `soak tick ${i + 1}`;
  }
  const after = await driver.inspect();
  if (!hurt && after.hp !== after.maxHp) hurt = `HP ${after.hp}/${after.maxHp}`;
  const failed = results.filter((s) => !s.ok);
  const ok = failed.length === 0 && !hurt && reason === 'end';
  return {
    ok,
    id: script.id,
    reason,
    steps: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    soakTicks: SOAK_TICKS,
    hurt,
    absorbed: after.absorbedTotal,
    results: results.map((r) => ({ index: r.index, op: r.op, label: r.label, ok: r.ok, failures: r.failures })),
    transcript: runner.transcriptOf(results),
  };
}

export async function writeLab(ctx, input) {
  const id = labIdOf(input.id);
  const rawScript = labObjectOf(input.script);
  if (rawScript.id !== id) {
    throw new ForgeError('refused', `script.id "${rawScript.id}" differs from id "${id}"`);
  }
  if (input.baseEtag !== undefined && typeof input.baseEtag !== 'string') {
    throw new ForgeError('invalid_input', 'baseEtag must be a string when updating an existing lab');
  }

  const { file, target } = labTarget(ctx.labsRoot, id);
  const exists = existsSync(target);
  let original = null;
  if (exists) {
    if (!statSync(target).isFile()) throw new ForgeError('refused', `${file} is not a file`);
    original = readFileSync(target, 'utf8');
    if (input.baseEtag === undefined) throw new ForgeError('conflict', `${file} already exists; call get_lab first and send baseEtag`);
    if (input.baseEtag !== etagOf(original)) throw new ForgeError('conflict', `${file} changed on disk after you read it; call get_lab again`);
  } else {
    if (input.baseEtag !== undefined) throw new ForgeError('conflict', `${file} does not exist on disk; omit baseEtag to create a new lab`);
    if (listLabFiles(ctx.labsRoot).length >= MAX_LAB_FILES) throw new ForgeError('refused', `the labs folder is full (${MAX_LAB_FILES} files)`);
  }

  const checked = await validateLabTool(ctx, { script: rawScript });
  if (!checked.ok) {
    throw new ForgeError('refused', `lab validation failed: ${checked.errors} error(s); nothing was written`, { issues: checked.issues });
  }
  const run = await runLab(ctx, { script: rawScript });
  if (!run.ok) {
    throw new ForgeError('refused', `lab run failed (failed=${run.failed}, hurt=${run.hurt ?? 'none'}, reason=${run.reason}); nothing was written`, { run });
  }

  mkdirSync(resolve(ctx.labsRoot), { recursive: true });
  const text = stringifyLabJson(rawScript);
  writeAtomicText(target, text);
  return {
    ok: true,
    created: !exists,
    id,
    file,
    path: displayLabPath(ctx.labsRoot, file),
    changed: text !== original,
    etag: etagOf(text),
    steps: run.steps,
    absorbed: run.absorbed,
  };
}
