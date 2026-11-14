import { isRec } from '../editor-core/dom.js';
import { objectShape } from '../editor-core/schema-check.js';
import { cssHex, resolvePoint, resolveTime } from '../cinematic/expr.js';
import { simulateComixPack, type ComixSimResult } from '../cinematic/simulate.js';
import type { ComixPack, ComixPageSpec, PointRef, Rect4, Vec3 } from '../cinematic/spec-types.js';
import { ANIM_STATE_IDS } from '../procgen/anim/states.js';
import { ZONE_IDS } from '../procgen/core/palette.js';
import { FxCatalog, ModelCatalog } from '../procgen/index.js';
import { ALL_MANIFEST_FIELDS, ALL_PAGE_FIELDS } from './schema.js';

export interface ComixIssue {
  severity: 'error' | 'warn';
  where: string;
  tab: string;
  message: string;
}

function pageTabOf(message: string): string {
  if (message.includes('.letters')) return 'letters';
  if (message.includes('.beats') || message.includes('.tracks')) return 'beats';
  if (message.includes('.panels')) return 'panels';
  return 'overview';
}

function manifestTabOf(message: string): string {
  if (message.startsWith('manifest.stage')) return 'stage';
  if (message.startsWith('manifest.cast')) return 'cast';
  return 'manifest';
}

function checkRect(out: ComixIssue[], where: string, label: string, rect: unknown): void {
  if (!Array.isArray(rect) || rect.length !== 4 || rect.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
    out.push({ severity: 'error', where, tab: 'panels', message: `${label}: expected [x, y, w, h] numbers` });
    return;
  }
  const [x, y, w, h] = rect as Rect4;
  if (x < -1e-6 || y < -1e-6 || w <= 0 || h <= 0 || x + w > 1.001 || y + h > 1.001) {
    out.push({ severity: 'error', where, tab: 'panels', message: `${label}: [${x}, ${y}, ${w}, ${h}] must fit inside 0..1 with w,h > 0` });
  }
}

function checkSkipAndHold(out: ComixIssue[], pack: ComixPack, cues: Record<string, number>): void {
  if (pack.manifest.acceptsKeyFrom !== undefined) {
    if (!pack.manifest.holdAtEnd) {
      out.push({ severity: 'warn', where: 'comix', tab: 'manifest', message: 'manifest.acceptsKeyFrom has no effect unless holdAtEnd is true' });
    }
    try {
      resolveTime(pack.manifest.acceptsKeyFrom, cues, 0);
    } catch (err) {
      out.push({ severity: 'error', where: 'comix', tab: 'manifest', message: `manifest.acceptsKeyFrom: ${(err as Error).message}` });
    }
  }
  const skip = pack.manifest.skip;
  if (skip === 'end') return;
  if (!Array.isArray(skip)) {
    out.push({ severity: 'error', where: 'comix', tab: 'manifest', message: 'manifest.skip: expected "end" or a list of {before, to} rules' });
    return;
  }
  skip.forEach((rule, i) => {
    if (!isRec(rule) || typeof rule.before !== 'string' || typeof rule.to !== 'string') {
      out.push({ severity: 'error', where: 'comix', tab: 'manifest', message: `manifest.skip[${i}]: expected {before, to} strings` });
      return;
    }
    try {
      const b = resolveTime(rule.before, cues, 0);
      const dest = resolveTime(rule.to, cues, 0);
      if (dest < b) {
        out.push({ severity: 'warn', where: 'comix', tab: 'manifest', message: `manifest.skip[${i}]: target ${rule.to} (${dest}s) is earlier than before ${rule.before} (${b}s)` });
      }
    } catch (err) {
      out.push({ severity: 'error', where: 'comix', tab: 'manifest', message: `manifest.skip[${i}]: ${(err as Error).message}` });
    }
  });
}

function pushEvalErr(out: ComixIssue[], where: string, tab: string, label: string, run: () => void): void {
  try {
    run();
  } catch (err) {
    out.push({ severity: 'error', where, tab, message: `${label}: ${(err as Error).message}` });
  }
}

function pushPointErr(
  out: ComixIssue[],
  where: string,
  tab: string,
  label: string,
  ref: PointRef | undefined,
  points: Record<string, Vec3>,
): void {
  if (ref !== undefined) pushEvalErr(out, where, tab, label, () => resolvePoint(ref, points));
}

