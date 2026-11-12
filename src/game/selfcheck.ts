import type { KernelEvent } from '../contracts/events.js';
import { createSession, type Session } from './session.js';
import type { CommandResult, FloorId, GameSnapshot, TickResult } from './types.js';

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

function has(events: KernelEvent[], type: KernelEvent['type'], match: (ev: KernelEvent) => boolean = () => true): boolean {
  return events.some((ev) => ev.type === type && match(ev));
}

function fresh(floor: FloorId = 1): Session {
  const session = createSession();
  session.skipIntro();
  if (floor !== 1) session.debugTeleport(floor);
  return session;
}

function ticks(session: Session, n: number): { events: KernelEvent[]; output: string; last: TickResult } {
  const events: KernelEvent[] = [];
  let output = '';
  let last = session.tick();
  events.push(...last.events);
  output += last.output;
  for (let i = 1; i < n; i++) {
    last = session.tick();
    events.push(...last.events);
    output += last.output;
  }
  return { events, output, last };
}

/** Debug helper typed loosely: the concrete session has debugGive (main.ts probes for it). */
function give(session: Session, item: 'energy' | 'ram' | 'ssd'): TickResult {
  return (session as Session & { debugGive(item: string, amount?: number): TickResult }).debugGive(item);
}

function play(): void {
  const session = fresh();
  const run = (line: string) => session.exec(line);

  let step = run('rm -f ../.poltergeist.lock && touch ../cellar_hatch/.power_on && cd ../cellar_hatch');
  assert(step.snapshot.floor === 2, `check1 floor2, got ${step.snapshot.floor} ${step.output}`);
  assert(step.snapshot.shortcuts.includes('floor1-oneliner'), 'check1 shortcut');
  assert(has(step.events, 'FLOOR_ENTERED', (ev) => ev.type === 'FLOOR_ENTERED' && ev.floorId === 2), 'check1 FLOOR_ENTERED on advance');

  step = run('grep -h "FATAL" chronicles/*.log | wc -l > archivist_gate.sock');
  assert(!step.output.toLowerCase().includes('not the') && step.snapshot.floor === 2, `check1 socket ${step.output}`);
  step = run('cd iron_gate');
  assert(step.snapshot.cwd.endsWith('/iron_gate'), `check1 gate ${step.snapshot.cwd} ${step.output}`);
  run('mv heavy_plank.tar chasm/');
  step = run('chmod -x stone_gargoyle.bin');
  assert(has(step.events, 'ENEMY_STATE', (ev) => ev.type === 'ENEMY_STATE' && ev.state === 'petrified'), 'check1 petrified');
  step = run('cd chasm/crypt_stairs');
  assert(step.snapshot.floor === 3, `check1 floor3 ${step.snapshot.cwd} ${step.output}`);

  step = run('cd ../../../');
  assert(step.snapshot.cwd === '/usr/local/labyrinth', `check1 labyrinth ${step.snapshot.cwd}`);
  assert(step.events.some((ev) => ev.type === 'ROOM_TRANSITION' && ev.upwardPanelsSmashed >= 3), 'check1 smash');
  run('rm pedestal/.mimic');
  run('touch pedestal/{a,b,c}.rune');
  step = run('echo align > pressure_plate.sock');
  assert(step.output.toLowerCase().includes('shaft') || has(step.events, 'PUZZLE_DOOR_RESOLVED'), `check1 altar ${step.output}`);
  step = run('find . -name "boiler_shaft"');
  assert(step.output.includes('boiler_shaft'), `check1 find ${step.output}`);
  step = run('cd hidden_wing/boiler_shaft');
  assert(step.snapshot.floor === 4, `check1 floor4 ${step.snapshot.cwd} ${step.output}`);

  step = run('grep "^PASS=" boiler.dump | cut -d= -f2 | rev > valve_lock.sock');
  assert(has(step.events, 'PUZZLE_DOOR_RESOLVED') || step.output.toLowerCase().includes('furnace'), `check1 valve ${step.output}`);
  run('cd furnace_hall');
  step = run('ps');
  assert(step.output.includes('666'), `check1 ps ${step.output}`);
  step = run('kill -9 666');
  assert(has(step.events, 'ENEMY_KILLED', (ev) => ev.type === 'ENEMY_KILLED' && ev.model === 'boss.forkbomb' && ev.how === 'SIGKILL'), 'check1 boss killed');
  assert(has(step.events, 'VIBECODER_ACTION', (ev) => ev.type === 'VIBECODER_ACTION' && ev.action === 'cast' && ev.targetEntityId === 'f4-necromancer'), 'check1 hero casts');
  step = run('cd core_elevator');
  assert(step.snapshot.floor === 5, `check1 floor5 ${step.snapshot.cwd} ${step.output}`);

  step = run('mv chaos.stream /dev/null');
  assert(has(step.events, 'ENEMY_HIT', (ev) => ev.type === 'ENEMY_HIT' && ev.model === 'boss.kernel'), 'check1 kernel phase 1 hit');
  run('grep "WAKEUP_TOKEN=" core_dump.log > wakeup.sock');
  step = run("sed -i 's/player_trapped=true/player_trapped=false/' reality_anchor.conf");
  assert(has(step.events, 'ENEMY_KILLED', (ev) => ev.type === 'ENEMY_KILLED' && ev.model === 'boss.kernel'), 'check1 kernel down');
  step = run('exit');
  assert(step.snapshot.ended, `check1 exit ${step.output}`);
  assert(has(step.events, 'GAME_ENDED'), 'check1 GAME_ENDED');
  assert(step.snapshot.rank === 'S' || step.snapshot.rank === 'A', `check1 rank ${step.snapshot.rank}`);
  assert(step.snapshot.hp > 0, 'check1 hp');
}

