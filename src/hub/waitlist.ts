import {
  GITHUB_RELEASES_URL,
  STEAM_RELEASE_META,
  downloadJsonBlob,
  isAllowedExternalReleaseUrl,
  isTauriDesktop,
  openExternalReleaseUrl,
  type SteamReleaseMeta,
} from '../chapters/steam-bridge.js';

export const WAITLIST_STORAGE_KEY = 'haunted-terminal:waitlist:v1';

export type TargetPlatform = 'macos' | 'windows' | 'linux-deck';

export interface WaitlistEntry {
  email: string;
  platform: TargetPlatform;
  notifySteamPage: boolean;
  notifyNextFest: boolean;
  notifyGithubTags: boolean;
  savedAt: string;
}

export function readWaitlistEntry(): WaitlistEntry | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(WAITLIST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WaitlistEntry>;
    if (typeof parsed?.email !== 'string' || !parsed.email.includes('@')) return null;
    const platform: TargetPlatform =
      parsed.platform === 'macos' || parsed.platform === 'windows' || parsed.platform === 'linux-deck'
        ? parsed.platform
        : 'macos';
    return {
      email: parsed.email,
      platform,
      notifySteamPage: parsed.notifySteamPage !== false,
      notifyNextFest: parsed.notifyNextFest !== false,
      notifyGithubTags: parsed.notifyGithubTags !== false,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveWaitlistEntry(entry: WaitlistEntry): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(WAITLIST_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Ignore storage quota errors in restricted/private mode
  }
}

function linkFieldError(input: HTMLInputElement, shown: boolean): void {
  const errorId = input.dataset.error;
  if (!errorId) return;
  const ids = (input.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter((id) => id && id !== errorId);
  if (shown) ids.push(errorId);
  if (ids.length > 0) input.setAttribute('aria-describedby', ids.join(' '));
  else input.removeAttribute('aria-describedby');
}

function spokenErrorText(node: HTMLElement): string {
  const copy = node.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  copy.querySelectorAll('[role="img"][aria-label]').forEach((n) => {
    n.replaceWith(`${n.getAttribute('aria-label')}: `);
  });
  return copy.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function installAriaValidation(form: HTMLFormElement, statusEl?: HTMLElement | null): void {
  const announcer = document.createElement('div');
  announcer.setAttribute('aria-live', 'polite');
  announcer.className = 'visually-hidden';
  document.body.append(announcer);

  const supportsUserInvalid =
    typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('selector(:user-invalid)');
  const dirty = new WeakMap<HTMLInputElement, { touched: boolean; blurred: boolean }>();
  const announced = new WeakSet<HTMLInputElement>();
  let timer = 0;
  let announcedField: HTMLInputElement | null = null;

  const sync = (input: HTMLInputElement, announce: boolean): void => {
    const st = dirty.get(input);
    const interactedInvalid = Boolean(st?.touched && st?.blurred && !input.validity.valid);
    const invalid = (supportsUserInvalid && input.matches(':user-invalid')) || interactedInvalid;
    input.classList.toggle('user-invalid-fallback', invalid);
    input.classList.toggle('user-valid-fallback', Boolean(st?.touched && input.validity.valid));
    input.setAttribute('aria-invalid', invalid ? 'true' : 'false');
    linkFieldError(input, invalid);
    if (invalid) {
      if (statusEl) statusEl.hidden = true;
      if (announce && !announced.has(input) && input.dataset.error) {
        const errEl = document.getElementById(input.dataset.error);
        const label = input.labels?.[0] ? `${spokenErrorText(input.labels[0])}: ` : '';
        window.clearTimeout(timer);
        announcer.textContent = '';
        announcedField = input;
        announced.add(input);
        if (errEl) {
          timer = window.setTimeout(() => {
            announcer.textContent = `${label}${spokenErrorText(errEl)}`;
          }, 450);
        }
      }
    } else {
      announced.delete(input);
      if (announcedField === input) {
        window.clearTimeout(timer);
        announcer.textContent = '';
        announcedField = null;
      }
    }
  };

  form.querySelectorAll<HTMLInputElement>('input:not([type="checkbox"])').forEach((el) => el.setAttribute('aria-invalid', 'false'));
  form.addEventListener('input', (e) => {
    if (!(e.target instanceof HTMLInputElement) || e.target.type === 'checkbox') return;
    const cur = dirty.get(e.target) ?? { touched: false, blurred: false };
    cur.touched = true;
    dirty.set(e.target, cur);
    sync(e.target, false);
  });
  form.addEventListener(
    'blur',
    (e) => {
      if (!(e.target instanceof HTMLInputElement) || e.target.type === 'checkbox') return;
      const cur = dirty.get(e.target) ?? { touched: false, blurred: false };
      cur.blurred = true;
      dirty.set(e.target, cur);
      sync(e.target, true);
    },
    true,
  );
  form.addEventListener(
    'invalid',
    (e) => {
      if (!(e.target instanceof HTMLInputElement) || e.target.type === 'checkbox') return;
      announced.add(e.target);
      dirty.set(e.target, { touched: true, blurred: true });
      sync(e.target, false);
    },
    true,
  );
}

function installClosedByAnyFallback(dialog: HTMLDialogElement): void {
  if ('closedBy' in HTMLDialogElement.prototype) return;
  const outside = (e: PointerEvent): boolean => {
    if (e.target !== dialog) return false;
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let pressedOutside = false;
  dialog.addEventListener('pointerdown', (e) => {
    pressedOutside = outside(e);
  });
  dialog.addEventListener('pointerup', (e) => {
    if (pressedOutside && outside(e)) dialog.close();
  });
}

function openWaitlistModal(dialog: HTMLDialogElement | null, meta: SteamReleaseMeta = STEAM_RELEASE_META): void {
  if (meta.steamStoreUrl && isAllowedExternalReleaseUrl(meta.steamStoreUrl)) {
    openExternalReleaseUrl(meta.steamStoreUrl);
    return;
  }
  if (dialog && !dialog.open) dialog.showModal();
}

export function syncSteamCtaLabels(
  root: ParentNode = document,
  meta: SteamReleaseMeta = STEAM_RELEASE_META,
): number {
  if (!meta.steamStoreUrl || !isAllowedExternalReleaseUrl(meta.steamStoreUrl)) return 0;
  let updated = 0;
  root.querySelectorAll<HTMLElement>('[data-open-waitlist]').forEach((btn) => {
    btn.textContent = '★ Wishlist on Steam ↗';
    updated += 1;
  });
  const heroTag = root.querySelector<HTMLElement>('[data-steam-status-tag]');
  if (heroTag) {
    heroTag.textContent =
      meta.status === 'live' ? 'STEAM EDITION // AVAILABLE ON STEAM' : 'STEAM STORE // WISHLIST NOW';
  }
  return updated;
}

function wireWaitlistSubmitAndExport(
  form: HTMLFormElement,
  emailInput: HTMLInputElement,
  platformSelect: HTMLSelectElement,
  checks: { steam: HTMLInputElement | null; fest: HTMLInputElement | null; tags: HTMLInputElement | null },
  statusEl: HTMLElement | null,
  exportBtn: HTMLButtonElement | null,
  onSaved: (entry: WaitlistEntry) => void,
): void {
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!form.checkValidity()) {
      form.querySelector<HTMLElement>(':invalid')?.focus();
      return;
    }
    const entry: WaitlistEntry = {
      email: emailInput.value.trim(),
      platform: (platformSelect.value as TargetPlatform) || 'macos',
      notifySteamPage: checks.steam ? checks.steam.checked : true,
      notifyNextFest: checks.fest ? checks.fest.checked : true,
      notifyGithubTags: checks.tags ? checks.tags.checked : true,
      savedAt: new Date().toISOString(),
    };
    saveWaitlistEntry(entry);
    onSaved(entry);
    if (STEAM_RELEASE_META.waitlistFormUrl) {
      void fetch(STEAM_RELEASE_META.waitlistFormUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(entry),
      }).catch(() => undefined);
    }
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.classList.remove('err');
      const ghLink = document.createElement('a');
      ghLink.href = GITHUB_RELEASES_URL;
      ghLink.target = '_blank';
      ghLink.rel = 'noopener noreferrer';
      ghLink.textContent = 'Watch GitHub Releases ↗';
      statusEl.replaceChildren(
        document.createTextNode(`Saved Launch Pass (${entry.email} • ${entry.platform.toUpperCase()}). Next: `),
        ghLink,
        document.createTextNode(' for instant v* desktop tag notifications!'),
      );
    }
  });

  if (exportBtn) {
    exportBtn.onclick = async () => {
      const saved = readWaitlistEntry();
      if (!saved) {
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.classList.remove('err');
          statusEl.textContent = 'Save your email & target OS above first to export your Waitlist Pass.';
        }
        return;
      }
      const savedPath = await downloadJsonBlob('haunted-terminal-steam-waitlist.json', saved);
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.classList.toggle('err', savedPath === null);
        const label = savedPath ? savedPath.split(/[\\/]/).pop() ?? savedPath : '';
        statusEl.textContent = savedPath
          ? `Exported Waitlist Pass (${label}).`
          : 'Could not export Waitlist Pass to Downloads directory.';
      }
    };
  }
}

