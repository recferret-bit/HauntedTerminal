#!/usr/bin/env node
// Real headless Chrome verification for Web Audio SFX, music transitions, FX triggers, and UI clicks across every page.
//   node scripts/harness/audio-smoke.mjs
//   node scripts/harness/audio-smoke.mjs --url http://localhost:5400
import { launchBrowser, sleep } from './lib/browser.mjs';
import { parseArgs, startPageServer } from './lib/load.mjs';
import { checkCollector } from './lib/test-kit.mjs';

const args = parseArgs(process.argv.slice(2), ['--url']);
const { check, finish } = checkCollector();

const AUDIO_SPY_SCRIPT = `(() => {
  if (window.__audioSpy) return;
  const keyToUrl = new Map();
  const bufToCue = new WeakMap();
  const srcInfo = new WeakMap();
  const activeLoops = new Set();
  const activeNodes = new Set();
  const failedFetches = [];
  const contexts = [];
  const gains = [];
  const events = [];

  const abKey = (ab) => {
    try {
      const len = ab.byteLength;
      if (!len) return '0';
      const u = new Uint8Array(ab);
      const parts = [String(len)];
      const step = Math.max(1, Math.floor(len / 24));
      for (let i = 0; i < len && parts.length < 25; i += step) parts.push(u[i].toString(16));
      return parts.join(':');
    } catch { return 'err'; }
  };

  const cueFromUrl = (url) => {
    const m = /\\/(sfx|music)\\/([^/.]+)\\./.exec(url);
    return m ? m[1] + '/' + m[2] : url;
  };

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await origFetch(input, init);
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    if (/\\/(sfx|music)\\//.test(url)) {
      if (!res.ok) failedFetches.push({ url, status: res.status });
      const origAb = res.arrayBuffer.bind(res);
      res.arrayBuffer = async () => {
        const ab = await origAb();
        keyToUrl.set(abKey(ab), cueFromUrl(url));
        return ab;
      };
    }
    return res;
  };

  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    const origDecode = AC.prototype.decodeAudioData;
    AC.prototype.decodeAudioData = function (ab, ok, err) {
      const cue = keyToUrl.get(abKey(ab)) || 'unknown';
      const wrapOk = (buf) => {
        if (buf && typeof buf === 'object') bufToCue.set(buf, cue);
        return buf;
      };
      if (ok) return origDecode.call(this, ab, (buf) => { wrapOk(buf); ok(buf); }, err);
      return Promise.resolve(origDecode.call(this, ab)).then(wrapOk);
    };

    const origCreateGain = AC.prototype.createGain;
    AC.prototype.createGain = function () {
      if (!contexts.includes(this)) contexts.push(this);
      const g = origCreateGain.call(this);
      if (gains.length === 0 || gains[gains.length - 1].ctx !== this) {
        gains.push({ ctx: this, node: g });
      }
      return g;
    };

    const origCreateSrc = AC.prototype.createBufferSource;
    AC.prototype.createBufferSource = function () {
      if (!contexts.includes(this)) contexts.push(this);
      const s = origCreateSrc.call(this);
      srcInfo.set(s, { ctx: this });
      return s;
    };
  }

  const ABS = window.AudioBufferSourceNode;
  if (ABS) {
    const origStart = ABS.prototype.start;
    ABS.prototype.start = function (...a) {
      const cue = this.buffer ? (bufToCue.get(this.buffer) || 'unknown') : 'nobuf';
      const info = srcInfo.get(this) || {};
      const loop = Boolean(this.loop);
      if (loop) activeLoops.add(cue);
      activeNodes.add(this);
      this.addEventListener?.('ended', () => activeNodes.delete(this), { once: true });
      events.push({ kind: 'play', cue, loop, t: Date.now(), state: info.ctx?.state ?? 'unknown' });
      return origStart.apply(this, a);
    };
    const origStop = ABS.prototype.stop;
    ABS.prototype.stop = function (...a) {
      const cue = this.buffer ? (bufToCue.get(this.buffer) || 'unknown') : 'nobuf';
      const loop = Boolean(this.loop);
      if (loop) activeLoops.delete(cue);
      activeNodes.delete(this);
      events.push({ kind: 'stop', cue, loop, t: Date.now() });
      return origStop.apply(this, a);
    };
  }

  window.__audioSpy = {
    events,
    activeLoops: () => [...activeLoops],
    activeCues: () => [...activeNodes].map((s) => (s.buffer ? (bufToCue.get(s.buffer) || 'unknown') : 'nobuf')),
    failedFetches: () => failedFetches.slice(),
    masterGain: () => {
      const g = gains.find((x) => x.ctx.state !== 'closed');
      return g ? g.node.gain.value : null;
    },
    clear: () => { events.length = 0; },
    cues: () => events.filter((e) => e.kind === 'play').map((e) => e.cue),
    stops: () => events.filter((e) => e.kind === 'stop').map((e) => e.cue),
  };
})();`;

let vite = null;
let base = args.val('--url');
if (!base) ({ vite, base } = await startPageServer(5351, { hmr: false, watch: null }));
base = base.replace(/\/$/, '');

const browser = await launchBrowser({ width: 1440, height: 900 });
await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: AUDIO_SPY_SCRIPT });

const $ = (expr, ms) => browser.evaluate(expr, ms);
const clearSpy = () => $('window.__audioSpy.clear()');
const cues = () => $('window.__audioSpy.cues()');
const stops = () => $('window.__audioSpy.stops()');
const activeLoops = () => $('window.__audioSpy.activeLoops()');
const activeCues = () => $('window.__audioSpy.activeCues()');
const failedFetches = () => $('window.__audioSpy.failedFetches()');
const masterGain = () => $('window.__audioSpy.masterGain()');

async function waitCue(cue, ms = 8000) {
  await browser.waitFor(`window.__audioSpy.cues().includes(${JSON.stringify(cue)})`, ms, `audio cue ${cue}`);
}