function pushHexErr(out: ComixIssue[], where: string, tab: string, label: string, hex: string | undefined): void {
  if (hex !== undefined) pushEvalErr(out, where, tab, label, () => cssHex(hex));
}

function checkCatalogRefs(out: ComixIssue[], pack: ComixPack): void {
  const { stage, cast } = pack.manifest;
  const points = stage?.points ?? {};
  if (stage?.room && !ModelCatalog.has(stage.room)) {
    out.push({ severity: 'error', where: 'comix', tab: 'stage', message: `stage.room "${stage.room}" is not in ModelCatalog` });
  }
  pushHexErr(out, 'comix', 'stage', 'stage.background', stage?.background);
  const propIds = new Set<string>();
  for (const prop of stage?.props ?? []) {
    if (propIds.has(prop.id)) {
      out.push({ severity: 'error', where: 'comix', tab: 'stage', message: `duplicate stage prop id "${prop.id}"` });
    }
    propIds.add(prop.id);
    if (!ModelCatalog.has(prop.model)) {
      out.push({ severity: 'error', where: 'comix', tab: 'stage', message: `stage.props "${prop.id}" uses unknown model "${prop.model}"` });
    }
    pushPointErr(out, 'comix', 'stage', `stage.props.${prop.id}`, prop.at, points);
  }
  const actorIds = new Set<string>();
  for (const actor of cast ?? []) {
    if (actorIds.has(actor.id)) {
      out.push({ severity: 'error', where: 'comix', tab: 'cast', message: `duplicate cast actor id "${actor.id}"` });
    }
    actorIds.add(actor.id);
    if (!ModelCatalog.has(actor.model)) {
      out.push({ severity: 'error', where: 'comix', tab: 'cast', message: `cast actor "${actor.id}" uses unknown model "${actor.model}"` });
    }
    pushPointErr(out, 'comix', 'cast', `cast.${actor.id}`, actor.at, points);
  }
  const fixtureIds = new Set<string>();
  for (const fx of stage?.fixtures ?? []) {
    if (fixtureIds.has(fx.id)) {
      out.push({ severity: 'error', where: 'comix', tab: 'stage', message: `duplicate stage fixture id "${fx.id}"` });
    }
    fixtureIds.add(fx.id);
    if (fx.kind === 'bolt') {
      pushPointErr(out, 'comix', 'stage', `stage.fixtures.${fx.id}`, fx.from, points);
      pushPointErr(out, 'comix', 'stage', `stage.fixtures.${fx.id}`, fx.to, points);
    } else if (fx.kind === 'vortex') {
      pushPointErr(out, 'comix', 'stage', `stage.fixtures.${fx.id}`, fx.at, points);
    }
  }
  for (const page of pack.pages) {
    checkPageRefs(out, page, actorIds, fixtureIds, points);
  }
}

