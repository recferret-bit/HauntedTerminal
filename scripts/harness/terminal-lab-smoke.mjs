#!/usr/bin/env node
// Drives the Terminal Lab (/terminal-lab) in headless Chrome. Exit 0 = every check passed.
//   node scripts/harness/terminal-lab-smoke.mjs                         own Vite on 5345, labs API on a temporary copy
//   node scripts/harness/terminal-lab-smoke.mjs --width 1280 --height 820
//   node scripts/harness/terminal-lab-smoke.mjs --url http://localhost:5400   a running server (repo writes are skipped)
// Screenshots: scripts/harness/out/terminal-lab-*.png.
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { launchBrowser } from './lib/browser.mjs';
import { stringifyLabJson } from './lib/lab-json.mjs';
import { committedLabs, loadLabModules, runLabText } from './lib/lab-run.mjs';
import { parseArgs, projectRoot, startPageServer, withProcgen } from './lib/load.mjs';
import { labsDir } from './lib/terminal-lab-api.mjs';
import { checkCollector } from './lib/test-kit.mjs';

const args = parseArgs(process.argv.slice(2), ['--url', '--width', '--height']);
const out = (name) => resolve(projectRoot, 'scripts/harness/out', `terminal-lab-${name}.png`);
const { check, finish } = checkCollector();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Polls a Node-side condition (a file on disk). */
async function until(fn, ms, what) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(150)) if (fn()) return true;
  throw new Error(`timed out after ${ms} ms waiting for ${what}`);
}

// The browser-vs-Node transcript of every committed lab, computed before the browser starts.
const labs = committedLabs();
const nodeTranscripts = await withProcgen(async (_p, v) => {
  const mods = await loadLabModules(v);
  const res = {};
  for (const { file, text } of labs) res[file] = (await runLabText(mods, text)).transcript;
  return res;
});

