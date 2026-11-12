#!/usr/bin/env node
// Screenshot of the storybook (/storybook.html) from headless Chrome: the model or texture under the
// game's real shaders and post passes (pixel-art, CRT). No npm dependency: it starts Vite from the
// project, launches the installed Chrome and drives it over the DevTools protocol with node's WebSocket.
//
//   node scripts/harness/screenshot-lab.mjs --query "inspect=malware.worm&scale=game&bg=floor4" --name worm-f4
//   node scripts/harness/screenshot-lab.mjs --query "category=door" --name doors --width 1500 --height 1000
//   node scripts/harness/screenshot-lab.mjs --query "inspect=vibecoder.dev&silhouette=1&ui=0" --name vibecoder-sil --width 400 --height 400
//   node scripts/harness/screenshot-lab.mjs --selftest          (lab fixtures, proves Chrome + WebGL work here)
//
// Options: --query <url params>  --name <file stem>  --width 1280  --height 800  --dpr 1
//          --out <file.png>      --url <http://host:port of a dev server already running>
//          --page <path>   shoot another page (e.g. / for the game); --wait <ms> before the shot
//          --timeout 30000       --chrome <path to a Chrome/Chromium binary>  (or env CHROME_BIN)
//          --eval "<js>"         run in the page after it is ready and before the shot; may await;
//                                its value is printed. e.g. --eval "await __storybook.setOption('state','attack')"
// Writes scripts/harness/out/lab-<name>.png and prints the lab's stats for that frame.
// URL parameters: .kiro/skills/comic-panel-viewport-auditor/references/storybook-url-params.md
// Exit code: 0 ok, 1 page error / blank frame / not ready in time, 2 usage or no Chrome.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs, projectRoot, startPageServer } from './lib/load.mjs';

const args = parseArgs(process.argv.slice(2), ['--query', '--name', '--width', '--height', '--dpr', '--out', '--url', '--timeout', '--chrome', '--eval', '--page', '--wait', '--wait2']);
const selftest = args.flag('--selftest');
const query = selftest ? 'inspect=malware.lab_fixture&fixtures=1&t=1.25&sockets=1' : args.val('--query', '');
const name = (selftest ? 'selftest' : args.val('--name', query ? query.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) : 'gallery')) || 'gallery';
const width = Number(args.val('--width', 1280));
const height = Number(args.val('--height', 800));
const dpr = Number(args.val('--dpr', 1));
const timeout = Number(args.val('--timeout', 30000));
const out = resolve(projectRoot, args.val('--out', `scripts/harness/out/lab-${name}.png`));

function findChrome() {
  const candidates = [
    args.val('--chrome'),
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  return candidates.find((p) => p && existsSync(p));
}

/** Minimal DevTools-protocol client over one page target. */
function connect(wsUrl) {
  return new Promise((resolveConn, rejectConn) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    const listeners = [];
    ws.addEventListener('open', () =>
      resolveConn({
        send(method, params = {}) {
          const id = nextId++;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((res, rej) => pending.set(id, { res, rej, method }));
        },
        on: (fn) => listeners.push(fn),
        close: () => ws.close(),
      }),
    );
    ws.addEventListener('error', () => rejectConn(new Error('DevTools websocket failed')));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.rej(new Error(`${p.method}: ${msg.error.message}`));
        else p.res(msg.result);
      } else if (msg.method) listeners.forEach((fn) => fn(msg));
    });
  });
}

