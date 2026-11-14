import { h, isRec, clone, type Rec } from './dom.js';
import {
  bindOpenDetails,
  bindSelectableItem,
  blankOf,
  blankUnion,
  remapArrayPaths,
  remapSinglePath,
  syncSelectedDetailsDom,
  type FormCtx,
} from './form-state.js';
import type { ArrayItem, Field, Option } from './schema.js';

export { blankOf, blankUnion, remapArrayPaths, syncSelectedDetailsDom, type FormCtx };

type Of<T extends Field['type']> = Extract<Field, { type: T }>;

// ---- small controls -----------------------------------------------------------------------------------------------

function put(obj: Rec, f: { key: string; optional?: boolean }, value: unknown, empty: boolean): void {
  if (f.optional && empty) delete obj[f.key];
  else obj[f.key] = value;
}

function row(f: { label: string; hint?: string }, control: HTMLElement, extra = ''): HTMLElement {
  return h('label', { class: `fld ${extra}` }, h('span', { class: 'fld-label' }, f.label), control, f.hint ? h('small', { class: 'fld-hint' }, f.hint) : null);
}

function groupRow(f: { label: string; hint?: string }, control: HTMLElement, extra = ''): HTMLElement {
  return h(
    'div',
    { class: `fld ${extra}`, role: 'group', 'aria-label': f.label },
    h('span', { class: 'fld-label' }, f.label),
    control,
    f.hint ? h('small', { class: 'fld-hint' }, f.hint) : null,
  );
}

function datalist(ctx: FormCtx, name: string): string {
  const id = `dl-${name}`;
  let list = document.getElementById(id);
  if (!list) {
    list = h('datalist', { id });
    document.body.append(list);
  }
  list.replaceChildren(...ctx.suggest(name).map((v) => h('option', { value: v })));
  return id;
}

function trackText(input: HTMLInputElement | HTMLTextAreaElement, obj: Rec, f: Field, ctx: FormCtx): void {
  input.addEventListener('input', () => {
    put(obj, f, input.value, input.value === '');
    ctx.changed();
  });
}

function textField(obj: Rec, f: Of<'text'>, ctx: FormCtx): HTMLElement {
  const value = typeof obj[f.key] === 'string' ? (obj[f.key] as string) : '';
  const cls = f.mono ? 'mono' : '';
  const input = f.rows
    ? h('textarea', { rows: f.rows, class: cls, spellcheck: 'false' })
    : h('input', { type: 'text', class: cls, list: f.suggest ? datalist(ctx, f.suggest) : undefined, spellcheck: 'false' });
  input.value = value;
  trackText(input, obj, f, ctx);
  return row(f, input, f.rows ? 'wide' : '');
}

function numberField(obj: Rec, f: Of<'number'>, ctx: FormCtx): HTMLElement {
  const current = typeof obj[f.key] === 'number' ? (obj[f.key] as number) : undefined;
  const input = f.octal ? h('input', { type: 'text', class: 'mono' }) : h('input', { type: 'number', step: f.step ?? 1 });
  input.value = current === undefined ? '' : f.octal ? current.toString(8) : String(current);
  input.addEventListener('input', () => {
    if (input.value.trim() === '') {
      put(obj, f, 0, true);
    } else {
      const parsed = f.octal ? Number.parseInt(input.value, 8) : Number(input.value);
      if (!Number.isFinite(parsed)) return;
      obj[f.key] = parsed;
    }
    ctx.changed();
  });
  return row(f, input);
}

function boolField(obj: Rec, f: Of<'bool'>, ctx: FormCtx): HTMLElement {
  const input = h('input', { type: 'checkbox' });
  input.checked = f.defaultTrue ? obj[f.key] !== false : obj[f.key] === true;
  input.addEventListener('change', () => {
    if (f.defaultTrue) {
      if (f.optional && input.checked) delete obj[f.key];
      else obj[f.key] = input.checked;
    } else {
      put(obj, f, input.checked, !input.checked);
    }
    ctx.changed();
  });
  return h('label', { class: 'fld check' }, input, h('span', {}, f.label));
}

