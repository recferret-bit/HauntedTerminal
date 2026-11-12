#!/usr/bin/env node
// Plays the whole campaign in the REAL page: headless Chrome opens the game, skips the intro the way a
// player would (Esc), types every line of the playthrough script through the terminal's own Enter path
// (window.__term.submit, the function the Enter key calls), lets real 1 s game ticks run between lines,
// and checks that the outro and the stats screen arrive. No npm dependency beyond Vite.
//
//   node scripts/harness/play-browser.mjs                         (starts its own Vite)
//   node scripts/harness/play-browser.mjs --url http://127.0.0.1:5341
//   node scripts/harness/play-browser.mjs --gap 2500 --script my.json --nointro
//
// Options: --url <dev server>  --script <json, default scripts/harness/playthrough.script.json>
//          --gap 1500 (ms between lines)  --width 1280 --height 800  --chrome <path>  --line-timeout 20000
//          --nointro   load /?nointro instead of skipping the intro cinematic with Esc
//          --verbose   print each line with the floor/hp after it
// Script entries: "command" or {"tick": n} (wait n real seconds).
// Writes scripts/harness/out/play-<floor>.png (one per floor, after its title card) and play-end.png.
// Exit 0: reached the stats screen with no console/page errors. 1: any error or no ending. 2: usage / no Chrome.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs, projectRoot, startPageServer } from './lib/load.mjs';

const args = parseArgs(process.argv.slice(2), ['--url', '--page', '--query', '--script', '--gap', '--width', '--height', '--chrome', '--line-timeout']);
const gap = Number(args.val('--gap', 1500));
const width = Number(args.val('--width', 1280));
const height = Number(args.val('--height', 800));
const lineTimeout = Number(args.val('--line-timeout', 20000));
const verbose = args.flag('--verbose');
const scriptPath = resolve(projectRoot, args.val('--script', 'scripts/harness/playthrough.script.json'));
const outDir = resolve(projectRoot, 'scripts/harness/out');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  return [
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
  ].find((p) => p && existsSync(p));
}

