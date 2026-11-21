#!/usr/bin/env node
// Real headless Chrome smoke test for the startup landing funnel (`/`), native <dialog> waitlist validation,
// live trophy rack & portable JSON save import, offline zero-CDN network check, and `/chapters.html?tab=achievements`.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { projectRoot, startPageServer } from '../harness/lib/load.mjs';
import { verifySteamOpensInPlace, verifyTabSwitching } from './landing-tabs-check.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const outDir = resolve(projectRoot, 'scripts/harness/out');

function findChrome() {
  return [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].find((p) => p && existsSync(p));
}

function connectCdp(wsUrl) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    const listeners = [];
    ws.addEventListener('open', () =>
      res({
        send(method, params = {}) {
          const id = nextId++;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((ok, fail) => pending.set(id, { ok, fail, method }));
        },
        on: (fn) => listeners.push(fn),
        close: () => ws.close(),
      }),
    );
    ws.addEventListener('error', () => rej(new Error('CDP websocket error')));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const entry = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) entry.fail(new Error(`${entry.method}: ${msg.error.message}`));
        else entry.ok(msg.result);
      } else if (msg.method) {
        listeners.forEach((fn) => fn(msg));
      }
    });
  });
}

async function launchChromeCdp(chromePath, profile, origin, errors, externalUrls) {
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--window-size=1440,900',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  const debugPort = await new Promise((res, rej) => {
    let buf = '';
    chrome.stderr.on('data', (d) => {
      buf += d;
      const m = /DevTools listening on ws:\/\/[^:]+:(\d+)\//.exec(buf);
      if (m) res(Number(m[1]));
    });
    chrome.on('exit', (c) => rej(new Error(`Chrome exited (${c}): ${buf}`)));
  });

  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const cdp = await connectCdp(page.webSocketDebuggerUrl);

  cdp.on((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(`exception: ${msg.params.exceptionDetails?.text}`);
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    } else if (msg.method === 'Network.requestWillBeSent') {
      const u = String(msg.params.request?.url ?? '');
      if (/^https?:\/\//i.test(u) && !u.startsWith(origin)) externalUrls.push(u);
    }
  });

  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  return { chrome, cdp };
}

function makeEvaluator(cdp) {
  return async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
}

