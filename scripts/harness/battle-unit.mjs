#!/usr/bin/env node
// Battle unit gate (`.kiro/specs/turn-based-battles/`): the pure orchestrator in src/game/battle.ts, then the real
// ChapterSession on a one-level synthetic pack (battle start and end, player first, actions, empty lines, the turn
// timer, holds, several enemies, leaving the room, seeded agents, no real-time damage, no tactical mode).
//   node scripts/harness/battle-unit.mjs        exit 0 = every check passed
import assert from 'node:assert/strict';
import { listChapterSlugs, readChapter } from './lib/chapter-compile.mjs';
import { withProcgen } from './lib/load.mjs';
import { testRunner } from './lib/test-kit.mjs';

const { test, count } = testRunner();
const types = (events) => events.map((e) => e.type);
const of = (events, type) => events.filter((e) => e.type === type);

/** One level: a hall with the given enemies and a quiet side room to walk out to. */
function pack(enemies) {
  const real = readChapter(listChapterSlugs()[0]);
  const level = {
    id: 'battle-1', index: 1, title: 'Battle', cwd: '/arena', roomKind: 'lab_hall', floorTheme: 2, mechanic: 'terminal', summary: 'Battle unit level.',
    files: [
      { path: '/arena/notes.txt', kind: 'file', content: 'hello\n' },
      { path: '/arena/side', kind: 'dir' },
      { path: '/arena/side/quiet.txt', kind: 'file', content: 'shh\n' },
    ],
    enemies,
    pickups: [],
    patches: [],
    winRules: [{ kind: 'read_file', path: '/arena/side/quiet.txt', description: 'Read the quiet file' }],
    solutionCommands: ['cat side/quiet.txt'],
  };
  const entry = { index: 1, id: level.id, title: level.title, cwd: level.cwd, roomKind: level.roomKind, floorTheme: 2, mechanic: 'terminal', mechanicLabel: 'Battle', difficulty: 1, teaches: [], enemies: enemies.map((e) => e.type) };
  return { manifest: { ...real.manifest, id: 'battle-unit', levels: [entry], grants: [] }, levels: [level], dialogs: { levels: {} } };
}

const VIRUS = { id: 'v1', type: 'virus', path: '/arena/virus.exe', pid: 4001 };
const TROJAN = { id: 't1', type: 'trojan', path: '/arena/trojan.bin', pid: 4002 };

