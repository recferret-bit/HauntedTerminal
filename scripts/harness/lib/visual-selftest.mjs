// Self-test of the visual audit (spec .kiro/specs/qa-visual-audit/, Verification): the pixel functions on in-memory
// images, every detector on a fixture page made to trip it (scripts/harness/visual/fixtures/), the seeded random and the
// freeze, and the CLI's baselines, --update and exit codes against a temporary baseline folder.
//   node scripts/harness/visual-audit.mjs --selftest
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { projectRoot } from './load.mjs';
import { testRunner } from './test-kit.mjs';
import { captureScreen, freeze, FreezeFailed } from './visual-capture.mjs';
import { fontFlags, loadPalette, overlapFlags, pixelFlags, viewportFlags } from './visual-detect.mjs';
import { blankImage, compareImages, contactSheet, decodeImage, encodeImage, motionFlags, offPaletteShare, readImage } from './visual-diff.mjs';
import { probeMotion } from './visual-frames.mjs';

const FIXTURES = join(projectRoot, 'scripts/harness/visual/fixtures');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.woff2': 'font/woff2' };

/** Fixtures at /, the real fonts at /fonts/ and /src/styles/fonts.css, an empty favicon; everything else 404. */
function serveFixtures() {
  const roots = [['/fonts/', join(projectRoot, 'public/fonts')], ['/src/styles/', join(projectRoot, 'src/styles')], ['/', FIXTURES]];
  const server = createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const [prefix, dir] = roots.find(([p]) => url.startsWith(p));
    const file = normalize(join(dir, url.slice(prefix.length)));
    if (!file.startsWith(dir) || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

const paint = (img, [x, y, w, h], rgb) => {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) img.data.set([...rgb, 255], (yy * img.width + xx) * 4);
  return img;
};

async function pixelTests(test) {
  await test('diff: identical images are the same', () => {
    assert.equal(compareImages(blankImage(64, 48), blankImage(64, 48)).status, 'same');
  });
  await test('diff: a changed rect beyond tolerance is a diff, with a diff image', () => {
    const r = compareImages(blankImage(64, 48), paint(blankImage(64, 48), [10, 10, 12, 12], [0, 0, 0]));
    assert.equal(r.status, 'diff');
    assert.equal(r.changed, 144);
    assert.ok(r.diffImage && r.diffImage.width === 64);
  });
  await test('diff: the same change inside a mask is ignored', () => {
    const r = compareImages(blankImage(64, 48), paint(blankImage(64, 48), [10, 10, 12, 12], [0, 0, 0]), { masks: [[8, 8, 16, 16]] });
    assert.equal(r.status, 'same');
    assert.equal(r.changed, 0);
  });
  await test('diff: a change below maxDiffRatio is the same', () => {
    assert.equal(compareImages(blankImage(64, 48), paint(blankImage(64, 48), [0, 0, 2, 2], [0, 0, 0]), { maxDiffRatio: 0.01 }).status, 'same');
  });
  await test('diff: a size change is its own status', () => {
    assert.equal(compareImages(blankImage(64, 48), blankImage(64, 40)).status, 'size-changed');
  });
  await test('pixels: black and one-colour frames are flagged; off-palette share is measured', () => {
    const kinds = (img, max = 1) => pixelFlags(img, [[240, 232, 214]], max).flags.map((f) => f.kind);
    assert.deepEqual(kinds(blankImage(32, 32, [0, 0, 0])), ['black-frame']);
    assert.deepEqual(kinds(blankImage(32, 32)), ['blank-frame']);
    assert.equal(offPaletteShare(blankImage(8, 8, [255, 0, 255]), loadPalette(projectRoot)), 1);
    assert.equal(offPaletteShare(blankImage(8, 8, [240, 232, 214]), [[240, 232, 214]]), 0);
    assert.deepEqual(kinds(paint(blankImage(32, 32), [0, 0, 32, 16], [255, 0, 255]), 0.25), ['off-palette']);
  });
  await test('motion: frozen, jump and blank-frame flags', () => {
    const still = Array.from({ length: 12 }, () => paint(blankImage(40, 30), [0, 0, 20, 30], [20, 20, 20]));
    assert.deepEqual(motionFlags(still, { animates: true }).flags.map((f) => f.kind), ['frozen']);
    assert.deepEqual(motionFlags(still, { animates: false }).flags, []);
    const flick = still.map((f, i) => (i === 5 ? blankImage(40, 30, [255, 255, 255]) : f));
    const kinds = motionFlags(flick).flags.map((f) => f.kind).sort();
    assert.deepEqual(kinds, ['blank-frame', 'jump', 'jump']);
  });
  await test('contact sheet: 4 x 3 tiles at 1/3 scale with gutters', () => {
    const sheet = contactSheet(Array.from({ length: 12 }, () => blankImage(90, 60)));
    assert.equal(sheet.width, 4 * 30 + 5 * 4);
    assert.equal(sheet.height, 3 * 20 + 4 * 4);
    assert.equal(decodeImage(encodeImage(sheet)).width, sheet.width);
  });
}

/** Capture a fixture and run every page detector, like the CLI does. */
async function auditFixture(base, name, { selectors = [], size = '800x600', films = false, extra = {} } = {}) {
  const screen = { id: name, url: `/${name}.html`, settle: 300, ...extra };
  const cap = await captureScreen({ base, screen, size, seed: 1995, films, page: { selectors } });
  try {
    const [width, height] = size.split('x').map(Number);
    const fonts = await fontFlags(cap.browser, cap.data.faces, { allowed: ['Chakra Petch', 'IBM Plex Mono'] });
    const flags = [
      ...cap.data.overflow.map((o) => ({ kind: 'text-overflow', ...o })),
      ...await overlapFlags(cap.browser.evaluate, cap.data.boxes, []),
      ...viewportFlags(cap.data.boxes, cap.data.page, { width, height }),
      ...fonts.flags,
      ...cap.problems.console.map((text) => ({ kind: 'console-error', text })),
      ...cap.problems.network.map((n) => ({ kind: 'request-failed', ...n })),
    ];
    const strips = cap.strips.map((s) => motionFlags(s.frames.map(decodeImage), { animates: !!screen.animates }));
    return { cap, flags, kinds: [...new Set(flags.map((f) => f.kind))].sort(), strips };
  } finally {
    await cap.browser.close();
  }
}

async function freezeTests(test) {
  await test('freeze: a browser that never answers is FreezeFailed (the CLI then flags capture-unstable)', async () => {
    const hung = { send: () => new Promise(() => {}), evaluate: async () => true };
    await assert.rejects(freeze(hung, false), FreezeFailed);
  });
  await test('freeze: frames that keep changing are stable: false after both methods', async () => {
    let n = 0;
    const moving = { send: async (method) => (method === 'Page.captureScreenshot' ? { data: Buffer.from(`frame ${n++}`).toString('base64') } : {}), evaluate: async () => true };
    const r = await freeze(moving, false);
    assert.equal(r.stable, false);
    assert.equal(r.method, 'animations+virtual-time');
  });
}

async function fixtureTests(test, base) {
  await test('fixture clean: no page flag, frozen with animations only', async () => {
    const r = await auditFixture(base, 'clean', { selectors: ['.a', '.b'] });
    assert.deepEqual(r.kinds, []);
    assert.equal(r.cap.stable, true);
  });
  await test('fixture seeded: Math.random is seeded, two captures are byte-identical', async () => {
    const a = await auditFixture(base, 'seeded');
    const b = await auditFixture(base, 'seeded');
    assert.ok(a.cap.still.equals(b.cap.still), 'the two seeded captures differ');
    assert.deepEqual(a.kinds, []);
  });
  await test('fixture animated: rAF + CSS animation freeze with virtual time, two shots equal', async () => {
    const r = await auditFixture(base, 'animated');
    assert.equal(r.cap.stable, true);
    assert.equal(r.cap.freezeMethod, 'animations+virtual-time');
  });
  // Not byte-identical: virtual time can start a fraction of a millisecond apart when fonts are fetched (measured 0.2 ms),
  // which moves a sub-pixel edge; the diff (anti-aliasing ignored, as in the audit) must find no changed pixel.
  await test('fixture animated on the stepped clock: two captures of moving rAF + CSS content show 0 changed pixels', async () => {
    const extra = { clock: 'stepped', settle: 700 };
    const a = await auditFixture(base, 'animated', { extra });
    const b = await auditFixture(base, 'animated', { extra });
    assert.equal(a.cap.clock, 'stepped');
    assert.equal(a.cap.freezeMethod, 'stepped');
    const r = compareImages(decodeImage(a.cap.still), decodeImage(b.cap.still));
    assert.equal(r.changed, 0, `the two stepped captures differ by ${r.changed} px`);
  });
  await test('fixture overflow: text-overflow', async () => {
    assert.deepEqual((await auditFixture(base, 'overflow')).kinds, ['text-overflow']);
  });
  await test('fixture overlap: overlap, out-of-viewport and horizontal-scroll', async () => {
    const r = await auditFixture(base, 'overlap', { selectors: ['.a', '.b', '.c'] });
    assert.deepEqual(r.kinds, ['horizontal-scroll', 'out-of-viewport', 'overlap']);
  });
  await test('fixture fonts: font-fallback, font-failed and the 404 font request', async () => {
    const r = await auditFixture(base, 'fonts');
    assert.ok(r.kinds.includes('font-fallback'), r.kinds.join());
    assert.ok(r.kinds.includes('font-failed'), r.kinds.join());
    assert.ok(r.flags.some((f) => f.kind === 'request-failed' && String(f.url).endsWith('/fonts/missing.woff2')));
  });
  await test('fixture console: console-error for console.error and a thrown error', async () => {
    const r = await auditFixture(base, 'console');
    assert.equal(r.flags.filter((f) => f.kind === 'console-error').length, 2);
  });
  await test('fixture black: black-frame', async () => {
    const r = await auditFixture(base, 'black');
    assert.deepEqual(pixelFlags(decodeImage(r.cap.still), loadPalette(projectRoot), 1).flags.map((f) => f.kind), ['black-frame']);
  });
  await test('fixture still: a screen that should animate and does not is frozen', async () => {
    const r = await auditFixture(base, 'still', { films: true, extra: { animates: true } });
    assert.deepEqual(r.strips.flatMap((s) => s.flags.map((f) => f.kind)), ['frozen']);
  });
  await test('fixture flicker: a white flash in the filmstrip is a jump', async () => {
    const r = await auditFixture(base, 'flicker', { films: true, extra: { animates: true, steps: [{ until: '(window.__flick(), true)' }] } });
    assert.ok(r.strips[0].flags.some((f) => f.kind === 'jump'), JSON.stringify(r.strips[0]));
  });
  await test('fixture busy: dropped-frames under CPU throttling; clean: none', async () => {
    const busy = await probeMotion({ base, screen: { url: '/busy.html', settle: 300 }, seed: 1995, films: false });
    assert.deepEqual(busy.flags.map((f) => f.kind), ['dropped-frames']);
    const clean = await probeMotion({ base, screen: { url: '/clean.html', settle: 300 }, seed: 1995, films: false });
    assert.deepEqual(clean.flags, []);
  });
}

/** The CLI as a child process; async, because the fixture server runs in this process and must keep answering. */
function cli(args) {
  return new Promise((ok) => {
    const child = spawn(process.execPath, ['scripts/harness/visual-audit.mjs', ...args], { cwd: projectRoot });
    const timer = setTimeout(() => child.kill('SIGKILL'), 180000);
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => { clearTimeout(timer); ok({ code, out }); });
  });
}