export function runCampaignSelfCheck(): string {
  play();
  const denied = fresh(2);
  const blocked = denied.exec('cd iron_gate');
  assert(blocked.snapshot.cwd.endsWith('/entrance'), 'check2 cwd');
  assert(has(blocked.events, 'PERMISSION_DENIED_RATTLE'), 'check2 rattle');
  denied.exec('chmod +rx iron_gate');
  const opened = denied.exec('cd iron_gate');
  assert(opened.snapshot.cwd.endsWith('/iron_gate'), `check2 open ${opened.output}`);

  const cron = fresh(2);
  cron.exec('chmod +rx iron_gate');
  cron.exec('cd iron_gate');
  cron.exec('rm heavy_plank.tar');
  const restored = ticks(cron, 3);
  const listing = cron.exec('ls');
  assert((restored.output.includes('heavy_plank') || has(restored.events, 'SYSTEM_HAND_SPAWN')) && listing.output.includes('heavy_plank.tar'), `check3 restore ${listing.output}`);

  const logic = fresh();
  const both = logic.exec('echo hi && cd /no-such && echo no');
  assert(both.output.includes('hi'), 'check4 hi');
  assert(!both.output.split('\n').some((line) => line.trim() === 'no'), `check4 no leaked ${both.output}`);
  const or = logic.exec('echo a || echo b');
  assert(or.output.trim() === 'a', `check5 ${JSON.stringify(or.output)}`);

  const flood = fresh(3);
  const trap = flood.exec('cd north_exit');
  assert(trap.snapshot.cwd.endsWith('/cell_9'), `check6 cwd ${trap.snapshot.cwd}`);
  assert(trap.snapshot.room.flood === 20, `check6 flood ${trap.snapshot.room.flood}`);

  const boss = fresh(4);
  const valve = boss.exec('grep "^PASS=" boiler.dump | cut -d= -f2 | rev > valve_lock.sock');
  assert(has(valve.events, 'PUZZLE_DOOR_RESOLVED'), `check7 valve ${valve.output}`);
  boss.exec('cd furnace_hall');
  const rage = boss.exec('kill -15 666');
  assert(rage.output.includes('SIGTERM IGNORED') && has(rage.events, 'PLAYER_DAMAGED'), `check7 rage ${rage.output}`);
  const sealed = boss.exec('cd core_elevator');
  assert(sealed.snapshot.floor === 4, 'check7 still floor 4');
  boss.exec('kill -9 666');
  const lifted = boss.exec('cd core_elevator');
  assert(lifted.snapshot.floor === 5, `check7 elevator ${lifted.output}`);

  const core = fresh(5);
  core.exec('kill -9 1');
  assert(!core.snapshot().ended, 'check8 kill init');
  core.exec('exit');
  assert(!core.snapshot().ended, 'check8 early exit');

  return 'campaign self-check passed';
}

// ---------------------------------------------------------------- gameplay

function checkRunClock(): void {
  const clock = fresh(1);
  const realNow = Date.now;
  let fake = realNow();
  Date.now = () => fake;
  try {
    const clockStart = clock.restart().snapshot.timeSec;
    fake += 10_000;
    const played = clock.snapshot().timeSec;
    clock.setPaused(true);
    fake += 60_000;
    const whilePaused = clock.snapshot().timeSec;
    clock.setPaused(false);
    fake += 5_000;
    const after = clock.snapshot().timeSec;
    assert(played - clockStart === 10 && whilePaused === played && after === played + 5, `gameplay clock ${clockStart} ${played} ${whilePaused} ${after}`);
  } finally {
    Date.now = realNow;
  }
}

