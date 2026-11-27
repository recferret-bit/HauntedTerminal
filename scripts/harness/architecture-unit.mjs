#!/usr/bin/env node
// Architecture & shared core unit gate: state-machine engine, PlayLifecycle & PlayEventBus,
// KiroCompanion & AgentDirector & EscMenu state machines, pure unix-applets POSIX edge cases,
// and renderer stage-selfcheck FX coverage.
//   node scripts/harness/architecture-unit.mjs     exit 0 = all assertions pass
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { projectRoot, withProcgen } from './lib/load.mjs';
import { testRunner } from './lib/test-kit.mjs';
import { fakeDom } from './props/kit.mjs';

const { test, count } = testRunner();

await withProcgen(async (_procgen, vite) => {
  const load = (path) => vite.ssrLoadModule(path);
  const { createStateMachine, nextMachineState, reachableStates } = await load('/src/contracts/state-machine.ts');
  const {
    WORD_REVEAL_STEP_MS,
    MIN_POST_REVEAL_HOLD_MS,
    wordRevealEnds,
    planWordReveal,
    mountWordReveal,
    isReducedMotionPreferred,
  } = await load('/src/contracts/word-reveal.ts');
  const { PLAY_PHASES, PLAY_PHASE_TRANSITIONS, createPlayLifecycle } = await load('/src/play/lifecycle.ts');
  const { createPlayBus, routeModalAction } = await load('/src/play/events.ts');
  const { anyModalOpen, closeOtherModals } = await load('/src/play/state.ts');
  const {
    KIRO_CORES,
    KIRO_CRACK_TRANSITIONS,
    createKiroCrackMachine,
    KiroCompanion,
    inspectTextWithKiro,
  } = await load('/src/game/kiro.ts');
  const { TUTORIAL_TRANSITIONS, createTutorialMachine, AgentDirector } = await load('/src/game/agents.ts');
  const { ESC_MENU_TRANSITIONS, createEscMenuMachine, stripMarker } = await load('/src/ui/esc-menu.ts');
  const { CHAPTER_MAP_TRANSITIONS, createChapterMapMachine } = await load('/src/ui/chapter-map.ts');
  const { MANUAL_BOOK_TRANSITIONS, createManualBookMachine } = await load('/src/ui/manual-book.ts');
  const { NATIVE_MODAL_TRANSITIONS, createNativeModalMachine, createNativeModal } = await load('/src/ui/modal-dialog.ts');
  const { DIALOG_TRANSITIONS } = await load('/src/ui/dialog-box.ts');
  const { DIALOG_SOCKET_TRANSITIONS, createDialogSocketMachine, mountDialogOrchestrator } = await load('/src/ui/dialog-orchestrator.ts');
  const { VISUAL_LAB_TRANSITIONS, createVisualLabMachine } = await load('/src/ui/visual-lab-panel.ts');
  const { SEARCH_DRAWER_TRANSITIONS, createSearchDrawerMachine } = await load('/src/ui/manual-book-search.ts');
  const { createChapterSession } = await load('/src/chapters/chapter-session.ts');
  const { isDescendantOrSelf, makeNode, makeRoot } = await load('/src/game/tree.ts');
  const { CHAPTER_HANDLERS } = await load('/src/chapters/session-shell.ts');
  const { CHAPTER_COMMANDS } = await load('/src/chapters/session-state.ts');
  const applets = await load('/src/game/unix-applets.ts');
  const { allEvents } = await load('/src/renderer/stage-selfcheck.ts');
  const { LEVEL_TRANSITION_PHASES, LEVEL_TRANSITION_TRANSITIONS } = await load('/src/renderer/stage-level-transition.ts');
  const { fxCuesFor } = await load('/src/renderer/event-fx.ts');
  const { FX_IDS } = await load('/src/renderer/fx-player.ts');
  const { FxCatalog } = await load('/src/procgen/index.ts');
  const { BATTLE_TRANSITIONS } = await load('/src/game/battle.ts');
  const { executeRestartCommand } = await load('/src/game/commands-proc.ts');

  await test('state-machine: transitions, listeners, unsubscribe, reset, and reachableStates', () => {
    const table = {
      a: { NEXT: 'b' },
      b: { NEXT: 'c', BACK: 'a' },
      c: {},
      orphan: { NEXT: 'a' },
    };
    assert.equal(nextMachineState(table, 'a', 'NEXT'), 'b');
    assert.equal(nextMachineState(table, 'a', 'BACK'), null);
    assert.deepEqual([...reachableStates(table, 'a')].sort(), ['a', 'b', 'c']);

    const log = [];
    const fsm = createStateMachine({
      initial: 'a',
      transitions: table,
      onTransition: (to, from, ev) => log.push(`hook:${from}->${to}:${ev}`),
    });
    const unsub = fsm.subscribe((to, from, ev) => log.push(`sub:${from}->${to}:${ev}`));

    assert.equal(fsm.can('BACK'), false);
    assert.equal(fsm.send('BACK'), false);
    assert.equal(fsm.state, 'a');
    assert.equal(log.length, 0);

    assert.equal(fsm.can('NEXT'), true);
    assert.equal(fsm.send('NEXT'), true);
    assert.equal(fsm.state, 'b');
    assert.deepEqual(log, ['hook:a->b:NEXT', 'sub:a->b:NEXT']);

    unsub();
    assert.equal(fsm.send('NEXT'), true);
    assert.equal(fsm.state, 'c');
    assert.equal(log.length, 3); // hook ran, unsubscribed listener did not

    fsm.reset('a');
    assert.equal(fsm.state, 'a');
  });

  await test('PlayLifecycle: reaches every phase and derives pause/overlay gates deterministically', () => {
    const reached = reachableStates(PLAY_PHASE_TRANSITIONS, 'boot');
    for (const p of PLAY_PHASES) assert.ok(reached.has(p), `unreachable play phase: ${p}`);

    const lc = createPlayLifecycle(false);
    assert.equal(lc.phase(), 'boot');
    assert.equal(lc.hasReason('intro'), true);
    assert.equal(lc.derive({ manualOpen: false, mapOpen: false }).shellBlocked, true);
    assert.equal(lc.derive({ manualOpen: false, mapOpen: false }).hideHud, true);

    assert.equal(lc.send('ENTER_INTRO'), true);
    assert.equal(lc.send('BEGIN_PLAY'), true);
    lc.deleteReason('intro');
    assert.equal(lc.phase(), 'play');
    assert.equal(lc.canOpenManualOrMap(), true);
    assert.equal(lc.canOpenEscMenu(false), true);
    assert.equal(lc.canRestartFloor(), true);
    assert.equal(lc.derive({ manualOpen: true, mapOpen: false }).shellBlocked, true);
    assert.equal(lc.derive({ manualOpen: false, mapOpen: false }).clockPaused, false);

    lc.addReason('hidden');
    const hiddenOnly = lc.derive({ manualOpen: false, mapOpen: false });
    assert.equal(hiddenOnly.clockPaused, true);
    assert.equal(hiddenOnly.stormPaused, true);
    assert.equal(hiddenOnly.shellBlocked, false); // hidden alone never blocks terminal
    assert.equal(hiddenOnly.closeOverlays, false);
    lc.deleteReason('hidden');

    lc.addReason('transition');
    const inTransition = lc.derive({ manualOpen: false, mapOpen: false });
    assert.equal(inTransition.clockPaused, true);
    assert.equal(inTransition.stormPaused, true);
    assert.equal(inTransition.shellBlocked, true);
    assert.equal(inTransition.hideHud, false);
    assert.equal(lc.canOpenEscMenu(false), false);
    assert.equal(lc.canRestartFloor(), false);
    lc.deleteReason('transition');

    assert.equal(lc.beginEndingHold(), true);
    assert.equal(lc.beginEndingHold(), false); // idempotent
    assert.equal(lc.canOpenManualOrMap(), false);
    assert.equal(lc.send('BEGIN_ENDING'), true);
    assert.equal(lc.send('FINISH_OUTRO'), true);
    assert.equal(lc.phase(), 'stats');
    assert.equal(lc.canOpenEscMenu(true), false);

    lc.addReason('transition');
    lc.resetForPlayAgain();
    assert.equal(lc.phase(), 'intro');
    assert.equal(lc.isEndingStarted(), false);
    assert.equal(lc.hasReason('intro'), true);
    assert.equal(lc.hasReason('transition'), false);

    lc.resetForLabSwap(true);
    assert.equal(lc.phase(), 'play');
    assert.deepEqual([...lc.reasons], ['hidden']);
  });

  await test('PlayEventBus: fans out typed events and isolates unsubscribed listeners', () => {
    const bus = createPlayBus();
    const a = [];
    const b = [];
    const stopA = bus.subscribe((ev) => a.push(ev.kind));
    bus.subscribe((ev) => b.push(ev.kind));
    bus.emit({ kind: 'run-start' });
    stopA();
    bus.emit({ kind: 'floor-restart' });
    assert.deepEqual(a, ['run-start']);
    assert.deepEqual(b, ['run-start', 'floor-restart']);
  });

  await test('KiroCompanion crack FSM & AUDIT_RULES inspect heuristics', () => {
    assert.deepEqual([...reachableStates(KIRO_CRACK_TRANSITIONS, 'idle')].sort(), ['cracking', 'idle']);
    const fsm = createKiroCrackMachine();
    assert.equal(fsm.send('STEP'), false); // idle ignores STEP
    assert.equal(fsm.send('START'), true);
    assert.equal(fsm.send('ABORT'), true);
    assert.equal(fsm.state, 'idle');

    // qwen takes 2 steps; leaving sector aborts cleanly; llama takes 3 steps
    const kiro = new KiroCompanion();
    kiro.startCrack('/vault', 'cloud.gate', '/vault/cloud.gate');
    assert.equal(kiro.crackPhase, 'cracking');
    const step1 = kiro.advanceCrack('/vault');
    assert.equal(step1.completedTargetPath, null);
    const step2 = kiro.advanceCrack('/vault');
    assert.equal(step2.completedTargetPath, '/vault/cloud.gate');
    assert.equal(kiro.crackPhase, 'idle');
    assert.equal(kiro.isUnlocked('/vault/cloud.gate'), true);

    kiro.loadCore('llama');
    assert.equal(kiro.mitigateDamage(12).amount, 7);
    kiro.startCrack('/vault', 'gate2', '/vault/gate2');
    assert.equal(kiro.advanceCrack('/vault').completedTargetPath, null); // 1/3
    const aborted = kiro.advanceCrack('/somewhere_else');
    assert.equal(aborted.completedTargetPath, null);
    assert.ok(aborted.note.includes('aborted'));
    assert.equal(kiro.crackPhase, 'idle');

    // AUDIT_RULES coverage
    const leak = inspectTextWithKiro('API_KEY=sk_live_abc', '.env', KIRO_CORES.qwen);
    assert.ok(leak.includes('Leaked live secret'));
    const docker = inspectTextWithKiro('FROM node:99-vibe\nRUN ./cryptominer.sh', 'Dockerfile', KIRO_CORES.deepseek);
    assert.ok(docker.includes('node:20-alpine') && docker.includes('cryptominer.sh'));
    const clean = inspectTextWithKiro('const ok = 1;\n', 'ok.ts', KIRO_CORES.mistral);
    assert.ok(clean.includes('Clean buffer'));
    assert.equal(kiro.loadCore('mistral').ok, true);
    assert.equal(kiro.mitigateRattle(5), 2);
    assert.equal(kiro.bonusStrikeDamage(), 1);
  });

  await test('AgentDirector tutorial FSM reaches all states and locks terminal states until reset', () => {
    assert.deepEqual(
      [...reachableStates(TUTORIAL_TRANSITIONS, 'waiting')].sort(),
      ['abandoned', 'active', 'finished', 'waiting'],
    );
    const fsm = createTutorialMachine();
    assert.equal(fsm.send('START_COMPLETE'), false);
    assert.equal(fsm.send('ARRIVE'), true);
    assert.equal(fsm.send('SKIP'), true);
    assert.equal(fsm.state, 'finished');

    const dir = new AgentDirector();
    assert.equal(dir.tutorialPhase, 'waiting');
    assert.ok(dir.arrive() !== null);
    assert.equal(dir.arrive(), null); // ARRIVE invalid once active
    assert.equal(dir.tutorialPhase, 'active');

    const ch = dir.observe([['ls']], { failed: false, leftDesk: true });
    assert.equal(dir.tutorialPhase, 'finished');
    assert.ok(ch.events.some((e) => e.type === 'TUTORIAL_STEP' && e.done === true));
    assert.equal(dir.active(), false);
    assert.deepEqual(dir.skip(), { text: '', events: [] }); // finished cannot transition again

    dir.reset();
    assert.equal(dir.tutorialPhase, 'waiting');
    dir.abandon();
    assert.equal(dir.tutorialPhase, 'abandoned');
    assert.equal(dir.arrive(), null);
  });

  await test('EscMenu confirm FSM reaches all modes and stripMarker normalizes checklist prefixes', () => {
    assert.deepEqual(
      [...reachableStates(ESC_MENU_TRANSITIONS, 'closed')].sort(),
      ['closed', 'confirm_leave', 'confirm_restart', 'idle'],
    );
    const fsm = createEscMenuMachine();
    assert.equal(fsm.send('ARM_RESTART'), false);
    assert.equal(fsm.send('OPEN'), true);
    assert.equal(fsm.send('ARM_RESTART'), true);
    assert.equal(fsm.send('ARM_LEAVE'), true);
    assert.equal(fsm.send('CANCEL_LEAVE'), true);
    assert.equal(fsm.state, 'idle');
    assert.equal(fsm.send('CLOSE'), true);
    assert.equal(fsm.state, 'closed');

    assert.equal(stripMarker('[ ] Fix bug'), 'Fix bug');
    assert.equal(stripMarker('  [X] Done'), 'Done');
    assert.equal(stripMarker('[x] Checked'), 'Checked');
  });

  await test('unix-applets: chmod, wc, grep, cut, head/tail, rev UTF-8, sed, signals, pkill, and LCP completion', () => {
    assert.equal(applets.applyChmodMode(0o644, 'u+x,go-r'), 0o700);
    assert.equal(applets.applyChmodMode(0o000, '755'), 0o755);
    assert.equal(applets.applyChmodMode(0o644, 'invalid_spec'), null);

    assert.deepEqual(applets.wcStats(''), { lines: 0, words: 0, chars: 0 });
    assert.equal(applets.formatWc('a b\nc\n', '-l'), '2\n');
    assert.equal(applets.formatWc('a b\nc\n', '-wc'), '3 6\n');

    const badGrep = applets.parseGrepArgs([]);
    assert.ok('error' in badGrep);
    const rxFallback = applets.compileGrepRegex('[unclosed', true);
    assert.equal(rxFallback.test('has [UNCLOSED bracket'), true);
    const gSpec = applets.parseGrepArgs(['-in', 'fatal', 'a.log', 'b.log']);
    assert.ok(!('error' in gSpec));
    const gRes = applets.runGrepSources(
      [{ name: 'a.log', text: 'ok\nFATAL hit\n' }, { name: 'b.log', text: 'fatal two\n' }],
      gSpec,
    );
    assert.equal(gRes.hits, 2);
    assert.equal(gRes.stdout, 'a.log:2:FATAL hit\nb.log:1:fatal two\n');

    const badCut = applets.parseCutArgs(['-d:', '-fx']);
    assert.ok('error' in badCut);
    const cSpec = applets.parseCutArgs(['-d:', '-f1,3-']);
    assert.ok(!('error' in cSpec));
    assert.equal(applets.applyCutText('a:b:c:d\nplain\n', cSpec), 'a:c:d\nplain\n');
    const cField2 = applets.parseCutArgs(['-d:', '-f2']);
    assert.ok(!('error' in cField2));
    assert.equal(applets.applyCutText('a:b:c\nplain\n', cField2), 'b\nplain\n');

    assert.ok('error' in applets.parseHeadTailArgs(['-n', '-2'], 'head'));
    assert.equal(applets.sliceHeadTail('1\n2\n3\n', 'head', 0), '');
    assert.equal(applets.sliceHeadTail('1\n2\n3\n', 'tail', 2), '2\n3\n');

    // Surrogate-pair safe Unicode reversal
    assert.equal(applets.reverseLines('ab😀c\n'), 'c😀ba\n');
    assert.equal(applets.reverseLines(''), '');

    assert.equal(applets.emptySedPattern('s//x/'), true);
    assert.equal(applets.emptySedPattern('s/a/b/'), false);
    const sed = applets.compileSedScript('s/([a-z]+)=([0-9]+)/\\1:[\\2]&/g', { extended: true, supportBackrefs: true });
    assert.ok(sed !== null);
    assert.equal(sed('x=7 y=9\n'), 'x:[7]x=7 y:[9]y=9\n');

    assert.equal(applets.parseSignalToken('-9'), 'SIGKILL');
    assert.equal(applets.parseSignalToken('TERM'), 'SIGTERM');
    assert.equal(applets.parseSignalToken('STOP'), 'SIGSTOP');
    assert.equal(applets.parseSignalToken('CONT'), 'SIGCONT');
    assert.equal(applets.parseSignalToken('NOPE'), null);

    const kRun = applets.parseKillArgs(['-s', 'KILL', '404', '666'], 'usage', 2);
    assert.deepEqual(kRun, { kind: 'run', signal: 'SIGKILL', pids: [404, 666] });
    const kErr = applets.parseKillArgs(['abc'], 'usage', 2);
    assert.equal(kErr.kind, 'error');

    const pk = applets.parsePkillArgs(['-fx', '-P', '666', '--', 'zombie worker']);
    assert.equal(pk.ok, true);
    assert.equal(applets.matchesPkill({ pid: 667, ppid: 666, name: 'zombie worker', user: 'root', cpu: 0, state: 'ZOMBIE' }, pk), true);
    assert.equal(applets.matchesPkill({ pid: 668, ppid: 1, name: 'zombie worker', user: 'root', cpu: 0, state: 'ZOMBIE' }, pk), false);

    assert.equal(applets.finishTabCompletion('cd i', 'cd ', 'i', ['iron_gate/']).line, 'cd iron_gate/');
    assert.equal(applets.finishTabCompletion('cat t', 'cat ', 't', ['todo.note']).line, 'cat todo.note ');
    assert.equal(applets.finishTabCompletion('cat a', 'cat ', 'a', ['alpha.log', 'alpaca.txt']).line, 'cat alp');
  });

  await test('stage-selfcheck allEvents maps to valid FxCatalog cues including fx.fight', () => {
    const events = allEvents();
    const cues = events.flatMap(fxCuesFor);
    assert.ok(cues.some((c) => c.id === 'fx.fight'), 'missing fx.fight cue from allEvents()');
    const played = new Set(cues.map((c) => c.id));
    for (const id of played) {
      assert.ok(FX_IDS.includes(id), `unknown cue id ${id}`);
      assert.ok(FxCatalog.has(id), `missing FxCatalog entry for ${id}`);
    }
    const directStageOnly = new Set(['fx.lightning-strike', 'fx.enemy-fireball']);
    for (const id of directStageOnly) {
      assert.ok(FxCatalog.has(id), `missing FxCatalog entry for direct stage FX ${id}`);
    }
    const missingFromSelfcheck = FX_IDS.filter((id) => !directStageOnly.has(id) && !played.has(id));
    assert.deepEqual(missingFromSelfcheck, [], `FX_IDS not covered by stage-selfcheck allEvents: ${missingFromSelfcheck.join(', ')}`);
  });

  await test('BATTLE_TRANSITIONS reaches all battle phases and executeRestartCommand shares confirm state flow', () => {
    const reached = reachableStates(BATTLE_TRANSITIONS, 'idle');
    assert.deepEqual([...reached].sort(), ['enemy', 'idle', 'intro', 'player']);

    let pending = null;
    let confirmed = 0;
    const armStep = executeRestartCommand(
      pending,
      { commands: 5, ticks: 10 },
      [],
      'Sector 01',
      (next) => { pending = next; },
      () => { confirmed++; return { stdout: 'CONFIRMED', stderr: '', code: 0, events: [] }; },
    );
    assert.equal(armStep.code, 0);
    assert.ok(armStep.stdout.includes('[RESTART]'));
    assert.deepEqual(pending, { armedAtCommand: 5, armedAtTick: 10 });
    assert.equal(confirmed, 0);

    // Too late by tick window -> re-arms instead of confirming
    const expiredStep = executeRestartCommand(
      pending,
      { commands: 6, ticks: 50 },
      [],
      'Sector 01',
      (next) => { pending = next; },
      () => { confirmed++; return { stdout: 'CONFIRMED', stderr: '', code: 0, events: [] }; },
    );
    assert.ok(expiredStep.stdout.includes('[RESTART]'));
    assert.equal(confirmed, 0);

    // Next command inside window confirms
    const okStep = executeRestartCommand(
      pending,
      { commands: 7, ticks: 55 },
      [],
      'Sector 01',
      (next) => { pending = next; },
      () => { confirmed++; return { stdout: 'CONFIRMED', stderr: '', code: 0, events: [] }; },
    );
    assert.equal(okStep.stdout, 'CONFIRMED');
    assert.equal(confirmed, 1);
  });

  await test('UI state machines: chapter-map, manual-book, modal-dialog, dialog-box, and dialog-orchestrator', () => {
    assert.deepEqual([...reachableStates(CHAPTER_MAP_TRANSITIONS, 'closed')].sort(), ['browsing', 'closed', 'confirming']);
    const mapFsm = createChapterMapMachine();
    assert.equal(mapFsm.send('ARM_DEPLOY'), false);
    assert.equal(mapFsm.send('OPEN'), true);
    assert.equal(mapFsm.send('ARM_DEPLOY'), true);
    assert.equal(mapFsm.state, 'confirming');
    assert.equal(mapFsm.send('CANCEL_DEPLOY'), true);
    assert.equal(mapFsm.state, 'browsing');
    assert.equal(mapFsm.send('ARM_DEPLOY'), true);
    assert.equal(mapFsm.send('SELECT'), true);
    assert.equal(mapFsm.state, 'browsing');
    assert.equal(mapFsm.send('CLOSE'), true);
    assert.equal(mapFsm.state, 'closed');

    assert.deepEqual([...reachableStates(MANUAL_BOOK_TRANSITIONS, 'closed')].sort(), ['closed', 'open']);
    const bookModalFsm = createManualBookMachine(false);
    assert.equal(bookModalFsm.state, 'closed');
    assert.equal(bookModalFsm.send('CLOSE'), false);
    assert.equal(bookModalFsm.send('OPEN'), true);
    assert.equal(bookModalFsm.send('CLOSE'), true);
    assert.equal(createManualBookMachine(true).state, 'open');

    assert.deepEqual([...reachableStates(NATIVE_MODAL_TRANSITIONS, 'closed')].sort(), ['closed', 'open']);
    const nativeFsm = createNativeModalMachine();
    assert.equal(nativeFsm.send('OPEN'), true);
    assert.equal(nativeFsm.send('OPEN'), false);
    assert.equal(nativeFsm.send('CLOSE'), true);

    assert.deepEqual([...reachableStates(DIALOG_TRANSITIONS, 'idle')].sort(), ['entering', 'exiting', 'hold', 'idle']);
    assert.deepEqual([...reachableStates(DIALOG_SOCKET_TRANSITIONS, 'free')].sort(), ['free', 'socket_locked']);
    const sockFsm = createDialogSocketMachine();
    assert.equal(sockFsm.send('UNLOCK'), false);
    assert.equal(sockFsm.send('LOCK'), true);
    assert.equal(sockFsm.send('CLEAR'), true);
    assert.equal(sockFsm.state, 'free');

    // Exercise createNativeModal lifecycle with returnFocus restoration and single onClose callback
    const dom = fakeDom();
    dom.install();
    try {
      const trigger = dom.doc.body.appendChild(dom.make('button'));
      trigger.focus();
      const dialog = dom.make('dialog');
      const closeBtn = dom.make('button');
      const focusTarget = dom.make('button');
      let closeCount = 0;
      let returnedTo = null;
      dialog.open = false;
      dialog.showModal = () => { dialog.open = true; };
      dialog.close = () => { dialog.open = false; };
      const modal = createNativeModal(dialog, [closeBtn], (back) => {
        closeCount += 1;
        returnedTo = back;
      });
      modal.open(focusTarget);
      assert.equal(modal.isOpen(), true);
      assert.equal(dialog.classList.contains('open'), true);
      assert.equal(dom.doc.activeElement, focusTarget);
      modal.close();
      modal.close(); // idempotent
      assert.equal(modal.isOpen(), false);
      assert.equal(closeCount, 1);
      assert.equal(returnedTo, trigger);

      // Exercise mountDialogOrchestrator socket lock & unlock
      const host = dom.doc.body.appendChild(dom.make('div'));
      const orch = mountDialogOrchestrator(host, () => dom.make('canvas'));
      orch.handleEvent({
        type: 'OBSTACLE_DIALOGUE_RENDERED',
        payload: { obstacleId: 'sock', speakerName: 'Hank', portraitSprite: 'door.socket', mood: 'hinting', bubbleStyle: 'COMIX_CLASSIC', anchorInodeId: 1, pages: [{ text: 'hi', highlightedUnixTokens: [] }], ansiTerminalBanner: '' },
      });
      assert.equal(orch.stats().socketOpen, true);
      orch.handleEvent({ type: 'AGENT_TAUNT', agent: 'clod', model: 'agent.clod', mood: 'smug', text: 'CLOD: "Watch me."' });
      assert.equal(orch.stats().activeSide, null); // chatter waits while socket is locked
      assert.equal(orch.stats().pending, 1);
      orch.handleEvent({ type: 'PUZZLE_DOOR_RESOLVED', socketInodeId: 1, unlockedInodeId: 2, solvedViaInput: 'ok' });
      assert.equal(orch.stats().socketOpen, false);
      assert.equal(orch.stats().activeSide, 'right'); // chatter wakes on unlock
      orch.clear();
    } finally {
      dom.uninstall();
    }
  });

  await test('isDescendantOrSelf checks VFS ancestry accurately across self, descendants, ancestors, and siblings', () => {
    const root = makeRoot();
    const dirA = makeNode(root, 'a', 'dir', 0o755);
    const dirB = makeNode(root, 'b', 'dir', 0o755);
    const sub = makeNode(dirA, 'sub', 'dir', 0o755);
    const leaf = makeNode(sub, 'leaf.txt', 'file', 0o644);
    assert.equal(isDescendantOrSelf(dirA, dirA), true);
    assert.equal(isDescendantOrSelf(sub, dirA), true);
    assert.equal(isDescendantOrSelf(leaf, dirA), true);
    assert.equal(isDescendantOrSelf(leaf, root), true);
    assert.equal(isDescendantOrSelf(dirA, sub), false);
    assert.equal(isDescendantOrSelf(dirB, dirA), false);
    assert.equal(isDescendantOrSelf(leaf, dirB), false);
  });

  await test('CHAPTER_HANDLERS covers chapter commands and PlayEventBus routes modal open/close/toggle mutually exclusively', () => {
    for (const cmd of CHAPTER_COMMANDS) {
      assert.equal(Object.hasOwn(CHAPTER_HANDLERS, cmd), true, `CHAPTER_HANDLERS missing ${cmd}`);
    }
    for (const alias of ['.', 'logout', 'inv', 'nano', 'vim', 'code', 'dossier', 'rig', 'ach', 'trophies', 'retry', 'docker-compose']) {
      assert.equal(Object.hasOwn(CHAPTER_HANDLERS, alias), true, `CHAPTER_HANDLERS missing alias ${alias}`);
    }

    const bus = createPlayBus();
    const openState = { manual: false, map: false, hint: false, menu: false, editor: false };
    const fakePlay = {
      menu: { isOpen: () => openState.menu, close: () => { openState.menu = false; } },
      manualBook: { isOpen: () => openState.manual, close: () => { openState.manual = false; } },
      chapterMap: { isOpen: () => openState.map, close: () => { openState.map = false; } },
      hintDialog: { isOpen: () => openState.hint, close: () => { openState.hint = false; } },
      codeEditor: { isOpen: () => openState.editor },
      laptopOverlay: null,
    };
    const modalTarget = {
      openManual: () => { closeOtherModals(fakePlay, 'manual'); openState.manual = true; },
      closeManual: () => { openState.manual = false; },
      isManualOpen: () => openState.manual,
      openMap: () => { closeOtherModals(fakePlay, 'map'); openState.map = true; },
      closeMap: () => { openState.map = false; },
      isMapOpen: () => openState.map,
      openHint: () => { closeOtherModals(fakePlay, 'hint'); openState.hint = true; },
      closeHint: () => { openState.hint = false; },
      isHintOpen: () => openState.hint,
      openMenu: () => { closeOtherModals(fakePlay, 'menu'); openState.menu = true; },
      closeMenu: () => { openState.menu = false; },
      isMenuOpen: () => openState.menu,
      openLaptop: () => { closeOtherModals(fakePlay, 'laptop'); fakePlay.laptopOverlay = { state: () => 'closed', close: () => { fakePlay.laptopOverlay = null; } }; },
      closeLaptop: () => fakePlay.laptopOverlay?.close(),
      isLaptopOpen: () => Boolean(fakePlay.laptopOverlay),
    };
    bus.subscribe((ev) => {
      if (ev.kind === 'modal') routeModalAction(modalTarget, ev);
    });

    assert.equal(anyModalOpen(fakePlay), false);
    bus.emit({ kind: 'modal', modal: 'manual', action: 'toggle' });
    assert.deepEqual([openState.manual, anyModalOpen(fakePlay)], [true, true]);
    bus.emit({ kind: 'modal', modal: 'map', action: 'open', query: '2' });
    assert.deepEqual([openState.manual, openState.map], [false, true]);
    bus.emit({ kind: 'modal', modal: 'hint', action: 'toggle' });
    assert.deepEqual([openState.map, openState.hint], [false, true]);
    bus.emit({ kind: 'modal', modal: 'menu', action: 'open' });
    assert.deepEqual([openState.hint, openState.menu], [false, true]);
    bus.emit({ kind: 'modal', modal: 'menu', action: 'toggle' });
    assert.equal(anyModalOpen(fakePlay), false);
    bus.emit({ kind: 'modal', modal: 'laptop', action: 'toggle' });
    assert.deepEqual([Boolean(fakePlay.laptopOverlay), anyModalOpen(fakePlay)], [true, true]);
    bus.emit({ kind: 'modal', modal: 'map', action: 'open' });
    assert.deepEqual([fakePlay.laptopOverlay, openState.map], [null, true]);
    bus.emit({ kind: 'modal', modal: 'laptop', action: 'toggle' });
    assert.deepEqual([openState.map, Boolean(fakePlay.laptopOverlay)], [false, true]);
    bus.emit({ kind: 'modal', modal: 'laptop', action: 'toggle' });
    assert.equal(anyModalOpen(fakePlay), false);
    openState.editor = true;
    assert.equal(anyModalOpen(fakePlay), true);
    assert.equal(anyModalOpen(fakePlay, ['editor']), false);
  });

  await test('VISUAL_LAB_TRANSITIONS and SEARCH_DRAWER_TRANSITIONS enforce explicit valid states', () => {
    assert.deepEqual([...reachableStates(VISUAL_LAB_TRANSITIONS, 'closed')].sort(), ['closed', 'destroyed', 'open']);
    const lab = createVisualLabMachine();
    assert.equal(lab.state, 'closed');
    assert.equal(lab.send('CLOSE'), false);
    assert.equal(lab.send('OPEN'), true);
    assert.equal(lab.state, 'open');
    assert.equal(lab.send('CLOSE'), true);
    assert.equal(lab.state, 'closed');
    assert.equal(lab.send('DESTROY'), true);
    assert.equal(lab.state, 'destroyed');
    assert.equal(lab.send('OPEN'), false);
    assert.equal(lab.send('DESTROY'), false);

    assert.deepEqual([...reachableStates(SEARCH_DRAWER_TRANSITIONS, 'closed')].sort(), ['closed', 'open', 'suppressed']);
    const drawer = createSearchDrawerMachine();
    assert.equal(drawer.state, 'closed');
    assert.equal(drawer.send('OPEN'), true);
    assert.equal(drawer.send('SUPPRESS'), true);
    assert.equal(drawer.state, 'suppressed');
    assert.equal(drawer.send('CLOSE'), false);
    assert.equal(drawer.send('ALLOW_FOCUS'), true);
    assert.equal(drawer.state, 'closed');
    assert.equal(drawer.send('SUPPRESS'), true);
    assert.equal(drawer.send('OPEN'), true);
    assert.equal(drawer.state, 'open');
  });

  await test('ChapterSession cmdRm refuses removing root, cwd, or ancestor directories', () => {
    const ch = createChapterSession({ chapterId: 'chapter-01-kiroween', startLevel: 0 });
    ch.skipIntro();
    ch.skipTutorial();
    const startCwd = ch.snapshot().cwd;
    for (const cmd of ['rm .', 'rm -r .', 'rm ..', 'rm -r ..', 'rm -rf /']) {
      const res = ch.exec(cmd);
      assert.equal(res.code, 1, `${cmd} unexpectedly succeeded`);
      assert.match(res.output, /refusing to remove/, `${cmd} missing refusal message`);
    }
    assert.equal(ch.snapshot().cwd, startCwd);
    assert.equal(ch.exec('pwd').output.trim(), startCwd);
  });

  await test('LEVEL_TRANSITION_TRANSITIONS reaches all phases and supports skip from active states', () => {
    const reached = reachableStates(LEVEL_TRANSITION_TRANSITIONS, 'idle');
    for (const p of LEVEL_TRANSITION_PHASES) assert.ok(reached.has(p), `unreachable transition phase: ${p}`);
    const fsm = createStateMachine({ initial: 'idle', transitions: LEVEL_TRANSITION_TRANSITIONS });
    assert.equal(fsm.send('SKIP'), false);
    assert.equal(fsm.send('BEGIN'), true);
    assert.equal(fsm.state, 'exit_walk');
    assert.equal(fsm.send('ENTER_DOOR'), true);
    assert.equal(fsm.state, 'gutter_pan');
    assert.equal(fsm.send('FINISH_PAN'), true);
    assert.equal(fsm.state, 'entry_walk');
    assert.equal(fsm.send('LAND'), true);
    assert.equal(fsm.state, 'idle');
    for (const ev of ['ENTER_DOOR', 'FINISH_PAN', 'LAND']) {
      fsm.reset('idle');
      fsm.send('BEGIN');
      if (ev === 'FINISH_PAN' || ev === 'LAND') fsm.send('ENTER_DOOR');
      if (ev === 'LAND') fsm.send('FINISH_PAN');
      assert.equal(fsm.send('SKIP'), true);
      assert.equal(fsm.state, 'idle');
    }
  });

  await test('word-reveal: preserves whitespace/newlines, pre-sizes via ghost span, and plans hold/instant/battle budgets', () => {
    const sample = 'One  two\nthree!';
    assert.deepEqual(wordRevealEnds(sample), [3, 8, 15]);
    assert.deepEqual(wordRevealEnds('   '), []);

    const dom = fakeDom();
    dom.install();
    try {
      const host = dom.make('p');
      const handle = mountWordReveal(host, sample);
      assert.equal(handle.wordCount, 3);
      assert.equal(host.textContent, sample);
      const shown = host.querySelector('.word-reveal-shown');
      const ghost = host.querySelector('.word-reveal-ghost');
      assert.ok(shown && ghost);
      assert.equal(ghost.getAttribute('aria-hidden'), 'true');
      assert.equal(ghost.style.visibility, 'hidden');

      handle.showWords(1);
      assert.equal(shown.textContent, 'One');
      assert.equal(ghost.textContent, '  two\nthree!');
      assert.equal(host.textContent, sample);

      handle.atMs(120, 120);
      assert.equal(shown.textContent, 'One  two');
      assert.equal(ghost.textContent, '\nthree!');

      handle.showAll();
      assert.equal(shown.textContent, sample);
      assert.equal(ghost.textContent, '');
      assert.equal(isReducedMotionPreferred(), false);
    } finally {
      dom.uninstall();
    }

    assert.equal(WORD_REVEAL_STEP_MS, 120);
    assert.deepEqual(planWordReveal(5, 2400), { stepMs: WORD_REVEAL_STEP_MS, holdMs: 2400, revealMs: 4 * WORD_REVEAL_STEP_MS });
    assert.deepEqual(planWordReveal(40, 1800), { stepMs: WORD_REVEAL_STEP_MS, holdMs: 39 * WORD_REVEAL_STEP_MS + MIN_POST_REVEAL_HOLD_MS, revealMs: 39 * WORD_REVEAL_STEP_MS });
    const capped = planWordReveal(100, 4800, { maxHoldMs: 4800 });
    assert.ok(capped.holdMs <= 4800 && capped.revealMs <= 4800 - MIN_POST_REVEAL_HOLD_MS);
    const subSec = planWordReveal(5, 280);
    assert.equal(subSec.holdMs, 280);
    assert.ok(subSec.revealMs > 0 && subSec.revealMs < 280);
    assert.deepEqual(planWordReveal(12, 2400, { instant: true }), { stepMs: 0, holdMs: 2400, revealMs: 0 });
  });

  await test('flying bats: Bézier endpoints, easing, opposite corners, flock size and ranges', async () => {
    const bat = await load('/src/renderer/bat-path.ts');
    const bounds = { minX: -5, maxX: 5, minY: 0, maxY: 6 };
    let seed = 12345;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000);
    const sizes = new Set();
    const starts = new Set();
    for (let i = 0; i < 400; i++) {
      const flock = bat.makeFlock(rand, bounds);
      sizes.add(flock.length);
      assert.ok(flock.length >= 1 && flock.length <= 6);
      const outside = (p) => p.x < bounds.minX || p.x > bounds.maxX || p.y < bounds.minY || p.y > bounds.maxY;
      const sx = Math.sign(flock[0].p0.x - (bounds.minX + bounds.maxX) / 2);
      const sy = Math.sign(flock[0].p0.y - (bounds.minY + bounds.maxY) / 2);
      starts.add(`${sx},${sy}`);
      for (const f of flock) {
        assert.ok(outside(f.p0) && outside(f.p3));
        // Opposite corner: both axes flip between start and end.
        assert.equal(Math.sign(f.p3.x - (bounds.minX + bounds.maxX) / 2), -sx);
        assert.equal(Math.sign(f.p3.y - (bounds.minY + bounds.maxY) / 2), -sy);
        assert.deepEqual(bat.cubicBezier(f.p0, f.p1, f.p2, f.p3, 0), f.p0);
        assert.deepEqual(bat.cubicBezier(f.p0, f.p1, f.p2, f.p3, 1), f.p3);
        assert.ok(f.scale >= 0.7 && f.scale <= 1.3);
        assert.ok(f.durationSec >= 2 / 1.25 - 1e-9 && f.durationSec <= 3.5 / 0.75 + 1e-9);
      }
      const scales = new Set(flock.map((f) => f.scale));
      assert.equal(scales.size, flock.length, 'each bat differs in size');
    }
    assert.deepEqual([...sizes].sort(), [1, 2, 3, 4, 5, 6], 'every group size 1..6 occurs');
    assert.equal(starts.size, 4, 'all four start corners occur');
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const e = bat.easeInOutSine(i / 100);
      assert.ok(e >= prev);
      prev = e;
    }
    assert.equal(bat.easeInOutSine(0), 0);
    assert.equal(bat.easeInOutSine(1), 1);

    const scoped = bat.makeFlock(() => 0.5, bounds, [2, 3]);
    assert.ok(scoped.length >= 2 && scoped.length <= 3, `custom countRange [2,3] gave ${scoped.length}`);
  });

  await test('SceneTransform helpers, compensateInkOutlines & zero hardcoded chapter data in engine layouts/sfx', async () => {
    const rv = await load('/src/contracts/room-view.ts');
    const procgen = await load('/src/procgen/index.ts');
    assert.deepEqual(rv.normalizeScale(undefined), [1, 1, 1]);
    assert.deepEqual(rv.normalizeScale(1.5), [1.5, 1.5, 1.5]);
    assert.deepEqual(rv.normalizeScale([2, 0.5, 3]), [2, 0.5, 3]);
    assert.deepEqual(rv.normalizeScale(NaN), [1, 1, 1]);
    assert.deepEqual(rv.normalizeRotationDeg(undefined), [0, 0, 0]);
    assert.deepEqual(rv.normalizeRotationDeg(90), [0, 0, 90]);
    assert.deepEqual(rv.normalizeRotationDeg([10, -20, 45]), [10, -20, 45]);
    const [rx, ry, rz] = rv.normalizeRotationRad([180, 90, -90]);
    assert.ok(Math.abs(rx - Math.PI) < 1e-6 && Math.abs(ry - Math.PI / 2) < 1e-6 && Math.abs(rz + Math.PI / 2) < 1e-6);
    assert.ok(rv.zOrderToZOffset(-2) > 0 && rv.zOrderToZOffset(2) < 0 && rv.zOrderToZOffset(0) === 0);
    assert.equal(rv.zOrderToRenderOrder(2.5), 25);

    const built = procgen.buildModel(procgen.ModelCatalog.build('pickup.ram'));
    const shells = [];
    built.group.traverse((o) => {
      if (o.userData?.outline && o.geometry?.userData?.inkBase) shells.push(o);
    });
    assert.ok(shells.length > 0, 'pickup.ram must carry ink shells with geometry.userData.inkBase');
    const shell = shells[0];
    const { basePos, baseWeight } = shell.geometry.userData.inkBase;
    const pos = shell.geometry.getAttribute('position');
    built.group.scale.set(2, 0.5, 4);
    procgen.compensateInkOutlines(built.group);
    const key1 = shell.userData.inkCompKey;
    const targetWeight = typeof shell.userData.targetInkWeight === 'number' ? shell.userData.targetInkWeight : baseWeight;
    const ws = new THREE.Vector3();
    shell.parent.getWorldScale(ws);
    const wDx = (pos.getX(0) - basePos[0]) * ws.x;
    const wDy = (pos.getY(0) - basePos[1]) * ws.y;
    const wDz = (pos.getZ(0) - basePos[2]) * ws.z;
    const worldThick = Math.hypot(wDx, wDy, wDz);
    assert.ok(Math.abs(worldThick - targetWeight) < 1e-4, `world outline thickness=${worldThick}, expected ${targetWeight}`);
    const snapX = pos.getX(0);
    procgen.compensateInkOutlines(built.group);
    assert.equal(shell.userData.inkCompKey, key1);
    assert.equal(pos.getX(0), snapX, 'compensateInkOutlines is idempotent across repeated calls');
    built.group.scale.set(0, 1, 1);
    procgen.compensateInkOutlines(built.group);
    assert.ok(Array.from(pos.array).every(Number.isFinite), 'near-zero scale never yields NaN/Infinity');

    const viewLayoutsSrc = readFileSync(resolve(projectRoot, 'src/game/view-layouts.ts'), 'utf8');
    const sfxDoorsSrc = readFileSync(resolve(projectRoot, 'src/audio/sfx-doors.ts'), 'utf8');
    for (const chapterToken of ['wires_and_chips', 'gpu_alley', 'ui_dashboard', 'logic_cell', 'docker_forge', 'compose_furnace', 'clod_overlord_core', 'clod_kernel_core', 'vram_crate']) {
      assert.equal(viewLayoutsSrc.includes(chapterToken), false, `view-layouts.ts still hardcodes ${chapterToken}`);
      assert.equal(sfxDoorsSrc.includes(chapterToken), false, `sfx-doors.ts still hardcodes ${chapterToken}`);
    }
  });

  await test('hero turn, door tuck, emote, flyTo & 3D comix tracks preserve anisotropic scaleVec, 3D baseRot & ink width', async () => {
    const cast = await load('/src/renderer/stage-cast.ts');
    const turn = await load('/src/renderer/stage-hero-turn.ts');
    const tracks = await load('/src/cinematic/tracks.ts');
    const actor = cast.buildStageActor({
      key: 'entity',
      id: 'hero-xform',
      model: 'prop.fan',
      kind: 'prop',
      x: 2.0,
      hidden: false,
      scale: [1.8, 0.7, 1.3],
      rotation: [12, -20, 30],
      zOrder: 1.5,
    }, 1);
    const sx0 = actor.scaleVec[0];
    const sy0 = actor.scaleVec[1];
    const sz0 = actor.scaleVec[2];
    const [rx0, ry0, rz0] = actor.baseRot;
    assert.ok(Math.abs(sx0 - 1.8) < 1e-6 && Math.abs(sy0 - 0.7) < 1e-6 && Math.abs(sz0 - 1.3) < 1e-6);

    turn.poseHeroWalk(actor, -1, 0.5);
    assert.ok(Math.abs(actor.body.rotation.y - (ry0 + turn.HERO_TURN_YAW)) < 1e-5, 'poseHeroWalk offsets relative to baseRot[1]');
    turn.applyDoorTuck(actor, 1);
    assert.ok(Math.abs(actor.body.scale.x - sx0 * 0.82) < 1e-5 && Math.abs(actor.body.scale.y - sy0 * 0.82) < 1e-5 && Math.abs(actor.body.scale.z - sz0 * 0.82) < 1e-5, 'applyDoorTuck scales all three axes from scaleVec');
    turn.resetHeroPose(actor);
    assert.ok(Math.abs(actor.body.rotation.x - rx0) < 1e-6 && Math.abs(actor.body.rotation.y - ry0) < 1e-6 && Math.abs(actor.body.rotation.z - rz0) < 1e-6, 'resetHeroPose restores 3D baseRot');
    assert.ok(Math.abs(actor.body.scale.x - sx0) < 1e-6 && Math.abs(actor.body.scale.y - sy0) < 1e-6 && Math.abs(actor.body.scale.z - sz0) < 1e-6, 'resetHeroPose restores anisotropic scaleVec');
    cast.disposeStageActor(actor);

    // 3D Comix tracks: squash_land + scalar scaleTo on anisotropic baseScaleVec preserve ratios & rotTo.
    const { listComixPacks } = await load('/src/cinematic/catalog.ts');
    const { compileTimeline } = await load('/src/cinematic/timeline.ts');
    const procgen = await load('/src/procgen/index.ts');
    const builtProp = {
      model: procgen.buildModel(procgen.ModelCatalog.build('prop.coffee_mug')),
      animator: { update() {}, seek() {}, setState() {}, setLook() {}, dispose() {} },
    };
    const propGroup = builtProp.model.group;
    const basePack = structuredClone(listComixPacks()[0]);
    const page0 = basePack.pages[0];
    page0.tracks = [
      {
        kind: 'actor_motion',
        actor: 'aniso-mug',
        from: String(page0.from),
        until: String(page0.from + 2),
        span: [String(page0.from), String(page0.from + 1)],
        fromPos: { x: 1, y: 1, z: 0.4 },
        toPos: { x: 2, y: 1, z: 0.4 },
        scaleTo: 1.6,
        rotTo: [10, 20, 30],
        deform: 'squash_land',
      },
    ];
    const timeline = compileTimeline(basePack);
    const fakeWorld = {
      pack: basePack,
      timeline,
      page: { panelSize: () => ({ w: 800, h: 600 }) },
      stage: { shot: { x: 0, y: 0, w: 4, h: 3 }, shake: 0, flash: 0, setPixelSize() {}, compensateInk() {} },
      room: builtProp,
      audio: null,
      sound: null,
      actors: new Map(),
      props: new Map([[
        'aniso-mug',
        {
          spec: { id: 'aniso-mug', model: 'prop.coffee_mug', at: { x: 1, y: 1, z: 0.4 } },
          actor: builtProp,
          index: 0,
          basePos: new THREE.Vector3(1, 1, 0.4),
          baseScaleVec: [0.8, 1.6, 0.8],
          baseRot: [0, 0, 0],
          baseZOrder: 0,
          baseVisible: true,
        },
      ]]),
      fixtures: new Map(),
      partBases: [],
      zoneBases: new Map(),
      current: page0.panels[0].id,
      prev: 0,
      kept: new Set(),
      ambientLoopsStarted: false,
    };
    tracks.poseComix(fakeWorld, page0.from + 0.5);
    assert.ok(Math.abs(propGroup.scale.y / propGroup.scale.x - 2) < 1e-4, 'scalar scaleTo preserves anisotropic y/x ratio');
    tracks.poseComix(fakeWorld, page0.from + 1.02);
    assert.ok(Math.abs(propGroup.scale.z - 1.6) < 1e-4, 'squash_land honors scaleTo z-scale ratio');
    assert.ok(Math.abs(propGroup.rotation.x - (10 * Math.PI) / 180) < 1e-4 && Math.abs(propGroup.rotation.y - (20 * Math.PI) / 180) < 1e-4, 'squash_land restores full 3D rotTo');
    procgen.disposeModel(builtProp.model);
  });

  await test('portRole, laidTransistor direct overrides, FX_CUE, and non-kiro spawn/despawn/fx script steps', async () => {
    const viewMod = await load('/src/game/view.ts');
    const cast = await load('/src/renderer/stage-cast.ts');
    const eventFx = await load('/src/renderer/event-fx.ts');
    const eventCast = await load('/src/renderer/stage-event-cast.ts');
    const fxMod = await load('/src/renderer/fx-player.ts');
    const { createChapterSession } = await load('/src/chapters/chapter-session.ts');
    const cat = await load('/src/chapters/generated/catalog-data.ts');

    const room = viewMod.buildRoom({
      floor: 1,
      cwd: '/srv/test',
      lantern: false,
      dark: false,
      entryDoor: true,
      held: null,
      hp: 100,
      maxHp: 100,
      xray: false,
      flood: 0,
      things: [
        { name: 'vault', type: 'dir', open: true },
        { name: 'gate', type: 'dir', open: true },
        { name: 'note.txt', type: 'file', open: true },
      ],
      entities: [],
      exits: { gate: true },
      ghost: false,
      mimic: false,
      gateOpen: true,
      plankBridged: true,
      gargoyle: 'gone',
      zombies: 0,
      bossDead: false,
      bossFrozen: false,
      phase1: false,
      portal: false,
      powerOn: false,
      valveOpen: false,
      hostiles: 0,
    });
    assert.equal(room.actors.find((a) => a.id === 'door:entry')?.portRole, 'entry');
    assert.equal(room.actors.find((a) => a.id === 'door:gate')?.portRole, 'exit');
    assert.equal(room.actors.find((a) => a.id === 'door:vault')?.portRole, 'sub');
    assert.equal(room.actors.find((a) => a.id === 'file:note.txt')?.portRole, undefined);

    const defTrans = cast.buildStageActor({
      key: 'entity',
      id: 'pickup:trans-default',
      model: 'item.tube_transistor',
      kind: 'pickup',
      x: 0.2,
      hidden: false,
    }, 1);
    assert.deepEqual(defTrans.baseScale, [1, 1, 1]);
    assert.deepEqual(defTrans.scaleVec, [1.45, 1.45, 1.45]);
    assert.ok(Math.abs(defTrans.baseRot[2] - Math.PI / 2) < 1e-6);
    assert.ok(defTrans.body.position.y > 0);
    cast.disposeStageActor(defTrans);

    const customTrans = cast.buildStageActor({
      key: 'entity',
      id: 'pickup:trans-upright',
      model: 'item.tube_transistor',
      kind: 'pickup',
      x: 0.2,
      hidden: false,
      scale: 2,
      rotation: 0,
    }, 1);
    assert.deepEqual(customTrans.baseScale, [1, 1, 1]);
    assert.deepEqual(customTrans.scaleVec, [2, 2, 2]);
    assert.ok(Math.abs(customTrans.baseRot[2]) < 1e-6);
    assert.equal(customTrans.body.position.x, 0);
    assert.equal(customTrans.body.position.y, 0);
    cast.disposeStageActor(customTrans);

    assert.deepEqual(eventFx.fxCuesFor({ type: 'FX_CUE', preset: 'fx.sigkill' }), []);
    const fxLayer = new THREE.Group();
    const fxPlayer = new fxMod.FxPlayer({ layer: fxLayer, shake() {}, flash() {} });
    const fakeStage = {
      fxPlayer,
      panelLeft: 2.2,
      panelRight: -2.2,
      feetY: -0.9,
      viewTop: 2.1,
      hero: () => null,
      room: { sockets: {} },
      actors: new Map(),
    };
    assert.equal(eventCast.handleCastEvent(fakeStage, { type: 'FX_CUE', preset: 'fx.sigkill', x: 2.0, y: 1.1, text: 'ZAP' }, null, []), true);
    assert.ok(fxPlayer.played.has('fx.sigkill'));
    assert.equal(eventCast.handleCastEvent(fakeStage, { type: 'FX_CUE', preset: 'fx.fight' }, null, []), true);
    assert.ok(fxPlayer.played.has('fx.fight'));
    assert.equal(eventCast.handleCastEvent(fakeStage, { type: 'FX_CUE', preset: 'fx.does_not_exist' }, null, []), true);
    fxPlayer.clear();

    const baseManifest = cat.GENERATED_MANIFESTS[0];
    const spawnPack = {
      manifest: {
        ...baseManifest,
        id: 'script-spawn-fx-unit',
        levels: [{ index: 1, id: 's1', title: 'S1', cwd: '/lvl', roomKind: 'desk', floorTheme: 1, mechanic: 'terminal', mechanicLabel: 'T', difficulty: 1, teaches: [], enemies: [] }],
      },
      levels: [{
        id: 's1', index: 1, title: 'S1', cwd: '/lvl', roomKind: 'desk', floorTheme: 1, mechanic: 'terminal', summary: 'spawn/despawn/fx',
        files: [{ path: '/lvl/exit_gate', kind: 'dir', mode: 0o755 }],
        enemies: [],
        pickups: [],
        patches: [],
        winRules: [{ kind: 'dir_accessible', path: '/lvl/exit_gate', description: 'open' }],
        exitDir: '/lvl/exit_gate',
        solutionCommands: ['cd exit_gate'],
        script: {
          arrival: [
            { kind: 'spawn', entityId: 'ghost_orb', model: 'prop.fan', x: 2.1, y: 0.4, zOrder: 1, scale: 1.5, rotation: 25, label: 'ORB' },
            { kind: 'fx', preset: 'fx.gate-open', x: 2.1, y: 0.9, text: 'POP!' },
          ],
          triggers: [
            { when: { kind: 'ran_command', name: 'ls' }, steps: [{ kind: 'despawn', entityId: 'ghost_orb' }] },
          ],
        },
      }],
      dialogs: { levels: {} },
    };
    const sess = createChapterSession({ chapterId: 'script-spawn-fx-unit', pack: spawnPack, preview: true, startLevelId: 's1' });
    sess.skipIntro();
    const arrivalEvs = sess.arriveLevel().events;
    assert.ok(arrivalEvs.some((e) => e.type === 'FX_CUE' && e.preset === 'fx.gate-open' && e.x === 2.1 && e.y === 0.9 && e.text === 'POP!'));
    const orbActor = sess.snapshot().room.actors.find((a) => a.id === 'ghost_orb');
    assert.ok(orbActor && orbActor.model === 'prop.fan' && orbActor.x === 2.1 && orbActor.y === 0.4 && orbActor.zOrder === 1 && orbActor.scale === 1.5 && orbActor.rotation === 25 && orbActor.label === 'ORB');
    sess.exec('ls');
    assert.equal(sess.snapshot().room.actors.some((a) => a.id === 'ghost_orb'), false);
  });

  console.log(`\narchitecture-unit OK (${count()} tests)`);
}, '/src/game/session.ts');
