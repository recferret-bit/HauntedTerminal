import { isRec } from './dom.js';
import type { ArrayItem, Field } from './schema.js';

export interface WalkIssue {
  severity: 'error' | 'warn';
  where: string;
  tab: string;
  message: string;
}

export interface ShapeIssue {
  severity: 'error' | 'warn';
  message: string;
}

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Walks any declarative spec object or array against its `Field[]` schema tables and reports unknown keys
 * (silently ignored typos), missing required fields, wrong primitive types, and out-of-range options.
 */
export class SchemaWalk {
  readonly issues: WalkIssue[] = [];

  constructor(private readonly where: string, private readonly tab: string) {}

  private add(severity: WalkIssue['severity'], path: string, message: string): void {
    this.issues.push({ severity, where: this.where, tab: this.tab, message: `${path}: ${message}` });
  }

  /** `extra` keys are legal but not editable (ids, indices). */
  object(value: unknown, fields: Field[], path: string, extra: readonly string[] = []): void {
    if (!isRec(value)) {
      this.add('error', path, 'expected an object');
      return;
    }
    const known = new Set([...fields.map((f) => f.key), ...extra]);
    for (const key of Object.keys(value)) {
      if (!known.has(key)) this.add('warn', `${path}.${key}`, 'unknown field (typo? the game ignores it)');
    }
    for (const f of fields) {
      const v = value[f.key];
      if (v === undefined || (v === null && f.optional)) {
        if (v === undefined && !f.optional) this.add('error', `${path}.${f.key}`, 'required field is missing');
        continue;
      }
      this.field(v, f, `${path}.${f.key}`);
    }
  }

  private variant(value: unknown, variants: Record<string, Field[]>, path: string, tag = 'kind'): void {
    const kind = isRec(value) ? value[tag] : undefined;
    if (!isRec(value) || typeof kind !== 'string') {
      this.add('error', path, `expected an object with a "${tag}"`);
      return;
    }
    const fields = variants[kind];
    if (!fields) {
      this.add('error', `${path}.${tag}`, `unknown ${tag} "${kind}" (${Object.keys(variants).join(', ')})`);
      return;
    }
    this.object(value, fields, path, [tag]);
  }

  private field(v: unknown, f: Field, path: string): void {
    switch (f.type) {
      case 'text':
      case 'color':
        if (typeof v !== 'string') this.add('error', path, 'expected a string');
        break;
      case 'number':
        if (!isFiniteNum(v)) this.add('error', path, 'expected a finite number');
        break;
      case 'bool':
        if (typeof v !== 'boolean') this.add('error', path, 'expected true or false');
        break;
      case 'select':
        if (!f.options.includes(v as string | number)) {
          this.add('error', path, `"${String(v)}" is not one of ${f.options.join(', ')}`);
        }
        break;
      case 'strings':
        if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) this.add('error', path, 'expected a list of strings');
        break;
      case 'numbers':
        if (!Array.isArray(v) || v.some((x) => !isFiniteNum(x))) this.add('error', path, 'expected a list of finite numbers');
        break;
      case 'pairs':
        if (!Array.isArray(v) || v.some((p) => !Array.isArray(p) || p.length !== 2 || p.some((x) => typeof x !== 'string'))) {
          this.add('error', path, 'expected a list of [string, string]');
        }
        break;
      case 'textOrVec':
        this.textOrVec(v, path);
        break;
      case 'array':
        this.list(v, f, path);
        break;
      case 'object':
        this.object(v, f.fields, path);
        break;
      case 'record':
        this.record(v, f, path);
        break;
      case 'union':
        this.variant(v, f.union(), path, f.tag ?? 'kind');
        break;
    }
  }

  private textOrVec(v: unknown, path: string): void {
    if (typeof v === 'string') return;
    if (!isRec(v) || !isFiniteNum(v.x) || !isFiniteNum(v.y) || !isFiniteNum(v.z)) {
      this.add('error', path, 'expected a point name or {x, y, z}');
      return;
    }
    for (const key of Object.keys(v)) {
      if (!['x', 'y', 'z'].includes(key)) this.add('warn', `${path}.${key}`, 'unknown field (typo? the game ignores it)');
    }
  }

  private list(v: unknown, f: Extract<Field, { type: 'array' }>, path: string): void {
    if (!Array.isArray(v)) {
      this.add('error', path, 'expected a list');
      return;
    }
    v.forEach((item, i) => {
      if (f.item.union) this.variant(item, f.item.union(), `${path}[${i}]`, f.item.tag ?? 'kind');
      else this.object(item, f.item.fields ?? [], `${path}[${i}]`);
    });
  }

  /** A root list (letters, beats, camera): same rules as an array field. */
  items(value: unknown, item: ArrayItem, path: string): void {
    this.list(value, { type: 'array', key: 'items', label: '', item }, path);
  }

  private record(v: unknown, f: Extract<Field, { type: 'record' }>, path: string): void {
    if (!isRec(v)) {
      this.add('error', path, 'expected a map');
      return;
    }
    for (const [key, item] of Object.entries(v)) {
      if (f.value === 'string') {
        if (typeof item !== 'string') this.add('error', `${path}.${key}`, 'expected a string');
      } else if (f.value === 'strings') {
        if (!Array.isArray(item) || item.some((x) => typeof x !== 'string')) {
          this.add('error', `${path}.${key}`, 'expected a list of strings');
        }
      } else if (f.value === 'number') {
        if (!isFiniteNum(item)) this.add('error', `${path}.${key}`, 'expected a finite number');
      } else {
        this.object(item, f.value, `${path}.${key}`);
      }
    }
  }
}

function taken(walk: SchemaWalk): ShapeIssue[] {
  return walk.issues.map((i) => ({ severity: i.severity, message: i.message }));
}

/** Unknown keys, missing fields, wrong types. `extra` keys are legal but not in the table. */
export function objectShape(value: unknown, fields: Field[], path: string, extra: readonly string[] = []): ShapeIssue[] {
  const walk = new SchemaWalk(path, 'check');
  walk.object(value, fields, path, extra);
  return taken(walk);
}

/** A JSON array at the root of a file. */
export function listShape(value: unknown, item: ArrayItem, path: string): ShapeIssue[] {
  const walk = new SchemaWalk(path, 'check');
  walk.items(value, item, path);
  return taken(walk);
}
