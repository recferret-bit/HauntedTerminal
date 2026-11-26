import { el } from './dom-lite.js';
import { mountPixelBlit, type PixelBlit } from './term-boot-pixel.js';
import { readInitialShaderState } from './visual-lab-state.js';

/** Glyphs for the visor rain. Hex and shell marks, drawn in IBM Plex Mono. */
const GLYPHS = '0123456789ABCDEF<>/\\|#%&*';
const TRAIL = 14;
const COL_GAP = 14;
/** Matches `MATRIX_BOOT_MS` in screen.ts. The dot and the beam fade on this clock. */
const BOOT_MS = 1800;

interface Column {
  x: number;
  y: number;
  speed: number;
  seed: number;
}

/**
 * Green visor over the terminal while it opens. The rain, wash and beam go through the
 * stage pixel-art pass. The terminal text under the overlay is not shaded.
 * Returns a stop function that removes the overlay.
 */
export function startMatrixRain(host: HTMLElement): () => void {
  const view = el('canvas', 'tty-matrix-rain');
  const wrap = el('div', '', [view]);
  wrap.id = 'tty-matrix';
  wrap.setAttribute('aria-hidden', 'true');
  host.append(wrap);
  const lab = readInitialShaderState();
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const blit = lab.pixelOn ? mountPixelBlit(lab.pixel, ratio) : null;
  const source = blit ? el('canvas', 'tty-matrix-src') : view;
  const ctx = source.getContext('2d');
  if (!ctx) {
    blit?.dispose();
    wrap.remove();
    return () => {};
  }
  ctx.imageSmoothingEnabled = false;
  const columns: Column[] = [];
  const fit = (): void => sizeOverlay(host, source, view, blit, ctx, columns, ratio);
  fit();
  const started = performance.now();
  let last = started;
  let raf = 0;
  const frame = (now: number): void => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    stepColumns(columns, h, dt);
    paintEffect(ctx, columns, w, h, (now - started) / BOOT_MS);
    blit?.draw(source, view);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    blit?.dispose();
    wrap.remove();
  };
}

function sizeOverlay(
  host: HTMLElement,
  source: HTMLCanvasElement,
  view: HTMLCanvasElement,
  blit: PixelBlit | null,
  ctx: CanvasRenderingContext2D,
  columns: Column[],
  ratio: number,
): void {
  const w = Math.max(1, host.clientWidth);
  const h = Math.max(1, host.clientHeight);
  source.width = Math.floor(w * ratio);
  source.height = Math.floor(h * ratio);
  source.style.width = `${w}px`;
  source.style.height = `${h}px`;
  if (blit) {
    view.style.width = `${w}px`;
    view.style.height = `${h}px`;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  columns.length = 0;
  for (let x = 4; x < w; x += COL_GAP) {
    columns.push({
      x, y: Math.random() * h, speed: 90 + Math.random() * 240, seed: Math.floor(Math.random() * GLYPHS.length),
    });
  }
}

function stepColumns(columns: Column[], h: number, dt: number): void {
  for (const col of columns) {
    col.y += col.speed * dt;
    if (col.y > h + TRAIL * 15) col.y = -16;
  }
}

function paintEffect(ctx: CanvasRenderingContext2D, columns: Column[], w: number, h: number, progress: number): void {
  ctx.clearRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0, 36, 14, 0.34)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(80, 255, 130, 0.16)';
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  ctx.font = '14px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textBaseline = 'top';
  for (const col of columns) paintColumn(ctx, col);
  paintBeam(ctx, w, h, progress);
}

function paintColumn(ctx: CanvasRenderingContext2D, col: Column): void {
  for (let i = 0; i < TRAIL; i++) {
    const glyph = GLYPHS[(col.seed + i * 3) % GLYPHS.length] ?? '0';
    ctx.globalAlpha = i === 0 ? 1 : (1 - i / TRAIL) * 0.8;
    ctx.fillStyle = i === 0 ? '#f4fff6' : '#3dff7a';
    ctx.fillText(glyph, col.x, col.y - i * 15);
  }
  ctx.globalAlpha = 1;
}

/** Same beats as `matrix-boot` in game.css: the line is across by 30%, then it opens until 92%. */
const LINE_AT = 0.3;
const GROW_AT = 0.4;
const GROWN_AT = 0.92;

function paintBeam(ctx: CanvasRenderingContext2D, w: number, h: number, progress: number): void {
  const span = progress < LINE_AT ? Math.max(0, (progress - 0.14) / (LINE_AT - 0.14)) : 1;
  const grow = progress < GROW_AT ? 0 : Math.min(1, (progress - GROW_AT) / (GROWN_AT - GROW_AT));
  const mid = h * 0.5;
  const half = h * (0.004 + grow * 0.496);
  const x = (w * (1 - span)) / 2;
  const wide = w * span;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#39ff6a';
  ctx.fillRect(x, mid - half - 2, wide, 3);
  ctx.fillRect(x, mid + half - 1, wide, 3);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#f4fff6';
  ctx.fillRect(x, mid - half - 1, wide, 2);
  if (grow > 0.02) ctx.fillRect(x, mid + half - 1, wide, 2);
  if (progress < 0.34) {
    ctx.globalAlpha = progress < 0.16 ? 1 : 1 - (progress - 0.16) / 0.18;
    ctx.fillRect(w * 0.5 - 5, mid - 5, 10, 10);
  }
  ctx.globalAlpha = 1;
}
