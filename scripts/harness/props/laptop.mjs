// Laptop properties: the lifecycle state machine, the desktop window manager, the loop guard and saved progress
// (src/laptop/domain, src/laptop/runtime/loop-guard.ts). Spec: .kiro/specs/property-based-tests/.
import { Script } from 'node:vm';
import fc from 'fast-check';
import { jsonValue } from './arbitraries.mjs';
import { expect } from './kit.mjs';

/** A clock the property advances by hand: `after` arms a timer, `advance` fires the due ones in time order. */
function handClock() {
  let now = 0;
  let timers = [];
  return {
    after(ms, fn) {
      const t = { at: now + ms, fn };
      timers.push(t);
      return () => { timers = timers.filter((x) => x !== t); };
    },
    advance(ms) {
      const end = now + ms;
      for (let due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0]; due; due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0]) {
        timers = timers.filter((t) => t !== due);
        now = due.at;
        due.fn();
      }
      now = end;
    },
  };
}

/** Loop-free JavaScript: declarations, branches, calls, functions, and loop words hidden in strings, comments and names. */
const loopFreeStatement = fc.oneof(
  fc.constantFrom(
    'let a = 1;', 'a = a + 2;', 'const s = "for (;;) while (true)";', '// while (true) {}', '/* for (;;) */',
    'if (a > 3) { a = 0; } else { a += 1; }', 'console.log(a, `while ${a}`);', 'function forEver(x) { return x * 2; }',
    'const o = { while: 1, for: 2 }; o.while = o.for;', 'const r = /for\\(;;\\)/g;', 'switch (a) { case 1: break; default: a = 2; }',
    '[1, 2, 3].forEach((n) => { a += n; });', 'try { a = JSON.parse("1"); } catch (e) { a = 0; }',
  ),
  fc.integer({ min: 0, max: 99 }).map((n) => `a = ${n};`),
);

/** Code with real loops of every form the guard handles, each with the number of checks it must get (`for...of/in`: none). */
const loopStatement = fc.constantFrom(
  ['for (let i = 0; i < 3; i++) { a += i; }', 1], ['for (;;) { break; }', 1], ['for (let i = 0; ; i++) { if (i > 2) break; }', 1],
  ['while (a < 10) { a++; }', 1], ['do { a--; } while (a > 0);', 1], ['for (const k of [1, 2]) { a += k; }', 0],
  ['for (const k in { x: 1 }) { a += 1; }', 0], ['function f() { while (a < 5) { a++; } return a; }', 1],
  ['if (a) { for (let j = 0; j < 2; j++) { while (false) {} } }', 2],
);

