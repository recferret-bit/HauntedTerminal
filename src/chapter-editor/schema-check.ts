import type { ChapterPack } from '../chapters/types.js';
import type { PackIssue } from '../chapters/validate-pack.js';
import type { Rec } from '../editor-core/dom.js';
import { SchemaWalk, listShape, objectShape, type ShapeIssue } from '../editor-core/schema-check.js';
import { COMIX_PAGE, DIALOG_CAST, DIALOG_ENTRY, ENTITIES, FILES, MANIFEST, OVERVIEW, RULES, SCRIPT, type Field } from './schema.js';

export { listShape, objectShape, type ShapeIssue };

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
