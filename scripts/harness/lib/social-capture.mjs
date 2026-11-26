// Headless Chrome CDP + Vite page server stepped-clock capture for Out Of Credits videos & screenshots.
// Drives real /play, /cinematic.html, /storybook.html, /laptop-lab, and landing routes deterministically.
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { launchBrowser, sleep } from './browser.mjs';
import { projectRoot } from './load.mjs';
import { listSortedPngs, renderContactSheet, saveBase64Png } from './social-ffmpeg.mjs';
import { compactTimedCues, cuesForKernelEvent, keystrokeCues } from './social-game-sfx.mjs';
import { SOCIAL_OVERLAY_JS } from './social-overlay.mjs';

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
};

const SKIN_META = {
  iterm2: { title: 'vibecoder@motherboard: ~ (zsh)', tab: 'zsh' },
  'terminal-app': { title: 'dev — -zsh — 80×24', tab: '-zsh' },
  putty: { title: 'haunted.local - PuTTY', tab: 'PuTTY' },
  'windows-terminal': { title: 'dev@haunted: ~', tab: 'dev@haunted: ~' },
  'gnome-terminal': { title: 'dev@haunted: ~', tab: 'dev@haunted: ~' },
  vt100: { title: 'VT100', tab: 'VT100' },
};

function buildPreloadScript(seed, skin) {
  return `(() => {
    let a = ${Number(seed) >>> 0};
    Math.random = () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    try {
      localStorage.setItem('credits.lab.stormOn', '0');
      ${skin ? `localStorage.setItem('out-of-credits:terminal-skin:v1', ${JSON.stringify(JSON.stringify(skin))});` : ''}
    } catch {}
    const tickHandlers = [];
    const origSetInterval = window.setInterval.bind(window);
    window.setInterval = (fn, ms, ...rest) => {
      if (typeof fn === 'function' && ms === 1000) tickHandlers.push(fn);
      return origSetInterval(fn, ms, ...rest);
    };
    window.__socialTicks = (count) => {
      const n = Math.max(1, Number(count) || 1);
      for (let i = 0; i < n; i++) {
        if (tickHandlers.length) {
          for (const fn of tickHandlers) { try { fn(); } catch (e) { console.error(e); } }
        } else if (window.__game && window.__game.tick) {
          window.__game.tick();
        }
      }
      return true;
    };
    let vNow = 1000;
    const origPerf = performance.now.bind(performance);
    window.__useVirtualClock = false;
    Object.defineProperty(performance, 'now', {
      configurable: true,
      value: () => (window.__useVirtualClock ? vNow : origPerf()),
    });
    const rafQueue = new Map();
    let rafId = 0;
    const origRaf = window.requestAnimationFrame.bind(window);
    const origCaf = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => {
      if (!window.__useVirtualClock) return origRaf(cb);
      const k = ++rafId;
      rafQueue.set(k, cb);
      return k;
    };
    window.cancelAnimationFrame = (k) => {
      rafQueue.delete(k);
      origCaf(k);
    };
    window.__socialLockClock = () => {
      vNow = origPerf();
      window.__useVirtualClock = true;
      if (window.__stage && window.__stage.freeze) window.__stage.freeze(true);
      return true;
    };
    window.__socialStep = (dtMs) => {
      vNow += dtMs;
      if (window.__stage) {
        if (window.__stage.freeze) window.__stage.freeze(true);
        if (window.__stage.advance) window.__stage.advance(dtMs);
      }
      const batch = [...rafQueue.values()];
      rafQueue.clear();
      for (const cb of batch) {
        try { cb(vNow); } catch (e) { console.error(e); }
      }
      return true;
    };
  })();`;
}

