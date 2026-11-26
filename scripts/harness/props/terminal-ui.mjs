// Terminal UI properties: the Esc menu, the sound and skin prefs, the UI state machines (transition tables and each module's
// own factory) and the dialog orchestrator. Helper module of terminal.mjs, which splices these into its list in place.
// Spec: .kiro/specs/property-based-tests/.
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { expect, fakeDom } from './kit.mjs';

export const MENU_ACTIONS = fc.oneof(
  fc.constantFrom('open', 'close', 'typeOutside', 'escapeOutside', 'tab', 'shiftTab', 'mute', 'restartStart', 'restartNo', 'restartYes', 'leaveStart', 'leaveNo', 'leaveYes', 'focusTerm', 'update', 'fullscreen', 'skin'),
  fc.integer({ min: 0, max: 100 }),
);

const menuSnap = (n) => ({
  muted: n % 2 === 0, volume: (n % 21) / 20, enemiesLeft: 1, enemiesTotal: 2,
  room: { path: `/lab${n}`, title: `Room ${n}` },
  level: { title: `Level ${n}`, objective: `Do ${n}`, checklist: [{ description: `[ ] rule ${n}`, done: n % 3 === 0 }, { description: `[x] other ${n}`, done: true }], bugsLeft: n % 4, bugsTotal: 4 },
});

