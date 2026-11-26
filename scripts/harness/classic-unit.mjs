#!/usr/bin/env node
// Classic session unit gate (campaign speedrun, turn/pause mechanics, all enemy weaknesses,
// shell conformance, tab completion, and ModelCatalog coverage across classic floors).
//   node scripts/harness/classic-unit.mjs     exit 0 = all assertions pass
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withProcgen, projectRoot } from './lib/load.mjs';
import { testRunner } from './lib/test-kit.mjs';

const { test, count } = testRunner();
const script = JSON.parse(readFileSync(resolve(projectRoot, 'scripts/harness/playthrough.script.json'), 'utf8'));

await withProcgen(async (_procgen, vite) => {
  const load = (path) => vite.ssrLoadModule(path);
  const { createSession } = await load('/src/game/session.ts');
  const { BESTIARY, PICKUP_INFO } = await load('/src/game/bestiary.ts');
  const { ModelCatalog } = await load('/src/procgen/index.ts');
  const { demoRoom } = await load('/src/renderer/stage-selfcheck.ts');

  const fresh = (intro = false) => {
    const s = createSession();
    if (!intro) s.skipIntro();
    return s;
  };

  await test('full classic campaign speedrun clears 5 floors with 0 deaths and rank A/S', () => {
    const s = fresh();
    let deaths = 0;
    for (const cmd of script) {
      if (s.snapshot().ended) break;
      const res = s.exec(cmd);
      if (res.events.some((e) => e.type === 'PLAYER_RESPAWNED' || (e.type === 'PLAYER_DAMAGED' && e.hpRemaining <= 0))) {
        deaths += 1;
      }
    }
    const snap = s.snapshot();
    assert.equal(snap.ended, true);
    assert.equal(snap.floor, 5);
    assert.equal(deaths, 0);
    assert.ok(snap.rank === 'S' || snap.rank === 'A', `unexpected rank: ${snap.rank}`);
  });

  await test('floor 2: denied rattle on locked gate, chmod +rx unlocks, and cron_restorer recovers plank', () => {
    const s = fresh();
    s.debugTeleport(2);
    const denied = s.exec('cd iron_gate');
    assert.notEqual(denied.code, 0);
    assert.ok(denied.events.some((e) => e.type === 'PERMISSION_DENIED_RATTLE'));

    const open = s.exec('chmod +rx iron_gate');
    assert.equal(open.code, 0);
    assert.ok(open.events.some((e) => e.type === 'INODE_MODE_CHANGED'));

    assert.equal(s.exec('cd iron_gate').code, 0);
    assert.equal(s.exec('rm heavy_plank.tar').code, 0);
    assert.equal(s.exec('ls').output.includes('heavy_plank.tar'), false);

    // Wait 3 world steps for cron_restorer to restore deleted quest-critical file.
    const restoredEvents = [];
    for (let i = 0; i < 4; i += 1) {
      restoredEvents.push(...s.labTick().events);
    }
    const listAfter = s.exec('ls').output;
    assert.ok(
      listAfter.includes('heavy_plank.tar') && restoredEvents.some((e) => e.type === 'SYSTEM_HAND_SPAWN' && e.reason === 'cron_restore'),
      'expected cron_restorer to restore heavy_plank.tar',
    );
  });

  await test('command chaining (&& and ||) obeys POSIX exit codes', () => {
    const s = fresh();
    const okAnd = s.exec('pwd && echo chained');
    assert.equal(okAnd.code, 0);
    assert.ok(okAnd.output.includes('chained'));

    const stopAnd = s.exec('cat missing_file && echo should_not_run');
    assert.notEqual(stopAnd.code, 0);
    assert.ok(!stopAnd.output.includes('should_not_run'));

    const fallbackOr = s.exec('cat missing_file || echo recovered');
    assert.equal(fallbackOr.code, 0);
    assert.ok(fallbackOr.output.includes('recovered'));

    const skipOr = s.exec('pwd || echo skipped');
    assert.equal(skipOr.code, 0);
    assert.ok(!skipOr.output.includes('skipped'));
  });

  await test('floor 3: symlink loop triggers ELOOP and flood splash event', () => {
    const s = fresh();
    s.debugTeleport(3);
    const hit = s.exec('cd north_exit');
    assert.notEqual(hit.code, 0);
    assert.ok(/symbolic links|black water/i.test(hit.output));
    assert.ok(hit.events.some((e) => e.type === 'ROOM_TRANSITION' && e.viaSymlinkLoop === true));
    assert.equal(s.snapshot().room.flood, 20);

    // Self/mutual symlink loop fails with ELOOP
    assert.equal(s.exec('ln -s loop_b loop_a').code, 0);
    assert.equal(s.exec('ln -s loop_a loop_b').code, 0);
    const loopErr = s.exec('cd loop_a');
    assert.notEqual(loopErr.code, 0);
    assert.ok(/symbolic links/i.test(loopErr.output));
  });

  await test('floor 4: SIGTERM enrages PID 666, SIGSTOP freezes, SIGKILL destroys boss and zombies', () => {
    const s = fresh();
    s.debugTeleport(4);
    s.exec('cat boiler.dump');
    s.exec('grep "^PASS=" boiler.dump | cut -d= -f2 | rev > valve_lock.sock');
    assert.equal(s.exec('cd furnace_hall').code, 0);

    const hpBefore = s.snapshot().hp;
    const rage = s.exec('kill 666');
    assert.ok(rage.events.some((e) => e.type === 'PROC_SIGNALED' && e.pid === 666 && e.outcome === 'TRAPPED_ENRAGED'));
    assert.ok(s.snapshot().hp < hpBefore);

    const freeze = s.exec('kill -STOP 666');
    assert.ok(freeze.events.some((e) => e.type === 'PROC_SIGNALED' && e.pid === 666 && e.signal === 'SIGSTOP'));

    const killed = s.exec('kill -9 666');
    assert.equal(killed.code, 0);
    assert.ok(killed.events.some((e) => e.type === 'ENEMY_KILLED'));
    assert.ok(!s.exec('ps').output.includes('666'));
  });

  await test('floor 5: kill -9 1 refused, early exit refused, solving kernel enables exit', () => {
    const s = fresh();
    s.debugTeleport(5);
    const noperm = s.exec('kill -9 1');
    assert.notEqual(noperm.code, 0);
    assert.ok(/permitted|refuse|PID 1|core/i.test(noperm.output));

    const earlyExit = s.exec('exit');
    assert.notEqual(earlyExit.code, 0);
    assert.ok(earlyExit.output.includes('hooks'));

    assert.equal(s.exec('mv chaos.stream /dev/null').code, 0);
    assert.equal(s.exec('grep "WAKEUP_TOKEN=" core_dump.log > wakeup.sock').code, 0);
    assert.equal(s.exec("sed -i 's/player_trapped=true/player_trapped=false/' reality_anchor.conf").code, 0);

    const win = s.exec('exit');
    assert.equal(win.code, 0);
    assert.equal(s.snapshot().ended, true);
    assert.ok(win.events.some((e) => e.type === 'GAME_ENDED'));
  });

  await test('pause invariant & turn-based clock: tick() causes 0 malware damage while paused/idle; labTick() steps enemies', () => {
    const s = fresh();
    s.debugTeleport(2);
    s.exec('chmod +rx iron_gate');
    s.exec('cd iron_gate'); // shares room with stone_gargoyle.bin (trojan: dmg 12, every 3)

    const startHp = s.snapshot().hp;
    for (let i = 0; i < 8; i += 1) {
      const r = s.tick();
      assert.equal(r.events.filter((e) => e.type === 'ENEMY_ATTACK' || e.type === 'PLAYER_DAMAGED').length, 0);
    }
    assert.equal(s.snapshot().hp, startHp);

    // Paused Date.now duration must not advance elapsedSec or step enemies.
    const realNow = Date.now;
    let fakeNow = realNow();
    Date.now = () => fakeNow;
    try {
      s.setPaused(true);
      const tBefore = s.snapshot().timeSec;
      fakeNow += 5000;
      assert.equal(s.labTick().events.length, 0);
      assert.equal(s.tick().events.length, 0);
      s.setPaused(false);
      const tAfter = s.snapshot().timeSec;
      assert.ok(tAfter - tBefore <= 1, `paused time leaked into timeSec (${tBefore} -> ${tAfter})`);
    } finally {
      Date.now = realNow;
    }

    // Unpaused labTick triggers stone_gargoyle.bin damage.
    const dmgEvents = [];
    for (let i = 0; i < 6; i += 1) {
      dmgEvents.push(...s.labTick().events);
    }
    assert.ok(dmgEvents.some((e) => e.type === 'PLAYER_DAMAGED'));
    assert.ok(s.snapshot().hp < startHp);
  });

  await test('SSD backup respawns on lethal damage and decrements backup; 0 backups restarts floor', () => {
    const s = fresh();
    s.debugTeleport(2);
    s.exec('chmod +rx iron_gate && cd iron_gate');
    s.debugGive('ssd', 256);
    assert.equal(s.snapshot().backups, 1);

    // Drain HP to near zero, then take a gargoyle hit or lethal damage step.
    const hp = s.snapshot().hp;
    s.debugDamage(hp - 1);
    const events = [];
    for (let i = 0; i < 6 && s.snapshot().backups === 1; i += 1) {
      events.push(...s.labTick().events);
    }
    assert.ok(events.some((e) => e.type === 'PLAYER_RESPAWNED' && e.from === 'ssd_backup'), 'expected SSD backup respawn');
    assert.equal(s.snapshot().backups, 0);
    assert.ok(s.snapshot().hp > 0);
    assert.equal(s.snapshot().cwd, '/var/dungeon/entrance/iron_gate');

    // Without backup, lethal floor death restarts floor cleanly at entrance instead of ending run.
    const hp2 = s.snapshot().hp;
    s.debugDamage(hp2 - 1);
    const events2 = [];
    for (let i = 0; i < 6; i += 1) {
      events2.push(...s.labTick().events);
    }
    assert.ok(events2.some((e) => e.type === 'PLAYER_RESPAWNED' && e.from === 'floor_restart'));
    assert.equal(s.snapshot().cwd, '/var/dungeon/entrance');
    assert.equal(s.snapshot().ended, false);
  });

  await test('floor 4 ransomware encrypts pickups over turns until killed, then chmod 644 restores access', () => {
    const s = fresh();
    s.debugTeleport(4);
    assert.notEqual(s.exec('source energy.cell').code, 0); // starts encrypted (000)
    // Run turns so ransomware stays active, then kill PID 7777 and decrypt both pickups.
    for (let i = 0; i < 4; i += 1) s.labTick();
    assert.equal(s.exec('kill 7777').code, 0);
    assert.equal(s.exec('chmod 644 energy.cell ram_16gb.dimm').code, 0);
    assert.equal(s.exec('source energy.cell').code, 0);
  });

  await test('floor 2 crack picks port_445 lock back open until PID 1337 is killed', () => {
    const s = fresh();
    s.debugTeleport(2);
    assert.equal(s.exec('chmod 000 port_445').code, 0);
    assert.ok(s.exec('ls -la').output.includes('d---------') || s.exec('cd port_445').code !== 0);
    // Crack (every 2 ticks) picks port_445 back open while still alive.
    for (let i = 0; i < 3; i += 1) s.labTick();
    assert.equal(s.exec('cd port_445 && cd ..').code, 0);
    assert.equal(s.exec('kill 1337').code, 0);
    assert.equal(s.exec('chmod 000 port_445').code, 0);
    for (let i = 0; i < 4; i += 1) s.labTick();
    assert.notEqual(s.exec('cd port_445').code, 0);
  });

  await test('tutorial protects player at desk, ends on cd .., and supports skip controls', () => {
    const s = fresh(true);
    s.skipIntro();
    const t0 = s.tick();
    assert.ok(t0.output.includes('PROMPT #1'));
    assert.ok(s.snapshot().tutorial !== null);
    assert.equal(s.exec('ls').code, 0);
    assert.equal(s.exec('cat todo.note').code, 0);
    assert.equal(s.exec('pwd').code, 0);
    assert.equal(s.exec('help').code, 0);
    // Still active at desk until cd ..
    assert.ok(s.snapshot().tutorial !== null);
    assert.equal(s.exec('cd ..').code, 0);
    assert.equal(s.snapshot().tutorial, null);

    const s2 = fresh();
    s2.tick();
    assert.ok(s2.snapshot().tutorial !== null);
    assert.equal(s2.exec('tutorial skip').code, 0);
    assert.equal(s2.snapshot().tutorial, null);

    const s3 = fresh();
    s3.tick();
    s3.skipTutorial();
    assert.equal(s3.snapshot().tutorial, null);
  });

  await test('floor 3 virus splits on rm while running; kill -9 404 eliminates all copies; exploit yields to chmod -w stack.buf', () => {
    const s = fresh();
    s.debugTeleport(3);
    assert.equal(s.exec('cd ../../../').code, 0);
    assert.notEqual(s.exec('rm virus.exe').code, 0);
    const copies = s.exec('ps').output.split('\n').filter((l) => l.includes('virus')).length;
    assert.ok(copies >= 2, `expected virus split (>=2), got ${copies}`);
    assert.equal(s.exec('kill -9 404').code, 0);
    assert.equal(s.exec('ps').output.split('\n').filter((l) => l.includes('virus')).length, 0);

    assert.equal(s.exec('cd ram_slots').code, 0);
    assert.notEqual(s.exec('kill -9 1024').code, 0);
    assert.equal(s.exec('chmod -w stack.buf').code, 0);
    assert.ok(!s.exec('ps').output.includes('1024'));
  });

  await test('floor 1 bug yields to sed -i and spyware yields to ls -a + rm .spycam', () => {
    const s = fresh();
    assert.ok(s.exec('ps').output.includes('3003'));
    const restart = s.exec('kill 3003');
    assert.ok(restart.output.includes('Restart=always'));
    assert.ok(s.exec('ps').output.includes('5000')); // relaunched under new PID
    assert.equal(s.exec("sed -i 's/BUG/FIXED/' prod.py").code, 0);
    assert.ok(!s.exec('ps').output.includes('5000'));
    assert.ok(!s.exec('ps').output.includes('prod.py'));

    assert.equal(s.exec('cd ..').code, 0);
    assert.ok(!s.exec('ls').output.includes('.spycam'));
    assert.ok(s.exec('ls -a').output.includes('.spycam'));
    assert.equal(s.exec('rm .spycam').code, 0);
    assert.ok(!s.exec('ls -a').output.includes('.spycam'));
  });

  await test('classic rm refuses the root, the cwd and its ancestors with the chapter shell message', () => {
    const s = fresh();
    const cwd = s.snapshot().cwd;
    for (const cmd of ['rm .', 'rm -r .', 'rm ..', 'rm -r ..', 'rm -rf /']) {
      const res = s.exec(cmd);
      assert.equal(res.code, 1, `${cmd} unexpectedly succeeded`);
      assert.match(res.output, /^rm: refusing to remove '[^']+'$/m, `${cmd} missing refusal message`);
      assert.ok(!res.output.includes('standing in it'), `${cmd} used the old classic message`);
    }
    assert.equal(s.snapshot().cwd, cwd);
  });

  await test('command conformance suite across core POSIX commands, operators, redirection, and quoting', () => {
    const s = fresh();
    const cases = [
      ['pwd', 0, '/home/dev/nightmare_workspace/desk'],
      ['ls', 0, 'todo.note'],
      ['ls -l', 0, '-rw-'],
      ['ls -a', 0, '.'],
      ['ls -F', 0, 'prod.py'],
      ['cd ~', 0, ''],
      ['pwd', 0, '/home/dev'],
      ['cd -', 0, ''],
      ['pwd', 0, '/home/dev/nightmare_workspace/desk'],
      ['cd nope_dir', 1, 'No such'],
      ['cat todo.note', 0, 'TODO'],
      ['cat nope_file', 1, 'No such'],
      ['grep BUG prod.py', 0, 'BUG'],
      ['grep -i bug prod.py', 0, 'BUG'],
      ['grep -c BUG prod.py', 0, '1'],
      ['grep -n BUG prod.py', 0, ':'],
      ['grep -v BUG prod.py', 0, 'RETRIES'],
      ['wc prod.py', 0, '4 '],
      ['wc -l prod.py', 0, '4'],
      ['head -n 1 prod.py', 0, '# prod.py'],
      ['tail -n 1 prod.py', 0, 'deploy'],
      ['echo "alpha:beta:gamma" | cut -d: -f2', 0, 'beta'],
      ['echo "abc" | rev', 0, 'cba'],
      ['echo "foo bar" | sed "s/foo/baz/"', 0, 'baz bar'],
      ['echo "a" | sed "s//b/"', 1, 'no previous regular expression'],
      ['touch tmp.txt', 0, ''],
      ['echo "hi" > tmp.txt', 0, ''],
      ['echo "there" >> tmp.txt', 0, ''],
      ['wc -l tmp.txt', 0, '2'],
      ['cp tmp.txt tmp2.txt', 0, ''],
      ['mv tmp2.txt tmp3.txt', 0, ''],
      ['chmod 400 tmp3.txt', 0, ''],
      ['cat tmp3.txt', 0, 'hi'],
      ['chmod 000 tmp3.txt', 0, ''],
      ['cat tmp3.txt', 1, 'Permission denied'],
      ['chmod u+r tmp3.txt', 0, ''],
      ['rm tmp.txt tmp3.txt', 0, ''],
      ['touch r{1,2}.txt', 0, ''],
      ['ls r*.txt', 0, 'r1.txt'],
      ['rm r1.txt r2.txt', 0, ''],
      ['echo discarded > /dev/null', 0, ''],
      ['find . -name "prod.py"', 0, 'prod.py'],
      ['ps', 0, 'PID'],
      ['top', 0, 'PID'],
      ['kill -l', 0, 'SIGKILL'],
      ['kill -bad 1', 1, 'invalid signal'],
      ['pkill --bad-sig', 2, 'invalid signal'],
      ['pkill no_such_proc_xyz', 1, ''],
      ['man bug', 0, 'BUG(6)'],
      ['whoami', 0, 'dev'],
      ['inventory', 0, ''],
      ['clear', 0, ''],
      ['sudo rm -rf /', 127, 'agents hold root'],
      ['no_such_cmd_xyz', 127, 'command not found'],
    ];
    for (const [cmd, code, substr] of cases) {
      const r = s.exec(cmd);
      assert.equal(r.code, code, `command \`${cmd}\` expected code ${code}, got ${r.code}: ${r.output}`);
      if (substr) assert.ok(r.output.includes(substr), `command \`${cmd}\` output missing ${JSON.stringify(substr)}: ${r.output}`);
    }
  });

  await test('tab completion expands unique commands/files and finds LCP on ambiguous matches', () => {
    const s = fresh();
    const cmdUnique = s.complete('whoa');
    assert.equal(cmdUnique.line, 'whoami ');
    assert.deepEqual(cmdUnique.matches, ['whoami']);

    const fileUnique = s.complete('cat to');
    assert.equal(fileUnique.line, 'cat todo.note ');

    s.exec('touch same_alpha.txt same_amber.txt');
    const ambig = s.complete('cat same_a');
    assert.equal(ambig.matches.length, 2);
    assert.equal(ambig.line, 'cat same_a');
  });

  await test('every BESTIARY, PICKUP_INFO, demoRoom, and classic floor 1-5 actor model is in ModelCatalog', () => {
    const models = new Set();
    for (const enemy of Object.values(BESTIARY)) models.add(enemy.model);
    for (const pickup of Object.values(PICKUP_INFO)) models.add(pickup.model);
    for (const actor of demoRoom().actors) {
      if (actor.model) models.add(actor.model);
    }
    const s = fresh();
    for (const floor of [1, 2, 3, 4, 5]) {
      s.debugTeleport(floor);
      for (const actor of s.snapshot().room.actors) {
        if (actor.model) models.add(actor.model);
      }
    }
    const missing = [...models].filter((id) => !ModelCatalog.has(id));
    assert.deepEqual(missing, [], `missing ModelCatalog entries: ${missing.join(', ')}`);
    assert.ok(models.size >= 15, `expected broad model coverage, saw ${models.size}`);
  });

  console.log(`\nclassic-unit OK (${count()} tests)`);
}, '/src/game/session.ts');
