// Canonical JSON text for chapter files. The editor, the migrations and the agents all write through
// this, so a save never reformats a file the author did not change.
//   level.spec.json, chapter.manifest.json : objects expanded, arrays of primitives inline when they fit.
//   story/*.json                            : flat objects (cast, bubbles, cast members) inline as well.
const WIDTH = 100;
const prim = (x) => x === null || typeof x !== 'object';
const flatObj = (x) => x && typeof x === 'object' && !Array.isArray(x) && Object.values(x).every(prim);

function inline(v, objs) {
  if (Array.isArray(v)) {
    if (!v.every((x) => prim(x) || (objs && flatObj(x)))) return null;
    return `[${v.map((x) => (prim(x) ? JSON.stringify(x) : inline(x, objs))).join(', ')}]`;
  }
  if (objs && flatObj(v)) {
    return `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${JSON.stringify(x)}`).join(', ')} }`;
  }
  return null;
}

function write(v, objs, ind, prefix) {
  if (!v || typeof v !== 'object') return JSON.stringify(v);
  const empty = Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0;
  if (empty) return Array.isArray(v) ? '[]' : '{}';
  const one = inline(v, objs);
  if (one !== null && ind.length + prefix + one.length <= WIDTH) return one;
  const pad = `${ind}  `;
  if (Array.isArray(v)) return `[\n${v.map((x) => pad + write(x, objs, pad, 0)).join(',\n')}\n${ind}]`;
  const lines = Object.keys(v).map((k) => {
    const key = `${JSON.stringify(k)}: `;
    return `${pad}${key}${write(v[k], objs, pad, key.length)}`;
  });
  return `{\n${lines.join(',\n')}\n${ind}}`;
}

/** `relPath` (e.g. `story/comix.spec.json`) picks the style. Output ends with a newline. */
export function stringifyChapterJson(value, relPath = '') {
  return `${write(value, /(^|\/)story\//.test(relPath), '', 0)}\n`;
}