function checkPageRefs(
  out: ComixIssue[],
  page: ComixPageSpec,
  actorIds: Set<string>,
  fixtureIds: Set<string>,
  points: Record<string, Vec3>,
): void {
  const checkTrackList = (owner: string, tracks: ComixPageSpec['tracks']): void => {
    for (const tr of tracks ?? []) {
      if ('actor' in tr && !actorIds.has(tr.actor)) {
        out.push({ severity: 'error', where: page.id, tab: 'beats', message: `${owner}: track "${tr.kind}" references unknown actor "${tr.actor}"` });
      }
      if (tr.kind === 'fixture' && !fixtureIds.has(tr.fixture)) {
        out.push({ severity: 'error', where: page.id, tab: 'beats', message: `${owner}: fixture track references unknown fixture "${tr.fixture}"` });
      }
      if ((tr.kind === 'part_visibility' || tr.kind === 'material_tint') && tr.target !== 'room' && !actorIds.has(tr.target)) {
        out.push({ severity: 'error', where: page.id, tab: 'beats', message: `${owner}: track "${tr.kind}" references unknown target "${tr.target}"` });
      }
      if (tr.kind === 'material_tint') {
        if (!(ZONE_IDS as readonly string[]).includes(tr.zone)) {
          out.push({ severity: 'error', where: page.id, tab: 'beats', message: `${owner}: material_tint zone "${tr.zone}" is not a palette ZoneId` });
        }
        pushHexErr(out, page.id, 'beats', `${owner}.material_tint.color`, tr.color);
        for (const c of tr.glitchColors ?? []) pushHexErr(out, page.id, 'beats', `${owner}.material_tint.glitchColors`, c);
      }
      if (tr.kind === 'actor_motion') {
        pushPointErr(out, page.id, 'beats', owner, tr.fromPos, points);
        pushPointErr(out, page.id, 'beats', owner, tr.toPos, points);
      } else if (tr.kind === 'stage_light') {
        pushPointErr(out, page.id, 'beats', owner, tr.anchor, points);
      }
    }
  };
  checkTrackList(page.id, page.tracks);
  for (const panel of page.panels ?? []) {
    checkTrackList(panel.id, panel.tracks);
    for (const beat of panel.beats ?? []) {
      if ((beat.kind === 'fx' || beat.kind === 'fx_repeat') && !FxCatalog.has(beat.preset)) {
        out.push({ severity: 'error', where: page.id, tab: 'beats', message: `${panel.id}: unknown FX preset "${beat.preset}"` });
      }
      if ((beat.kind === 'look' || beat.kind === 'state') && Array.isArray(beat.actors)) {
        for (const a of beat.actors) {
          if (!actorIds.has(a)) {
            out.push({ severity: 'error', where: page.id, tab: 'beats', message: `${panel.id}: beat "${beat.kind}" references unknown actor "${a}"` });
          }
        }
      }
      if (beat.kind === 'state' && !(ANIM_STATE_IDS as readonly string[]).includes(beat.state)) {
        out.push({ severity: 'error', where: page.id, tab: 'beats', message: `${panel.id}: beat.state "${beat.state}" is not a valid AnimState` });
      }
      if (beat.kind === 'lightning' || beat.kind === 'fx' || beat.kind === 'fx_repeat') {
        pushPointErr(out, page.id, 'beats', panel.id, beat.point, points);
      } else if (beat.kind === 'arc') {
        pushPointErr(out, page.id, 'beats', panel.id, beat.from, points);
        pushPointErr(out, page.id, 'beats', panel.id, beat.to, points);
      }
    }
    checkPanelLetters(out, page.id, panel.id, panel.letters, actorIds, points);
  }
}

function checkPanelLetters(
  out: ComixIssue[],
  pageId: string,
  panelId: string,
  letters: ComixPageSpec['panels'][number]['letters'] | undefined,
  actorIds: Set<string>,
  points: Record<string, Vec3>,
): void {
  for (const letter of letters ?? []) {
    if (letter.kind === 'bubble') {
      if (letter.tailActor && !actorIds.has(letter.tailActor)) {
        out.push({ severity: 'error', where: pageId, tab: 'letters', message: `${panelId}: bubble tailActor "${letter.tailActor}" is unknown` });
      }
      if (letter.anchor === 'world' && letter.tailPoint === undefined) {
        out.push({ severity: 'error', where: pageId, tab: 'letters', message: `${panelId}: bubble with anchor "world" requires tailPoint` });
      }
      pushHexErr(out, pageId, 'letters', `${panelId}.bubble.fill`, letter.fill);
      pushPointErr(out, pageId, 'letters', panelId, letter.tailPoint, points);
    } else if (letter.kind === 'sfx') {
      pushHexErr(out, pageId, 'letters', `${panelId}.sfx.color`, letter.color);
      if (letter.anchor === 'point') {
        if (letter.point === undefined) {
          out.push({ severity: 'error', where: pageId, tab: 'letters', message: `${panelId}: sfx with anchor "point" requires point` });
        } else {
          pushPointErr(out, pageId, 'letters', panelId, letter.point, points);
        }
      }
    } else if (letter.kind === 'sfx_seq') {
      pushHexErr(out, pageId, 'letters', `${panelId}.sfx_seq.color`, letter.color);
      pushPointErr(out, pageId, 'letters', panelId, letter.point, points);
    } else if (letter.kind === 'label_tag') {
      pushPointErr(out, pageId, 'letters', panelId, letter.point, points);
    } else if (letter.kind === 'stats_card') {
      pushHexErr(out, pageId, 'letters', `${panelId}.stats_card.fallbackBackground`, letter.fallbackBackground);
    }
  }
}

