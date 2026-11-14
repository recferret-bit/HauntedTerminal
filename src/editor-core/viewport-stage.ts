import { h } from './dom.js';
import { clampNum } from './drag.js';
import { installMatControls, installViewResizers, syncViewResizerAria } from './view-resizer.js';

export interface ViewportStageOpts {
  frameTitle: string;
  allow?: string;
  bindIframeCtrlWheel?: boolean;
  onFrameLoad?: () => void;
  onPortraitChange?: (portrait: boolean) => void;
}

const clampScale = (s: number): number => clampNum(s, 0.4, 2.5);

/**
 * Shared centered iframe viewport stage (`matEl`, `frameWrapEl`, `frame`, `Fit` / `%` zoom,
 * symmetric 6-edge/corner resize handles, and Portrait/Landscape aspect switching).
 */
export class ViewportStageController {
  readonly frame: HTMLIFrameElement;
  readonly frameWrapEl: HTMLElement;
  readonly matEl: HTMLElement;
  readonly fitBtn: HTMLButtonElement;
  readonly readoutBtn: HTMLButtonElement;
  readonly aspectBtn: HTMLButtonElement;
  private readonly resizerEls: HTMLElement[];
  private portrait = false;
  private pageScale: number | 'fit' = 'fit';
  private customViewSize: { w: number; h: number } | null = null;