export async function startSocialViteServer(assetMap = new Map(), htmlRoutes = {}) {
  const plugin = {
    name: 'ooc-social-capture',
    configureServer(srv) {
      srv.middlewares.use((req, res, next) => {
        const u = (req.url || '').split('?')[0];
        if (Object.hasOwn(htmlRoutes, u)) {
          const raw = typeof htmlRoutes[u] === 'function' ? htmlRoutes[u](req) : htmlRoutes[u];
          srv.transformIndexHtml('/index.html', raw).then((html) => {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
            res.end(html);
          }).catch(next);
          return;
        }
        if (u.startsWith('/__social_assets/')) {
          const key = decodeURIComponent(u.slice('/__social_assets/'.length));
          const file = assetMap.get(key);
          if (!file || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
          res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
          fs.createReadStream(file).pipe(res);
          return;
        }
        next();
      });
    },
  };
  const vite = await createServer({
    configFile: path.resolve(projectRoot, 'vite.config.ts'),
    logLevel: 'error',
    plugins: [plugin],
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, open: false },
  });
  await vite.listen();
  return { base: `http://127.0.0.1:${vite.httpServer.address().port}`, close: () => vite.close() };
}

async function waitPlayIdle(b, maxMs = 20000) {
  await b.waitFor('Boolean(window.__term && window.__game && window.__term.phase() === "play" && !window.__term.busy())', maxMs, 'play session idle');
}

async function runSetupSteps(b, steps) {
  for (const st of steps) {
    if (typeof st === 'string') {
      await waitPlayIdle(b, 15000);
      await b.evaluate(`window.__term.submit(${JSON.stringify(st)}).then(() => true)`, 15000);
      await sleep(120);
    } else if (typeof st.ticks === 'number') {
      await b.evaluate(`window.__socialTicks(${st.ticks})`, 15000);
      await sleep(120);
    } else if (typeof st.wait === 'number') {
      await sleep(st.wait);
    } else if (typeof st.until === 'string') {
      await b.waitFor(st.until, st.max ?? 10000, st.until);
    }
  }
}

async function configureLaptopScene(b, laptopCfg) {
  await b.waitFor('Boolean(window.__laptop)', 20000, 'window.__laptop');
  await b.evaluate(`(() => {
    const cfg = ${JSON.stringify(laptopCfg ?? { ui: false, task: null })};
    if (!cfg.ui) {
      const s = document.createElement('style');
      s.textContent = '.ll-top,.ll-side,.ll-caption{display:none!important}.ll-shell{grid-template-rows:1fr!important}.ll-main{grid-template-columns:1fr!important;padding:12px!important}';
      document.head.appendChild(s);
    }
    if (cfg.task && window.__laptop) {
      window.__laptop.jump('desktop');
      window.__laptop.ctx.startTask(cfg.task);
    }
    window.dispatchEvent(new Event('resize'));
    return true;
  })()`);
}

async function bootSceneOnPage(b, base, scene, spec, includeOverlay = true) {
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: buildPreloadScript(spec.seed, scene.skin) });
  await b.open(`${base}${scene.url}`);
  await b.waitFor('document.readyState === "complete"', 20000, `load ${scene.url}`);
  await b.evaluate('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true', 10000).catch(() => {});

  if (scene.mode === 'play') {
    await waitPlayIdle(b, 25000);
    if (scene.setup.length) {
      await runSetupSteps(b, scene.setup);
      await waitPlayIdle(b, 15000);
    }
  } else if (scene.mode === 'comix') {
    await b.waitFor('Boolean(window.__cinematic && window.__cinematic.state === "playing" && window.__cinematic.frozen)', 25000, 'window.__cinematic ready');
  } else if (scene.mode === 'storybook') {
    await b.waitFor('Boolean(window.__storybook)', 20000, 'window.__storybook');
    await b.evaluate('window.__storybook.ready.then(() => true)', 20000);
  } else if (scene.mode === 'laptop') {
    await configureLaptopScene(b, scene.laptop);
  }

  if (scene.settleMs > 0) await sleep(scene.settleMs);
  await b.evaluate('window.__socialLockClock()');

  if (includeOverlay) {
    const cleanSpec = { ...spec, specDir: undefined, audio: undefined };
    await b.evaluate(`window.__SOCIAL_SPEC = ${JSON.stringify(cleanSpec)}; true`);
    await b.evaluate(SOCIAL_OVERLAY_JS);
    if (scene.shots?.length) {
      const urls = scene.shots.map((sh) => `/__social_assets/${encodeURIComponent(sh.name)}`);
      await b.evaluate(`Promise.all(${JSON.stringify(urls)}.map((u) => new Promise((r) => { const im = new Image(); im.onload = im.onerror = () => r(true); im.src = u; })))`, 10000).catch(() => {});
    }
    await b.evaluate('window.__socialStep(0)');
  }
  const baseEvents = scene.mode === 'play'
    ? await b.evaluate('window.__game ? window.__game.events().length : 0').catch(() => 0)
    : 0;
  return { eventCursor: Number(baseEvents) || 0 };
}

