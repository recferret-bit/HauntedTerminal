import { VIBECODER_HEIGHT, type Framing } from '../domain/framing.js';

/** Ground line and vibecoder height over a finished cell. Guides are not art: they are drawn after the blit. */
export function drawGuides(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, framing: Framing, pixelRatio: number, onDark: boolean): void {
  const cssH = canvas.height / pixelRatio;
  const yOf = (worldY: number): number => Math.round(((framing.centerY - worldY) * framing.ppu + cssH / 2) * pixelRatio) + 0.5;
  const line = onDark ? 'rgba(244,241,234,0.55)' : 'rgba(17,14,27,0.6)';
  ctx.save();
  ctx.lineWidth = Math.max(1, Math.round(pixelRatio));
  ctx.strokeStyle = line;
  ctx.fillStyle = line;
  ctx.font = `600 ${Math.round(9 * pixelRatio)}px "IBM Plex Mono", ui-monospace, monospace`;
  horizontal(ctx, canvas.width, yOf(0));
  const vibecoder = yOf(VIBECODER_HEIGHT);
  if (vibecoder > 0) {
    ctx.setLineDash([4 * pixelRatio, 4 * pixelRatio]);
    horizontal(ctx, canvas.width, vibecoder);
    ctx.textAlign = 'right';
    ctx.fillText(`vibecoder ${VIBECODER_HEIGHT}`, canvas.width - 4 * pixelRatio, vibecoder - 3 * pixelRatio);
  }
  ctx.restore();
}

function horizontal(ctx: CanvasRenderingContext2D, width: number, y: number): void {
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
}
