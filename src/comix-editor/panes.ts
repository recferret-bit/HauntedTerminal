import type { Field } from '../chapter-editor/schema.js';
import { h, isRec, type Rec } from '../chapter-editor/dom.js';
import { renderFields, type FormCtx } from '../chapter-editor/form.js';
import type { ComixIssue } from './check.js';
import { stringifyComixJson } from './json.js';
import type { SpecFile } from './model.js';
import { shapeFor } from './schema.js';
import { renderSkip } from './skip.js';

export interface Holder {
  box: Rec;
  key: string;
}

function bad(hold: (holder: Holder | null) => void, text: string): HTMLElement {
  hold(null);
  return h('p', { class: 'note error' }, text);
}

export function renderFormPane(file: SpecFile, ctx: FormCtx, hold: (holder: Holder | null) => void): HTMLElement {
  const shape = shapeFor(file.path);
  if (!shape) return bad(hold, 'No form for this file. Use the JSON tab.');
  if (shape.root === 'object') {
    if (!isRec(file.value)) return bad(hold, 'This file is not a JSON object.');
    hold(null);
    const host = h('div', {});
    renderFields(host, file.value, shape.fields, ctx, file.path);
    if (file.path === 'manifest.json') renderSkip(host, file.value, ctx);
    return host;
  }
  if (shape.root === 'record') {
    if (!isRec(file.value)) return bad(hold, 'This file is not a JSON object.');
    const box: Rec = { [shape.field.key]: file.value };
    hold({ box, key: shape.field.key });
    const host = h('div', {});
    renderFields(host, box, [shape.field], ctx, file.path);
    return host;
  }
  if (!Array.isArray(file.value)) return bad(hold, 'This file is not a JSON array.');
  const box: Rec = { items: file.value };
  hold({ box, key: 'items' });
  const field: Field = { type: 'array', key: 'items', label: shape.label, item: shape.item };
  const host = h('div', {});
  renderFields(host, box, [field], ctx, file.path);
  return host;
}

function applyJsonDraft(raw: string, file: SpecFile, msg: HTMLElement, changed: () => void): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    msg.textContent = `not applied: ${(err as Error).message}`;
    msg.className = 'note error';
    return;
  }
  if (parsed === null || typeof parsed !== 'object') {
    msg.textContent = 'not applied: JSON must be an object or an array';
    msg.className = 'note error';
    return;
  }
  if (stringifyComixJson(parsed) === stringifyComixJson(file.value)) {
    msg.textContent = '';
    msg.className = 'note';
    return;
  }
  file.value = parsed;
  msg.textContent = '';
  msg.className = 'note';
  changed();
}

export function renderJsonPane(file: SpecFile, changed: () => void): HTMLElement {
  const area = h('textarea', { class: 'json mono', spellcheck: 'false', 'aria-label': `JSON for ${file.path}` });
  area.value = stringifyComixJson(file.value);
  const msg = h('p', { class: 'note', role: 'status' });
  area.addEventListener('input', () => applyJsonDraft(area.value, file, msg, changed));
  return h('div', { class: 'jsonpane' }, msg, area);
}

export function renderCheckPane(issues: ComixIssue[]): HTMLElement {
  const list = h('ul', { class: 'issues' });
  if (issues.length === 0) list.append(h('li', { class: 'okrow' }, 'No problems in this comix.'));
  for (const issue of issues) list.append(h('li', { class: issue.severity === 'error' ? 'error' : 'warn' }, issue.message));
  return h('div', {},
    h('h4', {}, `Checks (${issues.length})`),
    h('p', { class: 'note' }, 'Mark expressions, unique panel ids, letter and camera panels, pose and beat kinds, unknown keys and missing fields.'),
    h('p', { class: 'note dim' }, 'On disk: node scripts/harness/validate-comix.mjs'),
    list,
  );
}