function buildScheduledActions(scene) {
  const scheduled = [];
  for (const ev of scene.events) {
    if (ev.do === 'type' || ev.do === 'typeAndSubmit') {
      const text = ev.do === 'type' ? ev.text : ev.line;
      const cps = Math.max(4, ev.cps ?? 18);
      const step = 1 / cps;
      for (let i = 0; i < text.length; i++) {
        scheduled.push({ at: ev.t + i * step, kind: 'char', ch: text[i], raw: ev });
      }
      if (ev.do === 'typeAndSubmit') {
        scheduled.push({ at: ev.t + text.length * step + 0.03, kind: 'submitCurrent', line: text, raw: ev });
      }
    } else {
      scheduled.push({ at: ev.t, kind: ev.do, raw: ev });
    }
  }
  return scheduled.sort((a, b) => a.at - b.at);
}

async function applyScheduledAction(b, act) {
  const ev = act.raw;
  if (act.kind === 'char') {
    await b.evaluate(`window.__term && window.__term.input(${JSON.stringify(act.ch)}); true`);
  } else if (act.kind === 'submitCurrent') {
    await b.evaluate(`(() => {
      if (!window.__term) return true;
      const inIntro = Boolean(window.__game?.snapshot?.()?.battle?.phase === 'intro');
      window.__term.input('\\r');
      if (inIntro) window.__term.input('\\r');
      return true;
    })()`);
  } else if (act.kind === 'submit') {
    await b.evaluate(`window.__term ? (void window.__term.submit(${JSON.stringify(ev.line)}), true) : true`);
  } else if (act.kind === 'tick') {
    const count = Math.max(1, ev.count ?? 1);
    await b.evaluate(`window.__socialTicks(${count})`);
  } else if (act.kind === 'modal') {
    const hook = `__${ev.modal}`;
    const call = ev.action === 'close' ? 'close()' : `open(${ev.query !== undefined ? JSON.stringify(ev.query) : ''})`;
    await b.evaluate(`window[${JSON.stringify(hook)}] ? (window[${JSON.stringify(hook)}].${call}, true) : true`);
  } else if (act.kind === 'skin') {
    const meta = SKIN_META[ev.skin] ?? SKIN_META.iterm2;
    await b.evaluate(`(() => {
      const el = document.getElementById('terminal-bezel');
      if (!el) return true;
      el.dataset.skin = ${JSON.stringify(ev.skin)};
      el.querySelectorAll('.tty-title').forEach((n) => { n.textContent = ${JSON.stringify(meta.title)}; });
      el.querySelectorAll('.tty-tab-label').forEach((n) => { n.textContent = ${JSON.stringify(meta.tab)}; });
      window.dispatchEvent(new Event('resize'));
      return true;
    })()`);
  } else if (act.kind === 'scroll') {
    await b.evaluate(`window.scrollTo(0, ${Number(ev.y) || 0}); true`);
  }
}