export function runGameplaySelfCheck(): string {
  // Paused: ticks do nothing, no damage. Then the gargoyle bites.
  const pause = fresh(2);
  pause.exec('chmod +rx iron_gate');
  pause.exec('cd iron_gate');
  const before = pause.snapshot().hp;
  pause.setPaused(true);
  const frozen = ticks(pause, 30);
  assert(frozen.events.length === 0 && frozen.output === '' && pause.snapshot().hp === before && frozen.last.snapshot.paused, 'gameplay paused ticks do nothing');
  pause.setPaused(false);

  // A careless player idling 20 ticks next to an enemy takes real damage, with a tell before each bite.
  const idle = ticks(pause, 20);
  const lost = before - pause.snapshot().hp;
  assert(lost >= 40, `gameplay idle 20 ticks beside the trojan cost only ${lost}`);
  const tells = idle.events.filter((ev) => ev.type === 'ENEMY_ATTACK').length;
  const bites = idle.events.filter((ev) => ev.type === 'PLAYER_DAMAGED').length;
  assert(tells >= bites && bites >= 4, `gameplay tells ${tells} bites ${bites}`);

  // Pickups heal, RAM raises max HP, SSD gives a backup.
  const heal = fresh(1);
  heal.exec('source ram_16gb.dimm');
  let snap = heal.snapshot();
  assert(snap.ram === 16 && snap.maxHp === 110, `gameplay ram ${snap.ram} ${snap.maxHp}`);
  heal.exec('source prod.py');
  const hurt = heal.snapshot().hp;
  const cell = heal.exec('cd .. && . energy.cell');
  assert(has(cell.events, 'PICKUP_COLLECTED', (ev) => ev.type === 'PICKUP_COLLECTED' && ev.item === 'energy' && ev.amount > 0), `gameplay energy ${cell.output}`);
  assert(cell.snapshot.hp > hurt && cell.snapshot.hp <= cell.snapshot.maxHp, `gameplay heal ${hurt} -> ${cell.snapshot.hp}`);
  const ssd = heal.exec('mv drive_bay/ssd_256gb.img ~');
  assert(ssd.snapshot.backups === 1 && ssd.snapshot.ssd === 256, `gameplay ssd via mv ~ ${ssd.output}`);
  assert(heal.exec('ls drive_bay').output.indexOf('ssd_256gb.img') < 0, 'gameplay pickup consumed');

  // Death with a backup: respawn in place at half HP, the backup is spent, the floor keeps its state.
  const backup = fresh(2);
  give(backup, 'ssd');
  backup.exec('kill 445');
  backup.exec('chmod +rx iron_gate');
  backup.exec('cd iron_gate');
  let respawn: KernelEvent | undefined;
  for (let i = 0; i < 80 && !respawn; i++) respawn = backup.tick().events.find((ev) => ev.type === 'PLAYER_RESPAWNED');
  snap = backup.snapshot();
  assert(respawn?.type === 'PLAYER_RESPAWNED' && respawn.from === 'ssd_backup', 'gameplay ssd respawn');
  assert(snap.hp === Math.ceil(snap.maxHp / 2) && snap.backups === 0 && snap.cwd.endsWith('/iron_gate') && snap.floor === 2, `gameplay respawn in place ${JSON.stringify({ hp: snap.hp, b: snap.backups, cwd: snap.cwd })}`);
  assert(!backup.exec('ls ..').output.includes('port_445/worm') && backup.exec('ps').output.indexOf(' 445 ') < 0, 'gameplay respawn keeps the dead worm dead');

  // Death without a backup: the floor restarts, enemies and pickups come back, RAM/SSD return to entry values.
  const restart = fresh(2);
  restart.exec('kill 445');
  restart.exec('source chronicles/energy.cell');
  restart.exec('chmod +rx iron_gate');
  restart.exec('cd iron_gate');
  restart.exec('source chasm/ram_16gb.dimm');
  let entered = false;
  let floorRestart = false;
  for (let i = 0; i < 120 && !floorRestart; i++) {
    const t = restart.tick();
    floorRestart = has(t.events, 'PLAYER_RESPAWNED', (ev) => ev.type === 'PLAYER_RESPAWNED' && ev.from === 'floor_restart');
    entered = entered || has(t.events, 'FLOOR_ENTERED');
  }
  snap = restart.snapshot();
  assert(floorRestart && entered, 'gameplay floor restart events');
  assert(snap.cwd === '/var/dungeon/entrance' && snap.enemiesLeft === snap.enemiesTotal && snap.ram === 0 && snap.hp === snap.maxHp, `gameplay floor reset ${JSON.stringify({ cwd: snap.cwd, left: snap.enemiesLeft, ram: snap.ram })}`);
  assert(restart.exec('ls port_445 chronicles').output.includes('worm.bin') && restart.exec('ls chronicles').output.includes('energy.cell'), 'gameplay enemies and pickups restored');

  // Ransomware locks a pickup; kill it, chmod 644, then the pickup works.
  const ransom = fresh(4);
  const locked = ticks(ransom, 12);
  assert(has(locked.events, 'INODE_MODE_CHANGED', (ev) => ev.type === 'INODE_MODE_CHANGED' && ev.newMode === 0), 'gameplay ransomware encrypts');
  const deny = ransom.exec('source ram_16gb.dimm');
  assert(deny.output.includes('Permission denied') && !has(deny.events, 'PICKUP_COLLECTED'), `gameplay locked pickup ${deny.output}`);
  ransom.exec('kill 7777');
  ransom.exec('chmod 644 ram_16gb.dimm');
  assert(has(ransom.exec('source ram_16gb.dimm').events, 'PICKUP_COLLECTED'), 'gameplay decrypted pickup');

  // The crack picks a sealed port open; with the crack dead, the sealed worm starves.
  const crack = fresh(2);
  crack.exec('chmod 000 port_445');
  ticks(crack, 4);
  assert(crack.exec('ps').output.includes('worm.bin'), 'gameplay crack reopened the port');
  crack.exec('kill 1337');
  crack.exec('chmod 000 port_445');
  const starve = ticks(crack, 3);
  assert(has(starve.events, 'ENEMY_KILLED', (ev) => ev.type === 'ENEMY_KILLED' && ev.entityId === 'f2-worm' && ev.how === 'chmod'), 'gameplay worm starves');

  // A running virus splits on rm; kill -9 on the parent takes the copies with it.
  const virus = fresh(3);
  virus.exec('cd ../../../');
  const split = virus.exec('rm virus.exe');
  assert(has(split.events, 'ENTITY_SPAWNED', (ev) => ev.type === 'ENTITY_SPAWNED' && ev.reason === 'virus_split') && virus.exec('ls').output.includes('virus.exe.1'), `gameplay split ${split.output}`);
  const nine = virus.exec('kill -9 404');
  assert(nine.events.filter((ev) => ev.type === 'ENEMY_KILLED').length === 2, `gameplay brood ${nine.output}`);

  // The exploit ignores kill but segfaults on a read-only buffer; the bug only dies to a patch.
  const exploit = fresh(3);
  exploit.exec('cd ../../../ram_slots');
  assert(exploit.exec('kill -9 1024').output.includes('not permitted'), 'gameplay exploit is root');
  assert(has(exploit.exec('chmod -w stack.buf').events, 'ENEMY_KILLED'), 'gameplay exploit segfault');
  const bug = fresh(1);
  assert(bug.exec('rm prod.py').output.includes('production'), 'gameplay bug refuses rm');
  assert(!has(bug.exec('kill 3003').events, 'ENEMY_KILLED'), 'gameplay bug restarts on kill');
  assert(has(bug.exec("sed -i 's/BUG/FIXED/' prod.py").events, 'ENEMY_KILLED'), 'gameplay bug patched');

  // Hidden things: spyware is invisible to ls but shows in ps (which reveals it on stage) and ls -a.
  const spy = fresh(1);
  spy.exec('cd ..');
  assert(!spy.exec('ls').output.includes('.spycam'), 'gameplay spyware hides from ls');
  const xray = spy.exec('ps');
  assert(xray.output.includes('spycam') && has(xray.events, 'ENEMY_STATE', (ev) => ev.type === 'ENEMY_STATE' && ev.entityId === 'f1-spycam' && ev.state === 'revealed'), 'gameplay ps reveals spyware');
  assert(spy.exec('ls -a').output.includes('.spycam'), 'gameplay spyware in ls -a');

  checkRunClock();

  // Lifecycle events from the debug and restart paths.
  const life = fresh(1);
  assert(has(life.debugTeleport(3).events, 'FLOOR_ENTERED'), 'gameplay teleport FLOOR_ENTERED');
  assert(has(life.restartFloor().events, 'FLOOR_ENTERED'), 'gameplay restartFloor FLOOR_ENTERED');
  assert(has(life.restart().events, 'FLOOR_ENTERED'), 'gameplay restart FLOOR_ENTERED');
  const typed = life.exec('ls');
  assert(typed.events[0]?.type === 'VIBECODER_ACTION', 'gameplay VIBECODER_ACTION first');
  return 'gameplay self-check passed';
}