async function measureContrast(evalJs, selector) {
  return evalJs(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    const cs = getComputedStyle(el);
    const parseRgb = (s) => (s.match(/\\d+(\\.\\d+)?/g) || [0, 0, 0]).slice(0, 3).map((n) => Number(n) / 255);
    const lum = ([r, g, b]) =>
      [r, g, b]
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
    const l1 = lum(parseRgb(cs.color));
    const l2 = lum(parseRgb(cs.backgroundColor));
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  })()`);
}

async function installTauriMock(evalJs, opts = {}) {
  await evalJs(`(() => {
    const cfg = ${JSON.stringify(opts)};
    window.__ipcCalls = [];
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args) => {
        window.__ipcCalls.push({ cmd, args });
        if (cmd === 'desktop_read_save_bundle') return cfg.readBundle ?? null;
        if (cmd === 'desktop_export_json_file') {
          return '/Users/dev/Downloads/' + (cfg.renameSave && args?.filename === 'haunted-terminal-save.json' ? 'haunted-terminal-save-2.json' : args?.filename);
        }
        return { synced: args?.apiNames?.length ?? 0, unlocked: true, steamRunning: Boolean(cfg.steamRunning) };
      },
    };
  })()`);
}

async function verifyHeroAndWaitlistDialog(cdp, evalJs, base, externalUrls) {
  await cdp.send('Page.navigate', { url: `${base}/` });
  await sleep(900);

  const initial = await evalJs(`(() => ({
    playHref: document.querySelector('#hub-header a.comic-btn.primary')?.getAttribute('href'),
    ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
    fontPreloads: document.querySelectorAll('link[rel="preload"][as="font"]').length,
    skipLink: Boolean(document.querySelector('a.skip-link[href="#main-heading"]')),
    faqCount: document.querySelectorAll('details.comic-faq[name="steam-faq"]').length,
    movedOut: {
      trophyRack: Boolean(document.getElementById('achievements-rack-host')),
      saveBar: Boolean(document.getElementById('export-save-btn') || document.getElementById('import-save-btn') || document.querySelector('.portability-bar')),
      osCards: document.querySelectorAll('.os-card').length,
      oldAnchors: document.querySelectorAll('a[href="#desktop-builds"], a[href="#achievements-showcase"]').length,
    },
    heroButtons: document.querySelectorAll('.hero-copy .hero-cta-row .comic-btn:not([href*="/play/"])').length + document.querySelectorAll('#hero-play-cta, #open-steam-waitlist-btn, #hero-desktop-cta').length,
    parodyText: document.body.textContent.includes('Anti-Gravy') && document.body.textContent.includes('kiro disclaimer'),
  }))()`);

  assert.equal(initial.playHref, '/play/chapter-01-kiroween');
  for (const sel of ['#hub-header a.comic-btn.primary', '#hub-header [data-open-waitlist]', '.door-go']) {
    const ratio = await measureContrast(evalJs, sel);
    assert.ok(ratio >= 4.5, `${sel} must meet WCAG AA >= 4.5:1 contrast, got ${ratio.toFixed(2)}`);
  }
  assert.equal(initial.ogImage, '/comix/chapter-01-kiroween/page-01.png', 'OpenGraph social image must be wired');
  assert.equal(initial.fontPreloads, 2, 'Primary local WOFF2 display & mono fonts must preload');
  assert.equal(initial.skipLink, true, 'Skip link must target #main-heading');
  assert.equal(initial.faqCount, 3, 'Exclusive native <details name="steam-faq"> accordion must render');
  assert.deepEqual(initial.movedOut, { trophyRack: false, saveBar: false, osCards: 0, oldAnchors: 0 }, 'The trophy rack, the save bar and the OS cards live on their own tab pages, not on /');
  assert.equal(initial.heroButtons, 0, 'The hero has no Play, Wishlist or Desktop Builds buttons (the header has them); only the resume link may appear');
  assert.equal(initial.parodyText, true, 'Parody & non-affiliation notice must be present on /');
  assert.deepEqual(externalUrls, [], `Expected 0 external runtime requests on /, saw: ${externalUrls.join(', ')}`);

  mkdirSync(outDir, { recursive: true });
  const shotLanding = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, 'landing-1440.png'), Buffer.from(shotLanding.data, 'base64'));

  const dialogResult = await evalJs(`(() => {
    document.querySelector('#hub-header [data-open-waitlist]').click();
    const dlg = document.getElementById('steam-waitlist-dialog');
    const email = document.getElementById('waitlist-email');
    const form = document.getElementById('steam-waitlist-form');
    email.value = 'bad-email';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    email.dispatchEvent(new Event('blur', { bubbles: true }));
    const invalidAria = email.getAttribute('aria-invalid');
    const describedInvalid = email.getAttribute('aria-describedby') || '';
    email.value = 'founder@hauntedterminal.dev';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('waitlist-platform').value = 'linux-deck';
    form.requestSubmit();
    return {
      opened: dlg.open,
      invalidAria,
      describedInvalid,
      validAria: email.getAttribute('aria-invalid'),
      telemetry: document.getElementById('hero-telemetry-strip').textContent,
    };
  })()`);

  assert.equal(dialogResult.opened, true, 'Waitlist <dialog> must open via showModal()');
  assert.equal(dialogResult.invalidAria, 'true', 'Invalid email after blur must set aria-invalid="true"');
  assert.ok(dialogResult.describedInvalid.includes('waitlist-email-error'), 'Invalid email must link waitlist-email-error');
  assert.equal(dialogResult.validAria, 'false', 'Corrected email must clear aria-invalid back to "false"');
  assert.ok(dialogResult.telemetry.includes('LINUX-DECK SAVED'), 'Saving waitlist pass must update telemetry strip');

  const shotDialog = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, 'landing-dialog.png'), Buffer.from(shotDialog.data, 'base64'));
}

const SAMPLE_BUNDLE_JS = `{
  format: 'haunted-terminal-save',
  version: 1,
  exportedAt: '2026-11-17T18:00:00.000Z',
  progress: { 'chapter-01-kiroween': { 'level-01-tutorial-awakening': { cleared: true, bestRank: 'S', bestCommands: 6, bestTimeSec: 18, updatedAt: 1700000000000 } } },
  metagame: { scrap: 120, unlockedPerks: ['perk-overclock-dimm'], activePerks: ['perk-overclock-dimm'], seenMalware: ['hank.tty'], usedCommands: ['ls'], awardedRanks: {} },
  achievements: { schemaVersion: 1, unlocked: { first_boot: { id: 'first_boot', steamApiName: 'ACH_FIRST_BOOT', unlockedAt: 1700000000000 }, campaign_clear: { id: 'campaign_clear', steamApiName: 'ACH_CAMPAIGN_CLEAR', unlockedAt: 1700000001000 } }, stats: { malwareKilled: 3, sectorsCleared: 1, sRanksEarned: 1, clearedMechanics: ['terminal'], loadedCores: [] } },
}`;

/** The header every tab page shares: six items, the current tab marked, Steam as a button that opens the waitlist dialog in place. */
async function checkHeader(evalJs, path, currentLabel, steamKind) {
  const h = await evalJs(`(() => ({
    items: [...document.querySelectorAll('#hub-header .hub-nav-links > *')].map((e) => e.textContent.trim()),
    current: [...document.querySelectorAll('#hub-header [aria-current="page"]')].map((e) => e.textContent.trim()),
    active: [...document.querySelectorAll('#hub-header .hub-nav-links .active')].map((e) => e.textContent.trim()),
    steam: document.querySelector('#hub-header button[data-open-waitlist]') ? 'button' : 'none',
    dialog: Boolean(document.getElementById('steam-waitlist-dialog')),
    skip: Boolean(document.querySelector('#hub-header a.skip-link[href="#main-heading"]')) && Boolean(document.getElementById('main-heading')),
    hrefs: Object.fromEntries([...document.querySelectorAll('#hub-header .hub-nav-links a')].map((a) => [a.textContent.trim(), a.getAttribute('href')])),
  }))()`);
  assert.deepEqual(h.items, ['Play Free Demo', 'Steam Coming Soon', 'Desktop Builds', 'Achievements', 'Comix', 'Chapters & Workshop'], `${path}: header items`);
  assert.deepEqual(h.current, [currentLabel], `${path}: exactly the own tab is aria-current`);
  assert.equal(h.steam, steamKind, `${path}: Steam Coming Soon is a ${steamKind}`);
  assert.equal(h.dialog, true, `${path}: the waitlist dialog exists on every hub page`);
  await verifySteamOpensInPlace(evalJs, path);
  assert.equal(h.skip, true, `${path}: skip link targets #main-heading`);
  assert.equal(h.hrefs['Desktop Builds'], '/desktop.html');
  assert.equal(h.hrefs.Achievements, '/achievements.html');
  assert.equal(h.hrefs.Comix, '/comix.html');
  assert.equal(h.hrefs['Chapters & Workshop'], '/chapters.html');
  assert.match(h.hrefs['Play Free Demo'], /^\/play\/[^/]+$/);
  if (!currentLabel.startsWith('COMIX // TTY')) assert.deepEqual(h.active, [currentLabel], `${path}: the own tab is styled active`);
}

