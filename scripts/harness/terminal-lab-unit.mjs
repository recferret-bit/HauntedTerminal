#!/usr/bin/env node
// Terminal Lab unit gate: the lab session (`lab` option of ChapterSession), the lab compiler, checks, store, runner, riddles,
// goals, inject, the attack countdown, the command list and the committed fixtures. Runs the real ChapterSession in Node.
//   node scripts/harness/terminal-lab-unit.mjs        exit 0 = every check passed
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { listChapterSlugs, readChapter } from './lib/chapter-compile.mjs';
import { withProcgen } from './lib/load.mjs';
import { testRunner } from './lib/test-kit.mjs';

const { test, count } = testRunner();
const types = (events) => events.map((e) => e.type);
const HURT = ['PLAYER_DAMAGED', 'PLAYER_RESPAWNED'];
const fixtureDir = new URL('./terminal-lab/', import.meta.url);
const fixtures = () => readdirSync(fixtureDir).filter((f) => f.endsWith('.lab.json')).map((f) => ({ f, text: readFileSync(new URL(f, fixtureDir), 'utf8') }));

/** A hand-written one-level pack, so the session options are tested without the lab compiler. */
function rawPack(script) {
  const real = readChapter(listChapterSlugs()[0]);
  const level = {
    id: 'lab-1', index: 1, title: 'Lab', cwd: '/lab', roomKind: 'lab_hall', floorTheme: 2, mechanic: 'terminal', summary: 'Synthetic lab level.',
    files: [
      { path: '/lab/notes.txt', kind: 'file', content: 'FATAL a\nFATAL b\nok\n' },
      { path: '/lab/gate.sock', kind: 'socket', content: 'How many FATAL lines?' },
      { path: '/lab/port_445', kind: 'dir' },
      { path: '/lab/energy.cell', kind: 'file', content: '' },
    ],
    enemies: [{ id: 'v1', type: 'virus', path: '/lab/virus.exe', pid: 4001 }, { id: 'w1', type: 'worm', path: '/lab/port_445/worm.bin', pid: 445, port: '/lab/port_445' }],
    pickups: [{ id: 'e1', type: 'energy', path: '/lab/energy.cell' }],
    patches: [],
    winRules: [{ kind: 'read_file', path: '/lab/notes.txt', description: 'Read the notes' }],
    solutionCommands: ['cat notes.txt'],
    ...(script ? { script } : {}),
  };
  const entry = { index: 1, id: level.id, title: level.title, cwd: level.cwd, roomKind: level.roomKind, floorTheme: 2, mechanic: 'terminal', mechanicLabel: 'Lab', difficulty: 1, teaches: [], enemies: ['virus', 'worm'] };
  return { manifest: { ...real.manifest, id: 'lab-unit', levels: [entry] }, levels: [level], dialogs: { levels: {} } };
}