async function cliTests(test, base) {
  const tmp = mkdtempSync(join(tmpdir(), 'visual-audit-'));
  const screensFile = join(tmp, 'screens.json');
  writeFileSync(screensFile, JSON.stringify({ seed: 1995, sizes: ['800x600', '640x480'], frameSize: '800x600', fonts: ['Chakra Petch', 'IBM Plex Mono'], pages: { fx: { selectors: ['.a', '.b'] } }, screens: [{ id: 'clean', page: 'fx', url: '/clean.html', settle: 300 }] }));
  const baselines = join(tmp, 'baselines');
  const out = join(tmp, 'out');
  const common = ['--screens-file', screensFile, '--base', base, '--baselines', baselines, '--out', out, '--no-frames'];
  const summary = () => JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
  const pngs = () => (existsSync(baselines) ? readdirSync(baselines).filter((f) => f.endsWith('.png')).sort() : []);
  try {
    await test('cli: a missing baseline is listed, never created, exit 1', async () => {
      const r = await cli(common);
      assert.equal(r.code, 1, r.out);
      assert.deepEqual(summary().results.map((x) => x.flags.map((f) => f.kind)), [['no-baseline'], ['no-baseline']]);
      assert.deepEqual(pngs(), []);
    });
    await test('cli: --update writes only the named baseline', async () => {
      const r = await cli([...common, '--update', 'clean@800x600']);
      assert.equal(r.code, 1, r.out);
      assert.deepEqual(pngs(), ['clean@800x600.png']);
    });
    await test('cli: every baseline present and matching, exit 0', async () => {
      assert.equal((await cli([...common, '--update', 'clean'])).code, 0);
      const r = await cli(common);
      assert.equal(r.code, 0, r.out);
      assert.ok(summary().results.every((x) => x.diff.status === 'same'));
    });
    await test('cli: a changed baseline is a diff with a diff image, exit 1', async () => {
      const file = join(baselines, 'clean@800x600.png');
      writeFileSync(file, encodeImage(paint(readImage(file), [100, 100, 200, 120], [232, 64, 58])));
      const r = await cli(common);
      assert.equal(r.code, 1, r.out);
      const hit = summary().results.find((x) => x.size === '800x600');
      assert.deepEqual(hit.flags.map((f) => f.kind), ['diff']);
      assert.ok(existsSync(resolve(projectRoot, hit.files.diff)));
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export async function runSelftest() {
  const { test, count } = testRunner();
  const { server, base } = await serveFixtures();
  try {
    await pixelTests(test);
    await freezeTests(test);
    await fixtureTests(test, base);
    await cliTests(test, base);
  } catch (err) {
    console.error(`FAIL ${err.stack ?? err.message}`);
    return 1;
  } finally {
    server.close();
  }
  console.log(`\nvisual-audit self-test OK (${count()} tests)`);
  return 0;
}
