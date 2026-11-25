import { createAppBus, type AppBus, type MusicSurface } from '../contracts/app-bus.js';
import { readSoundPref } from '../contracts/sound-pref.js';
import { attachAudio, type AudioHandle } from './attach.js';
import { sceneFor } from './music-for.js';

export interface PageAudioOptions {
  muted?: boolean;
  volume?: number;
}

export interface PageAudio extends AudioHandle {
  bus: AppBus;
  readonly muted: boolean;
}

/** Interactive controls whose click (or range change) drives UI sound cleanly. */
const CONTROL_SEL = [
  'button', 'a', 'summary', 'select',
  'input:not([type="text"]):not([type="search"]):not([type="email"]):not([type="password"]):not([type="number"]):not([type="range"]):not([type="file"])',
  '[role="button"]', '[role="switch"]', '[role="tab"]', '[role="checkbox"]', '[role="radio"]',
  '.item-slot', '.lt-icon', '.mb-hit-item', '.comix-panel',
].join(',');

const CLASS_IDS = [
  'mb-corner-left', 'mb-corner-right', 'mb-tab-btn', 'mb-toc-sec-btn', 'mb-toc-link',
  'mb-close-btn', 'mb-link-btn', 'mb-nav-btn',
  'mb-insert-btn', 'mb-chip-btn', 'mb-mini-btn', 'mb-filter-pill', 'mb-search-clear',
  'mb-hit-item', 'mb-rel-btn', 'htc-btn-skip', 'htc-btn', 'perk-action-btn', 'hl-sw', 'pd-tab',
  'lt-key', 'lt-pad', 'lt-btn', 'lt-lid', 'lt-icon', 'lt-taskbtn',
  'ce-chip', 'tut-skip', 'issue-tab', 'level-card', 'hub-tab', 'comix-panel',
] as const;

function semanticControlId(el: Element, target: Element): string {
  if (el.classList.contains('item-slot')) {
    const item = el.getAttribute('data-item') || [...el.classList].find((c) => c !== 'item-slot' && c.startsWith('item-')) || 'slot';
    return item.includes('item') ? item : `item-${item}`;
  }
  if (el.classList.contains('mb-chip-btn') && el.closest('.mb-cover-body')) return 'mb-cover-chip';
  if (el instanceof HTMLElement && el.dataset.ev) return `dev-ev:${el.dataset.ev}`;
  if (el instanceof HTMLElement && el.dataset.give) return `dev-give:${el.dataset.give}`;
  if (el.id) return el.id;
  for (const cls of CLASS_IDS) {
    if (el.classList.contains(cls)) return cls;
  }
  const label = el.getAttribute('aria-label');
  if (label) return label;
  return (target instanceof HTMLElement && target.id) || el.tagName.toLowerCase();
}

function isDisabledControl(el: Element): boolean {
  if (el.getAttribute('aria-disabled') === 'true') return true;
  return 'disabled' in el && Boolean((el as { disabled?: boolean }).disabled);
}

/** Label text clicks forward a synthetic click to `<input>`; skip the label pass to avoid double audio. */
function isLabelForwardClick(target: Element, ctrl: Element | null): boolean {
  const label = target.closest('label');
  if (!label?.control || target === label.control) return false;
  return !ctrl || ctrl === label.control;
}

/** Clicks (and range releases) on interactive controls become pointer events on the bus. */
export function bindPointerEvents(root: ParentNode, bus: AppBus, surface: string): () => void {
  const onClick = (ev: Event): void => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const ctrl = target.closest(CONTROL_SEL);
    if (!ctrl || isDisabledControl(ctrl) || isLabelForwardClick(target, ctrl)) return;
    if (ctrl.classList.contains('xterm-helper-textarea')) return;
    if (!ev.isTrusted && ctrl instanceof HTMLAnchorElement && ctrl.hasAttribute('download')) return;
    bus.emit({ kind: 'pointer', surface, id: semanticControlId(ctrl, target) });
  };
  const onChange = (ev: Event): void => {
    const target = ev.target;
    if (target instanceof HTMLSelectElement && !isDisabledControl(target)) {
      bus.emit({ kind: 'pointer', surface, id: semanticControlId(target, target) });
      return;
    }
    if (!(target instanceof HTMLInputElement) || target.type !== 'range' || isDisabledControl(target)) return;
    bus.emit({ kind: 'pointer', surface, id: target.id || target.dataset.key || 'range' });
  };
  root.addEventListener('click', onClick, true);
  root.addEventListener('change', onChange, true);
  return () => {
    root.removeEventListener('click', onClick, true);
    root.removeEventListener('change', onChange, true);
  };
}

export function queryMuted(): boolean {
  try {
    const search = typeof window !== 'undefined' && window.location ? window.location.search : (typeof location !== 'undefined' ? location.search : '');
    if (!search) return false;
    const params = new URLSearchParams(search);
    return params.get('mute') === '1' || params.get('muted') === '1';
  } catch {
    return false;
  }
}

/** A page that is not the play session: its own bus, both orchestrators, and click events. */
export function startPageAudio(
  surface: MusicSurface | null,
  root: ParentNode = document,
  opts: PageAudioOptions = {},
): PageAudio {
  const pref = readSoundPref();
  let muted = queryMuted() ? true : (opts.muted ?? pref?.muted ?? false);
  const volume = opts.volume ?? pref?.volume ?? 1;
  const bus = createAppBus();
  const audio = attachAudio(bus, { muted, volume });
  const unbind = bindPointerEvents(root, bus, surface ?? 'page');
  if (surface) bus.emit({ kind: 'scene', scene: sceneFor(surface) });
  return {
    bus,
    get muted() { return muted; },
    setMuted(next) {
      muted = next;
      audio.setMuted(next);
    },
    setVolume(next) { audio.setVolume(next); },
    dispose() {
      unbind();
      audio.dispose();
    },
  };
}