await withProcgen(async (_p, vite) => {
  const load = (path) => vite.ssrLoadModule(path);
  const { createChapterSession } = await load('/src/chapters/chapter-session.ts');
  const { normaliseLabConfig } = await load('/src/chapters/lab-config.ts');
  const { matchesPattern, answerMatches, patternError } = await load('/src/chapters/session-lab-checks.ts');
  const { validatePack } = await load('/src/chapters/validate-pack.ts');
  const { BESTIARY, PICKUP_INFO } = await load('/src/game/bestiary.ts');
  const { buildLabPack, newLabScript, labPackId } = await load('/src/terminal-lab/lab-pack.ts');
  const { paletteGroups, expectedPaletteIds } = await load('/src/terminal-lab/catalog.ts');
  const { checkLab } = await load('/src/terminal-lab/lab-check.ts');
  const store = await load('/src/terminal-lab/store.ts');
  const runner = await load('/src/terminal-lab/runner.ts');
  const { createNodeDriver, openLabSession } = await load('/src/terminal-lab/node-driver.ts');
  const { speechOutput } = await load('/src/terminal-lab/lab-steps.ts');
  const cmds = await load('/src/terminal-lab/commands.ts');
  const { contextCommands } = await load('/src/terminal-lab/context.ts');
  const { LabModel } = await load('/src/terminal-lab/lab-model.ts');
  const { importChapterLevelRef, levelToLabScript, listImportableLevels } = await load('/src/terminal-lab/level-import.ts');
  const { RunControl } = await load('/src/terminal-lab/run-control.ts');
  const { createSession } = await load('/src/game/session.ts');
  const disk = await load('/src/terminal-lab/disk.ts');
  const { ConflictError } = await load('/src/editor-core/http.ts');
  const { applyHeroFaceTier, heroFaceTierForHp, PORTRAIT_FRAMES, rasterPortraitFrame } = await load('/src/renderer/portrait.ts');
  const { ModelCatalog } = await load('/src/procgen/index.ts');
  const { heroFaceTierForHp: uiHeroFaceTierForHp } = await load('/src/ui/dom-lite.ts');
  const { ENTER_MS, EXIT_MS, HEAD_FRAME_MS, mountDialogBox } = await load('/src/ui/dialog-box.ts');
  const { mountDialogOrchestrator, stripSpeakerPrefix } = await load('/src/ui/dialog-orchestrator.ts');

  const raw = (lab, script) => {
    const s = createChapterSession({ chapterId: 'lab-unit', pack: rawPack(script), preview: true, startLevelId: 'lab-1', ...(lab ? { lab } : {}) });
    s.skipIntro();
    return s;
  };
  const labCfg = (extra = {}) => ({ ...normaliseLabConfig(null), ...extra });
  const lab = () => newLabScript('t', 'T');
  const play = openLabSession;
  const entries = () => paletteGroups().flatMap((g) => g.entries);
  const place = (script, id) => script.setup.push(...entries().find((e) => e.id === id).make(script));
  const exec = (script, options = {}) => runner.runSteps(createNodeDriver(script), script.steps, options);
  const goal = (s, id) => s.inspect().goals.find((x) => x.id === id);

  // ---- the lab session option ---------------------------------------------------------------------------------------
  await test('control: a live virus and worm lower HP on a normal session, so the no-damage checks mean something', () => {
    const s = raw();
    s.exec('ls');
    let hurt = 0;
    let lowest = 100;
    // Turn-based: labTick() forces the enemy turn of the battle the room started (a timer runout does the same).
    for (let i = 0; i < 30; i++) {
      const res = s.labTick();
      hurt += types(res.events).filter((t) => t === 'PLAYER_DAMAGED').length;
      lowest = Math.min(lowest, res.snapshot.hp);
    }
    assert.ok(hurt > 0 && lowest < 100);
  });

  await test('lab: 30 ticks next to a live virus and worm leave HP at max; damage is counted per source; enemies still attack', () => {
    const s = raw(labCfg());
    s.exec('ls');
    const all = [];
    for (let i = 0; i < 30; i++) all.push(...types(s.labTick().events));
    assert.equal(s.snapshot().hp, s.snapshot().maxHp);
    assert.ok(!all.some((t) => HURT.includes(t)));
    assert.ok(all.includes('ENEMY_ATTACK'));
    assert.ok(s.inspect().absorbed['virus.exe'] > 0);
  });

  await test('lab: a trapped `source` costs no HP and does not reboot the level', () => {
    const s = raw(labCfg());
    assert.ok(!types(s.exec('source virus.exe').events).includes('PLAYER_RESPAWNED'));
    assert.deepEqual([s.snapshot().hp, s.snapshot().cwd], [100, '/lab']);
  });

  await test('lab: the manual clock stops tick(), labTick() moves the world; a live clock ticks and latches checks on tick()', () => {
    const s = raw(labCfg());
    s.exec('ls');
    for (let i = 0; i < 30; i++) assert.deepEqual(s.tick().events, []);
    assert.equal(s.inspect().absorbedTotal, 0);
    for (let i = 0; i < 30; i++) s.labTick();
    assert.ok(s.inspect().absorbedTotal > 0);
    // The live clock runs the battle intro down: its end (the player's first turn) is an event of a tick.
    const check = { id: 'atk', description: 'turn', when: { kind: 'event', type: 'BATTLE_TURN' } };
    const live = raw(labCfg({ clock: 'live', content: { riddles: [], checks: [check], taskIds: [] } }));
    live.exec('ls');
    for (let i = 0; i < 20; i++) live.tick();
    assert.equal(goal(live, 'atk').done, true, 'observe runs on the live tick too');
  });

  await test('lab: extraActors join the room view; a game session has none and reports no goals', () => {
    const prop = { key: 'entity', id: 'lab:fan1', model: 'prop.fan', kind: 'prop', state: 'idle', x: 3.8, hidden: false, label: 'fan' };
    assert.ok(raw(labCfg({ extraActors: [prop] })).snapshot().room.actors.some((a) => a.id === 'lab:fan1'));
    const game = raw();
    assert.ok(!game.snapshot().room.actors.some((a) => a.id === 'lab:fan1'));
    assert.deepEqual(game.inspect().goals, []);
  });

  await test('normaliseLabConfig: garbage and partial configs become a complete, safe config that the session can run', () => {
    const empty = { clock: 'manual', extraActors: [], content: { riddles: [], checks: [], taskIds: [] } };
    for (const junk of [null, 'x', 7, [], { content: 'x' }, { clock: 'fast', extraActors: 'x' }]) assert.deepEqual(normaliseLabConfig(junk), empty);
    const partial = normaliseLabConfig({ clock: 'live', content: { riddles: [{ id: 'r' }, { id: 'ok', path: '/lab/gate.sock', answer: '2' }], checks: [{ id: 'c', when: { kind: 'telepathy' } }, { id: 'd', when: { kind: 'ran', pattern: 'ls' } }] }, extraActors: [{ id: 'p' }] });
    assert.equal(partial.clock, 'live');
    assert.deepEqual(partial.content.riddles.map((r) => [r.id, r.speaker, r.hints]), [['ok', 'Socket', []]]);
    assert.deepEqual(partial.content.checks.map((c) => [c.id, c.description]), [['d', 'd']]);
    assert.deepEqual(partial.extraActors, []);
    const s = raw(partial);
    assert.equal(s.exec('ls').code, 0);
    assert.equal(s.exec('echo 2 > gate.sock').code, 0);
    assert.equal(goal(s, 'ok').done, true);
  });

  await test('inspect(): plain data, two reads agree, and goals start with the win rules as tasks', () => {
    const s = raw(labCfg());
    const first = JSON.stringify(s.inspect());
    assert.equal(JSON.stringify(s.inspect()), first);
    const info = s.inspect();
    assert.ok(info.tree.children.find((c) => c.name === 'lab').children.some((c) => c.name === 'notes.txt' && c.content.includes('FATAL')));
    assert.deepEqual(info.entities.map((e) => e.id).sort(), ['e1', 'v1', 'w1']);
    assert.deepEqual(info.goals, [{ id: 'task-1', kind: 'task', description: 'Read the notes', done: false }]);
    s.exec('cat notes.txt');
    s.exec('echo 2 > gate.sock');
    assert.equal(s.inspect().goals[0].done, true);
    assert.equal(s.inspect().sockets['gate.sock'], '2');
  });

  await test('inspect(): an enemy state is the one the stage draws (World.stateOf), frozen included', () => {
    const s = raw(labCfg());
    s.exec('ls -a');
    s.exec('kill -STOP 4001');
    const stage = Object.fromEntries(s.snapshot().room.actors.map((a) => [a.id, a.state]));
    const v1 = s.inspect().entities.find((e) => e.id === 'v1');
    assert.equal(v1.state, 'frozen');
    assert.equal(stage.v1, v1.state);
  });

  await test('attackIn is null while holdEnemiesUntil is unmet, then counts down', () => {
    const s = raw(labCfg(), { holdEnemiesUntil: { kind: 'file_read', path: '/lab/notes.txt' } });
    s.exec('ls');
    assert.equal(s.inspect().entities.find((e) => e.id === 'v1').attackIn, null);
    for (let i = 0; i < 10; i++) s.labTick();
    assert.equal(s.inspect().absorbedTotal, 0, 'held enemies do not fire');
    s.exec('cat notes.txt');
    assert.ok(s.inspect().entities.find((e) => e.id === 'v1').attackIn >= 1);
  });

  await test('restartFloor starts the lab state over: absorbed damage, solved riddles, attempts and latched checks', () => {
    const riddle = { id: 'r1', path: '/lab/gate.sock', answer: '2', speaker: 'Gate', prompt: 'p', hints: [], success: 'Open.', tokens: [] };
    const check = { id: 'ran', description: 'ran ls', when: { kind: 'ran', pattern: 'ls' } };
    const s = raw(labCfg({ content: { riddles: [riddle], checks: [check], taskIds: [] } }));
    s.exec('ls');
    s.exec('echo 9 > gate.sock');
    s.exec('echo 2 > gate.sock');
    for (let i = 0; i < 20; i++) s.labTick();
    assert.ok(s.inspect().absorbedTotal > 0 && goal(s, 'r1').done && goal(s, 'ran').done);
    s.restartFloor();
    s.arriveLevel();
    const after = s.inspect();
    assert.equal(after.absorbedTotal, 0);
    assert.deepEqual(after.goals.filter((x) => x.kind !== 'task').map((x) => [x.id, x.done, x.attempts]), [['ran', false, undefined], ['r1', false, 0]]);
  });

  // ---- patterns -----------------------------------------------------------------------------------------------------
  await test('patterns: plain text is a substring (so /dev/null is text), re: is a regex, a bad regex is reported and matches nothing', () => {
    assert.ok(matchesPattern('hello world', 'lo wo') && !matchesPattern('hello', 'bye'));
    assert.ok(matchesPattern('cat /dev/null', '/dev/null'));
    assert.ok(matchesPattern('HELLO', 're:/^hel+o$/i') && matchesPattern('hello', 're:^hel+o$') && !matchesPattern('hello', 're:^x'));
    assert.ok(!matchesPattern('hello', 're:('));
    assert.equal(patternError('/dev/null'), null);
    assert.match(patternError('re:('), /not a valid regular expression/);
    assert.ok(answerMatches('  /dev/null ', '/dev/null') && !answerMatches('/dev/nullx', '/dev/null') && answerMatches('TWO', 're:/^two$/i'));
  });

  // ---- the lab compiler and the palette -----------------------------------------------------------------------------
  await test('palette: every enemy (from BESTIARY), pickup, placeable model and agent; ids are unique', () => {
    const have = new Set(entries().map((e) => e.id));
    assert.deepEqual(expectedPaletteIds().filter((id) => !have.has(id)), []);
    assert.equal(have.size, entries().length);
    assert.deepEqual(entries().filter((e) => e.group === 'Enemies').map((e) => e.id).sort(), Object.keys(BESTIARY).map((t) => `enemy.${t}`).sort());
  });

  await test('palette: every entry placed alone gives a lab with no errors that boots and shows up in the game', () => {
    for (const e of entries()) {
      const script = lab();
      const before = script.setup.length;
      script.setup.push(...e.make(script));
      const errors = checkLab(script).filter((i) => i.severity === 'error');
      assert.deepEqual(errors, [], `${e.id}: ${errors[0]?.message}`);
      const s = play(script);
      const op = script.setup[before];
      if (op.op === 'enemy' || op.op === 'pickup') assert.ok(s.inspect().entities.some((x) => x.id === op.id), `${e.id} is in the world`);
      if (op.op === 'prop') assert.ok(s.snapshot().room.actors.some((a) => a.id === `lab:${op.id}`), `${e.id} is on the stage`);
    }
  });

  await test('palette: every enemy and pickup in one room do not collide', () => {
    const script = lab();
    for (const e of entries().filter((x) => x.group === 'Enemies' || x.group === 'Pickups')) script.setup.push(...e.make(script));
    assert.deepEqual(checkLab(script).filter((i) => i.severity === 'error'), []);
    assert.equal(play(script).inspect().entities.length, Object.keys(BESTIARY).length + Object.keys(PICKUP_INFO).length);
  });

  await test('buildLabPack: implied files (worm port, exploit buffer, pickup), user files win, and the config carries clock and props', () => {
    const script = lab();
    script.player = { ram: 32, ssd: 256, core: 'qwen' };
    script.enemyFire = 'hold';
    script.clock = 'live';
    script.setup = [
      { op: 'enemy', id: 'w', type: 'worm', path: '/lab/port_9/worm.bin', port: '/lab/port_9' },
      { op: 'enemy', id: 'x', type: 'exploit', path: '/lab/x.bin', buffer: '/lab/x.buf' },
      { op: 'pickup', id: 'p', type: 'ram', path: '/lab/ram_16gb.dimm' },
      { op: 'file', path: '/lab/x.bin', content: 'mine\n' },
      { op: 'npc', agent: 'gork', mood: 'smug', text: 'hi', print: 'GORK SAYS HI' },
      { op: 'prop', id: 'f', model: 'prop.fan', x: 3.8 },
    ];
    const { pack, config } = buildLabPack(script);
    const files = Object.fromEntries(pack.levels[0].files.map((f) => [f.path, f]));
    assert.deepEqual([files['/lab/port_9'].kind, files['/lab/port_9/worm.bin'].kind, files['/lab/x.buf'].kind], ['dir', 'file', 'file']);
    assert.match(files['/lab/ram_16gb.dimm'].content, /RAM STICK/);
    assert.equal(files['/lab/x.bin'].content, 'mine\n');
    assert.equal(pack.manifest.id, labPackId(script));
    assert.ok(!pack.manifest.comix && !pack.manifest.outro);
    assert.deepEqual(pack.manifest.grants, [{ afterLevel: 0, ram: 32, ssd: 256, core: 'qwen' }]);
    assert.deepEqual([pack.levels[0].script.safe, pack.levels[0].script.arrival[0].agent], [true, 'gork']);
    assert.deepEqual([config.clock, config.extraActors[0].id], ['live', 'lab:f']);
    const s = play(script);
    assert.deepEqual([s.snapshot().ram, s.snapshot().maxHp], [32, 120]);
    assert.match(s.exec('ls').output, /ram_16gb\.dimm/);
  });

  await test('validatePack: a lab level need not be winnable; the chapter check still demands an exit and a win rule', () => {
    const { pack } = buildLabPack(lab());
    const errors = (opts) => validatePack(pack, opts).filter((i) => i.severity === 'error').map((i) => i.message);
    assert.deepEqual(errors({ winnable: false }), []);
    assert.ok(errors().some((m) => /exitDir/.test(m)) && errors().some((m) => /win rule/.test(m)));
  });

  await test('enemies attack in a lab with no tasks (no end-of-level truce); enemyFire hold stops them', () => {
    const fire = lab();
    place(fire, 'enemy.virus');
    const s = play(fire);
    s.exec('ls');
    const all = [];
    for (let i = 0; i < 20; i++) all.push(...types(s.labTick().events));
    assert.ok(all.includes('ENEMY_ATTACK') && s.inspect().absorbedTotal > 0);
    const hold = { ...fire, enemyFire: 'hold' };
    const h = play(hold);
    h.exec('ls');
    for (let i = 0; i < 30; i++) h.labTick();
    assert.equal(h.inspect().absorbedTotal, 0);
  });

  await test('a fresh lab has no issues, and hank answers in it', () => {
    assert.deepEqual(checkLab(lab()), []);
    assert.match(play(lab()).exec('hank').output, /test room/i);
  });

  await test('checkLab: each issue names the object it is about (setup[i], steps[i]) for the jump', () => {
    const script = lab();
    script.setup = [
      { op: 'prop', id: 'a', model: 'prop.nope', x: 1 },
      { op: 'prop', id: 'a', model: 'prop.fan', x: 2 },
      { op: 'enemy', id: 'v', type: 'virus', path: '/elsewhere/virus.exe', pid: 7 },
      { op: 'riddle', id: 'r', path: '/lab/a.sock', prompt: 'p', answer: 're:(' },
    ];
    script.steps = [{ op: 'run', line: '  ' }, { op: 'tick', n: 0 }, { op: 'emit', event: {} }, { op: 'inject' }, { op: 'check', id: 'nope' }, { op: 'run', line: 'ls', expect: { stdout: 're:[' } }];
    const got = checkLab(script).map((i) => `[${i.where}] ${i.message}`).join('\n');
    const want = [
      '[setup[0]] unknown model "prop.nope"', '[setup[1]] prop id "a" is also used by setup[0]', '[setup[2]] v lives outside the room', '[setup[3]] "re:(" is not a valid',
      '[steps[0]] the command line is empty', '[steps[1]] ticks must be', '[steps[2]] the event needs', '[steps[3]] inject exactly one', '[steps[4]] no task, check or riddle "nope"', '[steps[5]] "re:[" is not a valid',
    ];
    for (const part of want) assert.ok(got.includes(part), `missing "${part}" in:\n${got}`);
  });

  // ---- the store ----------------------------------------------------------------------------------------------------
  await test('store: export then import round-trips (steps, riddles, tasks, checks), defaults fill an old document', () => {
    const script = lab();
    place(script, 'pickup.energy');
    script.setup.push({ op: 'riddle', id: 'r1', path: '/lab/g.sock', prompt: 'p', answer: '2', speaker: 'G', hints: [], success: 's' }, { op: 'task', id: 'k', rule: { kind: 'file_absent', path: '/lab/x', description: 'd' } }, { op: 'check', id: 'c', description: 'd', when: { kind: 'code', code: 1 } });
    script.steps = [{ op: 'run', line: 'ls', expect: { code: 0, absorbed: { min: 1 } } }, { op: 'check', id: 'c', is: 'fail' }, { op: 'inject', pickup: { id: 'p2', type: 'energy', path: '/lab/e.cell' } }];
    assert.deepEqual(store.parseLabText(store.exportLabText(script)), { script, problems: [] });
    const sparse = store.parseLabText(JSON.stringify({ id: 'old', setup: [] }));
    assert.deepEqual([sparse.problems, sparse.script.room.cwd, sparse.script.clock], [[], '/lab', 'manual']);
  });

  await test('store: bad imports are refused with a reason; ids are lowercase, at most 64 characters, no edge dashes', () => {
    const refused = (doc) => {
      const r = store.parseLabText(typeof doc === 'string' ? doc : JSON.stringify(doc));
      return !r.script && r.problems.length > 0;
    };
    for (const doc of ['not json', '[]', { title: 'no id' }, { id: 'has space' }, { id: 'Upper' }, { id: 'a-' }, { id: 'x'.repeat(65) }, { id: 'x', setup: [{ op: 'warp', path: '/x' }] }, { id: 'x', setup: [{ op: 'file', path: '/x', bogus: 1 }] }, { id: 'x', clock: 'sometimes' }, { id: 'x', steps: [{ op: 'jump' }] }, { id: 'x', steps: [{ op: 'run', line: 'ls', expect: { bogus: 1 } }] }, { id: 'x', setup: [{ op: 'riddle', id: 'r' }] }, { id: 'x', setup: [{ op: 'task', id: 't', rule: { kind: 'warp' } }] }]) {
      assert.ok(refused(doc), JSON.stringify(doc));
    }
    assert.ok(store.LAB_ID_RE.test('x'.repeat(64)) && store.LAB_ID_RE.test('a-1') && !store.LAB_ID_RE.test('-a'));
  });

  await test('store: save, list, load, delete, unique ids and duplicate', () => {
    const mem = new Map();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { get length() { return mem.size; }, key: (i) => [...mem.keys()][i] ?? null, getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, String(v)), removeItem: (k) => void mem.delete(k) },
    });
    const a = lab();
    store.saveLab(a);
    store.saveLab({ ...lab(), id: 'b', title: 'B' });
    assert.deepEqual(store.listLabs().map((l) => l.id), ['b', 't']);
    assert.deepEqual([store.loadLab('t'), store.lastLabId()], [a, 'b']);
    store.deleteLab('b');
    assert.deepEqual([store.listLabs().map((l) => l.id), store.loadLab('b')], [['t'], null]);
    assert.deepEqual([store.uniqueLabId('t', ['t']), store.uniqueLabId('My Lab!', []), store.uniqueLabId('!!!', [])], ['t-2', 'my-lab', 'lab']);
    assert.ok(store.LAB_ID_RE.test(store.uniqueLabId(`${'x'.repeat(70)}-`, [])));
    const copy = store.duplicateLab(a, ['t']);
    assert.equal(copy.id, 't-copy');
    copy.setup.push({ op: 'dir', path: '/lab/x' });
    assert.equal(a.setup.length, 1, 'the copy is independent');
    mem.set('ht-terminal-lab/script:broken', '{nope');
    assert.deepEqual(store.listLabs().map((l) => l.id), ['t'], 'a broken entry is skipped');
  });

  // ---- the runner ---------------------------------------------------------------------------------------------------
  const withEnemy = (steps) => {
    const script = lab();
    place(script, 'enemy.virus');
    script.setup.push({ op: 'file', path: '/lab/log.txt', content: 'one\nFATAL two\n' });
    script.steps = steps;
    return script;
  };

  await test('runner: a run step reports output, exit code, events and the world after it', async () => {
    const { results, reason } = await exec(withEnemy([{ op: 'run', line: 'cat log.txt' }, { op: 'run', line: 'cat missing.txt' }]));
    assert.equal(reason, 'end');
    assert.match(results[0].output, /FATAL two/);
    assert.deepEqual([results[0].code, results[1].code, results[1].enemiesLeft, results[1].cwd], [0, 1, 1, '/lab']);
    assert.match(results[1].stderr, /missing\.txt/);
  });

  await test('runner: every expect key passes when true and fails with a reason when false', async () => {
    const pass = { code: 0, stdout: 're:FATAL', events: ['VIBECODER_ACTION'], noEvents: ['ENEMY_KILLED'], cwd: '/lab', enemiesLeft: 1, absorbed: { min: 0, max: 0 }, file: { path: '/lab/log.txt', contains: 'one' } };
    assert.deepEqual((await exec(withEnemy([{ op: 'run', line: 'cat log.txt', expect: pass }]))).results[0].failures, []);
    const fail = { code: 1, stdout: 'zzz', stderr: 'x', events: ['ENEMY_KILLED'], noEvents: ['VIBECODER_ACTION'], cwd: '/', enemiesLeft: 0, absorbed: { min: 5 }, file: { path: '/lab/nope', absent: false } };
    const bad = (await exec(withEnemy([{ op: 'run', line: 'cat log.txt', expect: fail }]))).results[0];
    const text = bad.failures.join('\n');
    for (const part of ['exit code 0, expected 1', 'stdout does not match zzz', 'stderr does not match x', 'event ENEMY_KILLED did not happen', 'event VIBECODER_ACTION happened', 'cwd is /lab', '1 enemies left', 'absorbed 0, expected at least 5', 'does not exist']) assert.ok(text.includes(part), `missing "${part}" in:\n${text}`);
    assert.equal(bad.ok, false);
    const gone = await exec(withEnemy([{ op: 'run', line: 'rm log.txt' }, { op: 'expect', expect: { file: { path: '/lab/log.txt', absent: true } } }]));
    assert.deepEqual(gone.results.map((r) => r.ok), [true, true]);
  });

  await test('runner: a standalone expect reads the step before it; tick, say, emit and wait run', async () => {
    const { results } = await exec(withEnemy([
      { op: 'run', line: 'echo hi' }, { op: 'expect', expect: { stdout: 'hi', code: 0 } }, { op: 'tick', n: 3 },
      { op: 'say', agent: 'gork', mood: 'smug', text: 'hello' }, { op: 'emit', event: { type: 'VIBECODER_EMOTE', emote: 'shock', text: '!' } }, { op: 'wait', ms: 5000 },
    ]));
    assert.ok(results.every((r) => r.ok));
    assert.deepEqual([results[2].label, results[3].eventTypes, results[4].eventTypes], ['tick x3', ['AGENT_TAUNT'], ['VIBECODER_EMOTE']]);
    assert.equal((await exec(withEnemy([{ op: 'run', line: 'echo hi' }, { op: 'expect', expect: { stdout: 'bye' } }]))).results[1].ok, false);
  });

  await test('runner: stops on failure by default, runs on with stopOnFail false, honours breakpoints, from/to and cancel', async () => {
    const script = withEnemy([{ op: 'run', line: 'echo a', expect: { stdout: 'zzz' } }, { op: 'run', line: 'echo b' }, { op: 'run', line: 'echo c' }, { op: 'run', line: 'echo d' }]);
    const stopped = await exec(script);
    assert.deepEqual([stopped.reason, stopped.next, stopped.results.length], ['failure', 1, 1]);
    assert.equal((await exec(script, { stopOnFail: false })).results.length, 4);
    const bp = await exec(script, { stopOnFail: false, breakpoints: new Set([2]) });
    assert.deepEqual([bp.reason, bp.next, bp.results.length], ['breakpoint', 2, 2]);
    const resumed = await exec(script, { from: 2, stopOnFail: false, breakpoints: new Set([2]) });
    assert.deepEqual([resumed.reason, resumed.results.length], ['end', 2], 'a breakpoint on the first step of a run does not stop it');
    assert.equal((await exec(script, { from: 1, to: 3, stopOnFail: false })).results.length, 2);
    let n = 0;
    const cancelled = await exec(script, { stopOnFail: false, cancelled: () => n++ >= 2 });
    assert.deepEqual([cancelled.reason, cancelled.results.length], ['cancelled', 2]);
  });

  await test('runner: a step the driver cannot do is a failed step, not a crash', async () => {
    const script = withEnemy([{ op: 'inject', enemy: { id: 'x', type: 'virus', path: '/lab/x.exe' } }]);
    const { results } = await runner.runSteps({ ...createNodeDriver(script), inject: undefined }, script.steps);
    assert.equal(results[0].ok, false);
    assert.match(results[0].failures[0], /could not run/);
  });

  await test('runner: the same script gives the same transcript three times in a row', async () => {
    const script = JSON.parse(readFileSync(new URL('basics.lab.json', fixtureDir), 'utf8'));
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push(runner.transcriptOf((await exec(script, { stopOnFail: false })).results));
    assert.ok(runs[1] === runs[0] && runs[2] === runs[0] && runs[0].length > 300 && !runs[0].includes('FAIL'));
  });

  await test('runner: nobody is hurt however long every enemy fires', async () => {
    const script = lab();
    for (const e of entries().filter((x) => x.group === 'Enemies')) script.setup.push(...e.make(script));
    script.steps = [{ op: 'run', line: 'ls' }, { op: 'tick', n: 60 }];
    const { results } = await exec(script, { stopOnFail: false });
    const last = results.at(-1);
    assert.ok(last.hp === last.maxHp && last.absorbedTotal > 0);
    assert.ok(!results.some((r) => r.eventTypes.some((t) => HURT.includes(t))));
  });

  // ---- riddles, goals, checks ---------------------------------------------------------------------------------------
  const sockLab = (extra = {}) => {
    const script = lab();
    script.setup = [
      { op: 'file', path: '/lab/server.log', content: 'FATAL a\nok\nFATAL b\n' },
      { op: 'dir', path: '/lab/vault', mode: 0 },
      { op: 'riddle', id: 'r1', path: '/lab/gate.sock', prompt: 'How many?', answer: '2', speaker: 'Gate', hints: ['first hint', 'second hint'], success: 'Open.', opens: '/lab/vault', ...extra },
      { op: 'socket', path: '/lab/plain.sock', content: '' },
    ];
    return script;
  };

  await test('riddle: cat speaks the prompt, wrong answers get the next hint (the last repeats), the right one solves and opens the door', () => {
    const s = play(sockLab());
    const said = s.exec('cat gate.sock');
    assert.match(said.output, /How many\?/);
    assert.ok(types(said.events).includes('OBSTACLE_DIALOGUE_RENDERED'));
    const wrong = [1, 2, 3].map(() => s.exec('echo 9 > gate.sock'));
    assert.equal(wrong[0].code, 1);
    assert.deepEqual(wrong.map((w) => /first hint/.test(w.stderr) ? 1 : /second hint/.test(w.stderr) ? 2 : 0), [1, 2, 2]);
    assert.equal(s.exec('cd vault').code, 1, 'locked while unsolved');
    const ok = s.exec('echo 2 > gate.sock');
    assert.equal(ok.code, 0);
    assert.match(ok.output, /Open\./);
    assert.ok(types(ok.events).includes('PUZZLE_DOOR_RESOLVED') && types(ok.events).includes('INODE_MODE_CHANGED'));
    assert.equal(s.exec('cd vault').code, 0);
    assert.deepEqual(goal(s, 'r1'), { id: 'r1', kind: 'riddle', description: 'Solve /lab/gate.sock', done: true, attempts: 3 });
    assert.equal(s.exec('echo 2 > gate.sock').code, 0, 'solving again is harmless');
  });

  await test('riddle: a re: answer, a path answer (/dev/null), whitespace, and a socket without a riddle behaves as before', () => {
    assert.equal(play(sockLab({ answer: 're:/^(two|2)$/i' })).exec('echo TWO > gate.sock').code, 0);
    assert.equal(play(sockLab({ answer: '/dev/null' })).exec('echo /dev/null > gate.sock').code, 0);
    const plain = play(sockLab());
    assert.equal(plain.exec('echo "  2  " > gate.sock').code, 0);
    const cat = plain.exec('cat plain.sock');
    assert.ok(cat.code === 0 && !/How many/.test(cat.output));
  });

  await test('riddle: matched by absolute path, so a socket with the same name in another directory is not the riddle', () => {
    const script = sockLab({ path: '/lab/a/gate.sock' });
    script.setup.push({ op: 'dir', path: '/lab/a' }, { op: 'dir', path: '/lab/b' }, { op: 'socket', path: '/lab/b/gate.sock', content: '' });
    const s = play(script);
    assert.ok(!/How many/.test(s.exec('cat b/gate.sock').output));
    s.exec('echo 2 > b/gate.sock');
    assert.equal(goal(s, 'r1').done, false);
    assert.match(s.exec('cat a/gate.sock').output, /How many/);
    s.exec('echo 2 > a/gate.sock');
    assert.equal(goal(s, 'r1').done, true);
  });

  await test('riddle: opening a door only adds bits to a locked one; a read-only file and an open dir keep their mode', () => {
    for (const [door, mode, after] of [[{ op: 'file', path: '/lab/door', content: 'x', mode: 0o444 }, 0o444, 0o444], [{ op: 'dir', path: '/lab/door', mode: 0o711 }, 0o711, 0o711], [{ op: 'dir', path: '/lab/door', mode: 0o600 }, 0o600, 0o755]]) {
      const script = sockLab({ opens: '/lab/door' });
      script.setup.push(door);
      const s = play(script);
      const node = () => s.inspect().tree.children.find((c) => c.name === 'lab').children.find((c) => c.name === 'door');
      assert.equal(node().mode, mode);
      s.exec('echo 2 > gate.sock');
      assert.equal(node().mode, after, `${door.op} ${mode.toString(8)}`);
    }
  });

  await test('riddle: hank gives the riddle hints', () => {
    const s = play(sockLab());
    assert.match(s.exec('hank').output, /first hint/);
    assert.match(s.exec('hank').output, /second hint/);
  });

  await test('goals: tasks, checks and riddles in that order, with live done flags; latched checks stay passed', () => {
    const script = sockLab();
    script.setup.push(
      { op: 'task', id: 'read', rule: { kind: 'read_file', path: '/lab/server.log', description: 'Read the log' } },
      { op: 'check', id: 'ran-ls', description: 'ran ls', when: { kind: 'ran', pattern: 'ls' } },
      { op: 'check', id: 'out', description: 'fatal on screen', when: { kind: 'output', pattern: 're:FATAL' } },
      { op: 'check', id: 'code1', description: 'a failure', when: { kind: 'code', code: 1, line: 'vault' } },
      { op: 'check', id: 'ev', description: 'a door resolved', when: { kind: 'event', type: 'PUZZLE_DOOR_RESOLVED' } },
      { op: 'check', id: 'file', description: 'log gone', when: { kind: 'file', path: '/lab/server.log', absent: true } },
      { op: 'check', id: 'rid', description: 'riddle', when: { kind: 'riddle', riddleId: 'r1' } },
    );
    const s = play(script);
    const done = () => Object.fromEntries(s.inspect().goals.map((t) => [t.id, t.done]));
    assert.deepEqual(Object.values(done()).filter(Boolean), []);
    assert.deepEqual(s.inspect().goals.map((t) => t.kind), ['task', 'check', 'check', 'check', 'check', 'check', 'check', 'riddle']);
    s.exec('ls');
    s.exec('cat server.log');
    s.exec('cd vault');
    assert.deepEqual(['read', 'ran-ls', 'out', 'code1', 'ev', 'file', 'rid', 'r1'].map((id) => done()[id]), [true, true, true, true, false, false, false, false]);
    s.exec('echo 2 > gate.sock');
    assert.deepEqual([done().ev, done().rid, done().r1], [true, true, true]);
    s.exec('cd /lab');
    s.exec('rm server.log');
    assert.deepEqual([done().file, done()['ran-ls']], [true, true]);
  });

  await test('goals: every win rule template starts undone, is the only task, and its scene has no errors', () => {
    const kinds = entries().filter((e) => e.id.startsWith('task.'));
    assert.equal(kinds.length, 14);
    for (const e of kinds) {
      const script = lab();
      script.setup.push(...e.make(script));
      const s = play(script);
      const tasks = s.inspect().goals.filter((t) => t.kind === 'task');
      assert.deepEqual(tasks.map((t) => t.done), [false], e.id);
      assert.deepEqual(checkLab(script).filter((i) => i.severity === 'error'), [], e.id);
      if (e.id === 'task.riddle_solved') {
        s.exec('echo .secret_rune > riddle.sock');
        assert.deepEqual(s.inspect().goals.filter((t) => t.kind === 'task').map((t) => t.done), [true], 'task.riddle_solved flips done once solved');
      }
    }
  });

  await test('check step: unknown ids and wrong expectations fail with a reason', async () => {
    const script = sockLab();
    script.steps = [{ op: 'check', id: 'nope' }, { op: 'check', id: 'r1' }, { op: 'check', id: 'r1', is: 'fail' }];
    const { results } = await exec(script, { stopOnFail: false });
    assert.match(results[0].failures[0], /no task, check or riddle "nope"/);
    assert.match(results[1].failures[0], /not done, expected done/);
    assert.equal(results[2].ok, true);
  });

  // ---- inject -------------------------------------------------------------------------------------------------------
  await test('inject: an enemy arrives with its file, the world counts it, it fights, and it can be killed', async () => {
    const script = lab();
    script.steps = [
      { op: 'inject', enemy: { id: 'late', type: 'virus', path: '/lab/late.exe', pid: 77, ppid: 1 } }, { op: 'expect', expect: { enemiesLeft: 1 } },
      { op: 'run', line: 'ls', expect: { stdout: 'late.exe' } }, { op: 'tick', n: 8, expect: { events: ['ENEMY_ATTACK'], absorbed: { min: 1 } } },
      { op: 'run', line: 'kill -9 77', expect: { events: ['ENEMY_KILLED'] } }, { op: 'expect', expect: { enemiesLeft: 0 } },
    ];
    assert.ok((await exec(script)).results.every((r) => r.ok));
  });

  await test('inject: a pickup and a worm with its port directory; a bad inject is a failed step', async () => {
    const script = lab();
    script.steps = [
      { op: 'inject', pickup: { id: 'p', type: 'ram', path: '/lab/ram_16gb.dimm' } }, { op: 'run', line: 'source ram_16gb.dimm', expect: { code: 0, events: ['PICKUP_COLLECTED'] } },
      { op: 'inject', enemy: { id: 'w', type: 'worm', path: '/lab/port_9/worm.bin', port: '/lab/port_9' } }, { op: 'run', line: 'ls', expect: { stdout: 'port_9' } }, { op: 'inject' },
    ];
    const { results } = await exec(script, { stopOnFail: false });
    assert.deepEqual(results.map((r) => r.ok), [true, true, true, true, false]);
  });

  await test('inject: a taken id, a pid in use or a missing file throws and changes nothing', () => {
    const s = raw(labCfg());
    const before = JSON.stringify(s.inspect());
    assert.throws(() => s.inject({ enemy: { id: 'v1', type: 'virus', path: '/lab/notes.txt' } }), /already in the level/);
    assert.throws(() => s.inject({ enemy: { id: 'n', type: 'virus', path: '/lab/notes.txt', pid: 4001 } }), /pid 4001/);
    assert.throws(() => s.inject({ pickup: { id: 'p', type: 'ram', path: '/lab/none.dimm' } }), /not a file/);
    assert.throws(() => s.inject({}), /exactly one/);
    assert.equal(JSON.stringify(s.inspect()), before);
    s.inject({ files: [{ path: '/lab/new.exe', kind: 'file', content: '' }], enemy: { id: 'n', type: 'virus', path: '/lab/new.exe', pid: 4002 } });
    assert.ok(s.inspect().entities.some((e) => e.id === 'n'));
  });

  // ---- speech -------------------------------------------------------------------------------------------------------
  await test('speech: every agent speaks, a taunt picks its agent from the text, a bubble anchors on the socket inode', () => {
    for (const agent of ['kiro', 'clod', 'gork', 'codec', 'antigravy']) {
      const out = speechOutput({ op: 'say', agent, mood: 'smug', text: 'hi', print: '>> {text}' }, () => 0);
      assert.deepEqual([out.events[0].agent, out.print], [agent, '>> hi']);
    }
    assert.equal(speechOutput({ op: 'taunt', mood: 'laugh', text: 'GORK: "ha"' }, () => 0).events[0].agent, 'gork');
    const bubble = speechOutput({ op: 'dialogue', obstacleId: 'b', speaker: 'S', mood: 'cryptic', anchorSocket: 'x.sock', text: 't', highlight: ['cat'], banner: '[ S ]' }, (n) => (n === 'x.sock' ? 42 : 0));
    assert.equal(bubble.events[0].payload.anchorInodeId, 42);
  });

  await test('speech setup: npc, taunt and dialogue ops play when the level starts', () => {
    const script = lab();
    script.setup = [
      { op: 'npc', agent: 'gork', mood: 'smug', text: 'GORK: "hi"', print: 'GORK SAID HI' }, { op: 'taunt', mood: 'laugh', text: 'CLOD: "ha"', print: 'TAUNTED' },
      { op: 'dialogue', obstacleId: 'b', speaker: 'S', mood: 'cryptic', anchorSocket: 's.sock', text: 't', highlight: [], banner: '[ S ]' }, { op: 'socket', path: '/lab/s.sock', content: '' },
    ];
    assert.deepEqual(buildLabPack(script).pack.levels[0].script.arrival.map((a) => a.kind), ['say', 'taunt', 'dialogue']);
    assert.deepEqual(checkLab(script).filter((i) => i.severity === 'error'), []);
  });

  // ---- the attack countdown -----------------------------------------------------------------------------------------
  await test('countdown: attackIn is exactly the number of ticks until ENEMY_ATTACK, for every enemy that attacks', () => {
    const checked = [];
    for (const e of entries().filter((x) => x.group === 'Enemies')) {
      const script = lab();
      script.setup.push(...e.make(script));
      const op = script.setup.find((o) => o.op === 'enemy');
      const s = play(script);
      s.exec('ls -a');
      let fired = 0;
      for (let i = 0; i < 40; i++) {
        const before = s.inspect().entities.find((x) => x.id === op.id).attackIn;
        const attacked = s.labTick().events.some((ev) => ev.type === 'ENEMY_ATTACK' && ev.entityId === op.id);
        assert.equal(attacked, before === 1, `${op.type}: countdown ${before} at tick ${i + 1}, attacked=${attacked}`);
        if (attacked) fired += 1;
      }
      if (fired > 0) checked.push(op.type);
    }
    assert.ok(checked.length >= 6, `checked against real attacks: ${checked.join(', ')}`);
  });

  await test('countdown: a crack tells on the tick after its worm is sealed, strikes on the next, and the countdown says so', () => {
    const script = lab();
    script.setup = [
      { op: 'enemy', id: 'w', type: 'worm', path: '/lab/port_9/worm.bin', pid: 445, port: '/lab/port_9' },
      { op: 'enemy', id: 'c', type: 'crack', path: '/lab/keygen.exe', pid: 1337, helps: 'w' },
    ];
    const s = play(script);
    const crack = () => s.inspect().entities.find((x) => x.id === 'c').attackIn;
    s.exec('ls');
    assert.equal(crack(), null, 'nothing to pick while the port is open');
    // Turn-based: the chmod is the player's action, and the enemy turn that answers it is the crack's tell.
    assert.ok(s.exec('chmod 000 port_9').events.some((ev) => ev.type === 'ENEMY_ATTACK' && ev.entityId === 'c'));
    assert.equal(crack(), 2, 'told: it strikes next tick and could tell on the one after');
    const strike = s.labTick();
    assert.ok(!strike.events.some((ev) => ev.type === 'ENEMY_ATTACK' && ev.entityId === 'c') && types(strike.events).includes('INODE_MODE_CHANGED'));
    assert.equal(crack(), null, 'the port is open again');
  });

  await test('countdown: null before the first command, for a stopped process and with enemy fire on hold', () => {
    const script = lab();
    place(script, 'enemy.virus');
    const s = play(script);
    const virus = () => s.inspect().entities.find((x) => x.kind === 'enemy');
    assert.equal(virus().attackIn, null);
    s.exec('ls');
    assert.ok(virus().attackIn >= 1);
    s.exec(`kill -STOP ${script.setup.find((o) => o.op === 'enemy').pid}`);
    assert.equal(virus().attackIn, null);
    const h = play({ ...script, enemyFire: 'hold' });
    h.exec('ls');
    assert.equal(h.inspect().entities[0].attackIn, null);
  });

  await test('labTick forces the enemy turn of a battle; tactical is gone', () => {
    const script = lab();
    place(script, 'enemy.virus');
    const s = play(script);
    assert.match(s.exec('tactical on').output, /command not found|not found|unknown/i);
    s.exec('ls');
    assert.ok(s.snapshot().battle, 'a live virus in the room starts a battle');
    const before = s.inspect().entities[0].clock;
    const turns = [];
    for (let i = 0; i < 4; i++) turns.push(...s.labTick().events.filter((e) => e.type === 'BATTLE_TURN' && e.actor === 'enemy'));
    assert.ok(turns.length >= 3 && turns.every((e) => e.reason === 'forced'));
    assert.notEqual(s.inspect().entities[0].clock, before);
    assert.equal(s.snapshot().battle.phase, 'player');
  });

  // ---- commands and context tips ------------------------------------------------------------------------------------
  await test('commands: every command the session completes has a group, a usage line and an example', () => {
    const probe = cmds.probeCommands();
    assert.ok(probe.names.length >= 30);
    assert.equal(probe.names.length, new Set(probe.names).size, 'chapter Tab completion emits no duplicate command names');
    const compSession = play(lab());
    assert.deepEqual(compSession.complete('stat'), { line: 'status ', matches: ['status'] });
    assert.deepEqual(compSession.complete('mkd'), { line: 'mkdir ', matches: ['mkdir'] });
    const campaign = createChapterSession({ chapterId: listChapterSlugs()[0], preview: true });
    assert.deepEqual(campaign.complete('han'), { line: 'hank ', matches: ['hank'] });
    assert.deepEqual(cmds.ungrouped(probe.names, probe.ally), []);
    assert.deepEqual(cmds.ungrouped(['ls', 'teleport', 'lab'], 'lab'), ['teleport'], 'a command the game adds without a group is reported');
    const list = cmds.commandEntries(probe.names, probe.ally);
    assert.deepEqual([...probe.names].sort(), list.map((e) => e.name).sort());
    for (const e of list) assert.ok(e.usage && e.example, e.name);
    assert.ok(list.find((e) => e.name === 'ls').man.startsWith('ls'));
    assert.equal(list.find((e) => e.name === probe.ally).group, 'Help & game');
    assert.ok(list.find((e) => e.name === probe.ally).man, 'the chapter ally command also has a manual entry');
    assert.deepEqual(probe.missing, [], 'every command listed by chapter Tab completion is implemented');
    const classicProbe = cmds.probeCommands('classic');
    assert.equal(classicProbe.ally, '');
    assert.deepEqual(classicProbe.missing, [], 'every command listed by classic Tab completion is implemented');
    assert.deepEqual(cmds.ungrouped(classicProbe.names, classicProbe.ally), []);
  });

  await test('shell parity: readlink, ln, pkill, tutorial, logout and man work in the chapter shell with edge cases', () => {
    const script = lab();
    place(script, 'enemy.virus');
    script.setup.push(
      { op: 'enemy', id: 'spy1', type: 'spyware', path: '/lab/.spycam', pid: 4099, ppid: 1, hidden: true },
      { op: 'enemy', id: 'k1', type: 'kernel', path: '/lab/kernel.ko', pid: 1, ppid: 0 },
      { op: 'check', id: 'skipped-tut', description: 'Skipped tutorial', when: { kind: 'ran', pattern: 'tutorial skip' } },
    );
    const s = play(script);

    // tutorial skip runs through full exec lifecycle (arrives once on fresh session, increments commands, and latches checks)
    const unarrived = raw(labCfg(), { arrival: [{ kind: 'say', agent: 'kiro', mood: 'smug', text: 'welcome', print: 'ARRIVED_ONCE' }] });
    assert.match(unarrived.exec('tutorial skip').output, /ARRIVED_ONCE/);
    assert.ok(!/ARRIVED_ONCE/.test(unarrived.exec('ls').output), 'arrival does not re-fire after tutorial skip');
    const firstSkip = s.exec('tutorial skip');
    assert.equal(firstSkip.code, 0);
    assert.equal(s.snapshot().commands, 1);
    assert.equal(goal(s, 'skipped-tut').done, true, 'tutorial skip latches ran checks');

    // man: no-arg usage (never "null"), unknown topic, classic + chapter + ally topics
    const manEmpty = s.exec('man');
    assert.equal(manEmpty.code, 1);
    assert.ok(/What manual page do you want/.test(manEmpty.stderr ?? manEmpty.output) && !/\bnull\b/i.test(manEmpty.output + (manEmpty.stderr ?? '')));
    const classic = createSession();
    classic.skipIntro();
    const classicMan = classic.exec('man');
    assert.equal(classicMan.code, 1);
    assert.ok(/What manual page do you want/.test(classicMan.stderr ?? classicMan.output) && !/\bnull\b/i.test(classicMan.output + (classicMan.stderr ?? '')));
    assert.equal(s.exec('man nosuchcmd').code, 16);
    for (const topic of ['ls', 'mkdir', 'readlink', 'ln', 'pkill', 'edit', 'docker', 'hank', 'lab']) {
      const r = s.exec(`man ${topic}`);
      assert.equal(r.code, 0, `man ${topic}`);
      assert.ok(r.output.length > 20, `man ${topic} output`);
    }

    // ln & readlink (including intermediate symlink traversal, directory targets, cycles, and dot/slash guards)
    assert.equal(s.exec('ln readme.txt hard').code, 1, 'hard links are refused');
    assert.equal(s.exec('ln -s').code, 1, 'missing operands');
    assert.equal(s.exec('ln -s "" empty_link').code, 1, 'empty symlink target is refused');
    assert.equal(s.exec('ln -s readme.txt .').code, 1, 'ln -s readme.txt . refuses when ./readme.txt exists');
    assert.equal(s.exec('ln -s / .').code, 1, 'ln -s / . refuses without inserting / or . into children');
    assert.ok(!s.inspect().tree.children.find((c) => c.name === 'lab').children.some((c) => c.name === '.' || c.name === '/'));
    assert.equal(s.exec('ln -s readme.txt link.txt').code, 0);
    assert.equal(s.exec('readlink link.txt').output, 'readme.txt\n');
    assert.match(s.exec('cat link.txt').output, /Terminal Lab/);
    assert.equal(s.exec('mkdir realdir && ln -s realdir symdir && ln -s ../readme.txt symdir/nested').code, 0);
    assert.equal(s.exec('readlink symdir/nested').output, '../readme.txt\n', 'intermediate symlink dirs traverse when follow=false');
    assert.equal(s.exec('readlink -f symdir/nested').output, '/lab/readme.txt\n');
    assert.equal(s.exec('mkdir targetdir && ln -s ../readme.txt targetdir').code, 0, 'ln -s <target> <existing-dir> places basename inside dir');
    assert.match(s.exec('cat targetdir/readme.txt').output, /Terminal Lab/);
    assert.equal(s.exec('ln -s cyc_b cyc_a && ln -s cyc_a cyc_b').code, 0);
    const cyc = s.exec('readlink -f cyc_a');
    assert.equal(cyc.code, 1);
    assert.match(cyc.stderr ?? cyc.output, /Too many levels of symbolic links/);
    assert.equal(s.exec('readlink readme.txt').code, 1, 'regular file is not a symlink');
    assert.equal(s.exec('readlink').code, 1);

    // pkill (-f, -x, -P, -s, signals, and invalid options)
    assert.equal(s.exec('pkill').code, 2);
    assert.equal(s.exec('pkill -P nope virus').code, 2);
    assert.equal(s.exec('pkill one two').code, 2);
    assert.equal(s.exec('pkill nosuchproc').code, 1);
    assert.equal(s.exec('pkill -9 bash').code, 1, 'shell is protected from pkill');
    s.exec('ls -a');
    assert.equal(s.exec('pkill agents').code, 1, 'without -f, pkill checks process executable token only');
    assert.equal(s.exec('pkill -f agents').code, 0, 'with -f, pkill matches full command line args');
    assert.equal(s.exec('pkill -x virus').code, 1, '-x requires exact process name');
    assert.equal(s.exec('pkill -P 999 virus').code, 1, '-P filters by parent PID');
    assert.equal(s.exec('pkill -STOP -P 1 -x virus.exe').code, 0);
    assert.equal(s.inspect().entities.find((e) => e.id === 'virus-1').state, 'frozen');
    assert.equal(s.exec('pkill -s 9 virus').code, 0);
    assert.equal(s.inspect().entities.find((e) => e.id === 'virus-1').hp, 0);
    assert.equal(s.inspect().entities.find((e) => e.id === 'virus-1').state, 'death');

    // logout
    const logout = s.exec('logout');
    assert.equal(logout.code, 1);
    assert.match(logout.stderr ?? logout.output, /exit:/);
  });

  await test('palette crack: places a worm + sealed port when alone, or seals and helps an existing worm so crack acts', () => {
    const alone = lab();
    place(alone, 'enemy.crack');
    const wormsAlone = alone.setup.filter((o) => o.op === 'enemy' && o.type === 'worm');
    const crackAlone = alone.setup.find((o) => o.op === 'enemy' && o.type === 'crack');
    assert.equal(wormsAlone.length, 1);
    assert.equal(crackAlone.helps, wormsAlone[0].id);
    const s = play(alone);
    // Turn-based: every command is followed by one world step, so the first `ls` is the crack's tell.
    assert.equal(s.exec('ls').events.some((e) => e.type === 'ENEMY_ATTACK' && e.entityId === crackAlone.id), true);
    assert.equal(s.labTick().events.some((e) => e.type === 'INODE_MODE_CHANGED'), true, 'crack reopens its worm port');

    const withWorm = lab();
    place(withWorm, 'enemy.worm');
    place(withWorm, 'enemy.crack');
    assert.equal(withWorm.setup.filter((o) => o.op === 'enemy' && o.type === 'worm').length, 1, 'reuses the existing worm');
    const crackPaired = withWorm.setup.find((o) => o.op === 'enemy' && o.type === 'crack');
    assert.equal(crackPaired.helps, 'worm-1');
    assert.deepEqual(checkLab(withWorm).filter((i) => i.severity === 'error'), []);
    const sPaired = play(withWorm);
    assert.equal(sPaired.inspect().entities.find((e) => e.id === crackPaired.id).attackIn, null, 'nothing acts before the first command');
    assert.equal(
      sPaired.exec('ls').events.some((e) => e.type === 'ENEMY_ATTACK' && e.entityId === crackPaired.id),
      true,
      'crack placed after worm starts with a sealed port to pick: it tells on the first world step',
    );
  });

  await test('classic driver: runs classic floors with absorbed damage (including symlink flood), riddles, checks, props and inject', () => {
    const f2 = {
      ...newLabScript('f2', 'Floor 2'),
      driver: 'classic',
      room: { roomKind: 'crypt_entrance', floorTheme: 2, mechanic: 'terminal', cwd: '/var/dungeon/entrance', title: 'F2', summary: 's' },
      player: { ram: 16, ssd: 256, core: 'qwen' },
      setup: [
        { op: 'prop', id: 'fan-1', model: 'prop.fan', x: 2.4 },
        { op: 'riddle', id: 'extra-r', path: '/var/dungeon/entrance/extra.sock', prompt: 'Say open', answer: 'open', opens: '/var/dungeon/entrance/iron_gate' },
        { op: 'check', id: 'saw-ls', description: 'Ran ls', when: { kind: 'ran', pattern: 'ls' } },
      ],
    };
    assert.deepEqual(store.validateLab(f2), []);
    assert.deepEqual(checkLab(f2).filter((i) => i.severity === 'error'), []);
    const s2 = play(f2);
    assert.ok(s2.snapshot().room.actors.some((a) => a.id === 'lab:fan-1'));
    assert.equal(s2.exec('ls').code, 0);
    assert.equal(goal(s2, 'saw-ls').done, true);
    const classicDisc = s2.exec('kiro disclaimer');
    assert.equal(classicDisc.code, 0);
    assert.match(classicDisc.output, /PARODY & NON-AFFILIATION NOTICE/);
    assert.match(s2.exec('kiro legal').output, /PARODY & NON-AFFILIATION NOTICE/);
    for (let i = 0; i < 12; i++) s2.labTick();
    assert.ok(s2.inspect().absorbedTotal > 0 && s2.snapshot().hp === s2.snapshot().maxHp);
    assert.equal(s2.exec('echo open > extra.sock').code, 0);
    assert.equal(goal(s2, 'extra-r').done, true);
    s2.inject({ files: [{ path: '/var/dungeon/entrance/new.cell', kind: 'file', content: '' }], pickup: { id: 'p-new', type: 'energy', path: '/var/dungeon/entrance/new.cell' } });
    assert.ok(s2.inspect().entities.some((e) => e.id === 'p-new'));

    // With enemyFire: hold on classic driver, inspect().attackIn agrees with labTick() for indirect enemies (crack) vs damage dealers
    const holdClassic = {
      ...f2,
      enemyFire: 'hold',
      setup: [
        { op: 'dir', path: '/var/dungeon/entrance/port_9', mode: 0 },
        { op: 'enemy', id: 'w-hold', type: 'worm', path: '/var/dungeon/entrance/port_9/worm.bin', pid: 445, port: '/var/dungeon/entrance/port_9' },
        { op: 'enemy', id: 'c-hold', type: 'crack', path: '/var/dungeon/entrance/keygen.exe', pid: 1337, helps: 'w-hold' },
        { op: 'enemy', id: 'v-hold', type: 'virus', path: '/var/dungeon/entrance/virus.exe', pid: 4001 },
      ],
    };
    const sh = play(holdClassic);
    // Turn-based classic floors: the world steps once per command, so `ls` is already the crack's tell.
    assert.equal(sh.exec('ls').events.some((e) => e.type === 'ENEMY_ATTACK' && e.entityId === 'c-hold'), true);
    assert.equal(sh.inspect().entities.find((e) => e.id === 'v-hold').attackIn, null, 'damage-dealing enemy held');
    assert.equal(sh.inspect().entities.find((e) => e.id === 'c-hold').attackIn, 2, 'indirect crack enemy countdown matches labTick');
    assert.equal(sh.labTick().events.some((e) => e.type === 'INODE_MODE_CHANGED'), true);

    // Floor 3 symlink loop flood is absorbed instead of killing/rebooting the player
    const f3 = {
      ...newLabScript('f3', 'Floor 3'),
      driver: 'classic',
      room: { roomKind: 'cell', floorTheme: 3, mechanic: 'terminal', cwd: '/usr/local/labyrinth/wing_a/floor_3/cell_9', title: 'F3', summary: 's' },
      setup: [],
    };
    const s3 = play(f3);
    for (let i = 0; i < 5; i++) s3.exec('cd north_exit');
    assert.equal(s3.snapshot().hp, s3.snapshot().maxHp);
    assert.ok((s3.inspect().absorbed.symlink_flood ?? 0) >= 100);

    // Chapter-only setup ops emit a clear warning on classic driver; driver normalisation keeps chapter omitted
    const warnLab = { ...f2, setup: [{ op: 'task', id: 't1', rule: { kind: 'read_file', path: '/var/dungeon/entrance/extra.sock', description: 'd' } }] };
    assert.ok(checkLab(warnLab).some((i) => i.severity === 'warn' && /chapter driver/.test(i.message)));
    const normChapter = store.parseLabText(JSON.stringify({ ...lab(), driver: 'chapter' }));
    assert.equal(normChapter.script.driver, undefined);
    assert.ok(store.parseLabText(JSON.stringify({ ...lab(), driver: 'bogus' })).problems.length > 0);
  });

  await test('level import: every compiled chapter level imports cleanly, passes all steps, survives corrupt drafts, and never touches chapters/', async () => {
    const slug = listChapterSlugs()[0];
    const manifestBefore = readFileSync(`chapters/${slug}/chapter.manifest.json`, 'utf8');
    const levels = listImportableLevels();
    assert.ok(levels.length >= 11, `expected >= 11 levels, got ${levels.length}`);
    for (const item of levels) {
      const { script, problem } = importChapterLevelRef(item.ref, []);
      assert.equal(problem, undefined, item.ref);
      assert.deepEqual(store.validateLab(script), [], `${item.ref} validateLab`);
      assert.deepEqual(checkLab(script).filter((i) => i.severity === 'error'), [], `${item.ref} checkLab`);
      const { results } = await exec(script);
      assert.equal(results.length, script.steps.length, `${item.ref} ran all steps`);
      assert.ok(results.every((r) => r.ok), `${item.ref} failed: ${results.filter((r) => !r.ok).map((r) => `${r.index}:${r.reasons.join(';')}`).join(', ')}`);
    }
    assert.equal(readFileSync(`chapters/${slug}/chapter.manifest.json`, 'utf8'), manifestBefore);
    const customPack = rawPack();
    customPack.levels[0].roomSeed = 77;
    customPack.levels[0].props = [
      { id: 'gpu_stage', model: 'prop.gpu_card', x: 3.6, label: 'Tensor blade' },
      { id: 'wire_stage', model: 'prop.wire_loom', x: 4.3 },
    ];
    customPack.levels[0].files.push({ path: '/lab/gpu_tensor_core_01.img', kind: 'file', content: 'GPU\n' });
    customPack.levels[0].pickups.push({ id: 'gpu_p', type: 'ssd', path: '/lab/gpu_tensor_core_01.img' });
    const imported = levelToLabScript(customPack, customPack.levels[0], []);
    assert.deepEqual(
      imported.setup.filter((op) => op.op === 'prop').map((op) => [op.id, op.model, op.x]),
      [['gpu_stage', 'prop.gpu_card', 3.6], ['wire_stage', 'prop.wire_loom', 4.3]],
    );
    const sProps = createChapterSession({ chapterId: 'lab-unit', pack: customPack, preview: true, startLevelId: 'lab-1' });
    sProps.skipIntro();
    const snapBefore = sProps.snapshot();
    assert.equal(snapBefore.room.roomSeed, 77);
    assert.ok(snapBefore.room.actors.some((a) => a.id === 'prop:gpu_stage' && a.model === 'prop.gpu_card'));
    assert.ok(snapBefore.room.actors.some((a) => a.id === 'gpu_p' && a.model === 'pickup.gpu'));
    sProps.exec('mv gpu_tensor_core_01.img ~');
    assert.deepEqual([sProps.snapshot().ssd, sProps.snapshot().backups], [256, 1]);
    assert.ok(importChapterLevelRef('bad-ref', []).problem);
    assert.ok(importChapterLevelRef('no-such-chapter/level-1', []).problem);
    assert.ok(importChapterLevelRef(`${slug}/no-such-level`, []).problem);

    // Malformed localStorage drafts fall back cleanly to the compiled chapter without throwing
    const draftKey = `credits.editor.draft:${slug}`;
    for (const bad of ['{broken', JSON.stringify({ manifest: { id: slug }, levels: [null] }), JSON.stringify({ manifest: { id: slug }, levels: [{ id: levels[0].levelId, files: 'nope' }] }), JSON.stringify({ manifest: { id: slug }, levels: [{ id: levels[0].levelId, cwd: '/x', roomKind: 'bogus', floorTheme: 1, mechanic: 'terminal', title: 'T', summary: 'S', files: [], enemies: [], pickups: [], patches: [], winRules: [], solutionCommands: [] }] })]) {
      globalThis.localStorage.setItem(draftKey, bad);
      const res = importChapterLevelRef(levels[0].ref, [], true);
      assert.equal(res.problem, undefined);
      assert.ok(res.script && store.validateLab(res.script).length === 0);
    }
    globalThis.localStorage.removeItem(draftKey);
  });

  await test('RunControl: cancelling mid-wait and starting a fresh run never commits stale results or clobbers running state', async () => {
    const script = lab();
    let releaseWait = null;
    const baseDriver = createNodeDriver(script);
    const slowDriver = {
      ...baseDriver,
      wait: () => new Promise((r) => { releaseWait = r; }),
    };
    let activeDriver = slowDriver;
    const steps = [{ op: 'wait', ms: 500 }, { op: 'run', line: 'pwd' }];
    const ctl = new RunControl({
      driver: () => activeDriver,
      steps: () => steps,
      onChange: () => {},
      say: () => {},
    });
    const firstRun = ctl.runAll();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(ctl.running, true);
    ctl.forget();
    activeDriver = createNodeDriver(script);
    const secondRun = ctl.runAll();
    releaseWait();
    await Promise.all([firstRun, secondRun]);
    assert.equal(ctl.running, false);
    assert.equal(ctl.cursor, 2);
    assert.equal(ctl.results.size, 2);
  });

  await test('LabModel.add supports drop index and viewport stageX for palette drag-and-drop', () => {
    const m = new LabModel(lab());
    const fan = entries().find((e) => e.id === 'prop.prop.fan');
    const idx = m.add(fan, { index: 0, stageX: 1.74 });
    assert.equal(idx, 0);
    assert.equal(m.selectedPath, 'setup[0]');
    assert.equal(m.script.setup[0].op, 'prop');
    assert.equal(m.script.setup[0].x, 1.7);
  });

  await test('commands: every example runs in the default lab, and nothing ends the level', () => {
    const probe = cmds.probeCommands();
    for (const e of cmds.commandEntries(probe.names, probe.ally)) {
      const r = play(lab()).exec(e.example);
      assert.equal(r.snapshot.ended, false, `${e.name}: "${e.example}" ended the level`);
      if (!probe.missing.includes(e.name)) assert.notEqual(r.code, 127, `${e.name}: "${e.example}"`);
    }
  });

  await test('context tips: every line offered for every object of every committed lab runs, and nobody is hurt', () => {
    let lines = 0;
    for (const { f, text } of fixtures()) {
      const script = JSON.parse(text);
      script.setup.forEach((_, i) => {
        for (const c of contextCommands(script, { setup: i, step: null })) {
          const r = play(script).exec(c.line);
          assert.ok(!r.snapshot.ended && !types(r.events).some((t) => HURT.includes(t)), `${f} setup[${i}] "${c.line}"`);
          assert.ok(c.why.length > 0);
          lines += 1;
        }
      });
    }
    assert.ok(lines > 60, `${lines} context lines checked`);
  });

  await test('context tips match the thing (kill a virus, seal a worm port, fix a bug, a riddle answer, docker)', () => {
    const script = lab();
    script.setup = [
      { op: 'enemy', id: 'v', type: 'virus', path: '/lab/virus.exe', pid: 4001, ppid: 1 }, { op: 'enemy', id: 'w', type: 'worm', path: '/lab/port_9/worm.bin', port: '/lab/port_9' },
      { op: 'enemy', id: 'b', type: 'bug', path: '/lab/prod.py' }, { op: 'riddle', id: 'r', path: '/lab/a.sock', prompt: 'p', answer: 'yes' },
      { op: 'riddle', id: 'rx', path: '/lab/b.sock', prompt: 'p', answer: 're:^y' }, { op: 'task', id: 't', rule: { kind: 'docker_image_running', imageTag: 'x:1', port: 80, description: 'd' } },
    ];
    const lines = (i) => contextCommands(script, { setup: i, step: null }).map((c) => c.line);
    assert.ok(lines(0).includes('kill -9 4001') && lines(0).includes('man virus'));
    assert.ok(lines(1).some((l) => l.startsWith('chmod 000 ') && l.includes('port_9')));
    assert.ok(lines(2).includes("sed -i 's/BUG/FIXED/' prod.py"));
    assert.ok(lines(3).includes('echo yes > a.sock'));
    assert.deepEqual(lines(4).filter((l) => l.startsWith('echo ')), ['echo nope > b.sock'], 'no right answer is offered for a regex riddle');
    script.setup[3] = { ...script.setup[3], answer: '/dev/null' };
    assert.ok(lines(3).includes('echo /dev/null > a.sock'), 'a path answer is plain text');
    assert.ok(lines(5).includes('docker build -t x:1 .') && lines(5).includes('docker run -d -p 80:80 x:1'));
    assert.deepEqual(contextCommands(script, { setup: null, step: null }), []);
    script.steps = [{ op: 'run', line: 'ls' }, { op: 'tick' }];
    assert.deepEqual(contextCommands(script, { setup: null, step: 0 }).map((c) => c.line), ['ls']);
    assert.deepEqual(contextCommands(script, { setup: null, step: 1 }), []);
  });

  // ---- the repo link without the dev server -------------------------------------------------------------------------
  const realFetch = globalThis.fetch;
  await test('disk: without the dev API the lab is read-only and says so; a 409 becomes a ConflictError', async () => {
    try {
      globalThis.fetch = async () => { throw new TypeError('connection refused'); };
      assert.deepEqual(await disk.loadDiskLabs(), { writable: false, labs: [] });
      globalThis.fetch = async () => new Response('<html>404</html>', { status: 404, statusText: 'Not Found' });
      assert.equal((await disk.loadDiskLabs()).writable, false, 'a static host answers with HTML');
      await assert.rejects(() => disk.saveDiskLab(lab(), undefined), /404|Not Found/);
      globalThis.fetch = async (url, init) => {
        assert.deepEqual([String(url), init.method, JSON.parse(init.body).path], ['/api/terminal-lab/file', 'PUT', 't.lab.json']);
        assert.deepEqual(Object.keys(JSON.parse(init.body)).sort(), ['baseEtag', 'json', 'path']);
        return new Response(JSON.stringify({ error: 't.lab.json changed on disk' }), { status: 409 });
      };
      await assert.rejects(() => disk.saveDiskLab(lab(), 'old'), (err) => err instanceof ConflictError && /changed on disk/.test(err.message));
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  // ---- committed fixtures -------------------------------------------------------------------------------------------
  await test('fixtures: valid, named after their id, canonical, with a lab for every enemy and pickup', () => {
    const files = fixtures();
    assert.ok(files.length >= 27, `${files.length} labs`);
    for (const { f, text } of files) {
      const parsed = store.parseLabText(text);
      assert.deepEqual(parsed.problems, [], f);
      assert.equal(`${parsed.script.id}.lab.json`, f);
      assert.equal(store.exportLabText(parsed.script), text, `${f} is not in the canonical format`);
    }
    const ids = files.map(({ f }) => f.replace('.lab.json', ''));
    const want = [...Object.keys(BESTIARY).map((t) => `enemy-${t}`), 'classic-floor', 'pickup-energy', 'pickup-ram', 'pickup-ssd', 'riddle-socket', 'task-html-css', 'task-docker', 'npc-dialogue', 'inject-midrun', 'no-damage-soak', 'settings'];
    assert.deepEqual(want.filter((id) => !ids.includes(id)), []);
  });

  // ---- dialog box sides, animated head portraits, and enter/exit lifecycle -----------------------------------------
  await test('portrait frames: characters animate across 4 3D head poses while items stay static', () => {
    assert.equal(PORTRAIT_FRAMES, 4);
    const sameBytes = (a, b) => a.data.length === b.data.length && a.data.every((v, idx) => v === b.data[idx]);
    for (const modelId of ['vibecoder.dev_terminal', 'npc.kiro_ghost', 'agent.antigravy', 'agent.codec', 'agent.gork', 'agent.clod']) {
      const frames = Array.from({ length: PORTRAIT_FRAMES }, (_, f) => rasterPortraitFrame(modelId, 64, f));
      for (const f of frames) assert.ok(f && f.width === 64 && f.height === 64, `${modelId} produced invalid portrait buffer`);
      assert.equal(
        frames.slice(1).some((f) => !sameBytes(frames[0], f)),
        true,
        `${modelId} head portrait frames must animate across poses`,
      );
    }
    const countPixels = (buf, pred) => {
      let n = 0;
      for (let i = 0; i < buf.data.length; i += 4) if (buf.data[i + 3] > 0 && pred(buf.data[i], buf.data[i + 1], buf.data[i + 2])) n++;
      return n;
    };
    const codecFrames = Array.from({ length: PORTRAIT_FRAMES }, (_, f) => rasterPortraitFrame('agent.codec', 64, f));
    for (let f = 0; f < PORTRAIT_FRAMES; f++) {
      const greenPx = countPixels(codecFrames[f], (r, g, b) => g > r + 40 && g > b + 20);
      assert.equal(greenPx, 0, `agent.codec frame ${f} must have no CRT syntax-bar lines on its monitor`);
      const promptPx = countPixels(codecFrames[f], (r, g, b) => r > 200 && g > 200 && b > 180);
      assert.ok(promptPx >= 12, `agent.codec frame ${f} must retain visible >_ prompt glyph pixels`);
    }
    const gorkFrames = Array.from({ length: PORTRAIT_FRAMES }, (_, f) => rasterPortraitFrame('agent.gork', 64, f));
    const hasBodyToRingGap = (buf, dx, dy) => {
      let phase = 0; // 0: inside body (alpha>0), 1: open gap (alpha===0), 2: ring (alpha>0)
      for (let step = 2; step < 31; step++) {
        const a = buf.data[((32 + dy * step) * 64 + (32 + dx * step)) * 4 + 3];
        if (phase === 0 && a === 0) phase = 1;
        else if (phase === 1 && a > 0) return true;
      }
      return false;
    };
    for (let f = 0; f < PORTRAIT_FRAMES; f++) {
      const gf = gorkFrames[f];
      const faceBrightPx = countPixels(gf, (r, g, b) => r > 200 && g > 200 && b > 180);
      assert.ok(faceBrightPx >= 40, `agent.gork frame ${f} must retain recognizable bright goggles and smile`);
      for (const [dx, dy, dir] of [[-1, 0, 'left'], [1, 0, 'right'], [0, -1, 'top'], [0, 1, 'bottom']]) {
        assert.equal(hasBodyToRingGap(gf, dx, dy), true, `agent.gork frame ${f} must keep an open gap on ${dir} between body and ring`);
      }
      // Verify O-O goggle lens dark wells (bright -> dark -> bright -> dark -> bright on the goggle lens midline)
      let maxTransitions = 0;
      for (let y = 22; y <= 34; y++) {
        let transitions = 0, wasBright = false;
        for (let x = 18; x <= 46; x++) {
          const i = (y * 64 + x) * 4;
          const isBright = gf.data[i + 3] > 0 && gf.data[i] > 180 && gf.data[i + 1] > 180;
          if (isBright !== wasBright) { transitions++; wasBright = isBright; }
        }
        if (transitions > maxTransitions) maxTransitions = transitions;
      }
      assert.ok(maxTransitions >= 6, `agent.gork frame ${f} goggles must resolve two dark lens wells inside bright frames (got ${maxTransitions} transitions)`);
    }
    for (const blinkModel of ['agent.codec', 'agent.clod']) {
      const brightCounts = Array.from({ length: PORTRAIT_FRAMES }, (_, f) =>
        countPixels(rasterPortraitFrame(blinkModel, 64, f), (r, g, b) => r > 200 && g > 200 && b > 180),
      );
      assert.ok(Math.max(...brightCounts) - Math.min(...brightCounts) >= 20, `${blinkModel} 64px portrait must blink its focal eye/cursor across frames`);
    }
    const itemFrames = Array.from({ length: PORTRAIT_FRAMES }, (_, f) => rasterPortraitFrame('item.tube_transistor', 36, f));
    for (const f of itemFrames.slice(1)) assert.equal(sameBytes(itemFrames[0], f), true, 'item.tube_transistor icon stays static');
  });

  await test('portrait filter & Doom/Quake HP face tiers: macro-pixels + distinct tier expressions', () => {
    const tiers = [0, 1, 2, 3, 4, 'ouch'];
    for (const [hp, maxHp, expected] of [
      [100, 100, 0], [80, 100, 0], [79, 100, 1], [60, 100, 1],
      [59, 100, 2], [40, 100, 2], [39, 100, 3], [20, 100, 3],
      [19, 100, 4], [0, 100, 4],
    ]) {
      assert.equal(heroFaceTierForHp(hp, maxHp), expected);
      assert.equal(uiHeroFaceTierForHp(hp, maxHp), expected);
    }

    const buffers = tiers.map((t) => rasterPortraitFrame('vibecoder.dev_terminal', 64, 0, t));
    for (const [idx, buf] of buffers.entries()) {
      assert.ok(buf && buf.width === 64 && buf.height === 64, `tier ${tiers[idx]} invalid`);
      // Verify 2x2 macro-pixel block coherence from the software pixel-art filter at >= 48px
      for (let y = 0; y < 64; y += 2) {
        for (let x = 0; x < 64; x += 2) {
          const i0 = (y * 64 + x) * 4;
          for (const [ox, oy] of [[1, 0], [0, 1], [1, 1]]) {
            const j = ((y + oy) * 64 + (x + ox)) * 4;
            assert.equal(buf.data[i0], buf.data[j]);
            assert.equal(buf.data[i0 + 1], buf.data[j + 1]);
            assert.equal(buf.data[i0 + 2], buf.data[j + 2]);
            assert.equal(buf.data[i0 + 3], buf.data[j + 3]);
          }
        }
      }
    }
    const differs = (a, b) => a.data.some((v, i) => v !== b.data[i]);
    for (let i = 0; i < buffers.length; i++) {
      for (let j = i + 1; j < buffers.length; j++) {
        assert.equal(differs(buffers[i], buffers[j]), true, `tier ${tiers[i]} and ${tiers[j]} must look distinct`);
      }
    }

    // 3D stage ModelSpec cloning preserves unique part names & adds face parts per tier without mutating catalog
    const baseSpec = ModelCatalog.build('vibecoder.dev_terminal', 1);
    const basePartCount = baseSpec.parts.length;
    const partSig = (spec) => spec.parts.map((p) => p.name).join(',');
    const tierSigs = tiers.map((t) => {
      const s = applyHeroFaceTier(baseSpec, t);
      const names = s.parts.map((p) => p.name);
      assert.equal(new Set(names).size, names.length, `tier ${t} must have unique 3D part names`);
      return partSig(s);
    });
    assert.equal(baseSpec.parts.length, basePartCount, 'applyHeroFaceTier must not mutate catalog spec');
    assert.equal(new Set(tierSigs).size >= 5, true, '3D model specs must vary across face tiers and ouch');

    // Session snapshot forwards hp/maxHp on the 3D stage vibecoder actor and debugDamage updates it
    const s = raw();
    const initialHero = s.snapshot().room.actors.find((a) => a.kind === 'vibecoder');
    assert.ok(initialHero && typeof initialHero.hp === 'number' && typeof initialHero.maxHp === 'number');
    const hurt = s.debugDamage(25);
    const damagedHero = hurt.snapshot.room.actors.find((a) => a.kind === 'vibecoder');
    assert.equal(damagedHero?.hp, initialHero.hp - 25);
  });

  const withFakeDom = async (fn) => {
    const makeEl = (tag) => {
      const classes = new Set();
      const attrs = new Map();
      const matchSel = (c, sel) => {
        if (!sel) return false;
        if (sel.startsWith('#')) return c.attrs?.get('id') === sel.slice(1);
        if (sel.startsWith('.')) {
          const parts = sel.slice(1).split('.').filter(Boolean);
          return parts.every((p) => c.classList?.contains(p));
        }
        return false;
      };
      const node = {
        tagName: tag.toUpperCase(),
        children: [],
        parentNode: null,
        attrs,
        dataset: {},
        style: {},
        textContent: '',
        get offsetWidth() { return 100; },
        get className() { return [...classes].join(' '); },
        set className(v) { classes.clear(); for (const c of String(v).split(/\s+/).filter(Boolean)) classes.add(c); },
        classList: {
          add: (...xs) => xs.forEach((x) => classes.add(x)),
          remove: (...xs) => xs.forEach((x) => classes.delete(x)),
          contains: (x) => classes.has(x),
        },
        setAttribute: (k, v) => void attrs.set(k, String(v)),
        getAttribute: (k) => attrs.get(k) ?? null,
        append: (...xs) => {
          for (const x of xs) if (x && typeof x === 'object') { x.parentNode = node; node.children.push(x); }
        },
        appendChild: (x) => {
          if (x && typeof x === 'object') { x.parentNode = node; node.children.push(x); }
          return x;
        },
        replaceChildren: (...xs) => { node.children = []; node.append(...xs); },
        remove: () => {
          if (node.parentNode) node.parentNode.children = node.parentNode.children.filter((c) => c !== node);
          node.parentNode = null;
        },
        querySelector: (sel) => {
          for (const c of node.children) {
            if (matchSel(c, sel)) return c;
            const hit = c.querySelector?.(sel);
            if (hit) return hit;
          }
          return null;
        },
        querySelectorAll: (sel) => {
          const out = [];
          for (const c of node.children) {
            if (matchSel(c, sel)) out.push(c);
            if (c.querySelectorAll) out.push(...c.querySelectorAll(sel));
          }
          return out;
        },
      };
      return node;
    };
    const prevDoc = globalThis.document;
    globalThis.document = { createElement: makeEl };
    try {
      await fn(makeEl);
    } finally {
      if (prevDoc === undefined) delete globalThis.document;
      else globalThis.document = prevDoc;
    }
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const stubDrawPortrait = (seenFrames) => (modelId, px, frame = 0) => {
    const buf = rasterPortraitFrame(modelId, px, frame);
    assert.ok(buf);
    if (seenFrames) seenFrames.push(frame);
    return { tagName: 'CANVAS', modelId, px, frame };
  };

  await test('dialog box: docks vibecoder left and NPCs/agents right, cycles head frames, and animates enter/exit', async () => {
    await withFakeDom(async (makeEl) => {
      const parent = makeEl('div');
      const seenFrames = [];
      const box = mountDialogBox(parent, stubDrawPortrait(seenFrames));
      const root = parent.querySelector('.dialog-box');
      const avatar = root.querySelector('.dialog-avatar');
      assert.ok(root && avatar);

      // Line 1: vibecoder -> side-left, enters with frame 0, then settles, cycles head frames, and exits before line 2
      box.show({ speaker: 'vibecoder', name: 'DEV', model: 'vibecoder.dev_terminal', text: 'What is going on?!', holdMs: 280 });
      box.show({ speaker: 'kiro', name: 'KIRO', model: 'npc.kiro_ghost', text: 'Easy, Vibecoder!', holdMs: 240 });
      assert.equal(root.classList.contains('side-left'), true);
      assert.equal(root.classList.contains('open'), true);
      assert.equal(root.classList.contains('entering'), true);
      assert.equal(root.dataset.side, 'left');
      assert.equal(avatar.dataset.frame, '0');

      await wait(ENTER_MS + 35);
      assert.equal(root.classList.contains('entering'), false);
      assert.equal(root.classList.contains('exiting'), false);
      assert.ok(seenFrames.some((f) => f > 0), `head frames should cycle (saw ${JSON.stringify(seenFrames)})`);

      await wait(70);
      assert.equal(root.classList.contains('exiting'), true, 'line 1 must play exiting animation before advancing');
      assert.equal(root.dataset.speaker, 'vibecoder');

      await wait(EXIT_MS + 40);
      assert.equal(root.classList.contains('side-right'), true, 'NPC/agent must dock on side-right');
      assert.equal(root.dataset.side, 'right');
      assert.equal(root.dataset.speaker, 'kiro');
      assert.equal(root.classList.contains('entering'), true, 'line 2 enters with animation');

      // wait through kiro's hold + exit
      await wait(240 + EXIT_MS + 60);
      assert.equal(root.classList.contains('open'), false);
      assert.equal(root.getAttribute('aria-hidden'), 'true');
      assert.equal(box.pending(), 0);
      assert.ok(HEAD_FRAME_MS > 0);

      // clear() resets immediately during active display
      box.show({ speaker: 'antigravy', name: 'ANTIGRAVY', model: 'agent.antigravy', text: 'BWAHAHA!', holdMs: 500 });
      assert.equal(root.classList.contains('side-right'), true);
      assert.equal(root.classList.contains('open'), true);
      box.clear();
      assert.equal(root.classList.contains('open'), false);
      assert.equal(root.classList.contains('entering'), false);
      assert.equal(root.classList.contains('exiting'), false);
      assert.equal(box.pending(), 0);
    });
  });

  await test('dialog orchestrator: unifies DIALOG_BOX + AGENT_TAUNT, enforces 1 right dialog, preempts chatter, and coordinates hints & sockets', async () => {
    assert.equal(stripSpeakerPrefix('KIRO GHOST: "Easy, Vibecoder!"'), 'Easy, Vibecoder!');
    assert.equal(stripSpeakerPrefix('KIRO.D: "Easy, Vibecoder!"'), 'Easy, Vibecoder!');
    assert.equal(stripSpeakerPrefix('ADVISOR KIRO.D: "Drain stream!"'), 'Drain stream!');
    assert.equal(stripSpeakerPrefix('CLOD: Hello'), 'Hello');
    await withFakeDom(async (makeEl) => {
      const parent = makeEl('div');
      let hintClosed = 0;
      const openedSpeakers = [];
      const tutorialSteps = [];
      const orch = mountDialogOrchestrator(parent, stubDrawPortrait(), {
        tutorial: {
          sync() {},
          step(ev) { tutorialSteps.push(ev); },
          hide() {},
        },
        onRightDialogOpen() { hintClosed += 1; },
        onDialogOpen(line) { openedSpeakers.push(line.speaker); },
      });

      // 1. Duplicate suppression & unified AGENT_TAUNT -> .dialog-box
      orch.handleEvent({ type: 'AGENT_TAUNT', agent: 'kiro', model: 'npc.kiro_ghost', text: 'KIRO GHOST: "Take the lantern!"', mood: 'order' });
      orch.handleEvent({ type: 'AGENT_TAUNT', agent: 'kiro', model: 'npc.kiro_ghost', text: 'Take the lantern!', mood: 'order' });
      assert.equal(orch.box.pending(), 1, 'consecutive identical line must be deduplicated');
      assert.equal(orch.box.activeSide(), 'right');
      assert.equal(orch.box.activeLine()?.text, 'Take the lantern!');
      assert.equal(hintClosed, 1, 'opening right-side dialog closes open hint note');
      assert.deepEqual(openedSpeakers, ['kiro'], 'onDialogOpen fires when dialog opens on screen');
      assert.equal(orch.stats().maxConcurrent, 1);
      assert.equal(orch.stats().maxRightConcurrent, 1);

      // 2. TUTORIAL_STEP updates silent left-side tutorial card without queueing a top-right dialog
      orch.handleEvent({ type: 'TUTORIAL_STEP', step: 1, total: 5, prompt: 'Look around', command: 'ls', agent: 'kiro', done: false });
      assert.equal(tutorialSteps.length, 1);
      assert.equal(orch.box.pending(), 1, 'TUTORIAL_STEP must not spawn a second right-side dialog');

      // 3. Clear resets pending & active dialogs
      orch.clear();
      assert.equal(orch.box.activeSide(), null);
      assert.equal(orch.box.pending(), 0);

      // 4. Chatter queue cap (<= 3 queued) & priority preemption by DIALOG_BOX
      for (let i = 0; i < 6; i++) {
        orch.handleEvent({ type: 'AGENT_TAUNT', agent: 'gork', model: 'agent.gork', text: `Chatter ${i}`, mood: 'laugh' });
      }
      assert.equal(orch.box.queuedLines().length, 3, 'chatter queue must stay capped at 3');
      orch.handleEvent({ type: 'DIALOG_BOX', speaker: 'vibecoder', name: 'DEV', model: 'vibecoder.dev_terminal', text: 'Quiet!', holdMs: 120 });
      assert.deepEqual(orch.box.queuedLines().map((l) => l.text), ['Quiet!'], 'script line must drop stale queued chatter');
      await wait(320 + EXIT_MS + 40);
      assert.equal(orch.box.activeSide(), 'left');
      assert.equal(orch.box.activeLine()?.text, 'Quiet!');
      await wait(120 + EXIT_MS + 40);
      assert.equal(orch.box.pending(), 0);

      // 5. Socket dialogue yields chatter until PUZZLE_DOOR_RESOLVED
      orch.handleEvent({
        type: 'OBSTACLE_DIALOGUE_RENDERED',
        payload: { obstacleId: 'sock', speakerName: 'DAD', portraitSprite: 'socket_guardian', mood: 'hinting', bubbleStyle: 'COMIX_CLASSIC', anchorInodeId: 1, pages: [{ text: 'hi', highlightedUnixTokens: [] }], ansiTerminalBanner: '' },
      });
      orch.handleEvent({ type: 'AGENT_TAUNT', agent: 'codec', model: 'agent.codec', text: 'Held chatter', mood: 'smug' });
      assert.equal(orch.box.activeLine(), null, 'chatter waits while socket balloon is open');
      assert.equal(orch.box.queuedLines().length, 1);
      orch.handleEvent({ type: 'PUZZLE_DOOR_RESOLVED', socketInodeId: 1, unlockedInodeId: 2, solvedViaInput: 'ok' });
      assert.equal(orch.box.activeLine()?.text, 'Held chatter', 'held chatter wakes after socket resolves');

      orch.clear();
      assert.equal(orch.box.pending(), 0);

      // 6. BATTLE_ENDED and reactive DIALOG_BOX dismiss stale BATTLE_STARTED intro lines immediately
      orch.handleEvent({
        type: 'BATTLE_STARTED',
        battle: 1,
        agent: 'antigravy',
        model: 'agent.antigravy',
        taunt: 'My gargoyle has your Tube Transistor!',
        advice: 'TROJAN: chmod -x petrifies it.',
        enemyIds: ['trojan_l2'],
        introSec: 10,
      });
      assert.equal(orch.box.activeLine()?.text, 'My gargoyle has your Tube Transistor!');
      assert.equal(orch.box.queuedLines().length, 1);
      orch.handleEvent({ type: 'BATTLE_ENDED', battle: 1, reason: 'cleared' });
      orch.handleEvent({ type: 'DIALOG_BOX', speaker: 'vibecoder', name: 'VIBECODER', model: 'vibecoder.dev_terminal', text: 'Tube Transistor landed on the ground!', holdMs: 120 });
      assert.deepEqual(orch.box.queuedLines().map((l) => l.text), ['Tube Transistor landed on the ground!'], 'BATTLE_ENDED drops stale queued battle-intro advice');
      await wait(120 + EXIT_MS + 40);
      assert.equal(orch.box.activeLine()?.text, 'Tube Transistor landed on the ground!', 'reactive DIALOG_BOX opens promptly once battle ends');
      await wait(120 + EXIT_MS + 40);

      orch.clear();
      assert.equal(orch.box.pending(), 0);
      assert.equal(orch.stats().maxConcurrent, 1);
      assert.equal(orch.stats().maxRightConcurrent, 1);
    });
  });

  await test('hero HUD & horizontal dialog drawer: left vibecoder extends #hero-hud alongside HP bar while masthead/shader-dock stay absent from play.html', async () => {
    const playHtml = readFileSync(new URL('../../pages/play.html', import.meta.url), 'utf8');
    assert.equal(playHtml.includes('id="masthead"'), false, 'play.html must not contain #masthead');
    assert.equal(playHtml.includes('id="shader-dock"'), false, 'play.html must not contain #shader-dock');

    await withFakeDom(async (makeEl) => {
      const parent = makeEl('div');
      const heroHud = makeEl('div');
      heroHud.setAttribute('id', 'hero-hud');
      heroHud.className = 'hero-hud';
      const statusCol = makeEl('div');
      statusCol.className = 'hero-status-col';
      const hpCell = makeEl('div');
      hpCell.setAttribute('id', 'hud-hp-cell');
      statusCol.appendChild(hpCell);
      const drawer = makeEl('div');
      drawer.setAttribute('id', 'hero-dialog-drawer');
      drawer.setAttribute('aria-hidden', 'true');
      const dName = makeEl('b');
      dName.setAttribute('id', 'hero-dialog-name');
      const dText = makeEl('p');
      dText.setAttribute('id', 'hero-dialog-text');
      drawer.append(dName, dText);
      heroHud.append(statusCol, drawer);
      parent.appendChild(heroHud);

      const box = mountDialogBox(parent, stubDrawPortrait());
      const cornerRoot = parent.querySelector('.dialog-box');
      assert.ok(cornerRoot && heroHud.querySelector('#hud-hp-cell') === hpCell);

      box.show({ speaker: 'vibecoder', name: 'DEV', model: 'vibecoder.dev_terminal', text: 'Expanding horizontally!', holdMs: 140 });
      box.show({ speaker: 'kiro', name: 'KIRO', model: 'npc.kiro_ghost', text: 'Right corner!', holdMs: 120 });

      assert.equal(heroHud.classList.contains('talking'), true);
      assert.equal(heroHud.classList.contains('open'), true);
      assert.equal(heroHud.classList.contains('entering'), true);
      assert.equal(drawer.getAttribute('aria-hidden'), 'false');
      assert.equal(dName.textContent, 'VIBECODER');
      assert.equal(dText.textContent, 'Expanding horizontally!');
      assert.equal(cornerRoot.classList.contains('open'), false, 'floating corner box stays hidden while #hero-hud speaks');

      await wait(140 + 20);
      assert.equal(heroHud.classList.contains('exiting'), true, '#hero-hud drawer plays exiting animation before advancing');

      await wait(EXIT_MS + 35);
      assert.equal(heroHud.classList.contains('talking'), false, '#hero-hud collapses when switching to right speaker');
      assert.equal(drawer.getAttribute('aria-hidden'), 'true');
      assert.equal(cornerRoot.classList.contains('open'), true);
      assert.equal(cornerRoot.classList.contains('side-right'), true);

      box.clear();
    });
  });

  await test('word-by-word dialog reveal: reveals corner & hero-drawer text progressively, honors reducedMotion, extends long holds, and cleans up on clear()', async () => {
    await withFakeDom(async (makeEl) => {
      const parent = makeEl('div');
      const heroHud = makeEl('div');
      heroHud.setAttribute('id', 'hero-hud');
      const statusCol = makeEl('div');
      statusCol.className = 'hero-status-col';
      const drawer = makeEl('div');
      drawer.setAttribute('id', 'hero-dialog-drawer');
      const dName = makeEl('b');
      dName.setAttribute('id', 'hero-dialog-name');
      const dText = makeEl('p');
      dText.setAttribute('id', 'hero-dialog-text');
      drawer.append(dName, dText);
      heroHud.append(statusCol, drawer);
      parent.appendChild(heroHud);

      const box = mountDialogBox(parent, stubDrawPortrait());
      const cornerRoot = parent.querySelector('.dialog-box');
      const cornerText = cornerRoot.querySelector('.dialog-text');

      // Right-side corner dialog starts with word 1 visible + ghost remainder
      const fiveWords = 'Alpha beta gamma delta epsilon';
      box.show({ speaker: 'kiro', name: 'KIRO.D', model: 'npc.kiro_ghost', text: fiveWords, holdMs: 280 });
      assert.equal(cornerText.textContent, fiveWords);
      assert.equal(cornerText.querySelector('.word-reveal-shown').textContent, 'Alpha');
      assert.equal(cornerText.querySelector('.word-reveal-ghost').textContent, ' beta gamma delta epsilon');
      assert.equal(cornerText.querySelector('.word-reveal-ghost').style.visibility, 'hidden');

      await wait(70);
      assert.ok(cornerText.querySelector('.word-reveal-shown').textContent.length > 'Alpha'.length);
      await wait(240);
      assert.equal(cornerText.querySelector('.word-reveal-shown').textContent, fiveWords);
      assert.equal(cornerText.querySelector('.word-reveal-ghost').textContent, '');
      await wait(EXIT_MS + 40);

      // Left-side #hero-dialog-text also reveals word by word
      const heroLine = 'First second third fourth';
      box.show({ speaker: 'vibecoder', name: 'DEV', model: 'vibecoder.dev_terminal', text: heroLine, holdMs: 260 });
      assert.equal(dText.textContent, heroLine);
      assert.equal(dText.querySelector('.word-reveal-shown').textContent, 'First');
      assert.equal(dText.querySelector('.word-reveal-ghost').textContent, ' second third fourth');
      await wait(290 + EXIT_MS + 40);

      // Long gameplay line extends hold so reading time survives after final word appears
      const thirtyWords = Array.from({ length: 30 }, (_, i) => `w${i + 1}`).join(' ');
      box.show({ speaker: 'clod', name: 'CLOD', model: 'agent.clod', text: thirtyWords, holdMs: 1000 });
      assert.equal(cornerRoot.classList.contains('open'), true);
      await wait(1150);
      assert.equal(cornerRoot.classList.contains('open'), true, 'extended hold keeps long revealing line open past raw holdMs');
      assert.equal(cornerRoot.classList.contains('exiting'), false);
      box.clear();
      assert.equal(cornerRoot.classList.contains('open'), false);
      assert.equal(box.pending(), 0);

      // Reduced motion shows complete text immediately on frame 0
      const rmBox = mountDialogBox(parent, stubDrawPortrait(), { reducedMotion: () => true });
      const rmText = parent.querySelector('.dialog-box').querySelector('.dialog-text');
      rmBox.show({ speaker: 'codec', name: 'CODEC', model: 'agent.codec', text: fiveWords, holdMs: 300 });
      assert.equal(rmText.querySelector('.word-reveal-shown').textContent, fiveWords);
      assert.equal(rmText.querySelector('.word-reveal-ghost').textContent, '');
      rmBox.clear();
    });
  });

  await test('hintGoals: every chapter level and classic floor lists minimal tasks & goals with zero exact shell commands and tracks live completion', async () => {
    const { CHAPTER_MANIFESTS } = await load('/src/chapters/catalog.ts');
    const { createSession } = await load('/src/game/session.ts');
    const { stripCommandsFromText } = await load('/src/game/puzzle.ts');
    const EXACT_CMD_RX = /(?:`[^`]+`|\b(?:mv|ls|cat|rm|sed|chmod|kill|ps|grep|cd|touch|rev|cut|echo)\s+[\w./~'"-]+|\bdocker\s+(?:build|run|compose)\b|\bkiro\s+load\b|>\s*\/dev\/null)/i;

    assert.equal(stripCommandsFromText('[ ] Practice `mv` by pocketing RAM (`mv starter_ram_8gb.dimm ~`)'), 'Practice pocketing RAM');
    assert.equal(stripCommandsFromText('   '), '');
    assert.equal(stripCommandsFromText('[x] Keep plain prose'), 'Keep plain prose');
    assert.equal(stripCommandsFromText('`ls -la`'), 'Complete the objective');
    assert.equal(stripCommandsFromText('Read `cat.log`'), 'Read cat.log');
    assert.equal(stripCommandsFromText('Edit `edit-config.json`'), 'Edit edit-config.json');
    assert.equal(EXACT_CMD_RX.test(stripCommandsFromText('Run ls -la to inspect the room')), false);
    assert.equal(EXACT_CMD_RX.test(stripCommandsFromText('Fix docker-compose.yml and run docker compose up -d')), false);
    assert.equal(EXACT_CMD_RX.test(stripCommandsFromText('Use cat /var/log/auth.log to read logs')), false);
    assert.equal(stripCommandsFromText('Run `kill -9 1011` to stop the bug'), 'Stop the bug');

    // Terminal Lab with empty winRules + unfinished check/riddle must NOT mark exitReady.
    const { buildLabPack, newLabScript } = await load('/src/terminal-lab/lab-pack.ts');
    const labDoc = newLabScript('hint-probe', 'Hint Probe');
    labDoc.setup.push(
      { op: 'check', id: 'c1', description: 'Run `ls -la` in the room', when: { kind: 'output', pattern: 'readme.txt' } },
      { op: 'riddle', id: 'r1', path: '/lab/gate.sock', prompt: 'hi', answer: '42', hints: ['h1'] },
    );
    const builtLab = buildLabPack(labDoc);
    const labSess = createChapterSession({ pack: builtLab.pack, preview: true, lab: builtLab.config });
    const labBefore = labSess.snapshot().hintGoals;
    assert.equal(labBefore.exitReady, false, 'empty winRules + unfinished lab tasks must not be exitReady');
    assert.equal(EXACT_CMD_RX.test(labBefore.tasks[0].label), false, 'lab check label must be command-free');
    labSess.exec('ls');
    labSess.exec('echo 42 > gate.sock');
    assert.equal(labSess.snapshot().hintGoals.exitReady, true, 'all lab checks/riddles complete flips exitReady');

    // Tube Transistor pickup covered by a file_absent winRule must not duplicate the task.
    const transistorDoc = newLabScript('transistor-dedupe', 'Transistor Dedupe');
    transistorDoc.setup.push(
      { op: 'pickup', id: 'p_tt', type: 'tube_transistor', path: '/lab/tube_transistor' },
      { op: 'task', id: 't_tt', rule: { kind: 'file_absent', path: '/lab/tube_transistor', description: 'Pick up Tube Transistor' } },
    );
    const builtTransistor = buildLabPack(transistorDoc);
    const transistorSess = createChapterSession({ pack: builtTransistor.pack, preview: true, lab: builtTransistor.config });
    const transistorTasks = transistorSess.snapshot().hintGoals.tasks.filter((t) => /tube transistor/i.test(t.label));
    assert.equal(transistorTasks.length, 1, 'tube_transistor pickup + file_absent winRule must produce exactly one task');

    const chap = createChapterSession({ chapterId: CHAPTER_MANIFESTS[0].id, preview: true });
    for (const lvl of chap.getLevels()) {
      chap.jumpToLevel(lvl.id);
      const hg = chap.snapshot().hintGoals;
      assert.ok(hg && hg.title && hg.goal && hg.tasks.length >= 2, `${lvl.id}: missing hintGoals`);
      assert.equal(EXACT_CMD_RX.test(hg.goal), false, `${lvl.id}: goal leaked exact command: ${hg.goal}`);
      for (const task of hg.tasks) {
        assert.equal(EXACT_CMD_RX.test(task.label), false, `${lvl.id}: task leaked exact command: ${task.label}`);
      }
    }

    // Live progress tracking on Level 1: completing tasks ticks them off and marks exitReady.
    chap.jumpToLevel(chap.getLevels()[0].id);
    const before = chap.snapshot().hintGoals;
    assert.equal(before.exitReady, false);
    assert.equal(before.tasks[0].done, false);
    for (const cmd of chap.getCurrentLevel().solutionCommands.slice(0, -1)) chap.exec(cmd);
    const after = chap.snapshot().hintGoals;
    assert.equal(after.exitReady, true, 'hintGoals must mark exitReady once all win rules pass');
    assert.equal(after.tasks.filter((t) => t.kind !== 'exit').every((t) => t.done), true);

    // Classic floors 1..5 produce command-free hintGoals and live progress for F1 /desk & F3 pedestal.
    const classic = createSession();
    classic.skipIntro();
    assert.equal(classic.snapshot().hintGoals.exitReady, false);
    classic.exec('cat todo.note');
    assert.equal(classic.snapshot().hintGoals.exitReady, true, 'classic F1 /desk becomes exitReady after reading todo.note');
    for (const floor of [1, 2, 3, 4, 5]) {
      classic.debugTeleport(floor);
      const hg = classic.snapshot().hintGoals;
      assert.ok(hg && hg.tasks.length >= 2, `classic floor ${floor}: missing hintGoals`);
      assert.equal(EXACT_CMD_RX.test(hg.goal), false, `classic floor ${floor}: goal leaked exact command: ${hg.goal}`);
      for (const task of hg.tasks) {
        assert.equal(EXACT_CMD_RX.test(task.label), false, `classic floor ${floor}: task leaked exact command: ${task.label}`);
      }
    }
    classic.debugTeleport(3);
    classic.exec('cd ../../../');
    classic.exec('rm pedestal/.mimic');
    classic.exec('touch pedestal/a.rune pedestal/b.rune pedestal/c.rune');
    const f3Hg = classic.snapshot().hintGoals;
    assert.equal(f3Hg.tasks[0].done, true, 'classic F3 pedestal task ticks done before echoing align');
    assert.equal(f3Hg.tasks[1].done, false, 'classic F3 pressure_plate task stays undone until aligned');
  });

  await test('centered hint dialog: native <dialog>, closedby="any", Safari fallback, close/reopen sync, live task updates', async () => {
    const { mountHintDialog, wireLightDismissFallback } = await load('/src/ui/hint-dialog.ts');
    await withFakeDom(async (makeEl) => {
      const host = makeEl('div');
      let closes = 0;
      const dialogApi = mountHintDialog(host, { onClose: () => { closes += 1; } });
      const dlg = host.querySelector('.hint-dialog');
      assert.ok(dlg, 'mounted .hint-dialog');
      assert.equal(dlg.id, 'hint-dialog');
      assert.equal(dlg.tagName, 'DIALOG');
      assert.equal(dlg.getAttribute('closedby'), 'any');
      assert.equal(dlg.getAttribute('aria-labelledby'), 'hint-dialog-title');
      assert.equal(dlg.getAttribute('aria-describedby'), 'hint-dialog-goal');
      assert.equal(dlg.getAttribute('role'), null, 'native <dialog> must not carry redundant role="dialog"');
      assert.equal(dlg.getAttribute('aria-modal'), null, 'native <dialog> must not carry redundant aria-modal');

      const snap1 = {
        cwd: '/lab', floor: 1, hp: 100, maxHp: 100, commands: 0, prompt: '$ ', promptGold: false, muted: false, ended: false, rank: null, timeSec: 0, shortcuts: [], room: { title: 'Lab' }, intro: false, ram: 0, ssd: 0, backups: 0, paused: false, enemiesLeft: 1, enemiesTotal: 1, tutorial: null, inventory: { items: ['terminal'], held: 'terminal' }, battle: null,
        hintGoals: {
          title: 'Test Sector',
          goal: 'Complete the tasks below to unlock gate.',
          exitReady: false,
          tasks: [
            { label: 'Read briefing.txt', done: false },
            { label: 'Collect RAM stick (ram.dimm)', done: true },
            { label: 'Advance through gate', done: false, kind: 'exit' },
          ],
        },
      };
      dialogApi.open(snap1);
      assert.equal(dialogApi.isOpen(), true);
      assert.equal(host.querySelector('.hint-dialog-sector').textContent, 'Test Sector');
      assert.equal(host.querySelector('.hint-dialog-badge').textContent, '1/2 DONE');
      assert.equal(host.querySelector('.hint-dialog-list').children.length, 3);
      assert.equal(
        host.querySelector('.hint-dialog-tip').textContent,
        'Field Manual locked — reach the Server Hub to obtain it.',
        'before manual is in inventory, hint-dialog tip does not advertise F1',
      );

      // Live update while open flips badge to EXIT READY and unlocks F1 tip once manual is carried.
      dialogApi.update({
        ...snap1,
        inventory: { items: ['terminal', 'manual'], held: 'manual' },
        hintGoals: {
          ...snap1.hintGoals,
          goal: 'All tasks done — gate is open.',
          exitReady: true,
          tasks: [
            { label: 'Read briefing.txt', done: true },
            { label: 'Collect RAM stick (ram.dimm)', done: true },
            { label: 'Advance through gate', done: false, kind: 'exit' },
          ],
        },
      });
      assert.equal(host.querySelector('.hint-dialog-badge').textContent, 'EXIT READY');
      assert.equal(host.querySelector('.hint-dialog-badge').classList.contains('ready'), true);
      assert.equal(
        host.querySelector('.hint-dialog-tip').textContent,
        'Need command reference? Press F1 for the Field Manual.',
        'once manual is carried, hint-dialog tip shows F1 shortcut',
      );

      // Close is idempotent and notifies onClose once.
      dialogApi.close();
      dialogApi.close();
      assert.equal(dialogApi.isOpen(), false);
      assert.equal(closes, 1);

      // Native showModal/close desync test: if native dialog closes before async `close` event, isOpen() is false and open() reopens.
      const prevCreate = globalThis.document.createElement;
      globalThis.document.createElement = (tag) => {
        const node = prevCreate(tag);
        if (String(tag).toLowerCase() === 'dialog') {
          node.open = false;
          node.showModal = () => { node.open = true; };
          node.close = () => { node.open = false; };
        }
        return node;
      };
      try {
        const syncedHost = makeEl('div');
        const syncedApi = mountHintDialog(syncedHost);
        const syncedDlg = syncedHost.querySelector('.hint-dialog');
        syncedApi.open(snap1);
        assert.equal(syncedApi.isOpen(), true);
        syncedDlg.close();
        assert.equal(syncedApi.isOpen(), false, 'isOpen stays synced after native dialog.close()');
        syncedApi.open(snap1);
        assert.equal(syncedApi.isOpen(), true, 'immediate open() after native close reopens dialog');
        assert.equal(syncedDlg.open, true);
      } finally {
        globalThis.document.createElement = prevCreate;
      }

      // Safari light-dismiss fallback: outside press+release dismisses; inside->outside drag & pointercancel do not.
      const listeners = new Map();
      const fakeDlg = {
        getBoundingClientRect: () => ({ left: 100, right: 500, top: 100, bottom: 400, width: 400, height: 300 }),
        addEventListener: (type, fn) => listeners.set(type, fn),
      };
      let dismissed = 0;
      wireLightDismissFallback(fakeDlg, () => { dismissed += 1; }, true);
      listeners.get('pointerdown')({ target: fakeDlg, clientX: 200, clientY: 200 });
      listeners.get('pointerup')({ target: fakeDlg, clientX: 20, clientY: 20 });
      assert.equal(dismissed, 0, 'dragging from inside to outside must not dismiss');
      listeners.get('pointerdown')({ target: fakeDlg, clientX: 20, clientY: 20 });
      listeners.get('pointercancel')({ target: fakeDlg });
      listeners.get('pointerup')({ target: fakeDlg, clientX: 20, clientY: 20 });
      assert.equal(dismissed, 0, 'pointercancel clears outside-press state');
      listeners.get('pointerdown')({ target: fakeDlg, clientX: 20, clientY: 20 });
      listeners.get('pointerup')({ target: fakeDlg, clientX: 25, clientY: 25 });
      assert.equal(dismissed, 1, 'outside pointerdown + outside pointerup dismisses');
    });
  });

  await test('FX light sources: every preset emits stepped light, parent transforms/visibility/top-4/glow & variants stay synced', async () => {
    const THREE = await import('three');
    const { FxPlayer, FX_IDS } = await load('/src/renderer/fx-player.ts');
    const { COMIC_FX_LIGHTS, COMIC_LIGHT, MAX_COMIC_FX_LIGHTS, clearComicFxLights, createComicMaterial, setComicFxLights } = await load('/src/shaders/comic-material.ts');
    const { createSurfaceVariant } = await load('/src/shaders/comic-variants.ts');
    const { buildFxSubject } = await load('/src/storybook/subjects/fx-subject.ts');

    // Every single shipped FX preset emits a valid non-zero light on frame 1 and turns off after durationMs.
    for (const id of FX_IDS) {
      const preset = _p.FxCatalog.get(id);
      assert.ok(preset.light, `${id} must declare a light spec`);
      const l0 = _p.fxLightState(preset, 0);
      assert.ok(l0 && l0.power > 0 && l0.radius > 0, `${id} must emit light on frame 1`);
      if (!preset.loop) assert.equal(_p.fxLightState(preset, preset.durationMs), null, `${id} light must turn off after durationMs`);
    }

    // Parent transform, mirroring, visibility, and lightMul handling on fxEmitterWorldLight.
    const parent = new THREE.Group();
    parent.position.set(3.5, 1.2, 0);
    parent.scale.set(2, 2, 2);
    const mountedFx = _p.createFxEmitter(_p.FxCatalog.get('fx.sigkill'), { seed: 1 });
    mountedFx.group.position.set(0.5, 0.25, 0);
    parent.add(mountedFx.group);
    const wl = _p.fxEmitterWorldLight(mountedFx);
    assert.ok(wl && Math.abs(wl.x - 4.5) < 1e-4 && Math.abs(wl.y - 1.7) < 1e-4 && Math.abs(wl.radius - 10) < 1e-4, 'fxEmitterWorldLight applies parent world transform');
    const dimmed = _p.fxEmitterWorldLight(mountedFx, 0.5);
    assert.ok(dimmed && Math.abs(dimmed.power - wl.power * 0.5) < 1e-4, 'lightMul scales emitted power');
    parent.visible = false;
    assert.equal(_p.fxEmitterWorldLight(mountedFx), null, 'hidden ancestor suppresses FX light');
    parent.visible = true;
    mountedFx.group.visible = false;
    assert.equal(_p.fxEmitterWorldLight(mountedFx), null, 'hidden emitter suppresses FX light');
    mountedFx.dispose();

    // Storybook FX subject lifts luminous non-ink meshes into `glow` so Lantern dark mode keeps FX bright.
    const subj = buildFxSubject('fx.sigkill', { seed: 1, ink: true });
    assert.ok(subj.glow.length > 0, 'FX subject must expose glowing meshes for Storybook Lantern dark mode');
    subj.dispose();

    // FxPlayer.activeLights respects mirroring, scale, top-4 power*radius priority cap, and disposal.
    const layer = new THREE.Group();
    const player = new FxPlayer({ layer, shake() {}, flash() {} });
    player.play('fx.hop', new THREE.Vector3(1, 0, 0), { scale: 1 });
    player.play('fx.lightning-strike', new THREE.Vector3(-2, 0, 0), { mirror: true, scale: 1.5 });
    player.play('fx.sigkill', new THREE.Vector3(0, 1, 0));
    player.play('fx.reveal', new THREE.Vector3(2, 1, 0));
    player.play('fx.mv-dust', new THREE.Vector3(-1, 0, 0));
    const lights = player.activeLights();
    assert.equal(lights.length, MAX_COMIC_FX_LIGHTS, 'activeLights caps at MAX_COMIC_FX_LIGHTS (4)');
    assert.ok(lights[0].power * lights[0].radius >= lights[lights.length - 1].power * lights[lights.length - 1].radius, 'activeLights ranks by power * radius');
    const mirroredBolt = lights.find((l) => l.radius > 8);
    assert.ok(mirroredBolt && mirroredBolt.x > -2, 'mirrored page +x offset maps to world +x');
    player.clear();
    assert.equal(player.activeLights().length, 0, 'clearing player clears active lights');

    // setComicFxLights / clearComicFxLights update shared uniforms, including cloned surface variants.
    const base = createComicMaterial(0x1f7a5c);
    const variant = createSurfaceVariant(base, 'clay_cracks', { accentA: 0xef476f, accentB: 0xc8763a, hot: 0xfff07c, deep: 0x3c096c });
    assert.equal(variant.uniforms.uLampPower, COMIC_LIGHT.uLampPower, 'variant shares live COMIC_LIGHT');
    assert.equal(variant.uniforms.uFxPos0, COMIC_FX_LIGHTS.uFxPos0, 'variant shares live COMIC_FX_LIGHTS');
    setComicFxLights([{ x: 1.5, y: 2.2, radius: 3.4, power: 1.25, color: 0x39ff88 }]);
    assert.equal(COMIC_FX_LIGHTS.uFxPos0.value.w, 1.25);
    assert.equal(COMIC_FX_LIGHTS.uFxPos1.value.w, 0);
    clearComicFxLights();
    assert.equal(COMIC_FX_LIGHTS.uFxPos0.value.w, 0);
    base.dispose();
    variant.dispose();
  });

  await test('consumable pickups fly and pulse with distinct speeds and tacts across types and seeds', async () => {
    const { resolveHover } = await load('/src/procgen/runtime/animator/hover.ts');
    const ids = ['pickup.energy', 'pickup.ram', 'pickup.ssd', 'pickup.gpu'];
    const signatures = (seed) => ids.map((id) => {
      const spec = ModelCatalog.build(id, seed);
      const bob = spec.parts.find((p) => p.anim?.type === 'bob')?.anim;
      const pulse = spec.parts.find((p) => p.anim?.type === 'pulse')?.anim;
      const built = _p.buildModel(spec, { textures: false });
      const hover = resolveHover(built, {});
      _p.disposeModel(built);
      assert.ok(bob && pulse && hover.on && hover.bodyBob, `${id} (seed ${seed}) must resolve a rigid bodyBob`);
      assert.equal(hover.bodyBob.speed, bob.speed);
      return { id, bobSpeed: bob.speed, bobAmp: bob.amp, bobPhase: bob.phase, pulseSpeed: pulse.speed, pulsePhase: pulse.phase };
    });

    const s1 = signatures(1);
    const s2 = signatures(2);
    assert.equal(new Set(s1.map((x) => x.bobSpeed)).size, ids.length, 'consumables must have distinct bob speeds');
    assert.equal(new Set(s1.map((x) => x.bobPhase)).size, ids.length, 'consumables must have distinct bob phases (tacts)');
    assert.equal(new Set(s1.map((x) => x.pulseSpeed)).size, ids.length, 'consumables must have distinct pulse speeds');
    for (let i = 0; i < ids.length; i++) {
      assert.notEqual(s1[i].bobSpeed, s2[i].bobSpeed, `${ids[i]} bob speed must vary by seed`);
      assert.notEqual(s1[i].bobPhase, s2[i].bobPhase, `${ids[i]} bob tact/phase must vary by seed`);
    }
  });

  await test('levelToLabScript & buildLabPack preserve roomSeed, stage config, entity sockets, prop sfx & prop: id dedupe', async () => {
    const customLab = {
      ...lab(),
      id: 'stage-xform-lab',
      room: {
        ...lab().room,
        roomSeed: 77,
        stage: {
          backdrop: '#1a2b3c',
          hero: { x: 1.8, zOrder: 1, scale: [1.1, 1.2, 1.1], rotation: [0, 5, 0] },
          entryPort: { socket: 'door.left', model: 'door.serial', sfx: 'door_serial' },
          ambient: { lightMode: 'neon', bats: { enabled: true, scale: 1.2 } },
          sfx: { exit: 'rank_reveal', deny: 'gate_locked' },
          music: 'battle_boss',
        },
      },
      setup: [
        { op: 'enemy', id: 'v-sock', type: 'virus', path: '/lab/v.exe', pid: 4001, socket: 'door.down', scale: [1.2, 1.3, 1.2], rotation: [5, 10, 15] },
        { op: 'pickup', id: 'p-sock', type: 'ram', path: '/lab/ram.dimm', socket: 'door.left', sfx: 'pickup_ram' },
        { op: 'prop', id: 'prop:already-prefixed', model: 'prop.platter', x: 2.5, sfx: 'reveal' },
      ],
    };
    assert.deepEqual(store.validateLab(customLab), []);
    assert.deepEqual(checkLab(customLab).filter((i) => i.severity === 'error'), []);
    const built = buildLabPack(customLab);
    const lvl = built.pack.levels[0];
    assert.equal(lvl.roomSeed, 77);
    assert.equal(lvl.stage?.backdrop, '#1a2b3c');
    assert.equal(lvl.stage?.sfx?.exit, 'rank_reveal');
    assert.equal(lvl.enemies[0].socket, 'door.down');
    assert.equal(lvl.pickups[0].socket, 'door.left');

    // Imported chapter level retains roomSeed & stage and compiles cleanly in ChapterSession.
    const real = readChapter(listChapterSlugs()[0]);
    const packLevel = { ...structuredClone(real.levels[0].spec), roomSeed: 42, stage: { backdrop: '#102030', sfx: { exit: 'rank_reveal' } }, props: [{ id: 'prop:web', model: 'prop.corner_cobweb', x: 4.5, sfx: 'reveal' }] };
    const imported = levelToLabScript({ manifest: real.manifest, levels: [packLevel], dialogs: real.dialogs }, packLevel);
    assert.equal(imported.room.roomSeed, 42);
    assert.equal(imported.room.stage?.backdrop, '#102030');
    assert.equal(imported.setup.find((op) => op.op === 'prop')?.sfx, 'reveal');

    // ChapterSession snapshot uses socket on enemies/pickups and avoids prop:prop: double prefix.
    const sess = createChapterSession({
      chapterId: 'lab-stage-snap',
      pack: {
        manifest: { ...real.manifest, id: 'lab-stage-snap', levels: [real.manifest.levels[0]] },
        levels: [{
          ...lvl,
          files: built.pack.levels[0].files,
          props: [{ id: 'prop:web', model: 'prop.corner_cobweb', x: 4.5 }],
          winRules: [{ kind: 'read_file', path: '/lab/ram.dimm', description: 'r' }],
        }],
        dialogs: { levels: {} },
      },
      preview: true,
      startLevelId: lvl.id,
    });
    sess.skipIntro();
    const actors = sess.snapshot().room.actors;
    assert.equal(actors.find((a) => a.id === 'v-sock')?.socket, 'door.down');
    assert.equal(actors.find((a) => a.id === 'p-sock')?.socket, 'door.left');
    assert.ok(actors.some((a) => a.id === 'prop:web'), 'prop id starting with prop: stays prop:web');
    assert.equal(actors.some((a) => a.id === 'prop:prop:web'), false, 'never double-prefixes prop:');
  });
});

console.log(`terminal-lab-unit: ${count()} checks passed`);
