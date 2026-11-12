import type { ComixPageSpec, ComixPanelSpec, ComixStorySpec } from '../chapters/types.js';
import { escHtml as esc } from '../renderer/html-escape.js';

/** Panel rects are fractions of the drawing area under the masthead, matching draw-comix.mjs. */
const AREA = { x: 2.2, y: 7.2, w: 95.6, h: 90 };

function panelStyle(panel: ComixPanelSpec): string {
  const [rx, ry, rw, rh] = panel.rect;
  const left = AREA.x + rx * AREA.w;
  const top = AREA.y + ry * AREA.h;
  const bg = /^#[0-9a-fA-F]{6}$/.test(panel.bgHex) ? panel.bgHex : '#12091c';
  return `left:${left}%;top:${top}%;width:${rw * AREA.w}%;height:${rh * AREA.h}%;background:${bg}`;
}

function sfxColor(color: string | undefined): string {
  return /^#[0-9a-fA-F]{6}$/.test(color ?? '') ? (color as string) : '#ffd166';
}

function panelHtml(panel: ComixPanelSpec, index: number): string {
  const caption = panel.caption
    ? `<div class="comix-caption">${esc(panel.caption)}</div>`
    : '';
  const bubbles = (panel.bubbles ?? [])
    .map((bubble) => {
      const style = bubble.style === 'shout' || bubble.style === 'whisper' ? bubble.style : 'normal';
      const top = panel.caption ? Math.max(bubble.y, 0.27) : bubble.y;
      return `<div class="comix-bubble ${style}" style="left:${bubble.x * 100}%;top:${top * 100}%">
        <b>${esc(bubble.speaker)}</b><span>${esc(bubble.text)}</span></div>`;
    })
    .join('');
  const sfx = panel.sfx
    ? `<div class="comix-sfx" style="left:${panel.sfx.x * 100}%;top:${panel.sfx.y * 100}%;color:${sfxColor(panel.sfx.color)}">${esc(panel.sfx.text)}</div>`
    : '';
  return `<article class="comix-panel" data-i="${index}" style="${panelStyle(panel)}">
    <div class="comix-picture"><div class="comix-gl"></div>${caption}${bubbles}${sfx}</div>
  </article>`;
}

export function sheetHtml(comix: ComixStorySpec, page: ComixPageSpec): string {
  const total = comix.pages.length;
  return `<div class="comix-sheet">
    <header class="comix-mast">
      <span>${esc(comix.title)} // ${esc(page.title)}</span>
      <b>P.${page.pageNumber}/${total}</b>
    </header>
    ${page.panels.map((panel, index) => panelHtml(panel, index)).join('')}
  </div>`;
}

export function shellHtml(): string {
  return `<div class="comix-sheet-wrap" id="comix-sheet-wrap"></div>
    <div class="comix-bar">
      <button type="button" class="comic-btn paper" id="comix-prev">Prev</button>
      <button type="button" class="comic-btn primary" id="comix-pause" aria-pressed="false">Pause</button>
      <button type="button" class="comic-btn paper" id="comix-next">Next</button>
    </div>`;
}

