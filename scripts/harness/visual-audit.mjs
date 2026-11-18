#!/usr/bin/env node
// Visual audit for the qa agent (spec .kiro/specs/qa-visual-audit/). Captures every player-facing screen at four sizes,
// deterministically (seeded Math.random, storm off, the frame frozen by Chrome virtual time), records filmstrips, diffs against the baselines
// in docs/qa/baselines/, runs the detectors, and writes scripts/harness/out/visual/ (PNGs + summary.json).
//
//   node scripts/harness/visual-audit.mjs                         every screen, every size
//   node scripts/harness/visual-audit.mjs --screens hub,level-*   some screens (ids; `*` suffix = prefix); a scoped run keeps
//                                                                 the other screens' files and merges summary.json
//   node scripts/harness/visual-audit.mjs --sizes 1280x820        some sizes
//   node scripts/harness/visual-audit.mjs --seed 7 --no-frames    another seed; skip the real-time motion pass (filmstrips, frame timing)
//   node scripts/harness/visual-audit.mjs --update hub@1600x950   a person approves new baselines (qa's shell denies it)
//   node scripts/harness/visual-audit.mjs --selftest              the self-test on fixture pages
//   --screens-file <json> --base <url> --baselines <dir> --out <dir>  another screen list, server, baseline or output folder
// Exit 0: no flag, no diff, every baseline present. Exit 1: anything to explain. Exit 2: the run itself failed.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { parseArgs, projectRoot, startPageServer } from './lib/load.mjs';
import { captureScreen, FreezeFailed, warmUp } from './lib/visual-capture.mjs';
import { fontFlags, loadPalette, overlapFlags, pixelFlags, viewportFlags } from './lib/visual-detect.mjs';
import { compareImages, contactSheet, decodeImage, DIFF_DEFAULTS, encodeImage, masksFor, motionFlags, readImage } from './lib/visual-diff.mjs';
import { probeMotion } from './lib/visual-frames.mjs';
import { expandScreens, loadChapter, selectScreens, selectSizes, updateMatcher } from './lib/visual-screens.mjs';

const args = parseArgs(process.argv.slice(2), ['--screens', '--sizes', '--seed', '--update', '--chapter', '--out', '--baselines', '--screens-file', '--base']);
if (args.flag('--selftest')) {
  const { runSelftest } = await import('./lib/visual-selftest.mjs');
  process.exit(await runSelftest());
}

const OUT = resolve(projectRoot, args.val('--out', 'scripts/harness/out/visual'));
// The output folder is emptied at the start of a run: it may only be under scripts/harness/out/ or the system temp folder.
if (![realpathSync(resolve(projectRoot, 'scripts/harness/out')), realpathSync(tmpdir())].some((dir) => realOut(OUT).startsWith(dir + sep))) {
  console.error(`visual-audit: --out must be inside scripts/harness/out/ or ${tmpdir()} (it is emptied first), not ${OUT}`);
  process.exit(2);
}
const BASELINES = resolve(projectRoot, args.val('--baselines', 'docs/qa/baselines'));
const doc = JSON.parse(readFileSync(resolve(projectRoot, args.val('--screens-file', 'scripts/harness/visual/screens.json')), 'utf8'));
const masksFile = join(BASELINES, 'masks.json');
const masksDoc = existsSync(masksFile) ? JSON.parse(readFileSync(masksFile, 'utf8')) : {};
const seed = Number(args.val('--seed', doc.seed));
const rel = (f) => relative(projectRoot, f);
/** The real path of `p`, resolving symlinks of its nearest existing ancestor (the folder itself may not exist yet). */
function realOut(p) {
  let head = p;
  while (!existsSync(head)) head = dirname(head);
  return join(realpathSync(head), relative(head, p));
}

/** Run the detectors that need the open page, then close it. */
async function pageFlags(cap, screen, size, page) {
  const [width, height] = size.split('x').map(Number);
  const flags = [];
  cap.data.overflow.forEach((o) => flags.push({ kind: 'text-overflow', ...o }));
  flags.push(...await overlapFlags(cap.browser.evaluate, cap.data.boxes, [...(page.allowOverlap ?? []), ...(screen.allowOverlap ?? [])]));
  flags.push(...viewportFlags(cap.data.boxes, cap.data.page, { width, height, fullPage: cap.fullPage }));
  const fonts = await fontFlags(cap.browser, cap.data.faces, { allowed: doc.fonts, exceptions: screen.fontExceptions ?? [] });
  flags.push(...fonts.flags);
  cap.problems.console.forEach((c) => flags.push({ kind: 'console-error', text: c }));
  cap.problems.network.forEach((n) => flags.push({ kind: 'request-failed', ...n }));
  return { flags, fontsUsed: fonts.used };
}