/** One generated session of menu actions on a fake page with a "terminal" textarea; throws on the first broken invariant. */
function playMenu(actions, { mountEscMenu, LEAVE_CONFIRM_TEXT, onRestart }) {
  const dom = fakeDom();
  dom.install();
  try {
    const host = dom.doc.body.appendChild(dom.make('div'));
    const term = dom.doc.body.appendChild(dom.make('textarea'));
    const typed = [];
    term.addEventListener('keydown', (e) => typed.push(e.key));
    term.focus();
    const calls = { mute: 0, restart: 0, leave: 0, volume: [], fullscreen: 0 };
    let fullOn = false;
    let skinOn = 'iterm2';
    const menu = mountEscMenu(host, {
      onSkin: (id) => { calls.skin = (calls.skin ?? 0) + 1; skinOn = id; },
      currentSkin: () => skinOn,
      onFullscreen: () => { calls.fullscreen += 1; fullOn = !fullOn; },
      isFullscreen: () => fullOn,
      onMute: () => { calls.mute += 1; },
      onVolume: (v) => { calls.volume.push(v); },
      onRestartLevel: () => { calls.restart += 1; onRestart?.(); },
      onLeave: () => { calls.leave += 1; },
    });
    const card = dom.find('esc-menu-card');
    const inCard = (n) => { for (let x = n; x; x = x.parentNode) if (x === card) return true; return false; };
    const m = { open: false, restart: false, leave: false, typed: 0, mute: 0, restartCalls: 0, leaveCalls: 0, back: null };
    const closed = (why) => {
      m.open = m.restart = m.leave = false;
      dom.flush();
      expect(dom.doc.activeElement === m.back, `${why}: focus did not return to the terminal`);
    };
    const click = (id) => dom.find(id).click();
    for (const a of actions) {
      if (a === 'open') {
        if (!m.open) { m.back = dom.doc.activeElement; card.scrollTop = 40; }
        menu.open(menuSnap(3));
        m.open = true;
        expect(card.scrollTop === 0, 'open did not reset the card scroll to the top');
        const rows = dom.find('esc-level-checklist').children.map((c) => c.textContent);
        expect(rows.length === 2 && rows.every((t) => !/\[[ xX]\]/.test(t) && !/^\s/.test(t)), `a checklist row keeps its own marker: ${JSON.stringify(rows)}`);
        expect(inCard(dom.doc.activeElement), 'open: focus is not in the menu');
      } else if (a === 'close') {
        menu.close();
        if (m.open) closed('close');
      } else if (a === 'typeOutside') {
        const e = dom.fire(term, { type: 'keydown', key: 'a' });
        if (m.open) expect(e.defaultPrevented && typed.length === m.typed, 'a key reached the terminal while the menu was open');
        else m.typed += 1;
      } else if (a === 'escapeOutside') {
        dom.fire(term, { type: 'keydown', key: 'Escape' });
        m.typed += 1;
        expect(menu.isOpen() === m.open, 'the menu closed itself on Escape (play owns Esc)');
      } else if (a === 'tab' || a === 'shiftTab') {
        if (!m.open) continue;
        const before = dom.doc.activeElement;
        const e = dom.fire(before, { type: 'keydown', key: 'Tab', shiftKey: a === 'shiftTab' });
        expect(e.defaultPrevented && inCard(dom.doc.activeElement) && dom.doc.activeElement !== before, 'Tab did not move focus inside the menu');
      } else if (a === 'mute') {
        if (m.open) { click('esc-mute'); m.mute += 1; }
      } else if (a === 'fullscreen') {
        if (m.open) {
          click('esc-fullscreen');
          m.fullscreen = (m.fullscreen ?? 0) + 1;
          menu.update(menuSnap(3));
          const b = dom.find('esc-fullscreen');
          expect(b.getAttribute('aria-pressed') === String(fullOn) && b.textContent.includes(fullOn ? 'on' : 'off'), 'the Fullscreen toggle does not show the state');
        }
      } else if (a === 'skin') {
        if (m.open) {
          const picker = dom.find('esc-skin');
          const next = skinOn === 'putty' ? 'vt100' : 'putty';
          picker.value = next;
          dom.fire(picker, { type: 'change' });
          m.skin = (m.skin ?? 0) + 1;
          expect(skinOn === next, `the skin picker did not hand ${next} to onSkin`);
          skinOn = 'gnome-terminal';
          menu.update(menuSnap(3));
          expect(picker.value === 'gnome-terminal', 'the picker does not follow currentSkin() on update (a `skin <id>` command)');
        }
      } else if (a === 'restartStart') {
        if (m.open && !m.restart) { click('esc-restart'); m.restart = true; m.leave = false; expect(dom.doc.activeElement === dom.find('esc-restart-no'), 'restart step 2 did not focus Cancel'); }
      } else if (a === 'restartNo') {
        if (m.open && m.restart) { click('esc-restart-no'); m.restart = false; }
      } else if (a === 'restartYes') {
        if (m.open && m.restart) { click('esc-restart-yes'); m.restartCalls += 1; closed('restart'); }
      } else if (a === 'leaveStart') {
        if (m.open && !m.leave) {
          click('esc-leave');
          m.leave = true; m.restart = false;
          expect(dom.find('esc-leave-confirm').textContent.includes(LEAVE_CONFIRM_TEXT), 'leave confirm line missing');
        }
      } else if (a === 'leaveNo') {
        if (m.open && m.leave) { click('esc-leave-no'); m.leave = false; }
      } else if (a === 'leaveYes') {
        if (m.open && m.leave) { click('esc-leave-yes'); m.leaveCalls += 1; closed('leave'); }
      } else if (a === 'focusTerm') {
        term.focus();
        expect(m.open ? inCard(dom.doc.activeElement) : dom.doc.activeElement === term, 'focus escaped the open menu, or a closed menu kept it');
      } else if (a === 'update') {
        const n = 7 + calls.volume.length;
        menu.update(menuSnap(n));
        if (m.open) expect(dom.find('esc-level-name').textContent === `Level ${n}`, 'update did not show the level name');
      } else if (m.open) {
        const slider = dom.find('esc-volume');
        slider.value = String(a);
        dom.fire(slider, { type: 'input' });
        const v = calls.volume.at(-1);
        expect(v >= 0 && v <= 1 && Math.abs(v * 20 - Math.round(v * 20)) < 1e-9, `volume ${v} is not a 0.05 step in [0,1]`);
      }
      expect(menu.isOpen() === m.open && dom.find('esc-menu').hidden === !m.open, 'open state and backdrop disagree');
      if (m.open) {
        expect(dom.find('esc-restart-confirm').hidden === !m.restart && dom.find('esc-leave-confirm').hidden === !m.leave, 'a confirm step is out of sync');
        expect(inCard(dom.doc.activeElement), 'focus is outside the open menu');
      }
    }
    expect(typed.length === m.typed, `terminal got ${typed.length} keys, want ${m.typed}`);
    expect(calls.fullscreen === (m.fullscreen ?? 0), 'Fullscreen toggle clicks and handler calls differ');
    expect((calls.skin ?? 0) === (m.skin ?? 0), 'skin picker changes and onSkin calls differ');
    expect(calls.mute === m.mute && calls.restart === m.restartCalls && calls.leave === m.leaveCalls, 'handler call counts differ from the confirmed actions');
    return calls.restart;
  } finally {
    dom.uninstall();
  }
}