async function realClick(sel, waitMs = 280) {
  const pt = await $(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: Math.round(r.left + Math.max(2, r.width / 2)), y: Math.round(r.top + Math.max(2, r.height / 2)) };
  })()`);
  if (!pt) throw new Error(`Missing or hidden click target: ${sel}`);
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(waitMs);
}

async function pressKey(key, code, keyCode, text, modifiers = 0) {
  await browser.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    ...(modifiers ? { modifiers } : {}),
    ...(text ? { text } : {}),
  });
  await browser.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    ...(modifiers ? { modifiers } : {}),
  });
}

async function checkClickCue(label, sel, expectedCue) {
  await clearSpy();
  await realClick(sel, 340);
  const got = await cues();
  check(got.includes(expectedCue), `${label} plays ${expectedCue} (got ${JSON.stringify(got)})`);
  return got;
}

try {
  // 1. /play?chapter=chapter-01-kiroween: intro cinematic, pause/continue stops bed+rain cleanly, skip rain cleanup, L1 floor_attic + arrival lightning, empty-room kiro scan
  await browser.open(`${base}/play?chapter=chapter-01-kiroween`);
  await browser.waitFor('!!window.__term && !!window.__game && !!window.__stage', 25000, 'play page ready');
  await waitCue('sfx/rain_loop', 8000);
  await waitCue('music/cine_intro', 8000);
  check((await activeLoops()).includes('sfx/rain_loop'), 'intro starts rain_loop');
  check(!(await cues()).includes('sfx/thunder_far'), 'intro blocks phantom thunder_far');

  await browser.waitFor("!!document.querySelector('.htc-btn')", 6000, 'cinematic controls');
  await checkClickCue('cinematic Pause button', '.htc-btn:not(.htc-btn-skip)', 'sfx/menu_move');
  const pausedActive = await activeCues();
  check(!pausedActive.includes('music/cine_intro') && !pausedActive.includes('sfx/rain_loop'), `cinematic Pause stops cine_intro + rain_loop (active ${JSON.stringify(pausedActive)})`);
  await clearSpy();
  await sleep(400);
  check((await cues()).length === 0, 'cinematic stays silent while paused across 400ms');
  const contCues = await checkClickCue('cinematic Continue button', '.htc-btn:not(.htc-btn-skip)', 'sfx/menu_move');
  check(contCues.includes('sfx/rain_loop') && contCues.includes('music/cine_intro'), `cinematic Continue resumes cine_intro + rain_loop (${JSON.stringify(contCues)})`);

  // Pause again, then press Skip while paused: cine_intro and rain_loop must NOT restart!
  await checkClickCue('cinematic Pause button (before Skip)', '.htc-btn:not(.htc-btn-skip)', 'sfx/menu_move');
  const pausedActive2 = await activeCues();
  check(
    !pausedActive2.includes('music/cine_intro') && !pausedActive2.includes('sfx/rain_loop') && !(await activeLoops()).includes('sfx/rain_loop'),
    `second Pause stops cine_intro + rain_loop (${JSON.stringify(pausedActive2)})`,
  );
  await clearSpy();
  await realClick('.htc-btn-skip', 500);
  const skipCues = await cues();
  check(skipCues.includes('sfx/menu_close'), `cinematic Skip button plays sfx/menu_close (got ${JSON.stringify(skipCues)})`);
  check(
    !skipCues.includes('music/cine_intro') && !skipCues.includes('sfx/rain_loop') && !(await activeLoops()).includes('sfx/rain_loop'),
    `cinematic Skip while paused never restarts cine_intro or rain_loop (${JSON.stringify(skipCues)})`,
  );

  await browser.waitFor('window.__term.phase() === "play" && !window.__term.busy()', 12000, 'play phase unbusy');
  await waitCue('music/floor_attic_intro', 6000);
  const arrivalCues = await cues();
  check(arrivalCues.includes('sfx/lightning') && arrivalCues.includes('sfx/thunder_close'), `level intro lightning plays lightning + thunder_close (got ${JSON.stringify(arrivalCues)})`);
  check(arrivalCues.includes('music/floor_attic_intro') && arrivalCues.includes('music/floor_attic_loop'), `Level 1 starts floor_attic_intro + floor_attic_loop (${JSON.stringify(arrivalCues)})`);
  check((await failedFetches()).length === 0, `Level 1 audio loads with zero HTTP 404s (${JSON.stringify(await failedFetches())})`);

  // Item strip click + Hint dialog open/close on Level 1
  await browser.waitFor("!!document.querySelector('.item-slot')", 5000, 'item slot rendered');
  await checkClickCue('HUD .item-slot click', '.item-slot', 'sfx/item_lit');

  await checkClickCue('HUD ? Hint button', '#hud-hint', 'sfx/menu_move');
  await browser.waitFor("!!document.querySelector('#hint-dialog[open]')", 4000, 'hint dialog open');
  await checkClickCue('Hint Close button', '#hint-dialog-close', 'sfx/menu_move');
  await checkClickCue('HUD ? Hint button (reopen)', '#hud-hint', 'sfx/menu_move');
  await browser.waitFor("!!document.querySelector('#hint-dialog[open]')", 4000, 'hint dialog reopen');
  await checkClickCue('Hint X button', '#hint-dialog-x', 'sfx/menu_move');
  await checkClickCue('HUD ? Hint button (Esc close)', '#hud-hint', 'sfx/menu_move');
  await browser.waitFor("!!document.querySelector('#hint-dialog[open]')", 4000, 'hint dialog open for Esc');
  await clearSpy();
  await pressKey('Escape', 'Escape', 27);
  await browser.waitFor("!document.querySelector('#hint-dialog[open]')", 4000, 'hint dialog closed by Esc');
  await sleep(250);
  const hintEscCues = await cues();
  check(hintEscCues.filter((c) => c === 'sfx/menu_move').length === 1, `Hint Esc close plays sfx/menu_move once (${JSON.stringify(hintEscCues)})`);

  // 1b. Hub level (0 enemies): empty-room kiro scan emits sfx/xray_on (not xray_off), and ?mute=1 starts muted
  await browser.open(`${base}/play/chapter-01-kiroween/level-04-hub-model-one?nointro=1&mute=1`);
  await browser.waitFor('window.__term && window.__term.phase() === "play" && !window.__term.busy()', 15000, 'muted hub level ready');
  check((await masterGain()) === 0, '/play?mute=1 starts muted with master gain 0');
  await browser.open(`${base}/play/chapter-01-kiroween/level-04-hub-model-one?nointro=1`);
  await browser.waitFor('window.__term && window.__term.phase() === "play" && !window.__term.busy()', 15000, 'hub level ready');
  await clearSpy();
  await $('window.__term.submit("kiro scan")');
  await waitCue('sfx/xray_on', 4000);
  check((await cues()).includes('sfx/xray_on'), 'Empty-room kiro scan (0 enemies) emits sfx/xray_on');

  // 2. Level 2 (?nointro=1, terminal & manual ready immediately): initial FLOOR_ENTERED title_card, terminal keys, commands, hold, manual modal, esc menu, visual lab, dev FX
  await browser.open(`${base}/play/chapter-01-kiroween/level-02-task-ram-heist?nointro=1`);
  await browser.waitFor('window.__term && window.__term.phase() === "play" && !window.__term.busy() && !document.querySelector("#terminal-bezel.tty-unavailable")', 15000, 'level 2 terminal ready');
  await waitCue('sfx/title_card', 4000);
  check((await cues()).includes('sfx/title_card'), 'Initial ?nointro=1 load publishes FLOOR_ENTERED -> sfx/title_card');
  await sleep(350);

  // Clicking terminal focuses it without playing button SFX; key press/backspace/tab/delete work cleanly
  await clearSpy();
  await realClick('.xterm', 150);
  check(!(await cues()).includes('sfx/menu_move'), 'Clicking .xterm background does not play button click SFX');
  await $('document.querySelector(".xterm-helper-textarea")?.focus()');
  await clearSpy();
  await pressKey('h', 'KeyH', 72, 'h');
  await pressKey('Backspace', 'Backspace', 8);
  await pressKey('a', 'KeyA', 65, 'a');
  await pressKey('ArrowLeft', 'ArrowLeft', 37);
  await pressKey('Delete', 'Delete', 46);
  await pressKey('Tab', 'Tab', 9);
  await sleep(300);
  const keyCues = await cues();
  check(
    keyCues.includes('sfx/key_press') && keyCues.filter((c) => c === 'sfx/key_backspace').length >= 2 && keyCues.includes('sfx/tab_complete'),
    `terminal key press/backspace/delete/tab play SFX (${JSON.stringify(keyCues)})`,
  );

  await clearSpy();
  await $('window.__term.submit("cat definitely_missing_file")');
  await sleep(450);
  const failCues = await cues();
  check(failCues.includes('sfx/cmd_fail') && !failCues.includes('sfx/reveal'), `failed cat plays cmd_fail and NOT reveal (${JSON.stringify(failCues)})`);

  await clearSpy();
  await $('window.__term.submit("ls -a")');
  await sleep(450);
  const lsCues = await cues();
  check(
    lsCues.includes('sfx/cmd_ok') && lsCues.filter((c) => c === 'sfx/lantern_on').length === 1,
    `Level 2 ls -a plays cmd_ok + exactly one lantern_on (${JSON.stringify(lsCues)})`,
  );

  // ArrowUp history recall plays key_press
  await $('document.querySelector(".xterm-helper-textarea")?.focus()');
  await clearSpy();
  await pressKey('ArrowUp', 'ArrowUp', 38);
  await sleep(250);
  check((await cues()).includes('sfx/key_press'), 'ArrowUp history navigation plays sfx/key_press');
  await pressKey('u', 'KeyU', 85, undefined, 2); // Ctrl+U clears drafted history line

  // Chapter PERMISSION_DENIED_RATTLE restored in session-fs/code/kiro + file ops + top toggle xray_on / xray_off
  await browser.waitFor('!window.__term.busy()', 5000, 'term unbusy before chmod');
  await $('window.__term.submit("echo x > locktest.txt && chmod 000 locktest.txt")');
  await browser.waitFor('!window.__term.busy()', 5000, 'term unbusy before cat');
  await clearSpy();
  await $('window.__term.submit("cat locktest.txt")');
  await waitCue('sfx/perm_denied', 4000);
  const permCues = await cues();
  check(permCues.includes('sfx/perm_denied') && permCues.includes('sfx/cmd_fail'), `Chapter locked cat emits perm_denied + cmd_fail (${JSON.stringify(permCues)})`);

  for (const [label, cmd, cue] of [
    ['kiro inspect 000 file', 'kiro inspect locktest.txt', 'sfx/perm_denied'],
    ['sed -i read-only file', "chmod 444 locktest.txt && sed -i 's/x/y/' locktest.txt", 'sfx/perm_denied'],
    ['touch in read-only dir', 'mkdir rodir && chmod 555 rodir && touch rodir/a.txt', 'sfx/perm_denied'],
    ['chmod mode update', 'chmod 644 locktest.txt', 'sfx/chmod'],
    ['mv to subdir', 'mkdir mvbox && mv locktest.txt mvbox/locktest.txt', 'sfx/file_move'],
    ['mv /dev/null', 'mv mvbox/locktest.txt /dev/null', 'sfx/null_suck'],
    ['rm file', 'echo z > rem.txt && rm rem.txt', 'sfx/file_remove'],
  ]) {
    await browser.waitFor('!window.__term.busy()', 5000, `term unbusy before ${label}`);
    await clearSpy();
    await $(`window.__term.submit(${JSON.stringify(cmd)})`);
    await waitCue(cue, 4000);
    check((await cues()).includes(cue), `${label} plays ${cue} (${JSON.stringify(await cues())})`);
  }

  await browser.waitFor('!window.__term.busy()', 5000, 'term unbusy before top 1');
  await clearSpy();
  await $('window.__term.submit("top")');
  await sleep(600);
  const top1Cues = await cues();
  check(top1Cues.includes('sfx/xray_on'), `First \`top\` plays sfx/xray_on (${JSON.stringify(top1Cues)})`);
  await browser.waitFor('!window.__term.busy()', 5000, 'term unbusy before top 2');
  await clearSpy();
  await $('window.__term.submit("top")');
  await sleep(600);
  const top2Cues = await cues();
  check(top2Cues.includes('sfx/xray_off'), `Second \`top\` toggles X-Ray off with sfx/xray_off (${JSON.stringify(top2Cues)})`);

  await clearSpy();
  await $('window.__term.submit("hold lantern")');
  await sleep(400);
  const holdCues = await cues();
  check(holdCues.includes('sfx/cmd_ok') && holdCues.includes('sfx/item_lit'), `hold lantern plays cmd_ok + item_lit (${JSON.stringify(holdCues)})`);

  // `manual ls` command opens manual without false initial page_turn
  await clearSpy();
  await $('window.__term.submit("manual ls")');
  await browser.waitFor("!!window.__manual && window.__manual.isOpen()", 4000, 'manual ls open');
  await sleep(250);
  const cmdManualCues = await cues();
  check(
    cmdManualCues.includes('sfx/manual_open') && !cmdManualCues.includes('sfx/page_turn'),
    `manual ls command plays manual_open without spurious initial page_turn (${JSON.stringify(cmdManualCues)})`,
  );
  await clearSpy();
  await pressKey('Escape', 'Escape', 27);
  await browser.waitFor("!window.__manual.isOpen()", 4000, 'manual ls close');
  await sleep(250);
  check((await cues()).includes('sfx/manual_close'), 'Manual closes with manual_close after command open');

  // Field Manual modal in /play: open, flip corner, Next/Index buttons, section tab, Copy, Insert, filter pill, dismiss search, Esc close, and .mb-close-btn
  await checkClickCue('Manual toolbar open button', '#tty-manual-btn', 'sfx/manual_open');
  await browser.waitFor("!!document.querySelector('.mb-corner-right')", 5000, 'manual modal spread');
  await checkClickCue('Manual modal right corner flip', '.mb-corner-right', 'sfx/page_turn');
  await checkClickCue('Manual modal header Next button', '.mb-head-actions button[title^="Next"]', 'sfx/page_turn');
  await checkClickCue('Manual modal Index button', '.mb-toc-btn', 'sfx/page_turn');
  await checkClickCue('Manual modal section tab (02 Look)', '.mb-tab-btn:nth-child(3)', 'sfx/page_turn');
  await clearSpy();
  await checkClickCue('Manual modal Copy button', '.mb-page:not(.hidden) .mb-mini-btn:not(.mb-insert-btn)', 'sfx/menu_move');
  await checkClickCue('Manual filter pill click', '.mb-filter-pill:not(.active)', 'sfx/menu_move');
  // 1st Esc dismisses open search results panel; 2nd Esc closes manual modal cleanly
  await pressKey('Escape', 'Escape', 27);
  await sleep(200);
  await clearSpy();
  await pressKey('Escape', 'Escape', 27);
  await sleep(400);
  check(!(await $('window.__manual.isOpen()')) && (await cues()).includes('sfx/manual_close'), 'Manual modal Esc close plays sfx/manual_close immediately');

  // Reopen & test Insert snippet button -> tab_complete + manual_close; then reopen & test Close (Esc) button
  await checkClickCue('Manual reopen via toolbar button', '#tty-manual-btn', 'sfx/manual_open');
  await browser.waitFor("!!document.querySelector('.mb-tab-btn:nth-child(3)')", 4000, 'manual tabs');
  await realClick('.mb-tab-btn:nth-child(3)', 250);
  await clearSpy();
  await realClick('.mb-page:not(.hidden) .mb-insert-btn', 350);
  const insertCues = await cues();
  check(insertCues.includes('sfx/tab_complete') && insertCues.includes('sfx/manual_close'), `Manual Insert button plays tab_complete + manual_close (${JSON.stringify(insertCues)})`);

  await checkClickCue('Manual reopen for Close btn check', '#tty-manual-btn', 'sfx/manual_open');
  await browser.waitFor("!!document.querySelector('.mb-close-btn')", 4000, 'manual close button');
  await clearSpy();
  await realClick('.mb-close-btn', 350);
  const mbCloseCues = await cues();
  check(mbCloseCues.includes('sfx/manual_close') && !mbCloseCues.includes('sfx/menu_move'), `Manual Close (Esc) button plays only sfx/manual_close (${JSON.stringify(mbCloseCues)})`);

  // Esc menu switches, Tab navigation, Mute/Unmute, Fullscreen, Restart confirm/cancel, Close
  await clearSpy();
  await pressKey('Escape', 'Escape', 27);
  await browser.waitFor("document.activeElement?.id === 'esc-close'", 5000, 'esc menu open');
  await sleep(300);
  check((await cues()).includes('sfx/menu_open'), 'Opening Esc menu plays sfx/menu_open');

  await clearSpy();
  await pressKey('Tab', 'Tab', 9);
  await sleep(250);
  check((await cues()).includes('sfx/menu_move'), 'Tab inside Esc menu plays sfx/menu_move');

  await realClick('#esc-mute', 250);
  check((await $('window.__audioSpy.masterGain()')) === 0, 'Esc mute sets master gain to 0');
  await clearSpy();
  await realClick('#esc-mute', 300);
  check((await $('window.__audioSpy.masterGain()')) > 0 && (await cues()).includes('sfx/menu_move'), 'Esc unmute restores gain and plays sfx/menu_move');

  await checkClickCue('Esc Fullscreen toggle switch', '#esc-fullscreen', 'sfx/menu_move');
  await checkClickCue('Esc Restart arm click', '#esc-restart', 'sfx/menu_move');
  await checkClickCue('Esc Restart cancel click', '#esc-restart-no', 'sfx/menu_move');
  await clearSpy();
  await realClick('#esc-close', 300);
  const escCloseCues = await cues();
  check(escCloseCues.includes('sfx/menu_close') && !escCloseCues.includes('sfx/menu_move'), `Esc Resume/Close plays only sfx/menu_close cleanly (${JSON.stringify(escCloseCues)})`);

  // Visual Lab (F8 -> #pixel-dlg.open): radio inputs, tabs, toggle, range slider, reset, close + F9/F10 + storm thunder
  await clearSpy();
  await pressKey('F8', 'F8', 119);
  await browser.waitFor("!!document.querySelector('#pixel-dlg.open')", 4000, 'visual lab dialog open');
  await sleep(250);
  check((await cues()).includes('sfx/menu_move'), 'F8 Visual Lab toggle plays sfx/menu_move');
  await checkClickCue('Visual Lab lighting radio switch', '#pixel-dlg .pd-radios input[type="radio"]:not(:checked)', 'sfx/menu_move');
  await checkClickCue('Visual Lab tab button', '#pixel-dlg .pd-tab:not(.on)', 'sfx/menu_move');
  await checkClickCue('Visual Lab enable toggle', '#pd-enable', 'sfx/menu_move');
  await checkClickCue('Visual Lab reset button', '#pd-reset', 'sfx/menu_move');
  await checkClickCue('Visual Lab close button', '#pd-close', 'sfx/menu_move');
  await clearSpy();
  await pressKey('F9', 'F9', 120);
  await sleep(200);
  check((await cues()).includes('sfx/menu_move'), 'F9 CRT toggle plays sfx/menu_move');
  await clearSpy();
  await pressKey('F10', 'F10', 121);
  await sleep(200);
  check((await cues()).includes('sfx/menu_move'), 'F10 Pixel toggle plays sfx/menu_move');

  await clearSpy();
  await $('window.__stage.stage.devNoStorm = false; window.__stage.stage.stormOn = true; window.__stage.stage.stormIn = 0.05;');
  await waitCue('sfx/thunder_far', 5000);
  check((await cues()).includes('sfx/thunder_far'), 'Ambient storm lightning bolt plays sfx/thunder_far');

  // Dev Inspector (F2): toggle btn, #btn-lightning, #btn-heal, #btn-damage (first-hit hp_tier_drop!), all FX buttons [data-ev]
  const toggleCues = await checkClickCue('Dev Inspector toggle button', '#sandbox-toggle-btn', 'sfx/menu_move');
  check(toggleCues.filter((c) => c === 'sfx/menu_move').length === 1, `Dev Inspector toggle emits menu_move once (${JSON.stringify(toggleCues)})`);
  await browser.waitFor("!!document.querySelector('#btn-lightning')", 4000, 'dev inspector');
  await clearSpy();
  await realClick('#btn-lightning', 450);
  const strikeCues = await cues();
  check(strikeCues.includes('sfx/lightning') && strikeCues.includes('sfx/thunder_close') && !strikeCues.includes('sfx/menu_move'), `#btn-lightning plays pure lightning + thunder_close (${JSON.stringify(strikeCues)})`);

  await checkClickCue('Dev Inspector #btn-heal', '#btn-heal', 'sfx/pickup_energy');
  await clearSpy();
  await realClick('#btn-damage', 350);
  const dmgCues = await cues();
  check(
    dmgCues.includes('sfx/player_hit_heavy') && dmgCues.includes('sfx/hp_tier_drop'),
    `Dev Inspector #btn-damage first drop from 100 HP plays player_hit_heavy + hp_tier_drop (${JSON.stringify(dmgCues)})`,
  );

  const devFxChecks = [
    ['lantern', 'sfx/lantern_on'],
    ['hop', 'sfx/hop'],
    ['smash3', 'sfx/panels_smash'],
    ['eloop', 'sfx/data_flood'],
    ['denied', 'sfx/perm_denied'],
    ['chmod_open', 'sfx/gate_open'],
    ['petrify', 'sfx/gate_locked'],
    ['bridge', 'sfx/crate_bridge'],
    ['null_sink', 'sfx/null_suck'],
    ['hand_fork', 'sfx/hand_spawn'],
    ['xray', 'sfx/xray_on'],
    ['freeze', 'sfx/sigstop'],
    ['kill9', 'sfx/lightning'],
    ['damage', 'sfx/player_hit_heavy'],
    ['clear', 'sfx/level_clear'],
  ];
  for (const [evId, expected] of devFxChecks) {
    await checkClickCue(`Dev Inspector [data-ev="${evId}"]`, `#dev-inspector [data-ev="${evId}"]`, expected);
  }

  // Dev Inspector #btn-intro: Escape skip restores active battle/floor bed immediately
  await clearSpy();
  await realClick('#btn-intro', 350);
  await waitCue('music/cine_intro', 5000);
  await sleep(450); // clear 400ms keyboard skip grace window
  await clearSpy();
  await pressKey('Escape', 'Escape', 27);
  await waitCue('music/battle_loop', 800);
  check((await cues()).includes('music/battle_loop'), 'Dev Inspector Play intro Esc skip restores active bed immediately');
  await sleep(850); // let POWER_ON_MS (760ms) finish clearing 'cinematic' before Esc menu check

  // Esc menu Restart confirm plays level_restart ONCE (no duplicate from play/menu.ts + session.restartFloor())
  await pressKey('Escape', 'Escape', 27);
  await browser.waitFor("document.activeElement?.id === 'esc-close'", 4000, 'esc menu for restart');
  await checkClickCue('Esc Restart arm click', '#esc-restart', 'sfx/menu_move');
  await clearSpy();
  await realClick('#esc-restart-yes', 500);
  const rstCues = await cues();
  check(rstCues.filter((c) => c === 'sfx/level_restart').length === 1, `Esc Restart confirm plays level_restart once (${JSON.stringify(rstCues)})`);

  // 3. /manual.html standalone interactive clicks (same-spread tab, corners, tabs, TOC, cover chip -> chmod checkboxes, search, Esc dismiss, clear, hit)
  await browser.open(`${base}/manual.html`);
  await browser.waitFor("document.querySelectorAll('.mb-page').length === 2", 15000, 'standalone manual');
  await waitCue('music/manual_bed', 5000);
  await checkClickCue('Standalone manual active-spread tab', '.mb-tab-btn:first-child', 'sfx/menu_move');
  await checkClickCue('Standalone manual corner flip', '.mb-corner-right', 'sfx/page_turn');
  await sleep(120);
  await checkClickCue('Standalone manual tab button', '.mb-tab-btn:nth-child(3)', 'sfx/page_turn');
  await realClick('.mb-toc-btn', 450);
  await checkClickCue('Standalone manual TOC section', '.mb-toc-sec-btn', 'sfx/page_turn');
  await sleep(120);
  await checkClickCue('Standalone manual Index to Cover', '.mb-toc-link, .mb-corner-left', 'sfx/page_turn');
  await realClick('.mb-tab-btn:first-child', 450);
  await checkClickCue('Standalone manual Cover chmod guide chip', '.mb-cover-body .mb-chip-btn', 'sfx/page_turn');
  await browser.waitFor("!!document.querySelector('.mb-chmod-widget input[type=checkbox]')", 4000, 'chmod widget checkboxes');
  await checkClickCue('Standalone manual chmod checkbox', '.mb-chmod-widget input[type="checkbox"]', 'sfx/menu_move');
  await checkClickCue('Standalone manual chmod preset chip', '.mb-chmod-widget .mb-chip-btn', 'sfx/menu_move');

  await clearSpy();
  await $('document.querySelector(".mb-search-input").focus()');
  await pressKey('c', 'KeyC', 67, 'c');
  await pressKey('h', 'KeyH', 72, 'h');
  await pressKey('m', 'KeyM', 77, 'm');
  await browser.waitFor("!!document.querySelector('.mb-hit-item')", 4000, 'search hit');
  await clearSpy();
  await pressKey('Escape', 'Escape', 27);
  await sleep(250);
  check((await cues()).includes('sfx/menu_move'), 'Manual Esc dismissing search results plays sfx/menu_move');
  await pressKey('Backspace', 'Backspace', 8);
  await pressKey('m', 'KeyM', 77, 'm');
  await browser.waitFor("!!document.querySelector('.mb-hit-item')", 4000, 'search hit reopen');
  await checkClickCue('Standalone manual search hit', '.mb-hit-item', 'sfx/page_turn');
  await checkClickCue('Standalone manual search clear', '.mb-search-clear', 'sfx/menu_move');

  // 4. Hub SPA tabs (/index.html -> Achievements -> Comix -> Desktop -> Home) + FAQ <summary> + Waitlist dialog cues
  await browser.open(`${base}/`);
  await browser.waitFor("!!document.querySelector('.hub-nav')", 15000, 'hub home');
  await waitCue('music/title_theme', 5000);
  await checkClickCue('Home FAQ <summary> toggle', 'details.comic-faq summary', 'sfx/menu_move');
  await checkClickCue('Home Waitlist CTA button', '[data-open-waitlist="1"]', 'sfx/menu_move');
  await browser.waitFor("!!document.querySelector('#steam-waitlist-dialog[open]')", 4000, 'waitlist dialog');
  await $('localStorage.removeItem("out-of-credits:waitlist:v1")');
  const wlEmptyExp = await checkClickCue('Waitlist empty export emits cmd_fail', '#waitlist-export-btn', 'sfx/cmd_fail');
  check(!wlEmptyExp.includes('sfx/cmd_ok') && !wlEmptyExp.includes('sfx/menu_move'), `Waitlist empty export plays only cmd_fail (${JSON.stringify(wlEmptyExp)})`);
  await checkClickCue('Waitlist invalid submit emits cmd_fail', '#waitlist-submit-btn', 'sfx/cmd_fail');
  await checkClickCue('Home Waitlist checkbox', '#waitlist-chk-steam', 'sfx/menu_move');
  await $('document.querySelector("#waitlist-email").value = "qa@example.com"');
  await checkClickCue('Waitlist valid submit emits cmd_ok', '#waitlist-submit-btn', 'sfx/cmd_ok');
  const wlSavedExp = await checkClickCue('Waitlist saved export emits cmd_ok', '#waitlist-export-btn', 'sfx/cmd_ok');
  check(!wlSavedExp.includes('sfx/menu_move'), `Waitlist export avoids menu_move double trigger (${JSON.stringify(wlSavedExp)})`);
  await $('localStorage.removeItem("out-of-credits:waitlist:v1")');
  await checkClickCue('Home Waitlist close button', '#waitlist-close-btn', 'sfx/menu_move');

  await clearSpy();
  await realClick('.hub-nav a[href="/achievements.html"]', 600);
  const achTabCues = await cues();
  check(achTabCues.includes('sfx/menu_move') && !achTabCues.some((c) => c.startsWith('music/') && c !== 'music/title_theme'), `Hub SPA -> Achievements keeps title_theme (${JSON.stringify(achTabCues)})`);

  await clearSpy();
  await realClick('.hub-nav a[href="/comix.html"]', 600);
  const comixTabCues = await cues();
  check(comixTabCues.includes('sfx/menu_move') && !comixTabCues.some((c) => c.startsWith('music/') && c !== 'music/title_theme'), `Hub SPA -> Comix keeps title_theme (${JSON.stringify(comixTabCues)})`);

  await clearSpy();
  await realClick('.hub-nav a[href="/"]', 600);
  const homeTabCues = await cues();
  const homeActive = await activeCues();
  check(
    homeTabCues.includes('sfx/menu_move') && homeActive.includes('music/title_theme') && !homeTabCues.some((c) => c.startsWith('music/') && c !== 'music/title_theme'),
    `Hub SPA -> Home keeps title_theme (${JSON.stringify({ cues: homeTabCues, active: homeActive })})`,
  );

  // 5. /chapters.html clicks + Chaos + Bestiary + Achievements binder export/import + Workshop perk click
  await browser.open(`${base}/chapters.html`);
  await browser.waitFor("!!document.querySelector('#dossier-chaos')", 15000, 'chapters page');
  await waitCue('music/level_select', 5000);
  await checkClickCue('Chapters Chaos checkbox', '#dossier-chaos', 'sfx/menu_move');
  await checkClickCue('Chapters Bestiary tab', '#tab-bestiary', 'sfx/menu_move');
  await checkClickCue('Chapters Achievements tab', '#tab-achievements', 'sfx/menu_move');
  await browser.waitFor("!!document.querySelector('#chapters-export-save-btn')", 4000, 'chapters export btn');
  const chExpCues = await checkClickCue('Chapters Export save button', '#chapters-export-save-btn', 'sfx/cmd_ok');
  check(!chExpCues.includes('sfx/menu_move'), `Chapters export plays cmd_ok without menu_move (${JSON.stringify(chExpCues)})`);
  const simImport = async (sel, content, expected) => {
    await clearSpy();
    await $(`(() => {
      const inp = document.querySelector(${JSON.stringify(sel)});
      const dt = new DataTransfer();
      dt.items.add(new File([${JSON.stringify(content)}], 'save.json', { type: 'application/json' }));
      inp.files = dt.files;
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitCue(expected, 4000);
    check((await cues()).includes(expected), `${sel} import emits ${expected} (${JSON.stringify(await cues())})`);
  };
  await simImport('#chapters-import-save-input', '{bad-json', 'sfx/cmd_fail');
  await simImport('#chapters-import-save-input', '{"format":"out-of-credits-save","version":1}', 'sfx/cmd_ok');
  await checkClickCue('Chapters Level card switch', '.level-card:not(.active)', 'sfx/menu_move');
  if (await $('!!document.querySelector(".perk-action-btn")')) {
    await clearSpy();
    await realClick('.perk-action-btn', 400);
    const perkCues = await cues();
    check(perkCues.some((c) => c === 'sfx/cmd_fail' || c === 'sfx/cmd_ok' || c === 'sfx/achievement'), `Workshop perk click plays outcome SFX (${JSON.stringify(perkCues)})`);
  }

  // 5b. Direct /achievements.html (export/import save, file input guard), /desktop.html, and persisted readSoundPref mute
  await browser.open(`${base}/achievements.html`);
  await browser.waitFor("!!document.querySelector('#export-save-btn')", 15000, 'achievements direct page');
  await waitCue('music/title_theme', 5000);
  const achExpCues = await checkClickCue('Achievements Export save button', '#export-save-btn', 'sfx/cmd_ok');
  check(!achExpCues.includes('sfx/menu_move'), `Achievements export plays cmd_ok only (${JSON.stringify(achExpCues)})`);
  await clearSpy();
  await $('document.querySelector("#import-save-input")?.click()');
  await sleep(200);
  check(!(await cues()).includes('sfx/menu_move'), 'Hidden <input type="file"> click does not double-fire menu_move');
  await simImport('#import-save-input', '{bad-json', 'sfx/cmd_fail');
  await simImport('#import-save-input', '{"format":"out-of-credits-save","version":1}', 'sfx/cmd_ok');
  await checkClickCue('Achievements nav link', '.hub-nav a[href="/desktop.html"]', 'sfx/menu_move');
  await browser.waitFor("!!document.querySelector('details summary, .hub-nav')", 15000, 'desktop page');
  await checkClickCue('Desktop interactive control', 'details summary, .hub-nav a[href="/"]', 'sfx/menu_move');

  // Persisted sound preference mute honored on fresh page load
  await $('localStorage.setItem("out-of-credits:sound:v1", JSON.stringify({ muted: true, volume: 0.4 }))');
  await browser.open(`${base}/manual.html`);
  await browser.waitFor("document.querySelectorAll('.mb-page').length === 2", 15000, 'muted manual load');
  await sleep(200);
  check((await masterGain()) === 0, `Persisted readSoundPref muted=true starts startPageAudio muted (gain=${await masterGain()})`);
  await $('localStorage.removeItem("out-of-credits:sound:v1")');

  // 6. /comic.html page flips, Pause, panel click
  await browser.open(`${base}/comic.html?chapter=chapter-01-kiroween`);
  await browser.waitFor("!!document.querySelector('#comix-next')", 15000, 'comic reader');
  await waitCue('music/comic_reader', 5000);
  await checkClickCue('Comic reader Next page', '#comix-next', 'sfx/page_turn');
  await checkClickCue('Comic reader Prev page', '#comix-prev', 'sfx/page_turn');
  await checkClickCue('Comic reader Pause toggle', '#comix-pause', 'sfx/menu_move');
  await checkClickCue('Comic reader Panel click', '.comix-panel', 'sfx/menu_move');

  // 7. /cinematic.html preview audio (Spacebar pause keeps cine_intro + rain_loop paused while menu_move plays, Esc Skip cleanup)
  await browser.open(`${base}/cinematic.html`);
  await browser.waitFor("!!document.querySelector('button[data-play]')", 15000, 'cinematic preview menu');
  await clearSpy();
  await realClick('button[data-play="intro"]', 500);
  await waitCue('music/cine_intro', 5000);
  await waitCue('sfx/rain_loop', 6000);
  const cineStart = await cues();
  check(cineStart.includes('music/cine_intro') && cineStart.includes('sfx/rain_loop'), `/cinematic.html starts music/cine_intro + sfx/rain_loop (${JSON.stringify(cineStart)})`);
  await clearSpy();
  await pressKey(' ', 'Space', 32, ' ');
  await sleep(250);
  const spPauseActive = await activeCues();
  check(
    (await cues()).includes('sfx/menu_move') && !spPauseActive.includes('music/cine_intro') && !spPauseActive.includes('sfx/rain_loop'),
    `/cinematic.html Spacebar pause plays menu_move and pauses bed+rain (active ${JSON.stringify(spPauseActive)})`,
  );
  await clearSpy();
  await sleep(400);
  check((await cues()).length === 0, '/cinematic.html stays silent while Spacebar paused');
  await clearSpy();
  await pressKey(' ', 'Space', 32, ' ');
  await sleep(350);
  const spCont = await cues();
  check(
    spCont.includes('sfx/menu_move') && spCont.includes('music/cine_intro') && spCont.includes('sfx/rain_loop'),
    `/cinematic.html Spacebar resume plays menu_move + restarts cine_intro + rain_loop (${JSON.stringify(spCont)})`,
  );
  await clearSpy();
  await pressKey('Escape', 'Escape', 27);
  await sleep(450);
  check(
    (await cues()).includes('sfx/menu_close') && (await stops()).includes('sfx/rain_loop') && (await stops()).includes('music/cine_intro'),
    '/cinematic.html Escape skip plays menu_close and stops rain_loop + cine_intro',
  );

  // 8. /laptop-lab audio checks (mid-boot fan-off, #ll-sound mute/unmute ordering, failed check -> cmd_fail, icon Enter)
  await browser.open(`${base}/laptop-lab`);
  await browser.waitFor("!!window.__laptop && !!document.querySelector('.lt-lid')", 15000, 'laptop lab');
  await checkClickCue('Laptop Lab lid click', '.lt-lid', 'sfx/lap_open');
  await browser.waitFor("window.__laptop.machine.state === 'open'", 5000, 'laptop open');
  await checkClickCue('Laptop Lab keyboard click', '.lt-key[data-code="KeyA"]', 'sfx/key_press');
  await clearSpy();
  await $('window.__laptop.machine.jump("booting")');
  await waitCue('sfx/lap_fan', 4000);
  await clearSpy();
  await $('window.__laptop.machine.jump("closing")');
  await sleep(350);
  check((await stops()).includes('sfx/lap_fan'), 'Laptop Lab closing from booting stops sfx/lap_fan cleanly');

  await $('window.__laptop.machine.jump("desktop")');
  await browser.waitFor("window.__laptop.machine.state === 'desktop' && !!document.querySelector('.lt-icon')", 5000, 'laptop desktop');
  await clearSpy();
  await realClick('#ll-sound', 250);
  const llMuteGain = await masterGain();
  const llMuteCues = await cues();
  check(llMuteGain === 0 && !llMuteCues.includes('sfx/menu_move'), `Laptop #ll-sound mute leaks zero click (gain=${llMuteGain}, cues=${JSON.stringify(llMuteCues)})`);
  const llUnmuteCues = await checkClickCue('Laptop #ll-sound unmute', '#ll-sound', 'sfx/menu_move');
  check((await masterGain()) > 0 && llUnmuteCues.includes('sfx/menu_move'), `Laptop #ll-sound unmute restores gain + plays menu_move (${JSON.stringify(llUnmuteCues)})`);

  await clearSpy();
  await $('document.querySelector(".lt-icon")?.focus()');
  await pressKey('Enter', 'Enter', 13);
  await waitCue('sfx/lap_trackpad', 4000);
  check((await cues()).includes('sfx/lap_trackpad'), 'Laptop .lt-icon Enter key plays sfx/lap_trackpad');

  await realClick('.ll-link[data-task]', 400);
  await browser.waitFor("!!document.querySelector('.lt-toolbar .lt-btn95[title=\"Check the quest\"]')", 5000, 'laptop workbench check btn');
  await clearSpy();
  await realClick('.lt-toolbar .lt-btn95[title="Check the quest"]', 700);
  await waitCue('sfx/cmd_fail', 5000);
  check((await cues()).includes('sfx/cmd_fail'), 'Laptop failed quest Check emits sfx/cmd_fail');

  // 9. /terminal-lab + live session swap audio check!
  await browser.open(`${base}/terminal-lab`);
  await browser.waitFor("!!window.__terminalLab && !!document.querySelector('iframe')", 20000, 'terminal lab');
  await browser.waitFor("(() => { try { const f = document.querySelector('iframe'); return Boolean(f && f.contentWindow && f.contentWindow.__lab); } catch { return false; } })()", 20000, 'terminal lab iframe');
  await checkClickCue('Terminal Lab host enabled button', 'button:not(:disabled)', 'sfx/menu_move');
  await clearSpy();
  await $('document.querySelector("select.ed-chapter")?.dispatchEvent(new Event("change", { bubbles: true }))');
  await sleep(250);
  check((await cues()).includes('sfx/menu_move'), 'Terminal Lab <select> change emits sfx/menu_move');
  const swapOk = await $(`(() => {
    const f = document.querySelector('iframe');
    const w = f.contentWindow;
    const prevSeq = w.__lab.seq();
    const parts = new URL(f.src).pathname.split('/').filter(Boolean);
    w.__lab.swap(decodeURIComponent(parts[1]), decodeURIComponent(parts[2]));
    return w.__lab.seq() > prevSeq;
  })()`);
  check(swapOk, 'Terminal Lab in-place swap advances __lab.seq()');
  const swapAudioCues = await $(`(async () => {
    const f = document.querySelector('iframe');
    const w = f.contentWindow;
    w.__audioSpy.clear();
    w.document.querySelector('#hud-hint')?.click();
    await w.__term.submit('ls -a');
    await new Promise((r) => setTimeout(r, 450));
    return w.__audioSpy.cues();
  })()`);
  check(
    swapAudioCues.includes('sfx/menu_move') && swapAudioCues.includes('sfx/cmd_ok'),
    `Terminal Lab iframe still plays UI + command SFX after session swap (${JSON.stringify(swapAudioCues)})`,
  );
  const forkCues = await $(`(async () => {
    const f = document.querySelector('iframe');
    const w = f.contentWindow;
    w.__audioSpy.clear();
    const cwd = w.__lab.inspect().cwd;
    w.__lab.inject({
      files: [{ path: cwd + '/forkd_live', kind: 'file', mode: 0o755 }],
      enemy: { id: 'fb_live', type: 'forkbomb', path: cwd + '/forkd_live', pid: 4999 },
    });
    for (let i = 0; i < 4; i += 1) {
      w.__lab.tick();
      await new Promise((r) => setTimeout(r, 120));
      if (w.__audioSpy.cues().includes('sfx/boss_forkbomb')) break;
    }
    await new Promise((r) => setTimeout(r, 250));
    return w.__audioSpy.cues();
  })()`);
  check(forkCues.includes('sfx/boss_forkbomb'), `Terminal Lab injected forkbomb plays live sfx/boss_forkbomb (${JSON.stringify(forkCues)})`);

  // 9b. Live Chromium enemy battles for atk_crack, kill -15, atk_ransomware, kill -STOP / -CONT / -9
  await browser.open(`${base}/play/chapter-01-kiroween/level-03-task-gpu-salvage?nointro=1`);
  await browser.waitFor('window.__term && window.__term.phase() === "play" && !window.__term.busy()', 15000, 'level 3 ready');
  await clearSpy();
  await $('window.__term.submit("chmod 000 port_445")');
  await waitCue('sfx/atk_crack', 5000);
  check((await cues()).includes('sfx/atk_crack'), 'Level 3 crack lock-pick plays live sfx/atk_crack in Chrome');
  await browser.waitFor('!window.__term.busy()', 5000, 'level 3 unbusy');
  await clearSpy();
  await $('window.__term.submit("kill -15 2104")');
  await waitCue('sfx/sigterm', 4000);
  check((await cues()).includes('sfx/sigterm'), 'Level 3 kill -15 2104 plays live sfx/sigterm');

  await browser.open(`${base}/play/chapter-01-kiroween/level-08-task-docker-forge?nointro=1`);
  await browser.waitFor('window.__term && window.__term.phase() === "play" && !window.__term.busy()', 15000, 'level 8 ready');
  await clearSpy();
  await $('window.__term.submit("cat Dockerfile")');
  await waitCue('sfx/perm_denied', 4000);
  check((await cues()).includes('sfx/perm_denied'), 'Level 8 encrypted Dockerfile cat plays live sfx/perm_denied');
  await clearSpy();
  for (let i = 0; i < 3; i += 1) {
    await browser.waitFor('!window.__term.busy()', 5000, 'level 8 unbusy before ls');
    await $('window.__term.submit("ls")');
    await sleep(300);
    if ((await cues()).includes('sfx/atk_ransomware')) break;
  }
  check((await cues()).includes('sfx/atk_ransomware'), 'Level 8 ransomware plays live sfx/atk_ransomware in Chrome');
  await browser.waitFor('!window.__term.busy()', 5000, 'level 8 unbusy before signals');
  await clearSpy();
  await $('window.__term.submit("kill -STOP 4108")');
  await waitCue('sfx/sigstop', 4000);
  check((await cues()).includes('sfx/sigstop'), 'Level 8 kill -STOP plays live sfx/sigstop');
  await browser.waitFor('!window.__term.busy()', 5000, 'level 8 unbusy before CONT');
  await clearSpy();
  await $('window.__term.submit("kill -CONT 4108")');
  await waitCue('sfx/sigcont', 4000);
  check((await cues()).includes('sfx/sigcont'), 'Level 8 kill -CONT plays live sfx/sigcont');
  await browser.waitFor('!window.__term.busy()', 5000, 'level 8 unbusy before -9');
  await clearSpy();
  await $('window.__term.submit("kill -9 4108")');
  await waitCue('sfx/kill', 4000);
  const ransomKillCues = await cues();
  check(ransomKillCues.includes('sfx/lightning') && ransomKillCues.includes('sfx/kill'), `Level 8 kill -9 plays lightning + kill (${JSON.stringify(ransomKillCues)})`);

  // 10. Boss Code Editor (open, .ce-chip, Ctrl+S, Esc close) + kill -9 + Outro + Stats screen
  await browser.open(`${base}/play/chapter-01-kiroween/level-11-boss-clod-core?nointro=1`);
  await browser.waitFor('window.__term && window.__term.phase() === "play" && !window.__term.busy()', 15000, 'boss level ready');
  await sleep(300);
  await clearSpy();
  await $('window.__term.submit("edit core_anchor.conf")');
  await browser.waitFor("!!document.querySelector('#code-editor-pane:not(.hidden)')", 5000, 'code editor open');
  await sleep(250);
  check((await cues()).includes('sfx/menu_open'), 'Code Editor open plays sfx/menu_open');
  if (await $('!!document.querySelector(".ce-chip")')) {
    const chipCues = await checkClickCue('Code Editor quick-patch .ce-chip', '.ce-chip', 'sfx/cmd_ok');
    check(!chipCues.includes('sfx/menu_move'), `Code Editor .ce-chip emits cmd_ok without menu_move clash (${JSON.stringify(chipCues)})`);
    const reclickCues = await checkClickCue('Code Editor already-applied .ce-chip re-click', '.ce-chip.applied, .ce-chip', 'sfx/menu_move');
    check(!reclickCues.includes('sfx/cmd_ok'), `Already-applied .ce-chip plays menu_move without re-saving (${JSON.stringify(reclickCues)})`);
  }
  await $('document.querySelector("#ce-textarea")?.focus()');
  await clearSpy();
  await pressKey('s', 'KeyS', 83, undefined, 2);
  await sleep(350);
  check((await cues()).includes('sfx/cmd_ok'), 'Code Editor Ctrl+S save plays sfx/cmd_ok');
  await clearSpy();
  await pressKey('Escape', 'Escape', 27);
  await browser.waitFor("!!document.querySelector('#code-editor-pane.hidden')", 4000, 'code editor close');
  await sleep(250);
  check((await cues()).includes('sfx/menu_close'), 'Code Editor Esc close plays sfx/menu_close');

  await clearSpy();
  await $('window.__term.submit("kill -9 1")');
  await waitCue('sfx/perm_denied', 4000);
  check((await cues()).includes('sfx/perm_denied'), 'Boss shielded kill -9 1 plays sfx/perm_denied');

  await clearSpy();
  for (const cmd of [
    'cat clod_prompt_flood.stream > /dev/null',
    'grep OPEN_WEIGHT_SIG open_weights_advisor.log > kiro_override.sock',
    "sed -i 's/clod_supervisor_lock=true/clod_supervisor_lock=false/' core_anchor.conf",
    'kill -9 1',
  ]) {
    await browser.waitFor('!window.__term.busy()', 5000, 'term unbusy');
    await $(`window.__term.submit(${JSON.stringify(cmd)})`);
    await sleep(400);
  }
  await waitCue('sfx/boss_defeated', 6000);
  const killCues = await cues();
  check(killCues.includes('sfx/lightning') && killCues.includes('sfx/boss_defeated') && killCues.includes('sfx/battle_won'), `Boss defeat + SIGKILL plays lightning + boss_defeated + battle_won (${JSON.stringify(killCues)})`);

  await browser.waitFor('!window.__term.busy()', 5000, 'term unbusy before exit');
  await clearSpy();
  await $(`window.__term.submit('exit')`);
  await waitCue('sfx/rank_reveal', 6000);
  const exitCues = await cues();
  check(exitCues.includes('sfx/lightning') && exitCues.includes('sfx/rank_reveal'), `GAME_ENDED exit plays lightning + rank_reveal (${JSON.stringify(exitCues)})`);

  // Wait for outro cinematic, then skip to stats screen
  await browser.waitFor('window.__term.phase() === "outro" || window.__term.statsOpen()', 10000, 'outro or stats');
  let escGuard = 0;
  while (!(await $('window.__term.statsOpen()')) && escGuard++ < 15) {
    await pressKey('Escape', 'Escape', 27);
    await sleep(500);
  }
  await browser.waitFor('window.__term.statsOpen()', 10000, 'stats screen');
  await waitCue('music/rank_card', 6000);
  check((await cues()).includes('music/rank_card'), 'Stats screen starts music/rank_card cleanly');
  await $('window.__stage.stage.devNoStorm = false; window.__stage.stage.stormOn = true; window.__stage.stage.stormIn = 0.05;');
  await clearSpy();
  await sleep(350);
  check(!(await cues()).includes('sfx/thunder_far'), 'Stats screen blocks phantom ambient thunder_far when stormIn expires');
  await checkClickCue('Stats #outro-skip checkbox', '#outro-skip', 'sfx/menu_move');
  const expCues = await checkClickCue('Stats #outro-export button', '#outro-export', 'sfx/cmd_ok');
  check(!expCues.includes('sfx/menu_move'), `Stats #outro-export plays only sfx/cmd_ok without download-anchor echo (${JSON.stringify(expCues)})`);

  await clearSpy();
  await realClick('#outro-again', 600);
  const againCues = await cues();
  const againPhase = await $('window.__term.phase()');
  check(againPhase === 'intro', `Stats #outro-again starts intro phase (got ${againPhase})`);
  check(againCues.includes('sfx/level_restart'), `Stats #outro-again plays level_restart (${JSON.stringify(againCues)})`);
  for (const leaked of ['sfx/title_card', 'sfx/emote_shock', 'sfx/agent_taunt', 'sfx/enemy_spawn', 'music/floor_attic_intro', 'sfx/thunder_far']) {
    check(!againCues.includes(leaked), `Stats #outro-again does not emit premature ${leaked} during intro (${JSON.stringify(againCues)})`);
  }
  await waitCue('music/cine_intro', 8000);
  await sleep(450); // clear 400ms keyboard skip grace window
  await clearSpy();
  await pressKey('Escape', 'Escape', 27);
  await browser.waitFor('window.__term.phase() === "play" && !window.__term.busy()', 12000, 'post-again Level 1 ready');
  await waitCue('music/floor_attic_intro', 6000);
  const postAgainCues = await cues();
  check(
    postAgainCues.includes('sfx/lightning') && postAgainCues.includes('sfx/thunder_close') && postAgainCues.includes('sfx/title_card') && postAgainCues.includes('music/floor_attic_intro'),
    `Post-PlayAgain intro skip plays Level 1 arrival cues (${JSON.stringify(postAgainCues)})`,
  );
  const postAgainCaption = await $('document.querySelector("#stage-caption")?.textContent || ""');
  check(postAgainCaption.includes('LEVEL 01/'), `Post-PlayAgain resets stage to Level 1 room (got "${postAgainCaption}")`);
  check((await failedFetches()).length === 0, `Zero failed SFX/music HTTP fetches across suite (${JSON.stringify(await failedFetches())})`);
  check(browser.problems.length === 0, `zero browser console/page errors (${JSON.stringify(browser.problems)})`);
} finally {
  await browser.close();
  if (vite) await vite.close();
}

finish('audio-smoke');
