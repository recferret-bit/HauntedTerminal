// The Tensor GPU ritual of the hub whose script has a `has_item tensor_gpu` trigger that flies Kiro (found in the data, never by name):
// played by the clock it flies Kiro out and home, casts the magic, takes the card and hands over the map and manual, in order;
// Skip Dialog does the same at once; without the card the fallback beat gives the map and manual; a return does not replay it.
// Spec: .kiro/specs/tensor-gpu-hub-ritual/ (requirements 2 to 8, 19, 20).
import fc from 'fast-check';
import { expect } from './kit.mjs';

const kinds = (events) => events.map((e) => (e.type === 'ACTOR_FLY_TO' ? `fly:${e.target}` : e.type === 'KIRO_ACTION' ? `kiro:${e.action}` : e.type === 'ITEM_GIVEN' ? `give:${e.item}` : null)).filter(Boolean);
const withCard = (s) => {
  s.inventory = { ...s.inventory, items: [...s.inventory.items, 'tensor_gpu'] };
  return s;
};
const ORDER = ['fly:dad.tty.sock', 'kiro:empower', 'give:map', 'give:manual', 'fly:home'];

export function ritualProps(world) {
  const hub = world.levels.findIndex((l) => (l.script?.triggers ?? []).some((t) => t.when.kind === 'has_item' && t.when.item === 'tensor_gpu' && t.steps.some((st) => st.kind === 'fly_to')));
  if (hub < 0) throw new Error('ritual suite: no level has a `has_item tensor_gpu` trigger with a `fly_to` step');
  const seed = fc.integer({ min: 1, max: 50 });
  /** Ticks until `n` seconds have passed, collecting the flight, magic and hand-over events with the tick they came at. */
  const play = (session, seconds) => {
    const seen = [];
    for (let t = 1; t <= seconds; t++) for (const k of kinds(session.tick().events)) seen.push([t, k]);
    return seen;
  };
  return [
    {
      name: 'the hub ritual with the Tensor GPU: Kiro flies to the old coder, the magic casts, the card is taken, then the map and manual come, and Kiro flies home, once each and in order',
      build: () =>
        fc.property(seed, (pid) => {
          const session = withCard(world.open(hub, pid));
          const seen = play(session, 110);
          expect(JSON.stringify(seen.map(([, k]) => k)) === JSON.stringify(ORDER), `the ritual happened as ${JSON.stringify(seen)}`);
          expect(seen[0][0] >= 15 && seen[1][0] > seen[0][0] + 10 && seen[2][0] > seen[1][0] + 20, `the beats are not spread over the dialogs: ${JSON.stringify(seen)}`);
          const inv = session.inventory;
          expect(!inv.items.includes('tensor_gpu') && inv.items.includes('map') && inv.items.includes('manual'), `inventory after the ritual: ${JSON.stringify(inv.items)}`);
        }),
    },
    {
      name: 'Skip Dialog in the middle of the hub ritual still flies Kiro, casts the magic, takes the card, gives the map and manual and sends Kiro home, in order, and nothing runs later',
      build: () =>
        fc.property(seed, fc.integer({ min: 0, max: 95 }), (pid, at) => {
          const session = withCard(world.open(hub, pid));
          const before = play(session, at).map(([, k]) => k);
          const skipped = session.skipOpeningDialog();
          const after = skipped ? kinds(skipped.events) : [];
          const later = play(session, 100).map(([, k]) => k);
          expect(JSON.stringify([...before, ...after, ...later]) === JSON.stringify(ORDER), `skip at ${at}: ${JSON.stringify({ before, after, later })}`);
          expect(!session.inventory.items.includes('tensor_gpu') && session.inventory.items.includes('map') && session.inventory.items.includes('manual'), 'the card or a gift is wrong after the skip');
        }),
    },
    {
      name: 'without the Tensor GPU the hub gives the map and manual in the fallback beat, with no flight and no magic; a return to the hub replays nothing and does not lock the terminal',
      build: () =>
        fc.property(seed, (pid) => {
          const session = world.open(hub, pid);
          const seen = play(session, 40).map(([, k]) => k);
          expect(JSON.stringify(seen) === JSON.stringify(['give:map', 'give:manual']), `the fallback gave ${JSON.stringify(seen)}`);
          session.jumpToLevel(world.levels[hub + 1].id);
          const back = session.jumpToLevel(world.levels[hub].id);
          expect(kinds(back.events).length === 0 && !back.snapshot.openingDialog, `a return replayed the hub opening: ${JSON.stringify(kinds(back.events))} lock ${back.snapshot.openingDialog}`);
          expect(play(session, 100).length === 0, 'a return replayed the ritual or the fallback');
        }),
    },
  ];
}
