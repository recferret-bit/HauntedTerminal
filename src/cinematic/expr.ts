import type { PointRef, Vec3 } from './spec-types.js';

/**
 * Time and point expression resolvers shared by the comix compiler, validator, editor, and runtime:
 *   - `"12.5"`               -> 12.5 (absolute seconds)
 *   - `"+0.4"`               -> baseTime + 0.4 (offset from enclosing panel/page `from`)
 *   - `"STRIKE"`             -> cues.STRIKE
 *   - `"STRIKE+0.35"`        -> cues.STRIKE + 0.35
 *   - `"WHITE-0.1"`          -> cues.WHITE - 0.1
 */

const RELATIVE = /^[+-](?:\d+\.\d+|\d+)$/;
const ABSOLUTE = /^(?:\d+\.\d+|\d+)$/;
const NAMED = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SUM = /^([A-Za-z_][A-Za-z0-9_]*)([+-])(\d+(?:\.\d+)?)$/;

function cueValue(name: string, cues: Record<string, number>): number {
  if (!Object.prototype.hasOwnProperty.call(cues, name)) {
    throw new Error(`unknown comix cue "${name}"`);
  }
  const value = cues[name];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`comix cue "${name}" is not a finite number`);
  }
  return value;
}

/** Resolve one timestamp expression against `cues` and optional `baseTime` (for `"+delta"` / `"-delta"` offsets). */
export function resolveTime(expr: string | number, cues: Record<string, number>, baseTime = 0): number {
  if (typeof expr === 'number') {
    if (!Number.isFinite(expr)) throw new Error(`bad comix time "${String(expr)}"`);
    return expr;
  }
  const text = String(expr).trim();
  if (RELATIVE.test(text)) return Number((baseTime + Number(text)).toFixed(6));
  if (ABSOLUTE.test(text)) return Number(text);
  const sum = SUM.exec(text);
  if (sum) {
    const base = cueValue(sum[1]!, cues);
    const delta = Number(sum[3]);
    return Number((sum[2] === '-' ? base - delta : base + delta).toFixed(6));
  }
  if (NAMED.test(text)) return cueValue(text, cues);
  throw new Error(`bad comix time expression "${expr}"`);
}

/** Resolve a named stage point or inline `{ x, y, z }` coordinate, plus an optional offset. */
export function resolvePoint(ref: PointRef, points: Record<string, Vec3>, offset?: Vec3): Vec3 {
  let base: Vec3;
  if (typeof ref === 'string') {
    const found = points[ref];
    if (!found) throw new Error(`unknown comix point "${ref}"`);
    base = found;
  } else if (ref && typeof ref.x === 'number' && typeof ref.y === 'number' && typeof ref.z === 'number') {
    base = ref;
  } else {
    throw new Error(`bad comix point reference "${JSON.stringify(ref)}"`);
  }
  if (!offset) return { x: base.x, y: base.y, z: base.z };
  return { x: base.x + offset.x, y: base.y + offset.y, z: base.z + offset.z };
}

/** `#rrggbb` (or `rrggbb`) to a THREE-style hex number. */
export function cssHex(color: string): number {
  const clean = color.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) throw new Error(`bad comix colour "${color}"`);
  return Number.parseInt(clean, 16);
}
