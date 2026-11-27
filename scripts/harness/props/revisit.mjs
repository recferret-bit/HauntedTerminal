// The revisit rule: a map deploy to a level already reached keeps the run (inventory, Kiro, RAM, SSD, HP, VRAM), a pickup he took
// never comes back on a return (and does after `restart-level`), and a deploy beyond the highest level reached still starts
// from the chapter's grants. Spec: .kiro/specs/tensor-gpu-hub-ritual/ (requirement 20).
import fc from 'fast-check';
import { expect } from './kit.mjs';

const EXT = { energy: 'cell', ram: 'dimm', ssd: 'img' };

export function revisitProps(world) {
  const extra = (type) => (pack) => {
    const level = pack.levels[1];
    const path = `${level.cwd}/spare_${type}.${EXT[type]}`;
    level.files.push({ path, kind: 'file', content: 'x\n' });
    level.pickups.push({ id: 'p_spare', type, path });
  };
  const run = (s) => JSON.stringify({ items: s.inventory.items, held: s.inventory.held, vram: s.inventory.vram, ram: s.snapshot().ram, ssd: s.snapshot().ssd, core: s.kiro.activeCore.id });
  return [
    {
      name: 'a deploy to a level already reached keeps the run; a pickup taken stays gone on a return, comes back with restart-level only when taken after the entry',
      build: () =>
        fc.property(fc.constantFrom('energy', 'ram', 'ssd'), fc.integer({ min: 0, max: 3 }), (type, vram) => {
          const session = world.openWith(0, extra(type));
          const [first, second] = world.levels;
          session.jumpToLevel(second.id); // beyond the highest level reached: starts from the grants
          session.inventory = { ...session.inventory, vram };
          const file = `spare_${type}.${EXT[type]}`;
          const taken = session.exec(`mv ${file} ~`);
          expect(taken.code === 0, `could not take the pickup: ${JSON.stringify(taken.output)}`);
          expect(session.inventory.taken.includes(`${second.id}:p_spare`), 'the pickup was not recorded as taken');
          session.exec('restart-level');
          session.exec('restart-level --yes');
          expect(session.rt.world.pickups.some((p) => p.id === 'p_spare') && !session.inventory.taken.includes(`${second.id}:p_spare`), 'restart-level did not bring back a pickup taken after the level was entered');
          expect(session.exec(`mv ${file} ~`).code === 0, 'could not take the pickup again after restart-level');
          const before = run(session);
          session.jumpToLevel(first.id); // a return: keeps the run
          expect(run(session) === before, `a return changed the run: ${before} -> ${run(session)}`);
          session.jumpToLevel(second.id);
          expect(run(session) === before, `a second return changed the run: ${before} -> ${run(session)}`);
          expect(session.inventory.taken.includes(`${second.id}:p_spare`), 'the taken record was lost on a return');
          expect(!session.rt.world.pickups.some((p) => p.id === 'p_spare'), 'the pickup came back on a return (world)');
          expect(!session.exec(`ls ${second.cwd}`).output.includes(file), 'the pickup file came back on a return (tree)');
          session.exec('restart-level');
          session.exec('restart-level --yes');
          expect(!session.rt.world.pickups.some((p) => p.id === 'p_spare'), 'restart-level brought back a pickup taken before this entry');
        }),
    },
    {
      name: 'a deploy beyond the highest level reached starts from the chapter grants (the inventory is rebuilt, not kept)',
      build: () =>
        fc.property(fc.constantFrom(...world.levels.keys()), (target) => {
          const session = world.open(0);
          session.inventory = { ...session.inventory, vram: 5 };
          session.jumpToLevel(world.levels[target].id);
          const fresh = world.open(target);
          expect(session.inventory.vram === (target > 0 ? 0 : 5), `vram ${session.inventory.vram} after a first deploy to level index ${target}`);
          expect(JSON.stringify(session.inventory.items.slice().sort()) === JSON.stringify(fresh.inventory.items.slice().sort()), `items after the deploy to ${target} differ from a direct entry`);
        }),
    },
  ];
}
