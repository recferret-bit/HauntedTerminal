/**
 * Mark expressions shared by every comix file except `marks.json`:
 * `STRIKE`, `STRIKE+0.35`, `WHITE-0.1`, or a bare number `1.5`.
 */

const NUMBER = /^-?(?:\d+\.\d+|\d+)$/;
const NAMED = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SUM = /^([A-Za-z_][A-Za-z0-9_]*)([+-])(\d+(?:\.\d+)?)$/;

function markValue(name: string, marks: Record<string, number>): number {
  if (!Object.prototype.hasOwnProperty.call(marks, name)) throw new Error(`unknown comix mark "${name}"`);
  const value = marks[name];
  if (typeof value !== 'number' || Number.isNaN(value)) throw new Error(`comix mark "${name}" is not a number`);
  return value;
}

/** Resolve one mark expression. Throws on an unknown mark or a string that is not an expression. */
export function resolveMark(expr: string, marks: Record<string, number>): number {
  const text = expr.trim();
  if (NUMBER.test(text)) return Number(text);
  const sum = SUM.exec(text);
  if (sum) {
    const base = markValue(sum[1]!, marks);
    const delta = Number(sum[3]);
    return sum[2] === '-' ? base - delta : base + delta;
  }
  if (NAMED.test(text)) return markValue(text, marks);
  throw new Error(`bad comix mark expression "${expr}"`);
}

/** `#rrggbb` (or `rrggbb`) to a THREE-style hex number. */
export function cssHex(color: string): number {
  const n = Number.parseInt(color.trim().replace(/^#/, ''), 16);
  if (!Number.isFinite(n)) throw new Error(`bad comix colour "${color}"`);
  return n;
}
