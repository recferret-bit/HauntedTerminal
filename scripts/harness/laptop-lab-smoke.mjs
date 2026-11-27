#!/usr/bin/env node
// Drives the Laptop Lab (/laptop-lab) in headless Chrome with real input. Exit 0 = every check passed.
//   node scripts/harness/laptop-lab-smoke.mjs                 own Vite on 5346
//   node scripts/harness/laptop-lab-smoke.mjs --url http://localhost:5400
//   node scripts/harness/laptop-lab-smoke.mjs --width 1280 --height 820
// Covers: the lifecycle (open, dive, boot, desktop, shut down, close) with screenshots of each phase, real key
// presses on the deck, the pointer on the trackpad, the desktop windows, the JS and page runners (errors, endless
// loops in a Worker and in a page), and every task: the starter fails, the reference solution passes. Screenshots: scripts/harness/out/laptop-*.png.
import { resolve } from 'node:path';
import { launchBrowser, sleep } from './lib/browser.mjs';
import { parseArgs, projectRoot, startPageServer, withProcgen } from './lib/load.mjs';
import { checkCollector } from './lib/test-kit.mjs';

const args = parseArgs(process.argv.slice(2), ['--url', '--width', '--height']);
const shot = (name) => resolve(projectRoot, 'scripts/harness/out', `laptop-${name}.png`);
const { check, finish } = checkCollector();

const tasks = await withProcgen(async (m) => m.TASKS.map((t) => ({ id: t.id, app: t.app, starter: t.starter, solution: t.solution })), '/src/laptop/domain/tasks.ts');

let vite = null;
let base = args.val('--url');
if (!base) ({ vite, base } = await startPageServer(5346, { hmr: false, watch: null }));
base = base.replace(/\/$/, '');
const browser = await launchBrowser({ width: Number(args.val('--width', 1600)), height: Number(args.val('--height', 950)) });
const $ = (expr, ms) => browser.evaluate(expr, ms);
const L = 'window.__laptop';
const state = () => $(`${L}.machine.state`);
const waitState = (s, ms = 12000) => browser.waitFor(`${L}.machine.state === ${JSON.stringify(s)}`, ms, `state ${s}`);
const key = async (type, code, keyName) => browser.send('Input.dispatchKeyEvent', { type, code, key: keyName, windowsVirtualKeyCode: keyName.toUpperCase().charCodeAt(0) });
const mouse = (type, x, y, extra = {}) => browser.send('Input.dispatchMouseEvent', { type, x, y, button: 'none', ...extra });

