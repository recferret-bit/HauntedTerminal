// Gameplay state-machine properties: PlayLifecycle, the KiroCompanion crack, the AgentDirector tutorial, BATTLE_TRANSITIONS
// with the battle.ts orchestrator, the AppBus and the PlayEventBus. Helper module of gameplay.mjs, which splices these
// into its list in place. Spec: .kiro/specs/property-based-tests/.
import fc from 'fast-check';
import { expect } from './kit.mjs';

function lifecycleProps({ PLAY_PHASE_TRANSITIONS, createPlayLifecycle, nextMachineState, reachableStates }) {
  return [
    {
      name: 'PlayLifecycle FSM obeys its transition table; derive(): the clock pauses on any reason, the shell blocks on a non-hidden reason or an open manual or map',
      // [initHidden, ops, manualOpen, mapOpen]: a hidden-only tab with the map open, then the manual open, must block the shell.
      examples: [
        [false, ['send:ENTER_INTRO', 'send:BEGIN_PLAY', 'add:hidden', 'del:intro', 'send:BEGIN_ENDING'], false, false],
        [true, ['del:intro'], false, true],
        [true, ['del:intro'], true, false],
      ],
      build: () =>
        fc.property(
          fc.boolean(),
          fc.array(
            fc.oneof(
              fc.constantFrom('ENTER_INTRO', 'BEGIN_PLAY', 'BEGIN_ENDING', 'FINISH_OUTRO', 'PLAY_AGAIN', 'SWAP_LAB').map((e) => `send:${e}`),
              fc.constantFrom('intro', 'card', 'outro', 'ended', 'cinematic', 'hidden', 'reveal').map((r) => `add:${r}`),
              fc.constantFrom('intro', 'card', 'outro', 'ended', 'cinematic', 'hidden', 'reveal').map((r) => `del:${r}`),
            ),
            { maxLength: 24 },
          ),
          fc.boolean(),
          fc.boolean(),
          (initHidden, ops, manualOpen, mapOpen) => {
            const reached = reachableStates(PLAY_PHASE_TRANSITIONS, 'boot');
            const lc = createPlayLifecycle(initHidden);
            let model = 'boot';
            const reasons = new Set(initHidden ? ['intro', 'hidden'] : ['intro']);
            for (const op of ops) {
              const [kind, arg] = op.split(':');
              if (kind === 'send') {
                const wantNext = nextMachineState(PLAY_PHASE_TRANSITIONS, model, arg);
                const ok = lc.send(arg);
                expect(ok === (wantNext !== null), `send(${arg}) returned ${ok} from ${model}`);
                if (wantNext !== null) model = wantNext;
              } else if (kind === 'add') {
                lc.addReason(arg);
                reasons.add(arg);
              } else {
                lc.deleteReason(arg);
                reasons.delete(arg);
              }
              expect(lc.phase() === model && reached.has(lc.phase()), `phase mismatch: ${lc.phase()} vs ${model}`);
              const derived = lc.derive({ manualOpen, mapOpen });
              expect(derived.clockPaused === (reasons.size > 0), 'clockPaused disagrees with pause reasons');
              const nonHidden = [...reasons].some((r) => r !== 'hidden');
              const want = nonHidden || manualOpen || mapOpen;
              expect(derived.shellBlocked === want, `shellBlocked ${derived.shellBlocked}, want ${want} (reasons ${[...reasons]}, manual ${manualOpen}, map ${mapOpen}); hidden alone never blocks, an open manual or map always does`);
            }
          },
        ),
    },
  ];
}

