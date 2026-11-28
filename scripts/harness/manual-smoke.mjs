#!/usr/bin/env node
// Drives /manual.html and /play?nointro=1 manual modal in headless Chrome. Exit 0 = all checks passed.
//   node scripts/harness/manual-smoke.mjs
//   node scripts/harness/manual-smoke.mjs --url http://localhost:5400
// Screenshots: scripts/harness/out/manual-*.png.
import { resolve } from 'node:path';
import { launchBrowser } from './lib/browser.mjs';
import { listChapterSlugs, readChapter } from './lib/chapter-compile.mjs';
import { parseArgs, projectRoot, startPageServer } from './lib/load.mjs';
import { checkCollector } from './lib/test-kit.mjs';

const args = parseArgs(process.argv.slice(2), ['--url']);
const out = (name) => resolve(projectRoot, 'scripts/harness/out', `manual-${name}.png`);
const { check, finish } = checkCollector();

let vite = null;
let base = args.val('--url');
if (!base) ({ vite, base } = await startPageServer(5347, { hmr: false, watch: null }));
base = base.replace(/\/$/, '');

const externalUrls = [];
const browser = await launchBrowser({ width: 1440, height: 900 });
await browser.send('Network.enable');
browser.on((msg) => {
  if (msg.method === 'Network.requestWillBeSent') {
    const url = msg.params.request?.url ?? '';
    if (
      url &&
      !url.startsWith(base) &&
      !url.startsWith('http://127.0.0.1') &&
      !url.startsWith('http://localhost') &&
      !url.startsWith('data:') &&
      !url.startsWith('blob:')
    ) {
      externalUrls.push(url);
    }
  }
});

