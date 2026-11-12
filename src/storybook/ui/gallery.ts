import { galleryFraming, type Framing } from '../domain/framing.js';
import type { GalleryItem } from '../subjects/catalog-items.js';
import { buildItemSubject, type Subject, type SubjectOptions } from '../subjects/index.js';
import { el } from './dom.js';
import { drawGuides } from './gallery-guides.js';

export type { GalleryItem } from '../subjects/catalog-items.js';

export interface Cell {
  item: GalleryItem;
  el: HTMLAnchorElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  note: HTMLElement;
  subject: Subject | null;
  error: string | null;
  framing: Framing | null;
  visible: boolean;
  /** Drawn at least once since the last invalidation. */
  painted: boolean;
}

/** The gallery page: one comic panel per catalog entry. Cells are 2D canvases; the stage paints them in turn. */
export class Gallery {
  cells: Cell[] = [];
  private readonly observer: IntersectionObserver;

  constructor(
    private readonly host: HTMLElement,
    private readonly hrefFor: (id: string) => string,
    private readonly onPick: (id: string) => void,
  ) {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const cell = this.cells.find((c) => c.el === entry.target);
          if (cell) cell.visible = entry.isIntersecting;
        }
      },
      { rootMargin: '200px' },
    );
  }

  /** Rebuild the grid for a new item list or cell size. */
  layout(items: GalleryItem[], cellPx: number, pixelRatio: number, emptyText: string): void {
    this.clear();
    this.host.replaceChildren();
    this.host.style.setProperty('--cell', `${cellPx}px`);
    if (!items.length) {
      this.host.append(el('p', 'lab-empty', emptyText));
      return;
    }
    let strip = '';
    for (const item of items) {
      if (item.category !== strip) {
        strip = item.category;
        this.host.append(el('h2', 'lab-strip', strip));
      }
      const a = el('a', 'lab-cell');
      a.href = this.hrefFor(item.id);
      a.dataset.id = item.id;
      a.addEventListener('click', (ev) => {
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
        ev.preventDefault();
        this.onPick(item.id);
      });
      const canvas = el('canvas', 'lab-cell-canvas');
      canvas.width = Math.round(cellPx * pixelRatio);
      canvas.height = Math.round(cellPx * pixelRatio);
      const cap = el('span', 'lab-cap');
      cap.append(el('b', '', item.id), el('i', '', item.label));
      const note = el('span', 'lab-note');
      a.append(canvas, cap, note);
      this.host.append(a);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2d canvas unavailable');
      // Until IntersectionObserver reports, treat the first screenful as visible so `ready` means painted.
      const cell: Cell = { item, el: a, canvas, ctx, note, subject: null, error: null, framing: null, visible: true, painted: false };
      this.cells.push(cell);
      this.observer.observe(a);
    }
  }

  /** Build (once) the subject of a cell. A spec that throws becomes a red note on the cell, not a dead page. */
  ensure(cell: Cell, opts: SubjectOptions, ppu: number, cellPx: number): Subject | null {
    if (cell.subject || cell.error) return cell.subject;
    try {
      cell.subject = buildItemSubject(cell.item, opts);
      cell.framing = galleryFraming(cell.subject, ppu, cellPx);
      const shrink = cell.framing.ppu / ppu;
      cell.note.textContent = cell.item.kind !== 'texture' && shrink < 0.995 ? `not to scale  x${shrink.toFixed(2)}` : '';
      cell.el.classList.remove('lab-cell-error');
    } catch (err) {
      cell.error = err instanceof Error ? err.message : String(err);
      cell.note.textContent = cell.error;
      cell.el.classList.add('lab-cell-error');
      cell.ctx.clearRect(0, 0, cell.canvas.width, cell.canvas.height);
    }
    return cell.subject;
  }

  /** Copy the stage's finished frame into the cell, then draw the scale guides on top (they are not art). */
  blit(cell: Cell, source: HTMLCanvasElement, pixelRatio: number, guides: boolean, onDark: boolean): void {
    const { ctx, canvas, framing } = cell;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    cell.painted = true;
    if (guides && framing && cell.item.kind !== 'texture') drawGuides(ctx, canvas, framing, pixelRatio, onDark);
  }

  /** Drop every built subject (seed, ink or texture option changed). */
  invalidate(): void {
    for (const cell of this.cells) {
      cell.subject?.dispose();
      cell.subject = null;
      cell.error = null;
      cell.framing = null;
      cell.painted = false;
    }
  }

  clear(): void {
    this.invalidate();
    this.observer.disconnect();
    this.cells = [];
  }
}