function selectField(obj: Rec, f: Of<'select'>, ctx: FormCtx): HTMLElement {
  const select = h('select');
  const current = obj[f.key];
  if (f.optional) select.append(h('option', { value: '' }, '(default)'));
  for (const o of f.options) select.append(h('option', { value: String(o), selected: o === current }, String(o)));
  if (current !== undefined && !f.options.includes(current as Option)) {
    select.append(h('option', { value: String(current), selected: true }, `${String(current)} (unknown)`));
  }
  select.addEventListener('change', () => {
    const picked = f.options.find((o) => String(o) === select.value);
    put(obj, f, picked ?? select.value, select.value === '');
    ctx.changed();
  });
  return row(f, select);
}

function stringsField(obj: Rec, f: Of<'strings'>, ctx: FormCtx): HTMLElement {
  const area = h('textarea', { rows: f.rows ?? 4, class: 'mono', spellcheck: 'false' });
  area.value = Array.isArray(obj[f.key]) ? (obj[f.key] as string[]).join('\n') : '';
  area.addEventListener('input', () => {
    const lines = area.value.split('\n').filter((l) => l.trim() !== '');
    put(obj, f, lines, lines.length === 0);
    ctx.changed();
  });
  return row(f, area, 'wide');
}

function numbersField(obj: Rec, f: Of<'numbers'>, ctx: FormCtx): HTMLElement {
  const input = h('input', { type: 'text', class: 'mono' });
  input.value = Array.isArray(obj[f.key]) ? (obj[f.key] as number[]).join(', ') : '';
  input.addEventListener('input', () => {
    const nums = input.value.split(',').map((s) => Number(s.trim())).filter((x) => Number.isFinite(x));
    put(obj, f, nums, nums.length === 0);
    ctx.changed();
  });
  return row(f, input);
}

