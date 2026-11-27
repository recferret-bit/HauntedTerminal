import { h, isRec, type Rec } from './dom.js';
import { blankOf, type FormCtx } from './form-state.js';
import type { Field } from './schema.js';

type Of<T extends Field['type']> = Extract<Field, { type: T }>;

export function put(obj: Rec, f: { key: string; optional?: boolean }, value: unknown, empty: boolean): void {
  if (f.optional && empty) delete obj[f.key];
  else obj[f.key] = value;
}

export function row(f: { label: string; hint?: string }, control: HTMLElement, extra = ''): HTMLElement {
  return h('label', { class: `fld ${extra}` }, h('span', { class: 'fld-label' }, f.label), control, f.hint ? h('small', { class: 'fld-hint' }, f.hint) : null);
}

export function groupRow(f: { label: string; hint?: string }, control: HTMLElement, extra = ''): HTMLElement {
  return h(
    'div',
    { class: `fld ${extra}`, role: 'group', 'aria-label': f.label },
    h('span', { class: 'fld-label' }, f.label),
    control,
    f.hint ? h('small', { class: 'fld-hint' }, f.hint) : null,
  );
}

export function datalist(ctx: FormCtx, name: string): string {
  const id = `dl-${name}`;
  let list = document.getElementById(id);
  if (!list) {
    list = h('datalist', { id });
    document.body.append(list);
  }
  list.replaceChildren(...ctx.suggest(name).map((v) => h('option', { value: v })));
  return id;
}

export function trackText(input: HTMLInputElement | HTMLTextAreaElement, obj: Rec, f: Field, ctx: FormCtx): void {
  input.addEventListener('input', () => {
    put(obj, f, input.value, input.value === '');
    ctx.changed();
  });
}

export function bindScalarNum(input: HTMLInputElement, obj: Rec, f: Field, def: number, ctx: FormCtx, octal = false): void {
  input.addEventListener('input', () => {
    if (input.value.trim() === '') put(obj, f, def, true);
    else {
      const parsed = octal ? Number.parseInt(input.value, 8) : Number(input.value);
      if (!Number.isFinite(parsed)) return;
      obj[f.key] = parsed;
    }
    ctx.changed();
  });
}

function onModeSelect(sel: HTMLSelectElement, ctx: FormCtx, update: (val: string) => void): void {
  sel.addEventListener('change', () => {
    update(sel.value);
    ctx.restructure();
    ctx.changed();
  });
}

function numCell(ariaLabel: string, step: number | 'any', val: unknown, fallback: number, onNum: (v: number) => void, ctx: FormCtx): HTMLElement {
  const input = h('input', { type: 'number', step, 'aria-label': ariaLabel });
  input.value = typeof val === 'number' ? String(val) : String(fallback);
  input.addEventListener('input', () => {
    const parsed = Number(input.value);
    if (Number.isFinite(parsed)) onNum(parsed);
    ctx.changed();
  });
  return input;
}

function scalarInputInPair(body: HTMLElement, inp: HTMLInputElement, val: string): HTMLInputElement {
  inp.value = val;
  body.append(inp);
  return inp;
}

function finishPair(f: Field, mode: HTMLElement, body: HTMLElement, asVec: boolean, makeScalar: () => void): HTMLElement {
  if (!asVec) makeScalar();
  return groupRow(f, h('span', { class: 'color-pair' }, mode, body));
}

function modeSelectEl(ariaLabel: string, opt1: [string, string], opt2: [string, string], firstSelected: boolean): HTMLSelectElement {
  return h('select', { 'aria-label': ariaLabel }, h('option', { value: opt1[0], selected: firstSelected }, opt1[1]), h('option', { value: opt2[0], selected: !firstSelected }, opt2[1]));
}

function appendAxes(
  body: HTMLElement,
  axes: readonly (string | number)[],
  label: string,
  step: number | 'any',
  fallback: number,
  get: (k: string | number) => unknown,
  set: (k: string | number, v: number) => void,
  ctx: FormCtx,
): void {
  for (const ax of axes) body.append(numCell(`${label} ${String(ax)}`, step, get(ax), fallback, (v) => set(ax, v), ctx));
}