let vite = null;
let base = args.val('--url');
const ownServer = !base;
const tempLabs = ownServer ? mkdtempSync(join(tmpdir(), 'terminal-lab-smoke-')) : null;
if (ownServer) {
  cpSync(labsDir, tempLabs, { recursive: true });
  process.env.TERMINAL_LAB_DIR = tempLabs;
  ({ vite, base } = await startPageServer(5345, { hmr: false, watch: null }));
}
base = base.replace(/\/$/, '');
const browser = await launchBrowser({ width: Number(args.val('--width', 1600)), height: Number(args.val('--height', 950)) });
const $ = (expr, ms) => browser.evaluate(expr, ms);
const L = 'window.__terminalLab';
const W = "document.querySelector('.pv-frame').contentWindow";
const count = (sel) => $(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const text = (sel) => $(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? ''`);
const termText = () => $(`${W}.__term.text()`);
const waitTerm = (re, what) => browser.waitFor(`${re}.test(${W}.__term.text())`, 10000, what);
const execCount = () => $(`${W}.__lab.execLog().count`);
const load = (script) => $(`${L}.load(${JSON.stringify(script)}).then(() => ${L}.state().phase)`, 60000);
const room = { roomKind: 'lab_hall', floorTheme: 2, mechanic: 'terminal', cwd: '/lab', title: 'S', summary: 's' };
const bare = (id, setup, steps = []) => ({ id, title: id, room, player: { ram: 0, ssd: 0, core: '' }, clock: 'manual', enemyFire: 'live', setup, steps });

try {
  // ---- open ------------------------------------------------------------------------------------------------------
  const worm = JSON.parse(readFileSync(resolve(labsDir, 'enemy-worm.lab.json'), 'utf8'));
  await browser.open(`${base}/terminal-lab/enemy-worm?tab=world`);
  await browser.waitFor(`${L} && ${L}.ready && ${L}.state().phase === 'play'`, 40000, 'the lab and its game');
  check((await $(`${L}.state().labId`)) === 'enemy-worm' && (await $(`${L}.script().steps.length`)) === worm.steps.length, 'a deep link opens a lab that is only in the repo');
  check((await $(`${L}.state().tab`)) === 'world', 'the ?tab= of the URL picks the Inspector tab');
  await $(`${L}.setTab('object')`);
  check((await count('.cx-ed > .ed-side, .cx-ed > .ed-main, .cx-ed > .cx-timeline, .cx-ed > .cx-stage')) === 4, 'scene, inspector, console docks and the stage are mounted');
  check(await $("document.querySelector('.pv-frame').getBoundingClientRect().width > 300"), 'the game viewport has a usable size');
  check(!/KIROWEEN|Kiroween/.test(await termText()), 'the banner is the lab one, not a chapter issue title');

  await load(bare('empty', [{ op: 'file', path: '/lab/readme.txt', content: 'Terminal Lab\n' }]));
  await $(`${L}.submit('ls')`);
  await waitTerm('/readme\\.txt/', 'ls output');
  check(true, 'ls in the game terminal lists the room');
  const historyLen = await $('history.length');
  for (let i = 0; i < 3; i++) await $(`${L}.reload()`, 60000);
  check((await $('history.length')) === historyLen, 'reloading the game adds no browser history entries');
  await browser.shoot(out('01-empty'));

  // ---- the scene dock -----------------------------------------------------------------------------------------------
  const groups = await $("[...document.querySelectorAll('.lab-group')].map((d) => d.dataset.group)");
  check(['Enemies', 'Pickups', 'Files', 'NPCs', 'Riddles', 'Tasks', 'Checks'].every((g) => groups.includes(g)) && groups.some((g) => g.startsWith('Props:')), 'the palette has every group');
  check((await count('[data-palette^="enemy."]')) === 12 && (await count('[data-palette^="pickup."]')) === 5 && (await count('[data-palette^="task."]')) === 13, '12 enemies, 5 pickups and 13 win rules are placeable');
  check(await $("(() => { const b = document.querySelector('.cx-side-body'); return b.scrollHeight > b.clientHeight && /auto|scroll/.test(getComputedStyle(b).overflowY); })()"), 'the Scene dock scrolls');
  check((await $("[...document.querySelectorAll('.lab-library button')].map((b) => b.textContent).join(',')")) === 'New,Duplicate,Import…,Export,Delete', 'the library actions are in the Scene dock');

  await $(`document.querySelector('[data-palette="enemy.virus"]').click()`);
  check((await $(`${L}.state().setupCount`)) === 2 && (await count('.lab-scene .lab-row')) === 2, 'a palette chip adds the object to the scene list');
  check((await $(`${L}.state().selectedPath`)) === 'setup[1]' && /PID/.test(await text('.lab-form')), 'the new object is selected and its form shows');
  for (const id of ['enemy.worm', 'pickup.energy', 'prop.prop.fan', 'npc.gork']) await $(`${L}.add(${JSON.stringify(id)})`);
  await browser.waitFor(`${L}.state().phase === 'play' && ${L}.inspect()?.entities.length === 3`, 40000, 'the reloaded scene');
  const actors = await $(`${W}.__game.snapshot().room.actors.map((a) => a.id).join(' ')`);
  check(/lab:prop-fan-1/.test(actors) && /virus-1/.test(actors), 'the prop and the virus are on the stage');
  await $(`${L}.submit('ls')`);
  await waitTerm('/virus\\.exe/', 'ls output');
  const term = await termText();
  check(/energy\.cell/.test(term) && /port_445/.test(term) && /GORK/.test(term), 'ls lists the placed objects and the NPC spoke on arrival');

  for (let i = 0; i < 25; i++) await $(`${L}.tick()`);
  const info = await $(`${L}.inspect()`);
  check(info.absorbedTotal > 0 && info.hp === info.maxHp, `enemies attacked and ${info.absorbedTotal} damage was absorbed; HP ${info.hp}/${info.maxHp}`);
  check(new RegExp(`${info.absorbedTotal} absorbed`).test(await text('.lab-badge')), 'the top bar badge counts the absorbed damage');
  await browser.shoot(out('02-scene'));

  // Edit through the form; the field keeps focus while the game swaps sessions in-page.
  await $(`${L}.select('setup[1]')`);
  const typed = await $("(() => { const row = [...document.querySelectorAll('.lab-form label, .lab-form .fld')].find((e) => /^PID/.test(e.textContent.trim())); const input = row?.querySelector('input'); if (!input) return false; input.focus(); input.value = '4242'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); window.__pid = input; window.__term0 = document.querySelector('.pv-frame').contentWindow.__term; window.__seq0 = document.querySelector('.pv-frame').contentWindow.__lab.seq(); return true; })()");
  check(typed && (await $(`${L}.script().setup[1].pid`)) === 4242, 'editing a form field changes the lab script');
  await browser.waitFor(`${W}.__lab?.seq() > window.__seq0 && ${L}.state().phase === 'play'`, 40000, 'the in-page swap after the edit');
  check(await $(`${W}.__term === window.__term0`), 'scene edit swaps the session in-page without reloading the iframe');
  check(await $("document.activeElement === window.__pid || (document.activeElement?.closest('.lab-form') && document.activeElement.tagName === 'INPUT')"), 'the form field keeps focus while the game swaps sessions');
  await $(`${L}.select(null)`);
  check(/Lab settings/.test(await text('.lab-form')) && /Room/.test(await text('.lab-form')), 'with nothing selected the Inspector shows the lab settings');

  // Checks: a bad reference shows, and its row jumps to the object.
  const s1 = await $(`${L}.script()`);
  s1.setup[1].helps = 'nobody';
  await load(s1);
  check(await $(`${L}.issues().some((i) => /nobody/.test(i.message))`), 'the Checks list reports a bad reference');
  check(await $("[...document.querySelectorAll('.lab-checks .issues li')].length >= 1"), 'the issues show in the Object tab');

  // Library: persistence, Duplicate, New, Import.
  const id = await $(`${L}.state().labId`);
  await browser.open(`${base}/terminal-lab/${id}`);
  await browser.waitFor(`${L} && ${L}.ready && ${L}.state().labId === ${JSON.stringify(id)}`, 30000, 'the lab after a page reload');
  check((await $(`${L}.state().setupCount`)) === 6, 'the lab survives a page reload (autosave in this browser)');
  const libBtn = (label) => $(`[...document.querySelectorAll('.lab-library button')].find((b) => b.textContent === ${JSON.stringify(label)}).click()`);
  const before = await $(`${L}.labs().length`);
  await libBtn('Duplicate');
  await browser.waitFor(`${L}.state().labId === ${JSON.stringify(`${id}-copy`)}`, 10000, 'duplicate');
  check((await $(`${L}.labs().length`)) === before + 1 && (await $('location.pathname')).endsWith(`${id}-copy`), 'Duplicate makes a copy and opens it');
  await libBtn('New');
  await browser.waitFor(`${L}.state().setupCount === 1 && ${L}.labs().length === ${before + 2}`, 10000, 'new');
  check(true, 'New starts an empty lab');
  const feed = (body) => $(`(() => { const input = document.querySelector('.lab-library input[type=file]'); const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(body)}], 'x.lab.json')); input.files = dt.files; input.dispatchEvent(new Event('change')); return true; })()`);
  await feed('{"id":"imported","setup":[{"op":"dir","path":"/lab/x"}]}');
  await browser.waitFor(`${L}.state().labId === 'imported'`, 5000, 'import');
  check((await $(`${L}.script().setup.length`)) === 1 && /1 object/.test(await text('.ed-status')), 'Import opens a valid .lab.json; the status line counts its objects');
  await feed('{"id":"bad","setup":[{"op":"warp"}]}');
  await browser.waitFor("/import refused/.test(document.querySelector('.ed-status').textContent)", 5000, 'refusal');
  check((await $(`${L}.state().labId`)) === 'imported', 'Import refuses an invalid lab, says why and keeps the open one');

  // Drag to place from the palette (onto viewport stage, including Portrait letterbox, and onto scene list).
  await load(bare('drag-lab', [{ op: 'file', path: '/lab/readme.txt', content: 'hi\n' }]));
  await $("document.querySelector('.cx-bar-grp [aria-pressed]') && [...document.querySelectorAll('.cx-bar button')].find((b) => /Portrait/.test(b.textContent))?.click()");
  const stageDrag = await $(`(() => {
    const chip = document.querySelector('[data-palette="prop.prop.fan"]');
    const stage = document.querySelector('.cx-stage');
    const frame = document.querySelector('.pv-frame');
    const dt = new DataTransfer();
    chip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const frameMuted = getComputedStyle(frame).pointerEvents === 'none';
    const rect = frame.getBoundingClientRect();
    const x = rect.left + rect.width * 0.75;
    const y = rect.top + rect.height * 0.5;
    stage.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
    const highlighted = stage.dataset.dropOver === 'stage';
    stage.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
    window.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    return { frameMuted, highlighted, cleaned: !document.querySelector('.ed').dataset.paletteDrag };
  })()`);
  await $("[...document.querySelectorAll('.cx-bar button')].find((b) => /Landscape/.test(b.textContent))?.click()");
  check(stageDrag.frameMuted && stageDrag.highlighted && stageDrag.cleaned && (await $(`${L}.script().setup.at(-1)?.x`)) === 3.5, 'dragging a prop chip onto the viewport sets stage X from the .pv-frame drop position (even in Portrait mode)');

  await $(`(() => {
    const chip = document.querySelector('[data-palette="enemy.crack"]');
    const zone = document.querySelector('[data-scene-drop]');
    const firstRow = zone.querySelector('.lab-row').getBoundingClientRect();
    const dt = new DataTransfer();
    chip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: firstRow.left + 10, clientY: firstRow.top + 2, dataTransfer: dt }));
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: firstRow.left + 10, clientY: firstRow.top + 2, dataTransfer: dt }));
    window.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  })()`);
  check((await $(`${L}.script().setup[0]?.type`)) === 'crack' && (await $(`${L}.script().setup[0]?.helps`)) === 'worm-1' && (await $(`${L}.state().selectedPath`)) === 'setup[0]', 'dragging a chip onto the scene list inserts at the hovered row, and crack brings its worm');

  // Open a chapter level in the lab (button + ?from= route).
  const levelCount = await count('.lab-from-level select option');
  const firstRef = await $("document.querySelector('.lab-from-level select')?.value ?? ''");
  check(levelCount >= 11 && firstRef.includes('/'), `the Scene dock lists ${levelCount} chapter levels to open in the lab`);
  await $("document.querySelector('.lab-from-level button').click()");
  await browser.waitFor(`/opened level/.test(document.querySelector('.ed-status').textContent) && ${L}.state().phase === 'play'`, 30000, 'opened chapter level');
  const importedRun = await $(`${L}.runAll().then((x) => x.ok)`, 120000);
  check(importedRun === true, 'an imported chapter level runs its solution steps and task checks in the browser');
  await browser.open(`${base}/terminal-lab?from=${encodeURIComponent(firstRef)}`);
  await browser.waitFor(`${L} && ${L}.ready && ${L}.state().phase === 'play'`, 40000, '?from= chapter level route');
  check(/opened level/.test(await text('.ed-status')) && (await $(`${L}.script().steps.length`)) >= 4, '?from=<chapter>/<level> opens a copy of that chapter level in the lab');
  await browser.open(`${base}/terminal-lab?from=badref`);
  await browser.waitFor(`${L} && ${L}.ready && ${L}.state().phase === 'play'`, 40000, 'malformed ?from= route');
  check(/expected "<chapterId>\/<levelId>"/.test(await text('.ed-status')), 'malformed ?from= reports a clear error in the status line');
  const chapSlug = firstRef.split('/')[0];
  await $(`localStorage.setItem(${JSON.stringify(`credits.editor.draft:${chapSlug}`)}, JSON.stringify({ manifest: { id: ${JSON.stringify(chapSlug)} }, levels: [{ id: 'broken' }] }))`);
  await browser.open(`${base}/terminal-lab?from=${encodeURIComponent(firstRef)}&draft=1`);
  await browser.waitFor(`${L} && ${L}.ready && ${L}.state().phase === 'play'`, 40000, '?from= with malformed draft');
  await $(`localStorage.removeItem(${JSON.stringify(`credits.editor.draft:${chapSlug}`)})`);
  check(/opened level/.test(await text('.ed-status')), '?from=<chapter>/<level>&draft=1 survives a malformed draft in localStorage');

  // Rapid driver toggle while Run all is mid-wait cancels cleanly and swaps in-page; mute survives swap.
  await load(bare('driver-race', [], [{ op: 'wait', ms: 800 }, { op: 'run', line: 'pwd' }]));
  await $(`${W}.__menu.open()`);
  await $("document.querySelector('.pv-frame').contentDocument.querySelector('#esc-mute')?.click()");
  await $(`${W}.__menu.close()`);
  const mutedBefore = await $(`${W}.__game.snapshot().muted`);
  await $(`window.__term0 = ${W}.__term; window.__seq0 = ${W}.__lab.seq()`);
  await $("[...document.querySelectorAll('.lab-transport button')].find((b) => /Run all/.test(b.textContent)).click()");
  await browser.waitFor(`${L}.control().running`, 5000, 'mid-wait run started');
  await $(`${L}.setDriver('classic'); ${L}.setDriver('chapter')`);
  await browser.waitFor(`${W}.__lab?.seq() > window.__seq0 && !${L}.control().running && ${L}.state().phase === 'play'`, 40000, 'driver toggle swap');
  check(mutedBefore === true && (await $(`${W}.__term === window.__term0`)) && (await $(`${L}.control().cursor`)) === 0 && (await $(`${W}.__game.snapshot().muted`)) === true, 'rapid driver toggle during wait cancels the in-flight run, swaps in-page, and preserves mute');

  // ---- the script ---------------------------------------------------------------------------------------------------
  check((await count('.lab-script .lab-transport button')) >= 5, 'the Script panel has its transport buttons');
  await $(`${L}.toggleDock('log')`);
  check(await $("(() => { const s = document.querySelector('.lab-script'); return !!s && s.getBoundingClientRect().height > 40; })()"), 'hiding the event log leaves the script visible');
  await $(`${L}.toggleDock('log')`);

  for (const { file, text: body } of labs) {
    const script = JSON.parse(body);
    await load(script);
    const r = await $(`${L}.runAll().then((x) => ({ ok: x.ok, transcript: x.transcript }))`, 180000);
    check(r.ok && r.transcript === nodeTranscripts[file], `${file}: passes in the browser, transcript equals Node's (${r.transcript.length} bytes)`);
    if (file === 'basics.lab.json') {
      const again = [];
      for (let i = 0; i < 2; i++) again.push((await $(`${L}.runAll().then((x) => x.transcript)`, 120000)) === r.transcript);
      check(again.every(Boolean), 'basics.lab.json gives the same transcript three runs in a row');
      check((await count('.lab-step.pass')) === script.steps.length && (await $(`${L}.state().hp`)) === (await $(`${L}.inspect().maxHp`)), 'every step is green and HP is full');
      await browser.shoot(out('03-script'));
    }
  }

  // Breakpoints, Step, Run all, failure, Run to here.
  await load(bare('bp', [{ op: 'file', path: '/lab/a.txt', content: 'A\n' }], [
    { op: 'run', line: 'cat a.txt', expect: { stdout: 'A' } }, { op: 'run', line: 'echo two' }, { op: 'run', line: 'echo three' },
    { op: 'run', line: 'echo four', expect: { stdout: 'WRONG' } }, { op: 'run', line: 'echo five' },
  ]));
  await $(`${L}.toggleBreakpoint(2)`);
  check(await $("document.querySelector('.lab-step[data-item-path=\"steps[2]\"] .lab-bp').classList.contains('on')"), 'a breakpoint shows on its step');
  const runAllBtn = "[...document.querySelectorAll('.lab-transport button')].find((b) => /Run all/.test(b.textContent))";
  await $(`${runAllBtn}.click()`);
  await browser.waitFor(`!${L}.control().running && ${L}.control().cursor === 2`, 20000, 'the breakpoint');
  check((await $(`${L}.results().length`)) === 2, 'Run all stops before the step with the breakpoint');
  await $(`${L}.step()`, 20000);
  check((await $(`${L}.control().cursor`)) === 3, 'Step runs exactly one step');
  await $(`${L}.toggleBreakpoint(2)`);
  await $(`${runAllBtn}.click()`);
  await browser.waitFor(`!${L}.control().running && ${L}.control().cursor >= 4`, 20000, 'the failure');
  check((await $(`${L}.results().length`)) === 4 && (await count('.lab-step.fail')) === 1, 'a failed expect stops the run and marks the step red');
  await $(`${L}.select('steps[3]')`);
  check(/WRONG/.test(await text('.lab-result')), 'the Inspector shows why the selected step failed');
  await $(`${L}.runTo(4)`, 20000);
  check((await $(`${L}.control().cursor`)) === 5, 'Run to here continues past the failure');

  // Replay after a scene change.
  await load(bare('replay', [{ op: 'dir', path: '/lab/sub' }], [{ op: 'run', line: 'cd sub', expect: { cwd: '/lab/sub' } }, { op: 'run', line: 'pwd' }]));
  await $(`${L}.step()`, 20000);
  await $(`window.__term0 = ${W}.__term; window.__seq0 = ${W}.__lab.seq(); ${L}.add('prop.prop.fan')`);
  await browser.waitFor(`${W}.__lab?.seq() > window.__seq0 && ${L}.state().phase === 'play' && !${L}.control().running && ${L}.inspect()?.cwd === '/lab/sub'`, 40000, 'in-page swap and replay');
  check((await $(`${W}.__term === window.__term0`)) && (await $(`${L}.control().cursor`)) === 1, 'after a scene change the session swaps in-page and replay puts the player back in /lab/sub at step 2');
  await $(`${L}.reset()`, 60000);
  check((await $(`${L}.inspect().cwd`)) === '/lab' && (await $(`${L}.control().cursor`)) === 0, 'Reset goes back to a fresh level and step 1');

  // A step through its form, and the JSON tab.
  await $(`${L}.addStep('run')`);
  check(/Command line/i.test(await text('.lab-form')), 'a new step shows its form');
  await $("(() => { const el = [...document.querySelectorAll('.lab-form label, .lab-form .fld')].find((e) => /^Command line/i.test(e.textContent.trim())).querySelector('input'); el.value = 'echo typed'; el.dispatchEvent(new Event('input', { bubbles: true })); })()");
  check((await $(`${L}.script().steps.at(-1).line`)) === 'echo typed', 'editing the form changes the step');
  await $(`${L}.setTab('json')`);
  const applyJson = (doc) => $(`(() => { const ta = document.querySelector('.jsonpane textarea'); ta.value = ${JSON.stringify(doc)}; [...document.querySelectorAll('.jsonpane button')].find((b) => b.textContent === 'Apply JSON').click(); return document.querySelector('.jsonpane [role=status]').textContent; })()`);
  const okDoc = JSON.stringify({ ...(await $(`${L}.script()`)), steps: [{ op: 'run', line: 'pwd' }, { op: 'tick', n: 2 }] });
  const applied = await applyJson(okDoc);
  check(/Applied/.test(applied) && (await $(`${L}.steps().length`)) === 2, `the JSON tab applies a whole lab (${applied})`);
  const badDoc = JSON.stringify({ ...(await $(`${L}.script()`)), steps: [{ op: 'warp' }] });
  check(/not applied/.test(await applyJson(badDoc)) && (await $(`${L}.steps().length`)) === 2, 'the JSON tab refuses a bad lab and keeps the old one');

  await $(`${L}.setTab('object')`);

  // Record.
  await load(bare('record', []));
  await $(`${L}.setRecording(true)`);
  await $(`${L}.submit('echo recorded')`);
  await browser.waitFor(`${L}.steps().length === 1`, 10000, 'the first recorded line');
  await $(`${L}.submit('pwd')`);
  await browser.waitFor(`${L}.steps().length === 2`, 10000, 'the second recorded line');
  await $(`${L}.tick(); ${L}.tick()`);
  const recorded = await $(`${L}.steps().map((s) => s.op + ':' + (s.line ?? s.n ?? '')).join(',')`);
  check(recorded === 'run:echo recorded,run:pwd,tick:2', `typed lines and ticks are recorded as steps (${recorded})`);
  await $(`${L}.setRecording(false)`);

  // ---- goals and inject -----------------------------------------------------------------------------------------
  await load(bare('riddle-ui', []));
  await $(`${L}.add('riddle.count')`);
  await browser.waitFor(`${L}.state().phase === 'play' && ${L}.goals().some((g) => g.kind === 'riddle')`, 40000, 'the riddle in the game');
  await browser.waitFor("document.querySelector('.lab-goal[data-goal^=\"riddle-count\"].open')", 5000, 'the open goal');
  check(/answer 3/.test(await text('.lab-checks')), 'the Checks panel shows the riddle answer to the author');
  await $(`${L}.submit('cat gate.sock')`);
  await waitTerm('/Count every FATAL/', 'the socket speaks');
  await $(`${L}.submit('grep FATAL server.log | wc -l > gate.sock')`);
  await browser.waitFor("document.querySelector('.lab-goal[data-goal^=\"riddle-count\"].done')", 10000, 'the solved goal');
  check(true, 'solving the riddle in the terminal marks its goal done in the Inspector');
  await browser.shoot(out('04-riddle'));

  await load(bare('inject-ui', [], [{ op: 'inject', enemy: { id: 'late-virus', type: 'virus', path: '/lab/late.exe', pid: 77, ppid: 1 } }]));
  await $(`${L}.step()`, 30000);
  check((await $(`${W}.__game.snapshot().room.actors.some((a) => a.id === 'late-virus')`)) && (await $(`${L}.inspect().enemiesLeft`)) === 1, 'an injected enemy appears on the stage and in the world without a reload');

  // ---- the Inspector tabs ---------------------------------------------------------------------------------------
  const world5 = bare('inspect-lab', [
    { op: 'file', path: '/lab/readme.txt', content: 'Terminal Lab\n' }, { op: 'enemy', id: 'virus-1', type: 'virus', path: '/lab/virus.exe', pid: 4001, ppid: 1 },
    { op: 'pickup', id: 'energy-1', type: 'energy', path: '/lab/energy.cell' },
  ], [{ op: 'run', line: 'ls' }, { op: 'run', line: 'ps' }, { op: 'tick', n: 2 }]);
  await load(world5);
  const tabs = await $("[...document.querySelectorAll('.ed-tabs [role=tab]')].map((t) => t.textContent.replace(/[^A-Za-z]/g, '')).join(',')");
  check(tabs === 'Object,Commands,World,Files,Transcript,Events,JSON', `the Inspector has seven tabs (${tabs})`);
  check((await text('.lab-badge')).startsWith('🛡 no damage'), 'the top bar shows the no-damage badge');
  check(await $("(() => { const t = document.querySelector('.ed-top'); const edge = t.getBoundingClientRect().right + 1; return [...t.children].every((c) => c.getBoundingClientRect().right <= edge) && t.scrollWidth <= t.clientWidth + 1; })()"), 'the top bar fits on one row');
  check(await $("[...document.querySelectorAll('.ed-top button')].some((b) => b.textContent.startsWith('Save to repo'))"), 'the top bar has Save to repo');

  await $(`${L}.setTab('commands')`);
  const cmdNames = await $("[...document.querySelectorAll('.lab-cmds li[data-command]')].map((li) => li.dataset.command)");
  check(cmdNames.length >= 35 && ['ls', 'kiro', 'lab'].every((n) => cmdNames.includes(n)), `the Commands tab lists ${cmdNames.length} commands, the ally's included`);
  check((await count('.lab-cmd-missing')) === 0, 'every command listed by Tab completion runs in the chapter shell');
  await $("document.querySelector('li[data-command=\"grep\"] details').open = true; document.querySelector('li[data-command=\"grep\"] details').dispatchEvent(new Event('toggle'))");
  check((await text('li[data-command="grep"] details pre')).startsWith('grep'), 'a command shows its manual page');
  let ran = 0;
  for (const name of cmdNames) {
    const n = await execCount();
    await $(`document.querySelector('li[data-command=${JSON.stringify(name)}] .btn.primary').click()`);
    await browser.waitFor(`${W}.__lab.execLog().count > ${n} && !${W}.__term.busy()`, 15000, `command ${name}`);
    if (name === 'edit' || name === 'nano') await $(`${W}.__editor && ${W}.__editor.close()`);
    ran += 1;
  }
  check(ran === cmdNames.length && (await $(`${L}.state().phase`)) === 'play', `every command ran from its Run button (${ran}) and the game still runs`);
  await $(`document.querySelector('li[data-command="ls"] .btn:not(.primary)').click()`);
  check(/\$ ls -a\s*$/.test(await termText()), 'Insert puts the line in the terminal without running it');
  await $(`${W}.__term.input('\\u0015')`);

  await $(`${L}.select('setup[1]')`);
  check(await $("document.querySelector('li[data-command=\"grep\"] details')?.open === true"), 'an open manual page stays open when the panel redraws');
  check(/Try on enemy virus-1/.test(await text('.lab-body')) && (await count('.lab-cmds li[data-cmd="kill -9 4001"]')) === 1, 'selecting an enemy shows commands made for it');
  const n0 = await execCount();
  await $("document.querySelector('li[data-cmd=\"kill -9 4001\"] .btn.primary').click()");
  await browser.waitFor(`${W}.__lab.execLog().count > ${n0}`, 10000, 'the kill tip');
  check((await $(`${L}.inspect().enemiesLeft`)) === 0, 'running the tip killed the virus');
  check(/enemy virus-1/.test(await text('.cx-sel-pill')), 'the viewport pill names the selection');

  await load(world5);
  await $(`${L}.setTab('world')`);
  await $(`${L}.submit('ls')`);
  await browser.waitFor(`${L}.inspect().entities.find((e) => e.id === 'virus-1').attackIn >= 1`, 10000, 'the countdown');
  let agree = 0;
  for (let i = 0; i < 14; i++) {
    const next = await $(`${L}.inspect().entities.find((e) => e.id === 'virus-1').attackIn`);
    const fired = await $(`${W}.__lab.tick().events.some((e) => e.type === 'ENEMY_ATTACK' && e.entityId === 'virus-1')`);
    if (fired === (next === 1)) agree += 1;
  }
  check(agree === 14, 'in the browser ENEMY_ATTACK fires on exactly the tick the countdown said (14/14)');
  await browser.waitFor("/attacks in \\d+ tick/.test(document.querySelector('.lab-body').textContent) && /Damage absorbed: [1-9]/.test(document.querySelector('.lab-body').textContent)", 5000, 'the World tab');
  check(true, 'the World tab shows the countdown and the damage absorbed');
  await $("document.querySelector('.lab-body .lab-link').click()");
  check((await $(`${L}.state().selectedPath`)) !== null && (await count('.lab-body [data-item-path].is-selected')) === 1, 'a World row selects its object');

  await $(`${L}.setTab('files')`);
  check(/virus\.exe/.test(await text('.lab-tree')) && /rw-r--r--/.test(await text('.lab-tree')), 'the Files tab shows the live tree with modes');
  await $("document.querySelector('.lab-tree [data-item-path=\"setup[0]\"] .lab-link').click()");
  check((await $(`${L}.state().selectedPath`)) === 'setup[0]', 'a file row selects its object');

  await load(world5);
  await $(`${L}.runAll()`, 120000);
  await $(`${L}.setTab('transcript')`);
  check((await count('.lab-body ul[aria-label="Transcript"] > li')) === 3 && /\$ ps/.test(await text('.lab-body')), 'the Transcript tab lists every step with its output');
  await $("document.querySelector('.lab-body ul[aria-label=\"Transcript\"] > li:nth-child(2) .lab-link').click()");
  check(/step 2/.test(await text('.cx-sel-pill')), 'a transcript row selects its step');
  await $("[...document.querySelectorAll('.lab-body button')].find((b) => b.textContent === 'Copy').click()");
  await browser.waitFor("/transcript copied|copy failed/.test(document.querySelector('.pv-status').textContent)", 5000, 'the copy status');
  check(true, `Copy reports its result (${await text('.pv-status')})`);
  await $(`${L}.setTab('events')`);
  check((await count('.lab-body ul[aria-label="Events"] > li')) >= 2, 'the Events tab lists the game events');
  await $("document.querySelector('.lab-body ul[aria-label=\"Events\"] details').open = true");
  check(await $("JSON.parse(document.querySelector('.lab-body ul[aria-label=\"Events\"] pre').textContent).type.length > 0"), 'an event expands to its JSON');
  await $(`${L}.setTab('world')`);
  check((await $('location.search')) === '?tab=world', 'the tab is in the URL');

  // Back and forward follow the route.
  await load(bare('route-a', []));
  await load(bare('route-b', []));
  await $('history.back()');
  await browser.waitFor(`${L}.state().labId === 'route-a'`, 15000, 'history.back');
  check((await $(`${L}.state().tab`)) === 'world', 'Back reopens the previous lab with the tab of its URL');

  // Top bar: Tick, enemy fire, the live clock.
  await load(world5);
  await $(`${L}.submit('ls')`);
  await browser.waitFor(`${L}.inspect().entities.some((e) => e.id === 'virus-1' && e.attackIn >= 2)`, 10000, 'ready');
  const countdown = () => $(`${L}.inspect().entities.find((e) => e.id === 'virus-1').attackIn`);
  const c0 = await countdown();
  await $("[...document.querySelectorAll('button')].find((b) => /⏱ Tick/.test(b.textContent)).click()");
  check((await countdown()) === c0 - 1, `the Tick button advances the world (attack in ${c0} -> ${await countdown()})`);
  const w0 = JSON.stringify(await $(`${L}.inspect().entities`));
  await sleep(1500);
  check(JSON.stringify(await $(`${L}.inspect().entities`)) === w0, 'with the manual clock the world does not move by itself');
  const swapped = (what) => browser.waitFor(`${W}.__lab?.seq() > window.__seq0 && ${L}.state().phase === 'play'`, 40000, what);
  await $(`window.__term0 = ${W}.__term; window.__seq0 = ${W}.__lab.seq(); ${L}.setEnemyFire('hold')`);
  await swapped('the swap on hold');
  check(await $(`${W}.__term === window.__term0`), 'toggling Enemy fire swaps the session in-page');
  await $(`${L}.submit('ls')`);
  for (let i = 0; i < 12; i++) await $(`${L}.tick()`);
  check((await $(`${L}.inspect().absorbedTotal`)) === 0, 'with enemy fire on hold twelve ticks absorb nothing');
  await $(`window.__seq0 = ${W}.__lab.seq(); ${L}.setEnemyFire('live'); ${L}.setClock('live')`);
  await swapped('the swap on the live clock');
  await $(`${L}.submit('ls')`);
  // Turn-based: `ls` begins a battle; the live clock runs its intro down to the player's turn, and each action is
  // answered by an enemy turn (absorbed damage). Nothing hurts in real time.
  await browser.waitFor(`${W}.__game.snapshot().battle?.phase === 'player'`, 10000, 'the live clock running the battle intro down');
  for (let i = 0; i < 4; i++) await $(`${L}.submit('pwd')`);
  await browser.waitFor(`${L}.inspect().absorbedTotal > 0`, 15000, 'enemy turns answering actions on the live clock');
  check(true, 'with the live clock the world ticks by itself');
  await $(`${L}.setClock('manual')`);

  // ---- the repo -------------------------------------------------------------------------------------------------
  await $('window.confirm = () => true');
  const repo = (await $(`${L}.state()`)).repo;
  check(repo.writable && repo.labs.length === labs.length && repo.labs.includes('basics'), `the lab sees the ${repo.labs.length} repo labs and can write`);
  await $(`${L}.openFromRepo('enemy-worm')`, 30000);
  check((await $(`${L}.state().labId`)) === 'enemy-worm' && (await $(`${L}.state().repo.state`)) === 'clean', 'Open from repo loads a lab, clean against the repo');

  if (ownServer) {
    const saveId = 'smoke-save-test';
    const saveFile = resolve(tempLabs, `${saveId}.lab.json`);
    await load(bare(saveId, [{ op: 'file', path: '/lab/a.txt', content: 'A\n' }], [{ op: 'run', line: 'cat a.txt' }]));
    check((await $(`${L}.state().repo.state`)) === 'new', 'a lab that is not in the repo is "new"');
    await $(`${L}.saveToRepo()`);
    const saved = existsSync(saveFile) ? readFileSync(saveFile, 'utf8') : '';
    check(saved === stringifyLabJson(JSON.parse(saved || 'null')) && JSON.parse(saved).id === saveId, 'Save to repo writes <id>.lab.json in the canonical format');
    const expectedSavePath = `${tempLabs.split(sep).join('/')}/${saveId}.lab.json`;
    check((await text('.ed-status')).includes(`saved ${expectedSavePath}`) && (await $(`${L}.state().repo.state`)) === 'clean', 'the status line names the actual TERMINAL_LAB_DIR path where it saved, and the lab is clean');

    await $(`${L}.addStep('tick')`);
    await $("window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))");
    await until(() => JSON.parse(readFileSync(saveFile, 'utf8')).steps.length === 2, 5000, 'Ctrl+S');
    check(true, 'Ctrl+S saves the open lab to the repo');

    const outside = JSON.parse(readFileSync(saveFile, 'utf8'));
    outside.title = 'edited outside';
    writeFileSync(saveFile, stringifyLabJson(outside));
    await $("window.dispatchEvent(new Event('focus'))");
    await browser.waitFor("document.querySelector('.ed-top .btn.warn')", 10000, 'the stale warning');
    check(/Reload from repo/.test(await text('.ed-top .btn.warn')) && (await $(`${L}.state().repo.stale`)), 'a change made outside shows "Reload from repo"');
    await $(`${L}.addStep('tick')`);
    await $(`${L}.saveToRepo()`);
    check(JSON.parse(readFileSync(saveFile, 'utf8')).title === 'edited outside' && /Nothing was overwritten/.test(await text('.ed-status')), 'saving over the outside edit is refused (409) and says nothing was overwritten');
    await $("document.querySelector('.ed-top .btn.warn').click()");
    await browser.waitFor(`${L}.script().title === 'edited outside' && !document.querySelector('.ed-top .btn.warn')`, 15000, 'reload from repo');
    check(true, 'Reload from repo adopts the file and clears the warning');
  } else {
    console.log('skip repo writes: --url points at a server whose labs folder is the real one');
  }

  // ---- keyboard, assistive technology, hooks --------------------------------------------------------------------
  await $(`${L}.setTab('object')`);
  const roving = await $("[...document.querySelectorAll('.ed-tabs [role=tab]')].map((t) => t.tabIndex + ':' + t.getAttribute('aria-selected'))");
  check(roving[0] === '0:true' && roving.slice(1).every((x) => x === '-1:false'), 'the Inspector tabs use a roving tabindex');
  const key = async (k) => {
    await $(`document.querySelector('.ed-tabs [role=tab][aria-selected=true]').dispatchEvent(new KeyboardEvent('keydown', { key: '${k}', bubbles: true }))`);
    return $(`${L}.state().tab`);
  };
  check((await key('ArrowRight')) === 'commands' && (await key('End')) === 'json' && (await key('Home')) === 'object', 'ArrowRight, End and Home move between tabs');
  check(await $("[...document.querySelectorAll('[data-palette], .lab-library button, .lab-step-label, .lab-transport button')].every((b) => b.tagName === 'BUTTON')"), 'palette chips, library actions, steps and transport are real buttons');
  check(await $("!!document.querySelector('.pv-log[role=log]') && !!document.querySelector('.ed-status[role=status]') && !!document.querySelector('.lab-transport[role=group]')"), 'the event log and the status line are announced; the transport is a labelled group');
  const missing = await $(`['state','load','openChapterLevel','select','step','runTo','reset','runAll','transcript','goals','inspect','issues','saveToRepo','openFromRepo','setTab','setDriver','setClock','setEnemyFire','toggleDock'].filter((k) => typeof ${L}[k] !== 'function')`);
  check(missing.length === 0, `window.__terminalLab offers the documented hooks${missing.length ? ` (missing ${missing.join(', ')})` : ''}`);
  check(browser.problems.length === 0, `no page errors${browser.problems.length ? `: ${browser.problems[0]}` : ''}`);
} catch (err) {
  check(false, `the smoke run stopped: ${err.message}`);
} finally {
  await browser.close();
  if (vite) await vite.close();
  if (tempLabs) rmSync(tempLabs, { recursive: true, force: true });
}
finish('terminal lab smoke');