async function openPage(cdp, base, path, waitFor) {
  await cdp.send('Page.navigate', { url: `${base}${path}` });
  for (let i = 0; i < 40; i++) {
    await sleep(100);
    const ready = await makeEvaluator(cdp)(`Boolean(${waitFor})`).catch(() => false);
    if (ready) return;
  }
  throw new Error(`${path}: ${waitFor} never appeared`);
}

async function verifyAchievementsPage(cdp, evalJs, base, externalUrls) {
  await openPage(cdp, base, '/achievements.html', `document.querySelector('#achievements-rack-host .trophy-card')`);
  await checkHeader(evalJs, '/achievements.html', 'Achievements', 'button');
  const fresh = await evalJs(`(() => ({
    trophyCards: document.querySelectorAll('#achievements-rack-host .trophy-card').length,
    hasProgressTag: Boolean(document.querySelector('#achievements-rack-host progress.ach-progress')),
    secretMasked: [...document.querySelectorAll('#achievements-rack-host .trophy-title')].filter((n) => n.textContent.includes('????')).length,
    bar: ['export-save-btn', 'import-save-btn', 'import-save-input', 'save-portability-feedback'].every((id) => document.getElementById(id)),
    osCards: document.querySelectorAll('.os-card').length,
  }))()`);
  assert.equal(fresh.trophyCards, 12, '/achievements.html must render all 12 local achievement cards');
  assert.equal(fresh.hasProgressTag, true, 'Trophy rack must use native <progress> bar');
  assert.equal(fresh.secretMasked, 2, 'Both secret achievements must mask their titles when locked');
  assert.equal(fresh.bar, true, '/achievements.html must carry the save export/import bar with its ids');
  assert.equal(fresh.osCards, 0, 'The OS cards are not on /achievements.html');
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, 'landing-achievements.png'), Buffer.from(shot.data, 'base64'));

  await installTauriMock(evalJs, { renameSave: true });
  const importCheck = await evalJs(`(async () => {
    const sampleBundle = ${SAMPLE_BUNDLE_JS};
    const dt = new DataTransfer();
    dt.items.add(new File([JSON.stringify(sampleBundle)], 'save.json', { type: 'application/json' }));
    const input = document.getElementById('import-save-input');
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 120));
    const importFeedback = document.getElementById('save-portability-feedback').textContent;
    document.querySelector('[data-focus-key="ach-filter-unlocked"]').click();
    // Export Save & Trophies (.json) inside simulated Tauri shell -> must dispatch desktop_export_json_file IPC (not cancelled <a download>)
    document.getElementById('export-save-btn')?.click();
    await new Promise((r) => setTimeout(r, 40));
    return {
      feedback: importFeedback,
      exportFeedback: document.getElementById('save-portability-feedback').textContent,
      unlockedShown: document.querySelectorAll('#achievements-rack-host .trophy-card.unlocked').length,
      ipcCalls: window.__ipcCalls,
    };
  })()`);
  assert.ok(importCheck.feedback.includes('2/12 achievements unlocked'));
  assert.ok(importCheck.exportFeedback.includes('Exported haunted-terminal-save-2.json (2/12 ACH_*'));
  assert.equal(importCheck.unlockedShown, 2);
  assert.ok(
    importCheck.ipcCalls.some((c) => c.cmd === 'desktop_export_json_file' && c.args?.filename === 'haunted-terminal-save.json'),
    'Export Save (.json) inside Tauri must route through desktop_export_json_file IPC',
  );
  assert.ok(importCheck.ipcCalls.some((c) => c.cmd === 'steam_sync_achievements'), 'Save bundle import must immediately sync ACH_* keys to Tauri DesktopBridge');
  assert.ok(importCheck.ipcCalls.some((c) => c.cmd === 'desktop_write_save_bundle'), 'Save bundle import must mirror haunted-terminal-save.json to Tauri app_data_dir for Steam Auto-Cloud');
  assert.deepEqual(externalUrls, [], `Expected 0 external runtime requests on /achievements.html, saw: ${externalUrls.join(', ')}`);
}

