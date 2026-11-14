import { renderDataTable, renderIssueList, renderJsonFilePane } from '../editor-core/chrome.js';
import { clear, h, type Rec } from '../editor-core/dom.js';
import { renderFields, type FormCtx } from '../editor-core/form.js';
import type { Field } from '../editor-core/schema.js';
import { resolveTime } from '../cinematic/expr.js';
import type { ComixElementRef } from '../cinematic/editor-select.js';
import type { ComixPageSpec, ComixPanelSpec } from '../cinematic/spec-types.js';
import { compileTimeline, visiblePanelStart, type ResolvedTimeline } from '../cinematic/timeline.js';
import { runComixSim, type ComixIssue } from './check.js';
import { stringifyComixJson } from './json.js';
import type { ComixFileKey, ComixModel } from './model.js';
import type { ComixPreview } from './preview.js';
import { createInteractiveSheetBox } from './sheet-drag.js';
import {
  COMIX_CAST_FIELDS,
  COMIX_MANIFEST_FIELDS,
  COMIX_STAGE_FIELDS,
  PAGE_OVERVIEW_FIELDS,
  PAGE_PANELS_FIELDS,
  PAGE_TRACKS_FIELD,
  PANEL_BEATS_FIELD,
  PANEL_LETTERS_FIELD,
  PANEL_TRACKS_FIELD,
} from './schema.js';

export interface ComixSel {
  slug: string;
  target: string; // 'manifest' or page.id
  tab: string;
}

export interface ComixEnv {
  model: ComixModel;
  writable: boolean;
  baseCtx: FormCtx;
  preview: ComixPreview;
  issues: ComixIssue[];
  selectedElement?: ComixElementRef | null;
  selectElement?: (ref: ComixElementRef | null, navigateToRoute?: boolean) => void;
  navigate(next: Partial<ComixSel>): void;
  redraw(): void;
  changed(): void;
}

export const COMIX_TABS = [
  { id: 'manifest', label: 'Manifest' },
  { id: 'stage', label: 'Stage & Set' },
  { id: 'cast', label: 'Cast' },
  { id: 'json', label: 'JSON' },
  { id: 'check', label: 'Check' },
] as const;

export const PAGE_TABS = [
  { id: 'overview', label: 'Overview & Cues' },
  { id: 'panels', label: 'Panels & Camera' },
  { id: 'letters', label: 'Letters' },
  { id: 'beats', label: 'Beats & Tracks' },
  { id: 'json', label: 'JSON' },
  { id: 'check', label: 'Check' },
] as const;

function mergedCues(env: ComixEnv, page?: ComixPageSpec): Record<string, number> {
  const out: Record<string, number> = { ...(env.model.draft.manifest.cues ?? {}) };
  if (page) Object.assign(out, page.cues ?? {});
  else for (const p of env.model.draft.pages) Object.assign(out, p.cues ?? {});
  return out;
}

function scopedCtx(env: ComixEnv, cues: Record<string, number>, baseSec: number): FormCtx {
  return {
    ...env.baseCtx,
    playStep: (item: Rec) => {
      const expr = typeof item.at === 'string' ? item.at : typeof item.from === 'string' ? item.from : undefined;
      try {
        const at = expr ? resolveTime(expr, cues, baseSec) : baseSec;
        env.preview.jumpTo(at + 0.05);
      } catch {
        env.preview.jumpTo(baseSec + 0.05);
      }
    },
  };
}

function drawFormBlock(obj: Rec, fields: Field[], ctx: FormCtx, path: string): HTMLElement {
  const host = h('div', { class: 'form' });
  renderFields(host, obj, fields, ctx, path);
  return host;
}

function renderIssueRows(env: ComixEnv, list: ComixIssue[], clickable: boolean): HTMLElement {
  return renderIssueList(list, {
    okText: '✓ 0 static or timeline issues',
    onJump: clickable
      ? (issue) => {
          const hasPage = env.model.draft.pages.some((p) => p.id === issue.where);
          env.navigate({ target: hasPage ? issue.where : 'manifest', tab: issue.tab });
        }
      : undefined,
  });
}