const $ = (expr, ms) => browser.evaluate(expr, ms);
const text = (sel) => $(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? ''`);
const count = (sel) => $(`document.querySelectorAll(${JSON.stringify(sel)}).length`);

async function realClickAt(x, y) {
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function realClickSelector(sel) {
  const pt = await $(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  if (!pt) throw new Error(`Missing selector for realClick: ${sel}`);
  await realClickAt(pt.x, pt.y);
}

async function checkSpreadFit(requireDocFit) {
  return $(`(() => {
    const p1 = document.querySelectorAll('.mb-page')[0];
    const p2 = document.querySelectorAll('.mb-page')[1];
    const corner = p2?.querySelector('.mb-corner-right');
    if (!p1 || !p2 || !corner) return { ok: false, reason: 'missing spread or corner' };
    const pr2 = p2.getBoundingClientRect();
    const cr2 = corner.getBoundingClientRect();
    const p1Fit = p1.scrollHeight <= p1.clientHeight + 1;
    const p2Fit = p2.scrollHeight <= p2.clientHeight + 1;
    const docFit = ${requireDocFit ? 'document.documentElement.scrollHeight <= window.innerHeight + 1' : 'true'};
    return {
      ok: p1Fit && p2Fit && cr2.bottom <= pr2.bottom + 1 && docFit,
      p1Scroll: p1.scrollHeight,
      p1Client: p1.clientHeight,
      p2Scroll: p2.scrollHeight,
      p2Client: p2.clientHeight,
      cornerBottom: Math.round(cr2.bottom),
      pageBottom: Math.round(pr2.bottom),
      docFit,
    };
  })()`);
}

try {
  // 0. Standalone /manual.html is locked before the player obtains the Field Manual at Server Hub #1 (`ACH_FIELD_MANUAL`)
  await browser.open(`${base}/manual.html`);
  await browser.waitFor("Boolean(document.getElementById('manual-locked-panel'))", 15000, 'standalone manual locked gate');
  check(
    await $("Boolean(document.getElementById('manual-locked-panel') && !document.querySelector('.mb-book-shell'))"),
    'standalone /manual.html is locked until Old Coder gifts the Field Manual (ACH_FIELD_MANUAL)',
  );
  await $(`(() => {
    localStorage.setItem('out-of-credits:achievements:v1', JSON.stringify({
      schemaVersion: 1,
      unlocked: { field_manual: { id: 'field_manual', steamApiName: 'ACH_FIELD_MANUAL', unlockedAt: Date.now() } },
      stats: { malwareKilled: 0, sectorsCleared: 0, sRanksEarned: 0, clearedMechanics: [], loadedCores: [] },
    }));
  })()`);

  // 1. Standalone /manual.html spread + TOC fit (1440x900, 1280x820, 1024x768) + flipping + navigation
  await browser.open(`${base}/manual.html`);
  await browser.waitFor("document.querySelectorAll('.mb-page').length === 2", 20000, 'standalone 2-page spread');
  check(/OUT OF CREDITS/.test(await text('.mb-brand')) && /TERMINAL FIELD MANUAL/.test(await text('.mb-brand')), 'standalone manual brand header renders');
  check(/PAGES 1–2 \/ \d+/.test(await text('.mb-page-counter')), 'standalone opens on pages 1-2 spread');
  const tocFit1440 = await checkSpreadFit(true);
  check(tocFit1440.ok, `standalone PAGE 01-02 & corner fit at 1440x900 (${JSON.stringify(tocFit1440)})`);
  await browser.shoot(out('01-standalone-cover'));

  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
  await browser.evaluate("window.dispatchEvent(new Event('resize'))");
  await browser.waitFor("window.innerWidth === 1280", 3000, 'standalone resized to 1280x820');
  const tocFit1280 = await checkSpreadFit(true);
  check(tocFit1280.ok, `standalone PAGE 01-02 & corner fit at 1280x820 (${JSON.stringify(tocFit1280)})`);

  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
  await browser.evaluate("window.dispatchEvent(new Event('resize'))");
  await browser.waitFor("window.innerWidth === 1024", 3000, 'standalone resized to 1024x768');
  const tocFit1024 = await checkSpreadFit(true);
  check(tocFit1024.ok, `standalone PAGE 01-02 & corner fit at 1024x768 (${JSON.stringify(tocFit1024)})`);

  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await browser.evaluate("window.dispatchEvent(new Event('resize'))");
  await browser.waitFor("window.innerWidth === 1440", 3000, 'standalone restored to 1440x900');

  await $(`(() => {
    document.querySelectorAll('.mb-head-actions .mb-nav-btn')[2].click(); // Next ->
    window.__flipNum = document.querySelector('.mb-flip-leaf .mb-page-num')?.textContent ?? '';
  })()`);
  check(await $('window.__flipNum === "PAGE 02"'), `Next flips right leaf PAGE 02 (saw: ${await $('window.__flipNum')})`);
  await browser.waitFor("/PAGES 3–4/.test(document.querySelector('.mb-page-counter')?.textContent ?? '')", 5000, 'flip forward to pages 3-4');
  check(true, 'clicking Next flips spread to pages 3-4');
  check(!(await $('document.querySelector(".mb-book-shell").textContent.includes("`")')), 'no literal markdown backticks rendered in book UI');

  // Test Shell Operator Explorer tabs on pages 5-6 (guide-shell-syntax)
  await $(`document.querySelectorAll('.mb-head-actions .mb-nav-btn')[2].click()`);
  await browser.waitFor("document.querySelector('.mb-shell-widget') !== null", 5000, 'shell operator explorer widget');
  await $(`[...document.querySelectorAll('.mb-shell-widget .mb-chip-btn')].find((b) => b.textContent.includes('&&'))?.click()`);
  check(/ONE battle turn/i.test(await text('.mb-shell-widget')), 'Shell Explorer && tab updates step explanation');

  // Jump via Table of Contents button -> navigate prev back
  await $(`document.querySelector('.mb-toc-btn').click()`);
  await browser.waitFor("/PAGES 1–2/.test(document.querySelector('.mb-page-counter')?.textContent ?? '')", 5000, 'Index jumps to spread 1-2');
  check(true, 'Index button returns to cover/TOC spread');

  // 1b. Search dropdown dismissal on Next ->, Prev <-, Index, and outside book click
  await $(`(() => {
    const i = document.querySelector('#mb-search-input');
    i.focus();
    i.value = 'chmod';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await browser.waitFor("!document.querySelector('.mb-search-results')?.classList.contains('hidden')", 3000, 'dropdown open before Next click');
  await $(`document.querySelectorAll('.mb-head-actions .mb-nav-btn')[2].click()`); // Next ->
  await browser.waitFor("document.querySelector('.mb-search-results')?.classList.contains('hidden') && /PAGES 3–4/.test(document.querySelector('.mb-page-counter')?.textContent ?? '')", 3000, 'Next dismisses search dropdown');
  check(true, 'clicking Next -> dismisses open search dropdown and flips spread');

  await $(`(() => {
    const i = document.querySelector('#mb-search-input');
    i.focus();
    i.value = 'ls';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await browser.waitFor("!document.querySelector('.mb-search-results')?.classList.contains('hidden')", 3000, 'dropdown open before Prev click');
  await $(`document.querySelectorAll('.mb-head-actions .mb-nav-btn')[1].click()`); // <- Prev
  await browser.waitFor("document.querySelector('.mb-search-results')?.classList.contains('hidden') && /PAGES 1–2/.test(document.querySelector('.mb-page-counter')?.textContent ?? '')", 3000, 'Prev dismisses search dropdown');
  check(true, 'clicking <- Prev dismisses open search dropdown and flips spread');

  await $(`(() => {
    const i = document.querySelector('#mb-search-input');
    i.value = 'kill';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await browser.waitFor("!document.querySelector('.mb-search-results')?.classList.contains('hidden')", 3000, 'dropdown open before Index click');
  await $(`document.querySelector('.mb-toc-btn').click()`);
  await browser.waitFor("document.querySelector('.mb-search-results')?.classList.contains('hidden') && /PAGES 1–2/.test(document.querySelector('.mb-page-counter')?.textContent ?? '')", 3000, 'Index dismisses search dropdown');
  check(true, 'clicking Index dismisses open search dropdown');

  await $(`(() => {
    const i = document.querySelector('#mb-search-input');
    i.focus();
    i.value = 'grep';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await browser.waitFor("!document.querySelector('.mb-search-results')?.classList.contains('hidden')", 3000, 'dropdown open before Esc & real mouse checks');
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await browser.waitFor("document.querySelector('.mb-search-results')?.classList.contains('hidden') && document.activeElement?.id === 'mb-search-input'", 3000, 'Esc closes drawer while keeping focus');
  await realClickSelector('#mb-search-input');
  await browser.waitFor("!document.querySelector('.mb-search-results')?.classList.contains('hidden')", 3000, 'real mouse pointerdown reopens drawer on focused input');
  check(true, 'clicking focused search input after Escape reopens results drawer');

  const belowPt = await $(`(() => {
    const sr = document.querySelector('.mb-search-results').getBoundingClientRect();
    const p1 = document.querySelector('.mb-page-left').getBoundingClientRect();
    // The first point on the left page, below the drawer, that is not a button, link or input: a longer result list moves the drawer down over the index chips.
    for (let y = Math.round(sr.bottom + 30); y < p1.bottom - 6; y += 8) {
      for (let x = Math.round(p1.left + 40); x < p1.right - 40; x += 24) {
        const el = document.elementFromPoint(x, y);
        if (el && el.closest('.mb-page-left') && !el.closest('button, a, input, .mb-search-results')) return { x, y };
      }
    }
    return { x: Math.round(p1.left + 40), y: Math.round(Math.min(p1.bottom - 20, sr.bottom + 30)) };
  })()`);
  await realClickAt(belowPt.x, belowPt.y);
  await browser.waitFor("document.querySelector('.mb-search-results')?.classList.contains('hidden') && document.activeElement?.id !== 'mb-search-input'", 3000, 'real click below drawer dismisses & blurs search');
  check(true, 'real mouse click inside book outside search anchor dismisses & blurs search');
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await browser.waitFor("/PAGES 3–4/.test(document.querySelector('.mb-page-counter')?.textContent ?? '')", 3000, 'ArrowRight flips right after outside click dismiss');
  check(true, 'ArrowRight flips immediately after outside click dismisses search dropdown');

  await $(`(() => {
    const i = document.querySelector('#mb-search-input');
    i.value = 'sed';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await browser.waitFor("!document.querySelector('.mb-search-results')?.classList.contains('hidden')", 3000, 'dropdown open before outer header click');
  await $(`document.querySelector('.hub-nav').click()`);
  await browser.waitFor("document.querySelector('.mb-search-results')?.classList.contains('hidden')", 3000, 'clicking outside book shell dismisses search dropdown');
  check(true, 'clicking outside the book shell dismisses open search dropdown');
  await $(`document.querySelector('.mb-search-clear')?.click()`);

  // 2. Live search for -9 via `/` -> Enter -> ArrowRight works immediately
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: '/', code: 'Slash', text: '/' });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: '/', code: 'Slash' });
  await browser.waitFor("document.activeElement?.id === 'mb-search-input'", 3000, '/ focuses search input');
  await $(`(() => {
    const i = document.querySelector('#mb-search-input');
    i.value = '-9';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await browser.waitFor("!document.querySelector('.mb-search-results')?.classList.contains('hidden') && document.querySelectorAll('.mb-hit-item').length > 0", 5000, '-9 search hits');
  const firstHit = await text('.mb-hit-item');
  check(/kill/i.test(firstHit), `search '-9' ranks kill hit first (got: ${firstHit.slice(0, 60)})`);
  check((await count('.mb-search-results mark.mb-mark')) > 0, 'search results highlight matched terms via <mark>');
  await $(`document.querySelector('.mb-hit-item').click()`);
  await browser.waitFor("document.querySelector('.mb-signal-widget') !== null && document.querySelectorAll('.mb-flip-leaf').length === 0 && document.querySelector('.mb-search-results')?.classList.contains('hidden')", 5000, 'kill signal widget settled');
  await browser.shoot(out('02-kill-page'));

  await $(`[...document.querySelectorAll('.mb-signal-widget .mb-chip-btn')].find((b) => b.textContent.includes('-9'))?.click()`);
  await browser.waitFor("/SIGKILL/.test(document.querySelector('.mb-signal-widget')?.textContent ?? '')", 5000, 'SIGKILL details');
  check(/UNTRAPPABLE|cannot catch/i.test(await text('.mb-signal-widget')), 'kill -9 signal card explains kernel untrappability');

  // ArrowRight works right after choosing a search result (the spread numbers move whenever a command page is added, so the check is relative)
  const killStart = await $("Number(/PAGES (\\d+)/.exec(document.querySelector('.mb-page-counter')?.textContent ?? '')?.[1])");
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await browser.waitFor(`/PAGES ${killStart + 2}–${killStart + 3}/.test(document.querySelector('.mb-page-counter')?.textContent ?? '')`, 5000, 'ArrowRight flips after search hit');
  check(true, 'ArrowRight flips page immediately after selecting a search result');

  // 3. Search 644 -> click the `chmod` command hit -> interactive octal calculator + direct octal input + URL sync
  await $(`(() => {
    const i = document.querySelector('#mb-search-input');
    i.value = '644';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await browser.waitFor("document.querySelectorAll('.mb-hit-item').length > 0", 5000, '644 hits');
  await $(`[...document.querySelectorAll('.mb-hit-item')].find((el) => el.querySelector('.mb-hit-title')?.textContent?.trim() === 'chmod')?.click()`);
  await browser.waitFor("document.querySelector('.mb-chmod-widget') !== null && /cmd=chmod/.test(location.search)", 5000, 'chmod command page & widget');
  check((await text('.mb-octal-big')) === 'chmod 644', 'chmod calculator starts at 644');

  await $(`[...document.querySelectorAll('.mb-chmod-widget .mb-chip-btn')].find((b) => b.textContent.includes('755'))?.click()`);
  check((await text('.mb-octal-big')) === 'chmod 755' && (await text('.mb-mode-str')) === '-rwxr-xr-x', 'chmod 755 preset updates octal & mode string');
  await $(`document.querySelectorAll('.mb-perm-cell input[type="checkbox"]')[0].click()`); // toggle owner read (4) off -> 355
  check((await text('.mb-octal-big')) === 'chmod 355', 'toggling individual checkbox updates octal math live');
  await $(`(() => {
    const o = document.querySelector('#mb-octal-input');
    o.value = '600';
    o.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  check((await text('.mb-octal-big')) === 'chmod 600' && (await text('.mb-mode-str')) === '-rw-------', 'typing 600 in octal input updates mode string & checkboxes');
  check(/cmd=chmod/.test(await $('location.search')), 'URL query syncs ?cmd=chmod');
  await browser.waitFor("document.querySelectorAll('.mb-flip-leaf').length === 0", 5000, 'chmod flip settled');
  await browser.shoot(out('03-chmod-calculator'));

  await $(`(() => {
    const o = document.querySelector('#mb-octal-input');
    o.focus();
    o.value = '';
  })()`);
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  check((await text('.mb-octal-big')) === 'chmod 600', 'empty octal ArrowLeft stays on chmod page');

  // 4. Empty-match search recovery via real mouse click & deep-link load (?q=-9)
  await $(`(() => {
    const i = document.querySelector('#mb-search-input');
    i.focus();
    i.value = 'xyzzynonexistent999';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await browser.waitFor("document.querySelector('.mb-search-empty .mb-chip-btn') !== null", 5000, 'empty state');
  await realClickSelector('.mb-search-empty .mb-chip-btn');
  await browser.waitFor("document.querySelectorAll('.mb-hit-item').length > 0 && !document.querySelector('.mb-search-results')?.classList.contains('hidden')", 5000, 'real mouse suggestion recovery');
  check(true, 'unknown search query shows suggestions and recovers on real mouse click');

  await browser.open(`${base}/manual.html?q=-9`);
  await browser.waitFor("document.querySelector('.mb-signal-widget') !== null", 10000, '?q=-9 opens kill page');
  check(await $('document.querySelector(".mb-search-results").classList.contains("hidden")'), '?q=-9 keeps search dropdown closed on initial load');

  // 5. Responsive threshold (880px + mobile 390x844 single page, zero horizontal overflow)
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 880, height: 800, deviceScaleFactor: 1, mobile: false });
  await browser.evaluate("window.dispatchEvent(new Event('resize'))");
  await browser.waitFor("document.querySelector('.mb-spread.single') !== null && document.querySelectorAll('.mb-page').length === 1", 5000, '880px single-page threshold');
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await browser.evaluate("window.dispatchEvent(new Event('resize'))");
  await browser.waitFor("document.querySelector('.mb-spread.single') !== null && document.querySelectorAll('.mb-page').length === 1", 5000, 'mobile single-page layout');
  check(await $('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'mobile 390x844 layout has no horizontal overflow');
  await $(`document.querySelector('.mb-toc-btn').click()`);
  await browser.waitFor("/PAGE 2 \\//.test(document.querySelector('.mb-page-counter')?.textContent ?? '')", 3000, 'mobile page 2 corner check');
  const mobileCornersSameRow = await $(`(() => {
    const l = document.querySelector('.mb-corner-left')?.getBoundingClientRect();
    const r = document.querySelector('.mb-corner-right')?.getBoundingClientRect();
    return Boolean(l && r && Math.abs(l.top - r.top) <= 2);
  })()`);
  check(mobileCornersSameRow, 'mobile single-page left/right corner turn buttons align on one row');

  // 6. In-game /play: opening dialog lock + Skip Dialog button + ls lock + battle callout + Hub #1 Map & Manual gift + modal/map checks
  const slug = listChapterSlugs()[0];
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
  await browser.open(`${base}/play/${slug}?nointro=1`);
  await browser.waitFor("window.__game && window.__manual && window.__term && !window.__game.snapshot().paused", 30000, '/play booted & unpaused');

  check(await $("window.__game.snapshot().openingDialog === true"), 'Level 1 starts with opening dialog gate active');
  check(await $("!document.getElementById('skip-dialog-btn')?.classList.contains('hidden')"), 'Skip Dialog button is visible during opening conversation');
  check(await $("document.getElementById('tty-manual-btn')?.classList.contains('hidden') && document.getElementById('hud-map')?.classList.contains('hidden')"), 'HUD hides Manual and Map buttons before obtained');
  await browser.send('Input.insertText', { text: 'pwd' });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  check((await $('window.__game.snapshot().commands')) === 0, 'terminal typing is locked while Kiro & Vibecoder opening dialog is active');
  await $(`document.getElementById('skip-dialog-btn').click()`);
  await browser.waitFor("window.__game.snapshot().openingDialog === false && window.__game.snapshot().inventory.items.includes('terminal')", 5000, 'Skip Dialog unlocks terminal on Level 1');
  await $("window.__term.submit('ls -la')");
  await browser.waitFor("/Tube Transistor/i.test(window.__term.text())", 5000, 'ls -la refused before Tube Transistor');
  check(true, 'ls -la command is disabled before obtaining the Tube Transistor');

  // Verify Level 2 opening dialog -> title-card HUD hide -> rapid Skip Dialog -> Big Four taunt -> prominent #battle-callout banner!
  await browser.open(`${base}/play/${slug}/level-02-task-ram-heist?nointro=1`);
  await browser.waitFor("window.__game && window.__term && !window.__game.snapshot().paused", 30000, 'level 2 ready');
  check(await $("window.__game.snapshot().openingDialog === true && window.__game.snapshot().battle === null"), 'Level 2 holds battle until Kiro & Vibecoder dialog finishes');
  check(await $("document.activeElement?.id !== 'terminal-input' && document.getElementById('terminal-input')?.tabIndex === -1"), 'Level 2 disables #terminal-input tab stop while opening dialog lock is active');
  check(
    await $(`['manual', 'map'].every((id) => { const s = document.querySelector('.item-slot.item-' + id); return s && s.tabIndex === -1 && s.getAttribute('aria-disabled') === 'true'; })`),
    'uncarried manual & map HUD slots have tabIndex=-1 and aria-disabled=true before Hub #1',
  );
  for (let i = 0; i < 4; i++) {
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  }
  check(await $("document.activeElement?.id !== 'terminal-input'"), 'pressing Tab during opening dialog lock never traps focus inside #terminal-input');
  const hudHiddenGuard = await $(`(() => {
    document.body.classList.add('hud-hidden');
    const st = getComputedStyle(document.getElementById('skip-dialog-btn'));
    const ok = st.visibility === 'hidden' && st.pointerEvents === 'none';
    document.body.classList.remove('hud-hidden');
    return ok;
  })()`);
  check(hudHiddenGuard, '#skip-dialog-btn stays hidden and unclickable while body.hud-hidden covers the stage');
  await $(`(() => { const b = document.getElementById('skip-dialog-btn'); b.click(); b.click(); b.click(); })()`);
  await browser.waitFor("window.__game.snapshot().battle?.phase === 'intro' && !document.getElementById('battle-callout')?.classList.contains('hidden')", 5000, 'Level 2 battle callout appears after opening dialog');
  check((await $("window.__game.events().filter((e) => e.type === 'BATTLE_STARTED').length")) === 1, 'rapid Skip Dialog clicks emit BATTLE_STARTED at most once');
  check(/BATTLE INCOMING/i.test(await text('#battle-callout')), 'battle callout announces BATTLE INCOMING on Big Four taunt');
  await $(`window.__hint.open()`);
  await browser.waitFor("window.__hint.isOpen()", 3000, 'Level 2 hint dialog open');
  check(/Field Manual locked/i.test(await text('.hint-dialog-tip')), 'hint dialog hides F1 prompt before Field Manual is obtained');
  await $(`window.__hint.close()`);
  for (const w of [760, 480, 375]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width: w, height: 820, deviceScaleFactor: 1, mobile: false });
    await browser.evaluate("window.dispatchEvent(new Event('resize'))");
    await browser.waitFor(`window.innerWidth === ${w} && !!document.querySelector('.dialog-box.open')`, 4000, `narrow ${w}px intro dialog + battle callout`);
    const clearIntro = await $(`(() => {
      const dlg = document.querySelector('.dialog-box.open')?.getBoundingClientRect();
      const callout = document.getElementById('battle-callout')?.getBoundingClientRect();
      return Boolean(dlg && callout && dlg.bottom + 4 <= callout.top);
    })()`);
    check(clearIntro, `narrow ${w}px viewport keeps .dialog-box (+shadow) clear above #battle-callout in intro phase`);
  }
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await browser.waitFor("window.__game.snapshot().battle?.phase === 'player'", 4000, 'Level 2 player phase for narrow check');
  const clearPlayer375 = await $(`(() => {
    const dlg = document.querySelector('.dialog-box.open')?.getBoundingClientRect();
    const callout = document.getElementById('battle-callout')?.getBoundingClientRect();
    return Boolean(!dlg || (callout && dlg.bottom + 4 <= callout.top));
  })()`);
  check(clearPlayer375, 'ultra-narrow 375px viewport keeps .dialog-box (+shadow) clear above multi-line player #battle-callout');
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
  await browser.evaluate("window.dispatchEvent(new Event('resize'))");
  await browser.waitFor("window.innerWidth === 1280", 3000, 'restored 1280x820 after narrow check');

  // Jump to Level 6 + collect laptop OR open Level 7 (where terminal, lantern, map, manual, AND laptop are all 5 carried!) after verifying Hub #1 gift!
  await $(`localStorage.removeItem('out-of-credits:achievements:v1')`);
  await browser.open(`${base}/play/${slug}/level-04-hub-model-one?nointro=1`);
  await browser.waitFor("window.__game && window.__manual && window.__map && window.__term && !window.__game.snapshot().paused", 30000, 'Hub #1 ready');
  check(await $("!window.__game.snapshot().inventory.items.includes('manual') && !window.__game.snapshot().inventory.items.includes('map')"), 'Hub #1 starts before Dad hands over Map & Manual');
  check((await $("document.querySelectorAll('.st-balloon').length")) === 0, 'Hub #1 arrival does not pop an overlapping 3D socket speech balloon');
  await $(`document.getElementById('skip-dialog-btn').click()`);
  await browser.waitFor("window.__game.snapshot().inventory.items.includes('manual') && window.__game.snapshot().inventory.items.includes('map')", 5000, 'Old Coder gifts Map & Manual at Hub #1');
  await browser.waitFor("window.__term.text().includes('[ITEM RECEIVED] Obtained MAP') && window.__term.text().includes('[ITEM RECEIVED] Obtained MANUAL')", 5000, 'Hub #1 prints MAP & MANUAL receipts in terminal');
  check(await $("Boolean(JSON.parse(localStorage.getItem('out-of-credits:achievements:v1') || '{}').unlocked?.field_manual)"), 'Old Coder gifting Field Manual unlocks ACH_FIELD_MANUAL');
  check(
    await $(`['manual', 'map'].every((id) => { const s = document.querySelector('.item-slot.item-' + id); return s && s.tabIndex === 0 && s.getAttribute('aria-disabled') === 'false'; })`),
    'carried manual & map HUD slots enable tabIndex=0 and aria-disabled=false after Hub #1 gift',
  );
  await $("window.__term.submit('cat dad.tty.sock')");
  await browser.waitFor("document.querySelectorAll('.st-balloon').length === 1", 5000, 'cat dad.tty.sock opens 3D socket balloon');
  await $("window.__term.submit('retry --yes')");
  await browser.waitFor("window.__game.snapshot().openingDialog === true && document.querySelectorAll('.st-balloon').length === 0", 5000, 'retry --yes clears 3D socket balloon on same-path FLOOR_ENTERED');
  check(true, 'reloading Hub #1 clears stale 3D .st-balloon before opening conversation');

  // Open Level 7 (Hub #2) where all 5 inventory items (lantern, terminal, map, manual, laptop) are carried so the full 7-slot HUD layout (the Tensor GPU and VRAM module slots stay dim) is verified too!
  await browser.open(`${base}/play/${slug}/level-07-hub-model-two?nointro=1`);
  await browser.waitFor("window.__game && window.__manual && window.__map && window.__term && !window.__game.snapshot().paused", 30000, 'Level 7 ready');
  await $(`document.getElementById('skip-dialog-btn').click()`);
  await browser.waitFor("window.__game.snapshot().openingDialog === false", 5000, 'Level 7 opening dialog skipped');

  await $(`document.querySelector('#tty-manual-btn').click()`);
  await browser.waitFor("window.__manual.isOpen() && !document.querySelector('#manual-book-modal').classList.contains('hidden')", 5000, 'modal opens from HUD tty button');
  check(await $('window.__game.snapshot().paused === false'), 'opening manual modal does NOT pause gameplay clock (Q4)');
  const cmdsBeforeBlocked = await $('window.__game.snapshot().commands');
  await browser.send('Input.insertText', { text: 'help' });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  check((await $('window.__game.snapshot().commands')) === cmdsBeforeBlocked, 'terminal input stays blocked while manual modal is open');
  const modalTocFit1280 = await checkSpreadFit(false);
  check(modalTocFit1280.ok, `in-game modal PAGE 01-02 & corner fit at 1280x820 (${JSON.stringify(modalTocFit1280)})`);
  const hudLayout1280 = await $(`(() => {
    const overlap = (a, b) => Boolean(a && b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1);
    const title = document.querySelector('#titleblock')?.getBoundingClientRect();
    const hud = document.querySelector('#hud')?.getBoundingClientRect();
    const strip = document.querySelector('.items-strip')?.getBoundingClientRect();
    const ncards = [...document.querySelectorAll('.st-ncard')].map((n) => n.getBoundingClientRect());
    const slots = document.querySelectorAll('.items-strip .item-slot');
    return {
      slots: slots.length,
      nonOverlap: Boolean(title && hud && title.right <= hud.left + 1),
      clearDoors: Boolean(hud && strip && ncards.every((c) => !overlap(hud, c) && !overlap(strip, c))),
      fits: document.documentElement.scrollWidth <= window.innerWidth && Boolean(hud && hud.right <= window.innerWidth + 1),
    };
  })()`);
  check(hudLayout1280.slots === 7 && hudLayout1280.nonOverlap && hudLayout1280.clearDoors && hudLayout1280.fits, `7-slot HUD strip clean at 1280x820 (${JSON.stringify(hudLayout1280)})`);
  await browser.shoot(out('04-play-modal'));

  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
  await browser.evaluate("window.dispatchEvent(new Event('resize'))");
  await browser.waitFor("window.innerWidth === 1024", 3000, 'modal resized to 1024x768');
  const modalTocFit1024 = await checkSpreadFit(false);
  check(modalTocFit1024.ok, `in-game modal PAGE 01-02 & corner fit at 1024x768 (${JSON.stringify(modalTocFit1024)})`);
  const hudLayout1024 = await $(`(() => {
    const overlap = (a, b) => Boolean(a && b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1);
    const title = document.querySelector('#titleblock')?.getBoundingClientRect();
    const hud = document.querySelector('#hud')?.getBoundingClientRect();
    const strip = document.querySelector('.items-strip')?.getBoundingClientRect();
    const ncards = [...document.querySelectorAll('.st-ncard')].map((n) => n.getBoundingClientRect());
    return Boolean(title && hud && strip && title.right <= hud.left + 1 && hud.right <= window.innerWidth + 1 && ncards.every((c) => !overlap(hud, c) && !overlap(strip, c)));
  })()`);
  check(hudLayout1024, '7-slot HUD strip and #hud stay clear of #titleblock and .st-ncard at 1024x768');
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
  await browser.evaluate("window.dispatchEvent(new Event('resize'))");
  await browser.waitFor("window.innerWidth === 1280", 3000, 'modal restored to 1280x820');

  // Test modal search dropdown dismissal via outside click (backdrop or book page) without closing modal
  await $(`(() => {
    const i = document.querySelector('#mb-search-input');
    i.value = 'chmod';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await browser.waitFor("!document.querySelector('.mb-search-results')?.classList.contains('hidden')", 3000, 'modal search opens');
  await $(`document.querySelector('.mb-page-left').click()`);
  await browser.waitFor("document.querySelector('.mb-search-results')?.classList.contains('hidden') && window.__manual.isOpen()", 3000, 'modal outside search click closes dropdown only');
  check(true, 'clicking book inside /play modal dismisses search dropdown while keeping modal open');
  await $(`document.querySelector('.mb-search-clear')?.click()`);

  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await browser.waitFor("!window.__manual.isOpen()", 5000, 'Escape closes manual modal');
  check(await $('window.__game.snapshot().paused === false'), 'closing manual modal keeps gameplay unpaused');

  // hold manual marks manual slot as held and renders vibecoder.dev_manual actor
  await $(`(() => { window.__term.submit('hold manual'); })()`);
  await browser.waitFor("window.__game.snapshot().inventory.held === 'manual'", 5000, 'hold manual equips manual item');
  check(await $("document.querySelector('.items-strip .item-slot.item-manual')?.classList.contains('held')"), 'HUD highlights item-manual slot when held');
  check(await $("window.__game.snapshot().room.actors.some((a) => a.model === 'vibecoder.dev_manual')"), 'hold manual renders vibecoder.dev_manual actor on stage');

  // F1 toggles manual modal open & closed
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'F1', code: 'F1', windowsVirtualKeyCode: 112 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F1', code: 'F1', windowsVirtualKeyCode: 112 });
  await browser.waitFor("window.__manual.isOpen()", 5000, 'F1 opens manual modal');
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'F1', code: 'F1', windowsVirtualKeyCode: 112 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F1', code: 'F1', windowsVirtualKeyCode: 112 });
  await browser.waitFor("!window.__manual.isOpen()", 5000, 'F1 closes manual modal');
  check(true, 'F1 shortcut toggles manual modal open and closed');

  // Run `manual chmod` from game terminal: search dropdown stays closed, ArrowRight flips, Insert -> Backspace edit -> Enter
  const cmdsBefore = await $('window.__game.snapshot().commands');
  await $(`(() => { window.__term.submit('manual chmod'); })()`);
  await browser.waitFor("window.__manual.isOpen() && document.querySelector('.mb-chmod-widget .mb-insert-btn') !== null", 5000, 'manual chmod opens modal on chmod page');
  check(await $('document.querySelector(".mb-search-results").classList.contains("hidden")'), 'manual chmod keeps search dropdown closed over the page');
  const chmodStart = await $("Number(/PAGES (\\d+)/.exec(document.querySelector('.mb-page-counter')?.textContent ?? '')?.[1])");
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await browser.waitFor(`/PAGES ${chmodStart + 2}–${chmodStart + 3}/.test(document.querySelector('.mb-page-counter')?.textContent ?? '')`, 5000, 'ArrowRight flips from chmod spread');
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  await browser.waitFor("document.querySelector('.mb-chmod-widget .mb-insert-btn') !== null", 5000, 'ArrowLeft flips back to chmod spread');
  await $(`document.querySelector('.mb-chmod-widget .mb-insert-btn').click()`);
  await browser.waitFor("!window.__manual.isOpen()", 5000, 'Insert closes modal');
  await browser.waitFor("/chmod 644 <file>/.test(window.__term.text())", 5000, 'xterm renders inserted command on prompt');
  const cmdsAfter = await $('window.__game.snapshot().commands');
  check(cmdsAfter === cmdsBefore + 1, 'Insert puts command on terminal prompt without executing an extra turn');
  for (let k = 0; k < '<file>'.length; k++) {
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  }
  await browser.send('Input.insertText', { text: 'no_such_file.txt' });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await browser.waitFor(`window.__game.snapshot().commands === ${cmdsBefore + 2}`, 5000, 'edited inserted command executes on Enter');
  check(/no_such_file\.txt/.test(await $('window.__term.text()')), 'real Backspace + typing + Enter executes edited inserted command');

  // Chapter Map popup via #hud-map button, .item-slot.item-map click, F3, `map 2` command, and two-step Deploy
  await $(`document.querySelector('#hud-map').click()`);
  await browser.waitFor("window.__map && window.__map.isOpen() && document.querySelectorAll('#chapter-map-dialog .cm-block').length === 11", 5000, 'chapter map opens with 11 motherboard blocks');
  check((await count('#chapter-map-dialog .cm-channel')) === 3, 'motherboard renders 3 data channels');
  check((await count('#chapter-map-dialog .cm-wire')) >= 6, 'motherboard renders PCB bus wires');
  check((await count('#chapter-map-dialog .cm-block.status-current .cm-here-badge')) === 1, 'current block shows LOC probe badge');
  check((await count('#chapter-map-dialog .cm-block.status-current .cm-scanbeam')) === 1, 'current block renders scanbeam sweep');
  check((await count('#chapter-map-dialog .cm-block.status-unknown')) === 9, '9 unreached blocks render in unknown state while Level 01 is ready & Level 07 is current');
  check(
    await $(`(() => { const b = document.querySelector('#chapter-map-dialog .cm-block.status-unknown'); return b ? parseFloat(getComputedStyle(b).opacity) < 0.6 : false; })()`),
    'unknown location blocks appear half-transparent / disabled',
  );
  check((await count('#chapter-map-dialog .cm-hw-bay')) === 4, 'motherboard renders 4 PC hardware bays');
  check(
    await $(`['.cm-cmos-battery', '.cm-post-box', '.cm-fan-rotor', '.cm-dimm-slot'].every((s) => document.querySelector('#cm-board ' + s))`),
    'motherboard renders CMOS battery, BIOS POST digits, PWM fan, and DIMM slots',
  );
  check(
    (await count('#chapter-map-dialog .cm-foot')) === 0 && (await count('#chapter-map-dialog .cm-pcb-header')) === 0,
    'extra map chrome (footer legend & duplicate PCB header) removed',
  );
  check((await count('#chapter-map-dialog .cm-ind-led')) >= 30, 'motherboard renders rich flashing LED indicators');
  check((await count('#chapter-map-dialog .cm-trunk-rail .cm-trunk-led')) === 6, 'vertical trunk rails render 6 flashing channel-junction LEDs');
  check(
    await $(`(() => { const ns = [...document.querySelectorAll('#chapter-map-dialog .cm-trunk-node')]; return ns.length === 6 && ns.every((n) => parseFloat(getComputedStyle(n).opacity) === 1); })()`),
    'trunk junction tap-stub wrappers stay solidly opaque while child LEDs flash',
  );
  check((await count('#chapter-map-dialog .cm-prog-seg')) === 11, 'header renders 11-segment LED progress meter');
  check(await $('window.__game.snapshot().paused === false'), 'opening chapter map does NOT pause gameplay clock');
  const mapCmdsBefore = await $('window.__game.snapshot().commands');
  await browser.send('Input.insertText', { text: 'ls' });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  check((await $('window.__game.snapshot().commands')) === mapCmdsBefore, 'terminal typing stays blocked while chapter map dialog is open');

  const checkMapFit = () => $(`(() => {
    const dlg = document.querySelector('#chapter-map-dialog');
    const board = document.querySelector('#cm-board');
    const insp = document.querySelector('#cm-inspector');
    if (!dlg || !board || !insp) return { ok: false, reason: 'missing elements' };
    const dr = dlg.getBoundingClientRect();
    const br = board.getBoundingClientRect();
    const blocks = [...board.querySelectorAll('.cm-block')].map((b) => b.getBoundingClientRect());
    const blocksInside = blocks.length === 11 && blocks.every((r) => r.top >= br.top - 1 && r.bottom <= br.bottom + 1 && r.left >= br.left - 1 && r.right <= br.right + 1);
    const boardNoScroll = board.scrollHeight <= board.clientHeight + 1 && board.scrollWidth <= board.clientWidth + 1;
    const inspNoScroll = insp.scrollHeight <= insp.clientHeight + 1;
    const dlgFits = dr.top >= 0 && dr.bottom <= window.innerHeight + 1;
    const lever = board.querySelector('.cm-zif-lever')?.getBoundingClientRect();
    const coreChip = board.querySelector('.cm-stage-core .cm-block')?.getBoundingClientRect();
    const corePinsR = board.querySelector('.cm-stage-core .cm-block .cm-pins-r')?.getBoundingClientRect();
    const coreWireR = board.querySelector('.cm-core-deck .cm-deck-wire.right .cm-deck-trace')?.getBoundingClientRect();
    const zifClear = Boolean(
      lever && coreChip && corePinsR &&
      lever.left >= corePinsR.right - 0.5 &&
      lever.left > coreChip.right &&
      (!coreWireR || coreWireR.width < 1 || lever.right <= coreWireR.left + 0.5),
    );
    return {
      ok: dlgFits && boardNoScroll && inspNoScroll && blocksInside && zifClear,
      dlgH: Math.round(dr.height),
      winH: window.innerHeight,
      boardScrollH: board.scrollHeight,
      boardClientH: board.clientHeight,
      inspScrollH: insp.scrollHeight,
      inspClientH: insp.clientHeight,
      blocksInside,
      zifClear,
    };
  })()`);
  const mapFit1280 = await checkMapFit();
  check(mapFit1280.ok, `chapter map fits screen height with zero scroll at 1280x820 (${JSON.stringify(mapFit1280)})`);

  // Verify animations & WebGL canvas survive 1-second clock ticks AND block selection without DOM reset
  await $(`(() => {
    window.__mapNodesBefore = {
      fan: document.querySelector('#cm-board .cm-fan-rotor'),
      beam: document.querySelector('#cm-board .cm-scanbeam'),
      canvas: document.querySelector('#cm-board .cm-spark-canvas'),
    };
  })()`);
  const sampleSparks = () => $(`(() => {
    const src = document.querySelector('#cm-board .cm-spark-canvas');
    if (!src || src.width < 100 || src.height < 100) return { ok: false, yellow: 0, hash: 0, w: src?.width ?? 0, h: src?.height ?? 0 };
    const tmp = document.createElement('canvas');
    tmp.width = src.width;
    tmp.height = src.height;
    const ctx = tmp.getContext('2d');
    if (!ctx) return { ok: false, yellow: 0, hash: 0, w: src.width, h: src.height };
    ctx.drawImage(src, 0, 0);
    const data = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
    let yellow = 0;
    let hash = 0;
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a > 24 && r > 170 && g > 130 && r >= g && b < r * 0.85) yellow++;
      if (a > 12) hash = (hash * 31 + r + g * 3 + (i >> 4)) >>> 0;
    }
    return { ok: yellow > 20, yellow, hash, w: src.width, h: src.height };
  })()`);
  const sparkA = await sampleSparks();
  await new Promise((r) => setTimeout(r, 1250));
  await $(`document.querySelector('#chapter-map-dialog .cm-block[data-level-index="4"]').click()`);
  check(/LVL 04/.test(await text('#cm-inspector')), 'clicking motherboard block updates chip inspector to Level 04');
  check(!(await $('document.querySelector("#cm-inspector").textContent.includes("`")')), 'chapter map inspector renders inline code with zero literal markdown backticks');
  const sparkB = await sampleSparks();
  check(sparkA.ok && sparkB.ok && sparkA.hash !== sparkB.hash, `WebGL electricity spark shader draws moving yellow sparks along wires (A=${JSON.stringify(sparkA)}, B=${JSON.stringify(sparkB)})`);
  const sparkAlignment = await $(`(() => {
    const board = document.querySelector('#cm-board');
    const src = board.querySelector('.cm-spark-canvas');
    const br = board.getBoundingClientRect();
    const rightTrunk = board.querySelector('.cm-trunk-rail.right').getBoundingClientRect();
    const bottomRail = [...board.querySelectorAll('.cm-bus-rail')].at(-1).getBoundingClientRect();
    const tmp = document.createElement('canvas');
    tmp.width = src.width;
    tmp.height = src.height;
    const ctx = tmp.getContext('2d');
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
    const sx = tmp.width / br.width;
    const sy = tmp.height / br.height;
    const yellowIn = (x0, y0, x1, y1) => {
      let n = 0;
      for (let y = Math.max(0, Math.floor(y0 * sy)); y <= Math.min(tmp.height - 1, Math.ceil(y1 * sy)); y++) {
        for (let x = Math.max(0, Math.floor(x0 * sx)); x <= Math.min(tmp.width - 1, Math.ceil(x1 * sx)); x++) {
          const i = (y * tmp.width + x) * 4;
          if (img[i + 3] > 20 && img[i] > 160 && img[i + 1] > 110) n++;
        }
      }
      return n;
    };
    const rx = rightTrunk.left - br.left + rightTrunk.width / 2;
    const by = bottomRail.top - br.top + bottomRail.height / 2;
    const onTrunk = yellowIn(rx - 9, rightTrunk.top - br.top, rx + 9, rightTrunk.bottom - br.top);
    const onRail = yellowIn(bottomRail.left - br.left, by - 9, bottomRail.right - br.left, by + 9);
    const wireLines = [...board.querySelectorAll('.cm-wire-line')].map((el) => el.getBoundingClientRect());
    const litChannelWires = wireLines.filter((wr) => {
      const wy = wr.top - br.top + wr.height / 2;
      return yellowIn(wr.left - br.left, wy - 9, wr.right - br.left, wy + 9) > 12;
    }).length;
    const deckTraces = [...board.querySelectorAll('.cm-deck-trace')].map((el) => el.getBoundingClientRect());
    const litDeckWires = deckTraces.filter((wr) => {
      const wy = wr.top - br.top + wr.height / 2;
      return yellowIn(wr.left - br.left, wy - 9, wr.right - br.left, wy + 9) > 10;
    }).length;
    const lever = board.querySelector('.cm-zif-lever')?.getBoundingClientRect();
    const coreChip = board.querySelector('.cm-stage-core .cm-block')?.getBoundingClientRect();
    const corePinsR = board.querySelector('.cm-stage-core .cm-block .cm-pins-r')?.getBoundingClientRect();
    const coreWireR = board.querySelector('.cm-core-deck .cm-deck-wire.right .cm-deck-trace')?.getBoundingClientRect();
    const zifClear = Boolean(
      lever && coreChip && corePinsR &&
      lever.left >= corePinsR.right - 0.5 &&
      lever.left > coreChip.right &&
      (!coreWireR || coreWireR.width < 1 || lever.right <= coreWireR.left + 0.5),
    );
    const badge = board.querySelector('.cm-here-badge')?.getBoundingClientRect();
    const head = board.querySelector('.cm-channel.has-current .cm-channel-head')?.getBoundingClientRect();
    const badgeClear = Boolean(!badge || !head || badge.top >= head.bottom - 1);
    return {
      ok: onTrunk > 40 && onRail > 40 && litChannelWires >= 4 && litDeckWires >= 1 && zifClear && badgeClear,
      onTrunk,
      onRail,
      litChannelWires,
      litDeckWires,
      zifClear,
      badgeClear,
    };
  })()`);
  check(sparkAlignment.ok, `WebGL sparks align cleanly on rails + inter-chip wires, ZIF lever clears LVL 11, and LOC badge stays clear (${JSON.stringify(sparkAlignment)})`);
  const nodesPreserved = await $(`(() => {
    const b = window.__mapNodesBefore;
    return Boolean(
      b &&
      b.fan === document.querySelector('#cm-board .cm-fan-rotor') &&
      b.beam === document.querySelector('#cm-board .cm-scanbeam') &&
      b.canvas === document.querySelector('#cm-board .cm-spark-canvas'),
    );
  })()`);
  check(nodesPreserved, 'board DOM & animations persist untouched across 1s game clock ticks and chip clicks');

  await browser.waitFor("(() => { const d = document.querySelector('#chapter-map-dialog'); return d && getComputedStyle(d).opacity === '1' && d.getBoundingClientRect().height > 200; })()", 3000, 'chapter map dialog animation settles visibly');
  await browser.shoot(out('05-chapter-map'));

  // Verify zero scrolling & clean screen fit at 1024x768, 1280x720, and 1440x900 too!
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
  await browser.evaluate("window.dispatchEvent(new Event('resize'))");
  await browser.waitFor("window.innerWidth === 1024", 3000, 'map resized to 1024x768');
  await new Promise((r) => setTimeout(r, 120));
  const mapFit1024 = await checkMapFit();
  check(mapFit1024.ok, `chapter map fits screen height with zero scroll at 1024x768 (${JSON.stringify(mapFit1024)})`);
  await browser.shoot(out('05b-chapter-map-1024'));
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await browser.evaluate("window.dispatchEvent(new Event('resize'))");
  await browser.waitFor("window.innerWidth === 1280", 3000, 'map resized to 1280x720');
  await new Promise((r) => setTimeout(r, 120));
  const mapFit720 = await checkMapFit();
  check(mapFit720.ok, `chapter map fits screen height with zero scroll at 1280x720 (${JSON.stringify(mapFit720)})`);
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await browser.evaluate("window.dispatchEvent(new Event('resize'))");
  await browser.waitFor("window.innerWidth === 1440", 3000, 'map resized to 1440x900');
  await new Promise((r) => setTimeout(r, 120));
  const mapFit1440 = await checkMapFit();
  check(mapFit1440.ok, `chapter map fits screen height with zero scroll at 1440x900 (${JSON.stringify(mapFit1440)})`);
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
  await browser.evaluate("window.dispatchEvent(new Event('resize'))");
  await browser.waitFor("window.innerWidth === 1280", 3000, 'map restored to 1280x820');

  // Verify WebGL context loss while closed -> reopen -> restore resumes spark animation
  const ctxSupported = await $(`(() => {
    const ext = document.querySelector('#cm-board .cm-spark-canvas')?.getContext('webgl')?.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    window.__sparkLoseExt = ext;
    window.__map.close();
    ext.loseContext();
    return true;
  })()`);
  if (ctxSupported) {
    await new Promise((r) => setTimeout(r, 120));
    await $(`window.__map.open()`);
    await browser.waitFor("window.__map.isOpen()", 3000, 'map reopened during WebGL context loss');
    await new Promise((r) => setTimeout(r, 100));
    await $(`window.__sparkLoseExt.restoreContext()`);
    await new Promise((r) => setTimeout(r, 180));
    const recA = await sampleSparks();
    await new Promise((r) => setTimeout(r, 180));
    const recB = await sampleSparks();
    check(recA.ok && recB.ok && recA.hash !== recB.hash, `WebGL sparks resume animating after closed->lost->open->restored (A=${JSON.stringify(recA)}, B=${JSON.stringify(recB)})`);
  }

  await $(`document.querySelector('#cm-close-x').click()`);
  await browser.waitFor("!window.__map.isOpen()", 5000, 'closing chapter map via X button');

  await $(`document.querySelector('.items-strip .item-slot.item-map').click()`);
  await browser.waitFor("window.__map.isOpen()", 5000, 'clicking .item-slot.item-map opens chapter map');
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'F3', code: 'F3', windowsVirtualKeyCode: 114 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F3', code: 'F3', windowsVirtualKeyCode: 114 });
  await browser.waitFor("!window.__map.isOpen()", 5000, 'F3 closes chapter map');

  await $(`(() => { window.__term.submit('map 2'); })()`);
  await browser.waitFor("window.__map.isOpen() && /LVL 02/.test(document.querySelector('#cm-inspector')?.textContent ?? '')", 5000, 'map 2 opens map focused on level 2');
  await $(`document.querySelector('#cm-deploy-btn').click()`);
  await browser.waitFor("!document.querySelector('#cm-confirm-row').classList.contains('hidden')", 5000, 'deploy shows confirm step when current level has commands');
  await $(`document.querySelector('#cm-confirm-yes').click()`);
  await browser.waitFor("!window.__map.isOpen() && window.__game.snapshot().room.floor === 2", 8000, 'confirming deploy jumps in-place to level 2');
  check(/level-02/.test(await $('location.pathname')), 'in-place deploy updates URL to level 2');
  await browser.waitFor("!window.__game.snapshot().paused", 5000, 'floor reveal card clears after deploy');

  // Mid-battle F1 & F3 keep 30s turn timer running while reading (Q4 / D5) — use post-Hub combat level (index >= 5) carrying manual & map
  const battleLevel = readChapter(slug)
    .levels.map((l) => l.spec)
    .find((l) => l.index >= 5 && l.enemies.some((e) => !e.appearWhen && e.type !== 'ransomware' && e.type !== 'spyware' && e.type !== 'rootkit') && !l.script?.safe);
  check(Boolean(battleLevel), 'found a post-Hub combat level for mid-battle F1 live timer verification');
  if (battleLevel) {
    await browser.open(`${base}/play/${slug}/${battleLevel.id}?nointro=1`);
    await browser.waitFor("window.__game && window.__manual && window.__map && window.__term && !window.__game.snapshot().paused", 30000, 'battle level ready');
    await $(`document.getElementById('skip-dialog-btn')?.click()`);
    await browser.waitFor("window.__game.snapshot().battle !== null", 8000, 'battle entered right after opening dialog');
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await browser.waitFor("window.__game.snapshot().battle?.phase === 'player'", 8000, 'battle player turn active');
    const secBefore = await $('window.__game.snapshot().battle.secondsLeft');
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'F1', code: 'F1', windowsVirtualKeyCode: 112 });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F1', code: 'F1', windowsVirtualKeyCode: 112 });
    await browser.waitFor("window.__manual.isOpen()", 5000, 'F1 opens manual during battle');
    await new Promise((r) => setTimeout(r, 2200));
    const secDuring = await $('window.__game.snapshot().battle.secondsLeft');
    check(secDuring < secBefore, `F1 keeps 30s battle turn timer live while open (${secBefore} -> ${secDuring})`);
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'F3', code: 'F3', windowsVirtualKeyCode: 114 });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F3', code: 'F3', windowsVirtualKeyCode: 114 });
    await browser.waitFor("window.__map.isOpen() && !window.__manual.isOpen()", 5000, 'F3 swaps from manual to chapter map during battle');
    await new Promise((r) => setTimeout(r, 2200));
    const secAfterMap = await $('window.__game.snapshot().battle.secondsLeft');
    check(secAfterMap < secDuring, `F3 keeps 30s battle turn timer live while map open (${secDuring} -> ${secAfterMap})`);
  }

  // 7. Classic mode (/play/floor/1) starts without manual & map by default, refuses `hold manual`, and /manual/ route resolves
  await browser.open(`${base}/play/floor/1?nointro=1`);
  await browser.waitFor("window.__game && window.__manual && window.__term && !window.__game.snapshot().paused", 30000, 'classic /play/floor/1 booted');
  check(await $("document.querySelectorAll('.items-strip .item-slot').length === 7 && document.querySelectorAll('.items-strip .item-slot.carried').length === 2"), 'classic mode renders 7-slot strip with only tube_transistor + terminal carried by default');
  await $(`document.querySelector('#terminal-pane .xterm-helper-textarea')?.focus()`);
  await browser.send('Input.insertText', { text: 'hold manual' });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await browser.waitFor("/not carrying/i.test(window.__term.text())", 5000, 'classic mode hold manual refused without manual item');
  check(await $("window.__game.snapshot().inventory.held === 'tube_transistor'"), 'classic mode keeps tube_transistor held when unowned manual is requested');
  for (const route of [`${base}/manual`, `${base}/manual/`]) {
    await browser.open(route);
    await browser.waitFor("Boolean(document.querySelector('#manual-mount .mb-brand'))", 10000, `${route} loads Field Manual`);
    check(true, `${route} opens Field Manual cleanly`);
  }

  check(externalUrls.length === 0, `zero external network requests (saw: ${externalUrls.join(', ')})`);
  check(browser.problems.length === 0, `zero runtime/console errors (saw: ${browser.problems.join(' | ')})`);
} finally {
  await browser.close();
  await vite?.close();
}

finish('manual smoke');