async function stepSceneFrame(b, scene, prog, dtSec) {
  if (scene.mode === 'comix' && scene.comix) {
    const t = scene.comix.from + (scene.comix.to - scene.comix.from) * prog;
    await b.evaluate(`window.__cinematic && window.__cinematic.seek ? (window.__cinematic.seek(${t.toFixed(4)}), true) : true`);
  } else if (scene.mode === 'storybook' && scene.storybook) {
    const t = scene.storybook.from + (scene.storybook.to - scene.storybook.from) * prog;
    await b.evaluate(`window.__storybook ? (void window.__storybook.setOption('time', ${t.toFixed(4)}), true) : true`);
  } else if (scene.scrollY) {
    const y = scene.scrollY[0] + (scene.scrollY[1] - scene.scrollY[0]) * prog;
    await b.evaluate(`window.scrollTo(0, ${y.toFixed(1)}); true`);
  }
  await b.evaluate(`window.__socialStep(${(dtSec * 1000).toFixed(3)})`);
}

export async function captureVideoFrames(spec, framesDir, { only = null, root = projectRoot, log = console.log } = {}) {
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  const assetMap = new Map();
  for (const s of spec.scenes) for (const sh of s.shots) assetMap.set(sh.name, sh.abs);

  const srv = await startSocialViteServer(assetMap);
  const dt = 1 / spec.fps;
  const totalFrames = Math.round(spec.total * spec.fps);
  const f0 = only ? Math.max(0, Math.floor(only[0] * spec.fps)) : 0;
  const f1 = only ? Math.min(totalFrames, Math.ceil(only[1] * spec.fps)) : totalFrames;

  let outIdx = 0;
  const autoSfx = [];
  const sceneMetrics = [];
  const timeline = [];
  const allErrors = [];

  try {
    for (let si = 0; si < spec.scenes.length; si++) {
      const s = spec.scenes[si];
      const sf0 = Math.max(f0, Math.round(s.t0 * spec.fps));
      const sf1 = Math.min(f1, Math.round(s.t1 * spec.fps));
      if (sf0 >= sf1) continue;

      log(`  scene ${si + 1}/${spec.scenes.length} "${s.id}" (${s.mode}: ${s.url}, ${s.dur}s)`);
      for (const ev of s.events) {
        if (ev.do === 'type' || ev.do === 'typeAndSubmit') {
          autoSfx.push(...keystrokeCues(s.t0 + ev.t, ev.do === 'type' ? ev.text : ev.line, ev.cps ?? 18, ev.do === 'typeAndSubmit'));
        }
      }

      const b = await launchBrowser({ width: spec.width, height: spec.height });
      try {
        let { eventCursor } = await bootSceneOnPage(b, srv.base, s, spec, true);
        const actions = buildScheduledActions(s);
        let actIdx = 0;

        const startFrame = Math.round(s.t0 * spec.fps);
        for (let f = startFrame; f < sf1; f++) {
          const videoT = f * dt;
          const localT = Math.max(0, videoT - s.t0);
          const prog = Math.max(0, Math.min(1, localT / s.dur));

          while (actIdx < actions.length && actions[actIdx].at <= localT + 1e-6) {
            const act = actions[actIdx++];
            await applyScheduledAction(b, act);
            timeline.push({ t: +videoT.toFixed(4), scene: s.id, action: act.kind });
          }

          await stepSceneFrame(b, s, prog, f === startFrame ? 0 : dt);
          await b.evaluate(`window.__socialOverlayFrame(${si}, ${videoT.toFixed(6)})`);

          if (s.mode === 'play') {
            const newEvents = await b.evaluate(`window.__game ? window.__game.events().slice(${eventCursor}) : []`).catch(() => []);
            if (Array.isArray(newEvents) && newEvents.length) {
              eventCursor += newEvents.length;
              for (const kev of newEvents) {
                for (const cue of cuesForKernelEvent(kev)) {
                  autoSfx.push({ at: +videoT.toFixed(4), cue, gainDb: -2 });
                }
              }
            }
          }

          if (f >= sf0) {
            const shot = await b.send('Page.captureScreenshot', { format: 'png' });
            fs.writeFileSync(path.join(framesDir, `f${String(outIdx++).padStart(5, '0')}.png`), Buffer.from(shot.data, 'base64'));
          }
        }

        const snap = s.mode === 'play'
          ? await b.evaluate('window.__game ? window.__game.snapshot() : null').catch(() => null)
          : { mode: s.mode };
        sceneMetrics.push({ id: s.id, mode: s.mode, snapshot: snap });
        for (const p of b.problems) if (!p.includes('WebSocket')) allErrors.push(`[${s.id}] ${p}`);
      } finally {
        await b.close();
      }
    }
  } finally {
    await srv.close();
  }

  const resolvedAuto = compactTimedCues(autoSfx, { maxDuration: spec.total }).map((c) => ({
    ...c,
    abs: path.join(root, 'public/sfx', `${c.cue}.mp3`),
  })).filter((c) => fs.existsSync(c.abs));

  return { frames: outIdx, autoSfxCues: resolvedAuto, sceneMetrics, timeline, errors: allErrors };
}

