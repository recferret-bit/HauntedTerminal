// Headless Chrome over the DevTools protocol, no npm dependency. Used by editor-smoke.mjs.
//   const b = await launchBrowser({ width: 1600, height: 900 });
//   await b.open('http://127.0.0.1:5173/editor'); await b.evaluate('document.title'); await b.shoot('x.png'); await b.close();
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findChrome(explicit) {
  return [
    explicit,
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].find((p) => p && existsSync(p));
}

function withTimeout(promise, ms, what) {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timed out after ${ms} ms: ${what}`)), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

function connect(wsUrl) {
  return new Promise((ok, fail) => {
    const ws = new WebSocket(wsUrl);
    let next = 1;
    const pending = new Map();
    const listeners = [];
    ws.addEventListener('open', () => ok({
      send(method, params = {}) {
        const id = next++;
        ws.send(JSON.stringify({ id, method, params }));
        return new Promise((res, rej) => pending.set(id, { res, rej, method }));
      },
      on: (fn) => listeners.push(fn),
      close: () => ws.close(),
    }));
    ws.addEventListener('error', () => fail(new Error('DevTools websocket failed')));
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

export async function launchBrowser({ width = 1440, height = 900, chrome: explicit } = {}) {
  const path = findChrome(explicit);
  if (!path) throw new Error('No Chrome/Chromium found. Set CHROME_BIN.');
  const profile = mkdtempSync(join(tmpdir(), 'haunted-browser-'));
  const proc = spawn(path, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const port = await withTimeout(new Promise((res, rej) => {
    let buf = '';
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = /DevTools listening on ws:\/\/[^:]+:(\d+)\//.exec(buf);
      if (m) res(Number(m[1]));
    });
    proc.on('exit', (code) => rej(new Error(`Chrome exited early (code ${code}): ${buf.slice(-400)}`)));
  }), 15000, 'Chrome start');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const cdp = await connect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  const problems = [];
  cdp.on((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') problems.push(`page error: ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
    else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') problems.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  });
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

  const evaluate = async (expression, ms = 10000) => {
    const r = await withTimeout(cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }), ms, 'Runtime.evaluate');
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return {
    problems,
    evaluate,
    open: (url) => cdp.send('Page.navigate', { url }),
    async waitFor(expression, ms, what) {
      const until = Date.now() + ms;
      for (;;) {
        const v = await evaluate(expression).catch(() => null);
        if (v) return v;
        if (Date.now() > until) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
        await sleep(200);
      }
    },
    async shoot(file) {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, Buffer.from(shot.data, 'base64'));
    },
    async close() {
      cdp.close();
      if (proc.exitCode === null) proc.kill();
      await sleep(200);
      rmSync(profile, { recursive: true, force: true });
    },
  };
}