function checkTrackWindows(
  out: ComixIssue[],
  pack: ComixPack,
  page: ComixPageSpec,
  pageCues: Record<string, number>,
  isLastPage: boolean,
): void {
  const allowOpenEnd = isLastPage && Boolean(pack.manifest.holdAtEnd);
  const checkOne = (owner: string, baseTime: number, tracks: ComixPageSpec['tracks']): void => {
    for (const tr of tracks ?? []) {
      try {
        const from = resolveTime(tr.from, pageCues, baseTime);
        const until = 'until' in tr && tr.until !== undefined ? resolveTime(tr.until, pageCues, baseTime) : undefined;
        if (from < page.from - 1e-6) {
          out.push({ severity: 'warn', where: page.id, tab: 'beats', message: `${owner}: track "${tr.kind}" starts at ${from}s before page start (${page.from}s)` });
        }
        if (!allowOpenEnd) {
          if (until === undefined) {
            out.push({ severity: 'warn', where: page.id, tab: 'beats', message: `${owner}: track "${tr.kind}" has no "until" and leaks past page end (${page.until}s)` });
          } else if (until > page.until + 1e-6) {
            out.push({ severity: 'warn', where: page.id, tab: 'beats', message: `${owner}: track "${tr.kind}" until (${until}s) leaks past page end (${page.until}s)` });
          }
        }
      } catch {
        // Invalid time expressions are reported by simulateComixPack.
      }
    }
  };
  checkOne(page.id, page.from, page.tracks);
  for (const panel of page.panels ?? []) {
    try {
      checkOne(panel.id, resolveTime(panel.from, pageCues, page.from), panel.tracks);
    } catch {
      // Handled in checkPageTimeline.
    }
  }
}

function checkTurnAndOverlays(out: ComixIssue[], page: ComixPageSpec, pageCues: Record<string, number>): void {
  if (page.turn) {
    try {
      const tf = resolveTime(page.turn.from, pageCues, page.from);
      const tt = resolveTime(page.turn.to, pageCues, page.from);
      if (!(tt > tf)) {
        out.push({ severity: 'error', where: page.id, tab: 'overview', message: `turn [${tf}..${tt}] must have to > from` });
      }
    } catch (err) {
      out.push({ severity: 'error', where: page.id, tab: 'overview', message: `turn: ${(err as Error).message}` });
    }
  }
  (page.overlays ?? []).forEach((ov, i) => {
    try {
      resolveTime(ov.at, pageCues, page.from);
      const ty0 = resolveTime(ov.typeFrom, pageCues, page.from);
      const ty1 = resolveTime(ov.typeTo, pageCues, page.from);
      const fd0 = resolveTime(ov.fadeFrom, pageCues, page.from);
      const fd1 = resolveTime(ov.fadeTo, pageCues, page.from);
      if (ty1 < ty0) out.push({ severity: 'error', where: page.id, tab: 'overview', message: `overlays[${i}]: typeTo (${ty1}s) < typeFrom (${ty0}s)` });
      if (!(fd1 > fd0)) out.push({ severity: 'error', where: page.id, tab: 'overview', message: `overlays[${i}]: fadeTo (${fd1}s) must be > fadeFrom (${fd0}s)` });
    } catch (err) {
      out.push({ severity: 'error', where: page.id, tab: 'overview', message: `overlays[${i}]: ${(err as Error).message}` });
    }
  });
}

function checkShotDims(out: ComixIssue[], pageId: string, label: string, shot: { w?: number; h?: number } | undefined): void {
  if (!shot) return;
  if (!(typeof shot.w === 'number' && shot.w > 0 && typeof shot.h === 'number' && shot.h > 0)) {
    out.push({ severity: 'error', where: pageId, tab: 'panels', message: `${label}: shot w and h must be > 0` });
  }
}

