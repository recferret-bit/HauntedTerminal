/**
 * Full screen for every player page (spec `.kiro/specs/fullscreen-mode/`).
 * Web: the Fullscreen API on the whole page. Tauri: the window itself, through the core window plugin
 * (the window also starts full screen from `tauri.conf.json`). Nothing is saved; a refused request does nothing.
 */
import { invokeTauriCommand, isTauriDesktop } from './steam-bridge.js';

type Listener = (on: boolean) => void;

const TAURI_WINDOW = 'main';
const listeners = new Set<Listener>();
let tauriOn = false;
let keyInstalled = false;
let watching = false;

function doc(): Document | null {
  return typeof document === 'undefined' ? null : document;
}

function notify(on: boolean): void {
  for (const fn of listeners) fn(on);
}

async function readTauri(): Promise<boolean> {
  const res = await invokeTauriCommand<boolean>('plugin:window|is_fullscreen', { label: TAURI_WINDOW });
  return res === true;
}

async function refreshTauri(): Promise<void> {
  const on = await readTauri();
  if (on === tauriOn) return;
  tauriOn = on;
  notify(on);
}

/** Starts the one change watcher: `fullscreenchange` on the web, window `resize` in Tauri. */
function watch(): void {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  if (isTauriDesktop()) {
    void refreshTauri();
    window.addEventListener('resize', () => void refreshTauri());
    return;
  }
  doc()?.addEventListener('fullscreenchange', () => notify(isFullscreen()));
}

export function isFullscreen(): boolean {
  if (isTauriDesktop()) return tauriOn;
  return (doc()?.fullscreenElement ?? null) !== null;
}

/** Calls `fn` with the new state whenever full screen starts or ends, by any means. Returns the unsubscribe. */
export function onFullscreenChange(fn: Listener): () => void {
  watch();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Toggles full screen and resolves to the state afterwards. Never throws. */
export async function toggleFullscreen(): Promise<boolean> {
  watch();
  if (isTauriDesktop()) {
    const want = !(await readTauri());
    // set_fullscreen returns null on success too, so the state is read back rather than inferred.
    await invokeTauriCommand<unknown>('plugin:window|set_fullscreen', { label: TAURI_WINDOW, value: want });
    tauriOn = await readTauri();
    notify(tauriOn);
    return tauriOn;
  }
  const d = doc();
  if (!d) return false;
  try {
    if (d.fullscreenElement) await d.exitFullscreen();
    else if (typeof d.documentElement.requestFullscreen === 'function') await d.documentElement.requestFullscreen();
  } catch {
    // Refused (no user gesture, an iframe without `allow`, unsupported): leave the state as it is.
  }
  return isFullscreen();
}

/** Binds F11 to `toggleFullscreen()` once per page (capture phase, before xterm and the Esc menu). */
export function installFullscreenKey(): void {
  if (keyInstalled || typeof window === 'undefined') return;
  keyInstalled = true;
  watch();
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'F11') return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) void toggleFullscreen();
  }, true);
}