export async function captureScreenshotsSuite(spec, outDir, { filter = null, log = console.log, env = process.env } = {}) {
  const selected = filter ? spec.shots.filter((s) => s.id.includes(filter)) : spec.shots;
  if (!selected.length) throw new Error(`no screenshot matched "${filter}"`);

  fs.mkdirSync(outDir, { recursive: true });
  const srv = await startSocialViteServer();
  const dt = 1 / spec.fps;
  const manifest = [];
  const errors = [];

  try {
    for (let i = 0; i < selected.length; i++) {
      const sh = selected[i];
      const b = await launchBrowser({ width: spec.width, height: spec.height });
      try {
        const fakeVideoSpec = { ...spec, look: 'comix', crop: null, ticker: '', badge: '', scenes: [sh] };
        await bootSceneOnPage(b, srv.base, sh, fakeVideoSpec, sh.overlay);
        const steps = Math.max(1, Math.round(sh.captureAt * spec.fps));
        const actions = buildScheduledActions(sh);
        let actIdx = 0;

        for (let step = 0; step <= steps; step++) {
          const localT = step * dt;
          const prog = Math.max(0, Math.min(1, localT / sh.dur));
          while (actIdx < actions.length && actions[actIdx].at <= localT + 1e-6) {
            await applyScheduledAction(b, actions[actIdx++]);
          }
          await stepSceneFrame(b, sh, prog, step === 0 ? 0 : dt);
          if (sh.overlay) await b.evaluate(`window.__socialOverlayFrame(0, ${(sh.t0 + localT).toFixed(6)})`);
        }

        const raw = await b.send('Page.captureScreenshot', { format: 'png' });
        const byteLen = saveBase64Png(outDir, sh.id, raw.data);
        manifest.push({ id: sh.id, title: sh.title, file: `${sh.id}.png`, mode: sh.mode, width: spec.width, height: spec.height, bytes: byteLen });
        log(`  [${String(i + 1).padStart(2, '0')}/${selected.length}] ${sh.id}.png (${(byteLen / 1024).toFixed(0)} KB) — ${sh.title}`);
        for (const p of b.problems) if (!p.includes('WebSocket')) errors.push(`[${sh.id}] ${p}`);
      } finally {
        await b.close();
      }
    }
  } finally {
    await srv.close();
  }

  if (errors.length) throw new Error(`Screenshot capture runtime errors:\n  ${errors.join('\n  ')}`);
  if (!filter) fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const pngFiles = listSortedPngs(outDir);
  if (pngFiles.length) renderContactSheet(pngFiles, path.join(outDir, 'contact.jpg'), { env });
  return { count: selected.length, manifest };
}
