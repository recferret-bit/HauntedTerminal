#!/usr/bin/env node
// Drives the chapter editor (/editor) in headless Chrome and checks the whole loop:
//   load every level, open every tab, edit a field (dirty + draft), run the headless solution from the Check tab,
//   boot the game preview on the draft, step the solution, play a script step, revert, catch a misspelled spec key, notice a
//   file changed on disk by someone else, and prove saves are lossless and the API refuses unsafe writes.
//
//   node scripts/harness/editor-smoke.mjs                  (starts its own Vite on 5343)
//   node scripts/harness/editor-smoke.mjs --url http://localhost:5400
// Screenshots: scripts/harness/out/editor-*.png. Exit 0 = every check passed.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser } from './lib/browser.mjs';
import { listChapterSlugs, readChapter, chaptersDir } from './lib/chapter-compile.mjs';
import { parseArgs, projectRoot, startPageServer } from './lib/load.mjs';

const args = parseArgs(process.argv.slice(2), ['--url', '--chapter', '--width', '--height']);
const out = (name) => resolve(projectRoot, 'scripts/harness/out', `editor-${name}.png`);
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

const slug = args.val('--chapter', listChapterSlugs()[0]);
const chapter = readChapter(slug);
let vite = null;
let base = args.val('--url');
if (!base) ({ vite, base } = await startPageServer(5343, { hmr: false, watch: null }));
base = base.replace(/\/$/, '');
const vpWidth = Number(args.val('--width', 1600));
const vpHeight = Number(args.val('--height', 950));
const browser = await launchBrowser({ width: vpWidth, height: vpHeight });
const $ = (expr) => browser.evaluate(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (selector, text) => $(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(selector)})]; const el = els.find((e) => !${JSON.stringify(text ?? '')} || e.textContent.includes(${JSON.stringify(text ?? '')})); if (!el) return false; el.click(); return true; })()`);

try {
  // 1. load
  await browser.open(`${base}/editor/${slug}/${chapter.levels[0].spec.id}`);
  await browser.waitFor(`document.querySelectorAll('.ed-item').length > ${chapter.levels.length}`, 20000, 'the level list');
  check((await $("document.querySelectorAll('.ed-item').length")) === chapter.levels.length + 1, `sidebar lists ${chapter.levels.length} levels + chapter entry`);
  check(!(await $("document.querySelector('.ed-status').textContent.includes('READ-ONLY')")), 'editor is writable on the dev server');
  await browser.shoot(out('01-overview'));

  // 2. every level, every tab
  for (const lvl of chapter.levels) {
    await click('.ed-item', lvl.spec.title);
    for (const tab of ['Overview', 'Files', 'Enemies & items', 'Rules & solution', 'Script', 'Dialogs', 'JSON', 'Check']) {
      await click('.ed-tab', tab);
      const filled = await $("document.querySelector('.ed-pane').children.length > 0 && document.querySelector('.ed-pane').textContent.length > 20");
      if (!filled) check(false, `${lvl.spec.id} / ${tab} renders`);
    }
  }
  check(browser.problems.length === 0, `no page errors while opening ${chapter.levels.length} levels x 8 tabs${browser.problems.length ? `: ${browser.problems[0]}` : ''}`);

  // 3. the script tab shows what the level 1 spec declares
  await click('.ed-item', chapter.levels[0].spec.title);
  await click('.ed-tab', 'Script');
  await $("[...document.querySelectorAll('.ed-pane details.item')].forEach((d) => (d.open = true))");
  const scriptText = await $("document.querySelector('.ed-pane').textContent");
  const arrival = chapter.levels[0].spec.script?.arrival?.length ?? 0;
  check(arrival > 0 && scriptText.includes(`Arrival (runs once on entering) (${arrival})`) && (await $("document.querySelectorAll('.ed-pane details.item').length")) >= arrival, `Script tab renders the ${arrival} arrival steps and the tutorial declared in the spec`);
  await browser.shoot(out('02-script'));

  // 4. edit -> dirty -> draft
  await click('.ed-tab', 'Overview');
  const marker = ' [smoke]';
  await $(`(() => { const i = document.querySelector('.ed-pane input[type=text]'); i.value += ${JSON.stringify(marker)}; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  check(await $("[...document.querySelectorAll('.ed-top .btn')].some((b) => b.textContent.startsWith('Save file') && !b.disabled)"), 'editing a field enables Save');
  await new Promise((r) => setTimeout(r, 500));
  check(await $(`(localStorage.getItem('credits.editor.draft:${chapter.manifest.id}') || '').includes(${JSON.stringify(marker)})`), 'the unsaved draft is handed to the game through localStorage');
  check(await $("document.querySelector('.ed-item.on .dot') !== null"), 'sidebar marks the level as unsaved');

  // 5. headless solve from the Check tab
  await click('.ed-tab', 'Check');
  await click('button', 'Solve the whole chapter');
  await browser.waitFor("document.querySelector('.solve-out').textContent.length > 0", 60000, 'the headless solve');
  check((await $("document.querySelector('.solve-out').textContent")).includes('cleared headlessly'), 'whole chapter clears headlessly from the draft');
  await browser.shoot(out('03-check'));

  // 6. preview: Stage-only mode (no terminal dock, full-height stage), stepped through Check tab solution
  await browser.waitFor("document.querySelector('.pv-status').textContent === 'live'", 60000, 'the preview game');
  const stageOnly = await $(`(() => {
    const f = document.querySelector('.pv-frame');
    const doc = f.contentDocument;
    const dock = doc.getElementById('terminal-dock');
    const wrap = doc.getElementById('stage-wrapper')?.getBoundingClientRect();
    const bar = document.querySelector('.cx-stage-bar');
    const noTermInput = document.querySelector('input[aria-label="Send command to player terminal"]') === null;
    const hasStageOnly = doc.body.classList.contains('stage-only');
    return {
      noTermInput,
      hasStageOnly,
      dockHidden: dock?.offsetParent === null,
      fullHeight: Boolean(wrap) && wrap.height >= doc.documentElement.clientHeight - 4,
      barFits: Boolean(bar) && bar.scrollWidth <= bar.clientWidth + 2,
    };
  })()`);
  check(stageOnly.noTermInput && stageOnly.hasStageOnly && stageOnly.dockHidden && stageOnly.fullHeight, 'stage-only mode removes terminal command input, hides #terminal-dock, and expands #stage-wrapper to full height');
  check(stageOnly.barFits, `stage bar fits without horizontal overflow at ${vpWidth}x${vpHeight}`);

  await click('button', 'Step solution command');
  await browser.waitFor("document.querySelectorAll('.pv-ev').length > 0", 20000, 'preview events');
  const logged = await $("document.querySelector('.pv-log').textContent");
  check(logged.length > 0, 'Check tab step solution command ran in stage-only preview and filled event log');
  check(((await $("document.querySelector('.pv-frame').contentWindow.document.title")) || '').includes('Play'), 'preview iframe is the game page');

  // 6c. Stage Studio bar & dock controls: HUD, Hidden, AI, Dialog Runner, Test Enemy, Kill Enemies, Restart, Add to Level, Room switch
  await click('.cx-view-btn', 'HUD');
  await sleep(80);
  const hudOff = await $("document.querySelector('.pv-frame').contentDocument.body.classList.contains('editor-hud-off')");
  await click('button', 'Run Dialog');
  await sleep(150);
  const dialogVisibleWhileHudOff = await $("Boolean(document.querySelector('.pv-frame').contentDocument.querySelector('.dialog-box.open, .st-balloon, .st-say, #tutorial-card:not([hidden])'))");
  // Regression check: TUTORIAL_STEP and vibecoder DIALOG_BOX remain open & visible in stage-only HUD-off mode
  await $(`(() => {
    const se = document.querySelector('.pv-frame').contentWindow.__stageEditor;
    se.clearDialogs();
    se.playBeat([{ type: 'TUTORIAL_STEP', step: 1, total: 2, agent: 'kiro', prompt: 'Inspect node', command: 'ls', done: false }]);
  })()`);
  await sleep(140);
  const tutVisible = await $(`(() => {
    const doc = document.querySelector('.pv-frame').contentDocument;
    const card = doc.getElementById('tutorial-card');
    const r = card?.getBoundingClientRect();
    return Boolean(card) && !card.hidden && card.classList.contains('open') && Boolean(r) && r.height > 20;
  })()`);
  await $(`(() => {
    const se = document.querySelector('.pv-frame').contentWindow.__stageEditor;
    se.clearDialogs();
    se.playBeat([{ type: 'DIALOG_BOX', speaker: 'vibecoder', name: 'DEV', model: 'vibecoder.dev_terminal', text: 'Checking dev dialog box visibility!', holdMs: 4000 }]);
  })()`);
  await sleep(140);
  const vibeBoxVisible = await $(`(() => {
    const doc = document.querySelector('.pv-frame').contentDocument;
    const box = doc.querySelector('.dialog-box.open');
    const r = box?.getBoundingClientRect();
    return Boolean(box) && Boolean(r) && r.height > 20 && box.textContent.includes('Checking dev dialog box visibility!');
  })()`);
  await click('.cx-view-btn', 'HUD');
  await sleep(60);
  const hudBackOn = await $("!document.querySelector('.pv-frame').contentDocument.body.classList.contains('editor-hud-off')");
  check(hudOff && dialogVisibleWhileHudOff && tutVisible && vibeBoxVisible && hudBackOn, 'HUD toggle hides game chrome while keeping dialogs, TutorialCard, and vibecoder DialogBox visible');

  await click('.cx-view-btn', 'Hidden');
  await sleep(120);
  const hiddenShown = await $("document.querySelector('.pv-frame').contentWindow.__stageEditor.isShowHidden() === true && document.querySelector('.pv-frame').contentWindow.__stageEditor.listActors().some((a) => a.hidden)");
  await click('.cx-view-btn', 'Hidden');
  await sleep(80);
  check(hiddenShown, 'Hidden toggle reveals appearWhen/hidden/pre-spawned actors on stage');

  await click('.cx-view-btn', 'AI');
  await sleep(60);
  const aiResumed = await $("document.querySelector('.pv-frame').contentWindow.__stageEditor.isAiPaused() === false");
  await click('.cx-view-btn', 'AI');
  await sleep(60);
  const aiPausedBack = await $("document.querySelector('.pv-frame').contentWindow.__stageEditor.isAiPaused() === true");
  check(aiResumed && aiPausedBack, 'AI toggle pauses and resumes enemy ticks');

  await click('button', 'All Dialogs');
  await sleep(180);
  const beat1Text = await $("document.querySelector('.pv-status')?.textContent || ''");
  await click('button', 'Next Beat');
  await sleep(140);
  const beat2Text = await $("document.querySelector('.pv-status')?.textContent || ''");
  await click('button', 'Next Beat');
  await sleep(140);
  const beat3Text = await $("document.querySelector('.pv-status')?.textContent || ''");
  const afterBeatCount = await $("document.querySelectorAll('.pv-ev').length");
  await click('button', 'Stop');
  await sleep(80);
  const boxCleared = await $("!document.querySelector('.pv-frame').contentDocument.querySelector('.dialog-box.open')");
  check(
    afterBeatCount > 0 && boxCleared && beat1Text.startsWith('dialog:') && beat2Text.startsWith('dialog:') && beat1Text !== beat2Text && beat2Text !== beat3Text,
    `All Dialogs, Next Beat, and Stop advance and clear live dialog beats (${beat1Text} -> ${beat2Text} -> ${beat3Text})`,
  );

  const enemiesBeforeSpawn = await $("document.querySelector('.pv-frame').contentWindow.__stageEditor.listActors().filter((a) => a.kind === 'enemy' || a.kind === 'boss').length");
  await click('button', 'Test Enemy');
  await sleep(180);
  const spawnState = await $(`(() => {
    const actors = document.querySelector('.pv-frame').contentWindow.__stageEditor.listActors();
    return {
      enemies: actors.filter((a) => a.kind === 'enemy' || a.kind === 'boss').length,
      hasTest: actors.some((a) => a.actorId.startsWith('test_')),
    };
  })()`);
  await click('button', 'Kill Enemies');
  await sleep(180);
  const killState = await $(`(() => {
    const actors = document.querySelector('.pv-frame').contentWindow.__stageEditor.listActors();
    return {
      enemies: actors.filter((a) => a.kind === 'enemy' || a.kind === 'boss').length,
      hasTest: actors.some((a) => a.actorId.startsWith('test_')),
    };
  })()`);
  check(spawnState.hasTest && spawnState.enemies > enemiesBeforeSpawn && killState.enemies === 0 && !killState.hasTest, 'Test Enemy spawns an enemy on stage and Kill Enemies clears enemies cleanly');

  await click('button', 'Restart');
  await sleep(150);
  check(await $("document.querySelector('.pv-frame').contentWindow.__stageEditor.ready === true"), 'Restart resets level preview cleanly');

  await click('.ed-tab', 'Script');
  await $("[...document.querySelectorAll('.ed-pane details.item')].slice(0, 1).forEach((d) => (d.open = true))");
  const before = await $("document.querySelectorAll('.pv-ev').length");
  await $("document.querySelectorAll('.ed-pane .item-tools [title^=\"Play\"]')[1].click()");
  await new Promise((r) => setTimeout(r, 1200));
  const after = await $("document.querySelectorAll('.pv-ev').length");
  check(after > before, 'the play button on a script step fires its events on the live stage');
  await browser.shoot(out('04-preview'));

  // 6b. a dialogue bubble plays on a real hub level without errors & Room selector switches cwd
  const hub = chapter.levels.find((l) => l.spec.script?.arrival?.some((st) => st.kind === 'dialogue'));
  if (hub) {
    const errorsBefore = browser.problems.length;
    await click('.ed-item', hub.spec.title);
    await click('.ed-tab', 'Script');
    await browser.waitFor("document.querySelector('.pv-status').textContent === 'live'", 60000, 'the hub preview');
    const roomSwitched = await $(`(() => {
      const sel = document.querySelector('select[aria-label="Active room directory"]');
      if (!sel || sel.options.length < 2) return true;
      const alt = [...sel.options].find((o) => o.value !== sel.value);
      if (!alt) return true;
      sel.value = alt.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return document.querySelector('.pv-frame').contentWindow.__stageEditor.getCwd() === alt.value;
    })()`);
    check(roomSwitched, 'Room selector switches active cwd directory in live preview');
    await $(`(() => { const sel = document.querySelector('select[aria-label="Active room directory"]'); if (sel && sel.options.length) { sel.value = sel.options[0].value; sel.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
    await sleep(60);
    const at = hub.spec.script.arrival.findIndex((st) => st.kind === 'dialogue');
    await $(`document.querySelectorAll('.ed-pane .item-tools [title^="Play"]')[${at}].click()`);
    await browser.waitFor("document.querySelector('.pv-log').textContent.includes('OBSTACLE_DIALOGUE_RENDERED')", 15000, 'the dialogue event');
    await new Promise((r) => setTimeout(r, 800));
    check(browser.problems.length === errorsBefore, 'playing a dialogue step on the live stage raises no page error');
    await browser.shoot(out('05-dialogue'));
    await click('.ed-item', chapter.levels[0].spec.title);
  }

  // 7. revert
  await click('.ed-top .btn', 'Revert file');
  check(!(await $("document.querySelector('.ed-item.on .dot')")), 'revert clears the unsaved mark');

  await $(`(() => { const s = document.querySelector('select[aria-label="Add object kind"]'); s.value = 'prop'; })()`);
  await click('button', '+ Add to Level');
  await sleep(250);
  const propAdded = await $("(window.__chapterEditor.state().dirty || []).length > 0 && (localStorage.getItem('credits.editor.draft:' + window.__chapterEditor.state().slug) || '').includes('prop_tar_')");
  check(propAdded, '+ Add to Level inserts a prop into draft and syncs stage');
  await click('.ed-top .btn', 'Revert file');
  await sleep(80);

  // 8. the schema check catches what no reference check can: a misspelled key, and Check issues are keyboard-operable buttons
  await click('.ed-item', chapter.levels[0].spec.title);
  await click('.ed-tab', 'JSON');
  await $(`(() => { const a = document.querySelector('.ed-pane textarea.json'); a.value = '{broken-json'; })()`);
  await click('button', 'Apply JSON to the draft');
  check(Boolean(await $("document.querySelector('.jsonpane .note.error')")), 'JSON pane reports syntax error cleanly without crashing');
  await $(`(() => { const a = document.querySelector('.ed-pane textarea.json'); const j = ${JSON.stringify(chapter.levels[0].spec)}; j.id = 'corrupted-id'; j.index = 999; j.sumary = 'typo'; a.value = JSON.stringify(j); })()`);
  await click('button', 'Apply JSON to the draft');
  await click('.ed-tab', 'Check');
  check((await $("document.querySelector('.ed-pane').textContent")).includes('level.sumary: unknown field'), 'Check tab flags a misspelled spec key from the field tables');
  const jumpedViaBtn = await $(`(() => {
    const btn = [...document.querySelectorAll('.issues button.issue-jump')].find((b) => b.textContent.includes('level.sumary'));
    if (!btn) return false;
    btn.focus();
    btn.click();
    return window.__chapterEditor.state().tab === 'overview';
  })()`);
  check(jumpedViaBtn, 'Check tab issue rows render keyboard-focusable button.issue-jump that jumps to offending tab');
  await click('.ed-top .btn', 'Revert file');
  check((await $('window.__chapterEditor.state().dirty.length')) === 0, 'raw JSON replace preserves immutable level id/index so Revert restores baseline cleanly');

  // 8b. workstation geometry, ARIA tabs, dock toggle/drag/swap/float, canvas zoom/aspect, item selection & history
  await click('.ed-item', chapter.levels[0].spec.title);
  await click('.ed-tab', 'Script');
  await sleep(120);
  const wsGeo = await $(`(() => {
    const top = document.querySelector('.ed-top');
    const side = document.querySelector('.ed-side').getBoundingClientRect();
    const stage = document.querySelector('.cx-stage').getBoundingClientRect();
    const main = document.querySelector('.ed-main').getBoundingClientRect();
    const frame = document.querySelector('.pv-frame').getBoundingClientRect();
    const tabList = document.querySelector('[role="tablist"]');
    const nonTabChild = tabList ? [...tabList.children].some((el) => el.getAttribute('role') !== 'tab') : true;
    return {
      topNoScroll: top.scrollWidth <= top.clientWidth + 1,
      redirectCount: document.querySelectorAll('.ed-top a[href]').length,
      centered: side.right <= stage.left + 2 && stage.right <= main.left + 2,
      stageW: stage.width,
      frameW: frame.width,
      strictTablist: Boolean(tabList) && !nonTabChild,
    };
  })()`);
  check(wsGeo.topNoScroll && wsGeo.redirectCount === 0, 'top bar has zero horizontal scroll and zero external redirect links');
  check(wsGeo.centered && wsGeo.stageW >= 320, `centered game viewport (${Math.round(wsGeo.stageW)}px) sits between Outliner and Inspector`);
  check(wsGeo.strictTablist, 'tablist owns only role=tab elements');

  await $("(() => { const on = document.querySelector('.ed-tab.on'); on.focus(); on.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); })()");
  await sleep(60);
  check(await $("document.activeElement?.getAttribute('role') === 'tab' && document.activeElement?.textContent.includes('Dialogs')"), 'ArrowRight moves roving focus across Inspector tabs');

  let allDocksOk = true;
  for (const dock of ['left', 'right', 'timeline', 'log', 'stagebar', 'top']) {
    await $(`window.__chapterEditor.toggleDock(${JSON.stringify(dock)})`);
    await sleep(50);
    const hiddenOk = await $(`(() => {
      const sel = { left: '.ed-side', right: '.ed-main', timeline: '.cx-timeline', log: '.ch-console-body', stagebar: '.cx-stage-bar', top: '.ed-top' }[${JSON.stringify(dock)}];
      return document.querySelector(sel)?.offsetParent === null;
    })()`);
    await $(`window.__chapterEditor.toggleDock(${JSON.stringify(dock)})`);
    await sleep(50);
    const shownOk = await $(`(() => {
      const sel = { left: '.ed-side', right: '.ed-main', timeline: '.cx-timeline', log: '.ch-console-body', stagebar: '.cx-stage-bar', top: '.ed-top' }[${JSON.stringify(dock)}];
      return document.querySelector(sel)?.offsetParent !== null;
    })()`);
    if (!hiddenOk || !shownOk) allDocksOk = false;
  }
  check(allDocksOk, 'all 6 docks and bars (left, right, timeline, log, stagebar, top) hide and show cleanly');

  await $('window.__chapterEditor.toggleZen()');
  await sleep(160);
  const zen = await $(`(() => ({
    topHidden: document.querySelector('.ed-top').offsetParent === null,
    pillVisible: document.querySelector('.cx-restore-pill')?.offsetParent !== null,
    frameW: document.querySelector('.pv-frame').getBoundingClientRect().width,
  }))()`);
  check(zen.topHidden && zen.pillVisible && zen.frameW > wsGeo.frameW + 120, `Focus mode hides docks, reveals restore pill, and expands frame (${Math.round(zen.frameW)}px)`);
  await click('.cx-restore-btn', 'Restore UI');
  await sleep(140);
  check(await $("document.querySelector('.ed-top').offsetParent !== null && document.querySelector('.ed-side').offsetParent !== null"), 'Restore UI button exits Focus mode');

  await $('window.__chapterEditor.setSplitSize("left", 290)');
  await $('window.__chapterEditor.undockPanel("right", { x: 40, y: 80, w: 460, h: 520 })');
  await sleep(80);
  const floated = await $("document.querySelector('.ed-main').dataset.slot === 'float' && document.querySelectorAll('.ed-main > .cx-float-resizer').length === 8");
  check(floated && (await $("window.__chapterEditor.state().layout.leftWidth")) === 290, 'splitter resizing and float undock with 8-way resizers work');
  await click('.ed-main [data-redock="right"]');
  await $('window.__chapterEditor.dockPanel("left", "right")');
  await sleep(80);
  const swapped = await $(`(() => {
    const l = document.querySelector('.ed-side').getBoundingClientRect();
    const r = document.querySelector('.ed-main').getBoundingClientRect();
    const st = window.__chapterEditor.state().layout.slots;
    return st.left === 'right' && st.right === 'left' && l.left > r.left;
  })()`);
  check(swapped, 'Left Outliner and Right Inspector docks can swap sides');
  await $('window.__chapterEditor.resetLayout()');
  await sleep(120);
  check(await $("window.__chapterEditor.state().layout.slots.left === 'left' && window.__chapterEditor.state().pageZoom === 'fit'"), 'Reset Layout restores default dock slots and Fit zoom');

  await $('window.__chapterEditor.setPageZoom(1.25)');
  await $('window.__chapterEditor.setViewportSize(560, 350)');
  await sleep(60);
  const customRect = await $("document.querySelector('.pv-frame').getBoundingClientRect().toJSON()");
  await $('window.__chapterEditor.togglePortrait()');
  await sleep(60);
  const portraitRect = await $("document.querySelector('.pv-frame').getBoundingClientRect().toJSON()");
  await $('window.__chapterEditor.togglePortrait()');
  await $("window.__chapterEditor.setPageZoom('fit')");
  await sleep(80);
  check(
    Math.abs(customRect.width - 560) <= 2 && Math.abs(customRect.height - 350) <= 2 && portraitRect.height > portraitRect.width,
    `viewport canvas zoom, custom resize (${Math.round(customRect.width)}x${Math.round(customRect.height)}), and Portrait (${Math.round(portraitRect.width)}x${Math.round(portraitRect.height)}) aspect switch work`,
  );

  await click('.ed-tab', 'Script');
  await sleep(60);
  const pickedPath = await $("document.querySelector('.ed-pane details[data-item-path]')?.dataset.itemPath || ''");
  await $(`window.__chapterEditor.selectItem(${JSON.stringify(pickedPath)})`);
  await click('.ed-tab', 'Overview');
  await sleep(60);
  const pillVisible = await $("!document.querySelector('.cx-sel-pill').hidden");
  await click('.cx-sel-pill');
  await sleep(80);
  const revealed = await $(`document.querySelector('.ed-pane details.is-selected')?.dataset.itemPath === ${JSON.stringify(pickedPath)} && window.__chapterEditor.state().tab === 'script'`);
  check(Boolean(pickedPath) && pillVisible && revealed, 'spec item selection highlights row and .cx-sel-pill reveals its tab and opens details');

  await click('.ed-tab', 'Files');
  await sleep(80);
  const beforeBack = await $('window.__chapterEditor.state().tab');
  await $('history.back()');
  await sleep(100);
  const afterBack = await $('window.__chapterEditor.state().tab');
  await $('history.forward()');
  await sleep(100);
  check(beforeBack === 'files' && afterBack === 'script' && (await $('window.__chapterEditor.state().tab')) === 'files', 'browser history back/forward restores editor route via popstate');
  await click('.ed-item', chapter.levels[0].spec.title);
  await $('window.__chapterEditor.resetLayout()');
  await sleep(100);

  // 8c. array reorder open-details preservation, semantic manifest table & Event Log Clear button layout
  await click('.ed-tab', 'Script');
  await sleep(60);
  const movedStaysOpen = await $(`(() => {
    const items = [...document.querySelectorAll('.ed-pane details.item')];
    if (items.length < 2) return true;
    items[0].open = true;
    items[0].dispatchEvent(new Event('toggle'));
    items[1].open = false;
    items[1].dispatchEvent(new Event('toggle'));
    window.__chapterEditor.selectItem(items[0].dataset.itemPath);
    const moveDown = [...items[0].querySelectorAll(':scope > summary .mini')].find((b) => b.getAttribute('aria-label') === 'Move down');
    moveDown?.click();
    const after = [...document.querySelectorAll('.ed-pane details.item')];
    return Boolean(after[1]?.open) && !after[0]?.open && window.__chapterEditor.state().selectedPath === after[1]?.dataset.itemPath;
  })()`);
  check(movedStaysOpen, 'reordering an array item remaps open <details> state and selectedPath to follow the moved item');
  await click('.ed-top .btn', 'Revert file');

  await $('window.__chapterEditor.select({ target: "chapter", tab: "manifest" })');
  await sleep(60);
  const tableAndClearOk = await $(`(() => {
    const ths = document.querySelectorAll('.ed-pane table.tbl thead th[scope="col"]').length;
    const noMultiInputLabel = [...document.querySelectorAll('.ed-pane label')].every((l) => l.querySelectorAll('input,select,textarea').length <= 1);
    const clearBtn = [...document.querySelectorAll('.ch-log-head button')].find((b) => b.textContent.trim() === 'Clear');
    const clearFits = Boolean(clearBtn) && clearBtn.scrollWidth <= clearBtn.clientWidth + 2;
    const openBtn = [...document.querySelectorAll('.ed-pane table.tbl tbody button')].find((b) => b.textContent.includes('Open'));
    openBtn?.click();
    return { ths, noMultiInputLabel, clearFits, jumpedLevel: window.__chapterEditor.state().target === 'level' };
  })()`);
  check(
    tableAndClearOk.ths >= 5 && tableAndClearOk.noMultiInputLabel && tableAndClearOk.clearFits && tableAndClearOk.jumpedLevel,
    'Chapter summary table uses semantic th[scope=col] + Open button, multi-control fields avoid multi-input <label>, and Clear button fits cleanly',
  );

  // 8d. Interactive config-first form widgets: stage hero `alt` toggle & prop `numOrVec3` vec3 scale editing
  await click('.ed-item', chapter.levels[0].spec.title);
  await click('.ed-tab', 'Overview');
  await sleep(60);
  const stageWidgetsOk = await $(`(() => {
    const heroMode = document.querySelector('.ed-pane select[aria-label="Hero placement (number = X, or object) mode"]');
    if (!heroMode) return false;
    const orig = heroMode.value;
    heroMode.value = 'object';
    heroMode.dispatchEvent(new Event('change', { bubbles: true }));
    const zLbl = [...document.querySelectorAll('.ed-pane fieldset.grp label.fld')].find((l) => l.querySelector('.fld-label')?.textContent?.startsWith('Z order'));
    const zInput = zLbl?.querySelector('input');
    if (!zInput) return false;
    zInput.value = '2';
    zInput.dispatchEvent(new Event('input', { bubbles: true }));
    const heroModeAfter = document.querySelector('.ed-pane select[aria-label="Hero placement (number = X, or object) mode"]');
    if (!heroModeAfter) return false;
    heroModeAfter.value = orig;
    heroModeAfter.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await click('.ed-tab', 'Enemies & items');
  await sleep(60);
  const propVecOk = await $(`(() => {
    const findProp = () => [...document.querySelectorAll('.ed-pane details.item')].find((d) => (d.dataset.itemPath || '').includes('props['));
    const det = findProp();
    if (!det) return false;
    const path = det.dataset.itemPath;
    det.open = true;
    det.dispatchEvent(new Event('toggle'));
    const modeSel = det.querySelector('select[aria-label="Scale (number or [x, y, z]) mode"]');
    if (!modeSel) return false;
    modeSel.value = 'vec3';
    modeSel.dispatchEvent(new Event('change', { bubbles: true }));
    const det2 = [...document.querySelectorAll('.ed-pane details.item')].find((d) => d.dataset.itemPath === path);
    const sx = det2?.querySelector('input[aria-label="Scale (number or [x, y, z]) 0"]');
    const sy = det2?.querySelector('input[aria-label="Scale (number or [x, y, z]) 1"]');
    if (!sx || !sy) return false;
    sx.value = '1.25';
    sx.dispatchEvent(new Event('input', { bubbles: true }));
    sy.value = '0.85';
    sy.dispatchEvent(new Event('input', { bubbles: true }));
    return Boolean(det2?.open) && Number(sx.value) === 1.25 && Number(sy.value) === 0.85;
  })()`);
  await browser.waitFor(
    `(localStorage.getItem('credits.editor.draft:${chapter.manifest.id}') || '').includes('1.25')`,
    5000,
    'editor draft vec3 update',
  ).catch(() => false);
  const draftHasVec = await $(`(localStorage.getItem('credits.editor.draft:${chapter.manifest.id}') || '').includes('1.25')`);
  await click('.ed-top .btn', 'Revert file');
  await sleep(60);
  check(
    stageWidgetsOk && propVecOk && draftHasVec,
    `interactive Stage hero alt-mode and prop numOrVec3 vec3 scale widgets update draft cleanly (stage=${stageWidgetsOk}, prop=${propVecOk}, draft=${draftHasVec})`,
  );

  // 8e. Interactive 3D canvas selection + real CDP pointer drags (move, Shift axis lock, Alt floor-snap bypass, rotate + Shift 15°, cross-iframe scale, socket detach) -> Save file -> restore exact bytes
  await click('.ed-item', chapter.levels[0].spec.title);
  const lvl0 = chapter.levels[0];
  await browser.waitFor(
    `window.__chapterEditor?.state().previewLevel === ${JSON.stringify(lvl0.spec.id)} && document.querySelector('.pv-frame')?.contentWindow?.__stageEditor?.ready === true`,
    20000,
    'stage editor ready on level 0',
  );
  const lvl0Path = resolve(chaptersDir, slug, lvl0.path);
  const origLvl0 = readFileSync(lvl0Path, 'utf8');
  const putLvl0 = (json) => fetch(`${base}/api/chapters/${slug}/file`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: lvl0.path, json }) });
  const cdpDrag = async (x0, y0, x1, y1, modifiers = 0) => {
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0, modifiers });
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x: x0, y: y0, modifiers });
    for (let i = 1; i <= 5; i++) {
      const mx = x0 + ((x1 - x0) * i) / 5;
      const my = y0 + ((y1 - y0) * i) / 5;
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, x: mx, y: my, modifiers });
    }
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: x1, y: y1, modifiers });
    await sleep(60);
  };
  const stagePoints = async (id) => $(`(() => {
    const f = document.querySelector('.pv-frame');
    const fr = f.getBoundingClientRect();
    const doc = f.contentDocument;
    const se = f.contentWindow.__stageEditor;
    if (${JSON.stringify(id)}) se.setSelectedActor(${JSON.stringify(id)});
    const box = doc.querySelector('.st-ed-box');
    const scaleH = doc.querySelector('.st-ed-scale');
    const rotH = doc.querySelector('.st-ed-rot');
    const pt = (el) => {
      if (!el || el.hidden) return null;
      const r = el.getBoundingClientRect();
      return {
        x: fr.left + f.clientLeft + r.left + r.width / 2,
        y: fr.top + f.clientTop + r.top + r.height / 2,
        w: r.width,
        h: r.height,
      };
    };
    const actor = se.listActors().find((a) => a.actorId === ${JSON.stringify(id)});
    return {
      fr: { left: fr.left, top: fr.top, right: fr.right, bottom: fr.bottom },
      box: pt(box),
      scale: pt(scaleH),
      rot: pt(rotH),
      actor,
    };
  })()`);

  try {
    // 1. Real mouse click in empty room clears selection
    await $(`document.querySelector('.pv-frame').contentWindow.__stageEditor.setSelectedActor('vibecoder')`);
    const frameBounds = await $(`(() => { const r = document.querySelector('.pv-frame').getBoundingClientRect(); return { left: r.left, top: r.top }; })()`);
    await cdpDrag(frameBounds.left + 14, frameBounds.top + 14, frameBounds.left + 14, frameBounds.top + 14);
    const clearedAfterEmpty = await $(`document.querySelector('.pv-frame').contentWindow.__stageEditor.getSelectedActor() === null`);
    check(clearedAfterEmpty, 'real click in empty stage clears selection');

    // 2. Real CDP drag with Alt (<0.12 y) bypasses floor snap; normal drop inside |y|<0.12 snaps to floor (y=0); Shift locks axis
    const p0 = await stagePoints('vibecoder');
    check(Boolean(p0.box && p0.scale && p0.rot), 'selected vibecoder renders selection box, scale handle, and rotate handle');
    const heroFloorY = p0.box.y;
    await cdpDrag(p0.box.x, p0.box.y, p0.box.x, heroFloorY - 6, 1); // Alt = 1
    const afterAlt = await $(`document.querySelector('.pv-frame').contentWindow.__stageEditor.listActors().find((a) => a.actorId === 'vibecoder')`);
    check(afterAlt && afterAlt.y > 0 && afterAlt.y < 0.12, `Alt drag inside |y|<0.12 bypasses floor snap (y=${afterAlt?.y})`);

    const pAlt = await stagePoints('vibecoder');
    await cdpDrag(pAlt.box.x, pAlt.box.y, pAlt.box.x, heroFloorY); // no Alt -> snaps back to floor y=0
    const afterFloorSnap = await $(`document.querySelector('.pv-frame').contentWindow.__stageEditor.listActors().find((a) => a.actorId === 'vibecoder')`);
    check(afterFloorSnap && afterFloorSnap.y === 0, `releasing within |y|<0.12 without Alt snaps actor to floor y=0 (y=${afterFloorSnap?.y})`);

    const pSnap = await stagePoints('vibecoder');
    const beforeShiftX = pSnap.actor.x;
    await cdpDrag(pSnap.box.x, pSnap.box.y, pSnap.box.x + 55, pSnap.box.y - 12, 8); // Shift = 8 locks dominant horizontal axis
    const afterShift = await $(`document.querySelector('.pv-frame').contentWindow.__stageEditor.listActors().find((a) => a.actorId === 'vibecoder')`);
    check(afterShift && afterShift.x !== beforeShiftX && afterShift.y === 0, `Shift drag locks axis cleanly (x: ${beforeShiftX} -> ${afterShift?.x}, y=${afterShift?.y})`);

    // 3. Real CDP clockwise drag on rotate handle produces positive rotation, and Shift snaps to 15°
    const pRot = await stagePoints('vibecoder');
    await cdpDrag(pRot.rot.x, pRot.rot.y, pRot.box.x + 60, pRot.box.y);
    const afterClockwise = await $(`document.querySelector('.pv-frame').contentWindow.__stageEditor.listActors().find((a) => a.actorId === 'vibecoder')`);
    check(afterClockwise && Number(afterClockwise.rotation) > 0, `clockwise rotate handle drag applies positive degrees (rotation=${afterClockwise?.rotation})`);

    const pRot2 = await stagePoints('vibecoder');
    await cdpDrag(pRot2.rot.x, pRot2.rot.y, pRot2.box.x + 48, pRot2.box.y - 20, 8); // Shift = 15° snap
    const afterRotSnap = await $(`document.querySelector('.pv-frame').contentWindow.__stageEditor.listActors().find((a) => a.actorId === 'vibecoder')`);
    check(afterRotSnap && Number(afterRotSnap.rotation) % 15 === 0, `Shift rotate drag snaps to 15° increments (rotation=${afterRotSnap?.rotation})`);

    // 4. Real CDP cross-iframe scale drag past .pv-frame bottom updates scale and terminates cleanly
    const pScale = await stagePoints('vibecoder');
    const scaleTargetY = pScale.fr.bottom + 24 < vpHeight - 8 ? pScale.fr.bottom + 24 : pScale.scale.y + 42;
    await cdpDrag(pScale.scale.x, pScale.scale.y, pScale.scale.x + 28, scaleTargetY);
    const afterScale = await $(`document.querySelector('.pv-frame').contentWindow.__stageEditor.listActors().find((a) => a.actorId === 'vibecoder')`);
    // Verify subsequent click in empty area still works (drag did not remain stuck after crossing iframe edge)
    await cdpDrag(pScale.fr.left + 14, pScale.fr.top + 14, pScale.fr.left + 14, pScale.fr.top + 14);
    const unstuckAfterScale = await $(`document.querySelector('.pv-frame').contentWindow.__stageEditor.getSelectedActor() === null`);
    check(
      afterScale && Number(afterScale.scale) > 1 && unstuckAfterScale,
      `cross-iframe scale handle drag updates scale (${afterScale?.scale}) and releases cleanly`,
    );

    // 5. Save file writes updated hero transform to disk
    const heroNow = await $(`document.querySelector('.pv-frame').contentWindow.__stageEditor.listActors().find((a) => a.actorId === 'vibecoder')`);
    await click('.ed-top .btn', 'Save file');
    await browser.waitFor("window.__chapterEditor.state().dirty.length === 0", 12000, 'save after hero drag');
    const savedDisk = JSON.parse(readFileSync(lvl0Path, 'utf8'));
    const savedHeroX = typeof savedDisk.stage?.hero === 'number' ? savedDisk.stage.hero : savedDisk.stage?.hero?.x;
    check(
      savedHeroX !== undefined
        && Math.abs(savedHeroX - heroNow.x) < 0.05
        && Math.abs(savedDisk.stage?.hero?.scale - heroNow.scale) < 0.05
        && savedDisk.stage?.hero?.rotation === heroNow.rotation,
      `Save file persisted hero transform (x=${savedHeroX}, scale=${savedDisk.stage?.hero?.scale}, rot=${savedDisk.stage?.hero?.rotation}) to disk`,
    );
  } finally {
    writeFileSync(lvl0Path, origLvl0);
    await putLvl0(lvl0.spec);
    await $("window.__chapterEditor.reload()");
    await sleep(150);
  }
  check(readFileSync(lvl0Path, 'utf8') === origLvl0, 'canvas drag test restored original level.spec.json bytes cleanly');

  // 8f. Real CDP drag on door:entry (level 1 has entryPort/entryDoor) detaches socket, survives syncDraftInPlace, persists to disk, and restores cleanly
  const lvl1 = chapter.levels[1];
  await click('.ed-item', lvl1.spec.title);
  await browser.waitFor(
    `window.__chapterEditor?.state().previewLevel === ${JSON.stringify(lvl1.spec.id)} && document.querySelector('.pv-frame')?.contentWindow?.__stageEditor?.ready === true`,
    20000,
    'stage editor ready on level 1',
  );
  const lvl1Path = resolve(chaptersDir, slug, lvl1.path);
  const origLvl1 = readFileSync(lvl1Path, 'utf8');
  const putLvl1 = (json) => fetch(`${base}/api/chapters/${slug}/file`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: lvl1.path, json }) });
  try {
    const pEntry = await stagePoints('door:entry');
    check(Boolean(pEntry.box && pEntry.actor), 'level 1 entry door renders selectable box on stage');
    const beforeEntryX = pEntry.actor.x;
    await cdpDrag(pEntry.box.x, pEntry.box.y, pEntry.box.x + 48, pEntry.box.y);
    await sleep(320); // allow draft syncDraftInPlace round-trip
    const afterEntry = await $(`document.querySelector('.pv-frame').contentWindow.__stageEditor.listActors().find((a) => a.actorId === 'door:entry')`);
    check(
      afterEntry && Math.abs(afterEntry.x - beforeEntryX) > 0.08,
      `door:entry drag detached socket and survived syncDraftInPlace (${beforeEntryX} -> ${afterEntry?.x})`,
    );
    await click('.ed-top .btn', 'Save file');
    await browser.waitFor("window.__chapterEditor.state().dirty.length === 0", 12000, 'save after entry door drag');
    const savedLvl1 = JSON.parse(readFileSync(lvl1Path, 'utf8'));
    check(
      savedLvl1.stage?.entryPort?.socket === undefined && Math.abs(savedLvl1.stage?.entryPort?.x - afterEntry.x) < 0.05,
      `Save file persisted detached entryPort (x=${savedLvl1.stage?.entryPort?.x}) without socket`,
    );
  } finally {
    writeFileSync(lvl1Path, origLvl1);
    await putLvl1(lvl1.spec);
    await $("window.__chapterEditor.reload()");
    await sleep(150);
  }
  check(readFileSync(lvl1Path, 'utf8') === origLvl1, 'entry door drag test restored original level 1 bytes cleanly');

  // 9. a file changed on disk by someone else is noticed, and a stale save is refused
  const last = chapter.levels[chapter.levels.length - 1];
  const lastPath = resolve(chaptersDir, slug, last.path);
  const original = readFileSync(lastPath, 'utf8');
  const put = (body, headers = { 'content-type': 'application/json' }) => fetch(`${base}/api/chapters/${slug}/file`, { method: 'PUT', headers, body: JSON.stringify(body) });
  try {
    await put({ path: last.path, json: { ...last.spec, title: `${last.spec.title} (edited elsewhere)` } });
    await $("window.dispatchEvent(new Event('focus'))");
    await browser.waitFor("[...document.querySelectorAll('.ed-top .btn')].some((b) => b.textContent.startsWith('Reload from disk'))", 8000, 'the reload-from-disk button');
    check(true, 'editor notices a spec file changed on disk by someone else');
    await click('.ed-item', last.spec.title);
    await click('.ed-tab', 'Overview');
    await $("(() => { const i = document.querySelector('.ed-pane input[type=text]'); i.value += ' mine'; i.dispatchEvent(new Event('input', { bubbles: true })); })()");
    await click('.ed-top .btn', 'Save file');
    await browser.waitFor("document.querySelector('.ed-status').textContent.includes('changed on disk')", 8000, 'the conflict message');
    check(readFileSync(lastPath, 'utf8').includes('edited elsewhere') && !readFileSync(lastPath, 'utf8').includes(' mine'), 'a stale save is refused and the newer file on disk is kept');
    await $("window.confirm = () => true");
    await click('.ed-top .btn', 'Reload from disk');
    await browser.waitFor("!document.querySelector('.ed-top').textContent.includes('Reload from disk')", 8000, 'the reload');
    check(true, 'reload from disk adopts the new file');
  } finally {
    writeFileSync(lastPath, original);
    await put({ path: last.path, json: last.spec });
  }
  check(readFileSync(lastPath, 'utf8') === original, 'the test restored the level file byte for byte');

  // 10. saving an untouched chapter is lossless
  let lossless = true;
  for (const f of [{ path: 'chapter.manifest.json', json: chapter.manifest }, ...chapter.levels.map((l) => ({ path: l.path, json: l.spec }))]) {
    const before = readFileSync(resolve(chaptersDir, slug, f.path), 'utf8');
    const res = await put(f);
    const after = readFileSync(resolve(chaptersDir, slug, f.path), 'utf8');
    if (!res.ok || before !== after) { lossless = false; console.log(`   changed by save: ${f.path}`); }
  }
  check(lossless, 'saving unedited manifest and levels through the API rewrites identical bytes');

  // 11. the API refuses unsafe writes
  const status = async (body, headers) => (await put(body, headers)).status;
  check((await status({ path: '../../package.json', json: {} })) === 400, 'API refuses paths outside the chapter spec files');
  check((await status({ path: 'levels/new-dir/level.spec.json', json: {} })) === 404, 'API will not create files that are not part of the chapter');
  check((await status({ path: last.path, json: last.spec }, { 'content-type': 'text/plain' })) === 415, 'API requires Content-Type: application/json (no CSRF through a simple form post)');
  check((await status({ path: last.path, json: last.spec }, { 'content-type': 'application/json', origin: 'http://evil.example' })) === 403, 'API refuses a request from another origin');
  check((await status({ path: last.path, json: last.spec, baseEtag: 'stale' })) === 409, 'API answers 409 to a stale baseEtag');
  check((await status({ path: last.path, json: last.spec, baseEtag: 12345 })) === 400, 'API refuses non-string baseEtag');
  check((await status({ path: last.path, json: [] })) === 400, 'API refuses a body that is not an object');
  check(
    (await fetch(`${base}/api/chapters/${slug}/file`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: 'null' })).status === 400,
    'API answers 400 (never 500) to a null top-level JSON body',
  );
  check((await fetch(`${base}/api/chapters`, { method: 'DELETE' })).status === 404, 'API answers 404 to unsupported HTTP methods');
} catch (err) {
  check(false, `script aborted: ${err.message}`);
  await browser.shoot(out('error')).catch(() => {});
} finally {
  await browser.close();
  if (vite) await vite.close();
}
if (browser.problems.length) console.log(`page problems:\n  ${browser.problems.slice(0, 6).join('\n  ')}`);
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nchapter editor smoke OK');
process.exit(failures.length ? 1 : 0);
