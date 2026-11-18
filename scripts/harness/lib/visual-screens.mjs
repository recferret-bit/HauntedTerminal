// The screen list of the visual audit (spec .kiro/specs/qa-visual-audit/, Req 2): scripts/harness/visual/screens.json plus
// one entry per level of the chapter, read from its manifest. No chapter or level is named in code: `{chapter}`,
// `{level:N}` and `{ "solution": { "level": N, "count": K } }` resolve against the chapter on disk.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

/** The chapter to audit: `--chapter <slug>`, else the only (or first) folder of chapters/ with a manifest. */
export function loadChapter(root, slug) {
  const dir = join(root, 'chapters');
  const slugs = readdirSync(dir).filter((d) => existsSync(join(dir, d, 'chapter.manifest.json')));
  const id = slug ?? slugs.sort()[0];
  if (!slugs.includes(id)) throw new Error(`no chapter ${id} in chapters/ (have: ${slugs.join(', ')})`);
  const manifest = readJson(join(dir, id, 'chapter.manifest.json'));
  const levels = manifest.levels.map((l) => ({ ...l, spec: readJson(join(dir, id, l.specPath)) }));
  return { id, manifest, levels };
}

function levelByIndex(chapter, n) {
  const l = chapter.levels.find((x) => x.index === Number(n));
  if (!l) throw new Error(`the chapter has no level with index ${n}`);
  return l;
}

const fill = (text, chapter) => text.replace('{chapter}', chapter.id).replace(/\{level:(\d+)\}/g, (_, n) => levelByIndex(chapter, n).id);

function expandSteps(steps, chapter) {
  return (steps ?? []).flatMap((s) => {
    if (!s || typeof s !== 'object' || !('solution' in s)) return [s];
    const cmds = levelByIndex(chapter, s.solution.level).spec.solutionCommands ?? [];
    return cmds.slice(0, s.solution.count ?? cmds.length);
  });
}

/** Every screen, resolved: the level screens first (`level-NN`, first screen after the title card), then the listed ones. */
export function expandScreens(doc, chapter) {
  const levelScreens = !doc.levels ? [] : chapter.levels.map((l) => ({
    ...doc.levels,
    id: `level-${String(l.index).padStart(2, '0')}`,
    url: `/play/${chapter.id}/${l.id}?nointro=1`,
    title: l.title,
  }));
  const listed = doc.screens.map((s) => ({ ...s, url: fill(s.url, chapter), steps: expandSteps(s.steps, chapter) }));
  return [...levelScreens, ...listed];
}

/** Narrow by `--screens a,b` (ids; a trailing `*` matches a prefix, e.g. `level-*`) and `--sizes WxH,...`. */
export function selectScreens(screens, pick) {
  if (!pick) return screens;
  const want = pick.split(',').map((s) => s.trim()).filter(Boolean);
  const hit = (id) => want.some((w) => (w.endsWith('*') ? id.startsWith(w.slice(0, -1)) : id === w));
  const out = screens.filter((s) => hit(s.id));
  const unknown = want.filter((w) => !screens.some((s) => (w.endsWith('*') ? s.id.startsWith(w.slice(0, -1)) : s.id === w)));
  if (unknown.length) throw new Error(`unknown screen ids: ${unknown.join(', ')} (have: ${screens.map((s) => s.id).join(', ')})`);
  return out;
}

export function selectSizes(doc, pick) {
  const sizes = pick ? pick.split(',').map((s) => s.trim()) : doc.sizes;
  const bad = sizes.filter((s) => !/^\d+x\d+$/.test(s));
  if (bad.length) throw new Error(`bad sizes: ${bad.join(', ')} (want WxH)`);
  return sizes;
}

/** `--update hub@1600x950,level-01` -> a matcher on (screen id, size); a bare id updates every size. */
export function updateMatcher(spec) {
  if (!spec) return () => false;
  const items = spec.split(',').map((s) => s.trim().split('@'));
  return (id, size) => items.some(([i, sz]) => i === id && (!sz || sz === size));
}
