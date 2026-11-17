// Shared reader for Kiro specs (`.kiro/specs/<name>/`): status, open questions, tasks, and which new
// source areas a spec covers. Used by check-specs.mjs (the gate) and by the spec-first hooks in scripts/hooks/.
// Rules: .kiro/steering/spec-first.md, procedure: skill `feature-spec-grill`.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Spec states in order. Code may be written only from `approved` on. */
export const STATUSES = ['draft', 'requirements-approved', 'design-approved', 'approved', 'done'];
export const CODE_ALLOWED = new Set(['approved', 'done']);

const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');

/** Lines of a `## <title>` section (up to the next `## `), or null when the section is missing. */
export function section(text, title) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${title}`.toLowerCase());
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

function findSpecFolders(dir, rel = '') {
  if (!existsSync(dir)) return [];
  const entries = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    const subRel = rel ? `${rel}/${name}` : name;
    if (existsSync(join(full, 'requirements.md')) || existsSync(join(full, 'bugfix.md'))) {
      entries.push({ name: subRel, folder: full });
    }
    entries.push(...findSpecFolders(full, subRel));
  }
  return entries;
}

/** Every spec folder with its parsed status (including nested child specs). */
export function loadSpecs(root) {
  const dir = join(root, '.kiro/specs');
  return findSpecFolders(dir).map(({ name, folder }) => {
    const reqFile = existsSync(join(folder, 'bugfix.md')) ? 'bugfix.md' : 'requirements.md';
    const requirements = read(join(folder, reqFile));
    const design = read(join(folder, 'design.md'));
    const tasks = read(join(folder, 'tasks.md'));
    const statusLine = requirements.split('\n').slice(0, 12).find((l) => /^Status:/i.test(l.trim())) ?? '';
    const status = (statusLine.match(/^Status:\s*`?([a-z-]+)`?/i)?.[1] ?? '').toLowerCase();
    const open = (section(requirements, 'Open questions') ?? []).filter((l) => /^\s*- \[ \]/.test(l));
    return {
      name,
      folder,
      reqFile,
      requirements,
      design,
      tasks,
      status,
      legacy: /legacy/i.test(statusLine),
      open,
      hasDecisions: section(requirements, 'Decisions') !== null,
      openTasks: tasks.split('\n').filter((l) => /^\s*- \[ \]/.test(l)),
      text: [requirements, design, tasks].join('\n'),
    };
  });
}

/** Tracked files (git index). New, untracked areas are what a spec must cover. */
export function trackedFiles(root) {
  try {
    return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * The feature footprint a path would create, or null: a new top-level source area (`src/<area>/`, no file of
 * it tracked yet) or a new HTML entry page (`pages/<name>.html`, not tracked yet). These are what a new
 * feature looks like on disk, so they need an approved spec that names them.
 */
export function footprintOf(path, tracked) {
  const area = path.match(/^src\/([^/]+)\/./)?.[1];
  if (area) {
    const prefix = `src/${area}/`;
    return tracked.some((f) => f.startsWith(prefix)) ? null : prefix;
  }
  if (/^pages\/[^/]+\.html$/.test(path)) return tracked.includes(path) ? null : path;
  return null;
}

/** Specs whose requirements, design or tasks name the footprint. */
export const specsNaming = (specs, footprint) => specs.filter((s) => s.text.includes(footprint));

/** Untracked footprints on disk right now (new areas and pages that are not committed yet). */
export function untrackedFootprints(root) {
  let others = [];
  try {
    others = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
  const tracked = trackedFiles(root);
  return [...new Set(others.map((p) => footprintOf(p, tracked)).filter(Boolean))];
}
