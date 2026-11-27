#!/usr/bin/env node
// The in-game laptop overlay on /play in headless Chrome (spec .kiro/specs/play-laptop-overlay/). Exit 0 = all checks passed.
//   node scripts/harness/play-laptop-smoke.mjs [--url http://localhost:5400] [--width 1280 --height 820]
// Screenshots: scripts/harness/out/play-laptop-*.png.
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

async function realClick(sel) {
  const pt = await $(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  if (!pt) throw new Error(`missing ${sel}`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await browser.send('Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  }
  await sleep(150);
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

  // Carried (granted from the later level): slot click opens the closed lid.
  await boot(after);
  check(await $(`window.__game.snapshot().inventory.items.includes('laptop')`), `${after}: laptop carried`);
  check(await $(`document.querySelector('.item-slot.item-laptop')?.classList.contains('clickable')`), 'laptop slot is clickable when carried');
  await realClick('.item-slot.item-laptop');
  await browser.waitFor(`${L}.isOpen() && Boolean(document.querySelector('#laptop-overlay .lt-lid'))`, 5000, 'slot click opens the overlay');
  check(await $(`${L}.state()`) === 'closed', 'the laptop starts with the lid closed');
  check(await $(`!document.getElementById('terminal-panel')?.contains(document.activeElement)`), 'the terminal does not keep focus while the laptop is open');
  check(await $('window.__game.snapshot().paused === false'), 'opening the laptop does not pause the game clock');
  await realClick('#laptop-overlay .lt-lid');
  await browser.waitFor(`${L}.state() !== 'closed'`, 3000, 'click on the lid opens it');
  check(await $(`${L}.state()`) !== 'closed', 'clicking the lid starts the open/boot sequence');
  await sleep(600);
  await browser.shoot(out('open'));

  // Escape closes it and does not open the Esc menu.
  await key('Escape');
  await browser.waitFor(`!${L}.isOpen()`, 3000, 'Escape closes the laptop');
  check(!(await $(`Boolean(document.getElementById('laptop-overlay'))`)), 'the overlay node is removed on close');
  check(!(await $(`window.__menu.isOpen()`)), 'Escape that closes the laptop does not open the Esc menu');

  // F4 toggles; a fresh laptop each time starts closed; Close button closes.
  await key('F4');
  await browser.waitFor(`${L}.isOpen()`, 3000, 'F4 opens the laptop');
  check(await $(`${L}.state()`) === 'closed', 'the laptop starts closed again on every open');
  await key('F4');
  await browser.waitFor(`!${L}.isOpen()`, 3000, 'F4 closes the laptop');
  await key('F4');
  await browser.waitFor(`${L}.isOpen()`, 3000, 'F4 reopens the laptop');
  // The opening conversation keeps the terminal unfocusable; skip it so the focus return can show.
  await $(`document.getElementById('skip-dialog-btn')?.click()`);
  await realClick('.laptop-overlay-close');
  await browser.waitFor(`!${L}.isOpen()`, 3000, 'the Close button closes the laptop');
  check(true, 'F4 toggles and the Close button closes');
  await browser.waitFor(`document.getElementById('terminal-panel')?.contains(document.activeElement)`, 3000, 'focus returns to the terminal after close');
  check(true, 'focus returns to the terminal after the laptop closes');

  // Progress key: a preview writes none.
  await $(`localStorage.removeItem(${JSON.stringify(PROGRESS_KEY)})`);
  await boot(after, 'nointro=1&preview=1');
  await key('F4');
  await browser.waitFor(`${L}.isOpen()`, 3000, 'F4 opens the laptop in a preview');
  await realClick('#laptop-overlay .lt-lid');
  await sleep(400);
  await key('Escape');
  check(await $(`localStorage.getItem(${JSON.stringify(PROGRESS_KEY)}) === null`), 'a preview keeps laptop progress in memory only');
  check(browser.problems.length === 0, `no page errors (${browser.problems.slice(0, 3).join(' | ')})`);
} catch (err) {
  check(false, String(err?.message ?? err));
} finally {
  await browser.close();
  await vite?.close();
}
finish(`play-laptop smoke ${width}x${height}`);