async function verifyDesktopPage(cdp, evalJs, base, externalUrls) {
  await openPage(cdp, base, '/desktop.html', `document.querySelector('.os-card')`);
  await checkHeader(evalJs, '/desktop.html', 'Desktop Builds', 'button');
  const page = await evalJs(`(() => ({
    osCards: [...document.querySelectorAll('.os-card h3')].map((h) => h.textContent.trim()),
    trophyRack: Boolean(document.getElementById('achievements-rack-host')),
    saveBar: Boolean(document.getElementById('export-save-btn')),
  }))()`);
  assert.equal(page.osCards.length, 3, '/desktop.html must show the macOS, Windows and Linux cards');
  assert.deepEqual([page.trophyRack, page.saveBar], [false, false], 'The trophy rack and the save bar are not on /desktop.html');
  await installTauriMock(evalJs);
  const calls = await evalJs(`(async () => {
    // An external GitHub Releases anchor inside the simulated Tauri shell -> desktop_open_external_url IPC exactly once
    document.querySelector('a[href="https://github.com/recferret-bit/HauntedTerminal/releases/latest"]')?.click();
    await new Promise((r) => setTimeout(r, 40));
    return window.__ipcCalls;
  })()`);
  const openUrlCalls = calls.filter((c) => c.cmd === 'desktop_open_external_url' && String(c.args?.url).startsWith('https://github.com/recferret-bit/HauntedTerminal/releases'));
  assert.equal(openUrlCalls.length, 1, 'External release links clicked inside Tauri must route through desktop_open_external_url IPC exactly once');
  assert.deepEqual(externalUrls, [], `Expected 0 external runtime requests on /desktop.html, saw: ${externalUrls.join(', ')}`);
}

