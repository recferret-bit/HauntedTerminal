// `generate: tree`, `tree` and `grep -r`: a seeded decoy tree has at least the asked folders and the same shape for the same
// seed, and a file hidden deep in it is found by `find`, `tree`, `grep -r` (and the dot-file view stays behind the lantern lock).
// Spec: .kiro/specs/tensor-gpu-hub-ritual/ (requirements 13, 17).
import fc from 'fast-check';
import { expect } from './kit.mjs';

const text = (r) => `${r.output ?? ''}\n${r.stderr ?? ''}`;
const TARGET = '/srv/decoy/clue/vault/.stash/vram.mod';

export async function treeSearchProps(ctx, world) {
  const { growTree } = await ctx.load('/src/chapters/tree-gen.ts');
  const { makeRoot, walk } = await ctx.load('/src/game/tree.ts');
  const shape = (gen) => {
    const root = makeRoot();
    growTree(root, gen);
    const names = [];
    walk(root, (n) => names.push(`${n.kind}:${n.name}:${n.parent ? n.parent.name : ''}`));
    return { names, dirs: names.filter((n) => n.startsWith('dir:')).length, dots: names.filter((n) => n.startsWith('file:.')).length };
  };
  const gen = fc.record({ kind: fc.constant('tree'), root: fc.constant('/srv/decoy'), folders: fc.integer({ min: 100, max: 160 }), hiddenFiles: fc.integer({ min: 0, max: 40 }), seed: fc.string({ minLength: 1, maxLength: 8 }) });
  const withTree = (g) => (pack) => {
    const level = pack.levels[0];
    level.generate = [g];
    level.files.push({ path: TARGET, kind: 'file', content: 'NEEDLE-VRAM\n' });
  };
  // The chapter's own VRAM modules (data: every level that places one), whichever levels those are.
  const hunts = world.levels.map((level, index) => ({ level, index, pick: level.pickups.find((p) => p.type === 'vram_module') })).filter((h) => h.pick);
  return [
    {
      name: 'every VRAM module of the chapter hides in a 100+ folder tree and is found by find, grep -r and tree -a, reached with plain cd, and taken with mv',
      build: () =>
        fc.property(fc.constantFrom(...hunts.keys()), (h) => {
          const { level, index, pick } = hunts[h];
          const gen = (level.generate ?? []).find((g) => pick.path.startsWith(`${g.root}/`));
          expect(gen !== undefined && gen.folders >= 100 && gen.hiddenFiles > 0, `${level.id}: the module is not inside a generated tree of 100+ folders with hidden files`);
          const session = world.open(index);
          const dir = pick.path.slice(0, pick.path.lastIndexOf('/'));
          expect(text(session.exec('find / -name vram.mod')).includes(pick.path), `${level.id}: find missed ${pick.path}`);
          const grep = session.exec(`grep -r -e . ${gen.root}`);
          expect(text(grep).includes(`${pick.path}:`), `${level.id}: grep -r missed the module file`);
          expect(!text(session.exec(`tree ${gen.root}`)).includes('vram.mod'), `${level.id}: plain tree shows the module in a dot folder`);
          session.inventory = { ...session.inventory, items: [...session.inventory.items, 'tube_transistor'] };
          expect(text(session.exec(`tree -a ${gen.root}`)).includes('vram.mod'), `${level.id}: tree -a missed the module`);
          expect(session.exec(`cd ${dir}`).code === 0, `${level.id}: cd ${dir} failed`);
          const before = session.inventory.vram;
          expect(session.exec('mv vram.mod ~').code === 0, `${level.id}: mv vram.mod ~ failed`);
          expect(session.inventory.vram === before + 1 && session.inventory.taken.includes(`${level.id}:${pick.id}`), `${level.id}: the module did not become a charge`);
        }),
    },
    {
      name: 'a generated tree has at least the asked folders, only the asked dot files at most, and is the same for the same seed',
      build: () =>
        fc.property(gen, (g) => {
          const a = shape(g);
          const b = shape(g);
          expect(JSON.stringify(a.names) === JSON.stringify(b.names), `seed ${g.seed} built two different trees`);
          expect(a.dirs >= g.folders, `${a.dirs} directories for ${g.folders} asked (the root counts too)`);
          expect(a.dots <= g.hiddenFiles, `${a.dots} dot files for ${g.hiddenFiles} asked`);
        }),
    },
    {
      name: 'a file hidden deep in a 100+ folder tree is found by find, tree and grep -r; `tree -a` and `ls -a` stay locked before the Tube Transistor',
      build: () =>
        fc.property(gen, (g) => {
          const session = world.openWith(0, withTree(g));
          expect(text(session.exec('find / -name vram.mod')).includes(TARGET), 'find did not list the module');
          const tree = text(session.exec('tree /srv/decoy'));
          expect(/\d+ directories, \d+ files?/.test(tree) && !tree.includes('vram.mod'), 'tree showed the dot directory without -a');
          const deep = text(session.exec('tree -a /srv/decoy/clue'));
          expect(/not|requires/i.test(deep) && !deep.includes('vram.mod'), `tree -a was not refused before the lantern: ${deep.slice(0, 120)}`);
          const grep = session.exec('grep -r NEEDLE /srv/decoy');
          expect(grep.code === 0 && text(grep).includes(`${'/srv/decoy'}/clue/vault/.stash/vram.mod:NEEDLE-VRAM`), `grep -r missed the module: ${text(grep).slice(0, 160)}`);
          expect(text(session.exec('grep -r NEEDLE /srv/decoy/clue')).includes('vram.mod'), 'grep -r with a sub path missed the module');
          expect(session.exec('ls -a /srv/decoy').code !== 0, 'ls -a was not refused before the lantern');
        }),
    },
  ];
}