function colorField(obj: Rec, f: Of<'color'>, ctx: FormCtx): HTMLElement {
  const text = h('input', { type: 'text', class: 'mono', 'aria-label': f.label });
  const swatch = h('input', { type: 'color', 'aria-label': `${f.label} color picker` });
  const value = typeof obj[f.key] === 'string' ? (obj[f.key] as string) : '#000000';
  text.value = value;
  if (/^#[0-9a-f]{6}$/i.test(value)) swatch.value = value;
  const set = (v: string): void => {
    obj[f.key] = v;
    text.value = v;
    if (/^#[0-9a-f]{6}$/i.test(v)) swatch.value = v;
    ctx.changed();
  };
  text.addEventListener('input', () => set(text.value));
  swatch.addEventListener('input', () => set(swatch.value));
  return groupRow(f, h('span', { class: 'color-pair' }, swatch, text));
}

// ---- composites ---------------------------------------------------------------------------------------------------

function listOf(obj: Rec, key: string): Rec[] {
  return Array.isArray(obj[key]) ? (obj[key] as Rec[]) : [];
}

function iconButton(label: string, title: string, run: () => void): HTMLElement {
  return h('button', {
    type: 'button',
    class: 'mini',
    title,
    'aria-label': title,
    onclick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      run();
    },
  }, label);
}

function itemFields(host: HTMLElement, item: Rec, spec: ArrayItem, ctx: FormCtx, path: string, list: Rec[], index: number): void {
  if (spec.union) {
    const tag = spec.tag ?? 'kind';
    const variants = spec.union();
    const kind = h('select', { class: 'kind' });
    for (const k of Object.keys(variants)) kind.append(h('option', { value: k, selected: k === item[tag] }, k));
    kind.addEventListener('change', () => {
      const next = blankUnion(variants, kind.value, tag);
      if (typeof item.description === 'string' && 'description' in next) next.description = item.description;
      list[index] = next;
      ctx.restructure();
    });
    host.append(row({ label: tag === 'kind' ? 'Kind' : tag }, kind));
    renderFields(host, item, variants[String(item[tag])] ?? [], ctx, path);
  } else {
    renderFields(host, item, spec.fields ?? [], ctx, path);
  }
}

function removeListIndex(list: unknown[], i: number, obj: Rec, f: { key: string; optional?: boolean }, ctx: FormCtx): void {
  list.splice(i, 1);
  if (list.length === 0 && f.optional) delete obj[f.key];
  ctx.restructure();
  ctx.changed();
}

function remapFormArray(ctx: FormCtx, basePath: string, mapIdx: (idx: number) => number | null): void {
  remapArrayPaths(ctx.open, basePath, mapIdx);
  ctx.remapSelection?.((cur) => remapSinglePath(cur, basePath, mapIdx));
}

function arrayItem(list: Rec[], i: number, f: Of<'array'>, obj: Rec, ctx: FormCtx, path: string): HTMLElement {
  const item = list[i]!;
  const itemPath = `${path}[${i}]`;
  const title = h('span', { class: 'item-title' }, f.item.title(item, i));
  const details = h('details', { class: 'item', open: ctx.open.has(itemPath) });
  bindOpenDetails(details, itemPath, ctx.open);
  bindSelectableItem(details, itemPath, item, ctx);
  details.addEventListener('input', () => { title.textContent = f.item.title(item, i); });
  const tools = h('span', { class: 'item-tools' });
  if (f.item.play && ctx.playStep) tools.append(iconButton('▶', 'Play this step in the preview', () => ctx.playStep?.(item)));
  tools.append(
    iconButton('▲', 'Move up', () => {
      if (i > 0) {
        [list[i - 1], list[i]] = [list[i]!, list[i - 1]!];
        remapFormArray(ctx, path, (idx) => (idx === i ? i - 1 : idx === i - 1 ? i : idx));
        ctx.restructure();
        ctx.changed();
      }
    }),
    iconButton('▼', 'Move down', () => {
      if (i < list.length - 1) {
        [list[i + 1], list[i]] = [list[i]!, list[i + 1]!];
        remapFormArray(ctx, path, (idx) => (idx === i ? i + 1 : idx === i + 1 ? i : idx));
        ctx.restructure();
        ctx.changed();
      }
    }),
    iconButton('⧉', 'Duplicate', () => {
      list.splice(i + 1, 0, clone(item));
      remapFormArray(ctx, path, (idx) => (idx > i ? idx + 1 : idx));
      ctx.open.add(`${path}[${i + 1}]`);
      ctx.restructure();
      ctx.changed();
    }),
    iconButton('✕', 'Remove', () => {
      remapFormArray(ctx, path, (idx) => (idx === i ? null : idx > i ? idx - 1 : idx));
      removeListIndex(list, i, obj, f, ctx);
    }),
  );
  const body = h('div', { class: 'item-body' });
  itemFields(body, item, f.item, ctx, itemPath, list, i);
  details.append(h('summary', {}, title, tools), body);
  return details;
}

function arrayField(obj: Rec, f: Of<'array'>, ctx: FormCtx, path: string): HTMLElement {
  const list = listOf(obj, f.key);
  const box = h('section', { class: 'grp' }, h('h4', {}, `${f.label} (${list.length})`));
  list.forEach((_, i) => box.append(arrayItem(list, i, f, obj, ctx, path)));
  const variants = f.item.union?.();
  const kind = variants
    ? h('select', { 'aria-label': `${f.label} kind to add` }, ...Object.keys(variants).map((k) => h('option', { value: k }, k)))
    : null;
  const add = h('button', { type: 'button', class: 'btn small' }, '+ Add');
  add.addEventListener('click', () => {
    const next = variants && kind ? blankUnion(variants, kind.value, f.item.tag ?? 'kind') : blankOf(f.item.fields ?? []);
    const target = Array.isArray(obj[f.key]) ? (obj[f.key] as Rec[]) : (obj[f.key] = []) as Rec[];
    target.push(next);
    ctx.open.add(`${path}[${target.length - 1}]`);
    ctx.restructure();
    ctx.changed();
  });
  box.append(h('div', { class: 'add-row' }, kind, add));
  return box;
}

function objectField(obj: Rec, f: Of<'object'>, ctx: FormCtx, path: string): HTMLElement {
  const present = isRec(obj[f.key]);
  const box = h('fieldset', { class: 'grp' });
  const legend = h('legend', {}, f.label);
  if (f.optional) {
    const on = h('input', { type: 'checkbox', 'aria-label': `Enable ${f.label}` });
    on.checked = present;
    on.addEventListener('change', () => {
      if (on.checked) obj[f.key] = blankOf(f.fields);
      else delete obj[f.key];
      ctx.restructure();
      ctx.changed();
    });
    legend.prepend(on);
  }
  box.append(legend);
  if (present) renderFields(box, obj[f.key] as Rec, f.fields, ctx, path);
  return box;
}

function recordField(obj: Rec, f: Of<'record'>, ctx: FormCtx, path: string): HTMLElement {
  const map = isRec(obj[f.key]) ? (obj[f.key] as Rec) : {};
  const box = h('section', { class: 'grp' }, h('h4', {}, `${f.label} (${Object.keys(map).length})`));
  for (const key of Object.keys(map)) {
    const entryPath = `${path}.${key}`;
    const name = h('input', { type: 'text', class: 'mono key', value: key, title: f.keyLabel, 'aria-label': `${f.keyLabel} (${key})` });
    name.addEventListener('change', () => {
      const next = name.value.trim();
      if (!next || next === key || next in map) { name.value = key; return; }
      obj[f.key] = Object.fromEntries(Object.entries(map).map(([k, v]) => [k === key ? next : k, v]));
      if (ctx.open.delete(entryPath)) ctx.open.add(`${path}.${next}`);
      ctx.restructure();
      ctx.changed();
    });
    const remove = iconButton('✕', 'Remove', () => {
      delete map[key];
      ctx.open.delete(entryPath);
      if (Object.keys(map).length === 0 && f.optional) delete obj[f.key];
      ctx.restructure();
      ctx.changed();
    });
    if (f.value === 'string' || f.value === 'strings' || f.value === 'number') {
      const list = f.value === 'strings';
      const text = list ? (Array.isArray(map[key]) ? (map[key] as string[]).join(', ') : '') : String(map[key] ?? '');
      const val = f.value === 'number'
        ? h('input', { type: 'number', step: 'any', value: text, 'aria-label': `${f.label} value for ${key}` })
        : h('input', {
            type: 'text',
            class: 'mono',
            value: text,
            title: list ? 'comma separated' : undefined,
            'aria-label': `${f.label} value for ${key}`,
          });
      val.addEventListener('input', () => {
        if (f.value === 'number') {
          map[key] = val.value.trim() === '' || !Number.isFinite(Number(val.value)) ? 0 : Number(val.value);
        } else {
          map[key] = list ? val.value.split(',').map((x) => x.trim()).filter(Boolean) : val.value;
        }
        ctx.changed();
      });
      box.append(h('div', { class: 'rec-row' }, name, val, remove));
    } else {
      name.addEventListener('click', (e) => e.stopPropagation());
      name.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') e.stopPropagation();
      });
      const details = h('details', { class: 'item', open: ctx.open.has(entryPath) });
      bindOpenDetails(details, entryPath, ctx.open);
      const recItem = isRec(map[key]) ? (map[key] as Rec) : {};
      bindSelectableItem(details, entryPath, recItem, ctx);
      const body = h('div', { class: 'item-body' });
      if (isRec(map[key])) renderFields(body, map[key] as Rec, f.value, ctx, entryPath);
      details.append(h('summary', {}, name, h('span', { class: 'item-tools' }, remove)), body);
      box.append(details);
    }
  }
  const newKey = h('input', { type: 'text', class: 'mono key', placeholder: f.keyLabel, 'aria-label': `New ${f.keyLabel}` });
  const add = h('button', { type: 'button', class: 'btn small' }, '+ Add');
  const addEntry = (): void => {
    const key = newKey.value.trim();
    if (!key || key in map) return;
    const target = isRec(obj[f.key]) ? (obj[f.key] as Rec) : (obj[f.key] = {}) as Rec;
    target[key] = f.value === 'string' ? '' : f.value === 'strings' ? [] : f.value === 'number' ? 0 : blankOf(f.value);
    ctx.open.add(`${path}.${key}`);
    ctx.restructure();
    ctx.changed();
  };
  add.addEventListener('click', addEntry);
  newKey.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229 || e.key !== 'Enter') return;
    e.preventDefault();
    addEntry();
  });
  box.append(h('div', { class: 'add-row' }, newKey, add));
  return box;
}

