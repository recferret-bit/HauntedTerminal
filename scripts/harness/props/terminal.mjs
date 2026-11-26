// Terminal properties: the shell and its virtual file system, played through the same exec path the game uses, on BOTH shells
// ("two shells, one behaviour"): the chapter shell (a Terminal Lab session: a throwaway one-room pack with no enemies) and
// the classic shell (classic floor 2 in a lab, files made with `echo`). Spec: .kiro/specs/property-based-tests/.
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileName, readableMode, shellLine, twoNames } from './arbitraries.mjs';
import { expect, fakeDom } from './kit.mjs';
import { chapterWorld } from './sessions.mjs';

const ROOM = '/lab';
const notReadme = (n) => n !== 'readme.txt';
/** Names the classic floor already holds in its start room; a property file must not collide with them. */
const CLASSIC_TAKEN = /^(archivist_gate|iron_gate|port_|prod|todo|ram_|energy|intercom)/;
const usable = (n) => notReadme(n) && !CLASSIC_TAKEN.test(n);

/** One line of file content that survives `echo '<line>' > f` in either shell. */
const oneLine = fc.stringMatching(/^[a-z0-9][a-z0-9 ]{0,24}$/);
const shellKind = fc.constantFrom('chapter', 'classic');

/** `-rw-r-----` for `640`: the string `ls -l` prints for a plain file with that mode. */
export function modeText(octal) {
  const bits = 'rwx';
  return `-${[...octal].map((d) => [0, 1, 2].map((i) => (Number(d) & (4 >> i) ? bits[i] : '-')).join('')).join('')}`;
}

