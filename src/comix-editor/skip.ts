import type { Field } from '../chapter-editor/schema.js';
import { h, type Rec } from '../chapter-editor/dom.js';
import { renderFields, type FormCtx } from '../chapter-editor/form.js';
import { SKIP_FIELDS } from './schema.js';

/** `skip` is either `"end"` or a list of rules, so it is not one field type. */
export function renderSkip(host: HTMLElement, manifest: Rec, ctx: FormCtx): void {
  const rules = Array.isArray(manifest.skip);
  const mode = h('select', { 'aria-label': 'Skip mode' });
  mode.append(h('option', { value: 'end', selected: !rules }, 'end'), h('option', { value: 'rules', selected: rules }, 'rules'));
  mode.addEventListener('change', () => {
    if (mode.value === 'end') manifest.skip = 'end';
    else if (!Array.isArray(manifest.skip)) manifest.skip = [{ before: '', to: '' }];
    ctx.restructure();
  });
  host.append(h('label', { class: 'fld' },
    h('span', { class: 'fld-label' }, 'Skip'),
    mode,
    h('small', { class: 'fld-hint' }, 'end jumps to the end. Rules jump to the first "to" whose "before" is still ahead.'),
  ));
  if (!rules) return;
  const field: Field = {
    type: 'array',
    key: 'skip',
    label: 'Skip rules',
    item: { fields: SKIP_FIELDS, title: (rule) => `${String(rule.before)} → ${String(rule.to)}` },
  };
  renderFields(host, manifest, [field], ctx, 'manifest');
}