function companionProps({ KiroCompanion, AgentDirector }) {
  return [
    {
      name: 'KiroCompanion crack FSM: a crack needs 2 steps on qwen and 3 on other cores, each non-final step adds exactly 1 and completes nothing, the final step unlocks the target, a room change aborts',
      examples: [[['load:qwen', 'start:/a:lock1', 'adv:/a', 'adv:/a']], [['start:/a:lock1', 'adv:/b']], [['load:llama', 'start:/a:gate1', 'adv:/a', 'adv:/a', 'adv:/a', 'start:/a:gate1', 'adv:/a']]],
      build: () =>
        fc.property(
          fc.array(
            fc.constantFrom('load:qwen', 'load:llama', 'start:/a:gate1', 'start:/b:gate2', 'adv:/a', 'adv:/b', 'clear'),
            { maxLength: 20 },
          ),
          (ops) => {
            const kiro = new KiroCompanion();
            let core = 'qwen';
            for (const op of ops) {
              const [kind, a, b] = op.split(':');
              if (kind === 'load') {
                kiro.loadCore(a);
                core = a;
              } else if (kind === 'clear') kiro.clearRoomTransient();
              else if (kind === 'start') {
                kiro.startCrack(a, b, `${a}/${b}`);
                const need = core === 'qwen' ? 2 : 3; // the qwen perk: 2 steps instead of 3
                expect(kiro.activeCrack?.progress === 0 && kiro.activeCrack.required === need, `start on ${core}: ${JSON.stringify(kiro.activeCrack)}, want 0/${need}`);
              } else if (kind === 'adv') {
                const prev = kiro.activeCrack ? { ...kiro.activeCrack } : null;
                const wasUnlocked = prev ? kiro.isUnlocked(prev.targetPath) : false;
                const res = kiro.advanceCrack(a);
                if (!prev) {
                  expect(res.completedTargetPath === null && kiro.activeCrack === null, 'advanceCrack with no crack did something');
                } else if (prev.dirPath !== a) {
                  expect(kiro.crackPhase === 'idle' && kiro.activeCrack === null && res.completedTargetPath === null, 'room change did not abort crack');
                  expect(kiro.isUnlocked(prev.targetPath) === wasUnlocked, 'an aborted crack unlocked its target');
                } else if (prev.progress + 1 < prev.required) {
                  expect(res.completedTargetPath === null && kiro.isUnlocked(prev.targetPath) === wasUnlocked, `crack completed early at step ${prev.progress + 1}/${prev.required}`);
                  expect(kiro.crackPhase === 'cracking' && kiro.activeCrack?.progress === prev.progress + 1 && kiro.activeCrack.required === prev.required, `a non-final step did not advance progress by 1 (${prev.progress} -> ${kiro.activeCrack?.progress})`);
                } else {
                  expect(res.completedTargetPath === prev.targetPath && kiro.isUnlocked(prev.targetPath), 'completed crack did not unlock path');
                  expect(kiro.crackPhase === 'idle' && kiro.activeCrack === null, 'completed crack stayed active');
                }
              }
              expect((kiro.crackPhase === 'cracking') === (kiro.activeCrack !== null), 'crackPhase and activeCrack diverged');
            }
          },
        ),
    },
    {
      name: 'AgentDirector tutorial: arrive() speaks once per run, skip, abandon and leaving the desk after arrival end it, finished and abandoned stay put until reset(), and there state(), arrive(), skip() and observe() are silent',
      examples: [[['arrive', 'leave', 'arrive', 'skip', 'reset', 'abandon', 'arrive']], [['arrive', 'step', 'skip', 'step', 'leave']], [['reset', 'arrive', 'arrive']]],
      build: () =>
        fc.property(
          fc.array(fc.constantFrom('arrive', 'step', 'leave', 'skip', 'abandon', 'reset'), { maxLength: 20 }),
          (ops) => {
            const dir = new AgentDirector();
            const ended = (p) => p === 'finished' || p === 'abandoned';
            const silent = (c) => c.text === '' && c.events.length === 0;
            for (const op of ops) {
              const before = dir.tutorialPhase;
              let out = null;
              if (op === 'arrive') out = dir.arrive();
              else if (op === 'step') out = dir.observe([['ls']], { failed: false, leftDesk: false });
              else if (op === 'leave') out = dir.observe([['cd', '..']], { failed: false, leftDesk: true });
              else if (op === 'skip') out = dir.skip();
              else if (op === 'abandon') dir.abandon();
              else dir.reset();
              const after = dir.tutorialPhase;
              const tag = `${op} in ${before} -> ${after}`;
              if (op === 'reset') {
                expect(after === 'waiting' && dir.state()?.step === 1, `${tag}: reset() did not restart at step 1 (${JSON.stringify(dir.state())})`);
              } else if (ended(before)) {
                expect(after === before, `${tag}: an ended tutorial changed phase`);
                expect(out === null || silent(out), `${tag}: an ended tutorial still spoke ${JSON.stringify(out?.text)}`);
              } else if (op === 'arrive') {
                expect((out !== null) === (before === 'waiting') && after === (before === 'waiting' ? 'active' : before), `${tag}: arrive() returned ${out === null ? 'null' : 'a line'}`);
                // A `leave` before any arrival leaves no prompt to issue (state() null); the game always arrives first, so that
                // corner is not judged here.
                const cur = dir.state();
                expect(out === null || !cur || out.events.some((e) => e.type === 'TUTORIAL_STEP' && e.step === cur.step && !e.done), `${tag}: the arrival did not issue the current prompt`);
              } else if (op === 'skip') {
                expect(after === 'finished' && out.events.some((e) => e.type === 'TUTORIAL_STEP' && e.done), `${tag}: skip() did not finish with a done step`);
              } else if (op === 'abandon') {
                expect(after === 'abandoned', `${tag}: abandon() did not abandon`);
              } else if (op === 'leave' && before === 'active') {
                expect(after === 'finished', `${tag}: leaving the desk did not finish the tutorial`);
              }
              if (ended(after)) {
                expect(dir.state() === null && /^No prompts pending/.test(dir.describe()), `${tag}: an ended tutorial still has a prompt`);
                expect(dir.arrive() === null && silent(dir.skip()) && dir.tutorialPhase === after, `${tag}: arrive() or skip() acted on an ended tutorial`);
              }
            }
          },
        ),
    },
  ];
}

