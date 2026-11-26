/**
 * The terminal skin on the page: which skin is saved, the default by OS, and drawing it on `#terminal-bezel`.
 * Spec: .kiro/specs/terminal-skins/. The look itself is CSS (`src/styles/terminal-skins.css`, keyed on `data-skin`).
 */
import { TERMINAL_SKIN_KEY } from '../contracts/brand.js';
import { DEFAULT_SKIN, isSkinId, skinById, type TerminalSkinId } from '../contracts/terminal-skins.js';
import type { PrefStore } from './sound-pref.js';

function defaultStore(): PrefStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The saved skin, or null (nothing saved, an unknown id, bad JSON, or storage blocked). Never throws. */
export function readSkinPref(store: PrefStore | null = defaultStore()): TerminalSkinId | null {
  try {
    const raw = store?.getItem(TERMINAL_SKIN_KEY) ?? null;
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    return isSkinId(v) ? v : null;
  } catch {
    return null;
  }
}

/** Saves the skin. Returns false when storage is blocked or full. */
export function writeSkinPref(id: TerminalSkinId, store: PrefStore | null = defaultStore()): boolean {
  try {
    if (!store) return false;
    store.setItem(TERMINAL_SKIN_KEY, JSON.stringify(id));
    return true;
  } catch {
    return false;
  }
}

/** The default skin for a platform string (`navigator.userAgentData.platform`, `navigator.platform` or the user agent). */
export function defaultSkinFor(platform: string): TerminalSkinId {
  const p = platform.toLowerCase();
  if (/mac|iphone|ipad|darwin/.test(p)) return 'iterm2';
  if (/win/.test(p)) return 'windows-terminal';
  if (/linux|x11|cros|ubuntu|fedora/.test(p)) return 'gnome-terminal';
  return DEFAULT_SKIN;
}

/** The platform string of this browser, or '' outside a browser. */
function currentPlatform(): string {
  if (typeof navigator === 'undefined') return '';
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return nav.userAgentData?.platform || nav.platform || nav.userAgent || '';
}

/** The skin to start with: the saved one, else the OS default. */
export function initialSkin(store?: PrefStore | null, platform = currentPlatform()): TerminalSkinId {
  return readSkinPref(store) ?? defaultSkinFor(platform);
}

/** Draws `id` on the terminal window: `data-skin` on the bezel picks the CSS, the title text follows the skin. */
export function applySkin(bezel: HTMLElement | null, id: TerminalSkinId): void {
  if (!bezel) return;
  const skin = skinById(id);
  bezel.dataset.skin = skin.id;
  const setText = (selector: string, text: string): void => {
    for (const node of Array.from(bezel.querySelectorAll<HTMLElement>(selector))) {
      if (node.textContent !== text) node.textContent = text;
    }
  };
  setText('.tty-title', skin.title);
  setText('.tty-tab-label', skin.tab);
}
