import type { PackIssue } from '../chapters/validate-pack.js';
import type { ChapterPack } from '../chapters/types.js';
import { isRec, type Rec } from './dom.js';
import { COMIX_PAGE, DIALOG_CAST, DIALOG_ENTRY, ENTITIES, FILES, MANIFEST, OVERVIEW, RULES, SCRIPT, type ArrayItem, type Field } from './schema.js';

/**
 * The field tables are the schema of the spec files. This walks a file against them and reports what no other check
 * sees: a misspelled key (the game would silently ignore it), a missing required field, a value of the wrong type,
 * or an option that is not in the list.
 */
class SchemaWalk {
  readonly issues: PackIssue[] = [];

  constructor(private readonly where: string, private readonly tab: string) {}

  private add(severity: PackIssue['severity'], path: string, message: string): void {
    this.issues.push({ severity, where: this.where, tab: this.tab, message: `${path}: ${message}` });
  }

  /** `extra` keys are legal but not editable (ids, indices). */
  object(value: unknown, fields: Field[], path: string, extra: readonly string[] = []): void {
    if (!isRec(value)) {
      this.add('error', path, 'expected an object');
      return;
    }
    const known = new Set([...fields.map((f) => f.key), ...extra]);
    for (const key of Object.keys(value)) if (!known.has(key)) this.add('warn', `${path}.${key}`, 'unknown field (typo? the game ignores it)');
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
        if (typeof v !== 'number') this.add('error', path, 'expected a number');
        break;
      case 'bool':
        if (typeof v !== 'boolean') this.add('error', path, 'expected true or false');
        break;
      case 'select':
        if (!f.options.includes(v as string | number)) this.add('error', path, `"${String(v)}" is not one of ${f.options.join(', ')}`);
        break;
      case 'strings':
        if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) this.add('error', path, 'expected a list of strings');
        break;
      case 'numbers':
        if (!Array.isArray(v) || v.some((x) => typeof x !== 'number')) this.add('error', path, 'expected a list of numbers');
        break;
      case 'pairs':
        if (!Array.isArray(v) || v.some((p) => !Array.isArray(p) || p.length !== 2 || p.some((x) => typeof x !== 'string'))) this.add('error', path, 'expected a list of [string, string]');
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
    if (!isRec(v) || typeof v.x !== 'number' || typeof v.y !== 'number' || typeof v.z !== 'number') {
      this.add('error', path, 'expected a point name or {x, y, z}');
      return;
    }
    for (const key of Object.keys(v)) if (!['x', 'y', 'z'].includes(key)) this.add('warn', `${path}.${key}`, 'unknown field (typo? the game ignores it)');
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
        if (!Array.isArray(item) || item.some((x) => typeof x !== 'string')) this.add('error', `${path}.${key}`, 'expected a list of strings');
      } else if (f.value === 'number') {
        if (typeof item !== 'number') this.add('error', `${path}.${key}`, 'expected a number');
      } else {
        this.object(item, f.value, `${path}.${key}`);
      }
    }
  }
}

const LEVEL_FIELDS: Field[] = [...OVERVIEW, ...FILES, ...ENTITIES, ...RULES, { type: 'object', key: 'script', label: '', optional: true, fields: SCRIPT }];

/** Checks every spec file of the pack against the field tables. */
export function schemaIssues(pack: ChapterPack): PackIssue[] {
  const out: PackIssue[] = [];
  const manifest = new SchemaWalk('chapter', 'manifest');
  manifest.object(pack.manifest, MANIFEST, 'manifest', ['id', 'issueNumber', 'levels', 'comix']);
  out.push(...manifest.issues);
  for (const level of pack.levels) {
    const walk = new SchemaWalk(level.id, 'overview');
    walk.object(level, LEVEL_FIELDS, 'level', ['id', 'index']);
    out.push(...walk.issues.map((i) => ({ ...i, tab: tabOf(i.message) })));
  }
  if (pack.dialogs) {
    const walk = new SchemaWalk('dialogs', 'cast');
    walk.object({ cast: pack.dialogs.cast }, DIALOG_CAST, 'dialogs');
    for (const [id, entry] of Object.entries(pack.dialogs.levels)) {
      const entryWalk = new SchemaWalk(pack.levels.some((l) => l.id === id) ? id : 'dialogs', 'dialogs');
      entryWalk.object(entry as unknown as Rec, DIALOG_ENTRY, `dialogs.levels.${id}`);
      out.push(...entryWalk.issues);
    }
    out.push(...walk.issues);
  }
  if (pack.comix) {
    for (const page of pack.comix.pages) {
      const walk = new SchemaWalk('comix', 'comic');
      walk.object(page, COMIX_PAGE, `comic.page${page.pageNumber}`);
      out.push(...walk.issues);
    }
  }
  return out;
}

/** Sends a level issue to the tab that holds the field. */
function tabOf(message: string): string {
  const key = /^level\.(\w+)/.exec(message)?.[1] ?? '';
  if (key === 'script') return 'script';
  if (key === 'files') return 'files';
  if (['enemies', 'pickups', 'patches'].includes(key)) return 'entities';
  if (['winRules', 'solutionCommands'].includes(key)) return 'rules';
  return 'overview';
}

export interface ShapeIssue {
  severity: 'error' | 'warn';
  message: string;
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