// ---------------------------------------------------------------- tutorial and the agents

export function runTutorialSelfCheck(): string {
  const all = (res: { events: KernelEvent[] }, type: KernelEvent['type']) => res.events.filter((ev) => ev.type === type);

  // Steps complete in order; each completion is a TUTORIAL_STEP done plus a taunt; the last one is leaving the desk.
  const tut = fresh(1);
  const start = tut.snapshot().tutorial;
  assert(start?.step === 1 && start.command === 'ls' && start.agent === 'clod', `tutorial starts at step 1 ${JSON.stringify(start)}`);
  const arrive = tut.tick();
  assert(has(arrive.events, 'VIBECODER_EMOTE', (ev) => ev.type === 'VIBECODER_EMOTE' && ev.emote === 'shock') && has(arrive.events, 'TUTORIAL_STEP'), 'tutorial arrival: shock and first prompt');
  assert(arrive.output.includes('from the INSIDE'), 'tutorial arrival line');
  const outOfOrder = tut.exec('pwd');
  assert(!has(outOfOrder.events, 'TUTORIAL_STEP') && tut.snapshot().tutorial?.step === 1, 'tutorial steps complete in order');
  const lines = ['ls -la', 'cat todo.note', 'pwd', 'help'];
  lines.forEach((line, index) => {
    const res = tut.exec(line);
    const done = all(res, 'TUTORIAL_STEP').find((ev) => ev.type === 'TUTORIAL_STEP' && ev.done);
    assert(done?.type === 'TUTORIAL_STEP' && done.step === index + 1, `tutorial step ${index + 1} done by ${line}`);
    assert(has(res.events, 'AGENT_TAUNT', (ev) => ev.type === 'AGENT_TAUNT' && (ev.mood === 'laugh' || ev.mood === 'smug')), `tutorial taunt after ${line}`);
    assert(tut.snapshot().tutorial?.step === index + 2, `tutorial next step after ${line}`);
  });
  const before = tut.snapshot().hp;
  const quiet = ticks(tut, 30);
  assert(tut.snapshot().hp === before && !has(quiet.events, 'PLAYER_DAMAGED'), 'tutorial: no damage while it runs (the bug holds its fire)');
  const leave = tut.exec('cd ..');
  assert(has(leave.events, 'TUTORIAL_STEP', (ev) => ev.type === 'TUTORIAL_STEP' && ev.done && ev.step === ev.total), 'tutorial final step on cd ..');
  assert(has(leave.events, 'VIBECODER_EMOTE', (ev) => ev.type === 'VIBECODER_EMOTE' && ev.emote === 'determined') && leave.snapshot.tutorial === null, 'tutorial ends');
  assert(has(ticks(tut, 30).events, 'PLAYER_DAMAGED'), 'tutorial over: enemies fight again');

  // Skip, from the shell and from the Session method.
  const skip = fresh(1);
  const skipped = skip.exec('tutorial skip');
  assert(skip.snapshot().tutorial === null && has(skipped.events, 'TUTORIAL_STEP', (ev) => ev.type === 'TUTORIAL_STEP' && ev.done), 'tutorial skip command');
  assert(skip.exec('tutorial').output.includes('No prompts pending'), 'tutorial command after skip');
  const method = fresh(1);
  method.skipTutorial();
  assert(method.snapshot().tutorial === null, 'skipTutorial()');
  assert(has(ticks(method, 30).events, 'PLAYER_DAMAGED'), 'skipped tutorial: the bug bites again');

  // The speedrun one-liner still works and closes the tutorial gracefully.
  const speed = fresh(1);
  const run = speed.exec('rm -f ../.poltergeist.lock && touch ../cellar_hatch/.power_on && cd ../cellar_hatch');
  assert(run.snapshot.floor === 2 && run.snapshot.tutorial === null && run.snapshot.shortcuts.includes('floor1-oneliner'), 'tutorial vs speedrun one-liner');
  assert(has(run.events, 'TUTORIAL_STEP', (ev) => ev.type === 'TUTORIAL_STEP' && ev.done), 'speedrun ends the tutorial with a done step');

  // Commentary: floor objectives as prompts, panic at low HP, death and the ending, and never spam.
  assert(has(run.events, 'AGENT_TAUNT', (ev) => ev.type === 'AGENT_TAUNT' && ev.mood === 'order' && ev.text.includes('PROMPT')), 'floor 2 objective as a prompt');
  const panic = fresh(2);
  panic.exec('chmod +rx iron_gate');
  panic.exec('cd iron_gate');
  let panicked = false;
  let died = false;
  let taunts = 0;
  let quietRun = 0;
  let maxBurst = 0;
  for (let i = 0; i < 80; i++) {
    const t = panic.tick();
    panicked = panicked || has(t.events, 'VIBECODER_EMOTE', (ev) => ev.type === 'VIBECODER_EMOTE' && ev.emote === 'panic');
    died = died || has(t.events, 'AGENT_TAUNT', (ev) => ev.type === 'AGENT_TAUNT' && ev.mood === 'laugh' && ev.text.includes('top'));
    const n = t.events.filter((ev) => ev.type === 'AGENT_TAUNT').length;
    taunts += n;
    quietRun = n ? 0 : quietRun + 1;
    maxBurst = Math.max(maxBurst, n);
  }
  assert(panicked && died, `commentary: panic ${panicked}, death taunt ${died}`);
  assert(taunts <= 80 / 8 + 2 && maxBurst <= 2, `commentary is rate-limited (${taunts} taunts in 80 ticks)`);
  return 'tutorial self-check passed';
}

