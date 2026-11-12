import { bgColor } from '../domain/backgrounds.js';
import { pxPerUnit, type LabOptions } from '../domain/options.js';
import type { LabStage } from '../stage/lab-stage.js';
import type { Gallery } from '../ui/gallery.js';
import type { ClockMode } from '../subjects/part-animator.js';

/** Panels per frame whose subject may be built; the rest wait for the next frame so the page stays responsive. */
const BUILDS_PER_FRAME = 6;
/** Pixels per world unit of a gallery panel when no scale is chosen. */
export const GALLERY_PPU = 72;

export interface PaintContext {
  stage: LabStage;
  gallery: Gallery;
  opts: LabOptions;
  time: number;
  mode: ClockMode;
  /** The clock or a flash is moving: repaint every panel. */
  live: boolean;
  /** An option changed: repaint every panel once. */
  repaintAll: boolean;
}

export function galleryPpu(opts: LabOptions): number {
  return opts.tab === 'textures' ? GALLERY_PPU : pxPerUnit(opts.scale) ?? GALLERY_PPU;
}

/** Paint the visible panels. Returns true when every visible panel is up to date. */
export function paintGallery(ctx: PaintContext): boolean {
  const { stage, gallery, opts } = ctx;
  const cells = gallery.cells.filter((c) => c.visible);
  if (!cells.length) return true;
  const ppu = galleryPpu(opts);
  const cellPx = cells[0]!.canvas.width / stage.pixelRatio;
  stage.setSize(cellPx, cellPx);
  const bg = bgColor(opts.bg);
  let builds = 0;
  let pending = 0;
  for (const cell of cells) {
    if (cell.error) continue;
    if (!cell.subject) {
      if (builds >= BUILDS_PER_FRAME) {
        pending++;
        continue;
      }
      builds++;
      if (!gallery.ensure(cell, { seed: opts.seed, ink: opts.ink, tex: opts.tex }, ppu, cellPx)) continue;
    } else if (!ctx.live && !ctx.repaintAll && cell.painted) {
      continue;
    }
    const subject = cell.subject!;
    const framing = cell.framing!;
    subject.animator?.apply(ctx.time, opts.state, ctx.mode);
    stage.render({
      subject,
      centerX: framing.centerX,
      centerY: framing.centerY,
      ppu: framing.ppu,
      yaw: 0,
      bg,
      silhouette: opts.silhouette,
      lantern: opts.lantern,
      lanternAt: [subject.bounds.max[0] + 0.9, 0.95],
      plinth: false,
      flashHold: opts.flash,
      time: ctx.time,
    });
    gallery.blit(cell, stage.canvas, stage.pixelRatio, opts.guides, opts.bg !== 'paper' && !opts.silhouette);
  }
  return pending === 0;
}
