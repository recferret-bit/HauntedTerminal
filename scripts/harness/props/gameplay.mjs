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
  const { validatePack } = await ctx.load('/src/chapters/validate-pack.ts');
  const { openLabSession } = await ctx.load('/src/terminal-lab/node-driver.ts');
  const { newLabScript } = await ctx.load('/src/terminal-lab/lab-pack.ts');
  const EXT = { energy: 'cell', ram: 'dimm', ssd: 'img' };
  /** The levels that ask for a Kiro core (the hubs), each with the rule that names it. */
  // `script.kiro.coreAliases` lists cores a level accepts for the wanted one (hub 3 accepts mistral for llama): data, not a bug.
  const hubs = world.levels
    .map((l, index) => ({ index, rule: l.winRules.find((r) => r.kind === 'kiro_loaded'), aliases: l.script?.kiro?.coreAliases ?? {} }))
    .filter((h) => h.rule);

  /** Levels with a lantern pickup, and the file name that `mv <name> ~` takes. */
  const lanternLevels = world.levels
    .map((l, index) => ({ index, pickup: (l.pickups ?? []).find((p) => p.type === 'lantern') }))
    .filter((l) => l.pickup)
    .map((l) => ({ index: l.index, name: l.pickup.path.split('/').pop() }));
  const itemId = fc.constantFrom(...inv.ITEM_IDS);

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

  const actionsOf = (r) => r.events.filter((x) => x.type === 'VIBECODER_ACTION');
  /** The lines that always exit non-zero on level 1: a refused lock (`ls` before the lantern), a wrong riddle answer, an unknown command, a syntax error. */
  const FAILING = ['ls', 'echo wrong > dad.tty.sock', 'frobnicate --now', 'echo "unterminated', 'ls | | cat'];

  return [
    {
      // Spec: .kiro/specs/terminal-command-animations/. The stage tints a failed command red from this one field.
      name: 'every VIBECODER_ACTION of a command carries failed:true exactly when the command exits non-zero',
      build: () =>
        fc.property(deepPlay, ([levelIdx, steps]) => {
          let nonZero = 0;
          const check = (_s, _b, r, step) => {
            if (typeof step !== 'string') return;
            const failed = r.code !== undefined && r.code !== 0;
            if (failed) nonZero += 1;
            for (const e of actionsOf(r)) {
              if (failed) expect(e.failed === true, `exit ${r.code} on ${JSON.stringify(step)}: action ${e.action} not marked failed`);
              else expect(!('failed' in e), `exit ${r.code} on ${JSON.stringify(step)}: action ${e.action} has a failed field`);
            }
          };
          watch(levelIdx, [...FAILING, ...steps], check);
          expect(nonZero > 0, 'no command exited non-zero, so the property proved nothing');
        }),
    },
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
      // Found by QA (full-main finding 1): the ended room kept the floor theme, so the stats HUD read `FL 5 /11` after a full run.
      name: 'the room floor is the level index in every snapshot, also on the ended (stats) room',
      build: () =>
        fc.property(deepPlay, ([levelIdx, steps]) =>
          watch(levelIdx, steps, (s, _b, r) => {
            expect(r.snapshot.room.floor === s.rt.spec.index, `room.floor ${r.snapshot.room.floor} != level index ${s.rt.spec.index} (ended ${r.snapshot.ended})`);
          }),
        ),
    },
    {
      name: 'the chapter end: after the last level is solved and `exit` is typed, the ended room floor is that level index',
      check: () => {
        const last = world.levels.length - 1;
        const session = world.open(last);
        for (const c of world.levels[last].solutionCommands ?? []) session.exec(c);
        const snap = session.exec('exit').snapshot;
        expect(snap.ended, 'the last level did not end the chapter after its solution and `exit`');
        expect(snap.room.floor === session.rt.spec.index, `ended room.floor ${snap.room.floor} != level index ${session.rt.spec.index}`);
      },
    },
    {
      // Found by this property: hub 3 accepted `kiro load mistral` (a declared alias of llama) but its win rule only accepted llama,
      // so following the alias left the exit locked (fixed in session-rules.ts: the rule honours `coreAliases`).
      examples: [[2, 'mistral']],
      name: 'in a Kiro hub, a wrong or unknown core is refused and loads nothing; the wanted core (or a declared alias) satisfies the win rule',
      build: () =>
        fc.property(fc.constantFrom(...hubs.keys()), fc.constantFrom('qwen', 'mistral', 'deepseek', 'llama', 'codec-9', 'clod', ''), (h, core) => {
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
      name: 'the lantern pickup is idempotent: collecting it again (any way, any number of times) changes nothing',
      build: () =>
        fc.property(fc.constantFrom(...lanternLevels.keys()), fc.array(fc.constantFrom('mv', 'source', 'hold', 'tick'), { minLength: 1, maxLength: 6 }), (l, again) => {
          const { index, name } = lanternLevels[l];
          const session = world.open(index);
          const first = session.exec(`mv ${name} ~`);
          expect(first.events.filter((e) => e.type === 'PICKUP_COLLECTED' && e.item === 'lantern').length === 1, `\`mv ${name} ~\` did not collect the lantern exactly once`);
          const kept = JSON.stringify(session.snapshot().inventory);
          expect(session.snapshot().inventory.held === 'lantern' && kept.includes('"lantern"'), `the lantern is not held after collecting it: ${kept}`);
          for (const how of again) {
            const r = how === 'tick' ? session.tick() : session.exec(how === 'hold' ? 'hold lantern' : `${how} ${name}${how === 'mv' ? ' ~' : ''}`);
            expect(!r.events.some((e) => e.type === 'PICKUP_COLLECTED' && e.item === 'lantern'), `the lantern was collected again by ${how}`);
            expect(JSON.stringify(session.snapshot().inventory) === kept, `inventory changed from ${kept} to ${JSON.stringify(session.snapshot().inventory)} after ${how}`);
          }
        }),
    },
    {
      name: 'the inventory functions are idempotent: giving an owned item, or holding the held item, changes nothing',
      build: () =>
        fc.property(fc.array(fc.constantFrom(...inv.ITEM_IDS), { maxLength: 6 }), fc.constantFrom(...inv.ITEM_IDS), (start, id) => {
          const once = inv.giveItem(inv.starterInventory(start), id);
          expect(JSON.stringify(inv.giveItem(once, id)) === JSON.stringify(once), `giving ${id} twice changed ${JSON.stringify(once)}`);
          const held = inv.holdItem(once, id);
          expect(JSON.stringify(inv.holdItem(held, id)) === JSON.stringify(held), `holding ${id} twice changed ${JSON.stringify(held)}`);
        }),
    },
    {
      // The shipped chapter lists the terminal as a start item and the lantern as a grant; random lists put the same item in `startItems`
      // and in several grants, which is what a human can do in the editor.
      name: '`startItems` and `grants` never put an item in the inventory twice, and give exactly the union that applies',
      build: () =>
        fc.property(
          // `startItems: []` is left out on purpose: validatePack rejects it as an error (src/chapters/validate-pack.ts), so no
          // valid pack reaches the game with it. The next property pins that check.
          fc.option(fc.array(itemId, { minLength: 1, maxLength: 6 }), { nil: undefined }),
          fc.array(fc.record({ afterLevel: fc.integer({ min: 0, max: 4 }), items: fc.option(fc.array(itemId, { maxLength: 4 }), { nil: undefined }) }), { maxLength: 5 }),
          fc.nat(world.levels.length - 1),
          (startItems, grants, levelIdx) => {
            const session = world.openWith(levelIdx, (p) => {
              p.manifest.startItems = startItems;
              p.manifest.grants = grants;
            });
            const { items, held } = session.snapshot().inventory;
            expect(new Set(items).size === items.length, `an item is in the inventory twice: ${JSON.stringify(items)} (startItems ${JSON.stringify(startItems)}, grants ${JSON.stringify(grants)})`);
            expect(items.includes(held), `holds ${held}, owns ${JSON.stringify(items)}`);
            for (const id of startItems ?? []) expect(items.includes(id), `startItems ${id} is missing from ${JSON.stringify(items)}`);
            const allowed = new Set([...(startItems ?? ['lantern', 'terminal']), ...grants.flatMap((g) => g.items ?? [])]);
            expect(items.every((i) => allowed.has(i)), `an item nobody named appeared: ${JSON.stringify(items)}`);
          },
        ),
    },
    {
      // An empty `startItems` would leave `held: 'terminal'` with nothing owned, so the pack check refuses it.
      name: '`validatePack` rejects an empty `startItems` and accepts any non-empty list of known items',
      examples: [[[]]],
      build: () =>
        fc.property(fc.array(itemId, { maxLength: 6 }), (startItems) => {
          const pack = structuredClone(world.pack);
          pack.manifest.startItems = startItems;
          const hit = validatePack(pack, { winnable: false }).some((i) => i.severity === 'error' && i.message.startsWith('startItems:'));
          expect(hit === (startItems.length === 0), `startItems ${JSON.stringify(startItems)}: error reported = ${hit}`);
        }),
    },
    {
      name: 'starting at level 2 or later (a jump) the hero already holds the lantern the tutorial gives',
      examples: [[1], [world.levels.length - 1]],
      build: () =>
        fc.property(fc.integer({ min: 1, max: world.levels.length - 1 }), (levelIdx) => {
          const { items, held } = world.open(levelIdx).snapshot().inventory;
          expect(items.includes('lantern') && held === 'lantern', `a jump to level ${levelIdx + 1} holds ${held} and owns ${JSON.stringify(items)}`);
          expect(items.filter((i) => i === 'lantern').length === 1, `the lantern is in the inventory ${items.filter((i) => i === 'lantern').length} times`);
        }),
    },
    {
      name: 'every non-empty terminal command in play emits a VIBECODER_ACTION event',
      build: () =>
        fc.property(deepPlay, ([levelIdx, steps]) =>
          watch(levelIdx, steps, (_s, before, r, step) => {
            if (typeof step !== 'string' || !step.trim() || before.ended) return;
            expect(r.events.some((e) => e.type === 'VIBECODER_ACTION'), `no VIBECODER_ACTION emitted for ${JSON.stringify(step)}`);
          }),
        ),
    },
    // ---- turn-based battles (.kiro/specs/turn-based-battles/) ------------------------------------------------------
    {
      name: 'between calls a battle is idle, in its intro or in the player turn; the enemy turn never outlives its call',
      build: () =>
        fc.property(deepPlay, ([levelIdx, steps]) =>
          watch(levelIdx, steps, (_s, _b, r, step) => {
            const phase = r.snapshot.battle?.phase ?? 'idle';
            expect(['idle', 'intro', 'player'].includes(phase), `battle phase ${phase} after ${JSON.stringify(step)}`);
          }),
        ),
    },
    {
      name: 'an enemy hurts the hero only inside an enemy turn (no real-time damage)',
      build: () =>
        fc.property(deepPlay, ([levelIdx, steps]) =>
          watch(levelIdx, steps, (_s, _b, r, step) => {
            let acting = false;
            let enemyTurn = false;
            for (const e of r.events) {
              if (e.type === 'BATTLE_TURN' && e.actor === 'enemy') enemyTurn = true;
              if (e.type === 'ENEMY_ACTING') acting = true;
              if (e.type === 'PLAYER_DAMAGED' && acting) expect(enemyTurn, `enemy damage outside an enemy turn after ${JSON.stringify(step)}`);
            }
          }),
        ),
    },
    {
      name: 'the first turn of every battle is the player\'s, and an empty line never changes the battle',
      build: () =>
        fc.property(deepPlay, ([levelIdx, steps]) => {
          let waiting = false;
          watch(levelIdx, steps, (session, _b, r, step) => {
            for (const e of r.events) {
              if (e.type === 'BATTLE_STARTED') waiting = true;
              else if (e.type === 'BATTLE_ENDED') waiting = false;
              else if (e.type === 'BATTLE_TURN' && waiting) {
                expect(e.actor === 'player' && e.first, `first turn ${e.actor} (first=${e.first}) after ${JSON.stringify(step)}`);
                waiting = false;
              }
            }
            const before = JSON.stringify(session.snapshot().battle);
            expect(session.exec('').events.length === 0 && JSON.stringify(session.snapshot().battle) === before, 'an empty line changed the battle');
          });
        }),
    },
    {
      // A guard on the generators, not on the game: the properties above only mean something while random play reaches
      // kills, pickups and level changes. If a future solution or level change stops that, this fails first.
      name: 'random play still reaches the interesting states (kills, pickups, enemy attacks, battles, leaving a level)',
      check: () => {
        const seen = { killed: 0, picked: 0, attacks: 0, battles: 0, enemyTurns: 0, left: 0, runs: 0 };
        for (const [levelIdx, steps] of fc.sample(deepPlay, { seed: 20261117, numRuns: 100 })) {
          const session = world.open(levelIdx);
          const start = session.levelIdx;
          world.drive(session, steps, (r) => {
            for (const e of r.events) {
              if (e.type === 'ENEMY_KILLED') seen.killed++;
              if (e.type === 'PICKUP_COLLECTED') seen.picked++;
              if (e.type === 'ENEMY_ATTACK') seen.attacks++;
              if (e.type === 'BATTLE_STARTED') seen.battles++;
              if (e.type === 'BATTLE_TURN' && e.actor === 'enemy') seen.enemyTurns++;
            }
          });
          if (session.levelIdx > start) seen.left++;
          seen.runs++;
        }
        const need = { killed: 10, picked: 10, attacks: 5, battles: 5, enemyTurns: 10, left: 3 };
        const low = Object.entries(need).filter(([k, n]) => seen[k] < n).map(([k, n]) => `${k}: ${seen[k]} (need ${n})`);
        expect(low.length === 0, `random play over ${seen.runs} runs no longer reaches: ${low.join(', ')}`);
      },
    },
  ];
}