export function textOrVecField(obj: Rec, f: Of<'textOrVec'>, ctx: FormCtx): HTMLElement {
  const current = obj[f.key];
  const asVec = isRec(current);
  const mode = modeSelectEl(`${f.label} mode`, ['name', 'name'], ['vector', 'vector'], !asVec);
  onModeSelect(mode, ctx, (val) => { obj[f.key] = val === 'vector' ? { x: 0, y: 0, z: 0 } : ''; });
  const body = h('span', { class: 'color-pair' });
  if (asVec) appendAxes(body, ['x', 'y', 'z'], f.label, 'any', 0, (k) => current[String(k)], (k, v) => { current[String(k)] = v; }, ctx);
  return finishPair(f, mode, body, asVec, () => {
    const inp = scalarInputInPair(body, h('input', { type: 'text', class: 'mono', list: datalist(ctx, 'points'), spellcheck: 'false', 'aria-label': f.label }), typeof current === 'string' ? current : '');
    trackText(inp, obj, f, ctx);
  });
}

export function numOrVec3Field(obj: Rec, f: Of<'numOrVec3'>, ctx: FormCtx): HTMLElement {
  const current = obj[f.key];
  const asVec = Array.isArray(current);
  const def = f.defaultScalar ?? 0;
  const mode = modeSelectEl(`${f.label} mode`, ['scalar', 'scalar'], ['vec3', 'x,y,z'], !asVec);
  onModeSelect(mode, ctx, (val) => {
    const curVal = obj[f.key];
    const base = typeof curVal === 'number' && Number.isFinite(curVal) ? curVal : def;
    obj[f.key] = val === 'vec3' ? [base, base, base] : Array.isArray(curVal) ? Number((curVal as unknown[])[0] ?? def) : def;
  });
  const body = h('span', { class: 'color-pair' });
  if (asVec) {
    const vec = current as unknown[];
    appendAxes(body, [0, 1, 2], f.label, f.step ?? 'any', def, (k) => vec[Number(k)], (k, v) => { vec[Number(k)] = v; }, ctx);
  }
  return finishPair(f, mode, body, asVec, () => {
    const inp = scalarInputInPair(body, h('input', { type: 'number', step: f.step ?? 'any', 'aria-label': f.label }), typeof current === 'number' ? String(current) : '');
    bindScalarNum(inp, obj, f, def, ctx);
  });
}

export function altField(
  obj: Rec,
  f: Of<'alt'>,
  ctx: FormCtx,
  path: string,
  drawFields: (host: HTMLElement, sub: Rec, fields: Field[], p: string) => void,
): HTMLElement {
  const cur = obj[f.key];
  const asObj = isRec(cur);
  const unset = cur === undefined;
  const scalarLabel = f.scalar === 'number' ? 'number' : 'flag';
  const def = f.defaultScalar ?? (f.scalar === 'number' ? 0 : false);
  const mode = h(
    'select',
    { 'aria-label': `${f.label} mode` },
    ...(f.optional ? [h('option', { value: 'unset', selected: unset }, '(default)')] : []),
    h('option', { value: 'scalar', selected: !unset && !asObj }, scalarLabel),
    h('option', { value: 'object', selected: asObj }, 'object'),
  );
  onModeSelect(mode, ctx, (val) => {
    if (val === 'unset') delete obj[f.key];
    else if (val === 'object') {
      const next = blankOf(f.fields);
      if (f.scalar === 'number' && typeof cur === 'number' && 'x' in next) next.x = cur;
      obj[f.key] = next;
    } else {
      obj[f.key] = f.scalar === 'number' && isRec(cur) && typeof cur.x === 'number' ? cur.x : def;
    }
  });
  const box = h('fieldset', { class: 'grp' }, h('legend', {}, f.label, ' ', mode));
  if (asObj) {
    drawFields(box, cur, f.fields, path);
  } else if (!unset && f.scalar === 'bool') {
    const cb = h('input', { type: 'checkbox', 'aria-label': f.label });
    cb.checked = Boolean(cur);
    cb.addEventListener('change', () => { obj[f.key] = cb.checked; ctx.changed(); });
    box.append(h('label', { class: 'fld check' }, cb, h('span', {}, f.hint ?? 'Enabled')));
  } else if (!unset) {
    const inp = h('input', { type: 'number', step: 'any', 'aria-label': f.label });
    inp.value = typeof cur === 'number' ? String(cur) : '';
    inp.addEventListener('input', () => { const p = Number(inp.value); if (Number.isFinite(p)) { obj[f.key] = p; ctx.changed(); } });
    box.append(row(f, inp));
  }
  return box;
}