function renderSkipEditor(env: ComixEnv): HTMLElement {
  const manifest = env.model.draft.manifest;
  const isSteps = Array.isArray(manifest.skip);
  const modeSel = h(
    'select',
    {
      'aria-label': 'Skip mode',
      onchange: () => {
        manifest.skip = modeSel.value === 'steps' ? [{ before: '10', to: String(manifest.durationSec) }] : 'end';
        env.changed();
        env.redraw();
      },
    },
    h('option', { value: 'end', selected: !isSteps }, 'Jump straight to end ("end")'),
    h('option', { value: 'steps', selected: isSteps }, 'Stepped skip waypoints ([{ before, to }])'),
  );

  const wrap = h('fieldset', { class: 'grp' }, h('legend', {}, 'Skip Policy'), modeSel);
  if (Array.isArray(manifest.skip)) {
    const rules = manifest.skip;
    rules.forEach((rule, idx) => {
      const beforeIn = h('input', {
        type: 'text',
        class: 'mono',
        value: rule.before,
        placeholder: 'before (cue or sec)',
        'aria-label': `Skip rule ${idx + 1} before`,
        oninput: () => {
          rule.before = beforeIn.value;
          env.changed();
        },
      });
      const toIn = h('input', {
        type: 'text',
        class: 'mono',
        value: rule.to,
        placeholder: 'to (cue or sec)',
        'aria-label': `Skip rule ${idx + 1} target`,
        oninput: () => {
          rule.to = toIn.value;
          env.changed();
        },
      });
      const del = h(
        'button',
        {
          type: 'button',
          class: 'mini',
          title: 'Remove rule',
          'aria-label': `Remove skip rule ${idx + 1}`,
          onclick: () => {
            rules.splice(idx, 1);
            env.changed();
            env.redraw();
          },
        },
        '✕',
      );
      wrap.append(h('div', { class: 'skip-row' }, beforeIn, toIn, del));
    });
    wrap.append(
      h(
        'div',
        { class: 'add-row' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn small',
            onclick: () => {
              rules.push({ before: '0', to: String(manifest.durationSec) });
              env.changed();
              env.redraw();
            },
          },
          '+ Add skip waypoint',
        ),
      ),
    );
  }
  return wrap;
}

function renderManifestPane(env: ComixEnv): HTMLElement {
  const manifest = env.model.draft.manifest;
  const cues = mergedCues(env);
  const ctx = scopedCtx(env, cues, 0);
  const tableRows = manifest.pages.map((p) =>
    h(
      'tr',
      {},
      h('td', {}, `P${p.index + 1}`),
      h('td', { class: 'mono' }, p.id),
      h('td', {}, p.title),
      h('td', { class: 'mono' }, `${p.from}s → ${p.until}s`),
      h('td', {}, `${p.panelCount} panel${p.panelCount === 1 ? '' : 's'}`),
      h(
        'td',
        {},
        h(
          'button',
          { type: 'button', class: 'btn small', onclick: () => env.navigate({ target: p.id, tab: 'overview' }) },
          'Open →',
        ),
      ),
    ),
  );
  const syncBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn small',
      onclick: () => {
        env.model.syncSummaries();
        env.changed();
        env.redraw();
      },
    },
    'Sync summaries from page specs',
  );
  return h(
    'div',
    { class: 'form' },
    drawFormBlock(manifest as unknown as Rec, COMIX_MANIFEST_FIELDS, ctx, 'manifest'),
    renderSkipEditor(env),
    h(
      'fieldset',
      { class: 'grp' },
      h('legend', {}, 'Connected Pages (synced on save)'),
      renderDataTable(['Page', 'ID', 'Title', 'Window', 'Panels', ''], tableRows),
      h('div', { class: 'row' }, syncBtn),
    ),
  );
}

function safeTimeline(env: ComixEnv): ResolvedTimeline | null {
  try {
    return compileTimeline(env.model.pack());
  } catch {
    return null;
  }
}

function panelVisibleJump(
  tl: ResolvedTimeline | null,
  page: ComixPageSpec,
  panel: ComixPanelSpec,
  cues: Record<string, number>,
): number {
  const resolved = tl?.panels.find((p) => p.id === panel.id);
  if (tl && resolved) return visiblePanelStart(tl, resolved.pageIndex, resolved.from, resolved.until);
  return panelStartSec(page, panel, cues) + 0.05;
}