function menuPrefProps({ mountEscMenu, LEAVE_CONFIRM_TEXT, readSoundPref, writeSoundPref, readSkinPref, writeSkinPref, defaultSkinFor, initialSkin, SKIN_IDS, brand, renamedKey, room, shellKind }) {
  return [
    {
      name: 'Esc menu: any sequence of actions keeps keys out of the terminal, focus inside, steps in sync and focus returned on close',
      // The menu never stops the game: no pause reason, no turn-timer hold (see the source check below). Esc itself is play's.
      examples: [[['open', 'typeOutside', 'close', 'typeOutside']], [['open', 'restartStart', 'close', 'open', 'restartYes']], [['open', 'leaveStart', 'restartStart', 'tab', 'shiftTab', 'focusTerm', 'leaveYes']], [['open', 55, 'mute', 'escapeOutside', 'update']]],
      build: () => fc.property(fc.array(MENU_ACTIONS, { maxLength: 40 }), (actions) => void playMenu(actions, { mountEscMenu, LEAVE_CONFIRM_TEXT })),
    },
    {
      name: 'Esc menu source touches no pause reason, turn-timer hold, shell block or session (it cannot stop the clock)',
      check: () => {
        const src = readFileSync(new URL('../../../src/ui/esc-menu.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        for (const word of ['reasons', 'holdTurnTimer', 'setBlocked', 'setPaused', 'session']) expect(!src.includes(word), `esc-menu.ts mentions ${word}`);
        expect(!/\bplay\./.test(src), 'esc-menu.ts mentions play.');
      },
    },
    {
      name: 'sound pref: write then read gives the same choice; junk, blocked or full storage never throws',
      examples: [[true, 0], [false, 1]],
      build: () =>
        fc.property(fc.boolean(), fc.double({ min: 0, max: 1, noNaN: true }), (muted, volume) => {
          const kept = new Map();
          const store = { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => void kept.set(k, v) };
          expect(writeSoundPref({ muted, volume }, store) && kept.size === 1 && kept.has(brand.SOUND_PREF_KEY), 'write did not store one entry under SOUND_PREF_KEY');
          const back = readSoundPref(store);
          expect(back !== null && back.muted === muted && back.volume === volume, `read ${JSON.stringify(back)}, wrote ${muted} ${volume}`);
        }),
    },
    {
      name: 'sound pref: stored junk reads as absent or a valid choice, a throwing store reads null and writes false',
      examples: [['{"muted":1,"volume":"x"}'], ['null'], ['[]'], ['{"muted":true}'], ['not json']],
      build: () =>
        fc.property(fc.oneof(fc.string(), fc.json()), (raw) => {
          const r = readSoundPref({ getItem: () => raw, setItem: () => {} });
          expect(r === null || (typeof r.muted === 'boolean' && r.volume >= 0 && r.volume <= 1), `junk ${JSON.stringify(raw)} read as ${JSON.stringify(r)}`);
          const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
          expect(readSoundPref(bad) === null && writeSoundPref({ muted: false, volume: 1 }, bad) === false, 'a throwing store did not degrade quietly');
          expect(readSoundPref(null) === null && writeSoundPref({ muted: false, volume: 1 }, null) === false, 'no store did not degrade quietly');
        }),
    },
    {
      name: 'sound pref key is `<slug>:sound:v1` and the old-slug key migrates to it',
      check: () => {
        expect(brand.SOUND_PREF_KEY === `${brand.PROJECT_SLUG}:sound:v1`, `key is ${brand.SOUND_PREF_KEY}`);
        const old = `${brand.LEGACY_SLUG}:sound:v1`;
        expect(renamedKey(old) === brand.SOUND_PREF_KEY, `${old} migrates to ${renamedKey(old)}`);
      },
    },
    {
      name: '`skin <id>` switches for every skin id and hands the id to the page once; anything else exits 1 and asks for nothing (both shells)',
      examples: [['chapter', 'putty'], ['classic', 'vt100'], ['chapter', 'nope'], ['classic', 'iterm2 extra'], ['chapter', '']],
      build: () =>
        fc.property(shellKind, fc.oneof(fc.constantFrom(...SKIN_IDS), fc.stringMatching(/^[a-z0-9-]{0,12}( [a-z]{1,4})?$/)), (kind, word) => {
          const session = room(kind);
          const r = session.exec(word ? `skin ${word}` : 'skin');
          const ok = SKIN_IDS.includes(word);
          if (ok) {
            expect(r.code === 0 && /Terminal skin: /.test(r.output), `${kind}: skin ${word} gave ${JSON.stringify(r.output)} code ${r.code}`);
            expect(session.consumeSkinRequest() === word && session.consumeSkinRequest() === null, `${kind}: skin ${word} did not hand the id over exactly once`);
          } else if (!word) {
            expect(r.code === 0 && SKIN_IDS.every((id) => r.output.includes(id)), `${kind}: bare skin did not list every id`);
            expect(session.consumeSkinRequest() === null, `${kind}: bare skin asked the page to switch`);
          } else {
            expect(r.code === 1 && /unknown skin/.test(r.output) && SKIN_IDS.every((id) => r.output.includes(id)), `${kind}: skin ${word} gave ${JSON.stringify(r.output)} code ${r.code}`);
            expect(session.consumeSkinRequest() === null, `${kind}: a refused skin asked the page to switch`);
          }
        }),
    },
    {
      name: 'skin pref: every id round-trips under `<slug>:terminal-skin:v1`; junk or a throwing store reads null; the default follows the OS',
      examples: [['putty', '{"x":1}'], ['vt100', '"putty2"'], ['iterm2', 'not json']],
      build: () =>
        fc.property(fc.constantFrom(...SKIN_IDS), fc.oneof(fc.string(), fc.json()), (id, junk) => {
          const kept = new Map();
          const store = { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => void kept.set(k, v) };
          expect(writeSkinPref(id, store) && kept.size === 1 && kept.has(brand.TERMINAL_SKIN_KEY), 'write did not store one entry under TERMINAL_SKIN_KEY');
          expect(readSkinPref(store) === id && initialSkin(store, 'Windows') === id, 'a saved skin did not win over the OS default');
          const r = readSkinPref({ getItem: () => junk, setItem: () => {} });
          expect(r === null || SKIN_IDS.includes(r), `junk ${JSON.stringify(junk)} read as ${JSON.stringify(r)}`);
          const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
          expect(readSkinPref(bad) === null && writeSkinPref(id, bad) === false && readSkinPref(null) === null, 'a broken store did not degrade quietly');
          expect(brand.TERMINAL_SKIN_KEY === `${brand.PROJECT_SLUG}:terminal-skin:v1`, `key is ${brand.TERMINAL_SKIN_KEY}`);
          const empty = { getItem: () => null, setItem: () => {} };
          expect(initialSkin(empty, 'MacIntel') === 'iterm2' && initialSkin(empty, 'Win32') === 'windows-terminal'
            && initialSkin(empty, 'Linux x86_64') === 'gnome-terminal' && defaultSkinFor('') === 'iterm2', 'the OS default is wrong');
        }),
    },
  ];
}

function uiTableProps({ UI_FSM_SPECS, uiFsmExample, createStateMachine, nextMachineState, reachableStates }) {
  return [
    {
      // An op is an event index into the table's event list (mod its length) or 'reset'. The table is the oracle, so this
      // cannot catch a wrong edge in a table; it catches the engine or a module's factory disagreeing with its table. The
      // mounted UI modules are driven elsewhere (the Esc menu above, the dialog orchestrator below).
      name: 'UI transition tables (DIALOG, CHAPTER_MAP, ESC_MENU, NATIVE_MODAL, MANUAL_BOOK, DIALOG_SOCKET, VISUAL_LAB, SEARCH_DRAWER): every state reachable; createStateMachine and each module\'s own create*Machine() follow the table (can, send, reset, callbacks only on valid edges)',
      // The chapter map's deploy round trip: closed -OPEN-> browsing -ARM_DEPLOY-> confirming -SELECT-> browsing -CLOSE-> closed.
      examples: [(([i, idx]) => [i, [...idx, 'reset']])(uiFsmExample('CHAPTER_MAP_TRANSITIONS', ['OPEN', 'ARM_DEPLOY', 'SELECT', 'CLOSE']))],
      build: () =>
        fc.property(
          fc.integer({ min: 0, max: UI_FSM_SPECS.length - 1 }),
          fc.array(fc.oneof(fc.nat(12), fc.constant('reset')), { maxLength: 30 }),
          (specIdx, ops) => {
            const [label, table, initial, events, factory] = UI_FSM_SPECS[specIdx];
            const reached = reachableStates(table, initial);
            for (const s of Object.keys(table)) expect(reached.has(s), `${label}: unreachable state ${s}`);
            const hookLog = [];
            const subLog = [];
            const fsm = createStateMachine({ initial, transitions: table, onTransition: (to, from, ev) => hookLog.push(`${from}->${to}:${ev}`) });
            fsm.subscribe((to, from, ev) => subLog.push(`${from}->${to}:${ev}`));
            const real = factory?.();
            const realLog = [];
            real?.subscribe((to, from, ev) => realLog.push(`${from}->${to}:${ev}`));
            const machines = real ? [fsm, real] : [fsm];
            let model = initial;
            expect(!real || real.state === initial, `${label}: the module's factory starts in ${real?.state}, not ${initial}`);
            for (const op of ops) {
              if (op === 'reset') {
                for (const m of machines) m.reset();
                model = initial;
                expect(machines.every((m) => m.state === initial), `${label}: reset() did not restore ${initial}`);
                continue;
              }
              const ev = events[op % events.length];
              const want = nextMachineState(table, model, ev);
              const beforeLen = hookLog.length;
              for (const m of machines) {
                const who = m === fsm ? 'createStateMachine' : 'factory';
                expect(m.can(ev) === (want !== null), `${label} (${who}): can(${ev}) disagreed in ${model}`);
                expect(m.send(ev) === (want !== null), `${label} (${who}): send(${ev}) disagreed in ${model}`);
              }
              const edge = `${model}->${want}:${ev}`;
              if (want !== null) {
                expect(hookLog.length === beforeLen + 1 && subLog.at(-1) === edge && (!real || realLog.at(-1) === edge), `${label}: transition callback mismatch`);
                model = want;
              } else {
                expect(hookLog.length === beforeLen && hookLog.length === subLog.length && (!real || realLog.length === subLog.length), `${label}: invalid send(${ev}) fired a callback`);
              }
              expect(machines.every((m) => m.state === model) && reached.has(model), `${label}: state ${machines.map((m) => m.state)} != ${model}`);
            }
          },
        ),
    },
    {
      name: 'each UI module\'s create*Machine() starts in its table\'s initial state and answers every (state, event) pair exactly as its table',
      check: () => {
        for (const [label, table, initial, events, factory] of UI_FSM_SPECS) {
          if (!factory) continue;
          expect(factory().state === initial, `${label}: the factory starts in ${factory().state}, not ${initial}`);
          for (const from of Object.keys(table)) {
            for (const ev of events) {
              const m = factory();
              m.reset(from);
              const want = nextMachineState(table, from, ev);
              expect(m.send(ev) === (want !== null) && m.state === (want ?? from), `${label}: factory in ${from} on ${ev} went to ${m.state}, table says ${want ?? '(refuse)'}`);
            }
          }
        }
      },
    },
  ];
}

function dialogOrchestratorProps({ mountDialogOrchestrator, DIALOG_SOCKET_TRANSITIONS, nextMachineState }) {
  return [
    {
      name: 'mountDialogOrchestrator enforces maxConcurrent <= 1, chatter queue cap <= 3, and socket_locked gating over arbitrary event streams',
      examples: [[['lock', 'taunt:smug:1', 'taunt:smug:2', 'taunt:smug:3', 'taunt:smug:4', 'unlock', 'flush']]],
      build: () =>
        fc.property(
          fc.array(
            fc.constantFrom(
              'taunt:smug:1',
              'taunt:smug:2',
              'taunt:order:1',
              'script:1',
              'script:2',
              'lock',
              'unlock',
              'room',
              'floor',
              'flush',
            ),
            { minLength: 1, maxLength: 35 },
          ),
          (ops) => {
            const dom = fakeDom();
            dom.install();
            try {
              const host = dom.doc.body.appendChild(dom.make('div'));
              const orch = mountDialogOrchestrator(host, () => dom.make('canvas'));
              let socketModel = 'free';
              for (let i = 0; i < ops.length; i++) {
                const op = ops[i];
                const wasLocked = socketModel === 'socket_locked';
                const prevActive = orch.box.activeLine();
                if (op.startsWith('taunt:')) {
                  const [, mood, tag] = op.split(':');
                  orch.handleEvent({
                    type: 'AGENT_TAUNT',
                    agent: 'clod',
                    model: 'agent.clod',
                    mood,
                    text: `Line ${tag} (${i})`,
                  });
                } else if (op.startsWith('script:')) {
                  orch.handleEvent({
                    type: 'DIALOG_BOX',
                    speaker: 'vibecoder',
                    name: 'VIBECODER',
                    model: 'vibecoder.dev',
                    text: `Script ${op} ${i}`,
                    holdMs: 900,
                  });
                } else if (op === 'lock') {
                  orch.handleEvent({
                    type: 'OBSTACLE_DIALOGUE_RENDERED',
                    payload: {
                      obstacleId: 'sock',
                      speakerName: 'Hank',
                      portraitSprite: 'door.socket',
                      mood: 'hinting',
                      bubbleStyle: 'COMIX_CLASSIC',
                      anchorInodeId: 1,
                      pages: [{ text: 'hello', highlightedUnixTokens: [] }],
                      ansiTerminalBanner: '',
                    },
                  });
                  socketModel = nextMachineState(DIALOG_SOCKET_TRANSITIONS, socketModel, 'LOCK') ?? socketModel;
                } else if (op === 'unlock' || op === 'room') {
                  orch.handleEvent(
                    op === 'unlock'
                      ? { type: 'PUZZLE_DOOR_RESOLVED', socketInodeId: 1, unlockedInodeId: 2, solvedViaInput: 'ok' }
                      : { type: 'ROOM_TRANSITION', fromDir: 1, toDir: 2, toPath: '/next', upwardPanelsSmashed: 0, viaSymlinkLoop: false },
                  );
                  socketModel = nextMachineState(DIALOG_SOCKET_TRANSITIONS, socketModel, 'UNLOCK') ?? socketModel;
                } else if (op === 'floor') {
                  orch.handleEvent({ type: 'FLOOR_ENTERED', floorId: 1, title: 'Sector', path: '/lab' });
                  socketModel = nextMachineState(DIALOG_SOCKET_TRANSITIONS, socketModel, 'CLEAR') ?? socketModel;
                } else if (op === 'flush') {
                  dom.flush();
                }

                const st = orch.stats();
                expect(st.maxConcurrent <= 1 && st.maxRightConcurrent <= 1, `concurrent dialogs exceeded 1: ${JSON.stringify(st)}`);
                expect(st.socketOpen === (socketModel === 'socket_locked'), `socketOpen ${st.socketOpen} != ${socketModel}`);
                const queuedChatter = orch.box.queuedLines().filter((l) => (l.priority ?? 'script') === 'chatter').length;
                expect(queuedChatter <= 3, `chatter queue exceeded cap 3: ${queuedChatter}`);
                const active = orch.box.activeLine();
                if (wasLocked && st.socketOpen && active && active !== prevActive) {
                  // Only script/prompt lines may newly open while socketOpen is true (existing active chatter gets shortened).
                  expect((active.priority ?? 'script') !== 'chatter', `chatter line newly opened while socket locked: ${active.text}`);
                }
              }
              orch.clear();
            } finally {
              dom.uninstall();
            }
          },
        ),
    },
  ];
}

/**
 * Loads the UI modules and builds the UI properties. `shared` holds what terminal.mjs owns: `room(kind, files)` and
 * `shellKind`. Returns `playMenu(actions, { onRestart })` (the restart-level property drives the menu too), the Esc menu and
 * pref properties, and the UI state-machine properties, each list in its original order.
 */
export async function terminalUiProps({ load }, { room, shellKind }) {
  const { mountEscMenu, ESC_MENU_TRANSITIONS, LEAVE_CONFIRM_TEXT, createEscMenuMachine } = await load('/src/ui/esc-menu.ts');
  const { DIALOG_TRANSITIONS } = await load('/src/ui/dialog-box.ts');
  const { CHAPTER_MAP_TRANSITIONS, createChapterMapMachine } = await load('/src/ui/chapter-map.ts');
  const { MANUAL_BOOK_TRANSITIONS, createManualBookMachine } = await load('/src/ui/manual-book.ts');
  const { NATIVE_MODAL_TRANSITIONS, createNativeModalMachine } = await load('/src/ui/modal-dialog.ts');
  const { DIALOG_SOCKET_TRANSITIONS, createDialogSocketMachine, mountDialogOrchestrator } = await load('/src/ui/dialog-orchestrator.ts');
  const { VISUAL_LAB_TRANSITIONS, createVisualLabMachine } = await load('/src/ui/visual-lab-panel.ts');
  const { SEARCH_DRAWER_TRANSITIONS, createSearchDrawerMachine } = await load('/src/ui/manual-book-search.ts');
  const { createStateMachine, nextMachineState, reachableStates } = await load('/src/contracts/state-machine.ts');
  const { readSoundPref, writeSoundPref } = await load('/src/ui/sound-pref.ts');
  const { readSkinPref, writeSkinPref, defaultSkinFor, initialSkin } = await load('/src/ui/terminal-skin.ts');
  const { SKIN_IDS } = await load('/src/contracts/terminal-skins.ts');
  const brand = await load('/src/contracts/brand.ts');
  const { renamedKey } = await load('/src/contracts/legacy-keys.ts');
  /** [label, table, initial, events, the module's own machine factory (dialog-box has none: it builds one inline)]. */
  const UI_FSM_SPECS = [
    ['DIALOG_TRANSITIONS', DIALOG_TRANSITIONS, 'idle', ['START', 'SETTLE', 'EXIT', 'CLOSE'], null],
    ['CHAPTER_MAP_TRANSITIONS', CHAPTER_MAP_TRANSITIONS, 'closed', ['OPEN', 'CLOSE', 'SELECT', 'ARM_DEPLOY', 'CANCEL_DEPLOY'], createChapterMapMachine],
    ['ESC_MENU_TRANSITIONS', ESC_MENU_TRANSITIONS, 'closed', ['OPEN', 'CLOSE', 'ARM_RESTART', 'CANCEL_RESTART', 'ARM_LEAVE', 'CANCEL_LEAVE'], createEscMenuMachine],
    ['NATIVE_MODAL_TRANSITIONS', NATIVE_MODAL_TRANSITIONS, 'closed', ['OPEN', 'CLOSE'], createNativeModalMachine],
    ['MANUAL_BOOK_TRANSITIONS', MANUAL_BOOK_TRANSITIONS, 'closed', ['OPEN', 'CLOSE'], () => createManualBookMachine(false)],
    ['DIALOG_SOCKET_TRANSITIONS', DIALOG_SOCKET_TRANSITIONS, 'free', ['LOCK', 'UNLOCK', 'CLEAR'], createDialogSocketMachine],
    ['VISUAL_LAB_TRANSITIONS', VISUAL_LAB_TRANSITIONS, 'closed', ['OPEN', 'CLOSE', 'DESTROY'], createVisualLabMachine],
    ['SEARCH_DRAWER_TRANSITIONS', SEARCH_DRAWER_TRANSITIONS, 'closed', ['OPEN', 'CLOSE', 'SUPPRESS', 'ALLOW_FOCUS'], createSearchDrawerMachine],
  ];
  /** The example's [table index, event indexes], looked up by name so a reordered list cannot retarget it. */
  const uiFsmExample = (label, names) => {
    const i = UI_FSM_SPECS.findIndex(([l]) => l === label);
    const idx = names.map((n) => UI_FSM_SPECS[i]?.[3].indexOf(n) ?? -1);
    if (i < 0 || idx.includes(-1)) throw new Error(`bad UI FSM example ${label} ${names}`);
    return [i, idx];
  };
  return {
    playMenu: (actions, opts) => playMenu(actions, { mountEscMenu, LEAVE_CONFIRM_TEXT, ...opts }),
    menuProps: menuPrefProps({ mountEscMenu, LEAVE_CONFIRM_TEXT, readSoundPref, writeSoundPref, readSkinPref, writeSkinPref, defaultSkinFor, initialSkin, SKIN_IDS, brand, renamedKey, room, shellKind }),
    machineProps: [
      ...uiTableProps({ UI_FSM_SPECS, uiFsmExample, createStateMachine, nextMachineState, reachableStates }),
      ...dialogOrchestratorProps({ mountDialogOrchestrator, DIALOG_SOCKET_TRANSITIONS, nextMachineState }),
    ],
  };
}
