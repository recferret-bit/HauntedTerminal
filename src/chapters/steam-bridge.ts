/**
 * Release metadata and optional Tauri v2 + Steamworks desktop IPC bridge.
 * In the browser (or standalone desktop builds compiled without the `steam` Cargo feature),
 * every bridge call degrades gracefully without throwing or blocking gameplay.
 * Once a real Steam App ID is issued (see `.kiro/specs/steamworks-store-release/`), set
 * `steamAppId` and `steamStoreUrl` below to switch every Wishlist CTA to the live store page.
 */
export const GITHUB_REPO_URL = 'https://github.com/recferret-bit/HauntedTerminal';
export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;
export const GITHUB_LATEST_RELEASE_URL = `${GITHUB_RELEASES_URL}/latest`;

const STEAM_STORE_APP_RX = /^https:\/\/store\.steampowered\.com\/app\/\d+(?:[/?#]|$)/;
const GITHUB_REPO_RX = /^https:\/\/github\.com\/recferret-bit\/HauntedTerminal(?:[/?#]|$)/;

export interface SteamReleaseMeta {
  readonly status: 'coming-soon' | 'live';
  readonly steamAppId: number | null;
  readonly steamDemoAppId: number | null;
  readonly steamStoreUrl: string;
  readonly waitlistFormUrl: string;
}

export const STEAM_RELEASE_META: SteamReleaseMeta = {
  status: 'coming-soon',
  steamAppId: null,
  steamDemoAppId: null,
  steamStoreUrl: '',
  waitlistFormUrl: '',
};

export function isAllowedExternalReleaseUrl(url: string): boolean {
  if (!url || url.length > 512 || /[\s"'<>\\`\x00-\x1f]/.test(url)) return false;
  if (url.includes('..') || /%2e/i.test(url) || url.slice('https://'.length).includes('//')) return false;
  return STEAM_STORE_APP_RX.test(url) || GITHUB_REPO_RX.test(url);
}

export function resolveSteamWishlistHref(meta: SteamReleaseMeta = STEAM_RELEASE_META): { href: string; external: boolean } {
  if (meta.steamStoreUrl && isAllowedExternalReleaseUrl(meta.steamStoreUrl)) {
    return { href: meta.steamStoreUrl, external: true };
  }
  return { href: '/?wishlist=1', external: false };
}

export interface SteamRuntimeStatus {
  tauri: boolean;
  steamEnabled: boolean;
  steamRunning: boolean;
  steamDeck: boolean;
  appId: number | null;
}

interface TauriInternals {
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

function getTauriInvoke(): ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null {
  if (typeof window === 'undefined') return null;
  const host = window as unknown as { __TAURI_INTERNALS__?: TauriInternals };
  const fn = host.__TAURI_INTERNALS__?.invoke;
  return typeof fn === 'function' ? fn.bind(host.__TAURI_INTERNALS__) : null;
}

export function isTauriDesktop(): boolean {
  return getTauriInvoke() !== null;
}

export async function invokeTauriCommand<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  try {
    return (await invoke(cmd, args)) as T;
  } catch {
    return null;
  }
}

export async function querySteamStatus(): Promise<SteamRuntimeStatus> {
  const res = await invokeTauriCommand<Partial<SteamRuntimeStatus>>('steam_status');
  if (!res) {
    return {
      tauri: isTauriDesktop(),
      steamEnabled: false,
      steamRunning: false,
      steamDeck: false,
      appId: STEAM_RELEASE_META.steamAppId,
    };
  }
  return {
    tauri: true,
    steamEnabled: Boolean(res.steamEnabled),
    steamRunning: Boolean(res.steamRunning),
    steamDeck: Boolean(res.steamDeck),
    appId: typeof res.appId === 'number' ? res.appId : STEAM_RELEASE_META.steamAppId,
  };
}

export function openExternalReleaseUrl(url: string): boolean {
  if (!isAllowedExternalReleaseUrl(url)) return false;
  if (isTauriDesktop()) {
    void invokeTauriCommand<boolean>('desktop_open_external_url', { url });
    return true;
  }
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }
  return false;
}

const wiredExternalRoots = new WeakSet<ParentNode>();

export function wireExternalLinksForDesktop(root: ParentNode | null = typeof document !== 'undefined' ? document : null): void {
  if (!root || wiredExternalRoots.has(root)) return;
  wiredExternalRoots.add(root);
  root.addEventListener('click', (ev) => {
    if (ev.defaultPrevented || !isTauriDesktop() || !(ev.target instanceof Element)) return;
    const anchor = ev.target.closest('a[href]');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    if (!isAllowedExternalReleaseUrl(href)) return;
    ev.preventDefault();
    openExternalReleaseUrl(href);
  });
}

export function wireSteamWishlistLink(
  anchor: HTMLAnchorElement | null,
  meta: SteamReleaseMeta = STEAM_RELEASE_META,
): void {
  if (!anchor) return;
  const target = resolveSteamWishlistHref(meta);
  anchor.href = target.href;
  if (target.external) {
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
  } else {
    anchor.removeAttribute('target');
    anchor.removeAttribute('rel');
  }
}

export async function requestSteamFloatingKeyboard(
  rect: { x: number; y: number; width: number; height: number } = { x: 0, y: 520, width: 1280, height: 280 },
): Promise<boolean> {
  if (!isTauriDesktop()) return false;
  const ok = await invokeTauriCommand<boolean>('steam_show_floating_keyboard', rect);
  return Boolean(ok);
}

export async function forwardSteamAchievement(steamApiName: string): Promise<boolean> {
  if (!steamApiName) return false;
  const res = await invokeTauriCommand<{ unlocked?: boolean }>('steam_unlock_achievement', { apiName: steamApiName });
  return Boolean(res?.unlocked);
}

export async function syncSteamAchievements(
  apiNames: readonly string[],
): Promise<{ tauri: boolean; synced: number; steamRunning: boolean }> {
  const unique = [...new Set(apiNames.filter(Boolean))];
  const res = await invokeTauriCommand<{ synced?: number; steamRunning?: boolean }>('steam_sync_achievements', {
    apiNames: unique,
  });
  if (!res) return { tauri: isTauriDesktop(), synced: 0, steamRunning: false };
  return {
    tauri: true,
    synced: typeof res.synced === 'number' ? res.synced : 0,
    steamRunning: Boolean(res.steamRunning),
  };
}

/** Reads `<app_data_dir>/haunted-terminal-save.json` (used for cross-OS Steam Auto-Cloud & Tauri persistence). */
export async function readDesktopSaveBundle(): Promise<string | null> {
  const raw = await invokeTauriCommand<string | null>('desktop_read_save_bundle');
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/** Atomically writes `<app_data_dir>/haunted-terminal-save.json` inside the Tauri desktop shell. */
export async function writeDesktopSaveBundle(bundleJson: string): Promise<boolean> {
  if (!bundleJson) return false;
  const ok = await invokeTauriCommand<boolean>('desktop_write_save_bundle', { bundleJson });
  return Boolean(ok);
}

let desktopSaveProvider: (() => string) | null = null;
let saveSyncQueued = false;
let suppressSaveSyncDepth = 0;

export function registerDesktopSaveProvider(provider: () => string): void {
  desktopSaveProvider = provider;
}

export function withDesktopSaveSyncSuppressed<T>(fn: () => T): T {
  suppressSaveSyncDepth += 1;
  try {
    return fn();
  } finally {
    suppressSaveSyncDepth -= 1;
  }
}

/** Coalesces localStorage progress/perk/achievement writes into `<app_data_dir>/haunted-terminal-save.json` on Tauri. */
export function scheduleDesktopSaveSync(): void {
  if (suppressSaveSyncDepth > 0 || saveSyncQueued || !desktopSaveProvider || !isTauriDesktop()) return;
  saveSyncQueued = true;
  queueMicrotask(() => {
    saveSyncQueued = false;
    if (suppressSaveSyncDepth > 0 || !desktopSaveProvider || !isTauriDesktop()) return;
    void writeDesktopSaveBundle(desktopSaveProvider());
  });
}

export async function downloadJsonBlob(filename: string, data: unknown): Promise<string | null> {
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  if (isTauriDesktop()) {
    return invokeTauriCommand<string>('desktop_export_json_file', {
      filename,
      jsonContent: serialized,
    });
  }
  if (typeof document === 'undefined' || typeof Blob === 'undefined') return null;
  const blob = new Blob([serialized], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.hidden = true;
  document.body?.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return filename;
}
