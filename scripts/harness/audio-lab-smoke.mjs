#!/usr/bin/env node
// Smoke test for /audio-lab in headless Chromium: soundboard filters, key_press waveform decode + SFX_TRIM scrubber,
// LOOP_TAKES / LOOP_GAINS mixer, MusicScene & AppBus tester, dev.html link, and zero runtime errors.
import assert from 'node:assert/strict';
import { launchBrowser } from './lib/browser.mjs';
import { startPageServer } from './lib/load.mjs';

const { vite, base } = await startPageServer(5348, { hmr: false, watch: null });
const browser = await launchBrowser({ width: 1280, height: 820 });
const $ = (expr, ms) => browser.evaluate(expr, ms);

try {
  await browser.open(`${base}/dev.html`);
  await browser.waitFor('!!document.querySelector("a[href=\\"/audio-lab\\"]")', 10000, '/dev.html audio-lab link');

  await browser.open(`${base}/audio-lab`);
  await browser.waitFor('!!window.__audioLab', 20000, 'audio-lab boot');
  await $('window.__audioLab.ready', 15000);

  const initial = await $('window.__audioLab.state()');
  assert.ok(initial.sfxCount >= 100, `expected >= 100 SFX cues, got ${initial.sfxCount}`);
  assert.ok(initial.musicCount >= 8, `expected >= 8 music cues, got ${initial.musicCount}`);
  assert.equal(initial.visibleCount, initial.sfxCount + initial.musicCount);

  await $('document.querySelector("[data-filter=\\"trimmed\\"]").click()');
  const trimmedState = await $('window.__audioLab.state()');
  assert.ok(trimmedState.visibleCount > 10 && trimmedState.visibleCount < initial.sfxCount);

  await $('document.querySelector("[data-filter=\\"all\\"]").click()');
  await $('(() => { const el = document.querySelector(".al-search"); el.value = "taunt_clod"; el.dispatchEvent(new Event("input")); })()');
  const searchState = await $('window.__audioLab.state()');
  assert.ok(searchState.visibleCount >= 10 && searchState.visibleCount <= 20, `expected taunt_clod results, got ${searchState.visibleCount}`);
  await $('(() => { const el = document.querySelector(".al-search"); el.value = ""; el.dispatchEvent(new Event("input")); })()');

  await $('window.__audioLab.selectCue("key_press")', 15000);
  const kp = await $('window.__audioLab.state()');
  assert.equal(kp.selectedCue, 'key_press');
  assert.ok(kp.durationSec && kp.durationSec > 0.1, `expected decoded key_press duration, got ${kp.durationSec}`);
  assert.equal(kp.waveformBins, 560);
  assert.ok(kp.trim.offset > 0);

  await $('window.__audioLab.setTrim("key_press", { offset: 0.05, duration: 0.15 })');
  const snippet = await $('document.querySelector(".al-code").textContent');
  assert.equal(snippet, 'key_press: { offset: 0.05, duration: 0.15 },');

  await $('window.__audioLab.playCue("key_press", { raw: false })', 10000);
  await $('window.__audioLab.playCue("key_press", { raw: true })', 10000);
  const afterPlay = await $('window.__audioLab.state()');
  assert.ok(afterPlay.recentCues.includes('key_press:trimmed'));
  assert.ok(afterPlay.recentCues.includes('key_press:raw'));

  await $('document.querySelector("[data-loop-toggle=\\"rain_loop\\"]").click()');
  await $('document.querySelector("[data-take=\\"dad_smoke_loop_2\\"]").click()');
  const afterMix = await $('window.__audioLab.state()');
  assert.equal(afterMix.activeLoops.rain_loop.on, true);
  assert.ok(afterMix.recentCues.some((c) => c.includes('dad_smoke_loop_2')));

  await $('document.querySelector("[data-scene=\\"boss\\"]").click()');
  const afterScene = await $('window.__audioLab.state()');
  const badge = await $('document.querySelector(".al-badge").textContent');
  assert.ok(afterScene.currentBed && badge.includes(afterScene.currentBed), `expected bed badge, got ${badge}`);

  await $('window.__audioLab.playCue("rank_card")');
  const afterBedCue = await $('window.__audioLab.state()');
  const bedCueBadge = await $('document.querySelector(".al-badge").textContent');
  assert.equal(afterBedCue.currentBed, 'rank_card');
  assert.equal(afterBedCue.currentScene, null);
  assert.equal(bedCueBadge, 'BED: rank_card');

  await $('window.__audioLab.testScene(null)');
  const afterClear = await $('window.__audioLab.state()');
  assert.equal(afterClear.currentBed, null);
  assert.equal(afterClear.currentScene, null);

  await $('document.querySelector("[data-app-event=\\"sigkill\\"]").click()');
  const afterEvent = await $('window.__audioLab.state()');
  const logCount = await $('document.querySelectorAll(".al-log li").length');
  assert.ok(afterEvent.recentCues.some((c) => c.startsWith('play -> ')));
  assert.ok(logCount >= 3);

  assert.equal(browser.problems.length, 0, `unexpected browser problems: ${browser.problems.join(' | ')}`);
  console.log(`audio-lab smoke OK (${initial.sfxCount} SFX, ${initial.musicCount} music, bed=${afterScene.currentBed})`);
} finally {
  await browser.close();
  await vite.close();
}
