#!/usr/bin/env node
// The in-game laptop overlay on /play in headless Chrome (specs .kiro/specs/play-laptop-overlay/ and .kiro/specs/laptop-rework/).
//   node scripts/harness/play-laptop-smoke.mjs [--url http://localhost:5400] [--width 1280 --height 820]
// Exit 0 = all checks passed. Screenshots: scripts/harness/out/play-laptop-*.png.
import { resolve } from 'node:path';
import { launchBrowser, sleep } from './lib/browser.mjs';
import { listChapterSlugs, readChapter } from './lib/chapter-compile.mjs';
import { parseArgs, projectRoot, startPageServer } from './lib/load.mjs';
import { checkCollector } from './lib/test-kit.mjs';

const args = parseArgs(process.argv.slice(2), ['--url', '--width', '--height']);
const width = Number(args.val('--width') ?? 1600);
const height = Number(args.val('--height') ?? 950);
const out = (name) => resolve(projectRoot, 'scripts/harness/out', `play-laptop-${name}-${width}x${height}.png`);
const { check, finish } = checkCollector();
const PROGRESS_KEY = 'out-of-credits:laptop-progress:v1';

let vite = null;
let base = args.val('--url');
if (!base) ({ vite, base } = await startPageServer(5349, { hmr: false, watch: null }));
base = base.replace(/\/$/, '');
const slug = listChapterSlugs()[0];
const browser = await launchBrowser({ width, height });
const $ = (expr, ms) => browser.evaluate(expr, ms);
const L = 'window.__laptopOverlay';

async function key(k, code = k) {
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: k === 'Escape' ? 27 : 115 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: k === 'Escape' ? 27 : 115 });
  await sleep(150);
}

async function mouseClickAt(x, y, waitMs = 150) {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await browser.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
  await sleep(waitMs);
}