async function captureWithFallback(opts) {
  try {
    return { cap: await captureScreen(opts), unstable: null };
  } catch (err) {
    if (!(err instanceof FreezeFailed)) throw err;
    return { cap: await captureScreen({ ...opts, freezeFrame: false }), unstable: { kind: 'capture-unstable', reason: err.message } };
  }
}

function baselineFlags(still, screen, size, files, update) {
  const name = `${screen.id}@${size}`;
  const baseFile = join(BASELINES, `${name}.png`);
  if (update) {
    mkdirSync(BASELINES, { recursive: true });
    copyFileSync(files.still, baseFile);
    return { flags: [], diff: { status: 'updated', baseline: rel(baseFile) } };
  }
  if (!existsSync(baseFile)) return { flags: [{ kind: 'no-baseline', baseline: rel(baseFile) }], diff: { status: 'no-baseline' } };
  const r = compareImages(readImage(baseFile), still, {
    masks: masksFor(masksDoc, screen.id, size),
    pixelThreshold: screen.pixelThreshold ?? DIFF_DEFAULTS.pixelThreshold,
    maxDiffRatio: screen.maxDiffRatio ?? DIFF_DEFAULTS.maxDiffRatio,
  });
  if (r.diffImage) {
    files.diff = join(OUT, `${name}-diff.png`);
    writeFileSync(files.diff, encodeImage(r.diffImage));
  }
  const diff = { status: r.status, changed: r.changed, ratio: r.ratio, baseline: rel(baseFile) };
  if (r.status === 'same') return { flags: [], diff };
  return { flags: [{ kind: r.status, ...diff, image: files.diff ? rel(files.diff) : null }], diff };
}

/** Contact sheets and motion flags of the motion pass's filmstrips. */
function filmFlags(strips, screen, name) {
  const flags = [];
  const motion = strips.map((strip, n) => {
    const frames = strip.frames.map(decodeImage);
    const file = join(OUT, `${name}-film-${n + 1}.png`);
    writeFileSync(file, encodeImage(contactSheet(frames)));
    const m = motionFlags(frames, { animates: !!screen.animates, pixelThreshold: screen.pixelThreshold });
    m.flags.forEach((f) => flags.push({ ...f, line: strip.line, image: rel(file) }));
    return { line: strip.line, received: strip.received, changes: m.changes, image: rel(file) };
  });
  return { flags, motion };
}

/** The real-time motion pass of one screen: filmstrips, then frame timing under CPU throttling. */
async function motionOne(base, screen) {
  const size = doc.frameSize;
  const name = `${screen.id}@${size}`;
  try {
    const m = await probeMotion({ base, screen, seed, size });
    const fm = filmFlags(m.strips, screen, name);
    return { screen: screen.id, size, stats: m.stats, motion: fm.motion, flags: [...fm.flags, ...m.flags] };
  } catch (err) {
    return { screen: screen.id, size, stats: null, motion: [], flags: [{ kind: 'frame-probe-failed', error: err.message }] };
  }
}

async function auditOne(base, screen, size, palette, update) {
  const page = doc.pages[screen.page ?? 'play'] ?? {};
  const name = `${screen.id}@${size}`;
  const { cap, unstable } = await captureWithFallback({ base, screen, size, seed, films: false, page });
  const flags = unstable ? [unstable] : [];
  const files = { still: join(OUT, `${name}.png`), diff: null };
  let pf;
  try {
    writeFileSync(files.still, cap.still);
    pf = await pageFlags(cap, screen, size, page);
  } finally {
    await cap.browser.close();
  }
  if (cap.stable === false) flags.push({ kind: 'capture-unstable', reason: 'two screenshots of the frozen frame differ' });
  if (!cap.ready) flags.push({ kind: 'not-ready', ready: screen.ready ?? 'page' });
  if (!cap.reached.ok) flags.push({ kind: 'screen-not-reached', ...cap.reached });
  const still = decodeImage(cap.still);
  const px = pixelFlags(still, palette, screen.maxOffPalette ?? DIFF_DEFAULTS.maxOffPalette);
  const bl = baselineFlags(still, screen, size, files, update);
  flags.push(...pf.flags, ...px.flags, ...bl.flags);
  return {
    screen: screen.id, size, clock: cap.clock, frozen: cap.stable, freezeMethod: cap.freezeMethod, measures: { ...px.measures, fontsUsed: pf.fontsUsed, elements: cap.data.boxes.length, textMarked: cap.data.marked },
    diff: bl.diff, flags,
    files: { still: rel(files.still), diff: files.diff ? rel(files.diff) : null },
  };
}