function battleProps({ BATTLE_TRANSITIONS, BIG_FOUR, INTRO_SEC, TURN_SEC, afterEnemyTurn, battleView, beginBattle, clockSecond, createBattle, endBattle, setHold, skipIntro, startEnemyTurn, nextMachineState, reachableStates }) {
  return [
    {
      name: 'BATTLE_TRANSITIONS + battle.ts orchestrator obey transition edges, turn timer, holds, and battleView invariants',
      examples: [[['begin:2', 'clock', 'clock', 'clock', 'clock', 'hold:editor', 'clock', 'free:editor', 'enemy', 'after:cleared']]],
      build: () =>
        fc.property(
          fc.array(
            fc.constantFrom(
              'begin:1',
              'begin:2',
              'begin:empty',
              'skip',
              'clock',
              'hold:editor',
              'hold:laptop',
              'free:editor',
              'free:laptop',
              'enemy',
              'after:alive',
              'after:cleared',
              'after:left',
              'end:left',
              'end:respawn',
            ),
            { maxLength: 50 },
          ),
          (ops) => {
            const reached = reachableStates(BATTLE_TRANSITIONS, 'idle');
            const b = createBattle();
            const threats = [{ id: 'e1', type: 'virus', boss: false }];
            const twoThreats = [threats[0], { id: 'e2', type: 'trojan', boss: false }];
            let phase = 'idle';
            let battleNum = 0;
            let introLeft = 0;
            let secondsLeft = TURN_SEC;
            const holds = new Set();

            for (const op of ops) {
              const ev = [];
              if (op.startsWith('begin:')) {
                const list = op === 'begin:empty' ? [] : op === 'begin:2' ? twoThreats : threats;
                beginBattle(b, list, battleNum + 1, ev);
                const next = nextMachineState(BATTLE_TRANSITIONS, phase, 'BEGIN');
                if (next && list.length > 0) {
                  phase = next;
                  battleNum += 1;
                  introLeft = INTRO_SEC;
                  secondsLeft = TURN_SEC;
                  expect(ev.length === 1 && ev[0].type === 'BATTLE_STARTED' && BIG_FOUR.includes(ev[0].agent), 'beginBattle did not emit BATTLE_STARTED');
                } else {
                  expect(ev.length === 0, `beginBattle emitted events unexpectedly in ${phase}`);
                }
              } else if (op === 'skip') {
                const ok = skipIntro(b, ev);
                const next = nextMachineState(BATTLE_TRANSITIONS, phase, 'SKIP_INTRO');
                expect(ok === (next !== null), `skipIntro returned ${ok} in ${phase}`);
                if (next) {
                  phase = next;
                  introLeft = 0;
                  secondsLeft = TURN_SEC;
                  expect(ev.length === 1 && ev[0].type === 'BATTLE_TURN' && ev[0].actor === 'player' && ev[0].first === true, 'skipIntro turn event mismatch');
                }
              } else if (op === 'clock') {
                const res = clockSecond(b, ev);
                if (phase === 'intro') {
                  introLeft -= 1;
                  expect(res === null, 'intro clockSecond must not time out');
                  if (introLeft <= 0) {
                    phase = 'player';
                    introLeft = 0;
                    secondsLeft = TURN_SEC;
                    expect(ev.length === 1 && ev[0].type === 'BATTLE_TURN' && ev[0].actor === 'player' && ev[0].first === true, 'intro expiry did not start player turn');
                  }
                } else if (phase === 'player' && holds.size === 0) {
                  secondsLeft = Math.max(0, secondsLeft - 1);
                  expect(res === (secondsLeft === 0 ? 'timeout' : null), `clockSecond returned ${res} at ${secondsLeft}s`);
                } else {
                  expect(res === null && ev.length === 0, `clockSecond mutated held/non-player battle in ${phase}`);
                }
              } else if (op.startsWith('hold:') || op.startsWith('free:')) {
                const [kind, hold] = op.split(':');
                setHold(b, hold, kind === 'hold');
                if (kind === 'hold') holds.add(hold);
                else holds.delete(hold);
              } else if (op === 'enemy') {
                startEnemyTurn(b, 'action', ev);
                const next = nextMachineState(BATTLE_TRANSITIONS, phase, 'START_ENEMY');
                if (next) {
                  phase = next;
                  expect(ev.length === 1 && ev[0].type === 'BATTLE_TURN' && ev[0].actor === 'enemy', 'startEnemyTurn event mismatch');
                } else {
                  expect(ev.length === 0, `startEnemyTurn emitted in ${phase}`);
                }
              } else if (op.startsWith('after:')) {
                const mode = op.split(':')[1];
                if (phase === 'idle') {
                  afterEnemyTurn(b, threats, null, ev);
                  expect(ev.length === 0, 'afterEnemyTurn in idle must be a no-op');
                } else if (mode === 'left') {
                  afterEnemyTurn(b, threats, 'left', ev);
                  phase = 'idle';
                  introLeft = 0;
                  secondsLeft = TURN_SEC;
                  expect(ev.length === 1 && ev[0].type === 'BATTLE_ENDED' && ev[0].reason === 'left', 'afterEnemyTurn left mismatch');
                } else if (mode === 'cleared') {
                  afterEnemyTurn(b, [], null, ev);
                  phase = 'idle';
                  introLeft = 0;
                  secondsLeft = TURN_SEC;
                  expect(ev.length === 1 && ev[0].type === 'BATTLE_ENDED' && ev[0].reason === 'cleared', 'afterEnemyTurn cleared mismatch');
                } else {
                  afterEnemyTurn(b, threats, null, ev);
                  const next = nextMachineState(BATTLE_TRANSITIONS, phase, 'START_PLAYER');
                  if (next) {
                    phase = next;
                    secondsLeft = TURN_SEC;
                    expect(ev.length === 1 && ev[0].type === 'BATTLE_TURN' && ev[0].actor === 'player' && ev[0].first === false, 'afterEnemyTurn player turn mismatch');
                  } else {
                    expect(ev.length === 0, `afterEnemyTurn started player turn from ${phase}`);
                  }
                }
              } else if (op.startsWith('end:')) {
                const reason = op.split(':')[1];
                endBattle(b, reason, ev);
                const next = nextMachineState(BATTLE_TRANSITIONS, phase, 'END');
                if (next) {
                  phase = next;
                  introLeft = 0;
                  secondsLeft = TURN_SEC;
                  expect(ev.length === 1 && ev[0].type === 'BATTLE_ENDED' && ev[0].reason === reason, 'endBattle event mismatch');
                } else {
                  expect(ev.length === 0, 'endBattle in idle must emit nothing');
                }
              }

              expect(reached.has(b.phase) && b.phase === phase, `battle phase ${b.phase} != ${phase}`);
              expect(b.battle === battleNum, `battle counter ${b.battle} != ${battleNum}`);
              const view = battleView(b);
              if (phase === 'idle') expect(view === null, 'battleView must be null in idle');
              else {
                expect(view !== null && view.phase === phase && view.held === (holds.size > 0), 'battleView mismatch');
                expect(view.secondsLeft === (phase === 'player' ? secondsLeft : null), `battleView secondsLeft ${view.secondsLeft} != ${secondsLeft}`);
              }
            }
          },
        ),
    },
  ];
}