function renderLayoutMap(env: ComixEnv, page: ComixPageSpec): HTMLElement {
  const cues = mergedCues(env, page);
  const tl = safeTimeline(env);
  const buildSheet = (mode: 'landscape' | 'portrait', title: string): HTMLElement => {
    const sheet = h('div', { class: `layout-sheet ${mode}`, 'data-sheet-mode': mode });
    page.panels.forEach((panel, idx) => {
      const jumpSec = panelVisibleJump(tl, page, panel, cues);
      const box = createInteractiveSheetBox({
        sheet,
        panel,
        index: idx,
        mode,
        jumpSec,
        active: env.preview.activePanelId === panel.id,
        onJump: () => {
          env.preview.jumpTo(jumpSec);
          env.selectElement?.(
            {
              kind: 'panel',
              itemPath: `${page.id}.panels.panels[${idx}]`,
              label: `panel:${panel.id}`,
              pageId: page.id,
              panelId: panel.id,
              panelIndex: idx,
            },
            false,
          );
        },
        onCommitRect: () => {
          env.changed();
          env.redraw();
        },
      });
      if (env.selectedElement?.panelId === panel.id) box.classList.add('is-selected');
      sheet.append(box);
    });
    return h('div', { class: 'layout-card' }, h('h5', {}, title), sheet);
  };
  return h(
    'div',
    { class: 'layout-grid' },
    buildSheet('landscape', 'Landscape Sheet (click preview · drag/resize)'),
    buildSheet('portrait', 'Portrait Sheet'),
  );
}

function panelStartSec(page: ComixPageSpec, panel: ComixPanelSpec, cues: Record<string, number>): number {
  try {
    return resolveTime(panel.from, cues, page.from);
  } catch {
    return page.from;
  }
}

function renderPanelSections(
  env: ComixEnv,
  page: ComixPageSpec,
  fields: Field[],
  suffix: string,
  extraTop?: HTMLElement,
): HTMLElement {
  const cues = mergedCues(env, page);
  const tl = safeTimeline(env);
  const root = h('div', {});
  if (extraTop) root.append(extraTop);
  page.panels.forEach((panel, idx) => {
    const startSec = panelStartSec(page, panel, cues);
    const jumpSec = panelVisibleJump(tl, page, panel, cues);
    const pCtx = scopedCtx(env, cues, startSec);
    const head = h(
      'div',
      { class: 'panel-sec-head' },
      h('h4', {}, `Panel ${idx + 1}: ${panel.id} — ${panel.title} (${panel.from} → ${panel.until})`),
      h(
        'button',
        { type: 'button', class: 'btn small', onclick: () => env.preview.jumpTo(jumpSec) },
        `▶ Jump ${jumpSec.toFixed(1)}s`,
      ),
    );
    const isSelPanel = env.selectedElement?.kind === 'panel' && env.selectedElement.panelId === panel.id;
    root.append(
      h(
        'section',
        { class: `panel-sec${isSelPanel ? ' is-selected' : ''}`, 'data-panel-id': panel.id },
        head,
        drawFormBlock(panel as unknown as Rec, fields, pCtx, `${page.id}.${panel.id}.${suffix}`),
      ),
    );
  });
  return root;
}

function renderJsonEditor(env: ComixEnv, key: ComixFileKey): HTMLElement {
  const entry = env.model.entry(key);
  return renderJsonFilePane({
    files: entry ? [{ key: entry.key, path: entry.path }] : [],
    initialKey: key,
    readText: (k) => {
      const cur = env.model.entry(k as ComixFileKey);
      return cur ? stringifyComixJson(cur.value) : '';
    },
    formatValue: () => {
      const cur = env.model.entry(key);
      return cur ? stringifyComixJson(cur.value) : '';
    },
    applyObject: (_k, parsed) => {
      env.model.replace(key, parsed);
      env.changed();
    },
    liveInput: true,
  });
}

