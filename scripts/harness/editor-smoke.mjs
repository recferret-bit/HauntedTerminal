#!/usr/bin/env node
// Drives the chapter editor (/editor) in headless Chrome and checks the whole loop:
//   load every level, open every tab, edit a field (dirty + draft), run the headless solution from the Check tab,
//   boot the game preview on the draft, step the solution, play a script step, revert, catch a misspelled spec key, notice a
//   file changed on disk by someone else, and prove saves are lossless and the API refuses unsafe writes.
//
//   node scripts/harness/editor-smoke.mjs                  (starts its own Vite on 5343)
//   node scripts/harness/editor-smoke.mjs --url http://localhost:5173
// Screenshots: scripts/harness/out/editor-*.png. Exit 0 = every check passed.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser } from './lib/browser.mjs';
import { stringifyChapterJson } from './lib/chapter-json.mjs';
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
const browser = await launchBrowser({ width: Number(args.val('--width', 1600)), height: Number(args.val('--height', 950)) });
const $ = (expr) => browser.evaluate(expr);
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
  check(await $(`(localStorage.getItem('haunted.editor.draft:${chapter.manifest.id}') || '').includes(${JSON.stringify(marker)})`), 'the unsaved draft is handed to the game through localStorage');
  check(await $("document.querySelector('.ed-item.on .dot') !== null"), 'sidebar marks the level as unsaved');

  // 5. headless solve from the Check tab
  await click('.ed-tab', 'Check');
  await click('button', 'Solve the whole chapter');
  await browser.waitFor("document.querySelector('.solve-out').textContent.length > 0", 60000, 'the headless solve');
  check((await $("document.querySelector('.solve-out').textContent")).includes('cleared headlessly'), 'whole chapter clears headlessly from the draft');
  await browser.shoot(out('03-check'));

  // 6. preview: the real game on the draft, stepped through the solution
  await browser.waitFor("document.querySelector('.pv-status').textContent === 'live'", 60000, 'the preview game');
  await $("document.querySelector('.pv-bar button:nth-child(2)').click()");
  await browser.waitFor("document.querySelectorAll('.pv-ev').length > 0", 20000, 'preview events');
  const logged = await $("document.querySelector('.pv-log').textContent");
  check(logged.length > 0, 'preview game ran a solution command and the event log filled');
  check(((await $("document.querySelector('.pv-frame').contentWindow.document.title")) || '').includes('Play'), 'preview iframe is the game page');
  await click('.ed-tab', 'Script');
  await $("[...document.querySelectorAll('.ed-pane details.item')].slice(0, 1).forEach((d) => (d.open = true))");
  const before = await $("document.querySelectorAll('.pv-ev').length");
  await $("document.querySelectorAll('.ed-pane .item-tools [title^=\"Play\"]')[1].click()");
  await new Promise((r) => setTimeout(r, 1200));
  const after = await $("document.querySelectorAll('.pv-ev').length");
  check(after > before, 'the play button on a script step fires its events on the live stage');
  await browser.shoot(out('04-preview'));

  // 6b. a dialogue bubble plays on a real hub level without errors
  const hub = chapter.levels.find((l) => l.spec.script?.arrival?.some((st) => st.kind === 'dialogue'));
  if (hub) {
    const errorsBefore = browser.problems.length;
    await click('.ed-item', hub.spec.title);
    await click('.ed-tab', 'Script');
    await browser.waitFor("document.querySelector('.pv-status').textContent === 'live'", 60000, 'the hub preview');
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

  // 8. the schema check catches what no reference check can: a misspelled key
  await click('.ed-item', chapter.levels[0].spec.title);
  await click('.ed-tab', 'JSON');
  await $(`(() => { const a = document.querySelector('.ed-pane textarea.json'); const j = JSON.parse(a.value); j.sumary = 'typo'; a.value = JSON.stringify(j); })()`);
  await click('button', 'Apply JSON to the draft');
  await click('.ed-tab', 'Check');
  check((await $("document.querySelector('.ed-pane').textContent")).includes('level.sumary: unknown field'), 'Check tab flags a misspelled spec key from the field tables');
  await click('.ed-top .btn', 'Revert file');

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
  check((await status({ path: last.path, json: [] })) === 400, 'API refuses a body that is not an object');
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
