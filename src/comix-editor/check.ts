import type { ArrayItem, Field } from '../chapter-editor/schema.js';
import { isRec } from '../chapter-editor/dom.js';
import { listShape, objectShape, type ShapeIssue } from '../chapter-editor/schema-check.js';
import { markProblem, markTable } from './marks.js';
import type { ComixModel, SpecFile } from './model.js';
import { shapeFor, SKIP_FIELDS } from './schema.js';

export interface ComixIssue {
  severity: 'error' | 'warn';
  file: string;
  message: string;
}

interface Bag {
  file: string;
  marks: Record<string, number>;
  out: ComixIssue[];
}

function adopt(file: string, rows: ShapeIssue[]): ComixIssue[] {
  return rows.map((row) => ({ severity: row.severity, file, message: row.message }));
}

function skipShape(value: unknown, file: string): ComixIssue[] {
  if (!isRec(value)) return [];
  if (value.skip === 'end') return [];
  if (Array.isArray(value.skip)) return adopt(file, listShape(value.skip, { fields: SKIP_FIELDS, title: () => '' }, `${file}.skip`));
  return [{ severity: 'error', file, message: `${file}: skip must be "end" or a list of rules` }];
}

function shapeIssues(file: SpecFile): ComixIssue[] {
  const shape = shapeFor(file.path);
  if (!shape) return [{ severity: 'warn', file: file.path, message: `${file.path}: no field table; edit it on the JSON tab` }];
  if (shape.root === 'list') return adopt(file.path, listShape(file.value, shape.item, file.path));
  if (shape.root === 'record') return adopt(file.path, objectShape({ marks: file.value }, [shape.field], file.path));
  const rows = adopt(file.path, objectShape(file.value, shape.fields, file.path, shape.extra));
  if (file.path === 'manifest.json') rows.push(...skipShape(file.value, file.path));
  return rows;
}

function flag(expr: unknown, at: string, bag: Bag): void {
  if (typeof expr !== 'string') return;
  const problem = markProblem(expr, bag.marks);
  if (problem) bag.out.push({ severity: 'error', file: bag.file, message: `${bag.file}: ${at} ${problem}` });
}

function visitItem(item: unknown, spec: ArrayItem, path: string, bag: Bag): void {
  if (!isRec(item)) return;
  if (spec.union) walk(item, spec.union()[String(item[spec.tag ?? 'kind'])] ?? [], path, bag);
  else walk(item, spec.fields ?? [], path, bag);
}

function visit(value: unknown, field: Field, path: string, bag: Bag): void {
  if (field.type === 'text' && field.mark) flag(value, path, bag);
  else if (field.type === 'strings' && field.mark && Array.isArray(value)) value.forEach((item, i) => flag(item, `${path}[${i}]`, bag));
  else if (field.type === 'pairs' && field.mark && Array.isArray(value)) {
    value.forEach((pair, i) => { if (Array.isArray(pair)) pair.forEach((item, j) => flag(item, `${path}[${i}][${j}]`, bag)); });
  } else if (field.type === 'object' && isRec(value)) walk(value, field.fields, path, bag);
  else if (field.type === 'array' && Array.isArray(value)) value.forEach((item, i) => visitItem(item, field.item, `${path}[${i}]`, bag));
  else if (field.type === 'union' && isRec(value)) walk(value, field.union()[String(value[field.tag ?? 'kind'])] ?? [], path, bag);
  else if (field.type === 'record' && Array.isArray(field.value) && isRec(value)) {
    for (const [key, item] of Object.entries(value)) walk(item, field.value, `${path}.${key}`, bag);
  }
}

function walk(value: unknown, fields: Field[], path: string, bag: Bag): void {
  if (!isRec(value)) return;
  for (const field of fields) {
    const child = value[field.key];
    if (child === undefined || child === null) continue;
    visit(child, field, `${path}.${field.key}`, bag);
  }
}

function marksIn(file: SpecFile, marks: Record<string, number>, out: ComixIssue[]): void {
  const shape = shapeFor(file.path);
  if (!shape || shape.root === 'record') return;
  const bag: Bag = { file: file.path, marks, out };
  if (shape.root === 'object') walk(file.value, shape.fields, file.path, bag);
  else if (Array.isArray(file.value)) file.value.forEach((item, i) => visitItem(item, shape.item, `${file.path}[${i}]`, bag));
  if (file.path === 'manifest.json' && isRec(file.value) && Array.isArray(file.value.skip)) {
    file.value.skip.forEach((rule, i) => visitItem(rule, { fields: SKIP_FIELDS, title: () => '' }, `${file.path}.skip[${i}]`, bag));
  }
}

function needPanel(file: string, at: string, id: unknown, ids: Map<string, string>, out: ComixIssue[]): void {
  if (typeof id !== 'string' || ids.has(id)) return;
  out.push({ severity: 'error', file, message: `${file}: ${at} panel "${id}" does not exist` });
}

function panelIssues(model: ComixModel): ComixIssue[] {
  const ids = new Map<string, string>();
  const out: ComixIssue[] = [];
  for (const file of model.files) {
    if (!file.path.startsWith('pages/') || !isRec(file.value) || !Array.isArray(file.value.panels)) continue;
    file.value.panels.forEach((panel, i) => {
      if (!isRec(panel) || typeof panel.id !== 'string') return;
      const prev = ids.get(panel.id);
      if (prev) out.push({ severity: 'error', file: file.path, message: `${file.path}: panels[${i}].id "${panel.id}" is also used in ${prev}` });
      else ids.set(panel.id, file.path);
    });
  }
  const letters = model.file('letters.json')?.value;
  if (Array.isArray(letters)) letters.forEach((letter, i) => { if (isRec(letter) && 'panel' in letter) needPanel('letters.json', `[${i}].panel`, letter.panel, ids, out); });
  const camera = model.file('camera.json')?.value;
  if (Array.isArray(camera)) camera.forEach((shot, i) => { if (isRec(shot)) needPanel('camera.json', `[${i}].panel`, shot.panel, ids, out); });
  const splash = model.file('splash.json')?.value;
  if (isRec(splash) && 'panel' in splash) needPanel('splash.json', 'panel', splash.panel, ids, out);
  const manifest = model.file('manifest.json')?.value;
  if (isRec(manifest) && Array.isArray(manifest.keyframes)) {
    manifest.keyframes.forEach((frame, i) => { if (isRec(frame)) needPanel('manifest.json', `keyframes[${i}].panel`, frame.panel, ids, out); });
  }
  return out;
}

/** Schema shape, mark expressions, panel ids, and pose/beat kinds (kinds via the field tables). */
export function checkComix(model: ComixModel): ComixIssue[] {
  const out: ComixIssue[] = [];
  for (const file of model.files) out.push(...shapeIssues(file));
  const marks = markTable(model.file('marks.json')?.value);
  for (const file of model.files) marksIn(file, marks, out);
  out.push(...panelIssues(model));
  const manifest = model.file('manifest.json')?.value;
  if (isRec(manifest) && typeof manifest.id === 'string' && manifest.id !== model.id) {
    out.push({ severity: 'error', file: 'manifest.json', message: `manifest.json: id "${manifest.id}" does not match the folder "${model.id}"` });
  }
  return out;
}