function checkPageTimeline(
  out: ComixIssue[],
  pack: ComixPack,
  page: ComixPageSpec,
  rootCues: Record<string, number>,
  isLastPage: boolean,
): void {
  if (!(page.until > page.from)) {
    out.push({ severity: 'error', where: page.id, tab: 'overview', message: `page window [${page.from}..${page.until}] must have until > from` });
  }
  const pageCues: Record<string, number> = { ...rootCues, ...(page.cues ?? {}) };
  for (const [k, v] of Object.entries(page.cues ?? {})) {
    if (k in rootCues) {
      if (rootCues[k] !== v) {
        out.push({ severity: 'error', where: page.id, tab: 'overview', message: `cue "${k}" (${v}) conflicts with manifest.cues.${k} (${rootCues[k]})` });
      } else {
        out.push({ severity: 'warn', where: page.id, tab: 'overview', message: `cue "${k}" (${v}) duplicates manifest.cues.${k}; keep shared cues in manifest.cues only` });
      }
    }
  }
  checkTurnAndOverlays(out, page, pageCues);
  checkTrackWindows(out, pack, page, pageCues, isLastPage);
  if (!Array.isArray(page.panels) || page.panels.length === 0) {
    out.push({ severity: 'error', where: page.id, tab: 'panels', message: 'page has no panels' });
    return;
  }
  let prevFrom = -Infinity;
  for (const panel of page.panels) {
    checkRect(out, page.id, `${panel.id}.layout.landscape`, panel.layout?.landscape);
    checkRect(out, page.id, `${panel.id}.layout.portrait`, panel.layout?.portrait);
    try {
      const pFrom = resolveTime(panel.from, pageCues, page.from);
      const pUntil = resolveTime(panel.until, pageCues, page.from);
      if (!(pUntil > pFrom)) {
        out.push({ severity: 'error', where: page.id, tab: 'panels', message: `${panel.id}: until (${pUntil}s) must be > from (${pFrom}s)` });
      }
      if (pFrom < page.from - 1e-6 || pUntil > Math.max(page.until, pack.manifest.durationSec) + 1e-6) {
        out.push({ severity: 'warn', where: page.id, tab: 'panels', message: `${panel.id}: [${pFrom}..${pUntil}] extends outside page [${page.from}..${page.until}]` });
      }
      if (pFrom < prevFrom) {
        out.push({ severity: 'error', where: page.id, tab: 'panels', message: `${panel.id}: panel from (${pFrom}s) goes backwards before previous panel (${prevFrom}s)` });
      }
      prevFrom = pFrom;
      if (panel.snapshotAt !== undefined) {
        const snap = resolveTime(panel.snapshotAt, pageCues, pFrom);
        if (snap < pFrom || snap > pUntil) {
          out.push({ severity: 'warn', where: page.id, tab: 'panels', message: `${panel.id}: snapshotAt (${snap}s) is outside panel [${pFrom}..${pUntil}]` });
        }
      }
      checkShotDims(out, page.id, `${panel.id}.camera.from`, panel.camera?.from);
      checkShotDims(out, page.id, `${panel.id}.camera.to`, panel.camera?.to);
      checkShotDims(out, page.id, `${panel.id}.camera.portrait`, panel.camera?.portrait);
      if (panel.camera?.span) {
        if (!Array.isArray(panel.camera.span) || panel.camera.span.length !== 2) {
          out.push({ severity: 'error', where: page.id, tab: 'panels', message: `${panel.id}.camera.span: expected exactly 2 timestamps [start, end]` });
        } else {
          const s0 = resolveTime(panel.camera.span[0], pageCues, pFrom);
          const s1 = resolveTime(panel.camera.span[1], pageCues, pFrom);
          if (!(s1 > s0)) {
            out.push({ severity: 'error', where: page.id, tab: 'panels', message: `${panel.id}.camera.span: end (${s1}s) must be > start (${s0}s)` });
          }
          if (!panel.camera.to) {
            out.push({ severity: 'warn', where: page.id, tab: 'panels', message: `${panel.id}.camera.span has no effect without camera.to` });
          }
        }
      }
    } catch (err) {
      out.push({ severity: 'error', where: page.id, tab: 'panels', message: `${panel.id}: ${(err as Error).message}` });
    }
  }
}

function routeSimError(pack: ComixPack, err: string): ComixIssue {
  if (err.startsWith('stage.') || err.startsWith('bad comix colour')) return { severity: 'error', where: 'comix', tab: 'stage', message: err };
  if (err.startsWith('cast.')) return { severity: 'error', where: 'comix', tab: 'cast', message: err };
  const colon = err.indexOf(':');
  const prefix = colon > 0 ? err.slice(0, colon) : '';
  for (const page of pack.pages) {
    if (page.id === prefix) return { severity: 'error', where: page.id, tab: 'beats', message: err };
    if (page.panels.some((p) => p.id === prefix)) {
      const tab = /(sfx|bubble|label_tag|prompt_list|glitch_text|tier_stack|caption|banner|stats_card|panel_flash|invert)/.test(err)
        ? 'letters'
        : /camera|panel until/.test(err)
          ? 'panels'
          : 'beats';
      return { severity: 'error', where: page.id, tab, message: err };
    }
  }
  return { severity: 'error', where: 'comix', tab: 'check', message: err };
}