  constructor(private readonly opts: ViewportStageOpts) {
    this.frame = h('iframe', {
      class: 'pv-frame comix-frame',
      title: opts.frameTitle,
      allow: opts.allow,
    });
    this.frame.addEventListener('load', () => {
      if (opts.bindIframeCtrlWheel) this.attachIframeWheelZoom();
      opts.onFrameLoad?.();
    });

    this.fitBtn = h('button', {
      type: 'button',
      class: 'btn small',
      'aria-pressed': 'true',
      title: 'Fit viewport inside center stage',
      onclick: () => this.setPageZoom('fit'),
    }, 'Fit');
    this.readoutBtn = h('button', {
      type: 'button',
      class: 'cx-readout',
      title: 'Click to reset Canvas Zoom to Fit',
      onclick: () => this.setPageZoom('fit'),
    }, 'Fit');
    this.aspectBtn = h('button', {
      type: 'button',
      class: 'btn small',
      'aria-pressed': 'false',
      title: 'Toggle Landscape / Portrait preview viewport',
      onclick: () => this.togglePortrait(),
    }, '📱 Portrait');

    this.frameWrapEl = h('div', { class: 'cx-frame-wrap' }, this.frame);
    this.matEl = h('div', { class: 'cx-stage-mat' }, this.frameWrapEl);
    this.resizerEls = installViewResizers({
      frameWrapEl: this.frameWrapEl,
      frameEl: this.frame,
      matEl: this.matEl,
      isPortrait: () => this.portrait,
      getViewportSize: () => this.viewportSize,
      setViewportSize: (w, hPx) => this.setViewportSize(w, hPx),
      resetFit: () => this.setPageZoom('fit'),
      zoomPageBy: (f) => this.zoomPageBy(f),
    });

    installMatControls({ matEl: this.matEl, zoomPageBy: (f) => this.zoomPageBy(f) });
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.updateFrameLayout()).observe(this.matEl);
    }
    window.addEventListener('resize', () => this.updateFrameLayout());
  }

  get isPortrait(): boolean {
    return this.portrait;
  }

  get pageZoomMode(): number | 'fit' {
    return this.pageScale;
  }

  get viewportSize(): { w: number; h: number } {
    if (this.customViewSize) return { ...this.customViewSize };
    const r = this.frame.getBoundingClientRect();
    return {
      w: Math.round(r.width || parseFloat(this.frame.style.width) || 0),
      h: Math.round(r.height || parseFloat(this.frame.style.height) || 0),
    };
  }

  buildZoomGroup(label = 'Page'): HTMLElement {
    return h(
      'div',
      { class: 'cx-bar-grp', role: 'group', 'aria-label': `${label} canvas zoom` },
      h('span', { class: 'cx-bar-lbl' }, label),
      this.fitBtn,
      h('button', {
        type: 'button',
        class: 'mini',
        title: `Zoom out ${label.toLowerCase()}`,
        'aria-label': `Zoom out ${label.toLowerCase()}`,
        onclick: () => this.zoomPageBy(1 / 1.2),
      }, '−'),
      this.readoutBtn,
      h('button', {
        type: 'button',
        class: 'mini',
        title: `Zoom in ${label.toLowerCase()}`,
        'aria-label': `Zoom in ${label.toLowerCase()}`,
        onclick: () => this.zoomPageBy(1.2),
      }, '+'),
    );
  }

  updateFrameLayout(): void {
    const matW = this.matEl.clientWidth || 800;
    const matH = this.matEl.clientHeight || 500;
    const padStyle = getComputedStyle(this.matEl);
    const padX = (parseFloat(padStyle.paddingLeft) || 12) + (parseFloat(padStyle.paddingRight) || 12);
    const padY = (parseFloat(padStyle.paddingTop) || 12) + (parseFloat(padStyle.paddingBottom) || 12);
    const aspect = this.portrait ? 9 / 16 : 16 / 10;
    const availW = Math.max(220, matW - padX);
    const availH = Math.max(175, matH - padY);
    let fitW = availW;
    let fitH = fitW / aspect;
    if (fitH > availH) {
      fitH = availH;
      fitW = fitH * aspect;
    }
    const minW = this.portrait ? 220 : 280;
    const minH = this.portrait ? 390 : 175;
    if (fitW < minW) {
      fitW = minW;
      fitH = fitW / aspect;
    }
    if (fitH < minH) {
      fitH = minH;
      fitW = fitH * aspect;
    }
    let w: number;
    let hPx: number;
    if (this.customViewSize) {
      w = Math.round(clampNum(this.customViewSize.w, 220, 2600));
      hPx = Math.round(clampNum(this.customViewSize.h, 175, 2400));
      this.readoutBtn.textContent = `${w}×${hPx}`;
    } else if (this.pageScale === 'fit') {
      w = Math.round(fitW);
      hPx = Math.round(fitH);
      this.readoutBtn.textContent = `Fit (${w}×${hPx})`;
    } else {
      const refW = Math.max(fitW, this.portrait ? 405 : 960);
      w = Math.round(refW * this.pageScale);
      hPx = Math.round(w / aspect);
      this.readoutBtn.textContent = `${Math.round(this.pageScale * 100)}%`;
    }
    this.fitBtn.setAttribute('aria-pressed', String(!this.customViewSize && this.pageScale === 'fit'));
    this.frame.style.width = `${w}px`;
    this.frame.style.height = `${hPx}px`;
    syncViewResizerAria(this.resizerEls, w, hPx);
  }

  setViewportSize(w: number, hPx: number): void {
    this.customViewSize = {
      w: Math.round(clampNum(w, 220, 2600)),
      h: Math.round(clampNum(hPx, 175, 2400)),
    };
    this.updateFrameLayout();
  }

  setPageZoom(scale: number | 'fit'): void {
    this.customViewSize = null;
    this.pageScale = scale === 'fit' ? 'fit' : clampScale(scale);
    this.updateFrameLayout();
  }

  zoomPageBy(factor: number): void {
    if (this.customViewSize) {
      this.setViewportSize(this.customViewSize.w * factor, this.customViewSize.h * factor);
      return;
    }
    const base = this.pageScale === 'fit' ? 1 : this.pageScale;
    this.setPageZoom(base * factor);
  }

  togglePortrait(onAfterToggle?: () => void): void {
    this.portrait = !this.portrait;
    this.customViewSize = null;
    this.frame.classList.toggle('portrait', this.portrait);
    this.aspectBtn.setAttribute('aria-pressed', String(this.portrait));
    this.aspectBtn.textContent = this.portrait ? '🖥 Landscape' : '📱 Portrait';
    this.updateFrameLayout();
    onAfterToggle?.();
    this.opts.onPortraitChange?.(this.portrait);
  }

  private attachIframeWheelZoom(): void {
    try {
      const doc = this.frame.contentDocument;
      if (!doc) return;
      doc.addEventListener('wheel', (ev) => {
        if (!ev.ctrlKey && !ev.metaKey) return;
        ev.preventDefault();
        this.zoomPageBy(Math.exp(-ev.deltaY * 0.0015));
      }, { passive: false });
    } catch {
      // Cross-origin frame guard; all local preview pages are same-origin.
    }
  }
}
