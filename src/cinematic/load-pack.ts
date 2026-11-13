import type {
  Beat, CastSpec, ComixManifest, ComixPack, Letter, PageFile, PosesSpec, SetSpec, ShotTrack, SplashSpec,
} from './spec-types.js';

/** Every JSON file under `comix/`, keyed by the path Vite gives the importer. */
const GLOB = import.meta.glob('../../comix/**/*.json', { eager: true, import: 'default' });

const DRAFT_KEY = 'ht-comix-draft';

function unwrap(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    if ('default' in rec && Object.keys(rec).every((key) => key === 'default')) return rec.default;
  }
  return value;
}

/** Path relative to `comix/<id>/`, whether the key is a glob path or already relative. */
export function packRel(id: string, key: string): string {
  const norm = key.replaceAll('\\', '/');
  const marker = `comix/${id}/`;
  const at = norm.lastIndexOf(marker);
  return at >= 0 ? norm.slice(at + marker.length) : norm.replace(/^\.\//, '');
}

function belongs(id: string, key: string): boolean {
  return key.replaceAll('\\', '/').includes(`comix/${id}/`);
}

function indexFiles(id: string, files: Record<string, unknown>): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [key, value] of Object.entries(files)) out.set(packRel(id, key), unwrap(value));
  return out;
}

function need(files: Map<string, unknown>, name: string): unknown {
  if (!files.has(name)) throw new Error(`comix pack is missing ${name}`);
  return files.get(name);
}

function asObject<T>(value: unknown, name: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`comix ${name} must be an object`);
  return value as T;
}

function asArray<T>(value: unknown, name: string): T[] {
  if (!Array.isArray(value)) throw new Error(`comix ${name} must be an array`);
  return value as T[];
}

function readDraft(id: string): Record<string, unknown> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { id?: unknown; files?: unknown };
    if (parsed.id !== id || !parsed.files || typeof parsed.files !== 'object' || Array.isArray(parsed.files)) return {};
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed.files as Record<string, unknown>)) out[packRel(id, key)] = value;
    return out;
  } catch {
    return {};
  }
}

/**
 * Assemble one pack from a file map. Keys are `manifest.json`, `pages/page-01.json`, or glob paths
 * that contain `comix/<id>/`. No dialogue or timings are supplied by the caller.
 */
export function assemblePack(id: string, files: Record<string, unknown>): ComixPack {
  const indexed = indexFiles(id, files);
  const manifest = asObject<ComixManifest>(need(indexed, 'manifest.json'), 'manifest.json');
  const marks = asObject<Record<string, number>>(need(indexed, 'marks.json'), 'marks.json');
  const cast = asObject<CastSpec>(need(indexed, 'cast.json'), 'cast.json');
  const set = asObject<SetSpec>(need(indexed, 'set.json'), 'set.json');
  const letters = asArray<Letter>(need(indexed, 'letters.json'), 'letters.json');
  const beats = asArray<Beat>(need(indexed, 'beats.json'), 'beats.json');
  const camera = asArray<ShotTrack>(need(indexed, 'camera.json'), 'camera.json');
  const poses = asObject<PosesSpec>(need(indexed, 'poses.json'), 'poses.json');
  if (!Array.isArray(cast.actors)) throw new Error('comix cast.json is missing actors');
  if (!poses.programs || !Array.isArray(poses.programs)) throw new Error('comix poses.json is missing programs');
  const pages: PageFile[] = [...indexed.keys()]
    .filter((key) => key.startsWith('pages/') && key.endsWith('.json'))
    .sort()
    .map((key) => asObject<PageFile>(indexed.get(key), key));
  if (!pages.length) throw new Error(`comix pack "${id}" has no pages`);
  for (const page of pages) {
    if (!Array.isArray(page.panels)) throw new Error(`comix page ${page.page} is missing panels`);
  }
  const splash = indexed.has('splash.json') ? asObject<SplashSpec>(indexed.get('splash.json'), 'splash.json') : undefined;
  return { id, manifest, marks, cast, set, pages, letters, beats, camera, poses, splash };
}

/** Load `comix/<id>/`. Pass `draft` so a matching `ht-comix-draft` overrides the glob file by file. */
export function loadComixPack(id: string, draft = false): ComixPack {
  const files: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(GLOB)) {
    if (belongs(id, key)) files[packRel(id, key)] = value;
  }
  if (draft) Object.assign(files, readDraft(id));
  return assemblePack(id, files);
}