async function verifyComixPage(cdp, evalJs, base, externalUrls) {
  await openPage(cdp, base, '/comix.html', `document.querySelector('.comix-tile')`);
  await checkHeader(evalJs, '/comix.html', 'Comix', 'button');
  const tiles = await evalJs(`(() => ({
    heads: [...document.querySelectorAll('.comix-section-head')].map((h) => h.textContent),
    sizes: [...new Set([...document.querySelectorAll('.comix-tile')].map((t) => t.offsetWidth + 'x' + t.offsetHeight))],
    open: [...document.querySelectorAll('.comix-tile.open')].map((t) => ({
      title: t.querySelector('h3')?.textContent,
      progress: t.querySelector('.comix-tile-progress span')?.textContent,
      hrefs: [...t.querySelectorAll('a')].map((a) => a.getAttribute('href')),
    })),
    locked: [...document.querySelectorAll('.comix-tile.locked')].map((t) => ({
      title: t.querySelector('h3')?.textContent,
      disabled: t.getAttribute('aria-disabled'),
      interactive: t.querySelectorAll('a, button, [tabindex]').length,
    })),
  }))()`);
  // The intro and the outro come first (Watch tiles), then one open tile per playable chapter.
  assert.deepEqual([tiles.open[0].hrefs, tiles.open[2].hrefs], [['/cinematic.html?play=intro'], ['/cinematic.html?play=outro']], 'Intro first and Outro last, around the issue');
  assert.deepEqual(tiles.heads, ['CHAPTER 1'], 'Only chapter 1 has a sub header');
  assert.equal(tiles.sizes.length, 1, 'Every tile has the size of the issue tile');
  tiles.open.splice(2, 1);
  tiles.open.splice(0, 1);
  assert.equal(tiles.open.length, 1, '/comix.html must show one open tile per playable chapter');
  assert.equal(tiles.open[0].progress, '1/11 levels cleared', 'The open tile shows the progress of the imported save');
  assert.deepEqual(tiles.open[0].hrefs, ['/comic.html?chapter=chapter-01-kiroween', '/play/chapter-01-kiroween']);
  assert.deepEqual(tiles.locked.map((t) => t.title), ['CHAPTER 2', 'CHAPTER 3', 'CHAPTER 4', 'CHAPTER 5']);
  assert.ok(tiles.locked.every((t) => t.disabled === 'true' && t.interactive === 0), 'Locked tiles are rendered, disabled and have no link, button or tab stop');
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, 'landing-comix.png'), Buffer.from(shot.data, 'base64'));
  // The reader the Read link opens.
  await cdp.send('Page.navigate', { url: `${base}${tiles.open[0].hrefs[0]}` });
  await sleep(500);
  assert.equal(await evalJs(`Boolean(document.getElementById('reader-mount'))`), true, 'The Read link must open the comic reader');
  assert.deepEqual(externalUrls, [], `Expected 0 external runtime requests on /comix.html, saw: ${externalUrls.join(', ')}`);
}

/** Home after the import: the resume slot and the live telemetry, then the waitlist pass export through the Tauri mock. */
async function verifyHomeAfterImport(cdp, evalJs, base) {
  await openPage(cdp, base, '/', `document.querySelector('#hub-header [data-open-waitlist]')`);
  await checkHeader(evalJs, '/', 'COMIX // TTYHAUNTED TERMINAL', 'button');
  await installTauriMock(evalJs, { renameSave: true });
  const home = await evalJs(`(async () => {
    document.querySelector('#hub-header [data-open-waitlist]')?.click();
    document.getElementById('waitlist-export-btn')?.click();
    document.getElementById('waitlist-close-btn')?.click();
    await new Promise((r) => setTimeout(r, 50));
    // Simulate cross-tab localStorage update ('storage' event) -> telemetry strip must refresh live
    localStorage.setItem('haunted-terminal:metagame:v1', JSON.stringify({
      scrap: 250, unlockedPerks: ['perk-overclock-dimm'], activePerks: ['perk-overclock-dimm'], seenMalware: [], usedCommands: [], awardedRanks: {}
    }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'haunted-terminal:metagame:v1' }));
    return {
      resumeHref: document.querySelector('#hero-resume-slot a')?.getAttribute('href') || '',
      telemetryAfterStorage: document.getElementById('hero-telemetry-strip').textContent,
      ipcCalls: window.__ipcCalls,
    };
  })()`);
  assert.ok(home.resumeHref.includes('/play/chapter-01-kiroween/level-02-task-ram-heist'));
  assert.ok(home.telemetryAfterStorage.includes('250'), 'Cross-tab storage event must live-refresh telemetry strip');
  assert.ok(
    home.ipcCalls.some((c) => c.cmd === 'desktop_export_json_file' && c.args?.filename === 'haunted-terminal-steam-waitlist.json'),
    'Export Pass (.json) inside Tauri must route through desktop_export_json_file IPC',
  );
}

