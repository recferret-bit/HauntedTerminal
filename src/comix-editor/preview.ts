import { h } from '../chapter-editor/dom.js';

const DRAFT_KEY = 'ht-comix-draft';

/** Iframe of the cinematic player. The draft is in localStorage before `src` is set. */
export class ComixPreview {
  readonly root: HTMLElement;
  private readonly frame: HTMLIFrameElement;
  private rev = 0;
  private timer = 0;

  constructor(private readonly draft: () => { id: string; files: Record<string, unknown> }) {
    this.frame = h('iframe', { class: 'pv-frame comix-frame', title: 'Comix preview' });
    const replay = h('button', { type: 'button', class: 'btn primary', onclick: () => this.load() }, 'Replay');
    this.root = h('div', { class: 'pv' }, h('div', { class: 'pv-bar' }, replay), this.frame);
  }

  loadSoon(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.load(), 600);
  }

  /** Rewrites `ht-comix-draft` and reloads the player with a new `r`. */
  load(): void {
    window.clearTimeout(this.timer);
    const { id, files } = this.draft();
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ id, files }));
    this.rev += 1;
    this.frame.src = `/cinematic.html?play=${encodeURIComponent(id)}&draft=1&muted=1&r=${this.rev}`;
  }
}