function withTimeout(promise, ms, what) {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timed out after ${ms} ms: ${what}`)), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error('No Chrome/Chromium found. Pass --chrome <path> or set CHROME_BIN.');
    console.error('Manual route: npm run dev, open http://localhost:5173/storybook.html?<params> and use the browser screenshot.');
    return 2;
  }

  let vite = null;
  let base = args.val('--url');
  let chrome = null;
  const profile = mkdtempSync(join(tmpdir(), 'haunted-lab-'));
  try {
    if (!base) {
      ({ vite, base } = await startPageServer(5310));
    }
    const pagePath = args.val('--page', '/storybook.html');
    const isLab = pagePath.includes('storybook');
    const url = `${base.replace(/\/$/, '')}${pagePath}?${query}${query ? '&' : ''}dpr=${dpr}`;

    chrome = spawn(chromePath, [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--mute-audio',
      // WebGL without a display: ANGLE on the real GPU where there is one, SwiftShader otherwise.
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader',
      'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    const debugPort = await withTimeout(new Promise((res, rej) => {
      let buf = '';
      chrome.stderr.on('data', (d) => {
        buf += d;
        const m = /DevTools listening on ws:\/\/[^:]+:(\d+)\//.exec(buf);
        if (m) res(Number(m[1]));
      });
      chrome.on('exit', (code) => rej(new Error(`Chrome exited early (code ${code}): ${buf.slice(-400)}`)));
    }), 15000, 'Chrome start');

    const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('Chrome has no page target');
    const cdp = await connect(page.webSocketDebuggerUrl);

    const problems = [];
    cdp.on((msg) => {
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        problems.push(`exception: ${d.exception?.description ?? d.text}`);
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        problems.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
      } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        problems.push(`log: ${msg.params.entry.text} ${msg.params.entry.url ?? ''}`);
      }
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false });
    await cdp.send('Page.navigate', { url });

    const evalJs = args.val('--eval');
    // window.__storybook.ready resolves once the frame on screen is complete (see src/storybook/storybook.ts).
    const probe = `(async () => {
      for (let i = 0; i < 400 && !window.__storybook; i++) await new Promise((r) => setTimeout(r, 25));
      if (!window.__storybook) throw new Error('window.__storybook never appeared: the lab entry module failed to load');
      await window.__storybook.ready;
      await document.fonts.ready;
      let evalResult;
      ${evalJs ? `evalResult = await (async () => { return (${evalJs}); })();
      await window.__storybook.setOption('guides', window.__storybook.options().guides);` : ''}
      const stats = window.__storybook.stats();
      // How many distinct colours the WebGL frame holds. 1 means a blank frame.
      const gl = document.querySelector('.lab-canvas-host canvas') ?? document.querySelector('.lab-cell-canvas');
      let colours = 0;
      if (gl && gl.width > 0) {
        const c = document.createElement('canvas');
        c.width = 96; c.height = 96;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(gl, 0, 0, 96, 96);
        const d = ctx.getImageData(0, 0, 96, 96).data;
        const seen = new Set();
        for (let i = 0; i < d.length; i += 4) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
        colours = seen.size;
      }
      return JSON.stringify({ stats, colours, list: window.__storybook.list(), evalResult });
    })()`;
    if (!isLab) {
      // Any other page (e.g. --page /): no lab hooks, so just wait, optionally run --eval, and shoot.
      await new Promise((r) => setTimeout(r, Number(args.val('--wait', 3500))));
      const extra = args.val('--eval');
      if (extra) {
        const r = await cdp.send('Runtime.evaluate', { expression: extra, awaitPromise: true, returnByValue: true });
        console.log(`eval     ${String(JSON.stringify(r.result?.value ?? r.exceptionDetails?.text ?? null)).slice(0, 600)}`);
        await new Promise((r2) => setTimeout(r2, Number(args.val('--wait2', 1200))));
      }
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, Buffer.from(shot.data, 'base64'));
      cdp.close();
      console.log(`url      ${url}`);
      problems.forEach((p) => console.log(`ERROR    ${p}`));
      console.log(`wrote    ${out}  (${width}x${height} @${dpr})`);
      return problems.length ? 1 : 0;
    }
    const evaluated = await withTimeout(cdp.send('Runtime.evaluate', { expression: probe, awaitPromise: true, returnByValue: true }), timeout, 'storybook ready');
    if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.exception?.description ?? evaluated.exceptionDetails.text);
    const { stats, colours, list, evalResult } = JSON.parse(evaluated.result.value);

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, Buffer.from(shot.data, 'base64'));
    cdp.close();

    console.log(`url      ${url}`);
    console.log(`mode     ${stats.mode}${stats.id ? ` ${stats.id}` : ''}   catalog: ${list.models.length} models, ${list.textures.length} textures`);
    if (stats.subject?.info) {
      const i = stats.subject.info;
      console.log(`model    ${i.parts} parts, ${i.triangles} tris, w ${i.size[0].toFixed(2)} h ${i.size[1].toFixed(2)} d ${i.size[2].toFixed(2)}, minY ${i.minY.toFixed(3)}, depth ratio ${i.depthRatio.toFixed(2)}`);
      console.log(`zones    ${i.zones.map((z) => `${z.zone} ${Math.round(z.share * 100)}%`).join(', ')}`);
    }
    if (stats.framing) console.log(`scale    ${stats.framing.ppu.toFixed(1)} px/unit`);
    if (stats.gallery) {
      const bad = stats.gallery.filter((c) => c.error);
      console.log(`gallery  ${stats.gallery.length} panels, ${stats.gallery.filter((c) => c.painted).length} painted, ${bad.length} failed`);
      bad.forEach((c) => console.log(`  FAILED ${c.id}: ${c.error}`));
    }
    console.log(`camera   dir ${stats.camera.direction.map((n) => n.toFixed(2)).join(' ')}, screen-right.x ${stats.camera.screenRightX.toFixed(2)}${stats.camera.game ? ' (game frame)' : ' (NOT the game frame: debug yaw)'}`);
    console.log(`frame    ${stats.canvas.width}x${stats.canvas.height} @${stats.canvas.pixelRatio}, ${stats.draw.triangles} tris drawn, ${colours} distinct colours, animator: ${stats.animator}`);
    if (evalResult !== undefined && evalResult !== null) console.log(`eval     ${JSON.stringify(evalResult).slice(0, 600)}`);
    stats.errors.forEach((e) => console.log(`WARN     lab load error: ${e}`));
    problems.forEach((p) => console.log(`ERROR    ${p}`));
    console.log(`wrote    ${out}  (${width}x${height} @${dpr})`);

    const blank = colours <= 1 && (stats.mode === 'inspect' ? !!stats.subject : stats.gallery.length > 0);
    if (blank) console.log('FAIL     the WebGL frame is a single colour: headless WebGL did not render');
    if (stats.mode === 'inspect' && !stats.subject) console.log(`FAIL     "${stats.id}" could not be shown (see the caption in the PNG)`);
    return problems.length || blank || (stats.mode === 'inspect' && !stats.subject) ? 1 : 0;
  } finally {
    if (chrome && chrome.exitCode === null) {
      chrome.kill();
      await new Promise((res) => {
        const timer = setTimeout(res, 2000);
        chrome.once('exit', () => { clearTimeout(timer); res(); });
      });
    }
    if (vite) await vite.close();
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold a lock file */ }
  }
}

main().then(
  (code) => { process.exitCode = code; },
  (err) => { console.error(`FAIL     ${err.message}`); process.exitCode = 1; },
);