async function verifyWishlistDeepLinkAndMobileViewport(cdp, evalJs, base) {
  // Verify deep-link `/?wishlist=1` (used by End-of-Demo Victory Card) auto-opens `<dialog>` and cleans URL query.
  await cdp.send('Page.navigate', { url: `${base}/?wishlist=1` });
  await sleep(450);
  const deepLinkCheck = await evalJs(`(() => {
    const dlg = document.getElementById('steam-waitlist-dialog');
    const open = Boolean(dlg?.open);
    const search = window.location.search;
    dlg?.close();
    return { open, search };
  })()`);
  assert.equal(deepLinkCheck.open, true, '/?wishlist=1 deep-link must automatically open the Steam waitlist <dialog>');
  assert.equal(deepLinkCheck.search, '', '/?wishlist=1 must clean query parameter via replaceState');

  // Verify narrow mobile viewport (360x800) has 0 horizontal overflow on `/` and inside `<dialog>`
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 2, mobile: true });
  await sleep(150);
  const shotMobile = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, 'landing-360.png'), Buffer.from(shotMobile.data, 'base64'));
  const mobileCheck = await evalJs(`(() => {
    document.querySelector('#hub-header [data-open-waitlist]').click();
    const dlg = document.getElementById('steam-waitlist-dialog').getBoundingClientRect();
    return {
      winW: window.innerWidth,
      docW: document.documentElement.scrollWidth,
      dlgRight: Math.round(dlg.right),
    };
  })()`);
  const shotMobileDlg = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, 'landing-360-dialog.png'), Buffer.from(shotMobileDlg.data, 'base64'));
  await evalJs(`document.getElementById('waitlist-close-btn').click()`);
  assert.equal(mobileCheck.winW, 360, 'Mobile viewport must remain 360px without forced zoom-out');
  assert.ok(mobileCheck.docW <= 360, `Expected 0 horizontal overflow at 360px, got scrollWidth=${mobileCheck.docW}`);
  assert.ok(mobileCheck.dlgRight <= 360, `Expected <dialog> inside 360px viewport, got right=${mobileCheck.dlgRight}`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
}

