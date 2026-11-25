#!/usr/bin/env node
// Unit tests for the laptop's pure domain (src/laptop/domain) and the game inventory (src/game/inventory.ts).
//   node scripts/harness/laptop-unit.mjs
// No browser: the state machine (with a fake clock), the window manager, checks, keyboard layout, boot timeline,
// camera framing, saved progress, the task catalogue and the inventory command.
import assert from 'node:assert/strict';
import { withProcgen } from './lib/load.mjs';
import { testRunner } from './lib/test-kit.mjs';

const { test, count } = testRunner();

/** A clock the test advances by hand. */
function fakeClock() {
  let now = 0;
  let timers = [];
  return {
    after(ms, fn) {
      const t = { at: now + ms, fn };
      timers.push(t);
      return () => { timers = timers.filter((x) => x !== t); };
    },
    /** Moves time forward, firing each timer at its own moment (a timer set by a timer counts from then). */
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((t) => t !== due);
        now = due.at;
        due.fn();
      }
      now = end;
    },
    pending: () => timers.length,
  };
}

await withProcgen(async (_p, vite) => {
  const load = (m) => vite.ssrLoadModule(m);
  const machine = await load('/src/laptop/domain/machine.ts');
  const desktop = await load('/src/laptop/domain/desktop.ts');
  const { APPS, APP_ORDER } = await load('/src/laptop/domain/apps.ts');
  const checks = await load('/src/laptop/domain/checks.ts');
  const { TASKS, modeOf } = await load('/src/laptop/domain/tasks.ts');
  const kb = await load('/src/laptop/domain/keyboard.ts');
  const boot = await load('/src/laptop/domain/boot.ts');
  const geo = await load('/src/laptop/domain/geometry.ts');
  const progress = await load('/src/laptop/domain/progress.ts');
  const run = await load('/src/laptop/domain/run.ts');
  const inv = await load('/src/game/inventory.ts');
  const sound = await load('/src/laptop/runtime/sound.ts');
  const { guardLoops, guardHtmlScripts } = await load('/src/laptop/runtime/loop-guard.ts');

  // ---- state machine ----
  await test('every transition lands on a known state; every state is reachable from closed and can get back', () => {
    for (const [from, edges] of Object.entries(machine.TRANSITIONS)) {
      for (const to of Object.values(edges)) assert.ok(machine.LAPTOP_STATES.includes(to), `${from} -> ${to}`);
      assert.ok(machine.pathTo('closed', from), `closed reaches ${from}`);
      assert.ok(machine.pathTo(from, 'closed'), `${from} gets back to closed`);
    }
  });
  await test('timed phases are exactly the states that leave on DONE', () => {
    for (const s of machine.LAPTOP_STATES) assert.equal(machine.PHASE_MS[s] !== undefined, 'DONE' in machine.TRANSITIONS[s], s);
  });
  await test('nextState ignores events a state does not take; userEvents hides DONE', () => {
    assert.equal(machine.nextState('closed', 'POWER'), null);
    assert.equal(machine.nextState('open', 'POWER'), 'diving');
    assert.deepEqual(machine.userEvents('opening'), []);
    assert.deepEqual(machine.userEvents('open'), ['POWER', 'CLOSE']);
  });
  await test('the machine runs its phases on the clock and walks the whole loop', () => {
    const clock = fakeClock();
    const seen = [];
    const m = machine.createMachine(clock, (s) => seen.push(s));
    assert.equal(m.send('POWER'), false, 'a shut laptop ignores the power button');
    m.send('OPEN');
    clock.advance(machine.PHASE_MS.opening - 1);
    assert.equal(m.state, 'opening');
    clock.advance(1);
    assert.equal(m.state, 'open');
    m.send('POWER');
    clock.advance(machine.PHASE_MS.diving + machine.PHASE_MS.booting);
    assert.equal(m.state, 'desktop');
    m.send('POWER');
    clock.advance(machine.PHASE_MS.shutting + machine.PHASE_MS.surfacing);
    m.send('CLOSE');
    clock.advance(machine.PHASE_MS.closing);
    assert.deepEqual(seen, ['opening', 'open', 'diving', 'booting', 'desktop', 'shutting', 'surfacing', 'open', 'closing', 'closed']);
    assert.equal(clock.pending(), 0);
  });
  await test('leaving a timed phase early cancels its timer; jump goes straight there; speed scales phases', () => {
    const clock = fakeClock();
    const m = machine.createMachine(clock, () => {});
    assert.ok(m.jump('booting'));
    assert.equal(m.state, 'booting');
    assert.equal(clock.pending(), 1, 'only the booting timer is armed');
    m.send('POWER');
    assert.equal(m.state, 'shutting');
    assert.equal(clock.pending(), 1);
    m.speed = 0;
    m.jump('open');
    m.send('CLOSE');
    clock.advance(0);
    assert.equal(m.state, 'closed');
    m.dispose();
  });
  await test('every state has a look; the camera dives only between diving and shutting', () => {
    for (const s of machine.LAPTOP_STATES) assert.ok(machine.LOOKS[s], s);
    assert.equal(machine.LOOKS.open.camera, 'far');
    assert.equal(machine.LOOKS.desktop.camera, 'near');
    assert.equal(machine.LOOKS.closed.lid, 'shut');
  });

  // ---- window manager ----
  await test('open, focus, minimise, close, move', () => {
    let s = desktop.emptyDesktop();
    s = desktop.reduceDesktop(s, { type: 'open', app: 'jspad' });
    s = desktop.reduceDesktop(s, { type: 'open', app: 'weaver' });
    assert.equal(s.focus, 'weaver');
    assert.notDeepEqual([s.windows[0].x, s.windows[0].y], [s.windows[1].x, s.windows[1].y], 'new windows cascade');
    s = desktop.reduceDesktop(s, { type: 'open', app: 'jspad' });
    assert.equal(s.windows.length, 2, 'one window per app');
    assert.equal(s.focus, 'jspad');
    assert.ok(s.windows.find((w) => w.app === 'jspad').z > s.windows.find((w) => w.app === 'weaver').z, 'focus raises');
    s = desktop.reduceDesktop(s, { type: 'minimize', app: 'jspad' });
    assert.equal(s.focus, 'weaver', 'minimising hands focus to the top visible window');
    s = desktop.reduceDesktop(s, { type: 'move', app: 'weaver', x: 9999, y: -50 });
    const w = s.windows.find((x) => x.app === 'weaver');
    assert.ok(w.x <= desktop.SCREEN.w - 40 && w.y === 0, 'windows stay grabbable on screen');
    s = desktop.reduceDesktop(s, { type: 'close', app: 'weaver' });
    assert.equal(s.focus, null, 'only a minimised window is left');
    assert.equal(desktop.reduceDesktop(s, { type: 'close', app: 'quests' }), s, 'closing a closed app changes nothing');
    s = desktop.reduceDesktop(s, { type: 'move-icon', app: 'jspad', x: 9999, y: -40 });
    assert.deepEqual(s.icons.jspad, { x: desktop.SCREEN.w - desktop.ICON.w, y: 0 }, 'moved icons clamp inside the desktop');
    s = desktop.reduceDesktop(s, { type: 'arrange-icons' });
    assert.deepEqual(s.icons.jspad, desktop.defaultIcons().jspad, 'arrange-icons resets icon positions');
  });
  await test('every app has a title, a non-redundant icon glyph, and a window that fits the screen', () => {
    assert.deepEqual([...APP_ORDER].sort(), Object.keys(APPS).sort());
    for (const a of Object.values(APPS)) assert.ok(a.title && a.glyph && a.size[0] <= desktop.SCREEN.w && a.size[1] <= desktop.SCREEN.h, a.id);
    assert.equal(APPS.jspad.glyph, '{}');
    const q = desktop.reduceDesktop(desktop.emptyDesktop(), { type: 'open', app: 'quests' });
    assert.ok(q.windows[0].x >= 96, 'initial window opens clear of the desktop icon column');
  });
  await test('laptop keyboard sounds distinguish Enter, Backspace/Delete, Tab, and regular keys', () => {
    assert.equal(sound.keyActionFor('Enter'), 'key-enter');
    assert.equal(sound.keyActionFor('NumpadEnter'), 'key-enter');
    assert.equal(sound.keyActionFor('Backspace'), 'key-backspace');
    assert.equal(sound.keyActionFor('Delete'), 'key-backspace');
    assert.equal(sound.keyActionFor('Tab'), 'key-tab');
    assert.equal(sound.keyActionFor('KeyA'), 'key');
  });

  // ---- checks ----
  const report = (over) => ({ ...run.emptyReport(), ...over });
  await test('requestFor merges probes per selector and collects expressions', () => {
    const req = checks.requestFor('page', run.NO_FILES, [
      { kind: 'element', selector: 'h1', label: '' },
      { kind: 'style', selector: 'h1', prop: 'color', equals: '', label: '' },
      { kind: 'value', expr: 'f()', equals: '1', label: '' },
      { kind: 'value', expr: 'f()', equals: '1', label: '' },
    ], [{ click: '#b' }]);
    assert.deepEqual(req.probes, [{ selector: 'h1', styles: ['color'] }]);
    assert.deepEqual(req.exprs, ['f()']);
    assert.deepEqual(req.actions, [{ click: '#b' }]);
  });
  await test('judge decides each kind of check', () => {
    const files = { html: '', css: '', js: 'for (;;) break;' };
    const r = report({
      logs: [{ level: 'log', text: ' a ' }, { level: 'log', text: 'b' }],
      values: { 'f()': '5' },
      probes: { h1: { count: 2, text: 'Hello there', styles: { color: 'rgb(1, 2, 3)' } } },
    });
    const got = checks.judge([
      { kind: 'log', equals: 'a', label: 'log=' },
      { kind: 'log', includes: 'zzz', label: 'log~' },
      { kind: 'logs', lines: ['a', 'b'], label: 'logs' },
      { kind: 'noError', label: 'ok' },
      { kind: 'value', expr: 'f()', equals: '5', label: 'value' },
      { kind: 'element', selector: 'h1', min: 2, text: 'Hello', label: 'el' },
      { kind: 'element', selector: 'p', label: 'missing' },
      { kind: 'style', selector: 'h1', prop: 'color', equals: 'rgb(1, 2, 3)', label: 'style' },
      { kind: 'source', file: 'js', includes: 'FOR', label: 'src' },
    ], r, files);
    assert.deepEqual(got.map((c) => c.ok), [true, false, true, true, true, true, false, true, true]);
    assert.equal(checks.judge([{ kind: 'noError', label: '' }], report({ timedOut: true }), files)[0].ok, false, 'a timeout is not a clean run');
    assert.equal(checks.allPassed([]), false, 'no checks is not a pass');
  });

  // ---- tasks ----
  await test('tasks have unique ids, a code app, checks, and starter and solution files', () => {
    assert.equal(new Set(TASKS.map((t) => t.id)).size, TASKS.length);
    for (const t of TASKS) {
      assert.ok(['jspad', 'weaver'].includes(t.app) && t.checks.length && t.brief && t.hint, t.id);
      for (const f of [t.starter, t.solution]) assert.ok(['html', 'css', 'js'].every((k) => typeof f[k] === 'string'), t.id);
      assert.equal(modeOf(t.app), t.app === 'jspad' ? 'script' : 'page');
      for (const c of t.checks.filter((x) => x.kind === 'source')) assert.ok(checks.judge([c], report({}), t.solution)[0].ok, `${t.id}: the solution meets its source check`);
    }
  });

  // ---- keyboard ----
  await test('every keyboard row is 15 units wide and key codes are unique', () => {
    for (const row of kb.KEY_ROWS) assert.equal(row.reduce((s, k) => s + k.w, 0), kb.ROW_UNITS, row[0].code);
    assert.equal(new Set(kb.ALL_KEYS.map((k) => k.code)).size, kb.ALL_KEYS.length);
  });
  await test('real key codes find their deck key', () => {
    assert.equal(kb.deckKeyFor('KeyQ'), 'KeyQ');
    assert.equal(kb.deckKeyFor('Numpad7'), 'Digit7');
    assert.equal(kb.deckKeyFor('MetaRight'), 'MetaLeft');
    assert.equal(kb.deckKeyFor('MediaPlayPause'), null);
  });

  // ---- boot, framing, progress ----
  await test('the boot timeline only grows and ends on a full bar', () => {
    let lines = 0;
    let filled = 0;
    for (let t = 0; t <= machine.PHASE_MS.booting; t += 50) {
      const f = boot.bootFrame(t);
      assert.ok(f.lines.length >= lines && f.filled >= filled, `t=${t}`);
      lines = f.lines.length;
      filled = f.filled;
    }
    assert.equal(filled, boot.BOOT.blocks);
    assert.ok(boot.bootFrame(1400).lines.some((l) => l.endsWith(`${boot.BOOT.memory.kb}K OK`)));
  });
  await test('the camera frames the laptop inside the view and dives closer', () => {
    for (const [vw, vh] of [[1280, 800], [800, 1000], [1900, 700]]) {
      const far = geo.framing({ camera: 'far', lid: 'up' }, vw, vh);
      const near = geo.framing({ camera: 'near', lid: 'up' }, vw, vh);
      const shut = geo.framing({ camera: 'far', lid: 'shut' }, vw, vh);
      assert.ok(far.zoom > 0 && near.zoom > far.zoom && near.tilt < far.tilt, `${vw}x${vh}`);
      assert.equal(shut.zoom, far.zoom, 'opening the lid does not zoom');
      assert.ok(geo.LAPTOP.deckW * near.zoom <= vw, 'the near deck fits the width');
    }
    assert.equal(geo.geometryVars()['--lid-open'], `${geo.LAPTOP.lidOpenDeg - 180}deg`);
  });
  await test('saved progress parses defensively', () => {
    assert.deepEqual(progress.parseProgress(null), progress.emptyProgress());
    assert.deepEqual(progress.parseProgress('{oops'), progress.emptyProgress());
    const p = progress.parseProgress(JSON.stringify({ done: ['a', 3], drafts: { a: { html: '', css: '', js: 'x' }, b: { js: 1 } } }));
    assert.deepEqual(p.done, ['a']);
    assert.deepEqual(Object.keys(p.drafts), ['a']);
    assert.equal(progress.markDone(p, 'a'), p);
    assert.deepEqual(progress.saveDraft(p, 'c', run.NO_FILES).drafts.c, run.NO_FILES);
  });

  // ---- loop protection ----
  await test('loops get a line-numbered check; for-in/of and do get theirs from the condition', () => {
    assert.equal(guardLoops('while (x) {}'), 'while (__lg(1) && (x)) {}');
    assert.equal(guardLoops('for (;;) {}'), 'for (; __lg(1);) {}');
    assert.equal(guardLoops('let a;\nfor (let i = 0; i < n; i++) {}'), 'let a;\nfor (let i = 0; __lg(2) && ( i < n); i++) {}');
    assert.equal(guardLoops('do { k++ } while (k < 3);'), 'do { k++ } while (__lg(1) && (k < 3));');
    assert.equal(guardLoops('for (const k of xs) {}'), 'for (const k of xs) {}');
    assert.equal(guardLoops('for (const k in o) {}'), 'for (const k in o) {}');
    assert.equal(guardLoops('for (let i = 0; i < f(a, b); i++) {}'), 'for (let i = 0; __lg(1) && ( i < f(a, b)); i++) {}');
    const nested = guardLoops('for (;;) {\n  while (y) {}\n}');
    assert.ok(nested.includes('__lg(1)') && nested.includes('while (__lg(2) && (y))'), nested);
  });
  await test('loop words in strings, comments, templates, regexes and property names are left alone', () => {
    for (const src of [
      '"while (x) {}"', "'for (;;)'", '// while (true) {}', '/* for (;;) {} */',
      '`while (${a}) for(;;)`', 'const r = /while (x)/g;', 'obj.while(1); a.for(2)', 'x = a / b; while2(3)',
    ]) assert.equal(guardLoops(src), src, src);
    const inTemplate = guardLoops('`${(() => { while (q) {} return 1; })()}`');
    assert.ok(inTemplate.includes('while (__lg(1) && (q))'), 'code inside ${} is still code');
  });
  await test('unreadable source comes back unchanged and guarded source still parses', () => {
    for (const src of ['while (x {', '"open', '/* open', '`open ${', 'for (;;) }']) assert.equal(guardLoops(src), src, src);
    for (const t of TASKS) new Function('__lg', guardLoops(t.solution.js));
    new Function('__lg', guardLoops('label: for (let i = 0; i < 3; i++) { for (;;) { break label; } }\nwhile ((a = b())) {}\nconst x = y / 2 / z; if (/a/.test(s)) {}'));
  });

  await test('inline scripts of an HTML file are guarded with lines counted from the file top', () => {
    const html = '<h1>t</h1>\n<script>\nwhile (a) {}\n</script>\n<script src="x.js"></script>\n<p>for (;;) {}</p>';
    const out = guardHtmlScripts(html);
    assert.ok(out.includes('while (__lg(3) && (a))'), out);
    assert.ok(out.endsWith('<script src="x.js"></script>\n<p>for (;;) {}</p>'), 'external scripts and text stay as written');
    assert.equal(guardHtmlScripts('<p>plain</p>'), '<p>plain</p>');
    assert.equal(guardHtmlScripts('<a>\n<body onload="while (1) {}">'), '<a>\n<body onload="while (__lg(2) && (1)) {}">', 'on... attributes too');
    assert.equal(guardHtmlScripts('<b onclick="while (a &amp;&amp; b) {}">'), '<b onclick="while (a &amp;&amp; b) {}">', 'attributes with entities are left alone');
  });

  // ---- the game inventory ----
  await test('the inventory starts with the lantern, terminal, and manual in hand and holds only what it has', () => {
    const start = inv.starterInventory();
    assert.deepEqual(start, { items: ['lantern', 'terminal', 'manual'], held: 'lantern' });
    assert.equal(inv.holdItem(start, 'laptop'), start);
    const withLaptop = inv.giveItem(start, 'laptop');
    assert.equal(inv.giveItem(withLaptop, 'laptop'), withLaptop, 'an item is given once');
    assert.equal(inv.holdItem(withLaptop, 'terminal').held, 'terminal');
    assert.equal(inv.holdItem(withLaptop, 'manual').held, 'manual');
    assert.equal(inv.holdItem(withLaptop, 'laptop').held, 'laptop');
    assert.equal(inv.heroModel('terminal'), 'vibecoder.dev_terminal');
    assert.equal(inv.heroModel('manual'), 'vibecoder.dev_manual');
    assert.equal(inv.heroModel('laptop'), 'vibecoder.dev_laptop');
    assert.equal(inv.heroModel(undefined), 'vibecoder.dev');
  });
  await test('inventory / hold commands and Tab completion', () => {
    const start = inv.giveItem(inv.starterInventory(), 'laptop');
    assert.match(inv.inventoryCommand(start, 'inv', []).step.stdout, /\* lantern[\s\S]*terminal[\s\S]*manual[\s\S]*laptop/);
    const held = inv.inventoryCommand(start, 'hold', ['laptop']);
    assert.equal(held.inv.held, 'laptop');
    assert.equal(held.step.code, 0);
    const heldManual = inv.inventoryCommand(start, 'hold', ['manual']);
    assert.equal(heldManual.inv.held, 'manual');
    assert.equal(heldManual.step.code, 0);
    const heldTerm = inv.inventoryCommand(start, 'hold', ['terminal']);
    assert.equal(heldTerm.inv.held, 'terminal');
    assert.equal(heldTerm.step.code, 0);
    assert.equal(inv.inventoryCommand(start, 'hold', ['toString']).step.code, 1, 'prototype keys are not items');
    assert.equal(inv.inventoryCommand(start, 'hold', []).step.code, 1);
    assert.deepEqual(inv.completeHold(start, 't'), ['terminal']);
    assert.deepEqual(inv.completeHold(start, 'm'), ['manual']);
    assert.deepEqual(inv.completeHold(start, 'l'), ['lantern', 'laptop']);
  });
});
console.log(`\nlaptop unit: ${count()} tests passed`);