await withProcgen(async (_p, vite) => {
  const load = (path) => vite.ssrLoadModule(path);
  const battle = await load('/src/game/battle.ts');
  const { createChapterSession } = await load('/src/chapters/chapter-session.ts');
  const { BESTIARY } = await load('/src/game/bestiary.ts');

  const session = (enemies = [VIRUS]) => {
    const s = createChapterSession({ chapterId: 'battle-unit', pack: pack(enemies), preview: true, startLevelId: 'battle-1' });
    s.skipIntro();
    return s;
  };
  /** A session in the player's first turn of a battle against `enemies`. */
  const fighting = (enemies) => {
    const s = session(enemies);
    s.exec('ls');
    assert.ok(s.skipBattleIntro());
    return s;
  };
  const threats = [{ id: 'v1', type: 'virus', boss: false }];

  // ---- the pure orchestrator ----------------------------------------------------------------------------------------
  await test('orchestrator: idle -> intro -> player (first) -> enemy -> player -> idle, one event per transition', () => {
    const b = battle.createBattle();
    const ev = [];
    assert.equal(battle.battleView(b), null);
    battle.beginBattle(b, [], 7, ev);
    assert.deepEqual([b.phase, ev.length], ['idle', 0], 'no threat, no battle');
    battle.beginBattle(b, threats, 7, ev);
    assert.equal(b.phase, 'intro');
    const started = ev[0];
    assert.equal(started.type, 'BATTLE_STARTED');
    assert.ok(battle.BIG_FOUR.includes(started.agent) && started.model === `agent.${started.agent}`);
    assert.ok(started.taunt.length > 0 && started.advice.startsWith('VIRUS: ') && started.advice.includes('kill -9'));
    battle.beginBattle(b, threats, 7, ev);
    assert.equal(ev.length, 1, 'a running battle does not begin twice');
    assert.equal(battle.skipIntro(b, ev), true);
    assert.deepEqual(ev[1], { type: 'BATTLE_TURN', battle: 1, actor: 'player', first: true, reason: 'start' });
    assert.equal(battle.skipIntro(b, ev), false);
    battle.startEnemyTurn(b, 'action', ev);
    assert.equal(b.phase, 'enemy');
    battle.afterEnemyTurn(b, threats, null, ev);
    assert.deepEqual([b.phase, b.secondsLeft, ev[3].first], ['player', battle.TURN_SEC, false]);
    battle.startEnemyTurn(b, 'action', ev);
    battle.afterEnemyTurn(b, [], null, ev);
    assert.deepEqual(ev[ev.length - 1], { type: 'BATTLE_ENDED', battle: 1, reason: 'cleared' });
    assert.equal(b.phase, 'idle');
    battle.endBattle(b, 'left', ev);
    assert.equal(of(ev, 'BATTLE_ENDED').length, 1, 'ending an idle battle does nothing');
  });

  await test('orchestrator: the intro runs down on clock seconds; the turn timer times out at exactly TURN_SEC; holds stop it', () => {
    const b = battle.createBattle();
    const ev = [];
    battle.beginBattle(b, threats, 1, ev);
    for (let i = 1; i < battle.INTRO_SEC; i++) assert.equal(battle.clockSecond(b, ev), null);
    assert.equal(b.phase, 'intro');
    battle.clockSecond(b, ev);
    assert.equal(b.phase, 'player');
    for (let i = 1; i < battle.TURN_SEC; i++) assert.equal(battle.clockSecond(b, ev), null);
    battle.setHold(b, 'editor', true);
    for (let i = 0; i < 100; i++) assert.equal(battle.clockSecond(b, ev), null);
    assert.equal(battle.battleView(b).held, true);
    battle.setHold(b, 'editor', false);
    assert.equal(battle.clockSecond(b, ev), 'timeout');
  });

  await test('orchestrator: the agent is seeded, and every one of the big four can be picked', () => {
    assert.deepEqual([0, 1, 2, 3].map((n) => battle.pickAgent(n)), battle.BIG_FOUR);
    assert.equal(battle.pickAgent(12345), battle.pickAgent(12345));
  });

  // ---- the chapter session ------------------------------------------------------------------------------------------
  await test('session: entering with a live enemy begins a battle with the intro; the step that begins it hurts nobody', () => {
    for (const type of Object.keys(BESTIARY)) {
      if (BESTIARY[type].damage <= 0 || type === 'kernel' || type === 'bug' || type === 'worm' || type === 'zombie') continue;
      const s = session([{ id: 'e1', type, path: `/arena/${type}.bin`, pid: 4100 }]);
      const res = s.exec('ls');
      assert.ok(types(res.events).includes('BATTLE_STARTED'), `${type}: battle begins`);
      assert.ok(!types(res.events).includes('PLAYER_DAMAGED') && !of(res.events, 'ENEMY_ATTACK').some((e) => e.entityId === 'e1'), `${type}: player first`);
      assert.equal(s.snapshot().battle.phase, 'intro');
      assert.match(res.output, /BATTLE #1/);
    }
  });

  await test('session: no enemy acts on tick() outside an enemy turn (no real-time damage)', () => {
    const s = session([VIRUS, TROJAN]);
    s.exec('ls');
    const all = [];
    for (let i = 0; i < battle.INTRO_SEC + battle.TURN_SEC - 1; i++) all.push(...s.tick().events);
    assert.ok(!types(all).includes('PLAYER_DAMAGED') && !types(all).includes('ENEMY_ATTACK'));
    assert.equal(s.snapshot().battle.phase, 'player');
    assert.equal(s.snapshot().battle.secondsLeft, 1);
  });

  await test('session: the turn timer running out is an enemy turn, then the player has a fresh 30 s', () => {
    const s = fighting([VIRUS]);
    const turns = [];
    for (let i = 0; i < battle.TURN_SEC; i++) turns.push(...of(s.tick().events, 'BATTLE_TURN'));
    assert.deepEqual(turns.map((t) => [t.actor, t.reason]), [['enemy', 'timeout'], ['player', 'action']]);
    assert.equal(s.snapshot().battle.secondsLeft, battle.TURN_SEC);
  });

  await test('session: every non-empty line is one action, correct or not; an empty line is none', () => {
    const s = fighting([VIRUS]);
    for (const line of ['cat notes.txt', 'no_such_command --x', 'cat missing.txt']) {
      const turns = of(s.exec(line).events, 'BATTLE_TURN');
      assert.deepEqual(turns.map((t) => [t.actor, t.reason]), [['enemy', 'action'], ['player', 'action']], line);
    }
    const before = JSON.stringify(s.snapshot().battle);
    assert.deepEqual(s.exec('').events, []);
    assert.deepEqual(s.exec('   ').events, []);
    assert.equal(JSON.stringify(s.snapshot().battle), before);
  });

  await test('session: a line sent during the intro skips it and is the first action', () => {
    const s = session([VIRUS]);
    s.exec('ls');
    const turns = of(s.exec('cat notes.txt').events, 'BATTLE_TURN');
    assert.deepEqual(turns.map((t) => [t.actor, t.first, t.reason]), [['player', true, 'start'], ['enemy', false, 'action'], ['player', false, 'action']]);
  });

  await test('session: the editor hold stops the turn timer; forceEnemyTurn only works in the player turn', () => {
    const s = session([VIRUS]);
    assert.equal(s.forceEnemyTurn(), null, 'no battle yet');
    s.exec('ls');
    assert.equal(s.forceEnemyTurn(), null, 'not during the intro');
    s.skipBattleIntro();
    s.holdTurnTimer('editor', true);
    for (let i = 0; i < 100; i++) assert.ok(!types(s.tick().events).includes('BATTLE_TURN'));
    assert.equal(s.snapshot().battle.held, true);
    s.holdTurnTimer('editor', false);
    const forced = s.forceEnemyTurn();
    assert.deepEqual(of(forced.events, 'BATTLE_TURN')[0], { type: 'BATTLE_TURN', battle: 1, actor: 'enemy', first: false, reason: 'forced' });
  });

  await test('session: several enemies fight in one battle; each acting enemy is marked with ENEMY_ACTING', () => {
    const s = fighting([VIRUS, TROJAN]);
    assert.deepEqual([...s.snapshot().battle.enemyIds].sort(), ['t1', 'v1']);
    const acting = new Set();
    for (let i = 0; i < 8; i++) {
      const res = s.forceEnemyTurn();
      if (!res) break;
      for (const e of of(res.events, 'ENEMY_ACTING')) acting.add(e.entityId);
      const marks = res.events.map((e, idx) => (e.type === 'ENEMY_ACTING' ? idx : -1)).filter((i2) => i2 >= 0);
      for (const ev of of(res.events, 'ENEMY_ATTACK')) {
        const at = res.events.indexOf(ev);
        const owner = marks.filter((m) => m < at).pop();
        assert.ok(owner !== undefined && res.events[owner].entityId === ev.entityId, 'an attack follows its own marker');
      }
    }
    assert.deepEqual([...acting].sort(), ['t1', 'v1']);
  });

  await test('session: walking out ends the battle as left, killing every enemy ends it as cleared', () => {
    const s = fighting([VIRUS]);
    assert.deepEqual(of(s.exec('cd side').events, 'BATTLE_ENDED').map((e) => e.reason), ['left']);
    assert.equal(s.snapshot().battle, null);
    const back = s.exec('cd ..');
    assert.ok(types(back.events).includes('BATTLE_STARTED'), 'coming back begins a new battle');
    assert.equal(of(back.events, 'BATTLE_STARTED')[0].battle, 2);
    s.skipBattleIntro();
    assert.deepEqual(of(s.exec('kill -9 4001').events, 'BATTLE_ENDED').map((e) => e.reason), ['cleared']);
  });

  await test('session: the same run picks the same agents; tactical mode is gone', () => {
    const agents = () => {
      const s = session([VIRUS]);
      const picked = [];
      for (let i = 0; i < 4; i++) {
        picked.push(of(s.exec(i === 0 ? 'ls' : 'cd ..').events, 'BATTLE_STARTED')[0]?.agent);
        s.skipBattleIntro();
        s.exec('cd side');
      }
      return picked;
    };
    const first = agents();
    assert.ok(first.every((a) => battle.BIG_FOUR.includes(a)));
    assert.deepEqual(agents(), first);
    const s = session([VIRUS]);
    assert.equal(typeof s.isTacticalMode, 'undefined');
    assert.notEqual(s.exec('tactical on').code, 0);
    assert.doesNotMatch(s.exec('help').output, /tactical/i);
  });

  console.log(`battle-unit: ${count()} checks passed`);
});