function unionField(obj: Rec, f: Of<'union'>, ctx: FormCtx, path: string): HTMLElement {
  const tag = f.tag ?? 'kind';
  const variants = f.union();
  const current = isRec(obj[f.key]) ? (obj[f.key] as Rec) : null;
  const box = h('fieldset', { class: 'grp' }, h('legend', {}, f.label));
  const kind = h('select', { class: 'kind', 'aria-label': `${f.label} ${tag}` });
  if (f.optional) kind.append(h('option', { value: '' }, '(none)'));
  for (const k of Object.keys(variants)) kind.append(h('option', { value: k, selected: current?.[tag] === k }, k));
  kind.addEventListener('change', () => {
    if (kind.value === '') delete obj[f.key];
    else obj[f.key] = blankUnion(variants, kind.value, tag);
    ctx.restructure();
    ctx.changed();
  });
  box.append(kind);
  if (current) renderFields(box, current, variants[String(current[tag])] ?? [], ctx, path);
  return box;
}

function pairsField(obj: Rec, f: Of<'pairs'>, ctx: FormCtx): HTMLElement {
  const list = Array.isArray(obj[f.key]) ? (obj[f.key] as unknown[]) : [];
  const box = h('section', { class: 'grp' }, h('h4', {}, `${f.label} (${list.length})`));
  list.forEach((pair, i) => {
    const [a, bVal] = Array.isArray(pair) ? pair : ['', ''];
    const left = h('input', { type: 'text', class: 'mono', value: String(a ?? ''), 'aria-label': `${f.label} row ${i + 1} first` });
    const right = h('input', { type: 'text', class: 'mono', value: String(bVal ?? ''), 'aria-label': `${f.label} row ${i + 1} second` });
    const write = (): void => {
      list[i] = [left.value, right.value];
      ctx.changed();
    };
    left.addEventListener('input', write);
    right.addEventListener('input', write);
    box.append(h('div', { class: 'rec-row' }, left, right, iconButton('✕', 'Remove', () => removeListIndex(list, i, obj, f, ctx))));
  });
  const add = h('button', { type: 'button', class: 'btn small' }, '+ Add');
  add.addEventListener('click', () => {
    const target = Array.isArray(obj[f.key]) ? (obj[f.key] as unknown[]) : (obj[f.key] = []) as unknown[];
    target.push(['', '']);
    ctx.restructure();
    ctx.changed();
  });
  box.append(h('div', { class: 'add-row' }, add));
  return box;
}

