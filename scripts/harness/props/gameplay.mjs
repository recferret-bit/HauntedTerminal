// Gameplay-element properties: HP, enemies, pickups, the inventory, exit gates and win rules, and Kiro cores, under random
// play on the real chapter levels (with part of each level's solution played first, so exits and kills happen).
// Spec: .kiro/specs/property-based-tests/.
import fc from 'fast-check';
import { expect } from './kit.mjs';
import { chapterWorld } from './sessions.mjs';

const COMPOUND = /&&|\|\||;|\n/;

export default async function gameplaySuite(ctx) {
  const world = await chapterWorld(ctx);
  const { allWinRulesMet, evalWinRule } = await ctx.load('/src/chapters/session-rules.ts');
  const inv = await ctx.load('/src/game/inventory.ts');
  const { openLabSession } = await ctx.load('/src/terminal-lab/node-driver.ts');
  const { newLabScript } = await ctx.load('/src/terminal-lab/lab-pack.ts');
  const EXT = { energy: 'cell', ram: 'dimm', ssd: 'img' };
  /** The levels that ask for a Kiro core (the hubs), each with the rule that names it. */
  // `script.kiro.coreAliases` lists cores a level accepts for the wanted one (hub 3 accepts mistral for llama): data, not a bug.
  const hubs = world.levels
    .map((l, index) => ({ index, rule: l.winRules.find((r) => r.kind === 'kiro_loaded'), aliases: l.script?.kiro?.coreAliases ?? {} }))
    .filter((h) => h.rule);

  /** A lab room with these pickups and the player at full HP: every heal lands on the cap. */
  const pickupRoom = (kinds, ram) => {
    const script = newLabScript('props-pickups');
    script.player.ram = ram;
    kinds.forEach((type, i) => script.setup.push({ op: 'pickup', id: `p${i}`, type, path: `/lab/p${i}.${EXT[type]}` }));
    return openLabSession(script);
  };

  /** A level, the first `k` commands of its own solution, then random play with ticks. */
  const deepPlay = fc.tuple(world.play, fc.nat()).map(([[levelIdx, steps], k]) => {
    const solution = world.levels[levelIdx].solutionCommands ?? [];
    return [levelIdx, [...solution.slice(0, k % (solution.length + 1)), ...steps]];
  });

  /** Plays `steps`, calling `check(session, before, result, step)`; `before` is what held before the step. */
  const watch = (levelIdx, steps, check) => {
    const session = world.open(levelIdx);
    const run = (step, exec) => {
      const before = { level: session.levelIdx, met: allWinRulesMet(session), ended: session.snapshot().ended, core: session.kiro.activeCore.id };
      check(session, before, exec(), step);
    };
    for (const s of steps) {
      if (session.snapshot().ended) break;
      if (typeof s === 'string') run(s, () => session.exec(s));
      else for (let i = 0; i < s.tick; i++) run(s, () => session.tick());
    }
  };

  /** Events that put a level back in its starting state, so its enemies and pickups may legitimately return. */
  const resets = (events) => events.some((e) => e.type === 'PLAYER_RESPAWNED' || e.type === 'FLOOR_ENTERED');

  return [
    {
      name: 'HP stays between 0 and max HP after every command and tick',
      build: () =>
        fc.property(deepPlay, ([levelIdx, steps]) =>
          watch(levelIdx, steps, (_s, _b, r, step) => {
            const { hp, maxHp } = r.snapshot;
            expect(Number.isFinite(hp) && hp >= 0 && hp <= maxHp, `hp ${hp}/${maxHp} after ${JSON.stringify(step)}`);
          }),
        ),
    },
    {
      // The session snapshot clamps HP on every command, so an unclamped overshoot is invisible from outside (probed: removing
      // the pickup cap does not change what a player sees). This guards what is observable: the HP in range after any pickup.
      name: 'collecting energy, RAM and SSD in any order (by `source` or `mv ~`) leaves HP between 0 and max HP',
      build: () =>
        fc.property(fc.array(fc.constantFrom('energy', 'ram', 'ssd'), { minLength: 1, maxLength: 6 }), fc.constantFrom(0, 16, 48), fc.array(fc.tuple(fc.nat(), fc.constantFrom('source', 'mv')), { maxLength: 8 }), (kinds, ram, picks) => {
          const session = pickupRoom(kinds, ram);
          for (const [i, how] of picks) {
            const k = i % kinds.length;
            const file = `p${k}.${EXT[kinds[k]]}`;
            const { hp, maxHp } = session.exec(how === 'mv' ? `mv ${file} ~` : `source ${file}`).snapshot;
            expect(hp >= 0 && hp <= maxHp, `hp ${hp}/${maxHp} after ${how} ${file}`);
          }
        }),
    },
    {
      name: 'a killed enemy neither attacks nor is hit again until something respawns it',
      build: () =>
        fc.property(deepPlay, ([levelIdx, steps]) => {
          const dead = new Set();
          watch(levelIdx, steps, (_s, _b, r, step) => {
            if (resets(r.events)) dead.clear();
            for (const e of r.events) {
              if (e.type === 'ENTITY_SPAWNED') dead.delete(e.entityId);
              if ((e.type === 'ENEMY_ATTACK' || e.type === 'ENEMY_HIT') && dead.has(e.entityId)) throw new Error(`dead ${e.entityId} got ${e.type} on ${JSON.stringify(step)}`);
              if (e.type === 'ENEMY_KILLED') dead.add(e.entityId);
            }
          });
        }),
    },
    {
      name: 'a pickup is collected at most once per visit of its level',
      build: () =>
        fc.property(deepPlay, ([levelIdx, steps]) => {
          const taken = new Set();
          watch(levelIdx, steps, (_s, _b, r, step) => {
            if (resets(r.events)) taken.clear();
            for (const e of r.events.filter((x) => x.type === 'PICKUP_COLLECTED')) {
              expect(!taken.has(e.entityId), `${e.entityId} collected twice, again on ${JSON.stringify(step)}`);
              taken.add(e.entityId);
            }
          });
        }),
    },
    {
      name: 'the inventory holds only what it was given, once each, and `hold` only takes an owned item',
      build: () =>
        fc.property(fc.array(fc.tuple(fc.constantFrom('give', 'hold', 'cmd'), fc.constantFrom(...inv.ITEM_IDS, 'sword', '', 'LAPTOP')), { maxLength: 30 }), (ops) => {
          let state = inv.starterInventory();
          const given = new Set(state.items);
          for (const [op, id] of ops) {
            const before = state;
            if (op === 'give' && inv.isItemId(id)) (state = inv.giveItem(state, id)), given.add(id);
            else if (op === 'hold' && inv.isItemId(id)) state = inv.holdItem(state, id);
            else if (op === 'cmd') state = inv.inventoryCommand(state, 'hold', id ? [id] : []).inv;
            expect(state.items.every((i) => given.has(i)) && new Set(state.items).size === state.items.length, `items ${state.items} after ${op} ${id}`);
            expect(state.items.includes(state.held), `holds ${state.held}, owns ${state.items}`);
            if (!before.items.includes(id)) expect(state.held === before.held, `hold ${JSON.stringify(id)} changed the held item without owning it`);
          }
        }),
    },
    {
      name: 'in play, the hero always holds an item he owns',
      build: () =>
        fc.property(deepPlay, ([levelIdx, steps]) =>
          watch(levelIdx, steps, (s, _b, _r, step) => {
            expect(s.inventory.items.includes(s.inventory.held), `holds ${s.inventory.held}, owns ${s.inventory.items} after ${JSON.stringify(step)}`);
          }),
        ),
    },
    {
      name: 'a level is left, or the chapter ends, only when its win rules hold',
      build: () =>
        fc.property(deepPlay, ([levelIdx, steps]) =>
          watch(levelIdx, steps, (s, before, r, step) => {
            // A compound line can finish the last objective and leave in one go; single commands are checked exactly.
            if (typeof step !== 'string' || COMPOUND.test(step)) return;
            const left = s.levelIdx > before.level || (r.snapshot.ended && !before.ended);
            const respawned = r.events.some((e) => e.type === 'PLAYER_RESPAWNED');
            if (left && !respawned) expect(before.met, `left level ${before.level} with open objectives via ${JSON.stringify(step)}`);
          }),
        ),
    },
    {
      // Found by this property: hub 3 accepted `kiro load mistral` (a declared alias of llama) but its win rule only accepted llama,
      // so following the alias left the exit locked (fixed in session-rules.ts: the rule honours `coreAliases`).
      examples: [[2, 'mistral']],
      name: 'in a Kiro hub, a wrong or unknown core is refused and loads nothing; the wanted core (or a declared alias) satisfies the win rule',
      build: () =>
        fc.property(fc.constantFrom(...hubs.keys()), fc.constantFrom('qwen', 'mistral', 'deepseek', 'llama', 'gpt-9', 'claude', ''), (h, core) => {
          const { index, rule, aliases } = hubs[h];
          const accepted = [rule.core, ...(aliases[rule.core] ?? [])];
          const session = world.open(index);
          const before = session.kiro.activeCore.id;
          const r = session.exec(`kiro load ${core}`.trim());
          if (accepted.includes(core)) {
            expect((r.code ?? 0) === 0, `level ${index}: loading the wanted core ${core} failed: ${JSON.stringify(r.output).slice(0, 120)}`);
            expect(session.rt.loadedCores.has(core), `level ${index}: ${core} is not in loadedCores after a good load`);
            expect(evalWinRule(session, rule), `level ${index}: the kiro_loaded rule is not met after loading ${core}`);
          } else {
            expect((r.code ?? 0) !== 0, `level ${index} wants ${accepted.join(' or ')}, but \`kiro load ${core}\` succeeded`);
            expect(session.kiro.activeCore.id === before, `level ${index}: \`kiro load ${core}\` failed but the core went ${before} -> ${session.kiro.activeCore.id}`);
            expect(!session.rt.loadedCores.has(core), `level ${index}: ${core} was recorded as loaded though refused`);
            expect(!evalWinRule(session, rule), `level ${index}: the kiro_loaded rule is met by ${core} (wants ${accepted.join(' or ')})`);
          }
        }),
    },
    {
      // A guard on the generators, not on the game: the properties above only mean something while random play reaches
      // kills, pickups and level changes. If a future solution or level change stops that, this fails first.
      name: 'random play still reaches the interesting states (kills, pickups, enemy attacks, leaving a level)',
      check: () => {
        const seen = { killed: 0, picked: 0, attacks: 0, left: 0, runs: 0 };
        for (const [levelIdx, steps] of fc.sample(deepPlay, { seed: 20261117, numRuns: 100 })) {
          const session = world.open(levelIdx);
          const start = session.levelIdx;
          world.drive(session, steps, (r) => {
            for (const e of r.events) {
              if (e.type === 'ENEMY_KILLED') seen.killed++;
              if (e.type === 'PICKUP_COLLECTED') seen.picked++;
              if (e.type === 'ENEMY_ATTACK') seen.attacks++;
            }
          });
          if (session.levelIdx > start) seen.left++;
          seen.runs++;
        }
        const need = { killed: 10, picked: 10, attacks: 5, left: 3 };
        const low = Object.entries(need).filter(([k, n]) => seen[k] < n).map(([k, n]) => `${k}: ${seen[k]} (need ${n})`);
        expect(low.length === 0, `random play over ${seen.runs} runs no longer reaches: ${low.join(', ')}`);
      },
    },
  ];
}
