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

  // ArrowRight works right after choosing a search result
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await browser.waitFor("/PAGES 35–36/.test(document.querySelector('.mb-page-counter')?.textContent ?? '')", 5000, 'ArrowRight flips after search hit');
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

  // 6. In-game /play modal (1280x820 & 1024x768) + pause + Esc close + manual <cmd> + ArrowRight + Insert + real Backspace/Enter + battle timer hold
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
  await browser.open(`${base}/play/${listChapterSlugs()[0]}?nointro=1`);
  await browser.waitFor("window.__game && window.__manual && window.__term && !window.__game.snapshot().paused", 30000, '/play booted & unpaused');

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
  check(hudLayout1280.slots === 4 && hudLayout1280.nonOverlap && hudLayout1280.clearDoors && hudLayout1280.fits, `4-item HUD strip clean at 1280x820 (${JSON.stringify(hudLayout1280)})`);
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
  check(hudLayout1024, '4-item HUD strip and #hud stay clear of #titleblock and .st-ncard at 1024x768');
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

  // hold manual marks manual slot as held
  await $(`(() => { window.__term.submit('hold manual'); })()`);
  await browser.waitFor("window.__game.snapshot().inventory.held === 'manual'", 5000, 'hold manual equips manual item');
  check(await $("document.querySelector('.items-strip .item-slot.item-manual')?.classList.contains('held')"), 'HUD highlights item-manual slot when held');

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
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await browser.waitFor("/PAGES 19–20/.test(document.querySelector('.mb-page-counter')?.textContent ?? '')", 5000, 'ArrowRight flips from chmod spread');
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

  // Mid-battle F1 keeps 30s turn timer running while reading (Q4)
  const slug = listChapterSlugs()[0];
  const battleLevel = readChapter(slug).levels.map((l) => l.spec).find((l) => l.enemies.length > 0 && !l.script?.safe);
  check(Boolean(battleLevel), 'found a combat level for mid-battle F1 live timer verification');
  if (battleLevel) {
    await browser.open(`${base}/play/${slug}/${battleLevel.id}?nointro=1`);
    await browser.waitFor("window.__game && window.__manual && window.__term && !window.__game.snapshot().paused", 30000, 'battle level ready');
    await $(`window.__term.submit('ls')`);
    await browser.waitFor("window.__game.snapshot().battle !== null", 8000, 'battle entered');
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
  }

  // 7. Classic mode (/play/floor/1) carries manual item, equips vibecoder.dev_manual, and /manual/ route resolves
  await browser.open(`${base}/play/floor/1?nointro=1`);
  await browser.waitFor("window.__game && window.__manual && window.__term && !window.__game.snapshot().paused", 30000, 'classic /play/floor/1 booted');
  check(await $("document.querySelectorAll('.items-strip .item-slot').length === 4"), 'classic mode renders 4-slot items strip');
  await $(`document.querySelector('#terminal-pane .xterm-helper-textarea')?.focus()`);
  await browser.send('Input.insertText', { text: 'hold manual' });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await browser.waitFor("window.__game.snapshot().inventory.held === 'manual'", 5000, 'classic mode hold manual equips manual');
  check(await $("window.__game.snapshot().room.actors.some((a) => a.model === 'vibecoder.dev_manual')"), 'classic mode hold manual renders vibecoder.dev_manual actor');
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
