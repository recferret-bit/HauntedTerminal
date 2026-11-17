// Generators shared by the property suites. Spec: .kiro/specs/property-based-tests/.
import fc from 'fast-check';

/** A plain file name the shell accepts unquoted: lower-case letters, digits, `_` and `-`, optionally with an extension. */
export const fileName = fc
  .tuple(fc.stringMatching(/^[a-z][a-z0-9_-]{0,7}$/), fc.constantFrom('', '.txt', '.log', '.conf', '.js'))
  .map(([base, ext]) => `${base}${ext}`);

/** Two different file names. */
export const twoNames = fc.uniqueArray(fileName, { minLength: 2, maxLength: 2 }).map(([a, b]) => [a, b]);

/** File content the terminal prints back as-is: printable ASCII lines, no control characters, ending with a newline. */
export const fileContent = fc
  .array(fc.stringMatching(/^[ -~]{0,30}$/), { minLength: 1, maxLength: 4 })
  .map((lines) => `${lines.join('\n')}\n`);

/** A three-digit octal mode with the owner read bit set, so the file stays readable. */
export const readableMode = fc
  .tuple(fc.integer({ min: 4, max: 7 }), fc.integer({ min: 0, max: 7 }), fc.integer({ min: 0, max: 7 }))
  .map(([u, g, o]) => `${u}${g}${o}`);

/** Shell-shaped words: names, flags, quotes, globs, pipes, redirects, `&&`, `;`, `$VAR`, backslashes. */
const shellToken = fc.oneof(
  fileName,
  fc.constantFrom('ls', 'cat', 'cd', 'rm', 'mv', 'cp', 'chmod', 'grep', 'sed', 'echo', 'ps', 'kill', 'touch', 'mkdir', 'wc', 'head', 'find', 'kiro', 'hold', 'inv', 'help', 'man', 'source', 'docker', 'exit'),
  fc.constantFrom('-a', '-la', '-l', '-9', '-STOP', '-x', '+x', '-w', '755', '000', '644', '-i', '-r', '-f', '-n'),
  fc.constantFrom('|', '>', '>>', '<', '&&', '||', ';', '*', '?', '..', '.', '~', '/', '/dev/null', '$HOME', '$?', '\\', '"', "'", '`', '(', ')', '{', '}', '#'),
  fc.stringMatching(/^"[a-z ./*]{0,8}"$/),
  fc.stringMatching(/^'s\/[a-z]{0,4}\/[a-z]{0,4}\/g?'$/),
);

/** A random command line: either grammar-shaped tokens or any string at all. */
export const shellLine = fc.oneof(
  { weight: 3, arbitrary: fc.array(shellToken, { minLength: 1, maxLength: 8 }).map((t) => t.join(' ')) },
  { weight: 1, arbitrary: fc.string({ maxLength: 60 }) },
  { weight: 1, arbitrary: fc.string({ unit: 'binary', maxLength: 40 }) },
);

/** Any JSON value (no `undefined`, no `-0`), as `JSON.parse` could return it. */
export const jsonValue = fc.jsonValue({ maxDepth: 4, noUnicodeString: false }).map((v) => JSON.parse(JSON.stringify(v)));

/** Every `[parent, key]` slot inside a JSON value (object keys and array indices), in a stable order. */
function slots(value, out = []) {
  if (value && typeof value === 'object') {
    for (const key of Array.isArray(value) ? value.keys() : Object.keys(value)) {
      out.push([value, key]);
      slots(value[key], out);
    }
  }
  return out;
}

/** The ways a hand edit or a bad merge can break a spec: drop a field, null it, change its type, empty a list, repeat an item. */
const CORRUPTIONS = ['delete', 'null', 'junk', 'empty', 'duplicate', 'negate'];

/**
 * A list of corruptions to apply to a JSON document. Apply them with `corrupt(doc, ops)` to a deep copy; the same ops on
 * the same document always give the same result, so a failure replays.
 * An op picks its slot with `at` (an index into the document's slots, so it moves when the document changes: fine for random
 * search) or with `path` (an explicit key path such as `['boss', 'name']`: use it for regression examples).
 * Limits: one document at a time; it cannot corrupt the root, rename keys or swap fields, and its junk is JSON-safe
 * (no NaN, no 1e308, short strings). `duplicate` works inside arrays, `negate` on numbers.
 */
export const corruptions = fc.array(fc.record({ at: fc.nat(), how: fc.constantFrom(...CORRUPTIONS), junk: jsonValue }), { minLength: 1, maxLength: 5 });

export function corrupt(doc, ops) {
  const copy = structuredClone(doc);
  for (const op of ops) {
    const all = slots(copy);
    if (!all.length) break;
    let [parent, key] = all[(op.at ?? 0) % all.length];
    if (op.path) {
      parent = op.path.slice(0, -1).reduce((node, k) => node?.[k], copy);
      key = op.path.at(-1);
      if (!parent || typeof parent !== 'object' || !(key in parent)) continue;
    }
    const v = parent[key];
    if (op.how === 'delete') Array.isArray(parent) ? parent.splice(key, 1) : delete parent[key];
    else if (op.how === 'null') parent[key] = null;
    else if (op.how === 'junk') parent[key] = op.junk;
    else if (op.how === 'empty') parent[key] = Array.isArray(v) ? [] : v && typeof v === 'object' ? {} : '';
    else if (op.how === 'duplicate' && Array.isArray(parent)) parent.splice(key, 0, structuredClone(v));
    else if (op.how === 'negate' && typeof v === 'number') parent[key] = -v - 1;
  }
  return copy;
}

/** Every file under `dir` whose name ends with `suffix`, as paths relative to `dir`. */
export function filesUnder(dir, suffix, readdirSync, join) {
  const out = [];
  const walk = (rel) => {
    for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory() && e.name !== 'out') walk(r);
      else if (e.isFile() && r.endsWith(suffix)) out.push(r);
    }
  };
  walk('');
  return out.sort();
}
