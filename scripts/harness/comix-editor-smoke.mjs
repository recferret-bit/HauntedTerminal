#!/usr/bin/env node
// Drives the Comix Editor (/comix-editor) in headless Chrome and verifies the full connected workflow:
//   1. Loads intro (3 pages) and outro (2 pages) with writable dev API
//   2. Opens every Comix tab and every Page tab with zero console/page errors
//   3. Clicks a panel in the 2D Page Layout Mini-Map and verifies live /cinematic.html iframe freeze-frame
//   4. Runs the 60fps Timeline Verifier from the Check tab on both sequences
//   5. Edits a field -> dirty mark + localStorage draft -> reverts cleanly
//   6. Catches an unknown/misspelled key injected via the JSON tab
//   7. Detects external edits on disk, refuses a stale 409 save, and reloads cleanly
//   8. Proves API saves are byte-for-byte lossless and unsafe writes are rejected
//
//   node scripts/harness/comix-editor-smoke.mjs
//   node scripts/harness/comix-editor-smoke.mjs --url http://localhost:5173
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, sleep } from './lib/browser.mjs';
import { comixDir, listComixIds, readComix } from './lib/comix-compile.mjs';
import { parseArgs, projectRoot, startPageServer } from './lib/load.mjs';

const args = parseArgs(process.argv.slice(2), ['--url', '--width', '--height']);
const outShot = (name) => resolve(projectRoot, 'scripts/harness/out', `comix-editor-${name}.png`);
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

const slugs = listComixIds();
const intro = readComix('intro');
let vite = null;
let base = args.val('--url');
if (!base) ({ vite, base } = await startPageServer(5344, { hmr: false, watch: null }));
base = base.replace(/\/$/, '');

const vpWidth = Number(args.val('--width', 1600));
const vpHeight = Number(args.val('--height', 960));
const browser = await launchBrowser({
  width: vpWidth,
  height: vpHeight,
});
const $ = (expr) => browser.evaluate(expr);
const clickText = (selector, text) =>
  $(`(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const el = els.find((e) => e.textContent.includes(${JSON.stringify(text)}));
    if (!el) return false;
    el.click();
    return true;
  })()`);