/**
 * A scoped run (`--screens` or `--sizes`) keeps what earlier runs left in the output folder: it deletes only the files of
 * the captures it redoes, and returns the earlier summary without them, to be merged with this run's results.
 */
function readEarlier(screens, sizes) {
  const redo = new Set(screens.flatMap((s) => sizes.map((z) => `${s.id}@${z}`)));
  const redoScreens = new Set(screens.map((s) => s.id));
  if (existsSync(OUT)) {
    for (const f of readdirSync(OUT)) {
      const m = /^(.+@\d+x\d+)(?:-diff|-film-\d+)?\.png$/.exec(f);
      if (m && redo.has(m[1])) rmSync(join(OUT, f), { force: true });
    }
  }
  const file = join(OUT, 'summary.json');
  if (!existsSync(file)) return { results: [], frames: [] };
  const old = JSON.parse(readFileSync(file, 'utf8'));
  return {
    results: (old.results ?? []).filter((r) => !redo.has(`${r.screen}@${r.size}`)),
    frames: (old.frames ?? []).filter((f) => !redoScreens.has(f.screen)),
  };
}

/** One capture may take its longest `until` step plus three minutes; past that it is capture-failed, never a hang. */
function watchdog(promise, screen) {
  const longest = Math.max(0, ...(screen.steps ?? []).map((s) => (s && typeof s === 'object' ? (s.max ?? 30000) + (s.wait ?? 0) : 30000)));
  const ms = longest + 180000;
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`no result within ${Math.round(ms / 1000)} s`)), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

async function main() {
  const t0 = Date.now();
  const chapter = doc.levels ? loadChapter(projectRoot, args.val('--chapter')) : { id: null, levels: [] };
  const screens = selectScreens(expandScreens(doc, chapter), args.val('--screens'));
  const sizes = selectSizes(doc, args.val('--sizes'));
  const wantsUpdate = updateMatcher(args.val('--update'));
  const scoped = Boolean(args.val('--screens') || args.val('--sizes'));
  const earlier = scoped ? readEarlier(screens, sizes) : null;
  if (!scoped) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const palette = loadPalette(projectRoot);
  const given = args.val('--base');
  const { vite, base } = given ? { vite: null, base: given } : await startPageServer(5420);
  await warmUp(base, screens);
  const results = [];
  const frames = [];
  try {
    for (const screen of screens) {
      for (const size of sizes) {
        const r = await watchdog(auditOne(base, screen, size, palette, wantsUpdate(screen.id, size)), screen).catch((err) => ({ screen: screen.id, size, flags: [{ kind: 'capture-failed', error: err.message }] }));
        results.push(r);
        console.log(`${r.flags.length ? 'FLAG' : 'ok  '} ${`${screen.id}@${size}`.padEnd(28)} ${r.flags.map((f) => f.kind).join(', ')}`);
      }
      if (!args.flag('--no-frames')) {
        const f = await motionOne(base, screen);
        frames.push(f);
        console.log(`${f.flags.length ? 'FLAG' : 'ok  '} ${`${screen.id} motion`.padEnd(28)} ${f.motion.length} filmstrips; ${f.stats ? `${f.stats.long}/${f.stats.frames} long frames, worst ${f.stats.worstMs} ms` : f.flags.map((x) => x.error ?? x.kind).join(', ')} ${f.flags.map((x) => x.kind).join(', ')}`);
      }
    }
  } finally {
    await vite?.close();
  }
  const runFlags = results.reduce((n, r) => n + r.flags.length, 0) + frames.reduce((n, f) => n + f.flags.length, 0);
  const all = { results: [...(earlier?.results ?? []), ...results], frames: [...(earlier?.frames ?? []), ...frames] };
  const flagCount = all.results.reduce((n, r) => n + r.flags.length, 0) + all.frames.reduce((n, f) => n + f.flags.length, 0);
  const summary = { spec: '.kiro/specs/qa-visual-audit/', chapter: chapter.id, seed, sizes, startedAt: new Date(t0).toISOString(), durationSec: Math.round((Date.now() - t0) / 1000), runFlags, flagCount, merged: scoped, results: all.results, frames: all.frames };
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(`\n${results.length} captures, ${frames.length} frame probes, ${runFlags} flags, ${summary.durationSec} s -> ${rel(join(OUT, 'summary.json'))}${scoped ? ` (merged with earlier runs: ${all.results.length} captures, ${flagCount} flags in total)` : ''}`);
  return runFlags ? 1 : 0;
}

main().then((code) => process.exit(code), (err) => { console.error(`visual-audit: ${err.stack ?? err.message}`); process.exit(2); });
