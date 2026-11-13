import { isRec } from '../chapter-editor/dom.js';

const NUMBER = /^-?\d+(?:\.\d+)?$/;
const NAMED = /^([A-Za-z_][\w]*)([+-]\d+(?:\.\d+)?)?$/;

/** `null` when `expr` is `NAME`, `NAME+n`, `NAME-n`, or a numeric string whose name is in `marks`. */
export function markProblem(expr: string, marks: Record<string, number>): string | null {
  const text = expr.trim();
  if (NUMBER.test(text)) return null;
  const found = NAMED.exec(text);
  if (!found) return `"${expr}" is not a mark expression`;
  if (!Object.prototype.hasOwnProperty.call(marks, found[1])) return `unknown mark "${found[1]}"`;
  return null;
}

/** Mark names whose value is a number. Non-numbers are left for the schema check. */
export function markTable(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isRec(value)) return out;
  for (const [key, item] of Object.entries(value)) if (typeof item === 'number') out[key] = item;
  return out;
}