// ---------------------------------------------------------------- commands (§5)

interface Case {
  name: string;
  floor?: FloorId;
  setup?: string[];
  cmd: string;
  /** Output must contain (string) or match (RegExp). */
  expect?: string | RegExp;
  /** Output must not contain / match. */
  absent?: string | RegExp;
  check?: (res: CommandResult, session: Session) => boolean;
}

const contains = (text: string, want: string | RegExp) => (typeof want === 'string' ? text.includes(want) : want.test(text));

const CASES: Case[] = [
  { name: 'pwd', cmd: 'pwd', expect: '/home/dev/nightmare_workspace/desk\n' },
  { name: 'ls', setup: ['cd ..'], cmd: 'ls', expect: 'intercom.sock', absent: '.poltergeist' },
  { name: 'ls -a', setup: ['cd ..'], cmd: 'ls -a', expect: '.poltergeist.lock', check: (r) => has(r.events, 'LANTERN_REVEAL') },
  { name: 'ls -l', cmd: 'ls -l', expect: /^-rw-r--r-- 1 dev\s+mansion\s+\d+ todo\.note$/m },
  { name: 'ls -la', setup: ['cd ..'], cmd: 'ls -la', expect: /drwxr-xr-x .* \.\n[\s\S]*\.spycam/ },
  { name: 'cd absolute', cmd: 'cd /home/dev/nightmare_workspace/drive_bay', check: (r) => r.snapshot.cwd.endsWith('/drive_bay') },
  { name: 'cd relative ..', cmd: 'cd ../drive_bay', check: (r) => r.snapshot.cwd === '/home/dev/nightmare_workspace/drive_bay' },
  { name: 'cd ../../..', cmd: 'cd ../../..', check: (r) => r.snapshot.cwd === '/home' },
  { name: 'cd -', setup: ['cd ..'], cmd: 'cd -', check: (r) => r.snapshot.cwd.endsWith('/desk') },
  { name: 'cd symlink', setup: ['ln -s ../drive_bay bay'], cmd: 'cd bay', check: (r) => r.snapshot.cwd.endsWith('/drive_bay') },
  { name: 'cd ELOOP', setup: ['ln -s loop loop'], cmd: 'cd loop', expect: 'too many levels of symbolic links' },
  { name: 'cd denied', floor: 2, cmd: 'cd iron_gate', expect: 'Permission denied', check: (r) => has(r.events, 'PERMISSION_DENIED_RATTLE') },
  { name: 'cat', cmd: 'cat todo.note', expect: 'TODO' },
  { name: 'cat socket', setup: ['cd ..'], cmd: 'cat intercom.sock', check: (r) => has(r.events, 'OBSTACLE_DIALOGUE_RENDERED') },
  { name: 'cat stdin', cmd: 'echo piped | cat', expect: 'piped' },
  { name: 'readlink', floor: 3, cmd: 'readlink north_exit', expect: '/usr/local/labyrinth/wing_a/floor_3/cell_9' },
  { name: 'find -name', floor: 2, cmd: 'find . -name "*.log"', expect: './chronicles/day2.log' },
  { name: 'find -type d', floor: 2, cmd: 'find . -type d -name "c*"', expect: './chronicles', absent: 'day1' },
  { name: 'touch', cmd: 'touch rune.txt', check: (r, s) => has(r.events, 'FILE_CREATED') && s.exec('ls').output.includes('rune.txt') },
  { name: 'rm', setup: ['touch x.tmp'], cmd: 'rm x.tmp', check: (r, s) => has(r.events, 'FILE_REMOVED') && !s.exec('ls').output.includes('x.tmp') },
  { name: 'rm -f missing', cmd: 'rm -f nope && echo ok', expect: 'ok' },
  { name: 'rm dir needs -r', setup: ['cd ..'], cmd: 'rm drive_bay', expect: 'Is a directory' },
  { name: 'rm -r', setup: ['cd ..'], cmd: 'rm -r drive_bay && ls', absent: 'drive_bay' },
  { name: 'rm -rf', setup: ['cd ..'], cmd: 'rm -rf drive_bay nothing && ls', absent: 'drive_bay' },
  { name: 'rm busy socket', floor: 5, cmd: 'rm wakeup.sock', expect: 'busy' },
  { name: 'rm -r busy room', floor: 3, setup: ['cd ../../..'], cmd: 'rm -r pedestal', expect: 'busy' },
  { name: 'mv busy room', floor: 2, setup: ['chmod +rx iron_gate', 'cd iron_gate'], cmd: 'mv chasm pit', expect: 'busy' },
  { name: 'mv rename', cmd: 'mv todo.note note.txt && ls', expect: 'note.txt', absent: 'todo.note' },
  { name: 'mv rename event', cmd: 'mv todo.note note.txt', check: (r) => has(r.events, 'FILE_CREATED') && has(r.events, 'OBJECT_MOVED') },
  { name: 'mv /dev/null', setup: ['touch junk'], cmd: 'mv junk /dev/null && ls', absent: 'junk' },
  { name: 'cp', cmd: 'cp todo.note copy.txt && cat copy.txt', expect: 'TODO', check: (r) => has(r.events, 'FILE_CREATED') },
  { name: 'chmod 000', setup: ['chmod 000 todo.note'], cmd: 'cat todo.note', expect: 'Permission denied' },
  { name: 'chmod u+r', setup: ['chmod 000 todo.note', 'chmod u+r todo.note'], cmd: 'cat todo.note', expect: 'TODO' },
  { name: 'chmod 755', cmd: 'chmod 755 todo.note && ls -l todo.note', expect: '-rwxr-xr-x' },
  { name: 'chmod 555', cmd: 'chmod 555 todo.note && ls -l todo.note', expect: '-r-xr-xr-x' },
  { name: 'chmod +w -x +rx', cmd: 'chmod 000 todo.note && chmod +rx todo.note && chmod +w todo.note && chmod -x todo.note && ls -l todo.note', expect: '-rw-rw-rw-' },
  { name: 'chmod a=r,u+w', cmd: 'chmod a=r,u+w todo.note && ls -l todo.note', expect: '-rw-r--r--' },
  { name: 'chmod invalid', cmd: 'chmod q+z todo.note', expect: 'invalid mode' },
  { name: 'ln -s', cmd: 'ln -s todo.note link && readlink link', expect: 'todo.note' },
  { name: 'echo', cmd: 'echo hello world', expect: 'hello world\n' },
  { name: 'echo -n', cmd: 'echo -n x | wc -c', expect: '1\n' },
  { name: 'grep', floor: 2, cmd: 'grep FATAL chronicles/*.log', expect: 'chronicles/day1.log:FATAL seal cracked' },
  { name: 'grep -h', floor: 2, cmd: 'grep -h FATAL chronicles/*.log', expect: 'FATAL seal cracked', absent: 'day1.log:' },
  { name: 'grep -c', floor: 2, cmd: 'grep -c FATAL chronicles/day3.log', expect: '3\n' },
  { name: 'grep -i', floor: 2, cmd: 'grep -i fatal chronicles/day2.log', expect: 'FATAL the third' },
  { name: 'grep -v', floor: 2, cmd: 'grep -v FATAL chronicles/day2.log', expect: 'ok\n', absent: 'third' },
  { name: 'grep -n', floor: 2, cmd: 'grep -n bell chronicles/day1.log', expect: '4:FATAL second bell' },
  { name: 'grep denied', floor: 4, cmd: 'grep ENCRYPTED energy.cell', expect: 'Permission denied' },
  { name: 'wc -l', floor: 2, cmd: 'grep -h "FATAL" chronicles/*.log | wc -l', expect: '6\n' },
  { name: 'wc', cmd: 'echo one two | wc', expect: '1 2 8\n' },
  { name: 'cut -d -f', floor: 4, cmd: 'grep "^PASS=" boiler.dump | cut -d= -f2', expect: '9042_ECANRUF\n' },
  { name: 'cut -f list', cmd: 'echo a:b:c | cut -d: -f1,3', expect: 'a:c\n' },
  { name: 'rev', cmd: 'echo abc | rev', expect: 'cba\n' },
  { name: 'sed stream', cmd: "echo aaa | sed 's/a/b/'", expect: 'baa\n' },
  { name: 'sed g', cmd: "echo aaa | sed 's/a/b/g'", expect: 'bbb\n' },
  { name: 'sed -i', cmd: "sed -i 's/hatch/HATCH/g' todo.note && cat todo.note", expect: 'HATCH' },
  { name: 'head -n', floor: 5, cmd: 'head -n 2 core_dump.log', check: (r) => r.output === 'core panic 0x00\nstack junk\n' },
  { name: 'head -N', floor: 5, cmd: 'head -3 core_dump.log | wc -l', expect: '3\n' },
  { name: 'tail', floor: 5, cmd: 'tail -n 1 core_dump.log', check: (r) => r.output === 'end dump\n' },
  { name: 'ps', cmd: 'ps', expect: /PID\s+PPID STAT/, check: (r) => has(r.events, 'HUD_OVERLAY_TOGGLED') && r.snapshot.room.xray },
  { name: 'ps aux', cmd: 'ps aux', expect: /USER\s+PID[\s\S]*cron_restorer/ },
  { name: 'top', cmd: 'top', expect: /top - [\s\S]*Tasks:/ },
  { name: 'kill -l', cmd: 'kill -l', expect: 'SIGKILL' },
  { name: 'kill -TERM', floor: 2, cmd: 'kill -TERM 1337', check: (r) => has(r.events, 'ENEMY_KILLED', (ev) => ev.type === 'ENEMY_KILLED' && ev.how === 'SIGTERM') },
  { name: 'kill -KILL', floor: 2, cmd: 'kill -KILL 445', check: (r) => has(r.events, 'ENEMY_KILLED', (ev) => ev.type === 'ENEMY_KILLED' && ev.how === 'SIGKILL') },
  { name: 'kill -15', floor: 3, setup: ['cd ../../..'], cmd: 'kill -15 404', expect: 'traps SIGTERM' },
  { name: 'kill -9', floor: 3, setup: ['cd ../../..'], cmd: 'kill -9 404', check: (r) => has(r.events, 'ENEMY_KILLED') },
  { name: 'kill -STOP', floor: 4, setup: ['kill -STOP 7777'], cmd: 'ps', expect: /7777\s+1 T/ },
  { name: 'kill -CONT', floor: 4, setup: ['kill -STOP 7777', 'kill -CONT 7777'], cmd: 'ps', expect: /7777\s+1 R/ },
  { name: 'kill no such', cmd: 'kill 31337', expect: 'No such process' },
  { name: 'kill pid 1', cmd: 'kill -9 1', expect: 'Operation not permitted' },
  { name: 'pkill', floor: 2, cmd: 'pkill keygen', check: (r, s) => has(r.events, 'ENEMY_KILLED') && !s.exec('ps').output.includes('keygen') },
  { name: 'help', cmd: 'help', expect: /source[\s\S]*Hint/ },
  { name: 'man cmd', cmd: 'man kill', expect: '-STOP' },
  { name: 'man malware', cmd: 'man virus', expect: 'kill -9' },
  { name: 'man missing', cmd: 'man frobnicate', expect: 'No manual entry' },
  { name: 'status', cmd: 'status', expect: /HP 100\/100\s+RAM 0 GB\s+SSD 0 GB \(0 backups\)[\s\S]*malware left 3\/3/ },
  { name: 'whoami', cmd: 'whoami', expect: 'dev' },
  { name: 'tutorial', cmd: 'tutorial', expect: 'PROMPT #1' },
  { name: 'clear', cmd: 'clear', check: (r) => r.clear === true },
  { name: 'exit early', cmd: 'exit', expect: 'hooks', check: (r) => !r.snapshot.ended },
  { name: 'logout early', cmd: 'logout', expect: 'hooks' },
  { name: 'unknown', cmd: 'frobnicate', expect: 'command not found', check: (r) => r.stderr?.includes('command not found') === true },
  { name: ';', cmd: 'echo a; echo b', expect: 'a\nb\n' },
  { name: '&&', cmd: 'cd /nope && echo no', absent: /^no$/m },
  { name: '||', cmd: 'cd /nope || echo yes', expect: 'yes' },
  { name: '|', cmd: 'cat todo.note | grep -c cd', expect: '1\n' },
  { name: '>', cmd: 'echo hi > f.txt && cat f.txt', expect: 'hi\n' },
  { name: '>>', cmd: 'echo a > f.txt && echo b >> f.txt && cat f.txt', expect: 'a\nb\n' },
  { name: '> new file event', cmd: 'echo hi > g.txt', check: (r) => has(r.events, 'FILE_CREATED') },
  { name: 'glob', floor: 2, cmd: 'ls chronicles/*.log', expect: 'chronicles/day1.log  chronicles/day2.log  chronicles/day3.log\n' },
  { name: 'glob ?', floor: 2, cmd: 'cat chronicles/day?.log | grep -c FATAL', expect: '6\n' },
  { name: 'ls dirs', floor: 2, cmd: 'ls chronicles port_445', expect: 'chronicles:\nday1.log  day2.log  day3.log  energy.cell\n\nport_445:\nworm.bin\n' },
  { name: 'braces', cmd: 'touch {a,b,c}.rune && ls', expect: /a\.rune\s+b\.rune\s+c\.rune/ },
  { name: 'quotes', cmd: 'echo "a  b" | wc -c', expect: '5\n' },
  { name: 'syntax', cmd: 'echo "oops', expect: 'unmatched quote' },
  { name: 'source', cmd: 'source ram_16gb.dimm', check: (r) => r.snapshot.maxHp === 110 && has(r.events, 'PICKUP_COLLECTED') },
  { name: '. pickup', setup: ['cd ..'], cmd: '. energy.cell', check: (r) => has(r.events, 'PICKUP_COLLECTED', (ev) => ev.type === 'PICKUP_COLLECTED' && ev.entityId === 'f1-energy') },
  { name: 'mv pickup ~', setup: ['cd ../drive_bay'], cmd: 'mv ssd_256gb.img ~', check: (r) => r.snapshot.backups === 1 },
  { name: 'source non-pickup', cmd: 'source todo.note', expect: 'nothing to load' },
  { name: 'cp pickup', cmd: 'cp ram_16gb.dimm x.dimm', expect: 'copy-protected' },
  { name: 'stderr split', cmd: 'cat nope; echo fine', check: (r) => r.stderr === 'cat nope: No such file or directory\n'.replace('cat nope', 'cat: nope') && r.output.includes('fine') },
  { name: 'success to stdout', floor: 2, cmd: 'grep -h "FATAL" chronicles/*.log | wc -l > archivist_gate.sock', expect: 'gate unlocks', check: (r) => !r.stderr },
  { name: 'kiro status', cmd: 'kiro', expect: 'KIRO.D — SELF-HOSTED GHOST COMPANION' },
  { name: 'kiro load llama', cmd: 'kiro load llama', expect: 'llama-3-8b-local-q4.gguf', check: (r) => has(r.events, 'KIRO_ACTION', (ev) => ev.type === 'KIRO_ACTION' && ev.action === 'load') },
  { name: 'kiro r1 scan reveals', setup: ['cd ..', 'kiro load deepseek'], cmd: 'kiro scan', expect: '.poltergeist.lock', check: (r) => has(r.events, 'LANTERN_REVEAL') },
  { name: 'kiro pipe audit', cmd: 'cat prod.py | kiro', expect: 'BUG' },
  { name: 'kiro crack gate', floor: 2, setup: ['kiro crack iron_gate', 'pwd'], cmd: 'pwd', expect: 'CIPHER CRACKED', check: (_r, s) => s.exec('cd iron_gate').snapshot.cwd.endsWith('/iron_gate') },
];

