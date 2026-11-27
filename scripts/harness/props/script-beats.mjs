// Script beats of a trigger: `wait` defers the rest by exact level seconds, `take_item` removes an item, `fly_to` emits one
// flight, and Skip Dialog flushes what is left with only the state-changing kinds kept (items, flights), in order.
// Spec: .kiro/specs/tensor-gpu-hub-ritual/ (requirements 3, 5, 8, 17).
import fc from 'fast-check';
import { expect } from './kit.mjs';

const text = (r) => `${r.output ?? ''}\n${r.stderr ?? ''}`;
const count = (events, type) => events.filter((e) => e.type === type).length;

/** One trigger that fires on the first tick of a level and runs `steps`; the level's own opening gate is set to `openingSec`. */
function withTrigger(levelIdx, steps, openingSec) {
  return (pack) => {
    const level = pack.levels[levelIdx];
    level.script = { ...(level.script ?? {}), openingSec, triggers: [{ when: { kind: 'all', of: [] }, steps }] };
  };
}

export function scriptBeatProps(world) {
  const level = fc.nat(world.levels.length - 1);
  const seconds = fc.integer({ min: 1, max: 6 });
  return [
    {
      name: 'a `wait` step runs the rest of its beat exactly `sec` level seconds later, once, and what came before it only once',
      build: () =>
        fc.property(level, seconds, (levelIdx, sec) => {
          const steps = [
            { kind: 'print', text: 'BEAT-A\n' },
            { kind: 'fly_to', entityId: 'kiro', target: 'hero' },
            { kind: 'wait', sec },
            { kind: 'print', text: 'BEAT-B\n' },
          ];
          const session = world.openWith(levelIdx, withTrigger(levelIdx, steps, 0));
          const first = session.tick();
          expect(text(first).includes('BEAT-A') && !text(first).includes('BEAT-B'), `first tick printed ${JSON.stringify(text(first))}`);
          expect(count(first.events, 'ACTOR_FLY_TO') === 1, 'the flight before the wait was not emitted exactly once');
          let a = 1;
          let b = 0;
          let flights = 1;
          for (let i = 1; i <= sec + 3; i++) {
            const r = session.tick();
            a += text(r).split('BEAT-A').length - 1;
            b += text(r).split('BEAT-B').length - 1;
            flights += count(r.events, 'ACTOR_FLY_TO');
            const due = i >= sec;
            expect(b === (due ? 1 : 0), `after ${i} more tick(s) of wait ${sec}, BEAT-B printed ${b} time(s)`);
          }
          expect(a === 1 && flights === 1, `the first half repeated: BEAT-A x${a}, flights x${flights}`);
        }),
    },
    {
      name: 'Skip Dialog during a deferred beat still runs its items and flights in order, drops its dialogs and leaves nothing pending',
      build: () =>
        fc.property(level, seconds, (levelIdx, sec) => {
          const steps = [
            { kind: 'give_item', item: 'map' },
            { kind: 'wait', sec },
            { kind: 'dialog_box', speaker: 'dad', text: 'LATE-LINE' },
            { kind: 'fly_to', entityId: 'kiro', target: 'home' },
            { kind: 'take_item', item: 'map' },
          ];
          const session = world.openWith(levelIdx, withTrigger(levelIdx, steps, 600));
          const first = session.tick();
          expect(session.snapshot().inventory.items.includes('map'), 'give_item before the wait did not give the map');
          expect(count(first.events, 'ACTOR_FLY_TO') === 0, 'a step after the wait ran before the wait was over');
          const skipped = session.skipOpeningDialog();
          expect(skipped !== null, 'Skip Dialog was refused although the opening gate is active');
          expect(!session.snapshot().inventory.items.includes('map'), 'take_item after the wait did not run on Skip Dialog');
          expect(count(skipped.events, 'ACTOR_FLY_TO') === 1, 'the flight after the wait was not run once on Skip Dialog');
          expect(!text(skipped).includes('LATE-LINE'), 'a dialog after the wait was played on Skip Dialog');
          let later = 0;
          for (let i = 0; i < sec + 2; i++) {
            const r = session.tick();
            later += count(r.events, 'ACTOR_FLY_TO') + (text(r).includes('LATE-LINE') ? 1 : 0);
          }
          expect(later === 0, 'the deferred beat ran again after Skip Dialog');
        }),
    },
  ];
}
