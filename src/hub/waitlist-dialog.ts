import { el } from './dom.js';

const RELEASES_URL = 'https://github.com/recferret-bit/OutOfCredits/releases';

function field(...children: Array<Node | string>): HTMLElement {
  return el('div', { class: 'waitlist-field' }, ...children);
}

function check(id: string, name: string, ...label: Array<Node | string>): HTMLElement {
  return el('label', {}, el('input', { type: 'checkbox', id, name, value: '1', checked: true }), ' ', el('span', {}, ...label));
}

function emailField(): HTMLElement {
  return field(
    el('label', { for: 'waitlist-email' }, 'Email for Launch & Next Fest Alert ', el('span', { 'aria-hidden': 'true' }, '*')),
    el('span', { id: 'waitlist-email-hint', class: 'field-hint' }, 'Format: dev@domain.tld (stored locally until newsletter cutover; zero trackers)'),
    el('input', {
      type: 'email', id: 'waitlist-email', name: 'email', class: 'waitlist-input', required: true, autofocus: true,
      autocomplete: 'email', inputmode: 'email', autocorrect: 'off', autocapitalize: 'none', spellcheck: 'false',
      enterkeyhint: 'done', placeholder: 'you@domain.tld', 'aria-describedby': 'waitlist-email-hint', 'data-error': 'waitlist-email-error',
    }),
    el('div', { id: 'waitlist-email-error', class: 'field-error-msg' },
      el('span', { role: 'img', 'aria-label': 'Error' }, '❌'), ' Enter an email address in the format you@example.com.'),
  );
}

function platformField(): HTMLElement {
  return field(
    el('label', { for: 'waitlist-platform' }, 'Preferred Desktop / Handheld Target'),
    el('select', { id: 'waitlist-platform', name: 'platform', class: 'waitlist-select' },
      el('option', { value: 'macos' }, 'macOS (.dmg Universal / Apple Silicon)'),
      el('option', { value: 'windows' }, 'Windows 10/11 (.msi / .exe)'),
      el('option', { value: 'linux-deck' }, 'Linux / SteamOS Steam Deck (.AppImage / .deb)')),
  );
}

function waitlistForm(): HTMLFormElement {
  return el('form', { id: 'steam-waitlist-form' },
    emailField(),
    platformField(),
    el('fieldset', { class: 'waitlist-checks' },
      el('legend', {}, 'Notify me about'),
      check('waitlist-chk-steam', 'notify_steam', 'Steam "Coming Soon" Store Page & Wishlist launch'),
      check('waitlist-chk-fest', 'notify_fest', 'Free Chapter 1 Steam Demo & Steam Next Fest'),
      check('waitlist-chk-tags', 'notify_tags', 'New ', el('code', {}, 'v*'), ' tagged Tauri desktop builds on GitHub')),
    el('p', { class: 'waitlist-note' },
      el('strong', {}, 'Privacy-first local mode:'),
      ' Out Of Credits ships zero third-party analytics or ad scripts. Saving stores your Launch Pass in browser storage (exportable as JSON) while you follow live ',
      el('code', {}, 'v*'), ' releases on GitHub.'),
    el('div', { id: 'waitlist-dialog-status', class: 'save-feedback', role: 'status', 'aria-live': 'polite', hidden: true }),
    el('div', { class: 'dialog-actions' },
      el('button', { type: 'submit', class: 'comic-btn primary' }, 'Save Steam Launch Pass'),
      el('div', { class: 'dialog-secondary-actions' },
        el('button', { type: 'button', class: 'comic-btn teal', id: 'waitlist-export-btn' }, 'Export Pass (.json)'),
        el('a', { class: 'comic-btn paper', href: RELEASES_URL, target: '_blank', rel: 'noopener noreferrer' }, 'Watch GitHub Tags'))),
  );
}

/** The Steam waitlist dialog, the same on every hub page. Appended to `<body>` once; `wireSteamWaitlist` finds it by id. */
export function renderWaitlistDialog(): void {
  if (document.getElementById('steam-waitlist-dialog')) return;
  document.body.append(
    el('dialog', { id: 'steam-waitlist-dialog', class: 'comic-dialog', closedby: 'any', 'aria-labelledby': 'waitlist-dialog-title' },
      el('div', { class: 'dialog-inner' },
        el('div', { class: 'dialog-head' },
          el('div', {},
            el('span', { class: 'door-kicker orange' }, 'STEAM COMING SOON // LAUNCH PASS'),
            el('h2', { id: 'waitlist-dialog-title' }, 'Wishlist & Next Fest Notification')),
          el('button', { type: 'button', class: 'comic-btn paper', id: 'waitlist-close-btn', 'aria-label': 'Close Steam waitlist dialog' }, '✕')),
        el('p', { class: 'dialog-lead' },
          'Our Steamworks Partner store page & free Chapter 1 Steam Demo are in preparation. Save your target platform pass below and watch GitHub Releases to grab every tagged desktop build the moment it drops.'),
        waitlistForm())),
  );
}