export function runCommandConformance(): string {
  const failures: string[] = [];
  for (const test of CASES) {
    try {
      const session = fresh(test.floor ?? 1);
      if (test.name !== 'tutorial') session.skipTutorial();
      for (const line of test.setup ?? []) session.exec(line);
      const res = session.exec(test.cmd);
      if (test.expect !== undefined && !contains(res.output, test.expect)) failures.push(`${test.name}: expected ${String(test.expect)} in ${JSON.stringify(res.output)}`);
      if (test.absent !== undefined && contains(res.output, test.absent)) failures.push(`${test.name}: did not expect ${String(test.absent)} in ${JSON.stringify(res.output)}`);
      if (test.check && !test.check(res, session)) failures.push(`${test.name}: check failed, output ${JSON.stringify(res.output)}`);
    } catch (err) {
      failures.push(`${test.name}: threw ${String(err)}`);
    }
  }

  const tab = fresh(1);
  tab.skipTutorial();
  const complete = (line: string, want: string) => {
    const got = tab.complete(line).line;
    if (got !== want) failures.push(`complete ${JSON.stringify(line)}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  };
  complete('ca', 'cat ');
  complete('cat to', 'cat todo.note ');
  complete('cat ../dr', 'cat ../drive_bay/');
  complete('cd ../c', 'cd ../cellar_hatch/');
  complete('man vir', 'man virus ');
  complete('ls -la; so', 'ls -la; source ');
  if (!tab.complete('cat ').matches.includes('todo.note') || tab.complete('cat ').matches.includes('cat')) failures.push('complete: argument position lists paths, not commands');

  if (failures.length) throw new Error(`command conformance: ${failures.length} failing\n  ${failures.join('\n  ')}`);
  return `command conformance passed (${CASES.length} cases + completion)`;
}

// ---------------------------------------------------------------- every model on stage

export const REQUIRED_MODELS = [
  'vibecoder.dev',
  'malware.virus', 'malware.worm', 'malware.trojan', 'malware.bug', 'malware.exploit', 'malware.crack',
  'malware.ransomware', 'malware.spyware', 'malware.rootkit', 'malware.zombie', 'boss.forkbomb', 'boss.kernel',
  'pickup.energy', 'pickup.ram', 'pickup.ssd',
  'door.usb', 'door.ethernet', 'door.hdmi', 'door.serial', 'door.firewall', 'door.loopback', 'door.devnull', 'door.socket',
  'prop.file', 'prop.tar', 'prop.fuse', 'prop.chip', 'prop.capacitor', 'prop.heatsink', 'prop.fan', 'prop.cables', 'prop.crt', 'prop.tombstone', 'npc.kiro_ghost',
];

/** Walks every room of the campaign (with the lantern lit, zombies forked, the portal open) and checks the stage sees every model. */
export function runModelCoverage(): string {
  const seen = new Set<string>();
  const ids = new Set<string>();
  const look = (snap: GameSnapshot) => {
    const roomIds = new Set<string>();
    for (const actor of snap.room.actors) {
      if (actor.model) seen.add(actor.model);
      const id = actor.id ?? actor.key;
      if (roomIds.has(id)) throw new Error(`duplicate actor id ${id} in ${snap.room.path}`);
      roomIds.add(id);
      ids.add(id);
      if (!actor.model) throw new Error(`actor ${id} in ${snap.room.path} has no model`);
      if (actor.x > 4.95 || actor.x < -1.2) throw new Error(`actor ${id} in ${snap.room.path} off stage at x=${actor.x}`);
    }
    const legacy = snap.room.actors.filter((a) => a.key !== 'entity').map((a) => a.key);
    if (new Set(legacy).size !== legacy.length) throw new Error(`legacy key used twice in ${snap.room.path}: ${legacy.join(',')}`);
  };
  const session = fresh(1);
  const tour = [
    'ls', 'cd ..', 'ls -la', 'touch cellar_hatch/.power_on', 'cd drive_bay', 'cd ..', 'rm .poltergeist.lock', 'cd cellar_hatch',
    'ls', 'cd chronicles', 'cd ..', 'chmod +rx iron_gate', 'cd iron_gate', 'chmod -x stone_gargoyle.bin', 'cd chasm', 'cd ..',
    'mv heavy_plank.tar chasm/', 'cd chasm', 'cd crypt_stairs',
    'ls', 'cd ../../../', 'ls -la pedestal', 'cd pedestal', 'cd ..', 'cd ram_slots', 'cd ..', 'rm pedestal/.mimic',
    'touch pedestal/{a,b,c}.rune', 'echo align > pressure_plate.sock', 'cd hidden_wing', 'cd boiler_shaft',
    'ls', 'grep "^PASS=" boiler.dump | cut -d= -f2 | rev > valve_lock.sock', 'cd furnace_hall', '@tick 6', 'kill -9 666', 'cd core_elevator',
    'ls', 'mv chaos.stream /dev/null', 'grep "WAKEUP_TOKEN=" core_dump.log > wakeup.sock',
    "sed -i 's/player_trapped=true/player_trapped=false/' reality_anchor.conf", '@tick 3',
  ];
  look(session.snapshot());
  for (const line of tour) {
    if (line.startsWith('@tick')) {
      for (let i = 0; i < Number(line.slice(6)); i++) look(session.tick().snapshot);
      continue;
    }
    look(session.exec(line).snapshot);
  }
  const missing = REQUIRED_MODELS.filter((id) => !seen.has(id));
  if (missing.length) throw new Error(`model coverage: never on stage: ${missing.join(', ')}`);
  return `model coverage passed (${REQUIRED_MODELS.length} required models on stage, ${ids.size} actor ids)`;
}

declare const process: { env: Record<string, string | undefined>; exit(code: number): void };

if (typeof process !== 'undefined' && process.env?.HT_SELFCHECK === '1') {
  try {
    console.log(runCampaignSelfCheck());
    console.log(runGameplaySelfCheck());
    console.log(runTutorialSelfCheck());
    console.log(runCommandConformance());
    console.log(runModelCoverage());
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
