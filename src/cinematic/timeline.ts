import { cssHex, resolvePoint, resolveTime } from './expr.js';
import type {
  ComixPack,
  EaseName,
  PageOverlay,
  PanelBeat,
  PanelLetter,
  Rect4,
  SceneTrack,
  ShotBox,
  Vec3,
} from './spec-types.js';

export interface ResolvedCamera {
  from: ShotBox;
  to?: ShotBox;
  spanFrom?: number;
  spanTo?: number;
  ease: EaseName;
  portrait?: ShotBox;
}

export interface ResolvedPanel {
  id: string;
  title: string;
  pageIndex: number;
  pageId: string;
  from: number;
  until: number;
  snapshotAt?: number;
  landscape: Rect4;
  portrait: Rect4;
  camera: ResolvedCamera;
}

export interface ResolvedPageTurn {
  pageIndex: number;
  from: number;
  to: number;
  ease: 'in' | 'quad';
}

export interface ResolvedOverlay {
  pageIndex: number;
  pageId: string;
  overlayIndex: number;
  at: number;
  title: string;
  subtitle: string;
  typeFrom: number;
  typeTo: number;
  fadeFrom: number;
  fadeTo: number;
}

export interface ResolvedLetter {
  panelId: string;
  pageIndex: number;
  pageId: string;
  panelIndex: number;
  letterIndex: number;
  panelFrom: number;
  cues: Record<string, number>;
  spec: PanelLetter;
}

export interface ResolvedBeat {
  panelId: string;
  pageIndex: number;
  pageId: string;
  panelIndex: number;
  beatIndex: number;
  panelFrom: number;
  cues: Record<string, number>;
  spec: PanelBeat;
}

export interface ResolvedTrack {
  ownerId: string;
  baseTime: number;
  cues: Record<string, number>;
  from: number;
  until?: number;
  spec: SceneTrack;
}

export interface ResolvedTimeline {
  id: string;
  durationSec: number;
  holdAtEnd: boolean;
  acceptsKeyFrom?: number;
  inputGraceMs: number;
  backgroundHex: number;
  clampToRoom: boolean;
  points: Record<string, Vec3>;
  cues: Record<string, number>;
  skip: 'end' | Array<{ before: number; to: number }>;
  pageCount: number;
  panels: ResolvedPanel[];
  turns: ResolvedPageTurn[];
  overlays: ResolvedOverlay[];
  letters: ResolvedLetter[];
  beats: ResolvedBeat[];
  tracks: ResolvedTrack[];
}

function buildTrack(spec: SceneTrack, ownerId: string, cues: Record<string, number>, baseTime: number): ResolvedTrack {
  const from = resolveTime(spec.from, cues, baseTime);
  const until = 'until' in spec && spec.until !== undefined ? resolveTime(spec.until, cues, baseTime) : undefined;
  return { ownerId, baseTime, cues, from, until, spec };
}

function buildOverlay(
  spec: PageOverlay,
  pageIndex: number,
  pageId: string,
  overlayIndex: number,
  cues: Record<string, number>,
  baseTime: number,
): ResolvedOverlay {
  return {
    pageIndex,
    pageId,
    overlayIndex,
    at: resolveTime(spec.at, cues, baseTime),
    title: spec.title,
    subtitle: spec.subtitle,
    typeFrom: resolveTime(spec.typeFrom, cues, baseTime),
    typeTo: resolveTime(spec.typeTo, cues, baseTime),
    fadeFrom: resolveTime(spec.fadeFrom, cues, baseTime),
    fadeTo: resolveTime(spec.fadeTo, cues, baseTime),
  };
}

