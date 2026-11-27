#!/usr/bin/env node
// Headless Laptop Lab CLI: inspects tasks, verifies ?speed= parsing, runs all 7 TASKS (starter fails, solution passes),
// and checks the Quest Check & RunReport Inspector card on /laptop-lab.
//   node scripts/harness/laptop-lab.mjs --verify              verify all 7 quests + inspector + ?speed= URL handling
//   node scripts/harness/laptop-lab.mjs --verify --task js-add verify one quest
//   node scripts/harness/laptop-lab.mjs --list                list all tasks and check counts offline
import assert from 'node:assert/strict';
import { launchBrowser } from './lib/browser.mjs';
import { parseArgs, startPageServer, withProcgen } from './lib/load.mjs';

const args = parseArgs(process.argv.slice(2), ['--task', '--url']);
const listOnly = args.flag('--list');
const verifyFlag = args.flag('--verify');
const taskFilter = args.val('--task', '');

if (!listOnly && !verifyFlag) {
  console.error('usage: laptop-lab.mjs --verify [--task <id>] [--url <base>] | --list');
  process.exit(2);
}

const data = await withProcgen(async (_p, vite) => {
  const { TASKS } = await vite.ssrLoadModule('/src/laptop/domain/tasks.ts');
  const { parseLabSpeed, LAB_SPEED_PRESETS } = await vite.ssrLoadModule('/src/laptop/lab/lab-page.ts');
  const { guardLoops } = await vite.ssrLoadModule('/src/laptop/runtime/loop-guard.ts');

  assert.equal(parseLabSpeed(null), 1);
  assert.equal(parseLabSpeed(''), 1);
  assert.equal(parseLabSpeed('bogus'), 1);
  assert.equal(parseLabSpeed('-1'), 1);
  assert.equal(parseLabSpeed('0.5'), 0.5);
  assert.equal(parseLabSpeed('0.4'), 0.4);
  assert.equal(parseLabSpeed('0'), 0);
  assert.ok(LAB_SPEED_PRESETS.some(([v]) => v === '0.5') && LAB_SPEED_PRESETS.some(([v]) => v === '0.4'));
  assert.ok(guardLoops('while (true) {}').includes('__lg'));

  const filtered = taskFilter ? TASKS.filter((t) => t.id === taskFilter) : TASKS;
  if (taskFilter && filtered.length === 0) {
    throw new Error(`unknown laptop task "${taskFilter}". Available: ${TASKS.map((t) => t.id).join(', ')}`);
  }
  return filtered.map((t) => ({
    id: t.id,
    title: t.title,
    app: t.app,
    checks: t.checks.length,
    starter: t.starter,
    solution: t.solution,
  }));
});

if (listOnly) {
  for (const t of data) console.log(`${t.id.padEnd(14)} ${t.app.padEnd(8)} ${t.checks} checks  ${t.title}`);
  process.exit(0);
}

let vite = null;
let base = args.val('--url');
if (!base) ({ vite, base } = await startPageServer(5347, { hmr: false, watch: null }));
base = base.replace(/\/$/, '');

const browser = await launchBrowser({ width: 1280, height: 820 });
const $ = (expr, ms) => browser.evaluate(expr, ms);

