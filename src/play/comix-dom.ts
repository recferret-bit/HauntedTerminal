import type { ComixPageSpec, ComixPanelSpec, ComixStorySpec } from '../chapters/types.js';
import { dom } from '../ui/dom-lite.js';

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

function buildPanelEl(panel: ComixPanelSpec, index: number): HTMLElement {
  const caption = panel.caption ? dom('div', { class: 'comix-caption' }, [panel.caption]) : null;
  const bubbles = (panel.bubbles ?? []).map((bubble) => {
    const style = bubble.style === 'shout' || bubble.style === 'whisper' ? bubble.style : 'normal';
    const top = panel.caption ? Math.max(bubble.y, 0.27) : bubble.y;
    return dom('div', { class: `comix-bubble ${style}`, style: `left:${bubble.x * 100}%;top:${top * 100}%` }, [
      dom('b', {}, [bubble.speaker]),
      dom('span', {}, [bubble.text]),
    ]);
  });
  const sfx = panel.sfx
    ? dom('div', {
        class: 'comix-sfx',
        style: `left:${panel.sfx.x * 100}%;top:${panel.sfx.y * 100}%;color:${sfxColor(panel.sfx.color)}`,
      }, [panel.sfx.text])
    : null;
  return dom('article', { class: 'comix-panel', 'data-i': index, style: panelStyle(panel) }, [
    dom('div', { class: 'comix-picture' }, [dom('div', { class: 'comix-gl' }), caption, ...bubbles, sfx]),
  ]);
}

export function buildComixSheet(comix: ComixStorySpec, page: ComixPageSpec): HTMLElement {
  const total = comix.pages.length;
  return dom('div', { class: 'comix-sheet' }, [
    dom('header', { class: 'comix-mast' }, [
      dom('span', {}, [`${comix.title} // ${page.title}`]),
      dom('b', {}, [`P.${page.pageNumber}/${total}`]),
    ]),
    ...page.panels.map((panel, index) => buildPanelEl(panel, index)),
  ]);
}

export function buildComixShell(): HTMLElement[] {
  return [
    dom('div', { class: 'comix-sheet-wrap', id: 'comix-sheet-wrap' }),
    dom('div', { class: 'comix-bar' }, [
      dom('button', { type: 'button', class: 'comic-btn paper', id: 'comix-prev' }, ['Prev']),
      dom('button', { type: 'button', class: 'comic-btn primary', id: 'comix-pause', 'aria-pressed': 'false' }, ['Pause']),
      dom('button', { type: 'button', class: 'comic-btn paper', id: 'comix-next' }, ['Next']),
    ]),
  ];
}