try {
  await browser.open(`${base}/laptop-lab?mute=1`);
  await browser.waitFor(`!!${L}`, 30000, 'the laptop lab');
  await sleep(300);
  check(await state() === 'closed', 'starts closed');
  check(await $(`[...document.querySelectorAll('.lt-key')].length`) >= 70, 'the deck has a full keyboard');
  check(await $(`(() => {
    const sc = getComputedStyle(document.querySelector('.lt-scene'));
    const st = getComputedStyle(document.querySelector('.ll-stage'));
    return sc.backgroundColor === 'rgb(33, 26, 54)' && sc.backgroundImage.includes('radial-gradient') && parseFloat(st.borderTopWidth) > 0;
  })()`), '/laptop-lab keeps its comic-panel border and purple halftone .lt-scene background');
  check(await $(`Boolean(document.querySelector('.lt-topstrip .lt-power'))`), 'the deck has a physical Power button beside the speaker grille');
  await browser.shoot(shot('1-closed'));

  // ---- lifecycle, with a frame in the middle of each animation ----
  await $(`document.querySelector('.lt-lid').click()`);
  check(await state() === 'opening', 'a click on the shut lid opens it');
  await sleep(500);
  await browser.shoot(shot('2-opening'));
  await waitState('open');
  await sleep(200);
  await browser.shoot(shot('3-open'));
  check(JSON.stringify(await $(`[...document.querySelectorAll('.ll-actions [data-event]')].map((b) => b.dataset.event)`)) === '["POWER","CLOSE"]', 'the lab offers exactly the events the open state takes');
  check(await $(`(() => { const b = document.querySelector('.lt-power'); return b?.dataset.power === 'ready' && !b.disabled; })()`), 'the Power button highlights ready when the lid is open');
  await $(`document.querySelector('.lt-power').click()`);
  await sleep(600);
  await browser.shoot(shot('4-diving'));
  await waitState('booting');
  await sleep(900);
  check((await $(`document.querySelector('.lt-bios').textContent`)).includes('Memory test'), 'BIOS text and the memory count play while booting');
  await browser.shoot(shot('5-bios'));
  await sleep(2400);
  check(await $(`document.querySelector('.lt-boot').classList.contains('splash')`), 'the OS splash follows the BIOS');
  await browser.shoot(shot('6-splash'));
  await waitState('desktop');
  await sleep(300);
  check(await $(`document.querySelector('.lt-power')?.dataset.power === 'on'`), 'the Power button shows on while on the desktop');
  check(await $(`!!document.querySelector('.lt-window[data-app="quests"]')`), 'the desktop opens with Quests');
  await browser.shoot(shot('7-desktop'));

  // ---- real keyboard on the deck ----
  await $(`document.activeElement?.blur()`);
  await key('keyDown', 'KeyA', 'a');
  check(await $(`document.querySelector('.lt-key[data-code="KeyA"]').classList.contains('down')`), 'a real A press pushes the A key down');
  await key('keyDown', 'ShiftLeft', 'Shift');
  check(JSON.stringify(await $(`${L}.view.keyboard.pressed()`)) === '["KeyA","ShiftLeft"]', 'two held keys stay down together');
  await browser.shoot(shot('8-keys'));
  await key('keyUp', 'KeyA', 'a');
  await key('keyUp', 'ShiftLeft', 'Shift');
  check(await $(`document.querySelectorAll('.lt-key.down').length`) === 0, 'released keys come back up');
  const capsBox = await $(`(() => { const r = document.querySelector('.lt-key[data-code="CapsLock"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await mouse('mouseMoved', capsBox.x, capsBox.y);
  await mouse('mousePressed', capsBox.x, capsBox.y, { button: 'left', clickCount: 1 });
  await mouse('mouseReleased', capsBox.x, capsBox.y, { button: 'left', clickCount: 1 });
  check(await $(`document.querySelector('.lt-led[data-led="caps"]').dataset.mode`) === 'on', 'clicking CapsLock lights the A indicator');
  await sleep(180);
  check(!(await $(`document.querySelector('.lt-key[data-code="CapsLock"]').classList.contains('down')`)), 'CapsLock releases right after click while A indicator stays on');
  check(await $(`document.querySelector('.lt-led[data-led="caps"]').dataset.mode`) === 'on', 'A indicator stays on after CapsLock releases');
  await mouse('mousePressed', capsBox.x, capsBox.y, { button: 'left', clickCount: 1 });
  await mouse('mouseReleased', capsBox.x, capsBox.y, { button: 'left', clickCount: 1 });
  await sleep(180);
  check(await $(`document.querySelector('.lt-led[data-led="caps"]').dataset.mode`) === 'off', 'clicking CapsLock again toggles the A indicator off');

  // ---- real pointer on the trackpad ----
  const box = await $(`(() => { const r = document.querySelector('.lt-screen').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  await mouse('mouseMoved', box.x + box.w * 0.75, box.y + box.h * 0.25);
  const pad = await $(`${L}.view.trackpad.state()`);
  check(pad.touching && Math.abs(pad.u - 0.75) < 0.03 && Math.abs(pad.v - 0.25) < 0.03, `the finger follows the pointer (${pad.u.toFixed(2)}, ${pad.v.toFixed(2)})`);
  await mouse('mousePressed', box.x + box.w * 0.75, box.y + box.h * 0.25, { button: 'left', clickCount: 1 });
  check(await $(`document.querySelector('.lt-btn').classList.contains('down')`), 'a real click presses the left trackpad button');
  await mouse('mouseReleased', box.x + box.w * 0.75, box.y + box.h * 0.25, { button: 'left', clickCount: 1 });
  check(!(await $(`document.querySelector('.lt-btn').classList.contains('down')`)), 'and lets it go');

  // ---- desktop icons & windows ----
  const beforePos = await $(`${L}.desktop.state().icons.jspad`);
  const iconBox = await $(`(() => { const r = document.querySelector('.lt-icon[data-app="jspad"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await mouse('mouseMoved', iconBox.x, iconBox.y);
  await mouse('mousePressed', iconBox.x, iconBox.y, { button: 'left', clickCount: 1 });
  await mouse('mouseMoved', box.x + box.w * 0.72, box.y + box.h * 0.55);
  await mouse('mouseReleased', box.x + box.w * 0.72, box.y + box.h * 0.55, { button: 'left', clickCount: 1 });
  const afterPos = await $(`${L}.desktop.state().icons.jspad`);
  check(afterPos.x > beforePos.x + 100 && afterPos.y > beforePos.y, `dragging JSPAD.EXE moves it on the desktop (${beforePos.x},${beforePos.y} -> ${afterPos.x},${afterPos.y})`);
  const movedBox = await $(`(() => { const r = document.querySelector('.lt-icon[data-app="jspad"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await mouse('mouseMoved', movedBox.x, movedBox.y);
  await mouse('mousePressed', movedBox.x, movedBox.y, { button: 'left', clickCount: 1 });
  await mouse('mouseReleased', movedBox.x, movedBox.y, { button: 'left', clickCount: 1 });
  await mouse('mousePressed', movedBox.x, movedBox.y, { button: 'left', clickCount: 2 });
  await mouse('mouseReleased', movedBox.x, movedBox.y, { button: 'left', clickCount: 2 });
  check(await $(`${L}.desktop.state().focus`) === 'jspad', 'a real double click on moved JSPAD.EXE opens and focuses JS Pad');
  await $(`document.querySelector('.lt-window[data-app="jspad"] [aria-label^="Minimise"]').click()`);
  check(await $(`document.querySelector('.lt-window[data-app="jspad"]').hidden && getComputedStyle(document.querySelector('.lt-window[data-app="jspad"]')).display === 'none'`), 'minimise visually hides the window');
  await $(`document.querySelector('.lt-taskbtn[data-app="jspad"]').click()`);
  check(!(await $(`document.querySelector('.lt-window[data-app="jspad"]').hidden`)) && await $(`getComputedStyle(document.querySelector('.lt-window[data-app="jspad"]')).display !== 'none'`), 'its taskbar button brings it back');

  // ---- right-click desktop context menu ----
  await $(`document.querySelector('.lt-window[data-app="jspad"] [aria-label^="Minimise"]').click()`);
  await mouse('mouseMoved', box.x + box.w * 0.85, box.y + box.h * 0.85);
  await mouse('mousePressed', box.x + box.w * 0.85, box.y + box.h * 0.85, { button: 'right', clickCount: 1 });
  await mouse('mouseReleased', box.x + box.w * 0.85, box.y + box.h * 0.85, { button: 'right', clickCount: 1 });
  check(!(await $(`document.querySelector('.lt-ctxmenu').hidden`)), 'right-clicking the desktop opens the context menu');
  await $(`document.querySelector('.lt-ctxmenu [data-app="sysinfo"]').click()`);
  check(await $(`${L}.desktop.state().focus`) === 'sysinfo', 'clicking an app in the desktop context menu opens it');
  await $(`document.querySelector('.lt-window[data-app="sysinfo"] [aria-label^="Close"]').click()`);
  await $(`document.querySelector('.lt-taskbtn[data-app="jspad"]').click()`);

  // ---- the runners: plain runs, errors, an endless loop ----
  const run = (app, files) => $(`(async () => { const v = ${L}.desktop.view(${JSON.stringify(app)}); v.setFiles(${JSON.stringify(files)}); return v.run(); })()`, 15000);
  const ok = await run('jspad', { html: '', css: '', js: 'console.log(1 + 1, [1, "a"], { k: 2 });' });
  check(ok.logs[0]?.text === '2 [1, "a"] { k: 2 }' && !ok.error, `JS Pad prints values like a console (${ok.logs[0]?.text})`);
  const bad = await run('jspad', { html: '', css: '', js: 'nope();' });
  check(/ReferenceError/.test(bad.error ?? ''), `an uncaught error is reported (${bad.error})`);
  const loop = await run('jspad', { html: '', css: '', js: 'while (true) {}' });
  check(loop.timedOut && (await $('1 + 1')) === 2, 'an endless loop times out and the page stays responsive');
  await $(`${L}.ctx.open('weaver')`);
  const pageRun = await run('weaver', { html: '<p id="x">hi</p>', css: '', js: 'console.log(document.getElementById("x").textContent); parent.document.title = "pwned";' });
  check(pageRun.logs[0]?.text === 'hi' && /SecurityError|cross-origin|Blocked/i.test(pageRun.error ?? ''), `a page runs sandboxed: its DOM works, this page is out of reach (${pageRun.error})`);

  const pageLoop = await run('weaver', { html: '<p>x</p>', css: '', js: 'console.log("before");\nwhile (true) {}' });
  check(/loop on line 2 ran for over/.test(pageLoop.error ?? '') && pageLoop.logs[0]?.text === 'before' && !pageLoop.timedOut, `an endless while in a page stops with its line (${pageLoop.error})`);
  check((await $('1 + 1')) === 2, 'the lab stays responsive after it');
  const forLoop = await run('weaver', { html: '', css: '', js: 'let n = 0;\n\nfor (;;) { n++; }' });
  check(/loop on line 3/.test(forLoop.error ?? ''), `an endless for (;;) stops too (${forLoop.error})`);
  const inline = await run('weaver', { html: '<p>hi</p>\n<script>\n  while (true) {}\n</script>', css: '', js: '' });
  check(/loop on line 3/.test(inline.error ?? ''), `a loop in an inline <script> of the HTML is guarded too (${inline.error})`);
  const attr = await run('weaver', { html: '<body onload="while (true) {}"></body>', css: '', js: '' });
  check(/loop on line 1/.test(attr.error ?? ''), `a loop in an onload attribute is guarded too (${attr.error})`);
  const unguarded = await run('weaver', { html: '', css: '', js: 'setTimeout("while (true) {}", 0);' });
  const stoppedPage = await $(`document.querySelector('.lt-window[data-app="weaver"] .lt-preview').srcdoc.includes('stopped')`);
  check(unguarded.timedOut && stoppedPage && (await $('1 + 1')) === 2, 'a loop the guard cannot see (code in a string) times out and the preview shows it was stopped');
  const after = await $(`(async () => { const v = ${L}.desktop.view('weaver'); v.setFiles(${JSON.stringify({ html: '<b id="ok">fine</b>', css: '', js: 'for (let i = 0; i < 3; i++) console.log(i);' })}); return v.run(); })()`, 45000);
  check(!after.error && after.logs.map((l) => l.text).join(',') === '0,1,2', `the next run waits for the preview to recover, then works; finite loops are untouched${after.timedOut || after.error ? ` (${JSON.stringify(after)})` : ''}`);
  const clickLoop = await $(`(async () => { const v = ${L}.desktop.view('weaver'); v.setFiles({ html: '<button id="b">b</button>', css: '', js: 'document.getElementById("b").onclick = () => { while (1) {} };' }); return v.run(); })()`, 15000);
  check(!clickLoop.error, 'a loop that only a click starts does not stop the page load');

  // ---- every task: the starter fails, the reference solution passes ----
  for (const t of tasks) {
    const starter = await $(`${L}.runTask(${JSON.stringify(t.id)}, ${JSON.stringify(t.starter)})`, 15000);
    check(starter.some((r) => !r.ok), `${t.id}: the starter code does not pass`);
    const solved = await $(`${L}.runTask(${JSON.stringify(t.id)}, ${JSON.stringify(t.solution)})`, 15000);
    check(solved.length > 0 && solved.every((r) => r.ok), `${t.id}: the reference solution passes${solved.every((r) => r.ok) ? '' : ` (${solved.filter((r) => !r.ok).map((r) => `${r.label}: ${r.detail}`).join('; ')})`}`);
  }
  check(await $(`${L}.ctx.progress().done.length`) === tasks.length, 'every task is marked solved');
  check(await $(`document.querySelectorAll('.lt-quests li.done').length`) === tasks.length, 'Quests shows them all done');
  await $(`${L}.ctx.startTask('web-button')`);
  await sleep(400);
  await browser.shoot(shot('9-task'));

  // ---- shut down and close ----
  await $(`${L}.ctx.open('sysinfo')`);
  await $(`[...document.querySelectorAll('.lt-window[data-app="sysinfo"] button')].find((b) => b.textContent.startsWith('Shut down')).click()`);
  check(await state() === 'shutting', 'Shut down... powers off');
  await sleep(400);
  await browser.shoot(shot('10-bye'));
  await waitState('open');
  check(await $(`${L}.desktop.state().windows.length`) === 0, 'the desktop is cleared on shutdown');
  await $(`${L}.machine.send('CLOSE')`);
  await waitState('closed');
  check(true, 'the lid closes');

  await $(`${L}.resetProgress()`);
  check(browser.problems.length === 0, `no page errors${browser.problems.length ? `: ${browser.problems.join(' | ')}` : ''}`);
} catch (err) {
  check(false, `smoke run threw: ${err.message}`);
} finally {
  await browser.close();
  await vite?.close();
}
finish('laptop lab smoke');
