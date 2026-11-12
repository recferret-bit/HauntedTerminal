import '../styles/hub.css';
import '../styles/comix-reader.css';
import { buildPlayUrl, CHAPTER_MANIFESTS, getChapterComix, getChapterManifest } from '../chapters/catalog.js';
import type { ComixPageSpec, ComixStorySpec } from '../chapters/types.js';
import { escHtml as esc } from '../renderer/html-escape.js';
import { sheetHtml, shellHtml } from './comix-dom.js';
import { disposePanels, mountPagePanels, type LivePanel } from './comix-panel.js';

interface Reader {
  comix: ComixStorySpec;
  chapterId: string;
  page: number;
  /** Index of the panel the page is revealing. Earlier panels have already finished. */
  cursor: number;
  paused: boolean;
  time: number;
  panels: LivePanel[];
  raf: number;
  last: number;
}

function pageSpec(comix: ComixStorySpec, pageNumber: number): ComixPageSpec {
  return comix.pages.find((page) => page.pageNumber === pageNumber) ?? comix.pages[0]!;
}

function syncUrl(reader: Reader): void {
  const query = new URLSearchParams();
  query.set('chapter', reader.chapterId);
  query.set('page', String(reader.page));
  window.history.replaceState(null, '', `/comic.html?${query.toString()}`);
}

function syncButtons(root: ParentNode, reader: Reader): void {
  const prev = root.querySelector<HTMLButtonElement>('#comix-prev')!;
  const next = root.querySelector<HTMLButtonElement>('#comix-next')!;
  const pause = root.querySelector<HTMLButtonElement>('#comix-pause')!;
  prev.disabled = reader.page <= 1;
  next.disabled = reader.page >= reader.comix.pages.length;
  pause.textContent = reader.paused ? 'Play' : 'Pause';
  pause.setAttribute('aria-pressed', reader.paused ? 'true' : 'false');
}

function paintPanels(root: ParentNode, reader: Reader): void {
  root.querySelectorAll<HTMLElement>('.comix-panel').forEach((el, index) => {
    const panel = reader.panels[index];
    if (!panel) return;
    el.classList.toggle('on', panel.started());
    el.classList.toggle('playing', panel.busy());
    el.classList.toggle('done', panel.complete() && panel.started());
  });
}

function openPage(root: HTMLElement, reader: Reader): void {
  disposePanels(reader.panels);
  const spec = pageSpec(reader.comix, reader.page);
  const wrap = root.querySelector<HTMLElement>('#comix-sheet-wrap')!;
  wrap.innerHTML = sheetHtml(reader.comix, spec);
  reader.cursor = 0;
  reader.panels = mountPagePanels(wrap, spec.panels);
  for (const panel of reader.panels) panel.resize();
  if (!reader.paused) reader.panels[0]?.replay();
  paintPanels(root, reader);
  syncUrl(reader);
  syncButtons(root, reader);
}

function revealNext(reader: Reader): void {
  if (reader.paused) return;
  const panel = reader.panels[reader.cursor];
  if (!panel) return;
  if (!panel.started()) panel.replay();
  if (panel.complete() && reader.cursor < reader.panels.length - 1) {
    reader.cursor += 1;
    reader.panels[reader.cursor]?.replay();
  }
}

function frame(root: HTMLElement, reader: Reader, now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - reader.last) / 1000));
  reader.last = now;
  revealNext(reader);
  if (!reader.paused) reader.time += dt;
  for (const panel of reader.panels) {
    const moving = panel.started() && (!reader.paused || panel.busy());
    if (moving) panel.step(dt);
    if (panel.started()) panel.render(reader.time);
  }
  paintPanels(root, reader);
  reader.raf = window.requestAnimationFrame((t) => frame(root, reader, t));
}

function bind(root: HTMLElement, reader: Reader): void {
  root.querySelector('#comix-prev')!.addEventListener('click', () => {
    if (reader.page <= 1) return;
    reader.page -= 1;
    openPage(root, reader);
  });
  root.querySelector('#comix-next')!.addEventListener('click', () => {
    if (reader.page >= reader.comix.pages.length) return;
    reader.page += 1;
    openPage(root, reader);
  });
  root.querySelector('#comix-pause')!.addEventListener('click', () => {
    reader.paused = !reader.paused;
    syncButtons(root, reader);
  });
  root.querySelector('#comix-sheet-wrap')!.addEventListener('click', (event) => {
    const article = (event.target as HTMLElement).closest<HTMLElement>('.comix-panel');
    if (!article) return;
    const panel = reader.panels[Number(article.dataset.i)];
    if (!panel?.complete() || !panel.started()) return;
    panel.replay();
    article.classList.remove('playing');
    void article.offsetWidth;
    article.classList.add('playing');
  });
  window.addEventListener('keydown', (event) => {
    if (event.key !== ' ' && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    if (event.key === ' ') root.querySelector<HTMLButtonElement>('#comix-pause')!.click();
    if (event.key === 'ArrowLeft') root.querySelector<HTMLButtonElement>('#comix-prev')!.click();
    if (event.key === 'ArrowRight') root.querySelector<HTMLButtonElement>('#comix-next')!.click();
  });
}

function missing(mount: HTMLElement, chapterId: string): void {
  mount.innerHTML = `<div class="pill-box"><p>No comix for <code>${esc(chapterId)}</code> yet.</p></div>`;
}

function boot(): void {
  const mount = document.getElementById('reader-mount');
  const playCta = document.getElementById('reader-play-cta') as HTMLAnchorElement | null;
  if (!mount) return;
  const params = new URLSearchParams(location.search);
  const chapterId = params.get('chapter') ?? CHAPTER_MANIFESTS[0]?.id ?? '';
  const manifest = getChapterManifest(chapterId);
  if (manifest && playCta) {
    playCta.href = buildPlayUrl(manifest.id, manifest.levels[0], true);
    playCta.textContent = `Play ${manifest.badge} →`;
  }
  const comix = getChapterComix(chapterId);
  if (!comix || comix.pages.length === 0) {
    missing(mount, chapterId);
    return;
  }
  const requested = Number(params.get('page') ?? '1') || 1;
  const reader: Reader = {
    comix,
    chapterId,
    page: Math.max(1, Math.min(comix.pages.length, requested)),
    cursor: 0,
    paused: false,
    time: 0,
    panels: [],
    raf: 0,
    last: performance.now(),
  };
  mount.innerHTML = shellHtml();
  bind(mount, reader);
  openPage(mount, reader);
  reader.raf = window.requestAnimationFrame((t) => frame(mount, reader, t));
  window.addEventListener('pagehide', () => {
    window.cancelAnimationFrame(reader.raf);
    disposePanels(reader.panels);
  });
}

boot();