async function realClick(sel, waitMs = 150) {
  const pt = await $(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  if (!pt) throw new Error(`missing ${sel}`);
  await mouseClickAt(pt.x, pt.y, waitMs);
}

async function clickOutsideLaptop() {
  const pt = await $(`(() => {
    const pts = [[24, ${height} - 24], [24, 24], [${width} - 24, ${height} - 24]];
    for (const [x, y] of pts) {
      const hit = document.elementFromPoint(x, y);
      if (hit && !hit.closest('.lt-deck, .laptop-overlay-close')) return { x, y };
    }
    return null;
  })()`);
  if (!pt) throw new Error('could not find empty space outside laptop chassis');
  await mouseClickAt(pt.x, pt.y);
}

async function hasNoScreenBodyGap() {
  return $(`(() => {
    const sr = document.querySelector('#laptop-overlay .lt-screen').getBoundingClientRect();
    const dr = document.querySelector('#laptop-overlay .lt-deck').getBoundingClientRect();
    const cols = [Math.round(sr.left + 16), Math.round((sr.left + sr.right) / 2), Math.round(sr.right - 16)];
    const y0 = Math.round(sr.bottom - 8);
    const y1 = Math.max(Math.round(dr.top + 48), Math.round(sr.bottom + 24));
    for (const x of cols) {
      for (let y = y0; y <= y1; y++) {
        if (!document.elementFromPoint(x, y)?.closest('.lt-deck')) return false;
      }
    }
    return true;
  })()`);
}

async function boot(level, query = 'nointro=1') {
  await browser.open(`${base}/play/${slug}/${level}?${query}`);
  await browser.waitFor(`window.__game && ${L} && window.__term && !window.__game.snapshot().paused && window.__term.phase() === 'play'`, 30000, `${level} ready`);
}

// Levels from the chapter's own grants: one entered before the laptop is granted, one entered after.
const chapter = readChapter(slug);
const grantAt = Math.min(...(chapter.manifest.grants ?? []).filter((g) => g.items?.includes('laptop')).map((g) => g.afterLevel));
const specs = chapter.levels.map((l) => l.spec);
const before = specs.find((l) => l.index === Math.max(1, grantAt - 1))?.id;
const after = specs.find((l) => l.index === grantAt + 1)?.id;
if (!before || !after) throw new Error(`no laptop grant in ${slug}`);

try {
  // Before the laptop is carried: dim slot, click and F4 do nothing.
  await boot(before);
  check(!(await $(`window.__game.snapshot().inventory.items.includes('laptop')`)), `${before}: laptop not carried yet`);
  check(!(await $(`document.querySelector('.item-slot.item-laptop')?.classList.contains('carried')`)), 'laptop slot is dim before it is carried');
  await realClick('.item-slot.item-laptop');
  await key('F4');
  check(!(await $(`${L}.isOpen()`)) && !(await $(`Boolean(document.getElementById('laptop-overlay'))`)), 'slot click and F4 do not open the laptop before it is carried');

  // Carried: slot click opens the overlay, auto-opens the lid, and leaves the background transparent.
  await boot(after);
  check(await $(`window.__game.snapshot().inventory.items.includes('laptop')`), `${after}: laptop carried`);
  check(await $(`document.querySelector('.item-slot.item-laptop')?.classList.contains('clickable')`), 'laptop slot is clickable when carried');
  await realClick('.item-slot.item-laptop');
  await browser.waitFor(`${L}.isOpen() && Boolean(document.querySelector('#laptop-overlay .lt-power'))`, 5000, 'slot click opens the overlay');
  const launchState = await $(`${L}.state()`);
  check(launchState === 'opening' || launchState === 'open', `the laptop auto-opens its lid on launch (${launchState})`);
  check(await $(`!document.getElementById('terminal-panel')?.contains(document.activeElement)`), 'the terminal does not keep focus while the laptop is open');
  check(await $('window.__game.snapshot().paused === false'), 'opening the laptop does not pause the game clock');
  check(await $(`(() => {
    const ov = getComputedStyle(document.getElementById('laptop-overlay'));
    const pn = getComputedStyle(document.querySelector('.laptop-overlay-panel'));
    const sc = getComputedStyle(document.querySelector('#laptop-overlay .lt-scene'));
    return ov.backgroundColor === 'rgba(0, 0, 0, 0)'
      && pn.backgroundColor === 'rgba(0, 0, 0, 0)'
      && parseFloat(pn.borderTopWidth) === 0
      && sc.backgroundColor === 'rgba(0, 0, 0, 0)'
      && sc.backgroundImage === 'none';
  })()`), 'the /play laptop overlay background, panel frame, and scene fill are completely transparent');

  await browser.waitFor(`${L}.state() === 'open'`, 5000, 'auto-open settles on open');
  await sleep(150);
  check(await hasNoScreenBodyGap(), 'there is no gap between the screen lid and the body while open');
  check(await $(`(() => { const b = document.querySelector('#laptop-overlay .lt-power'); return b?.dataset.power === 'ready' && !b.disabled; })()`), 'the physical Power button highlights ready once open');

  // Power button boots and shuts down; dark screen still boots in open.
  await realClick('#laptop-overlay .lt-power');
  await browser.waitFor(`${L}.state() === 'booting'`, 5000, 'Power button boots the laptop');
  await sleep(200);
  check(await hasNoScreenBodyGap(), 'there is no gap between the screen lid and the body while booting');
  check(await $(`document.querySelector('#laptop-overlay .lt-power')?.dataset.power === 'on'`), 'the Power button shows on while booting');
  await browser.shoot(out('open'));
  await realClick('#laptop-overlay .lt-power');
  await browser.waitFor(`${L}.state() === 'open'`, 6000, 'Power button shuts down back to open');
  await sleep(150);
  await realClick('#laptop-overlay .lt-screen');
  await browser.waitFor(`${L}.state() === 'diving' || ${L}.state() === 'booting'`, 3000, 'clicking the dark screen in open still boots');

  // Escape closes it and does not open the Esc menu.
  await key('Escape');
  await browser.waitFor(`!${L}.isOpen()`, 3000, 'Escape closes the laptop');
  check(!(await $(`Boolean(document.getElementById('laptop-overlay'))`)), 'the overlay node is removed on close');
  check(!(await $(`window.__menu.isOpen()`)), 'Escape that closes the laptop does not open the Esc menu');

  // F4 toggles; outside empty-space click closes and restores terminal focus; Close button closes too.
  await key('F4');
  await browser.waitFor(`${L}.isOpen()`, 3000, 'F4 opens the laptop');
  const f4State = await $(`${L}.state()`);
  check(f4State === 'opening' || f4State === 'open', `F4 auto-opens the laptop (${f4State})`);
  await key('F4');
  await browser.waitFor(`!${L}.isOpen()`, 3000, 'F4 closes the laptop');

  await key('F4');
  await browser.waitFor(`${L}.state() === 'open'`, 5000, 'F4 reopens and settles on open');
  await $(`document.getElementById('skip-dialog-btn')?.click()`);
  await sleep(150);
  await clickOutsideLaptop();
  await browser.waitFor(`!${L}.isOpen()`, 3000, 'clicking empty space outside the laptop closes it');
  check(!(await $(`window.__menu.isOpen()`)), 'outside click does not open the Esc menu');
  await browser.waitFor(`document.getElementById('terminal-panel')?.contains(document.activeElement)`, 3000, 'focus returns to the terminal after outside-click close');

  await key('F4');
  await browser.waitFor(`${L}.state() === 'open'`, 5000, 'F4 opens again for Close button check');
  await realClick('.laptop-overlay-close', 40);
  check(await $(`Boolean(document.getElementById('laptop-overlay')?.classList.contains('is-closing')) && ${L}.state() === 'closing'`), 'Close button starts the fast lid-close animation before hiding');
  await browser.waitFor(`!${L}.isOpen()`, 3000, 'the Close button closes the laptop');
  await browser.waitFor(`document.getElementById('terminal-panel')?.contains(document.activeElement)`, 3000, 'focus returns to the terminal after Close button');

  // Progress key: a preview writes none.
  await $(`localStorage.removeItem(${JSON.stringify(PROGRESS_KEY)})`);
  await boot(after, 'nointro=1&preview=1');
  await key('F4');
  await browser.waitFor(`${L}.state() === 'open'`, 5000, 'F4 opens and settles in a preview');
  await realClick('#laptop-overlay .lt-power');
  await sleep(400);
  await key('Escape');
  await browser.waitFor(`!${L}.isOpen()`, 3000, 'Escape closes laptop in preview');
  check(await $(`localStorage.getItem(${JSON.stringify(PROGRESS_KEY)}) === null`), 'a preview keeps laptop progress in memory only');
  check(browser.problems.length === 0, `no page errors (${browser.problems.slice(0, 3).join(' | ')})`);
} catch (err) {
  check(false, String(err?.message ?? err));
} finally {
  await browser.close();
  await vite?.close();
}
finish(`play-laptop smoke ${width}x${height}`);