async function verifyChaptersAchievementsBinder(cdp, evalJs, base) {
  await cdp.send('Page.navigate', { url: `${base}/chapters.html?tab=achievements` });
  await sleep(600);
  await installTauriMock(evalJs);
  const chaptersTab = await evalJs(`(async () => {
    const buyBtn = document.querySelector('[data-perk-id="perk-linter-goggles"]');
    buyBtn?.click();
    await new Promise((r) => setTimeout(r, 50));
    const expBtn = document.getElementById('chapters-export-save-btn');
    expBtn?.focus();
    expBtn?.click();
    await new Promise((r) => setTimeout(r, 50));
    const activeAfterExport = document.activeElement?.id || '';
    document.getElementById('tab-bestiary')?.click();
    return {
      cards: document.querySelectorAll('#binder-content .binder-card').length,
      activeAfterExport,
    };
  })()`);
  const bossTagContrast = await measureContrast(evalJs, '.mech-tag.boss');
  const binderAfter = await evalJs(`(() => {
    document.getElementById('tab-achievements')?.click();
    return {
      cards: document.querySelectorAll('#binder-content .binder-card').length,
      hasExportBtn: Boolean(document.getElementById('chapters-export-save-btn')),
      hasImportBtn: Boolean(document.getElementById('chapters-import-save-btn')),
      hasWishlistLink: document.getElementById('chapters-wishlist-link')?.getAttribute('href') === '/?wishlist=1',
      flash: document.querySelector('#binder-content .workshop-flash')?.textContent || '',
      ipcCalls: window.__ipcCalls,
    };
  })()`);
  assert.equal(binderAfter.cards, 12);
  assert.equal(binderAfter.hasExportBtn, true, '/chapters.html?tab=achievements must render Export Save (.json) button');
  assert.equal(binderAfter.hasImportBtn, true, '/chapters.html?tab=achievements must render Import Save (.json) button');
  assert.equal(binderAfter.hasWishlistLink, true, '/chapters.html must expose ★ Wishlist on Steam CTA');
  assert.equal(chaptersTab.activeAfterExport, 'chapters-export-save-btn', 'Exporting on /chapters.html must preserve keyboard focus');
  assert.ok(bossTagContrast >= 4.5, `.mech-tag.boss must meet WCAG AA >= 4.5:1 contrast, got ${bossTagContrast.toFixed(2)}`);
  assert.ok(binderAfter.flash.includes('3/12 LOCAL ACHIEVEMENTS UNLOCKED'));
  assert.ok(
    binderAfter.ipcCalls.some((c) => c.cmd === 'steam_unlock_achievement' && c.args?.apiName === 'ACH_BASHRC_ARTISAN'),
    'Purchasing a Workshop perk on /chapters.html must forward ACH_BASHRC_ARTISAN to Tauri DesktopBridge',
  );
}

async function verifySteamStoreCutoverAndAutoCloud(cdp, evalJs, base) {
  await cdp.send('Page.navigate', { url: `${base}/` });
  await sleep(400);
  const cloudBundle = JSON.stringify({
    format: 'haunted-terminal-save',
    version: 1,
    exportedAt: '2026-11-18T00:00:00Z',
    progress: {},
    metagame: { scrap: 45, unlockedPerks: [], activePerks: [], seenMalware: [], usedCommands: [], awardedRanks: {} },
    achievements: {
      schemaVersion: 1,
      unlocked: { open_weights_init: { id: 'open_weights_init', steamApiName: 'ACH_OPEN_WEIGHTS_INIT', unlockedAt: 100 } },
      stats: { malwareKilled: 0, sectorsCleared: 0, sRanksEarned: 0, clearedMechanics: [], loadedCores: ['qwen'] },
    },
  });
  await installTauriMock(evalJs, { readBundle: cloudBundle, steamRunning: true });
  const cutover = await evalJs(`(async () => {
    const waitlistMod = await import('/src/hub/waitlist.ts');
    const bridgeMod = await import('/src/chapters/steam-bridge.ts');
    const saveMod = await import('/src/chapters/portable-save.ts');
    const liveMeta = {
      status: 'live',
      steamAppId: 480,
      steamDemoAppId: null,
      steamStoreUrl: 'https://store.steampowered.com/app/480/?utm_source=web',
      waitlistFormUrl: '',
    };
    const updatedBtns = waitlistMod.syncSteamCtaLabels(document, liveMeta);
    const btnLabels = [...document.querySelectorAll('[data-open-waitlist]')].map((b) => b.textContent.trim());
    const heroTag = document.querySelector('[data-steam-status-tag]')?.textContent?.trim();
    const validHref = bridgeMod.resolveSteamWishlistHref(liveMeta);
    const badHref = bridgeMod.resolveSteamWishlistHref({ ...liveMeta, steamStoreUrl: 'https://evil.example/app/480' });
    const allowChecks = {
      okSteam: bridgeMod.isAllowedExternalReleaseUrl('https://store.steampowered.com/app/480/?utm_source=web'),
      okGh: bridgeMod.isAllowedExternalReleaseUrl('https://github.com/recferret-bit/HauntedTerminal/releases/latest'),
      badTraversal: bridgeMod.isAllowedExternalReleaseUrl('https://github.com/recferret-bit/HauntedTerminal/../../evil'),
      badEncoded: bridgeMod.isAllowedExternalReleaseUrl('https://github.com/recferret-bit/HauntedTerminal/%2e%2e/evil'),
      badLinkFilter: bridgeMod.isAllowedExternalReleaseUrl('https://store.steampowered.com/linkfilter/?u=https://evil.example'),
    };
    localStorage.clear();
    window.__ipcCalls = [];
    const hydrated = await saveMod.hydrateFromDesktopSaveBundle();
    await new Promise((r) => setTimeout(r, 30));
    return { updatedBtns, btnLabels, heroTag, validHref, badHref, allowChecks, hydrated, ipcCalls: window.__ipcCalls };
  })()`);
  assert.equal(cutover.updatedBtns, 2, 'Both [data-open-waitlist] CTAs (header and funnel) on / must update on live Steam Store cutover');
  assert.ok(cutover.btnLabels.every((t) => t === '★ Wishlist on Steam ↗'), `Expected uniform Steam CTA labels, got: ${cutover.btnLabels.join(' | ')}`);
  assert.equal(cutover.heroTag, 'STEAM EDITION // AVAILABLE ON STEAM');
  assert.deepEqual(cutover.validHref, { href: 'https://store.steampowered.com/app/480/?utm_source=web', external: true });
  assert.deepEqual(cutover.badHref, { href: '/?wishlist=1', external: false });
  assert.deepEqual(cutover.allowChecks, { okSteam: true, okGh: true, badTraversal: false, badEncoded: false, badLinkFilter: false });
  assert.equal(cutover.hydrated, true, 'Cold-boot Auto-Cloud save bundle must hydrate localStorage');
  assert.ok(
    cutover.ipcCalls.some((c) => c.cmd === 'steam_sync_achievements' && c.args?.apiNames?.includes('ACH_OPEN_WEIGHTS_INIT')),
    'Cold-boot Auto-Cloud hydration must sync ACH_* keys to Tauri DesktopBridge',
  );
  assert.equal(
    cutover.ipcCalls.some((c) => c.cmd === 'desktop_write_save_bundle'),
    false,
    'Unmodified Auto-Cloud hydration must not dirty-rewrite haunted-terminal-save.json',
  );
}