/** Minimal DevTools-protocol client over one page target (same as screenshot-lab.mjs). */
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
  if (!existsSync(scriptPath)) {
    console.error(`missing script ${scriptPath}`);
    return 2;
  }
  const script = JSON.parse(readFileSync(scriptPath, 'utf8'));
  const chromePath = findChrome();
  if (!chromePath) {
    console.error('No Chrome/Chromium found. Pass --chrome <path> or set CHROME_BIN.');
    return 2;
  }

  let vite = null;
  let chrome = null;
  let base = args.val('--url');
  const profile = mkdtempSync(join(tmpdir(), 'haunted-play-'));
  const problems = [];
  const warnings = [];
  const shots = [];
  try {
    if (!base) {
      ({ vite, base } = await startPageServer(5342, { hmr: false, watch: null }));
    }
    base = base.replace(/\/$/, '');
    const origin = new URL(base).origin;
    const pagePath = args.val('--page', '/play.html').replace(/^\/*/, '/');
    const queryParts = [];
    if (args.val('--query')) queryParts.push(args.val('--query').replace(/^\?/, ''));
    else if (!args.val('--script')) queryParts.push('chapter=chapter-00-classic-kernel');
    if (args.flag('--nointro') && !queryParts.join('&').includes('nointro')) queryParts.push('nointro=1');
    const url = `${base}${pagePath}${queryParts.length ? `?${queryParts.join('&')}` : ''}`;

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
      '--autoplay-policy=no-user-gesture-required',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader',
      // Keep timers at full speed in a background/headless tab: the game clock is real time.
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
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

    cdp.on((msg) => {
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        problems.push(`page error: ${d.exception?.description ?? d.text}`);
      } else if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'assert')) {
        problems.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'warning' && String(msg.params.args[0]?.value ?? '').includes('[ComicStage]')) {
        // The stage catches its own errors (stage.errors) and only warns: still a failure for this gate.
        problems.push(`stage error: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
      } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        const e = msg.params.entry;
        const line = `log: ${e.text} ${e.url ?? ''}`.trim();
        // A failed third-party fetch (Google Fonts offline) is not a game bug.
        if (e.url && !e.url.startsWith(origin)) warnings.push(line);
        else problems.push(line);
      }
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    await cdp.send('Page.navigate', { url });

    // Every evaluate is bounded: a reload destroys the context and an in-flight evaluate may never answer.
    const evaluate = async (expression, ms = 8000) => {
      const r = await withTimeout(cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }), ms, 'Runtime.evaluate');
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };
    const state = () => evaluate(`(() => {
      const t = window.__term, g = window.__game;
      if (!t || !g) return null;
      const s = g.snapshot();
      return { phase: t.phase(), busy: t.busy(), paused: t.paused(), stats: t.statsOpen(),
        floor: s.floor, stageFloor: s.room?.floor ?? s.floor, hp: s.hp, maxHp: s.maxHp, cwd: s.cwd, ended: s.ended, rank: s.rank,
        commands: s.commands, timeSec: s.timeSec, ram: s.ram, ssd: s.ssd, backups: s.backups,
        enemiesLeft: s.enemiesLeft, enemiesTotal: s.enemiesTotal };
    })()`);
    const pressKey = async (key, code, keyCode) => {
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
    };
    const shoot = async (name) => {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      mkdirSync(outDir, { recursive: true });
      const file = join(outDir, `play-${name}.png`);
      writeFileSync(file, Buffer.from(shot.data, 'base64'));
      shots.push(file);
    };
    let booted = false;
    const waitFor = async (pred, ms, what, onPoll) => {
      const until = Date.now() + ms;
      let s = await state();
      while (!(s && pred(s))) {
        if (booted && !s) throw new Error(`the page lost window.__term while waiting for ${what}: it reloaded (Vite HMR after a file edit?) or crashed`);
        if (Date.now() > until) throw new Error(`timed out after ${ms} ms waiting for ${what} (state ${JSON.stringify(s)})`);
        if (onPoll && s) await onPoll(s);
        await sleep(150);
        s = await state();
      }
      return s;
    };

    let ran = 0;
    const floorsSeen = new Set();
    let aborted = false;
    try {
      // 1. Boot.
      await waitFor(() => true, 30000, 'window.__term / window.__game');
      booted = true;
      // 2. Intro: skip it the player's way (Esc). The cinematic may need a moment to attach its listener.
      let escAt = 0;
      let escapes = 0;
      const tIntro = Date.now();
      await waitFor((s) => s.phase === 'play', 45000, 'the intro to end', async (s) => {
        if (s.phase === 'intro' && Date.now() - escAt > 700) {
          escAt = Date.now();
          escapes++;
          await pressKey('Escape', 'Escape', 27);
        }
      });
      console.log(`intro    ended after ${((Date.now() - tIntro) / 1000).toFixed(1)} s (${escapes} Esc presses)`);
      // 3. Floor 1 title card, then the first shot.
      let s = await waitFor((st) => !st.busy, 10000, 'the floor 1 title card');
      await sleep(400);
      await shoot(String(s.stageFloor));
      let shotFloor = s.stageFloor;
      floorsSeen.add(s.stageFloor);

      // 4. Every line through the terminal's Enter path.
      for (const item of script) {
        if (s.ended) break;
        if (item && typeof item === 'object' && 'tick' in item) {
          await sleep(Number(item.tick) * 1000);
          s = (await state()) ?? s;
          continue;
        }
        const line = String(item);
        await waitFor((st) => !st.busy || st.ended, lineTimeout, `input to unblock before "${line}"`);
        await evaluate(`window.__term.submit(${JSON.stringify(line)}).then(() => true)`, lineTimeout);
        ran++;
        await sleep(gap);
        s = await state();
        if (!s) throw new Error(`the page lost window.__term after "${line}": it reloaded (Vite HMR after a file edit?) or crashed`);
        if (verbose) console.log(`  ${String(ran).padStart(2)} ${line.padEnd(70)} fl ${s.stageFloor} hp ${s.hp}/${s.maxHp} ${s.cwd}`);
        floorsSeen.add(s.stageFloor);
        if (s.stageFloor !== shotFloor && !s.ended) {
          s = await waitFor((st) => !st.busy || st.ended, 10000, `the floor ${s.stageFloor} title card`);
          await sleep(300);
          await shoot(String(s.stageFloor));
          shotFloor = s.stageFloor;
        }
      }

    } catch (err) {
      // Keep going to the summary: the console errors collected so far are usually the real cause.
      aborted = true;
      problems.push(`flow: ${err.message}`);
    }

    // 5. Ending: outro cinematic (skipped with Esc after a few seconds), then the stats screen.
    let ending = null;
    if (!aborted) try {
      const tEnd = Date.now();
      let lastEsc = 0;
      ending = await waitFor((st) => st.stats, 60000, 'the stats screen', async (st) => {
        if (st.phase === 'outro' && Date.now() - tEnd > 6000 && Date.now() - lastEsc > 1000) {
          lastEsc = Date.now();
          await pressKey('Escape', 'Escape', 27);
        }
      });
      await sleep(500);
      await shoot('end');
    } catch (err) {
      problems.push(`no ending: ${err.message}`);
      await shoot('end');
    }

    if (aborted) await shoot('end').catch(() => {});
    const final = await state().catch(() => null);
    let tail = '';
    if (!ending || problems.length) {
      tail = String(await evaluate('window.__term ? window.__term.text() : "(no window.__term)"').catch((e) => e.message)).split('\n').slice(-25).join('\n');
    }
    cdp.close();

    console.log(`url      ${url}`);
    console.log(`lines    ${ran}/${script.filter((x) => typeof x === 'string').length} typed`);
    console.log(`floors   ${[...floorsSeen].sort().join(' ')}`);
    console.log(`final    phase ${final?.phase}, floor ${final?.floor}, hp ${final?.hp}/${final?.maxHp}, ram ${final?.ram} GB, ssd ${final?.ssd} GB (${final?.backups} backups), ended ${final?.ended}, rank ${final?.rank}, ${final?.commands} commands, ${final?.timeSec} s`);
    shots.forEach((f) => console.log(`shot     ${f}`));
    warnings.forEach((w) => console.log(`WARN     ${w}`));
    problems.forEach((p) => console.log(`ERROR    ${p}`));
    if (tail) console.log(`--- terminal tail ---\n${tail}\n---`);
    const ok = !!ending && problems.length === 0;
    console.log(ok ? 'PASS     play-browser: reached the stats screen with no errors' : 'FAIL     play-browser');
    return ok ? 0 : 1;
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