/** Comprehensive static validation of a `ComixPack` (schema, cues, assets, panel rects, timeline continuity). */
export function checkComixPack(pack: ComixPack): ComixIssue[] {
  const out: ComixIssue[] = [];
  for (const s of objectShape(pack.manifest, ALL_MANIFEST_FIELDS, 'manifest', ['id', 'skip', 'pages'])) {
    out.push({ severity: s.severity, where: 'comix', tab: manifestTabOf(s.message), message: s.message });
  }
  if (!(pack.manifest.durationSec > 0)) {
    out.push({ severity: 'error', where: 'comix', tab: 'manifest', message: 'durationSec must be > 0' });
  }

  const rootCues = pack.manifest.cues ?? {};
  const allCues: Record<string, number> = { ...rootCues };
  const seenPageCues = new Map<string, { pageId: string; val: number }>();
  for (const page of pack.pages) {
    for (const [k, v] of Object.entries(page.cues ?? {})) {
      const prev = seenPageCues.get(k);
      if (prev && !(k in rootCues)) {
        out.push({
          severity: prev.val !== v ? 'error' : 'warn',
          where: page.id,
          tab: 'overview',
          message: `cue "${k}" (${v}) collides with ${prev.pageId}.cues.${k} (${prev.val}); rename page-local cues or move shared cues to manifest.cues`,
        });
      } else {
        seenPageCues.set(k, { pageId: page.id, val: v });
      }
      allCues[k] = v;
    }
  }
  checkSkipAndHold(out, pack, allCues);
  checkCatalogRefs(out, pack);

  if (pack.manifest.pages.length !== pack.pages.length) {
    out.push({
      severity: 'error',
      where: 'comix',
      tab: 'manifest',
      message: `manifest.pages lists ${pack.manifest.pages.length} page(s), pack loaded ${pack.pages.length}`,
    });
  }

  const seenPanels = new Set<string>();
  const sortedPages = [...pack.pages].sort((a, b) => a.index - b.index);
  if (sortedPages.length > 0) {
    if (Math.abs(sortedPages[0]!.from) > 1e-4) {
      out.push({ severity: 'warn', where: sortedPages[0]!.id, tab: 'overview', message: `first page starts at ${sortedPages[0]!.from}s instead of 0s` });
    }
    const last = sortedPages[sortedPages.length - 1]!;
    if (Math.abs(last.until - pack.manifest.durationSec) > 1e-4) {
      out.push({ severity: 'warn', where: last.id, tab: 'overview', message: `last page until (${last.until}s) differs from manifest.durationSec (${pack.manifest.durationSec}s)` });
    }
  }
  sortedPages.forEach((page, idx) => {
    if (idx > 0 && Math.abs(page.from - sortedPages[idx - 1]!.until) > 1e-4) {
      out.push({
        severity: 'warn',
        where: page.id,
        tab: 'overview',
        message: `page.from (${page.from}s) is not contiguous with previous page until (${sortedPages[idx - 1]!.until}s)`,
      });
    }
    if (page.index !== idx) {
      out.push({ severity: 'error', where: page.id, tab: 'overview', message: `page.index is ${page.index}, expected ${idx}` });
    }
    const summary = pack.manifest.pages.find((s) => s.id === page.id);
    if (!summary) {
      out.push({ severity: 'error', where: 'comix', tab: 'manifest', message: `manifest.pages has no entry for page "${page.id}"` });
    } else if (summary.panelCount !== page.panels.length || summary.from !== page.from || summary.until !== page.until) {
      out.push({
        severity: 'warn',
        where: 'comix',
        tab: 'manifest',
        message: `manifest.pages "${page.id}" summary is out of sync with page.spec.json (use Sync or Save)`,
      });
    }
    for (const s of objectShape(page, ALL_PAGE_FIELDS, `page(${page.id})`, ['id', 'index'])) {
      out.push({ severity: s.severity, where: page.id, tab: pageTabOf(s.message), message: s.message });
    }
    for (const panel of page.panels ?? []) {
      if (seenPanels.has(panel.id)) {
        out.push({ severity: 'error', where: page.id, tab: 'panels', message: `duplicate panel id "${panel.id}" across comix` });
      }
      seenPanels.add(panel.id);
    }
    checkPageTimeline(out, pack, page, pack.manifest.cues ?? {}, idx === sortedPages.length - 1);
  });

  const existingMsgs = new Set(out.map((i) => i.message));
  const sim = simulateComixPack(pack);
  for (const err of sim.errors) {
    if (!existingMsgs.has(err)) {
      existingMsgs.add(err);
      out.push(routeSimError(pack, err));
    }
  }
  return out;
}

export function runComixSim(pack: ComixPack): ComixSimResult {
  return simulateComixPack(pack);
}