function textOrVecField(obj: Rec, f: Of<'textOrVec'>, ctx: FormCtx): HTMLElement {
  const current = obj[f.key];
  const asVec = isRec(current);
  const mode = h(
    'select',
    { 'aria-label': `${f.label} mode` },
    h('option', { value: 'name', selected: !asVec }, 'name'),
    h('option', { value: 'vector', selected: asVec }, 'vector'),
  );
  mode.addEventListener('change', () => {
    obj[f.key] = mode.value === 'vector' ? { x: 0, y: 0, z: 0 } : '';
    ctx.restructure();
    ctx.changed();
  });
  const body = h('span', { class: 'color-pair' });
  if (asVec) {
    for (const axis of ['x', 'y', 'z'] as const) {
      const input = h('input', { type: 'number', step: 'any', 'aria-label': `${f.label} ${axis}` });
      input.value = typeof current[axis] === 'number' ? String(current[axis]) : '0';
      input.addEventListener('input', () => {
        const parsed = Number(input.value);
        if (Number.isFinite(parsed)) current[axis] = parsed;
        ctx.changed();
      });
      body.append(input);
    }
  } else {
    const input = h('input', { type: 'text', class: 'mono', list: datalist(ctx, 'points'), spellcheck: 'false', 'aria-label': f.label });
    input.value = typeof current === 'string' ? current : '';
    trackText(input, obj, f, ctx);
    body.append(input);
  }
  return groupRow(f, h('span', { class: 'color-pair' }, mode, body));
}

function renderField(obj: Rec, f: Field, ctx: FormCtx, path: string): HTMLElement {
  switch (f.type) {
    case 'text':
      return textField(obj, f, ctx);
    case 'number':
      return numberField(obj, f, ctx);
    case 'bool':
      return boolField(obj, f, ctx);
    case 'select':
      return selectField(obj, f, ctx);
    case 'strings':
      return stringsField(obj, f, ctx);
    case 'numbers':
      return numbersField(obj, f, ctx);
    case 'pairs':
      return pairsField(obj, f, ctx);
    case 'textOrVec':
      return textOrVecField(obj, f, ctx);
    case 'color':
      return colorField(obj, f, ctx);
    case 'array':
      return arrayField(obj, f, ctx, path);
    case 'object':
      return objectField(obj, f, ctx, path);
    case 'record':
      return recordField(obj, f, ctx, path);
    case 'union':
      return unionField(obj, f, ctx, path);
  }
}

/** Draws `fields` for `obj` into `host`. Edits write straight into `obj`; `ctx.changed` tells the app. */
export function renderFields(host: HTMLElement, obj: Rec, fields: Field[], ctx: FormCtx, path: string): void {
  for (const f of fields) host.append(renderField(obj, f, ctx, `${path}.${f.key}`));
}