let failed = 0;
try {
  // Check ?speed=0.5 preset sync and invalid ?speed=bogus fallback
  await browser.open(`${base}/laptop-lab?state=desktop&speed=0.5&mute=1`);
  await browser.waitFor('!!window.__laptop && window.__laptop.machine.state === "desktop"', 20000, 'laptop-lab speed=0.5');
  const speed05 = await $('({ speed: window.__laptop.machine.speed, select: document.querySelector(".ll-side select")?.value })');
  if (speed05.speed !== 0.5 || speed05.select !== '0.5') {
    console.error(`FAIL ?speed=0.5: expected speed=0.5 and select="0.5", got ${JSON.stringify(speed05)}`);
    failed += 1;
  }
  await $('window.__laptop.setSpeed(0.4)');
  const syncedSelect = await $('document.querySelector(".ll-side select")?.value');
  if (syncedSelect !== '0.4') {
    console.error(`FAIL setSpeed(0.4): expected select="0.4", got ${syncedSelect}`);
    failed += 1;
  }

  await browser.open(`${base}/laptop-lab?state=desktop&speed=bogus&mute=1`);
  await browser.waitFor('!!window.__laptop && window.__laptop.machine.state === "desktop"', 20000, 'laptop-lab speed=bogus');
  const bogusSpeed = await $('window.__laptop.machine.speed');
  if (bogusSpeed !== 1) {
    console.error(`FAIL ?speed=bogus: expected fallback speed=1, got ${bogusSpeed}`);
    failed += 1;
  }

  await browser.open(`${base}/laptop-lab?state=desktop&speed=0&mute=1`);
  await browser.waitFor('!!window.__laptop && window.__laptop.machine.state === "desktop"', 20000, 'laptop-lab verify desktop');

  for (const t of data) {
    const starter = await $(`window.__laptop.runTask(${JSON.stringify(t.id)}, ${JSON.stringify(t.starter)})`, 15000);
    const starterPassed = starter.filter((r) => r.ok).length;
    const starterBadge = await $('document.querySelector(".ll-inspector .ll-badge")?.textContent ?? ""');
    const starterOk = starter.some((r) => !r.ok) && starterBadge === 'FAIL';
    if (!starterOk) {
      console.error(`FAIL ${t.id} starter: passed=${starterPassed}/${starter.length}, badge="${starterBadge}"`);
      failed += 1;
      continue;
    }

    const solved = await $(`window.__laptop.runTask(${JSON.stringify(t.id)}, ${JSON.stringify(t.solution)})`, 15000);
    const solvedPassed = solved.filter((r) => r.ok).length;
    const solvedBadge = await $('document.querySelector(".ll-inspector .ll-badge")?.textContent ?? ""');
    const inspTitle = await $('document.querySelector(".ll-inspector .ll-insp-title")?.textContent ?? ""');
    const solvedOk = solved.length > 0 && solved.every((r) => r.ok) && solvedBadge === 'PASS' && inspTitle.includes(t.id);
    if (!solvedOk) {
      const why = solved.filter((r) => !r.ok).map((r) => `${r.label}: ${r.detail}`).join('; ');
      console.error(`FAIL ${t.id} solution: ${solvedPassed}/${solved.length}, badge="${solvedBadge}" (${why})`);
      failed += 1;
      continue;
    }
    console.log(`ok   ${t.id.padEnd(14)} ${t.app.padEnd(7)} starter ${starterPassed}/${starter.length} FAIL -> solution ${solvedPassed}/${solved.length} PASS`);
  }

  // Exercise Quest Inspector UI buttons (Test starter / Test solution) via real DOM clicks
  await $('document.querySelector("[data-insp=\\"starter\\"]").click()');
  await browser.waitFor('document.querySelector(".ll-inspector .ll-badge")?.textContent === "FAIL"', 15000, 'inspector starter FAIL');
  await $('document.querySelector("[data-insp=\\"solution\\"]").click()');
  await browser.waitFor('document.querySelector(".ll-inspector .ll-badge")?.textContent === "PASS"', 15000, 'inspector solution PASS');
  await $('window.__laptop.resetProgress()');

  if (browser.problems.length > 0) {
    console.error(`FAIL page errors: ${browser.problems.join(' | ')}`);
    failed += 1;
  }
} finally {
  await browser.close();
  if (vite) await vite.close();
}

if (failed > 0) {
  console.error(`\nlaptop-lab: ${failed} failure(s)`);
  process.exit(1);
}
console.log(`\nlaptop-lab: ${data.length} task(s) verified cleanly`);