async function verifyTabSwitchingFlow(cdp, evalJs, base) {
  await openPage(cdp, base, '/comix.html', `document.querySelector('.comix-tile')`);
  await verifyTabSwitching(evalJs);
}

async function verifyLandingFlows(cdp, base, externalUrls) {
  const evalJs = makeEvaluator(cdp);
  await verifyHeroAndWaitlistDialog(cdp, evalJs, base, externalUrls);
  await verifyAchievementsPage(cdp, evalJs, base, externalUrls);
  await verifyDesktopPage(cdp, evalJs, base, externalUrls);
  await verifyComixPage(cdp, evalJs, base, externalUrls);
  await verifyTabSwitchingFlow(cdp, evalJs, base);
  await verifyHomeAfterImport(cdp, evalJs, base);
  await verifyWishlistDeepLinkAndMobileViewport(cdp, evalJs, base);
  await verifyChaptersAchievementsBinder(cdp, evalJs, base);
  await verifySteamStoreCutoverAndAutoCloud(cdp, evalJs, base);
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.log('SKIP landing-smoke: no Chrome binary found');
    return;
  }
  const profile = mkdtempSync(join(tmpdir(), 'haunted-landing-smoke-'));
  let vite = null;
  let chrome = null;
  const errors = [];
  const externalUrls = [];

  try {
    const srv = await startPageServer(5368, { hmr: false, watch: null });
    vite = srv.vite;
    const base = srv.base.replace(/\/$/, '');
    const launched = await launchChromeCdp(chromePath, profile, new URL(base).origin, errors, externalUrls);
    chrome = launched.chrome;
    await verifyLandingFlows(launched.cdp, base, externalUrls);
    assert.deepEqual(errors, [], `Console/page errors during landing-smoke: ${errors.join(' | ')}`);
    launched.cdp.close();
    console.log('PASS landing-smoke: Home, the Achievements, Desktop Builds and Comix tab pages, <dialog> validation, offline fonts (0 external URLs), save import & /chapters.html verified');
  } finally {
    if (chrome && chrome.exitCode === null) chrome.kill();
    if (vite) await vite.close();
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Ignore profile lock cleanup race
    }
  }
}

main().catch((err) => {
  console.error(`FAIL landing-smoke: ${err.message}`);
  process.exit(1);
});
