import { resolveTime } from '../cinematic/expr.js';
import type { ComixElementRef } from '../cinematic/editor-select.js';
import type {
  ComixPack,
  ComixPageSpec,
  ComixPanelSpec,
  PanelBeat,
  PanelLetter,
  SceneTrack,
  TimeExpr,
} from '../cinematic/spec-types.js';
import { compileTimeline, visiblePanelStart } from '../cinematic/timeline.js';

export interface ElementRoute {
  target: string;
  tab: string;
  openPaths: string[];
}

const cssEsc = (v: string): string =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(v) : v.replace(/"/g, '\\"');

function mergedCues(pack: ComixPack, page?: ComixPageSpec): Record<string, number> {
  return { ...(pack.manifest.cues ?? {}), ...(page?.cues ?? {}) };
}

function findPageForRef(pack: ComixPack, pageId?: string, panelId?: string): ComixPageSpec | undefined {
  if (pageId) {
    const direct = pack.pages.find((p) => p.id === pageId);
    if (direct) return direct;
  }
  if (panelId) return pack.pages.find((p) => p.panels.some((pn) => pn.id === panelId));
  return undefined;
}

function findPanelInPage(page: ComixPageSpec | undefined, panelId?: string, panelIndex?: number): ComixPanelSpec | undefined {
  if (!page) return undefined;
  if (panelId) {
    const byId = page.panels.find((p) => p.id === panelId);
    if (byId) return byId;
  }
  return panelIndex !== undefined ? page.panels[panelIndex] : undefined;
}

function pageItemRoute(pack: ComixPack, ref: ComixElementRef, tab: string, field: string): ElementRoute {
  const page = findPageForRef(pack, ref.pageId) ?? pack.pages[0];
  const idx = ref.itemIndex ?? 0;
  return { target: page?.id ?? 'manifest', tab, openPaths: page ? [`${page.id}.${tab}.${field}[${idx}]`] : [] };
}

function matchPageIndexed(pack: ComixPack, itemPath: string, re: RegExp): { pageId: string; idx: number; page?: ComixPageSpec } | null {
  const m = itemPath.match(re);
  if (!m) return null;
  const pageId = m[1]!;
  return { pageId, idx: Number(m[2]), page: pack.pages.find((p) => p.id === pageId) };
}

/** Map a selected Comix element to the Inspector target (`manifest` or pageId), tab, and open `<details>` paths. */
export function routeForElement(pack: ComixPack, ref: ComixElementRef): ElementRoute {
  switch (ref.kind) {
    case 'actor': {
      const idx = ref.actorId ? pack.manifest.cast.findIndex((a) => a.id === ref.actorId) : (ref.itemIndex ?? 0);
      return { target: 'manifest', tab: 'cast', openPaths: idx >= 0 ? [`manifest.cast.cast[${idx}]`] : [] };
    }
    case 'prop': {
      const props = pack.manifest.stage.props ?? [];
      const idx = ref.propId ? props.findIndex((p) => p.id === ref.propId) : (ref.itemIndex ?? 0);
      return { target: 'manifest', tab: 'stage', openPaths: idx >= 0 ? [`manifest.stage.stage.props[${idx}]`] : [] };
    }
    case 'fixture': {
      const fixtures = pack.manifest.stage.fixtures ?? [];
      const idx = ref.fixtureId ? fixtures.findIndex((f) => f.id === ref.fixtureId) : (ref.itemIndex ?? 0);
      return { target: 'manifest', tab: 'stage', openPaths: idx >= 0 ? [`manifest.stage.stage.fixtures[${idx}]`] : [] };
    }
    case 'point':
      return {
        target: 'manifest',
        tab: 'stage',
        openPaths: ref.pointId ? [`manifest.stage.stage.points.${ref.pointId}`] : [],
      };
    case 'overlay':
      return pageItemRoute(pack, ref, 'overview', 'overlays');
    case 'panel': {
      const page = findPageForRef(pack, ref.pageId, ref.panelId) ?? pack.pages[0];
      const idx =
        ref.panelIndex ??
        (page && ref.panelId ? page.panels.findIndex((p) => p.id === ref.panelId) : 0);
      return {
        target: page?.id ?? 'manifest',
        tab: 'panels',
        openPaths: page && idx >= 0 ? [`${page.id}.panels.panels[${idx}]`] : [],
      };
    }
    case 'letter':
    case 'beat':
    case 'track': {
      const page = findPageForRef(pack, ref.pageId, ref.panelId) ?? pack.pages[0];
      const panel = findPanelInPage(page, ref.panelId, ref.panelIndex);
      const tab = ref.kind === 'letter' ? 'letters' : 'beats';
      const field = ref.kind === 'letter' ? 'letters' : ref.kind === 'beat' ? 'beats' : 'tracks';
      const idx = ref.itemIndex ?? 0;
      return {
        target: page?.id ?? 'manifest',
        tab,
        openPaths: page && panel ? [`${page.id}.${panel.id}.${tab}.${field}[${idx}]`] : [],
      };
    }
    case 'page_track':
      return pageItemRoute(pack, ref, 'tracks', 'tracks');
  }
}

function pointIdOf(pack: ComixPack, ref: unknown): string | undefined {
  return typeof ref === 'string' && ref in pack.manifest.stage.points ? ref : undefined;
}

function targetRefsOfTrack(pack: ComixPack, tr: SceneTrack | undefined): Partial<ComixElementRef> {
  if (!tr) return {};
  if ('actor' in tr) return { actorId: tr.actor };
  if (tr.kind === 'fixture') return { fixtureId: tr.fixture };
  if (tr.kind === 'stage_light') return { pointId: pointIdOf(pack, tr.anchor) };
  if ('target' in tr) {
    if (pack.manifest.cast.some((a) => a.id === tr.target)) return { actorId: tr.target };
    if ((pack.manifest.stage.props ?? []).some((p) => p.id === tr.target)) return { propId: tr.target };
  }
  return {};
}

function targetRefsOfBeat(pack: ComixPack, beat: PanelBeat | undefined): Partial<ComixElementRef> {
  if (!beat) return {};
  if ('actors' in beat && beat.actors.length > 0) return { actorId: beat.actors[0] };
  if ('point' in beat) return { pointId: pointIdOf(pack, beat.point) };
  if (beat.kind === 'arc') return { pointId: pointIdOf(pack, beat.from) ?? pointIdOf(pack, beat.to) };
  return {};
}

function targetRefsOfLetter(pack: ComixPack, letter: PanelLetter | undefined): Partial<ComixElementRef> {
  if (!letter) return {};
  if (letter.kind === 'bubble') {
    return {
      actorId: letter.tailActor,
      pointId: pointIdOf(pack, letter.tailPoint),
    };
  }
  if ('point' in letter && letter.point !== undefined) return { pointId: pointIdOf(pack, letter.point) };
  return {};
}

function enclosingElementPath(itemPath: string): string {
  const m = itemPath.match(/^(.+?\.(?:cast|props|fixtures|overlays|panels|letters|beats|tracks)\[\d+\])/);
  return m ? m[1]! : itemPath;
}

/** Resolve an Inspector form `itemPath` to a structured `ComixElementRef` (or `null` if non-element). */
export function resolveSelectionFromPath(pack: ComixPack, rawPath: string): ComixElementRef | null {
  const itemPath = enclosingElementPath(rawPath);

  let m = itemPath.match(/^manifest\.cast\.cast\[(\d+)\]$/);
  if (m) {
    const idx = Number(m[1]);
    const actor = pack.manifest.cast[idx];
    return { kind: 'actor', itemPath, itemIndex: idx, actorId: actor?.id, label: `actor:${actor?.id ?? idx}` };
  }

  m = itemPath.match(/^manifest\.stage\.stage\.props\[(\d+)\]$/);
  if (m) {
    const idx = Number(m[1]);
    const prop = pack.manifest.stage.props?.[idx];
    return { kind: 'prop', itemPath, itemIndex: idx, propId: prop?.id, label: `prop:${prop?.id ?? idx}` };
  }

  m = itemPath.match(/^manifest\.stage\.stage\.fixtures\[(\d+)\]$/);
  if (m) {
    const idx = Number(m[1]);
    const fx = pack.manifest.stage.fixtures?.[idx];
    return { kind: 'fixture', itemPath, itemIndex: idx, fixtureId: fx?.id, label: `fixture:${fx?.id ?? idx}` };
  }

  m = itemPath.match(/^manifest\.stage\.stage\.points\.([^.\[\]]+)$/);
  if (m) {
    const pointId = m[1]!;
    return { kind: 'point', itemPath, pointId, label: `point:${pointId}` };
  }

  const ovHit = matchPageIndexed(pack, itemPath, /^([^.]+)\.overview\.overlays\[(\d+)\]$/);
  if (ovHit) {
    const ov = ovHit.page?.overlays?.[ovHit.idx];
    return {
      kind: 'overlay',
      itemPath,
      pageId: ovHit.pageId,
      itemIndex: ovHit.idx,
      label: `overlay:${ov?.kind ?? 'title_card'}`,
    };
  }

  const panelHit = matchPageIndexed(pack, itemPath, /^([^.]+)\.panels\.panels\[(\d+)\]$/);
  if (panelHit) {
    const panel = panelHit.page?.panels[panelHit.idx];
    return {
      kind: 'panel',
      itemPath,
      pageId: panelHit.pageId,
      panelId: panel?.id,
      panelIndex: panelHit.idx,
      label: `panel:${panel?.id ?? panelHit.idx}`,
    };
  }

  const trHit = matchPageIndexed(pack, itemPath, /^([^.]+)\.tracks\.tracks\[(\d+)\]$/);
  if (trHit) {
    const tr = trHit.page?.tracks?.[trHit.idx];
    return {
      kind: 'page_track',
      itemPath,
      pageId: trHit.pageId,
      itemIndex: trHit.idx,
      label: `page-track:${tr?.kind ?? trHit.idx}`,
      ...targetRefsOfTrack(pack, tr),
    };
  }

  m = itemPath.match(/^([^.]+)\.([^.]+)\.(letters|beats)\.(letters|beats|tracks)\[(\d+)\]$/);
  if (m) {
    const [, pageId, panelId, , field, idxStr] = m as [string, string, string, string, string, string];
    const idx = Number(idxStr);
    const page = pack.pages.find((p) => p.id === pageId);
    const panelIndex = page ? page.panels.findIndex((p) => p.id === panelId) : -1;
    const panel = panelIndex >= 0 ? page!.panels[panelIndex] : undefined;
    if (field === 'letters') {
      const letter = panel?.letters?.[idx];
      return {
        kind: 'letter',
        itemPath,
        pageId,
        panelId,
        panelIndex,
        itemIndex: idx,
        label: `letter:${letter?.kind ?? idx}`,
        ...targetRefsOfLetter(pack, letter),
      };
    }
    if (field === 'beats') {
      const beat = panel?.beats?.[idx];
      return {
        kind: 'beat',
        itemPath,
        pageId,
        panelId,
        panelIndex,
        itemIndex: idx,
        label: `beat:${beat?.kind ?? idx}`,
        ...targetRefsOfBeat(pack, beat),
      };
    }
    const tr = panel?.tracks?.[idx];
    return {
      kind: 'track',
      itemPath,
      pageId,
      panelId,
      panelIndex,
      itemIndex: idx,
      label: `track:${tr?.kind ?? idx}`,
      ...targetRefsOfTrack(pack, tr),
    };
  }

  return null;
}

function safeResolveTime(expr: TimeExpr | undefined, base: number, cues: Record<string, number>, fallback: number): number {
  if (expr === undefined) return fallback;
  try {
    return resolveTime(expr, cues, base);
  } catch {
    return fallback;
  }
}

function letterWindow(
  pack: ComixPack,
  page: ComixPageSpec,
  panel: ComixPanelSpec,
  letter: PanelLetter,
): [number, number] {
  const cues = mergedCues(pack, page);
  const pFrom = safeResolveTime(panel.from, page.from, cues, page.from);
  const pUntil = Math.min(page.until, safeResolveTime(panel.until, page.from, cues, page.until));
  switch (letter.kind) {
    case 'caption':
      return [
        safeResolveTime(letter.from, pFrom, cues, pFrom),
        letter.until ? safeResolveTime(letter.until, pFrom, cues, pUntil) : pUntil,
      ];
    case 'banner':
    case 'bubble':
    case 'label_tag':
      return [
        safeResolveTime(letter.at, pFrom, cues, pFrom),
        letter.until ? safeResolveTime(letter.until, pFrom, cues, pUntil) : pUntil,
      ];
    case 'sfx': {
      const from = safeResolveTime(letter.at, pFrom, cues, pFrom);
      return [from, Math.min(page.until, from + Math.max(0.05, letter.hold))];
    }
    case 'sfx_seq': {
      const from = safeResolveTime(letter.from, pFrom, cues, pFrom);
      const count = Math.max(1, letter.words.length);
      const dur = (count - 1) * letter.step + (letter.lastHold ?? letter.hold);
      return [from, Math.min(page.until, from + Math.max(0.05, dur))];
    }
    case 'prompt_list':
    case 'glitch_text':
    case 'tier_stack': {
      const from = safeResolveTime(letter.from, pFrom, cues, pFrom);
      const step = 'every' in letter ? letter.every : letter.step;
      return [from + Math.min(0.05, step * 0.5), pUntil];
    }
    case 'panel_flash': {
      const from = safeResolveTime(letter.at, pFrom, cues, pFrom);
      return [from, Math.min(page.until, from + Math.max(0.05, letter.dur))];
    }
    case 'invert': {
      const at = safeResolveTime(letter.at, pFrom, cues, pFrom);
      return [at + letter.fromOffset, at + letter.toOffset];
    }
    case 'stats_card':
      return [safeResolveTime(letter.at, pFrom, cues, pFrom), page.until];
  }
}

function windowMid(from: number, until: number): number {
  const hi = Math.max(from + 0.02, until - 0.02);
  return Math.min(hi, from + Math.min(0.25, Math.max(0.05, (hi - from) * 0.35)));
}

function jumpIfOutside(from: number, until: number, cur: number, exactAt?: number): number | null {
  const lo = from + 0.01;
  const hi = Math.max(lo, until - 0.02);
  if (cur >= from - 0.001 && cur <= hi + 0.001) return null;
  if (exactAt !== undefined && exactAt >= from && exactAt <= hi + 0.02) return exactAt;
  return windowMid(from, Math.max(from + 0.08, until));
}

function firstVisibleStageSec(pack: ComixPack): number {
  const first = pack.pages[0];
  if (!first) return 0.1;
  try {
    return visiblePanelStart(compileTimeline(pack), first.index, first.from, first.until);
  } catch {
    return first.from + 0.1;
  }
}

/**
 * If an element selected in the Inspector is not visible at `currentSec`, return a timestamp inside its active
 * visibility window so the viewport can seek to show and highlight it; returns `null` if already visible.
 */
export function visibilityJumpForElement(pack: ComixPack, ref: ComixElementRef, currentSec: number): number | null {
  if (ref.kind === 'prop' || ref.kind === 'fixture' || ref.kind === 'point' || ref.kind === 'actor') {
    if (ref.kind === 'actor' && ref.actorId) {
      const actor = pack.manifest.cast.find((a) => a.id === ref.actorId);
      if (actor && actor.visible === false) {
        for (const page of pack.pages) {
          const cues = mergedCues(pack, page);
          for (const panel of page.panels) {
            const pFrom = safeResolveTime(panel.from, page.from, cues, page.from);
            const pUntil = Math.min(page.until, safeResolveTime(panel.until, page.from, cues, page.until));
            for (const tr of panel.tracks ?? []) {
              if (tr.kind === 'actor_visibility' && tr.actor === actor.id && tr.visible) {
                const from = safeResolveTime(tr.from, pFrom, cues, pFrom);
                const until = tr.until ? safeResolveTime(tr.until, pFrom, cues, pUntil) : page.until;
                return jumpIfOutside(from, until, currentSec);
              }
            }
          }
        }
      }
    }
    const onAnyPage = pack.pages.some((p) => currentSec >= p.from && currentSec < p.until - 0.01);
    return onAnyPage ? null : firstVisibleStageSec(pack);
  }

  const page = findPageForRef(pack, ref.pageId, ref.panelId);
  if (!page) return null;
  const cues = mergedCues(pack, page);

  if (ref.kind === 'overlay') {
    const ov = page.overlays?.[ref.itemIndex ?? 0];
    if (!ov) return jumpIfOutside(page.from, page.until, currentSec);
    const from = safeResolveTime(ov.at, page.from, cues, page.from);
    const fadeFrom = safeResolveTime(ov.fadeFrom, page.from, cues, page.until);
    const fadeTo = safeResolveTime(ov.fadeTo, page.from, cues, page.until);
    const bestFrom = Math.min(fadeFrom, from + 0.3);
    if (currentSec >= from + 0.02 && currentSec <= Math.max(from + 0.05, fadeTo - 0.04)) return null;
    return windowMid(bestFrom, Math.max(bestFrom + 0.1, fadeFrom));
  }

  if (ref.kind === 'page_track') {
    const tr = page.tracks?.[ref.itemIndex ?? 0];
    if (!tr) return jumpIfOutside(page.from, page.until, currentSec);
    const from = 'from' in tr ? safeResolveTime(tr.from, page.from, cues, page.from) : page.from;
    const until = 'until' in tr && tr.until ? safeResolveTime(tr.until, page.from, cues, page.until) : page.until;
    return jumpIfOutside(from, until, currentSec);
  }

  const panel = findPanelInPage(page, ref.panelId, ref.panelIndex);
  if (!panel) return jumpIfOutside(page.from, page.until, currentSec);
  const pFrom = safeResolveTime(panel.from, page.from, cues, page.from);
  const pUntil = Math.min(page.until, safeResolveTime(panel.until, page.from, cues, page.until));

  if (ref.kind === 'panel') {
    return jumpIfOutside(pFrom, page.until, currentSec, Math.min(page.until - 0.02, pFrom + 0.08));
  }

  if (ref.kind === 'letter') {
    const letter = panel.letters?.[ref.itemIndex ?? 0];
    if (!letter) return jumpIfOutside(pFrom, pUntil, currentSec);
    const [from, until] = letterWindow(pack, page, panel, letter);
    return jumpIfOutside(from, Math.max(from + 0.06, until), currentSec);
  }

  if (ref.kind === 'beat') {
    const beat = panel.beats?.[ref.itemIndex ?? 0];
    if (!beat) return jumpIfOutside(pFrom, pUntil, currentSec);
    const from = 'at' in beat ? safeResolveTime(beat.at, pFrom, cues, pFrom) : safeResolveTime(beat.from, pFrom, cues, pFrom);
    const until = 'until' in beat ? safeResolveTime(beat.until, pFrom, cues, pUntil) : pUntil;
    return jumpIfOutside(from, Math.max(from + 0.06, until), currentSec);
  }

  const tr = panel.tracks?.[ref.itemIndex ?? 0];
  if (!tr) return jumpIfOutside(pFrom, pUntil, currentSec);
  const from = 'from' in tr ? safeResolveTime(tr.from, pFrom, cues, pFrom) : pFrom;
  const until = 'until' in tr && tr.until ? safeResolveTime(tr.until, pFrom, cues, pUntil) : pUntil;
  return jumpIfOutside(from, Math.max(from + 0.06, until), currentSec);
}

/** Update `.is-selected` markers and open state inside the Inspector DOM without rebuilding form inputs. */
export function syncInspectorSelectionDom(
  paneEl: HTMLElement,
  selected: ComixElementRef | null,
  scrollIntoView = false,
): void {
  const selectedPath = selected?.itemPath ?? null;
  let activeDetails: HTMLDetailsElement | null = null;
  for (const el of paneEl.querySelectorAll<HTMLDetailsElement>('details[data-item-path]')) {
    const match = selectedPath !== null && el.dataset.itemPath === selectedPath;
    el.classList.toggle('is-selected', match);
    if (match) {
      el.open = true;
      activeDetails = el;
    }
  }
  const activePanelId = selected?.panelId ?? null;
  for (const sec of paneEl.querySelectorAll<HTMLElement>('.panel-sec[data-panel-id]')) {
    sec.classList.toggle('is-selected', selected?.kind === 'panel' && sec.dataset.panelId === activePanelId);
  }
  for (const box of paneEl.querySelectorAll<HTMLElement>('.layout-box[data-panel-id]')) {
    box.classList.toggle('is-selected', activePanelId !== null && box.dataset.panelId === activePanelId);
  }
  if (scrollIntoView && activeDetails) {
    activeDetails.scrollIntoView({ block: 'nearest' });
  } else if (scrollIntoView && selectedPath) {
    const fallback = paneEl.querySelector<HTMLElement>(`[data-item-path="${cssEsc(selectedPath)}"]`);
    fallback?.scrollIntoView({ block: 'nearest' });
  }
}