export function wireSteamWaitlist(onSaved: (entry: WaitlistEntry) => void): void {
  const dialog = document.getElementById('steam-waitlist-dialog') as HTMLDialogElement | null;
  const form = document.getElementById('steam-waitlist-form') as HTMLFormElement | null;
  const emailInput = document.getElementById('waitlist-email') as HTMLInputElement | null;
  const platformSelect = document.getElementById('waitlist-platform') as HTMLSelectElement | null;
  const chkSteam = document.getElementById('waitlist-chk-steam') as HTMLInputElement | null;
  const chkFest = document.getElementById('waitlist-chk-fest') as HTMLInputElement | null;
  const chkTags = document.getElementById('waitlist-chk-tags') as HTMLInputElement | null;
  const statusEl = document.getElementById('waitlist-dialog-status');
  const exportBtn = document.getElementById('waitlist-export-btn') as HTMLButtonElement | null;
  const closeBtn = document.getElementById('waitlist-close-btn') as HTMLButtonElement | null;

  syncSteamCtaLabels(document, STEAM_RELEASE_META);
  document.querySelectorAll<HTMLElement>('[data-open-waitlist]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      openWaitlistModal(dialog);
    });
  });

  if (!dialog || !form || !emailInput || !platformSelect) return;
  installClosedByAnyFallback(dialog);
  installAriaValidation(form, statusEl);
  dialog.addEventListener('close', () => {
    dialog.returnValue = '';
  });
  if (closeBtn) closeBtn.onclick = () => dialog.close();

  const existing = readWaitlistEntry();
  if (existing) {
    emailInput.value = existing.email;
    platformSelect.value = existing.platform;
    if (chkSteam) chkSteam.checked = existing.notifySteamPage;
    if (chkFest) chkFest.checked = existing.notifyNextFest;
    if (chkTags) chkTags.checked = existing.notifyGithubTags;
  }

  // Support deep-link from End-of-Demo Victory Card (`/?wishlist=1`).
  const params = new URLSearchParams(window.location.search);
  if (params.get('wishlist') === '1') {
    params.delete('wishlist');
    const cleanSearch = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${window.location.hash}`);
    if (STEAM_RELEASE_META.steamStoreUrl && !isTauriDesktop() && isAllowedExternalReleaseUrl(STEAM_RELEASE_META.steamStoreUrl)) {
      window.location.assign(STEAM_RELEASE_META.steamStoreUrl);
      return;
    }
    openWaitlistModal(dialog);
  }

  wireWaitlistSubmitAndExport(
    form,
    emailInput,
    platformSelect,
    { steam: chkSteam, fest: chkFest, tags: chkTags },
    statusEl,
    exportBtn,
    onSaved,
  );
}