function busProps({ createAppBus, publishKernel, createPlayBus }) {
  return [
    {
      name: 'AppBus preserves FIFO ordering, caps recent() at 200, respects unsubscribe, and publishKernel forwards in order',
      examples: [[['emit:key', 'unsub:a', 'emit:page', 'kernel:2', 'kernel:0']]],
      build: () =>
        fc.property(
          fc.array(
            fc.constantFrom('emit:key', 'emit:page', 'emit:menu', 'emit:timer', 'unsub:a', 'kernel:2', 'kernel:0'),
            { minLength: 1, maxLength: 260 },
          ),
          (ops) => {
            const bus = createAppBus();
            const seenA = [];
            const seenB = [];
            const expectedLog = [];
            const expectedA = [];
            const expectedB = [];
            let aSub = true;
            const unsubA = bus.subscribe((ev) => seenA.push(ev));
            bus.subscribe((ev) => seenB.push(ev));

            const pushExpected = (ev) => {
              expectedLog.push(ev);
              if (aSub) expectedA.push(ev);
              expectedB.push(ev);
            };

            for (let i = 0; i < ops.length; i++) {
              const op = ops[i];
              if (op === 'unsub:a') {
                unsubA();
                aSub = false;
              } else if (op === 'kernel:0') {
                publishKernel(undefined, [{ type: 'FLOOR_CLEARED', floorId: i, speedrunBonus: false, commandsCount: i }]);
                publishKernel(bus, []);
              } else if (op === 'kernel:2') {
                const k1 = { type: 'FLOOR_CLEARED', floorId: i, speedrunBonus: false, commandsCount: i };
                const k2 = { type: 'PERMISSION_DENIED_RATTLE', targetId: i, command: 'rm' };
                publishKernel(bus, [k1, k2]);
                pushExpected({ kind: 'kernel', event: k1 });
                pushExpected({ kind: 'kernel', event: k2 });
              } else {
                const ev =
                  op === 'emit:key'
                    ? { kind: 'key', key: 'press' }
                    : op === 'emit:page'
                      ? { kind: 'page' }
                      : op === 'emit:menu'
                        ? { kind: 'menu', action: 'move' }
                        : { kind: 'timer', secondsLeft: i % 31 };
                bus.emit(ev);
                pushExpected(ev);
              }
            }

            const recent = bus.recent();
            expect(recent.length <= 200, `AppBus recent exceeded cap: ${recent.length}`);
            expect(JSON.stringify(recent) === JSON.stringify(expectedLog.slice(-200)), 'AppBus recent() order/cap mismatch');
            expect(JSON.stringify(seenA) === JSON.stringify(expectedA), 'AppBus listener A mismatch after unsubscribe');
            expect(JSON.stringify(seenB) === JSON.stringify(expectedB), 'AppBus listener B mismatch');
          },
        ),
    },
    {
      name: 'PlayEventBus delivers emitted PlayEvents in order and isolates unsubscribed listeners',
      examples: [[['sub:1', 'sub:2', 'emit:modal', 'unsub:1', 'emit:sync', 'emit:paint']]],
      build: () =>
        fc.property(
          fc.array(
            fc.constantFrom('sub:1', 'sub:2', 'unsub:1', 'unsub:2', 'emit:sync', 'emit:modal', 'emit:restart', 'emit:run'),
            { minLength: 1, maxLength: 30 },
          ),
          (ops) => {
            const bus = createPlayBus();
            const logs = { 1: [], 2: [] };
            const expected = { 1: [], 2: [] };
            const active = { 1: null, 2: null };
            for (let i = 0; i < ops.length; i++) {
              const [kind, arg] = ops[i].split(':');
              if (kind === 'sub') {
                if (!active[arg]) active[arg] = bus.subscribe((ev) => logs[arg].push(ev.kind));
              } else if (kind === 'unsub') {
                if (active[arg]) {
                  active[arg]();
                  active[arg] = null;
                }
              } else {
                const ev =
                  arg === 'sync'
                    ? { kind: 'sync-pause' }
                    : arg === 'modal'
                      ? { kind: 'modal', modal: 'manual', action: 'toggle' }
                      : arg === 'restart'
                        ? { kind: 'floor-restart' }
                        : { kind: 'run-start' };
                bus.emit(ev);
                if (active[1]) expected[1].push(ev.kind);
                if (active[2]) expected[2].push(ev.kind);
              }
            }
            expect(JSON.stringify(logs[1]) === JSON.stringify(expected[1]), 'PlayEventBus listener 1 log diverged');
            expect(JSON.stringify(logs[2]) === JSON.stringify(expected[2]), 'PlayEventBus listener 2 log diverged');
          },
        ),
    },
  ];
}

