import { isRec } from '../../chapter-editor/dom.js';
import type { ComixSource } from '../model.js';

const modules = import.meta.glob('../../../comix/**/*.json', { eager: true });

function payload(mod: unknown): unknown {
  if (isRec(mod) && 'default' in mod) return mod.default;
  return mod;
}

/** Specs compiled into the page, for a build that has no dev API. */
export function bundledComixes(): ComixSource[] {
  const grouped = new Map<string, ComixSource>();
  for (const [key, mod] of Object.entries(modules)) {
    const at = key.lastIndexOf('/comix/');
    const rel = at === -1 ? key : key.slice(at + '/comix/'.length);
    const slash = rel.indexOf('/');
    if (slash === -1) continue;
    const id = rel.slice(0, slash);
    const path = rel.slice(slash + 1);
    const comix = grouped.get(id) ?? { id, title: id, files: [] };
    comix.files.push({ path, json: payload(mod), etag: '' });
    if (path === 'manifest.json') {
      const json = payload(mod);
      if (isRec(json) && typeof json.title === 'string') comix.title = json.title;
    }
    grouped.set(id, comix);
  }
  return [...grouped.values()].sort((a, b) => a.id.localeCompare(b.id));
}