const dragBy = (selector, dx, dy) =>
  $(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const sx = r.left + r.width / 2;
    const sy = r.top + r.height / 2;
    const mk = (type, x, y, btns) => new PointerEvent(type, {
      pointerId: 1, button: 0, buttons: btns, clientX: x, clientY: y, bubbles: true, cancelable: true,
    });
    el.dispatchEvent(mk('pointerdown', sx, sy, 1));
    window.dispatchEvent(mk('pointermove', sx + ${dx}, sy + ${dy}, 1));
    window.dispatchEvent(mk('pointerup', sx + ${dx}, sy + ${dy}, 0));
    return true;
  })()`);

try {
  // 1. Load /comix-editor on intro
  await browser.open(`${base}/comix-editor/intro/manifest`);
  await browser.waitFor('Boolean(window.__comixEditor && window.__comixEditor.ready)', 20000, 'comix editor boot');
  await browser.waitFor(
    "Boolean(document.querySelector('.pv-frame')?.contentWindow?.__cinematic?.currentPanel)",
    20000,
    'initial comix preview frame',
  );
  check(
    (await $("document.querySelectorAll('.ed-item').length")) === intro.pages.length + 1,
    `sidebar lists Comix & Stage + ${intro.pages.length} connected pages for intro`,
  );
  check(
    !(await $("document.querySelector('.ed-status').textContent.includes('READ-ONLY')")),
    'comix editor is writable on dev server',
  );
  check(
    (await $("document.querySelector('.pv-frame').contentDocument?.querySelectorAll('.htc-controls').length ?? 0")) === 0,
    'embedded editor preview omits duplicate in-page PAUSE/SKIP overlay',
  );
  const layoutGeo = await $(`(() => {
    const side = document.querySelector('.ed-side').getBoundingClientRect();
    const stage = document.querySelector('.cx-stage').getBoundingClientRect();
    const main = document.querySelector('.ed-main').getBoundingClientRect();
    const frame = document.querySelector('.pv-frame').getBoundingClientRect();
    return { sideRight: side.right, stageLeft: stage.left, stageRight: stage.right, mainLeft: main.left, frameW: frame.width, frameH: frame.height };
  })()`);
  const minFitW = Math.min(600, Math.round((vpWidth - 660) * 0.85));
  check(
    layoutGeo.sideRight <= layoutGeo.stageLeft + 1 && layoutGeo.stageRight <= layoutGeo.mainLeft + 1 && layoutGeo.frameW >= minFitW,
    `center viewport is larger and flanked by side & inspector (${Math.round(layoutGeo.frameW)}x${Math.round(layoutGeo.frameH)})`,
  );
  const topInfo = await $(`(() => {
    const top = document.querySelector('.ed-top');
    const cs = getComputedStyle(top);
    const txt = top.textContent || '';
    return {
      overflowX: cs.overflowX,
      scrollW: top.scrollWidth,
      clientW: top.clientWidth,
      hasRedirects: document.querySelectorAll('.ed-top a[href]').length > 0 || txt.includes('Chapter Editor') || txt.includes('Player ↗'),
    };
  })()`);
  check(
    !topInfo.hasRedirects && topInfo.overflowX === 'hidden' && topInfo.scrollW <= topInfo.clientW + 1,
    `header has no redirect links and no horizontal scroll (${topInfo.scrollW}/${topInfo.clientW}px)`,
  );
  await browser.shoot(outShot('01-manifest'));

  // 2. Walk every sequence, target, and tab
  for (const slug of slugs) {
    const data = readComix(slug);
    await $(`window.__comixEditor.select({ slug: ${JSON.stringify(slug)}, target: 'manifest', tab: 'manifest' })`);
    for (const tab of ['Manifest', 'Stage & Set', 'Cast', 'JSON', 'Check']) {
      await clickText('.ed-tab', tab);
      const hasBody = await $("document.querySelector('.ed-pane').children.length > 0");
      if (!hasBody) check(false, `${slug} / manifest / ${tab} rendered`);
    }
    for (const page of data.pages) {
      await $(`window.__comixEditor.select({ slug: ${JSON.stringify(slug)}, target: ${JSON.stringify(page.spec.id)}, tab: 'overview' })`);
      for (const tab of ['Overview & Cues', 'Panels & Camera', 'Letters', 'Beats & Tracks', 'JSON', 'Check']) {
        await clickText('.ed-tab', tab);
        const hasBody = await $("document.querySelector('.ed-pane').children.length > 0");
        if (!hasBody) check(false, `${slug} / ${page.spec.id} / ${tab} rendered`);
      }
    }
    // 60fps simulation button inside Check tab
    await clickText('button', 'Simulate 60fps Timeline');
    const simText = await $("document.querySelector('.ed-pane').textContent");
    check(simText.includes('Simulated') && simText.includes('0 errors'), `60fps simulator passes in UI for ${slug}`);
  }
  await browser.shoot(outShot('03-check'));
  check(
    browser.problems.length === 0,
    `zero console/page errors across all sequences, pages, and tabs${browser.problems.length ? `: ${browser.problems[0]}` : ''}`,
  );

  // 3. 2D Page Layout Mini-Map + live /cinematic.html freeze preview
  await $(`window.__comixEditor.select({ slug: 'intro', target: 'page-01-desk-storm', tab: 'panels' })`);
  const boxCount = await $("document.querySelectorAll('.layout-box').length");
  check(boxCount === 6, 'Panels & Camera tab renders 3 landscape + 3 portrait panel boxes on page 1');
  await clickText('.layout-box', 'tower_strike');
  await browser.waitFor(
    "Boolean(document.querySelector('.pv-frame').contentWindow?.__cinematic?.currentPanel === 'tower_strike')",
    20000,
    'iframe freeze-frame on tower_strike',
  );
  const pvStatus = await $("document.querySelector('.pv-status').textContent");
  const activeUi = await $(`(() => ({
    boxActive: Boolean(document.querySelector('.layout-box[data-panel-id="tower_strike"].is-active')),
    chipActive: Boolean(document.querySelector('.chip[data-panel-chip="tower_strike"].is-active')),
    freezePrimary: [...document.querySelectorAll('.pv-bar .btn')].find((b) => b.textContent.includes('Freeze'))?.classList.contains('primary') ?? false,
  }))()`);
  check(
    pvStatus.includes('tower_strike') && activeUi.boxActive && activeUi.chipActive && activeUi.freezePrimary,
    `clicking a mini-map panel freezes live 3D preview & highlights active box/chip (${pvStatus})`,
  );
  await browser.shoot(outShot('02-panels'));

  // 3b. In-place rapid timeline scrubbing (no iframe/WebGL reallocation) + Portrait viewport toggle
  const srcBeforeScrub = await $("document.querySelector('.pv-frame').src");
  await $(`(() => {
    const slider = document.querySelector('.comix-scrub input[type=range]');
    for (let i = 1; i <= 25; i++) {
      slider.value = String((i * 1.1).toFixed(2));
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
    slider.value = '27.50';
    slider.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await browser.waitFor(
    "Boolean(document.querySelector('.pv-frame').contentWindow?.__cinematic?.currentPanel === 'new_management')",
    10000,
    'in-place scrub to new_management',
  );
  const srcAfterScrub = await $("document.querySelector('.pv-frame').src");
  check(srcBeforeScrub === srcAfterScrub, 'rapid scrubber seeks in place without reloading /cinematic.html WebGL iframe');

  await clickText('.pv-bar .btn', 'Portrait');
  await sleep(150);
  const portraitDims = await $("(() => { const r = document.querySelector('.pv-frame').getBoundingClientRect(); return { w: r.width, h: r.height, st: document.querySelector('.pv-status').textContent }; })()");
  check(
    portraitDims.h > portraitDims.w && portraitDims.st.includes('portrait'),
    `Portrait toggle switches preview iframe to portrait aspect (${Math.round(portraitDims.w)}x${Math.round(portraitDims.h)})`,
  );
  await clickText('.pv-bar .btn', 'Landscape');
  await sleep(100);

  // 3c. Page 3 navigation automatically jumps past Page 2's page-turn transition
  await $(`window.__comixEditor.select({ slug: 'intro', target: 'page-03-upload-vortex', tab: 'letters' })`);
  await browser.waitFor(
    "Boolean(document.querySelector('.pv-frame').contentWindow?.__cinematic?.currentPanel === 'human_upload')",
    10000,
    'page 3 preview jump',
  );
  await sleep(120);
  const p3State = await $(`(() => {
    const doc = document.querySelector('.pv-frame').contentDocument;
    const pages = doc ? [...doc.querySelectorAll('.htc-page')] : [];
    return {
      t: window.__comixEditor.state().previewTime,
      p2Hidden: pages[1]?.classList.contains('htc-hidden') ?? false,
    };
  })()`);
  check(p3State.t >= 32.6 && p3State.p2Hidden, `selecting Page 3 jumps past turn (${p3State.t}s) so Page 2 is hidden`);
  await browser.shoot(outShot('05-page3'));

  // 3d. Every UI dock hidable/showable + Focus Mode + floating restore pill
  const dockChecks = [
    ['left', '.ed-side'],
    ['right', '.ed-main'],
    ['timeline', '.cx-timeline'],
    ['jumps', '.comix-jumps'],
    ['stagebar', '.cx-stage-bar'],
    ['top', '.ed-top'],
  ];
  let allDocksToggled = true;
  for (const [dock, sel] of dockChecks) {
    await $(`window.__comixEditor.toggleDock(${JSON.stringify(dock)})`);
    const hidden = await $(`document.querySelector(${JSON.stringify(sel)}).offsetParent === null`);
    await $(`window.__comixEditor.toggleDock(${JSON.stringify(dock)})`);
    const shown = await $(`document.querySelector(${JSON.stringify(sel)}).offsetParent !== null`);
    if (!hidden || !shown) {
      allDocksToggled = false;
      console.log(`   dock toggle failed for ${dock}: hidden=${hidden}, shown=${shown}`);
    }
  }
  check(allDocksToggled, 'every editor UI dock/bar (left, right, timeline, jumps, stagebar, top) can hide and show');

  await $('window.__comixEditor.toggleZen()');
  await sleep(180);
  const zenState = await $(`(() => {
    const f = document.querySelector('.pv-frame').getBoundingClientRect();
    const pill = document.querySelector('.cx-restore-pill');
    const topHidden = document.querySelector('.ed-top').offsetParent === null;
    return { frameW: f.width, pillVisible: Boolean(pill && pill.offsetParent !== null), topHidden };
  })()`);
  const minZenW = Math.min(1350, Math.round(vpWidth * 0.85));
  check(
    zenState.topHidden && zenState.pillVisible && zenState.frameW > minZenW && zenState.frameW > layoutGeo.frameW + 200,
    `Focus mode hides all chrome, expands viewport (${Math.round(zenState.frameW)}px), and shows restore pill`,
  );
  await browser.shoot(outShot('04-focus-zoom'));
  await clickText('.cx-restore-btn', 'Restore UI');
  await sleep(150);
  const restored = await $("document.querySelector('.ed-top').offsetParent !== null && document.querySelector('.ed-side').offsetParent !== null && document.querySelector('.ed-main').offsetParent !== null");
  check(restored, 'Restore UI pill brings back all editor docks');

  // 3e. Page Canvas Zoom (1.0 vs 1.5 vs Fit)
  await $('window.__comixEditor.setPageZoom(1.0)');
  await sleep(60);
  const w10 = await $("document.querySelector('.pv-frame').getBoundingClientRect().width");
  await $('window.__comixEditor.setPageZoom(1.5)');
  await sleep(60);
  const w15 = await $("document.querySelector('.pv-frame').getBoundingClientRect().width");
  await $("window.__comixEditor.setPageZoom('fit')");
  await sleep(60);
  const wFit = await $("({ w: document.querySelector('.pv-frame').getBoundingClientRect().width, mat: document.querySelector('.cx-stage-mat').clientWidth })");
  check(
    w15 / Math.max(1, w10) > 1.45 && w15 / Math.max(1, w10) < 1.55 && wFit.w <= wFit.mat,
    `Page zoom scales frame cleanly (${Math.round(w10)}px -> ${Math.round(w15)}px, fit=${Math.round(wFit.w)}px)`,
  );

  // 3f. 3D Scene Camera Zoom, Pan & Apply Shot
  await $(`window.__comixEditor.select({ slug: 'intro', target: 'page-01-desk-storm', tab: 'panels' })`);
  await $('window.__comixEditor.jumpTo(12.55)');
  await browser.waitFor(
    "Boolean(document.querySelector('.pv-frame').contentWindow?.__cinematic?.currentPanel === 'tower_strike')",
    10000,
    'tower_strike freeze for scene zoom',
  );
  const shotBefore = await $("document.querySelector('.pv-frame').contentWindow.__cinematic.effectiveShot()");
  await $('window.__comixEditor.setSceneView({ zoom: 2, panX: 0.5, panY: -0.2 })');
  await sleep(80);
  const shotAfter = await $("document.querySelector('.pv-frame').contentWindow.__cinematic.effectiveShot()");
  check(
    Boolean(shotBefore && shotAfter) && Math.abs(shotAfter.w - shotBefore.w / 2) < 0.05 && Math.abs(shotAfter.x - (shotBefore.x + 0.5)) < 0.05,
    `3D scene zoom & pan adjusts orthographic camera (${shotBefore?.w} -> ${shotAfter?.w} wide)`,
  );
  const applied = await $('window.__comixEditor.applySceneShot()');
  const dirtyAfterApply = await $('window.__comixEditor.state().dirty.length > 0 && window.__comixEditor.state().sceneZoom === 1');
  check(applied && dirtyAfterApply, 'Apply Shot writes framed 3D camera back to panel spec and resets scene view');
  await clickText('.ed-top .btn', 'Revert');
  await sleep(80);

  // Animated camera.to + Portrait camera.portrait Apply Shot routing
  await $('window.__comixEditor.jumpTo(5.5)');
  await browser.waitFor(
    "Boolean(document.querySelector('.pv-frame').contentWindow?.__cinematic?.currentPanel === 'desk_typing')",
    10000,
    'desk_typing late-span freeze',
  );
  await $('window.__comixEditor.setSceneView({ zoom: 1.5, panX: 0.3, panY: 0 })');
  await $('window.__comixEditor.applySceneShot()');
  const appliedToStatus = await $("document.querySelector('.ed-status').textContent");
  check(appliedToStatus.includes('camera.to'), `Apply Shot near end of animated span updates camera.to (${appliedToStatus})`);
  await clickText('.ed-top .btn', 'Revert');
  await sleep(60);

  await $('window.__comixEditor.jumpTo(12.55)');
  await clickText('.pv-bar .btn', 'Portrait');
  await sleep(140);
  await $('window.__comixEditor.setSceneView({ zoom: 1, panX: 0, panY: 30 })');
  await sleep(60);
  const portraitPanClamped = await $("Math.abs(document.querySelector('.pv-frame').contentWindow.__cinematic.sceneView().panY) < 6");
  check(portraitPanClamped, 'tall Portrait panel clamps vertical 3D scene pan so the room never escapes off-screen');
  await $('window.__comixEditor.resetSceneView()');
  await $('window.__comixEditor.setSceneView({ zoom: 1.4, panX: 0, panY: 0.1 })');
  await $('window.__comixEditor.applySceneShot()');
  const appliedPortraitStatus = await $("document.querySelector('.ed-status').textContent");
  check(appliedPortraitStatus.includes('camera.portrait'), `Apply Shot in Portrait mode writes camera.portrait without clobbering landscape (${appliedPortraitStatus})`);
  await clickText('.pv-bar .btn', 'Landscape');
  await clickText('.ed-top .btn', 'Revert');
  await sleep(100);

  // Wall-clamp overshoot protection: panning far past wall clamps panX so reversing direction responds immediately
  await $('window.__comixEditor.setSceneView({ zoom: 2, panX: 25, panY: 0 })');
  await sleep(60);
  const clampedAtWall = await $("({ sv: document.querySelector('.pv-frame').contentWindow.__cinematic.sceneView(), shot: document.querySelector('.pv-frame').contentWindow.__cinematic.effectiveShot() })");
  await $(`window.__comixEditor.setSceneView({ zoom: 2, panX: ${clampedAtWall.sv.panX - 0.2}, panY: 0 })`);
  await sleep(60);
  const reversedShot = await $("document.querySelector('.pv-frame').contentWindow.__cinematic.effectiveShot()");
  check(
    Math.abs(clampedAtWall.sv.panX) < 4.5 && Math.abs(reversedShot.x - (clampedAtWall.shot.x - 0.2)) < 0.06,
    `3D scene pan clamps at room wall (${clampedAtWall.sv.panX.toFixed(2)}) with zero dead-zone on reverse (${clampedAtWall.shot.x} -> ${reversedShot.x})`,
  );
  await $('window.__comixEditor.resetSceneView()');

  // 3g. Splitter resizing, drag-to-float UI panels, side-slot swapping & Reset Layout
  const stageBeforeFloat = await $("document.querySelector('.cx-stage').getBoundingClientRect().width");
  await dragBy('.cx-split-left', 68, 0);
  await dragBy('.cx-split-right', -50, 0);
  await dragBy('.cx-split-bottom', 0, -40);
  const splitSizes = await $('window.__comixEditor.state().layout');
  check(
    splitSizes.leftWidth > 280 && splitSizes.rightWidth > 460 && (splitSizes.bottomHeight ?? 0) > 140,
    `dock splitters resize left (${splitSizes.leftWidth}px), right (${splitSizes.rightWidth}px), and bottom (${splitSizes.bottomHeight}px)`,
  );
  await dragBy('[data-drag-grip="left"]', 240, 80);
  await sleep(80);
  const floatInfo = await $(`(() => {
    const side = document.querySelector('.ed-side');
    return {
      slot: window.__comixEditor.state().layout.slots.left,
      pos: getComputedStyle(side).position,
      stageW: document.querySelector('.cx-stage').getBoundingClientRect().width,
    };
  })()`);
  check(
    floatInfo.slot === 'float' && floatInfo.pos === 'fixed' && floatInfo.stageW > stageBeforeFloat + 100,
    `dragging grip undocks Pages to floating window and expands stage (${Math.round(floatInfo.stageW)}px)`,
  );
  const floatWBefore = await $('window.__comixEditor.state().layout.floats.left.w');
  await dragBy('.ed-side .cx-fr-w', -40, 0);
  const floatWAfter = await $('window.__comixEditor.state().layout.floats.left.w');
  check(floatWAfter > floatWBefore + 20, `floating panel West edge resizes cleanly (${floatWBefore}px -> ${floatWAfter}px)`);
  await $("window.__comixEditor.dockPanel('left', 'right')");
  await sleep(80);
  const swapped = await $(`(() => {
    const l = window.__comixEditor.state().layout.slots;
    const s = document.querySelector('.ed-side').getBoundingClientRect();
    const m = document.querySelector('.ed-main').getBoundingClientRect();
    return l.left === 'right' && l.right === 'left' && s.left > m.right - 2;
  })()`);
  check(swapped, 'Pages and Inspector panels can swap between left and right dock slots');
  await clickText('.cx-view-btn', 'Layout');
  await sleep(120);
  const afterReset = await $('window.__comixEditor.state().layout');
  check(
    afterReset.slots.left === 'left' && afterReset.slots.right === 'right' && afterReset.slots.timeline === 'bottom' && afterReset.leftWidth === 232,
    'Reset Layout snaps all floating/swapped panels back to default dock slots and widths',
  );

  // Float Inspector -> move Pages right -> redock Inspector preserves each panel's width + splitter dblclick after swap
  await $("window.__comixEditor.undockPanel('right')");
  await $("document.querySelector('[data-drag-grip=\"right\"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true }))");
  const floatInspResized = await $('window.__comixEditor.state().layout.floats.right.w > 430');
  await $("window.__comixEditor.dockPanel('left', 'right')");
  await $("window.__comixEditor.dockPanel('right')");
  const afterFloatSwap = await $('window.__comixEditor.state().layout');
  check(
    floatInspResized && afterFloatSwap.leftWidth === 232 && afterFloatSwap.rightWidth === 430,
    `floating Alt+Arrow resize & float->move->redock preserves Pages (${afterFloatSwap.leftWidth}px) and Inspector (${afterFloatSwap.rightWidth}px) widths`,
  );
  await $("window.__comixEditor.dockPanel('right', 'left')");
  await $("window.__comixEditor.setSplitSize('left', 510)");
  await $("document.querySelector('.cx-split-left').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))");
  const resetSwappedLeft = await $('window.__comixEditor.state().layout.leftWidth');
  check(resetSwappedLeft === 430, `double-clicking left splitter while Inspector occupies left slot resets to 430px (got ${resetSwappedLeft}px)`);
  await clickText('.cx-view-btn', 'Layout');
  await sleep(80);

  // 3h. Direct Comix View resize via frame corner, left-edge & top-edge handles + keyboard resize
  const vBefore = await $('window.__comixEditor.state().viewportSize');
  await dragBy('.cx-vr-se', -70, -40);
  await sleep(60);
  const vAfter = await $('window.__comixEditor.state().viewportSize');
  await dragBy('.cx-vr-w', 30, 0);
  await sleep(60);
  const vAfterWest = await $('window.__comixEditor.state().viewportSize');
  await dragBy('.cx-vr-n', 0, 20);
  await sleep(60);
  const vAfterNorth = await $('window.__comixEditor.state().viewportSize');
  await $("document.querySelector('.cx-vr-se').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))");
  await sleep(60);
  const vFit = await $('window.__comixEditor.state().viewportSize');
  check(
    vAfter.w < vBefore.w - 40 && vAfterWest.w < vAfter.w - 30 && vAfterNorth.h < vAfterWest.h - 20 && Math.abs(vFit.w - vBefore.w) <= 4,
    `Comix View corner, left & top handles resize viewport (${vBefore.w}x${vBefore.h} -> ${vAfterWest.w}x${vAfterNorth.h}, Fit=${vFit.w}x${vFit.h})`,
  );

  // WAI-ARIA tablist strict ownership + roving keyboard navigation + Browser Back/Forward (popstate)
  await $(`window.__comixEditor.select({ slug: 'intro', target: 'manifest', tab: 'manifest' })`);
  const ariaTablistClean = await $(`(() => ({
    lists: document.querySelectorAll('[role="tablist"]').length,
    nonTabs: document.querySelectorAll('[role="tablist"] > :not([role="tab"])').length,
  }))()`);
  check(ariaTablistClean.lists === 1 && ariaTablistClean.nonTabs === 0, 'WAI-ARIA [role="tablist"] owns only [role="tab"] children');
  await $("document.getElementById('cx-tab-manifest').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))");
  const tabAfterArrow = await $('window.__comixEditor.state().tab');
  check(tabAfterArrow === 'stage', `roving ARIA tablist ArrowRight switches tab to ${tabAfterArrow}`);

  await $(`window.__comixEditor.select({ slug: 'intro', target: 'page-01-desk-storm', tab: 'overview' })`);
  await $(`window.__comixEditor.select({ slug: 'intro', target: 'page-01-desk-storm', tab: 'panels' })`);
  await $('history.back()');
  await browser.waitFor("window.__comixEditor.state().tab === 'overview'", 5000, 'history.back() to overview tab');
  await $('history.back()');
  await browser.waitFor("window.__comixEditor.state().target === 'manifest'", 5000, 'history.back() to manifest target');
  await $('history.forward()');
  await browser.waitFor("window.__comixEditor.state().target === 'page-01-desk-storm'", 5000, 'history.forward() back to page-01');
  check(true, 'Browser Back/Forward (popstate + pushState) navigates across editor targets and tabs');

  // 3i. Interactive 2D Comic Panel drag/resize on Landscape sheet
  await $(`window.__comixEditor.select({ slug: 'intro', target: 'page-01-desk-storm', tab: 'panels' })`);
  await sleep(60);
  const readBox = () => $(`(() => {
    const r = document.querySelector('[data-sheet-mode="landscape"] .layout-box[data-panel-id="desk_typing"]').getBoundingClientRect();
    return { w: r.width, h: r.height };
  })()`);
  const boxBefore = await readBox();
  await dragBy('[data-sheet-mode="landscape"] .layout-box-se[data-panel-resize="desk_typing"]', -30, -20);
  await sleep(80);
  const boxAfter = await readBox();
  const boxDirty = await $("window.__comixEditor.state().dirty.length > 0");
  check(
    boxDirty && boxAfter.w < boxBefore.w - 15 && boxAfter.h < boxBefore.h - 10,
    `2D sheet corner handle resizes comic panel rect live (${Math.round(boxBefore.w)}x${Math.round(boxBefore.h)} -> ${Math.round(boxAfter.w)}x${Math.round(boxAfter.h)})`,
  );
  const boxLeftBefore = await $("document.querySelector('[data-sheet-mode=\"landscape\"] .layout-box[data-panel-id=\"desk_typing\"]').style.left");
  await $("document.querySelector('[data-sheet-mode=\"landscape\"] .layout-box[data-panel-id=\"desk_typing\"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true }))");
  const boxLeftAfter = await $("document.querySelector('[data-sheet-mode=\"landscape\"] .layout-box[data-panel-id=\"desk_typing\"]').style.left");
  check(boxLeftBefore !== boxLeftAfter, `2D sheet Alt+ArrowRight nudges comic panel position (${boxLeftBefore} -> ${boxLeftAfter})`);
  await clickText('.ed-top .btn', 'Revert');
  await sleep(100);

  // 3j. Bidirectional element selection: 2D letter -> Inspector, 3D actor -> Cast, 3D prop -> Stage, Inspector -> Seek + Focus
  const clickFramePoint = (x, y) =>
    $(`(() => {
      const doc = document.querySelector('.pv-frame')?.contentDocument;
      const host = doc?.getElementById('host');
      if (!host) return false;
      host.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, button: 0, buttons: 1, clientX: ${x}, clientY: ${y}, bubbles: true, cancelable: true }));
      host.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, button: 0, buttons: 0, clientX: ${x}, clientY: ${y}, bubbles: true, cancelable: true }));
      return true;
    })()`);

  await $(`window.__comixEditor.select({ slug: 'intro', target: 'manifest', tab: 'manifest' })`);
  await $(`window.__comixEditor.jumpTo(0.8)`);
  await browser.waitFor(
    "Boolean(document.querySelector('.pv-frame')?.contentDocument?.querySelector('[data-comix-sel-kind=\"letter\"]'))",
    10000,
    'visible 2D letter in intro freeze frame',
  );
  // Test picking a visible 2D letter via real pointer click in viewport while Right Inspector is collapsed
  await $(`(() => { if (window.__comixEditor.state().docks.right) window.__comixEditor.toggleDock('right'); })()`);
  const letterPt = await $(`(() => {
    const doc = document.querySelector('.pv-frame').contentDocument;
    const nodes = [...doc.querySelectorAll('[data-comix-sel-kind="letter"]')];
    const el = nodes.find((n) => {
      const s = doc.defaultView.getComputedStyle(n);
      const r = n.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.1 && r.width > 12 && r.height > 10;
    });
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5, letterKind: el.dataset.comixLetterKind || '' };
  })()`);
  check(Boolean(letterPt), 'found visible 2D letter hitbox in preview viewport');
  if (letterPt) {
    await clickFramePoint(letterPt.x, letterPt.y);
    await browser.waitFor(
      "window.__comixEditor.state().selectedElement?.kind === 'letter' && window.__comixEditor.state().docks.right === true",
      5000,
      'viewport 2D letter click selects letter and reopens Right Inspector',
    );
    const lState = await $(`(() => {
      const st = window.__comixEditor.state();
      const doc = document.querySelector('.pv-frame').contentDocument;
      const box = doc.querySelector('.htc-sel-box');
      const r = box?.getBoundingClientRect();
      return {
        target: st.target,
        tab: st.tab,
        pill: document.querySelector('.cx-sel-pill')?.textContent || '',
        openSel: Boolean(document.querySelector('.ed-pane details.item.is-selected[open]')),
        boxW: r?.width ?? 0,
        boxH: r?.height ?? 0,
      };
    })()`);
    check(
      lState.target === 'page-01-desk-storm' && lState.tab === 'letters' && lState.openSel && (!letterPt.letterKind || lState.pill.includes(letterPt.letterKind)) && lState.boxW > 8 && lState.boxH > 8,
      `2D letter click highlights viewport (${Math.round(lState.boxW)}x${Math.round(lState.boxH)}) and opens Inspector Letters tab`,
    );
  }

  // Test 3D Cast actor picking via raycast in intro
  await $(`window.__comixEditor.selectElement({ kind: 'actor', actorId: 'hero', itemPath: 'manifest.cast.cast[0]', label: 'actor:hero' })`);
  await sleep(80);
  const heroBox = await $(`(() => {
    const r = document.querySelector('.pv-frame').contentDocument.querySelector('.htc-sel-box')?.getBoundingClientRect();
    return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  })()`);
  check(Boolean(heroBox && heroBox.w > 10 && heroBox.h > 10), 'actor marquee renders valid 3D projected bounds');
  if (heroBox) {
    await $(`window.__comixEditor.selectElement(null)`);
    let pickedActor = null;
    for (const fy of [0.45, 0.3, 0.65, 0.2, 0.78]) {
      for (const fx of [0.5, 0.35, 0.65]) {
        const px = heroBox.x + heroBox.w * fx;
        const py = heroBox.y + heroBox.h * fy;
        await $(`window.__comixEditor.selectElement(null)`);
        const hit = await $(`window.__comixEditor.pickViewportElement(${px}, ${py})`);
        if (hit && hit.kind === 'actor' && hit.actorId === 'hero') {
          await $(`window.__comixEditor.selectElement(null)`);
          await clickFramePoint(px, py);
          await sleep(60);
          pickedActor = await $(`(() => ({
            sel: window.__comixEditor.state().selectedElement,
            tab: window.__comixEditor.state().tab,
            target: window.__comixEditor.state().target,
            openCast: Boolean(document.querySelector('.ed-pane details[data-item-path="manifest.cast.cast[0]"].is-selected[open]')),
            hasBox: Boolean(document.querySelector('.pv-frame').contentDocument.querySelector('.htc-sel-box')),
          }))()`);
          break;
        }
      }
      if (pickedActor) break;
    }
    check(
      Boolean(pickedActor && pickedActor.target === 'manifest' && pickedActor.tab === 'cast' && pickedActor.openCast && pickedActor.hasBox),
      '3D cast actor click raycasts hero, opens Cast tab, expands actor[0], and highlights 3D bounds',
    );
    await browser.shoot(outShot('selection'));
  }

  // Test 3D Stage prop picking via raycast in outro (chair)
  await $(`window.__comixEditor.select({ slug: 'outro', target: 'manifest', tab: 'manifest' })`);
  await $(`window.__comixEditor.jumpTo(0.3)`);
  await browser.waitFor(
    "(() => { const c = document.querySelector('.pv-frame')?.contentWindow?.__cinematic; return Boolean(c && c.which === 'outro' && (c.paused || c.frozen) && c.currentPanel); })()",
    15000,
    'outro preview frozen at 0.3s',
  );
  await $(`window.__comixEditor.selectElement({ kind: 'prop', propId: 'chair', itemPath: 'manifest.stage.stage.props[0]', label: 'prop:chair' })`);
  await sleep(80);
  const propBox = await $(`(() => {
    const r = document.querySelector('.pv-frame').contentDocument.querySelector('.htc-sel-box')?.getBoundingClientRect();
    return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  })()`);
  let pickedProp = null;
  if (propBox && propBox.w > 6) {
    for (const fy of [0.5, 0.3, 0.7]) {
      for (const fx of [0.5, 0.25, 0.75]) {
        const px = propBox.x + propBox.w * fx;
        const py = propBox.y + propBox.h * fy;
        await $(`window.__comixEditor.selectElement(null)`);
        const hit = await $(`window.__comixEditor.pickViewportElement(${px}, ${py})`);
        if (hit && hit.kind === 'prop' && hit.propId === 'chair') {
          pickedProp = {
            hit,
            tab: await $('window.__comixEditor.state().tab'),
            openProp: await $("Boolean(document.querySelector('.ed-pane details[data-item-path=\"manifest.stage.stage.props[0]\"].is-selected[open]'))"),
            hasBox: await $("Boolean(document.querySelector('.pv-frame').contentDocument.querySelector('.htc-sel-box'))"),
          };
          break;
        }
      }
      if (pickedProp) break;
    }
  }
  check(
    Boolean(pickedProp && pickedProp.tab === 'stage' && pickedProp.openProp && pickedProp.hasBox),
    '3D stage prop click raycasts chair in outro, opens Stage & Set tab, and highlights prop bounds',
  );

  // Test Inspector -> Viewport sync (seeks hidden letter into view and preserves input focus)
  await $(`window.__comixEditor.select({ slug: 'intro', target: 'page-01-desk-storm', tab: 'letters' })`);
  await $(`window.__comixEditor.jumpTo(0.2)`);
  await browser.waitFor(
    "(() => { const c = document.querySelector('.pv-frame')?.contentWindow?.__cinematic; return Boolean(c && c.which === 'intro' && (c.paused || c.frozen) && c.currentPanel); })()",
    15000,
    'intro preview frozen back at 0.2s',
  );
  const inspRes = await $(`(() => {
    const detailsList = [...document.querySelectorAll('.ed-pane .panel-sec details[data-item-path]')];
    const targetDetails = detailsList[detailsList.length - 1];
    if (!targetDetails) return null;
    targetDetails.open = true;
    const inp = targetDetails.querySelector('.item-body input[type="text"], .item-body textarea, .item-body input');
    if (!inp) return null;
    inp.focus();
    inp.click();
    return {
      path: targetDetails.dataset.itemPath,
      focusedKept: document.activeElement === inp,
      isSelected: targetDetails.classList.contains('is-selected'),
    };
  })()`);
  await browser.waitFor(
    "window.__comixEditor.state().previewTime > 1.0 && Boolean(document.querySelector('.pv-frame')?.contentDocument?.querySelector('.htc-sel-box'))",
    10000,
    'inspector selection seeks hidden letter into view and shows marquee',
  );
  check(
    Boolean(inspRes && inspRes.focusedKept && inspRes.isSelected && (await $('window.__comixEditor.state().selectedElement?.itemPath')) === inspRes.path),
    'Inspector item input click preserves focus, seeks viewport to letter window, and renders marquee',
  );
  await $(`window.__comixEditor.selectElement(null)`);

  // 4. Edit field + defaultTrue checkbox -> dirty dot -> localStorage draft -> revert
  await $(`window.__comixEditor.select({ slug: 'intro', target: 'manifest', tab: 'cast' })`);
  await $("document.querySelector('.ed-pane details.item summary').click()");
  const heroVisibleChecked = await $(`(() => {
    const labels = [...document.querySelectorAll('.ed-pane details.item label.check')];
    const lbl = labels.find((l) => l.textContent.includes('Visible at t = 0'));
    const cb = lbl?.querySelector('input[type=checkbox]');
    if (!cb) return null;
    const initial = cb.checked;
    cb.checked = false;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    return initial;
  })()`);
  await clickText('.ed-tab', 'JSON');
  const castJsonAfterUncheck = await $("JSON.parse(document.querySelector('.ed-pane textarea.json').value).cast[0].visible");
  check(heroVisibleChecked === true && castJsonAfterUncheck === false, 'unchecking default-true Visible checkbox writes explicit false to JSON');
  await clickText('.ed-top .btn', 'Revert');

  await $(`window.__comixEditor.select({ slug: 'intro', target: 'page-01-desk-storm', tab: 'overview' })`);
  const marker = ' [draft-smoke]';
  await $(`(() => {
    const input = document.querySelector('.ed-pane input[type=text]');
    input.value += ${JSON.stringify(marker)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  check(
    await $("document.querySelector('.ed-item.on .dot') !== null"),
    'editing a page field marks that page dirty in the sidebar',
  );
  await sleep(600);
  check(
    await $(`(localStorage.getItem('ht-comix-draft') || '').includes(${JSON.stringify(marker)})`),
    'live draft pack is written to localStorage for /cinematic.html',
  );
  await clickText('.ed-top .btn', 'Revert');
  check(!(await $("document.querySelector('.ed-item.on .dot')")), 'Revert clears the dirty mark');

  // 5. Unknown key caught via JSON tab
  await clickText('.ed-tab', 'JSON');
  await $(`(() => {
    const area = document.querySelector('.ed-pane textarea.json');
    const obj = JSON.parse(area.value);
    obj.sumary = 'typo';
    area.value = JSON.stringify(obj, null, 2);
    area.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(250);
  await clickText('.ed-tab', 'Check');
  const checkText = await $("document.querySelector('.ed-pane').textContent");
  check(checkText.includes('sumary: unknown field'), 'Check tab catches a misspelled key in page.spec.json');
  await clickText('.ed-top .btn', 'Revert');

  // 6. External disk edit detection + 409 conflict protection + Reload
  const lastPage = intro.pages[intro.pages.length - 1];
  const lastFile = resolve(comixDir, 'intro', lastPage.path);
  const origBytes = readFileSync(lastFile, 'utf8');
  const putComix = (body, headers = { 'content-type': 'application/json' }) =>
    fetch(`${base}/api/comix/intro/file`, { method: 'PUT', headers, body: JSON.stringify(body) });

  try {
    await putComix({ path: lastPage.path, json: { ...lastPage.spec, title: `${lastPage.spec.title} (disk)` } });
    await $("window.dispatchEvent(new Event('focus'))");
    await browser.waitFor(
      "[...document.querySelectorAll('.ed-top .btn')].some((b) => b.textContent.includes('changed on disk'))",
      8000,
      'external change banner',
    );
    check(true, 'editor detects external spec change on disk');

    await $(`window.__comixEditor.select({ slug: 'intro', target: ${JSON.stringify(lastPage.spec.id)}, tab: 'overview' })`);
    await $("(() => { const i = document.querySelector('.ed-pane input[type=text]'); i.value += ' (stale)'; i.dispatchEvent(new Event('input', { bubbles: true })); })()");
    await clickText('.ed-top .btn', 'Save file');
    await browser.waitFor(
      "document.querySelector('.ed-status').textContent.includes('409')",
      8000,
      '409 conflict message',
    );
    const onDisk = readFileSync(lastFile, 'utf8');
    check(
      onDisk.includes('(disk)') && !onDisk.includes('(stale)'),
      'stale save is refused with 409 and disk file is preserved',
    );

    await $('window.confirm = () => true');
    await clickText('.ed-top .btn', 'Reload');
    await browser.waitFor(
      "![...document.querySelectorAll('.ed-top .btn')].some((b) => b.textContent.startsWith('Reload'))",
      8000,
      'reload completion',
    );
    check(true, 'Reload adopts updated spec from disk');
  } finally {
    writeFileSync(lastFile, origBytes);
    await putComix({ path: lastPage.path, json: lastPage.spec });
  }
  check(readFileSync(lastFile, 'utf8') === origBytes, 'page spec restored byte-for-byte after conflict test');

  // 6b. External page addition & deletion on disk while editor is open -> detected & cleanly reloaded
  const manifestDiskFile = resolve(comixDir, 'intro/comix.manifest.json');
  const origManifestBytes = readFileSync(manifestDiskFile, 'utf8');
  const tempPageDir = resolve(comixDir, 'intro/pages/page-04-temp-smoke');
  const tempPageSpec = {
    ...lastPage.spec,
    id: 'page-04-temp-smoke',
    index: intro.pages.length,
    title: 'Temp Smoke Page',
    from: 39.9,
    until: 41.0,
    panels: [{ ...lastPage.spec.panels[0], id: 'temp_smoke_panel', from: '39.9', until: '41.0' }],
  };
  try {
    mkdirSync(tempPageDir, { recursive: true });
    writeFileSync(resolve(tempPageDir, 'page.spec.json'), `${JSON.stringify(tempPageSpec, null, 2)}\n`);
    const nextManifest = structuredClone(intro.manifest);
    nextManifest.durationSec = 41.0;
    nextManifest.pages.push({
      index: intro.pages.length,
      id: 'page-04-temp-smoke',
      title: 'Temp Smoke Page',
      from: 39.9,
      until: 41.0,
      panelCount: 1,
      specPath: 'pages/page-04-temp-smoke/page.spec.json',
    });
    writeFileSync(manifestDiskFile, `${JSON.stringify(nextManifest, null, 2)}\n`);
    await $("window.dispatchEvent(new Event('focus'))");
    await browser.waitFor(
      "[...document.querySelectorAll('.ed-top .btn')].some((b) => b.textContent.includes('changed on disk'))",
      8000,
      'added page banner',
    );
    await clickText('.ed-top .btn', 'Reload');
    await browser.waitFor(
      `document.querySelectorAll('.ed-item').length === ${intro.pages.length + 2}`,
      8000,
      'sidebar lists newly added page',
    );
    await $(`window.__comixEditor.select({ slug: 'intro', target: 'page-04-temp-smoke', tab: 'overview' })`);
    check((await $('window.__comixEditor.state().target')) === 'page-04-temp-smoke', 'Reload picks up newly added connected page on disk');

    // Now delete the temporary page while it is selected, detect deletion, and reload cleanly
    writeFileSync(manifestDiskFile, origManifestBytes);
    rmSync(tempPageDir, { recursive: true, force: true });
    await $("window.dispatchEvent(new Event('focus'))");
    await browser.waitFor(
      "[...document.querySelectorAll('.ed-top .btn')].some((b) => b.textContent.includes('changed on disk'))",
      8000,
      'deleted page banner',
    );
    await clickText('.ed-top .btn', 'Reload');
    await browser.waitFor(
      `document.querySelectorAll('.ed-item').length === ${intro.pages.length + 1} && window.__comixEditor.state().target === 'manifest'`,
      8000,
      'fallback to manifest after page deletion',
    );
    check(true, 'Reload after external page deletion cleans sidebar and falls back from removed page to manifest');
  } finally {
    writeFileSync(manifestDiskFile, origManifestBytes);
    rmSync(tempPageDir, { recursive: true, force: true });
  }

  // 7. Lossless save test across all intro files
  let lossless = true;
  for (const item of [
    { path: 'comix.manifest.json', json: intro.manifest },
    ...intro.pages.map((p) => ({ path: p.path, json: p.spec })),
  ]) {
    const before = readFileSync(resolve(comixDir, 'intro', item.path), 'utf8');
    const res = await putComix(item);
    const after = readFileSync(resolve(comixDir, 'intro', item.path), 'utf8');
    if (!res.ok || before !== after) {
      lossless = false;
      console.log(`   byte diff on save: ${item.path}`);
    }
  }
  check(lossless, 'saving untouched comix manifest and pages through /api/comix writes identical bytes');

  // 8. Security & negative corner-case checks on /api/comix and editor forms/routing
  await $(`window.__comixEditor.select({ slug: 'intro', target: 'manifest', tab: 'stage' })`);
  await sleep(60);
  const stageA11yOk = await $(`(() => {
    const noMultiLabel = [...document.querySelectorAll('.ed-pane label')].every((l) => l.querySelectorAll('input,select,textarea').length <= 1);
    const ptDetails = document.querySelector('.ed-pane details.item');
    if (ptDetails) {
      ptDetails.open = true;
      const keyIn = ptDetails.querySelector('summary input.key');
      keyIn?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    }
    return noMultiLabel && (!ptDetails || ptDetails.open);
  })()`);
  check(stageA11yOk, 'Stage & Set multi-control fields use role=group (<=1 control per <label>) and Space inside summary key input keeps <details> open');

  await $(`window.__comixEditor.select({ slug: 'intro', target: 'page-01-desk-storm', tab: 'beats' })`);
  await sleep(60);
  await $(`(() => {
    const sec = [...document.querySelectorAll('.ed-pane .panel-sec')].find((s) => s.textContent.includes('Page-Wide Continuous Tracks'));
    sec?.querySelector('.add-row button')?.click();
  })()`);
  await $(`window.__comixEditor.select({ slug: 'intro', target: 'page-01-desk-storm', tab: 'overview' })`);
  await sleep(40);
  await $(`window.__comixEditor.selectElement({ kind: 'page_track', pageId: 'page-01-desk-storm', itemIndex: 0, label: 'page-track:0' })`);
  await sleep(60);
  const pageTrackRouted = await $(`window.__comixEditor.state().tab === 'beats' && document.querySelector('.ed-pane details.is-selected')?.dataset.itemPath === 'page-01-desk-storm.tracks.tracks[0]'`);
  check(pageTrackRouted, 'selecting a page_track routes to Beats & Tracks tab and highlights page.tracks.tracks[0]');
  await clickText('.ed-top .btn', 'Revert');
  await sleep(60);

  await $(`window.__comixEditor.select({ slug: 'intro', target: 'page-01-desk-storm', tab: 'json' })`);
  await sleep(50);
  const jsonCornerOk = await $(`(() => {
    const area = document.querySelector('.ed-pane textarea.json');
    const orig = JSON.parse(area.value);
    area.value = '{bad';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    const hadErr = Boolean(document.querySelector('.jsonpane .note.error'));
    area.value = JSON.stringify({ ...orig, id: 'wrong-id', index: 88, title: 'Live JSON Test' });
    area.dispatchEvent(new Event('input', { bubbles: true }));
    return hadErr && window.__comixEditor.state().dirty.some((p) => p.includes('page-01-desk-storm'));
  })()`);
  await clickText('.ed-top .btn', 'Revert');
  await sleep(60);
  check(jsonCornerOk && (await $('window.__comixEditor.state().dirty.length')) === 0, 'live JSON pane handles syntax errors and preserves immutable page id/index');

  const statusOf = async (body, headers) => (await putComix(body, headers)).status;
  check((await statusOf({ path: '../../package.json', json: {} })) === 400, 'API rejects path traversal');
  check((await statusOf({ path: 'marks.json', json: {} })) === 400, 'API rejects legacy disconnected file names');
  check((await statusOf({ path: 'pages/page-99-fake/page.spec.json', json: {} })) === 404, 'API rejects unknown page path');
  check(
    (await statusOf({ path: lastPage.path, json: lastPage.spec }, { 'content-type': 'text/plain' })) === 415,
    'API rejects non-JSON Content-Type (CSRF guard)',
  );
  check(
    (await statusOf({ path: lastPage.path, json: lastPage.spec }, { 'content-type': 'application/json', origin: 'http://evil.example' })) === 403,
    'API rejects cross-origin requests',
  );
  check((await statusOf({ path: lastPage.path, json: lastPage.spec, baseEtag: 'stale-etag' })) === 409, 'API returns 409 on stale baseEtag');
  check((await statusOf({ path: lastPage.path, json: lastPage.spec, baseEtag: 999 })) === 400, 'API rejects non-string baseEtag');
  check((await statusOf({ path: lastPage.path, json: [] })) === 400, 'API rejects array JSON payload');
  check(
    (await fetch(`${base}/api/comix/intro/file`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: 'null' })).status === 400,
    'API returns 400 (never 500) on null top-level JSON body',
  );
  check((await fetch(`${base}/api/comix`, { method: 'POST' })).status === 404, 'API returns 404 on unsupported HTTP methods');
} catch (err) {
  check(false, `smoke script aborted: ${err.message}`);
  await browser.shoot(outShot('error')).catch(() => {});
} finally {
  await browser.close();
  if (vite) await vite.close();
}

if (browser.problems.length) {
  console.log(`page problems:\n  ${browser.problems.slice(0, 6).join('\n  ')}`);
}
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\ncomix editor smoke OK');
process.exit(failures.length ? 1 : 0);