/** Loads the state-machine modules and builds their properties, in their original order. */
/** The hero's rare ouch comments (`src/game/ouch.ts`, spec hero-ouch-comments). Numbers are stated here, not read from the module. */
function ouchProps({ OUCH_WORDS, createOuch, rollOuch }) {
  return [
    {
      name: 'ouch comments: 20 distinct words of 1-2 words; a hit speaks at most every 4th hit, never on a lethal hit, never the same word twice in a row; a roll that always passes speaks on hits 1, 5, 9...',
      build: () => {
        expect(OUCH_WORDS.length === 20 && new Set(OUCH_WORDS).size === 20, 'the table is not 20 distinct words');
        expect(OUCH_WORDS.every((w) => w.trim().split(/\s+/).length <= 2 && /^[A-Z0-9 !'-]+$/.test(w)), 'a word is not 1-2 upper-case words');
        return fc.property(
          fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 1, maxLength: 60 }),
          fc.array(fc.double({ min: 0, max: 0.9999, noNaN: true }), { minLength: 1, maxLength: 8 }),
          (hps, rolls) => {
            let i = 0;
            const state = createOuch(() => rolls[i++ % rolls.length]);
            let sinceSpoke = 99;
            let last = null;
            for (const hp of hps) {
              const w = rollOuch(state, hp);
              if (w === undefined) { sinceSpoke += 1; continue; }
              expect(hp > 0, `spoke on a lethal hit: ${w}`);
              expect(sinceSpoke >= 4, `spoke ${sinceSpoke} hits after the last comment`);
              expect(OUCH_WORDS.includes(w) && w !== last, `bad or repeated word ${w} after ${last}`);
              sinceSpoke = 1;
              last = w;
            }
            const always = createOuch(() => 0);
            for (let n = 1; n <= 12; n++) expect((rollOuch(always, 50) !== undefined) === (n % 4 === 1), `always-pass roll: hit ${n}`);
          },
        );
      },
    },
  ];
}

export async function gameplayFsmProps(ctx) {
  const { PLAY_PHASE_TRANSITIONS, createPlayLifecycle } = await ctx.load('/src/play/lifecycle.ts');
  const { KiroCompanion } = await ctx.load('/src/game/kiro.ts');
  const { AgentDirector } = await ctx.load('/src/game/agents.ts');
  const { nextMachineState, reachableStates } = await ctx.load('/src/contracts/state-machine.ts');
  const {
    BATTLE_TRANSITIONS,
    BIG_FOUR,
    INTRO_SEC,
    TURN_SEC,
    afterEnemyTurn,
    battleView,
    beginBattle,
    clockSecond,
    createBattle,
    endBattle,
    setHold,
    skipIntro,
    startEnemyTurn,
  } = await ctx.load('/src/game/battle.ts');
  const { OUCH_WORDS, createOuch, rollOuch } = await ctx.load('/src/game/ouch.ts');
  const { createAppBus, publishKernel } = await ctx.load('/src/contracts/app-bus.ts');
  const { createPlayBus } = await ctx.load('/src/play/events.ts');
  const sm = { nextMachineState, reachableStates };
  return [
    ...lifecycleProps({ PLAY_PHASE_TRANSITIONS, createPlayLifecycle, ...sm }),
    ...companionProps({ KiroCompanion, AgentDirector }),
    ...battleProps({ BATTLE_TRANSITIONS, BIG_FOUR, INTRO_SEC, TURN_SEC, afterEnemyTurn, battleView, beginBattle, clockSecond, createBattle, endBattle, setHold, skipIntro, startEnemyTurn, ...sm }),
    ...ouchProps({ OUCH_WORDS, createOuch, rollOuch }),
    ...busProps({ createAppBus, publishKernel, createPlayBus }),
  ];
}