export default async function laptopSuite({ load }) {
  const machine = await load('/src/laptop/domain/machine.ts');
  const desktop = await load('/src/laptop/domain/desktop.ts');
  const { APP_ORDER } = await load('/src/laptop/domain/apps.ts');
  const { parseProgress } = await load('/src/laptop/domain/progress.ts');
  const { guardLoops } = await load('/src/laptop/runtime/loop-guard.ts');
  const EVENTS = ['OPEN', 'CLOSE', 'POWER', 'DONE'];

  const app = fc.constantFrom(...APP_ORDER);
  const action = fc.oneof(
    fc.record({ type: fc.constantFrom('open', 'close', 'focus', 'minimize'), app }),
    fc.record({ type: fc.constant('move'), app, x: fc.integer({ min: -2000, max: 2000 }), y: fc.integer({ min: -2000, max: 2000 }) }),
    fc.record({ type: fc.constant('move-icon'), app, x: fc.integer({ min: -2000, max: 2000 }), y: fc.integer({ min: -2000, max: 2000 }) }),
    fc.record({ type: fc.constant('arrange-icons') }),
  );

  return [
    {
      name: '`nextState` only reaches known states and agrees with the transition table',
      build: () =>
        fc.property(fc.constantFrom(...machine.LAPTOP_STATES), fc.array(fc.constantFrom(...EVENTS), { maxLength: 30 }), (start, events) => {
          let state = start;
          for (const e of events) {
            const next = machine.nextState(state, e);
            expect(next === (machine.TRANSITIONS[state][e] ?? null), `nextState(${state}, ${e}) = ${next}`);
            if (next) state = next;
            expect(machine.LAPTOP_STATES.includes(state), `unknown state ${state}`);
          }
        }),
    },
    {
      name: 'the running machine, with timers firing at any moment, stays in known states and follows the table',
      build: () =>
        fc.property(
          fc.array(fc.tuple(fc.constantFrom('OPEN', 'CLOSE', 'POWER'), fc.integer({ min: 0, max: 4000 })), { maxLength: 25 }),
          fc.constantFrom(0, 0.4, 1),
          (steps, speed) => {
            const clock = handClock();
            const seen = [];
            const m = machine.createMachine(clock, (to, from, ev) => seen.push([from, ev, to]));
            m.speed = speed;
            for (const [event, wait] of steps) {
              m.send(event);
              clock.advance(wait);
              expect(machine.LAPTOP_STATES.includes(m.state), `unknown state ${m.state}`);
            }
            for (const [from, ev, to] of seen) expect(machine.TRANSITIONS[from][ev] === to, `${from} --${ev}--> ${to} is not in the table`);
            m.dispose();
          },
        ),
    },
    {
      name: 'the desktop keeps one window per app, a visible focus on top, and title bars on screen',
      build: () =>
        fc.property(fc.array(action, { maxLength: 40 }), (actions) => {
          let s = desktop.emptyDesktop();
          for (const a of actions) {
            s = desktop.reduceDesktop(s, a);
            const apps = s.windows.map((w) => w.app);
            expect(new Set(apps).size === apps.length, `two windows for one app after ${JSON.stringify(a)}`);
            const visible = s.windows.filter((w) => !w.minimized);
            const top = visible.length ? visible.reduce((x, y) => (y.z > x.z ? y : x)).app : null;
            expect(s.focus === top, `focus ${s.focus} but the top visible window is ${top} after ${JSON.stringify(a)}`);
            for (const w of s.windows) {
              const ok = w.x >= 40 - w.w && w.x <= desktop.SCREEN.w - 40 && w.y >= 0 && w.y <= desktop.SCREEN.h - 24;
              expect(ok, `${w.app} title bar off screen at ${w.x},${w.y}`);
            }
            for (const id of APP_ORDER) {
              const pos = s.icons[id];
              const ok = pos.x >= 0 && pos.x <= desktop.SCREEN.w - desktop.ICON.w && pos.y >= 0 && pos.y <= desktop.SCREEN.h - desktop.ICON.h;
              expect(ok, `${id} icon off screen at ${pos.x},${pos.y}`);
            }
          }
        }),
    },
    {
      name: 'the loop guard leaves loop-free code unchanged',
      build: () =>
        fc.property(fc.array(loopFreeStatement, { maxLength: 8 }), (lines) => {
          const src = lines.join('\n');
          const out = guardLoops(src);
          expect(out === src, `changed loop-free code:\n${src}\n---\n${out}`);
        }),
    },
    {
      name: 'guarded code with loops still compiles, and every loop with a condition gets a check naming its own line',
      examples: [[[['if (a) { for (let j = 0; j < 2; j++) { while (false) {} } }', 2], ['a = 1;', 0], ['do { a--; } while (a > 0);', 1]]]],
      build: () =>
        fc.property(fc.array(fc.oneof(loopStatement, loopFreeStatement.map((code) => [code, 0])), { minLength: 1, maxLength: 8 }), (parts) => {
          // Each statement in its own block, so two `let`s of the same name never clash.
          const src = `let a = 0;\n${parts.map(([code]) => `{\n${code}\n}`).join('\n')}`;
          const out = guardLoops(src);
          try {
            new Script(out);
          } catch (err) {
            throw new Error(`guarded code does not compile (${err.message}):\n${out}`, { cause: err });
          }
          // Line 1 is `let a = 0;`; part j is `{` on line 3j+2, its one-line statement on 3j+3, `}` on 3j+4. Every loop of
          // part j must report line 3j+3, in source order (`__lg(N)`, N = the loop's line in the player's file).
          const want = parts.flatMap(([, k], j) => Array(k).fill(3 * j + 3));
          const got = [...out.matchAll(/__lg\((\d+)\)/g)].map((m) => Number(m[1]));
          expect(got.length === want.length, `${want.length} loop(s) but ${got.length} check(s):\n${out}`);
          expect(got.every((n, i) => n === want[i]), `checks name lines ${JSON.stringify(got)}, want ${JSON.stringify(want)}:\n${out}`);
        }),
    },
    {
      name: '`parseProgress` never throws and always returns well-formed progress',
      build: () =>
        fc.property(fc.oneof(fc.string(), jsonValue.map((v) => JSON.stringify(v)), fc.constant(null)), (raw) => {
          const p = parseProgress(raw);
          expect(Array.isArray(p.done) && p.done.every((d) => typeof d === 'string'), 'done is not a string list');
          expect(p.drafts && typeof p.drafts === 'object' && !Array.isArray(p.drafts), 'drafts is not an object');
          for (const f of Object.values(p.drafts)) expect(['html', 'css', 'js'].every((k) => typeof f[k] === 'string'), 'a draft lacks html/css/js');
        }),
    },
  ];
}