/** Compile a `ComixPack` into a resolved, Three.js-free timeline ready for playback or headless simulation. */
export function compileTimeline(pack: ComixPack): ResolvedTimeline {
  const { manifest } = pack;
  const rootCues: Record<string, number> = { ...(manifest.cues ?? {}) };
  const points: Record<string, Vec3> = {};
  for (const [key, pt] of Object.entries(manifest.stage.points ?? {})) {
    points[key] = resolvePoint(pt, manifest.stage.points);
  }
  const backgroundHex = cssHex(manifest.stage.background);
  const sortedPages = [...pack.pages].sort((a, b) => a.index - b.index);
  if (sortedPages.length === 0) throw new Error(`comix "${manifest.id}" has no pages`);

  const panels: ResolvedPanel[] = [];
  const turns: ResolvedPageTurn[] = [];
  const overlays: ResolvedOverlay[] = [];
  const letters: ResolvedLetter[] = [];
  const beats: ResolvedBeat[] = [];
  const tracks: ResolvedTrack[] = [];
  const allCues: Record<string, number> = { ...rootCues };

  for (const page of sortedPages) {
    const pageCues: Record<string, number> = { ...rootCues, ...(page.cues ?? {}) };
    Object.assign(allCues, page.cues ?? {});
    if (page.turn) {
      turns.push({
        pageIndex: page.index,
        from: resolveTime(page.turn.from, pageCues, page.from),
        to: resolveTime(page.turn.to, pageCues, page.from),
        ease: page.turn.ease,
      });
    }
    (page.overlays ?? []).forEach((overlay, overlayIndex) => {
      overlays.push(buildOverlay(overlay, page.index, page.id, overlayIndex, pageCues, page.from));
    });
    for (const track of page.tracks ?? []) {
      tracks.push(buildTrack(track, page.id, pageCues, page.from));
    }
    page.panels.forEach((panel, panelIndex) => {
      if (panels.some((p) => p.id === panel.id)) {
        throw new Error(`duplicate panel id "${panel.id}" in comix "${manifest.id}"`);
      }
      const pFrom = resolveTime(panel.from, pageCues, page.from);
      const pUntil = resolveTime(panel.until, pageCues, page.from);
      const cam = panel.camera;
      panels.push({
        id: panel.id,
        title: panel.title,
        pageIndex: page.index,
        pageId: page.id,
        from: pFrom,
        until: pUntil,
        snapshotAt: panel.snapshotAt !== undefined ? resolveTime(panel.snapshotAt, pageCues, pFrom) : undefined,
        landscape: panel.layout.landscape,
        portrait: panel.layout.portrait,
        camera: {
          from: cam.from,
          to: cam.to,
          spanFrom: cam.span ? resolveTime(cam.span[0], pageCues, pFrom) : cam.to ? pFrom : undefined,
          spanTo: cam.span ? resolveTime(cam.span[1], pageCues, pFrom) : cam.to ? pUntil : undefined,
          ease: cam.ease ?? 'linear',
          portrait: cam.portrait,
        },
      });
      (panel.letters ?? []).forEach((letter, letterIndex) => {
        letters.push({
          panelId: panel.id,
          pageIndex: page.index,
          pageId: page.id,
          panelIndex,
          letterIndex,
          panelFrom: pFrom,
          cues: pageCues,
          spec: letter,
        });
      });
      (panel.beats ?? []).forEach((beat, beatIndex) => {
        beats.push({
          panelId: panel.id,
          pageIndex: page.index,
          pageId: page.id,
          panelIndex,
          beatIndex,
          panelFrom: pFrom,
          cues: pageCues,
          spec: beat,
        });
      });
      for (const track of panel.tracks ?? []) {
        tracks.push(buildTrack(track, panel.id, pageCues, pFrom));
      }
    });
  }

  panels.sort((a, b) => a.from - b.from);
  if (panels.length === 0) throw new Error(`comix "${manifest.id}" has no panels`);

  const skip = manifest.skip === 'end'
    ? 'end'
    : manifest.skip.map((rule) => ({
        before: resolveTime(rule.before, allCues, 0),
        to: resolveTime(rule.to, allCues, 0),
      }));

  return {
    id: manifest.id,
    durationSec: manifest.durationSec,
    holdAtEnd: !!manifest.holdAtEnd,
    acceptsKeyFrom: manifest.acceptsKeyFrom !== undefined ? resolveTime(manifest.acceptsKeyFrom, allCues, 0) : undefined,
    inputGraceMs: manifest.inputGraceMs ?? 400,
    backgroundHex,
    clampToRoom: manifest.stage.clampToRoom !== false,
    points,
    cues: allCues,
    skip,
    pageCount: sortedPages.length,
    panels,
    turns,
    overlays,
    letters,
    beats,
    tracks,
  };
}

/** Active panel id at timestamp `t` (latest panel whose `from <= t`). */
export function activePanelAt(timeline: ResolvedTimeline, t: number): ResolvedPanel {
  let active = timeline.panels[0]!;
  for (const panel of timeline.panels) {
    if (t >= panel.from) active = panel;
  }
  return active;
}

/**
 * Earliest timestamp at which a page/panel is uncovered by any earlier page's turn transition,
 * falling back to `rawFrom + 0.05` and clamped inside `[rawFrom, rawUntil)`.
 */
export function visiblePanelStart(
  timeline: ResolvedTimeline,
  pageIndex: number,
  rawFrom: number,
  rawUntil: number,
): number {
  let turnEnd = -Infinity;
  for (const tr of timeline.turns) {
    if (tr.pageIndex < pageIndex && tr.to > turnEnd) turnEnd = tr.to;
  }
  const target = turnEnd > rawFrom ? Math.max(rawFrom + 0.05, turnEnd + 0.02) : rawFrom + 0.05;
  const maxAllowed = rawUntil > rawFrom + 0.02 ? rawUntil - 0.02 : rawFrom;
  return Math.min(maxAllowed, target);
}

/** Resolve skip destination when skip is pressed at `t`. */
export function resolveSkipTarget(timeline: ResolvedTimeline, t: number): number | 'end' {
  if (timeline.skip === 'end') return 'end';
  for (const rule of timeline.skip) {
    if (t < rule.before) return rule.to;
  }
  return t;
}