function renderCheckTab(env: ComixEnv, sel: ComixSel): HTMLElement {
  const simOut = h('div', {});
  const runSim = (): void => {
    clear(simOut);
    const res = runComixSim(env.model.pack());
    const stats = h(
      'div',
      { class: 'sim-stats' },
      h('div', { class: 'sim-stat' }, h('b', {}, String(res.frames)), h('small', {}, '60fps frames')),
      h('div', { class: 'sim-stat' }, h('b', {}, String(res.panelCuts.length)), h('small', {}, 'Panel cuts')),
      h('div', { class: 'sim-stat' }, h('b', {}, String(res.snapshots.length)), h('small', {}, 'Snapshots')),
      h('div', { class: 'sim-stat' }, h('b', {}, String(res.turnsCompleted)), h('small', {}, 'Page turns')),
      h('div', { class: 'sim-stat' }, h('b', {}, String(res.beatsFired)), h('small', {}, 'Beats verified')),
      h('div', { class: 'sim-stat' }, h('b', {}, String(res.activeTracksPeak)), h('small', {}, 'Peak tracks')),
      h(
        'div',
        { class: 'sim-stat' },
        h('b', {}, res.skipStops.map((n) => (n === 'end' ? 'end' : `${n.toFixed(1)}s`)).join(' → ')),
        h('small', {}, 'Skip stops'),
      ),
    );
    const headline = h(
      'p',
      { class: res.ok ? 'ok' : 'note error' },
      res.ok
        ? `✓ Simulated ${res.durationSec}s (${res.frames} frames @ 60fps) cleanly with 0 errors`
        : `✕ Simulation found ${res.errors.length} error(s)`,
    );
    simOut.append(headline, stats);
    if (res.errors.length > 0) {
      simOut.append(
        h(
          'ul',
          { class: 'issues' },
          ...res.errors.map((e) => h('li', { class: 'error' }, `✕ ${e}`)),
        ),
      );
    }
  };

  const simBtn = h(
    'button',
    { type: 'button', class: 'btn primary', onclick: runSim },
    'Simulate 60fps Timeline',
  );
  const relevant =
    sel.target === 'manifest'
      ? env.issues
      : env.issues.filter((i) => i.where === sel.target || i.where === 'comix');

  return h(
    'div',
    {},
    h('h4', {}, `Checks (${relevant.length})`),
    h('p', { class: 'note dim' }, 'Schema validation, ModelCatalog/FxCatalog refs, panel rects, cue consistency, and timeline continuity. Click any row to jump to its form.'),
    renderIssueRows(env, relevant, true),
    h('h4', {}, '60fps Timeline Verifier'),
    h('p', { class: 'note dim' }, 'Steps through every frame, panel cut, snapshot freeze, letter window, beat, track, and skip rule on the live draft.'),
    h('div', { class: 'row' }, simBtn),
    simOut,
  );
}

export function renderComixPane(env: ComixEnv, sel: ComixSel): HTMLElement {
  if (sel.tab === 'check') return renderCheckTab(env, sel);
  if (sel.target === 'manifest') {
    if (sel.tab === 'json') return renderJsonEditor(env, 'manifest');
    const cues = mergedCues(env);
    const ctx = scopedCtx(env, cues, 0);
    const manifestRec = env.model.draft.manifest as unknown as Rec;
    const tabIssues = env.issues.filter((i) => i.where === 'comix' && i.tab === sel.tab);
    const topBanner = tabIssues.length > 0 ? renderIssueRows(env, tabIssues, false) : null;
    if (sel.tab === 'stage') {
      return h('div', {}, topBanner, drawFormBlock(manifestRec, COMIX_STAGE_FIELDS, ctx, 'manifest.stage'));
    }
    if (sel.tab === 'cast') {
      return h('div', {}, topBanner, drawFormBlock(manifestRec, COMIX_CAST_FIELDS, ctx, 'manifest.cast'));
    }
    return h('div', {}, topBanner, renderManifestPane(env));
  }

  const page = env.model.page(sel.target);
  if (!page) return h('p', { class: 'note' }, 'Select a page or Comix & Stage from the sidebar.');
  if (sel.tab === 'json') return renderJsonEditor(env, `page:${page.id}`);

  const cues = mergedCues(env, page);
  const pageCtx = scopedCtx(env, cues, page.from);
  const pageIssues = env.issues.filter((i) => i.where === page.id && i.tab === sel.tab);
  const banner = pageIssues.length > 0 ? renderIssueRows(env, pageIssues, false) : null;

  if (sel.tab === 'panels') {
    return h(
      'div',
      {},
      banner,
      renderLayoutMap(env, page),
      drawFormBlock(page as unknown as Rec, PAGE_PANELS_FIELDS, pageCtx, `${page.id}.panels`),
    );
  }
  if (sel.tab === 'letters') {
    return h('div', {}, banner, renderPanelSections(env, page, [PANEL_LETTERS_FIELD], 'letters'));
  }
  if (sel.tab === 'beats') {
    const pageWide = h(
      'section',
      { class: 'panel-sec' },
      h(
        'div',
        { class: 'panel-sec-head' },
        h('h4', {}, `Page-Wide Continuous Tracks (${page.from}s → ${page.until}s)`),
      ),
      drawFormBlock(page as unknown as Rec, [PAGE_TRACKS_FIELD], pageCtx, `${page.id}.tracks`),
    );
    return h(
      'div',
      {},
      banner,
      renderPanelSections(env, page, [PANEL_BEATS_FIELD, PANEL_TRACKS_FIELD], 'beats', pageWide),
    );
  }
  return h(
    'div',
    {},
    banner,
    h('p', { class: 'note dim' }, `Page ${page.index + 1} (${page.id}) · file pages/${page.id}/page.spec.json`),
    drawFormBlock(page as unknown as Rec, PAGE_OVERVIEW_FIELDS, pageCtx, `${page.id}.overview`),
  );
}