const MENU_ACTIONS = fc.oneof(
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

export default async function terminalSuite({ load }) {
  const { openLabSession } = await load('/src/terminal-lab/node-driver.ts');
  const { newLabScript } = await load('/src/terminal-lab/lab-pack.ts');
  const { COMMANDS } = await load('/src/game/manual.ts');
  const { applyChmodMode, reverseLines, wcStats } = await load('/src/game/unix-applets.ts');
  const { CHAPTER_COMMANDS } = await load('/src/chapters/session-state.ts');
  const {
    BOOK_PAGES,
    findCommandDoc,
    formatChmodPreview,
    resolveManualPageIndex,
    searchManual,
  } = await load('/src/game/manual-catalog.ts');
  const { resolveLevelByQuery } = await load('/src/ui/chapter-map-model.ts');
  // `map` on the real chapter (its manifest is what the map resolves against); one session per level, opened on first use.
  const mapWorld = await chapterWorld({ load });
  const mapSessions = new Map();
  const mapSession = (i) => mapSessions.get(i) ?? mapSessions.set(i, mapWorld.open(i)).get(i);

  /** A fresh session on `kind` holding `files` (`{ name: oneLineContent }`), each file's content being `<line>\n`. */
  const room = (kind, files = {}) => {
    const script = newLabScript('props-terminal');
    if (kind === 'classic') script.driver = 'classic';
    else for (const [name, line] of Object.entries(files)) script.setup.push({ op: 'file', path: `${ROOM}/${name}`, content: `${line}\n` });
    const session = openLabSession(script);
    if (kind === 'classic') for (const [name, line] of Object.entries(files)) session.exec(`echo '${line}' > ${name}`);
    return session;
  };
  const listed = (session) => session.exec('ls').output.split(/\s+/).map((n) => n.replace(/\/$/, ''));

  // ---- restart-level: the arm / confirm / expire rule, on both shells ----------------------------------------------------
  const { createSession } = await load('/src/game/session.ts');
  const { buildLabPack } = await load('/src/terminal-lab/lab-pack.ts');
  const { RESTART_CONFIRM_TICKS } = await load('/src/game/commands-proc.ts');
  const ARMED = '[RESTART] This reloads';
  const CONFIRM_TICKS = 20; // the rule as written (R17), deliberately not read from the code under test

  /** A session whose game clock `advance` can move: the chapter shell via `labTick()`, the classic shell via `tick()` (live lab clock). */
  const openClock = (kind) => {
    const script = newLabScript('props-restart');
    if (kind === 'chapter') return openLabSession(script);
    script.driver = 'classic';
    const session = createSession({ lab: { ...buildLabPack(script).config, clock: 'live' } });
    session.skipIntro();
    return session;
  };
  const advance = (session, kind, n) => {
    for (let i = 0; i < n; i++) {
      if (kind === 'chapter') session.labTick();
      else session.tick();
    }
  };
  const jumpLevel = (session, kind) => (kind === 'chapter' ? session.jumpToLevel(0) : session.debugTeleport(3));

  const LINES = { arm: 'restart-level', retry: 'retry', yes: 'restart-level --yes', retryYes: 'retry --yes', other: 'pwd', bad: 'restart-level now' };
  const RESTART_ACTIONS = fc.oneof(
    fc.constantFrom('arm', 'arm', 'retry', 'yes', 'retryYes', 'other', 'bad', 'empty', 'level'),
    fc.integer({ min: 1, max: CONFIRM_TICKS + 5 }),
  );

  /**
   * Plays `actions` on a fresh session and checks every step against a model of the rule: a bare run restarts only when it
   * is the very next non-empty line after the one that armed, within 20 ticks, in the same level; `--yes` always restarts;
   * any other non-empty line, a level change or a later tick expires. Returns the transcript (for the repeat check).
   */
  const playRestart = (kind, actions) => {
    const session = openClock(kind);
    session.exec(`echo mark > mark.txt`);
    const done = kind === 'chapter' ? '[RETRY]' : 'Floor restarted';
    const log = [];
    let pending = null; // { ticks } while an armed confirm is still valid
    let restarts = 0;
    let levelChanges = 0;
    for (const a of actions) {
      if (typeof a === 'number') {
        advance(session, kind, a);
        if (pending) pending.ticks += a;
        log.push(`ticks ${a}`);
        continue;
      }
      if (a === 'level') {
        jumpLevel(session, kind);
        pending = null;
        levelChanges += 1;
        log.push('level');
        continue;
      }
      if (a === 'empty') { log.push(`empty ${session.exec('').output}`); continue; }
      const r = session.exec(LINES[a]);
      log.push(`${a} ${r.code} ${r.output}`);
      const text = r.output;
      if (a === 'arm' || a === 'retry') {
        const want = pending !== null && pending.ticks <= CONFIRM_TICKS;
        expect(r.code === 0, `${kind}: ${LINES[a]} exited ${r.code}`);
        expect(want ? text.includes(done) && !text.includes(ARMED) : text.includes(ARMED) && !text.includes(done),
          `${kind}: ${LINES[a]} ${want ? 'should have restarted' : 'should only have armed'} (pending ${JSON.stringify(pending)}), printed ${JSON.stringify(text)}`);
        if (want) { restarts += 1; pending = null; } else pending = { ticks: 0 };
      } else if (a === 'yes' || a === 'retryYes') {
        expect(r.code === 0 && text.includes(done) && !text.includes(ARMED), `${kind}: ${LINES[a]} did not restart: ${JSON.stringify(text)}`);
        restarts += 1;
        pending = null;
      } else if (a === 'bad') {
        expect(r.code === 2 && /unknown argument/.test(text) && !text.includes(done), `${kind}: ${LINES[a]} gave ${JSON.stringify(text)} code ${r.code}`);
        pending = null;
      } else {
        expect(!text.includes(done) && !text.includes(ARMED), `${kind}: ${LINES[a]} printed a restart message`);
        pending = null;
      }
    }
    const mark = session.exec('ls').output.includes('mark.txt');
    if (restarts > 0) expect(!mark, `${kind}: ${restarts} restart(s) left the file made before them`);
    else if (levelChanges === 0) expect(mark, `${kind}: no restart ran, yet the file made before is gone`);
    log.push(`final ${mark}`);
    return log;
  };

  const { mountEscMenu, ESC_MENU_TRANSITIONS, LEAVE_CONFIRM_TEXT } = await load('/src/ui/esc-menu.ts');
  const { DIALOG_TRANSITIONS } = await load('/src/ui/dialog-box.ts');
  const { CHAPTER_MAP_TRANSITIONS } = await load('/src/ui/chapter-map.ts');
  const { MANUAL_BOOK_TRANSITIONS } = await load('/src/ui/manual-book.ts');
  const { NATIVE_MODAL_TRANSITIONS } = await load('/src/ui/modal-dialog.ts');
  const { DIALOG_SOCKET_TRANSITIONS, mountDialogOrchestrator } = await load('/src/ui/dialog-orchestrator.ts');
  const { VISUAL_LAB_TRANSITIONS } = await load('/src/ui/visual-lab-panel.ts');
  const { SEARCH_DRAWER_TRANSITIONS } = await load('/src/ui/manual-book-search.ts');
  const { createStateMachine, nextMachineState, reachableStates } = await load('/src/contracts/state-machine.ts');
  const { readSoundPref, writeSoundPref } = await load('/src/ui/sound-pref.ts');
  const { readSkinPref, writeSkinPref, defaultSkinFor, initialSkin } = await load('/src/ui/terminal-skin.ts');
  const { SKIN_IDS } = await load('/src/contracts/terminal-skins.ts');
  const brand = await load('/src/contracts/brand.ts');
  const { renamedKey } = await load('/src/contracts/legacy-keys.ts');

  return [
    {
      name: 'the shell never throws on any input line (both shells)',
      // Found by this property: `mv .. j` moved a folder into itself; the tree became a loop and the next path walk crashed
      // or hung (fixed in session-fs.ts cmdMv).
      examples: [['chapter', ['mv .. j', 'ls']], ['chapter', ['>> "w" mv .. j_2 d.txt']]],
      build: () =>
        fc.property(shellKind, fc.array(shellLine, { minLength: 1, maxLength: 5 }), (kind, lines) => {
          const session = room(kind, { 'a.txt': 'alpha', 'notes.log': 'BUG here' });
          for (const line of lines) {
            const r = session.exec(line);
            expect(typeof r.output === 'string' && (r.code === undefined || Number.isInteger(r.code)), `bad result for ${JSON.stringify(line)} on ${kind}`);
          }
        }),
    },
    {
      name: '`cp a b` then `cat b` prints what `cat a` prints (both shells)',
      build: () =>
        fc.property(shellKind, twoNames.filter(([a, b]) => usable(a) && usable(b)), oneLine, (kind, [a, b], line) => {
          const session = room(kind, { [a]: line });
          const before = session.exec(`cat ${a}`).output;
          expect(session.exec(`cp ${a} ${b}`).code === 0, `cp ${a} ${b} failed on ${kind}`);
          const copy = session.exec(`cat ${b}`).output;
          expect(copy === before, `${kind}: cat ${b} printed ${JSON.stringify(copy)}, cat ${a} printed ${JSON.stringify(before)}`);
        }),
    },
    {
      name: '`mv a b` keeps the content and removes `a` (both shells)',
      build: () =>
        fc.property(shellKind, twoNames.filter(([a, b]) => usable(a) && usable(b)), oneLine, (kind, [a, b], line) => {
          const session = room(kind, { [a]: line });
          const before = session.exec(`cat ${a}`).output;
          expect(session.exec(`mv ${a} ${b}`).code === 0, `mv ${a} ${b} failed on ${kind}`);
          expect(session.exec(`cat ${b}`).output === before, `${kind}: ${b} lost its content`);
          expect(!listed(session).includes(a), `${kind}: ls still lists ${a}`);
          expect(session.exec(`cat ${a}`).code !== 0, `${kind}: cat ${a} still works`);
        }),
    },
    {
      name: 'after `chmod <mode> f`, `ls -l f` and `ls -l` show that mode (both shells)',
      // Found by this property: the chapter shell printed only the name for `ls -l <file>` (fixed in session-fs.ts).
      examples: [['chapter', 'a', '400']],
      build: () =>
        fc.property(shellKind, fileName.filter(usable), readableMode, (kind, name, mode) => {
          const session = room(kind, { [name]: 'x' });
          expect(session.exec(`chmod ${mode} ${name}`).code === 0, `chmod ${mode} ${name} failed on ${kind}`);
          const want = modeText(mode);
          const single = session.exec(`ls -l ${name}`).output;
          expect(single.startsWith(want) && single.trimEnd().endsWith(name), `${kind}: ls -l ${name} printed ${JSON.stringify(single)}, want ${want}`);
          const row = session.exec('ls -l').output.split('\n').find((l) => l.split(/\s+/).at(-1) === name);
          expect(row?.startsWith(want), `${kind}: ls -l row ${JSON.stringify(row)}, want ${want}`);
        }),
    },
    {
      name: 'a file nobody can read cannot be copied: `cp` fails and creates nothing (both shells)',
      // Found by review: the chapter shell copied a mode-000 file that `cat` refuses; the classic shell already refused (parity fix).
      examples: [['chapter', ['a.txt', 'b.txt'], 'alpha']],
      build: () =>
        fc.property(shellKind, twoNames.filter(([a, b]) => usable(a) && usable(b)), oneLine, (kind, [a, b], line) => {
          const session = room(kind, { [a]: line });
          expect(session.exec(`chmod 000 ${a}`).code === 0, `chmod 000 ${a} failed on ${kind}`);
          expect(session.exec(`cat ${a}`).code !== 0, `${kind}: cat ${a} should be denied`);
          const r = session.exec(`cp ${a} ${b}`);
          expect(r.code !== 0 && /permission denied/i.test(r.output), `${kind}: cp ${a} ${b} gave ${JSON.stringify(r.output)} code ${r.code}`);
          expect(!listed(session).includes(b), `${kind}: cp created ${b} from an unreadable file`);
        }),
    },
    {
      name: '`sed` with an empty pattern is refused and changes nothing (both shells)',
      // Found by review: `s//x/g` inserted x between every character; GNU sed has no previous expression and refuses.
      examples: [['chapter', ['/', 'x', 'g'], 'alpha'], ['classic', [',', '', ''], 'alpha']],
      build: () =>
        fc.property(shellKind, fc.constantFrom('/', ',', '|', '#').chain((d) => fc.tuple(fc.constant(d), fc.stringMatching(/^[a-z]{0,4}$/), fc.constantFrom('', 'g'))), oneLine, (kind, [d, repl, flag], line) => {
          const session = room(kind, { 'a.txt': line });
          const script = `s${d}${d}${repl}${d}${flag}`;
          const piped = session.exec(`sed '${script}' a.txt`);
          expect(piped.code !== 0 && /no previous regular expression/.test(piped.output), `${kind}: sed '${script}' gave ${JSON.stringify(piped.output)} code ${piped.code}`);
          expect(session.exec(`sed -i '${script}' a.txt`).code !== 0, `${kind}: sed -i '${script}' succeeded`);
          expect(session.exec('cat a.txt').output === `${line}\n`, `${kind}: sed -i changed the file`);
        }),
    },
    {
      name: 'a failed `cd` names the missing path exactly once (both shells)',
      // Found by QA: the chapter shell printed `cd: nowhere: No such file or directory: nowhere`.
      examples: [['chapter', 'nowhere'], ['classic', 'nowhere']],
      build: () =>
        fc.property(shellKind, fileName.filter(usable), (kind, name) => {
          const session = room(kind, {});
          const r = session.exec(`cd ${name}_missing`);
          const count = r.output.split(`${name}_missing`).length - 1;
          expect(r.code !== 0 && count === 1, `${kind}: cd ${name}_missing gave ${JSON.stringify(r.output)} (path ${count}x)`);
        }),
    },
    {
      name: 'after `rm f`, `ls` never lists `f` (both shells)',
      build: () =>
        fc.property(shellKind, fc.uniqueArray(fileName.filter(usable), { minLength: 1, maxLength: 4 }), fc.nat(), (kind, names, pick) => {
          const session = room(kind, Object.fromEntries(names.map((n) => [n, n.replace(/[^a-z0-9]/g, '')])));
          const gone = names[pick % names.length];
          expect(session.exec(`rm ${gone}`).code === 0, `rm ${gone} failed on ${kind}`);
          const left = listed(session);
          expect(!left.includes(gone), `${kind}: ls still lists ${gone}`);
          for (const n of names) if (n !== gone) expect(left.includes(n), `${kind}: rm ${gone} also removed ${n}`);
        }),
    },
    {
      name: 'restart-level: a bare run only arms; the next line, or --yes, restarts; any other line, a level change or more than 20 ticks expires (both shells)',
      examples: [
        ['chapter', ['arm', 'arm']], ['classic', ['arm', 'arm']], ['chapter', ['retry', 'retry']], ['classic', ['arm', 'retry']],
        ['chapter', ['arm', 20, 'arm']], ['classic', ['arm', 20, 'arm']], ['chapter', ['arm', 21, 'arm']], ['classic', ['arm', 21, 'arm']],
        ['chapter', ['arm', 'other', 'arm']], ['classic', ['arm', 'bad', 'arm']], ['chapter', ['arm', 'level', 'arm']], ['classic', ['arm', 'level', 'arm']],
        ['chapter', ['arm', 'empty', 'arm']], ['classic', ['arm', 'empty', 'arm']], ['chapter', ['yes', 'retryYes']], ['classic', ['arm', 'yes', 'arm', 'arm']],
      ],
      build: () => fc.property(shellKind, fc.array(RESTART_ACTIONS, { maxLength: 14 }), (kind, actions) => void playRestart(kind, actions)),
    },
    {
      name: 'restart-level: the same sequence gives the same transcript and state (both shells)',
      build: () =>
        fc.property(shellKind, fc.array(RESTART_ACTIONS, { maxLength: 12 }), (kind, actions) => {
          const a = playRestart(kind, actions);
          const b = playRestart(kind, actions);
          expect(JSON.stringify(a) === JSON.stringify(b), `${kind}: two runs of ${JSON.stringify(actions)} differ`);
        }),
    },
    {
      name: 'restart-level: opening or cancelling the Esc menu leaves the pending confirm alone; its confirm (a direct restartFloor) is a level reload that drops it (both shells)',
      examples: [['chapter', ['open', 'close']], ['classic', ['open', 'restartStart', 'restartNo', 'close']], ['chapter', ['open', 'restartStart', 'restartYes']], ['classic', ['open', 'restartStart', 'restartYes']]],
      build: () =>
        fc.property(shellKind, fc.array(MENU_ACTIONS, { maxLength: 25 }), fc.boolean(), (kind, actions, armFirst) => {
          const session = openClock(kind);
          const done = kind === 'chapter' ? '[RETRY]' : 'Floor restarted';
          if (armFirst) expect(session.exec('restart-level').output.includes(ARMED), `${kind}: restart-level did not arm`);
          let confirmed = 0;
          const calls = playMenu(actions, { mountEscMenu, LEAVE_CONFIRM_TEXT, onRestart: () => { confirmed += 1; session.restartFloor(); } });
          expect(calls === confirmed, 'menu confirm count and restartFloor calls differ');
          const text = session.exec('restart-level').output;
          const restarts = armFirst && confirmed === 0;
          expect(restarts ? text.includes(done) : text.includes(ARMED), `${kind}: after the menu (${confirmed} confirm, armed ${armFirst}) restart-level printed ${JSON.stringify(text)}`);
        }),
    },
    {
      name: 'restart-level: `retry`, `man restart-level`, bad arguments and Tab completion on both shells',
      check: () => {
        for (const kind of ['chapter', 'classic']) {
          const session = openClock(kind);
          const done = kind === 'chapter' ? '[RETRY]' : 'Floor restarted';
          expect(RESTART_CONFIRM_TICKS === CONFIRM_TICKS, `RESTART_CONFIRM_TICKS is ${RESTART_CONFIRM_TICKS}, R17 says ${CONFIRM_TICKS}`);
          expect(session.exec('retry').output.includes(ARMED), `${kind}: retry did not arm`);
          expect(session.exec('retry --yes').output.includes(done), `${kind}: retry --yes did not restart`);
          const bad = session.exec('restart-level --nope');
          expect(bad.code === 2 && /unknown argument/.test(bad.output), `${kind}: restart-level --nope gave ${JSON.stringify(bad.output)}`);
          const man = session.exec('man restart-level');
          expect(man.code === 0 && man.output.includes('--yes') && man.output.includes('restart'), `${kind}: man restart-level gave ${JSON.stringify(man.output)}`);
          expect(session.exec('man retry').code === 0, `${kind}: man retry failed`);
          const tab = session.complete('restart-l');
          expect(tab.line.trim() === 'restart-level' && tab.matches.includes('restart-level'), `${kind}: Tab on restart-l gave ${JSON.stringify(tab)}`);
          expect(session.complete('ret').matches.includes('retry'), `${kind}: Tab on ret misses retry`);
          expect(session.exec('help').output.includes('restart-level'), `${kind}: help does not list restart-level`);
        }
      },
    },
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
    {
      name: '`searchManual` never throws on arbitrary queries/filters and returns bounded page indices',
      build: () => {
        const filters = ['all', 'beginner', 'flags-numbers', 'combat', 'files', 'text', 'procs', 'code-docker', 'game'];
        return fc.property(fc.string({ maxLength: 32 }), fc.constantFrom(...filters), (q, flt) => {
          const hits = searchManual(q, flt);
          for (const h of hits) {
            expect(h.pageIndex >= 0 && h.pageIndex < BOOK_PAGES.length, `hit pageIndex out of range: ${h.pageIndex}`);
          }
          const idx = resolveManualPageIndex(q);
          expect(idx >= 0 && idx < BOOK_PAGES.length, `resolveManualPageIndex out of range: ${idx}`);
        });
      },
    },
    {
      name: '`formatChmodPreview` gives the octal and the POSIX rwx text of every mode 000..777 (exhaustive)',
      check: () => {
        // Independent oracle: one rwx triplet per octal digit, owner first, built from the bits of m (not from the code's octal).
        const rwx = (d) => `${d & 4 ? 'r' : '-'}${d & 2 ? 'w' : '-'}${d & 1 ? 'x' : '-'}`;
        for (let m = 0; m <= 0o777; m++) {
          const octal = m.toString(8).padStart(3, '0');
          const text = `-${rwx((m >> 6) & 7)}${rwx((m >> 3) & 7)}${rwx(m & 7)}`;
          const p = formatChmodPreview(m);
          expect(p.octal === octal && p.modeText === text, `mode ${octal}: got ${p.octal} ${p.modeText}, want ${octal} ${text}`);
        }
      },
    },
    {
      name: 'every command of both shells (COMMANDS and CHAPTER_COMMANDS) has a manual entry with syntax and an example (exhaustive)',
      check: () => {
        const all = [...new Set([...COMMANDS, ...CHAPTER_COMMANDS])];
        expect(all.length > 0, 'no commands to check');
        const missing = all.filter((c) => { const d = findCommandDoc(c); return !(d && d.syntax && d.examples.length >= 1); });
        expect(missing.length === 0, `undocumented: ${missing.join(', ')}`);
      },
    },
    {
      name: '`map <query>` exits 0 and hands the query to the page exactly once; the map resolves any query to a chapter level and `map <n>` to the level with index n',
      examples: [[0, '0'], [3, '1'], [0, '11'], [5, '-3'], [0, 'boss'], [2, 'hub'], [4, 'boot'], [1, ''], [0, '#3'], [0, '3 4']],
      build: () => {
        const levels = mapWorld.pack.manifest.levels;
        const query = fc.oneof(
          fc.integer({ min: -3, max: 30 }).map(String),
          fc.constantFrom('boot', 'hub', 'boss', 'core', 'tutorial', ...levels.map((l) => l.id)),
          fc.stringMatching(/^[a-z0-9 #-]{0,10}$/),
        );
        return fc.property(fc.nat(mapWorld.levels.length - 1), query, (at, q) => {
          const session = mapSession(at);
          const r = session.exec(q ? `map ${q}` : 'map');
          expect(r.code === 0, `map ${q} exited ${r.code}: ${JSON.stringify(r.output)}`);
          const req = session.consumeMapRequest();
          expect(typeof req === 'string', `map ${q} left no request (${JSON.stringify(req)})`);
          expect(session.consumeMapRequest() === null, `map ${q}: the request was handed over twice`);
          if (!q.includes('#')) expect(req === q.trim().split(/\s+/).filter(Boolean).join(' '), `map ${q} handed over ${JSON.stringify(req)}`);
          const cur = mapWorld.levels[at].id;
          for (const asked of [req, q]) {
            const lvl = resolveLevelByQuery(mapWorld.pack.manifest, asked, cur);
            expect(levels.includes(lvl), `query ${JSON.stringify(asked)} resolved outside the manifest`);
          }
          const n = Number(q);
          if (/^\d+$/.test(q) && n >= 1 && n <= levels.length) {
            for (const asked of [req, n]) {
              const lvl = resolveLevelByQuery(mapWorld.pack.manifest, asked, cur);
              expect(lvl.index === n, `query ${JSON.stringify(asked)} resolved to level ${lvl.index}, want ${n}`);
            }
          }
        });
      },
    },
    {
      name: 'classic and chapter shells agree on POSIX unix applets (wc, grep -c, head, tail, cut, sed, rev, chmod)',
      examples: [
        ['alpha.log', [[true, 'foo', 'one'], [false, 'bar', 'foo'], [true, 'baz', 'two']], '640'],
        ['zero.log', [[true, 'bar', 'one']], '640'],
      ],
      build: () =>
        fc.property(
          fileName.filter(usable),
          fc.array(fc.tuple(fc.boolean(), fc.constantFrom('foo', 'bar', 'baz'), fc.stringMatching(/^[a-z0-9]{1,8}$/)), { minLength: 1, maxLength: 5 }),
          readableMode,
          (name, pairs, mode) => {
            const c = room('chapter');
            const g = room('classic');
            for (const [idx, [withDelim, k, v]] of pairs.entries()) {
              const op = idx === 0 ? '>' : '>>';
              const row = withDelim ? `${k}:${v}` : `${k}_${v}`;
              const write = `echo '${row}' ${op} ${name}`;
              c.exec(write);
              g.exec(write);
            }
            const checks = [
              `wc -l ${name}`,
              `grep -c foo ${name}`,
              `head -n 1 ${name}`,
              `tail -n 1 ${name}`,
              `cut -d: -f2 ${name}`,
              `sed 's/foo/FIXED/' ${name}`,
              `rev ${name}`,
              `chmod ${mode} ${name}`,
            ];
            for (const cmd of checks) {
              const rc = c.exec(cmd);
              const rg = g.exec(cmd);
              expect(rc.code === rg.code && rc.output === rg.output, `${cmd} diverged: chapter=(${rc.code}, ${JSON.stringify(rc.output)}) vs classic=(${rg.code}, ${JSON.stringify(rg.output)})`);
            }
          },
        ),
    },
    {
      name: '`reverseLines` is an involution over arbitrary line arrays (including Unicode) and preserves line counts',
      examples: [[['hello', 'a😀b', '']], [['one']]],
      build: () =>
        fc.property(
          fc.array(fc.string({ minLength: 0, maxLength: 20 }).map((s) => s.replace(/[\r\n]/g, '')), { minLength: 1, maxLength: 6 }),
          (rows) => {
            const text = `${rows.join('\n')}\n`;
            const rev = reverseLines(text);
            expect(reverseLines(rev) === text, `reverseLines is not an involution on ${JSON.stringify(text)}`);
            expect(wcStats(rev).lines === wcStats(text).lines, `line count changed across reverseLines`);
          },
        ),
    },
    {
      name: '`applyChmodMode` symbolic clauses mutate only targeted u/g/o bits and leave untouched bits invariant',
      examples: [[0o644, 'u', '+', 'x'], [0o755, 'go', '-', 'w'], [0o000, 'a', '=', 'rw']],
      build: () =>
        fc.property(
          fc.integer({ min: 0, max: 0o777 }),
          fc.constantFrom('u', 'g', 'o', 'ug', 'go', 'a'),
          fc.constantFrom('+', '-', '='),
          fc.constantFrom('r', 'w', 'x', 'rx', 'rw', 'rwx', ''),
          (mode, who, op, perm) => {
            const out = applyChmodMode(mode, `${who}${op}${perm}`);
            expect(out !== null, `valid clause ${who}${op}${perm} returned null`);
            let bits = 0;
            for (const ch of perm) bits |= ch === 'r' ? 4 : ch === 'w' ? 2 : 1;
            const targets = [who.includes('u') || who === 'a' ? 6 : null, who.includes('g') || who === 'a' ? 3 : null, who.includes('o') || who === 'a' ? 0 : null].filter((s) => s !== null);
            for (const shift of [6, 3, 0]) {
              const before = (mode >> shift) & 7;
              const after = (out >> shift) & 7;
              if (!targets.includes(shift)) expect(after === before, `untouched shift ${shift} changed`);
              else if (op === '+') expect(after === (before | bits), `op + mismatch at shift ${shift}`);
              else if (op === '-') expect(after === (before & ~bits), `op - mismatch at shift ${shift}`);
              else expect(after === bits, `op = mismatch at shift ${shift}`);
            }
          },
        ),
    },
    {
      name: 'UI FSM transition tables (DIALOG, CHAPTER_MAP, ESC_MENU, NATIVE_MODAL, MANUAL_BOOK, DIALOG_SOCKET, VISUAL_LAB, SEARCH_DRAWER) only reach valid states and fire callbacks only on valid edges',
      examples: [[0, ['OPEN', 'ARM_DEPLOY', 'SELECT', 'CLOSE', 'reset']]],
      build: () => {
        const specs = [
          ['DIALOG_TRANSITIONS', DIALOG_TRANSITIONS, 'idle', ['START', 'SETTLE', 'EXIT', 'CLOSE']],
          ['CHAPTER_MAP_TRANSITIONS', CHAPTER_MAP_TRANSITIONS, 'closed', ['OPEN', 'CLOSE', 'SELECT', 'ARM_DEPLOY', 'CANCEL_DEPLOY']],
          ['ESC_MENU_TRANSITIONS', ESC_MENU_TRANSITIONS, 'closed', ['OPEN', 'CLOSE', 'ARM_RESTART', 'CANCEL_RESTART', 'ARM_LEAVE', 'CANCEL_LEAVE']],
          ['NATIVE_MODAL_TRANSITIONS', NATIVE_MODAL_TRANSITIONS, 'closed', ['OPEN', 'CLOSE']],
          ['MANUAL_BOOK_TRANSITIONS', MANUAL_BOOK_TRANSITIONS, 'closed', ['OPEN', 'CLOSE']],
          ['DIALOG_SOCKET_TRANSITIONS', DIALOG_SOCKET_TRANSITIONS, 'free', ['LOCK', 'UNLOCK', 'CLEAR']],
          ['VISUAL_LAB_TRANSITIONS', VISUAL_LAB_TRANSITIONS, 'closed', ['OPEN', 'CLOSE', 'DESTROY']],
          ['SEARCH_DRAWER_TRANSITIONS', SEARCH_DRAWER_TRANSITIONS, 'closed', ['OPEN', 'CLOSE', 'SUPPRESS', 'ALLOW_FOCUS']],
        ];
        return fc.property(
          fc.integer({ min: 0, max: specs.length - 1 }),
          fc.array(fc.oneof(fc.nat(12), fc.constant('reset')), { maxLength: 30 }),
          (specIdx, ops) => {
            const [label, table, initial, events] = specs[specIdx];
            const reached = reachableStates(table, initial);
            for (const s of Object.keys(table)) {
              expect(reached.has(s), `${label}: unreachable state ${s}`);
            }
            const hookLog = [];
            const subLog = [];
            const fsm = createStateMachine({
              initial,
              transitions: table,
              onTransition: (to, from, ev) => hookLog.push(`${from}->${to}:${ev}`),
            });
            fsm.subscribe((to, from, ev) => subLog.push(`${from}->${to}:${ev}`));
            let model = initial;
            for (const op of ops) {
              if (op === 'reset') {
                fsm.reset();
                model = initial;
                expect(fsm.state === initial, `${label}: reset() did not restore ${initial}`);
                continue;
              }
              const ev = events[op % events.length];
              const want = nextMachineState(table, model, ev);
              expect(fsm.can(ev) === (want !== null), `${label}: can(${ev}) disagreed in ${model}`);
              const beforeLen = hookLog.length;
              const ok = fsm.send(ev);
              expect(ok === (want !== null), `${label}: send(${ev}) returned ${ok} in ${model}`);
              if (want !== null) {
                expect(hookLog.length === beforeLen + 1 && subLog.at(-1) === `${model}->${want}:${ev}`, `${label}: transition callback mismatch`);
                model = want;
              } else {
                expect(hookLog.length === beforeLen, `${label}: invalid send(${ev}) fired onTransition`);
              }
              expect(fsm.state === model && reached.has(fsm.state), `${label}: state ${fsm.state} != ${model}`);
            }
          },
        );
      },
    },
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
