// Gameplay-element properties: HP, enemies, pickups, the inventory, exit gates and win rules, and Kiro cores, under random
// play on the real chapter levels (with part of each level's solution played first, so exits and kills happen).
// Spec: .kiro/specs/property-based-tests/.
import fc from 'fast-check';
import { expect } from './kit.mjs';
import { chapterWorld } from './sessions.mjs';

const COMPOUND = /&&|\|\||;|\n/;
/** Seconds of a player turn, as the glossary states it (Turn timer); deliberately not `TURN_SEC` from battle.ts. */
const TURN = 30;

export default async function gameplaySuite(ctx) {
  const world = await chapterWorld(ctx);
  const { allWinRulesMet, evalWinRule } = await ctx.load('/src/chapters/session-rules.ts');
  const inv = await ctx.load('/src/game/inventory.ts');
  const { validatePack } = await ctx.load('/src/chapters/validate-pack.ts');
  const { openLabSession } = await ctx.load('/src/terminal-lab/node-driver.ts');
  const { newLabScript } = await ctx.load('/src/terminal-lab/lab-pack.ts');
  const { PLAY_PHASE_TRANSITIONS, createPlayLifecycle } = await ctx.load('/src/play/lifecycle.ts');
  const { KiroCompanion } = await ctx.load('/src/game/kiro.ts');
  const { AgentDirector } = await ctx.load('/src/game/agents.ts');
  const { nextMachineState, reachableStates } = await ctx.load('/src/contracts/state-machine.ts');
  const {
    BATTLE_TRANSITIONS,
    BIG_FOUR,
    INTRO_SEC,
    TURN_SEC,
    afterEnemyTurn,
    battleView,
    beginBattle,
    clockSecond,
    createBattle,
    endBattle,
    setHold,
    skipIntro,
    startEnemyTurn,
  } = await ctx.load('/src/game/battle.ts');
  const { createAppBus, publishKernel } = await ctx.load('/src/contracts/app-bus.ts');
  const { createPlayBus } = await ctx.load('/src/play/events.ts');
  const EXT = { energy: 'cell', ram: 'dimm', ssd: 'img' };
  /** The levels that ask for a Kiro core (the hubs), each with the rule that names it. */
  // `script.kiro.coreAliases` lists cores a level accepts for the wanted one (hub 3 accepts mistral for llama): data, not a bug.
  const hubs = world.levels
    .map((l, index) => ({ index, rule: l.winRules.find((r) => r.kind === 'kiro_loaded'), aliases: l.script?.kiro?.coreAliases ?? {} }))
    .filter((h) => h.rule);
  // The hub the mistral-alias bug was found on is the one that declares mistral as an alias (a position would drift if hubs move).
  const mistralHub = hubs.findIndex((h) => Object.values(h.aliases).some((a) => a.includes('mistral')));
  if (mistralHub < 0) throw new Error('gameplay suite: no Kiro hub declares `mistral` in `script.kiro.coreAliases`; the alias regression example needs one (update the example if the chapter changed)');
  /** The first level index (0-based start index) from which a jump is granted `item`: the smallest `afterLevel` naming it. */
  const grantedFrom = (item) => {
    const at = (world.pack.manifest.grants ?? []).filter((g) => (g.items ?? []).includes(item)).map((g) => g.afterLevel);
    if (!at.length) throw new Error(`gameplay suite: no manifest grant gives \`${item}\`; the jump-grant property needs one`);
    return Math.min(...at);
  };
  const lanternFrom = grantedFrom('lantern');
  const laptopFrom = grantedFrom('laptop');

  const pickupLevelsOf = (type) =>
    world.levels
      .map((l, index) => ({ index, pickup: (l.pickups ?? []).find((p) => p.type === type) }))
      .filter((l) => l.pickup)
      .map((l) => ({ index: l.index, name: l.pickup.path.split('/').pop() }));
  const pickupIdempotentProp = (type, list) => ({
    name: `the ${type} pickup is idempotent: collecting it again (any way, any number of times) changes nothing`,
    build: () =>
      fc.property(fc.constantFrom(...list.keys()), fc.array(fc.constantFrom('mv', 'source', 'hold', 'tick'), { minLength: 1, maxLength: 6 }), (l, again) => {
        const { index, name } = list[l];
        const session = world.open(index);
        const first = session.exec(`mv ${name} ~`);
        expect(first.events.filter((e) => e.type === 'PICKUP_COLLECTED' && e.item === type).length === 1, `\`mv ${name} ~\` did not collect ${type} exactly once`);
        const kept = JSON.stringify(session.snapshot().inventory);
        expect(session.snapshot().inventory.held === type && kept.includes(`"${type}"`), `${type} is not held after collecting it: ${kept}`);
        for (const how of again) {
          const r = how === 'tick' ? session.tick() : session.exec(how === 'hold' ? `hold ${type}` : `${how} ${name}${how === 'mv' ? ' ~' : ''}`);
          expect(!r.events.some((e) => e.type === 'PICKUP_COLLECTED' && e.item === type), `${type} was collected again by ${how}`);
          expect(JSON.stringify(session.snapshot().inventory) === kept, `inventory changed from ${kept} to ${JSON.stringify(session.snapshot().inventory)} after ${how}`);
        }
      }),
  });
  const lanternLevels = pickupLevelsOf('lantern');
  const laptopLevels = pickupLevelsOf('laptop');
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
  /** The lines that always exit non-zero on every level: a wrong riddle answer, an unknown command, a syntax error. */
  const FAILING = ['echo wrong > dad.tty.sock', 'frobnicate --now', 'echo "unterminated', 'ls | | cat'];

  /** A level, its own solution played until a battle intro starts, then the intro skipped (Enter): the first player turn. Null if none. */
  const battleAt = (levelIdx) => {
    const session = world.open(levelIdx);
    for (const c of world.levels[levelIdx].solutionCommands ?? []) {
      if (session.snapshot().battle?.phase === 'intro' || session.levelIdx !== levelIdx) break;
      session.exec(c);
    }
    if (session.levelIdx !== levelIdx || session.snapshot().battle?.phase !== 'intro') return null;
    session.skipBattleIntro();
    return session.snapshot().battle?.phase === 'player' ? session : null;
  };
  const battleLevels = world.levels.map((_, i) => i).filter((i) => battleAt(i));
  if (battleLevels.length === 0) throw new Error('props: no level reaches a battle through its solution, so the turn timer property has nothing to drive');

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
            if (op === 'give' && inv.isItemId(id)) {
              state = inv.giveItem(state, id);
              given.add(id);
            } else if (op === 'hold' && inv.isItemId(id)) state = inv.holdItem(state, id);
            else if (op === 'cmd') state = inv.inventoryCommand(state, 'hold', id ? [id] : []).inv;
            expect(state.items.every((i) => given.has(i)) && new Set(state.items).size === state.items.length, `items ${state.items} after ${op} ${id}`);
            expect(state.held === null || state.items.includes(state.held), `holds ${state.held}, owns ${state.items}`);
            if (!before.items.includes(id)) expect(state.held === before.held, `hold ${JSON.stringify(id)} changed the held item without owning it`);
          }
        }),
    },
    {
      name: 'in play, the hero always holds an item he owns',
      build: () =>
        fc.property(deepPlay, ([levelIdx, steps]) =>
          watch(levelIdx, steps, (s, _b, _r, step) => {
            const h = s.inventory.held;
            expect(h === null || s.inventory.items.includes(h), `holds ${h}, owns ${s.inventory.items} after ${JSON.stringify(step)}`);
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
      examples: [[mistralHub, 'mistral']],
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
    pickupIdempotentProp('lantern', lanternLevels),
    pickupIdempotentProp('laptop', laptopLevels),
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
            expect(held === null || items.includes(held), `holds ${held}, owns ${JSON.stringify(items)}`);
            const wantHeld = items.includes('lantern') ? 'lantern' : items.includes('terminal') ? 'terminal' : null;
            expect(held === wantHeld, `holds ${held}, expected ${wantHeld} from ${JSON.stringify(items)}`);
            for (const id of startItems ?? []) expect(items.includes(id), `startItems ${id} is missing from ${JSON.stringify(items)}`);
            const allowed = new Set([...(startItems ?? inv.starterInventory().items), ...grants.flatMap((g) => g.items ?? [])]);
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
      // The thresholds come from the manifest's grants (`afterLevel`), so the examples sit on both sides of each one.
      name: 'starting at a later level (a jump) grants only the tools already unlocked up to that level',
      examples: [...new Set([1, lanternFrom - 1, lanternFrom, laptopFrom - 1, laptopFrom, world.levels.length - 1])].filter((i) => i >= 1 && i < world.levels.length).map((i) => [i]),
      build: () =>
        fc.property(fc.integer({ min: 1, max: world.levels.length - 1 }), (levelIdx) => {
          const { items, held } = world.open(levelIdx).snapshot().inventory;
          expect(items.includes('terminal'), `a jump to level ${levelIdx + 1} does not carry the terminal: ${JSON.stringify(items)}`);
          if (levelIdx < lanternFrom) {
            expect(!items.includes('lantern') && held === 'terminal', `a jump to level ${levelIdx + 1} holds ${held} and owns ${JSON.stringify(items)}`);
          } else {
            expect(items.includes('lantern') && held === 'lantern', `a jump to level ${levelIdx + 1} holds ${held} and owns ${JSON.stringify(items)}`);
            expect(items.filter((i) => i === 'lantern').length === 1, `the lantern is in the inventory ${items.filter((i) => i === 'lantern').length} times`);
          }
          expect(items.includes('laptop') === (levelIdx >= laptopFrom), `laptop grant mismatch at level ${levelIdx + 1}: ${JSON.stringify(items)}`);
        }),
    },
    {
      // Spec: .kiro/specs/tutorial-kiro-delivers-terminal/. Level 1 starts with empty hands; Kiro carries the terminal in.
      name: 'level 1 without commands: shout, Kiro spawns, carries the terminal, gives it (held), and the inventory then holds it',
      check: () => {
        const session = world.open(0);
        const start = session.snapshot().inventory;
        expect(start.held === null && !start.items.includes('terminal'), `level 1 starts with held ${start.held}, items ${JSON.stringify(start.items)}`);
        const seq = [];
        // The script's timing is data (`script.timed`), so tick until Kiro has given it rather than for a fixed time.
        let seconds = 0;
        while (seconds < 300 && !seq.includes('given')) {
          seconds++;
          for (const e of session.tick().events) {
            if (e.type === 'VIBECODER_EMOTE' && e.emote === 'shout') seq.push('shout');
            else if (e.type === 'ENTITY_SPAWNED' && e.entityId === 'kiro') seq.push('spawn');
            else if (e.type === 'ITEM_CARRIED' && e.item === 'terminal') seq.push('carried');
            else if (e.type === 'ITEM_GIVEN' && e.item === 'terminal' && e.held === true) seq.push('given');
          }
        }
        expect(seq.join() === 'shout,spawn,carried,given', `event order ${seq.join()}`);
        const end = session.snapshot().inventory;
        expect(end.held === 'terminal' && end.items.includes('terminal'), `after ${seconds} s he holds ${end.held}, owns ${JSON.stringify(end.items)}`);
      },
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
      // The rule as written in the glossary (Turn timer), not read from battle.ts, so a changed TURN_SEC fails here.
      name: 'turn timer: a player turn starts at 30 s, each unheld tick takes 1 s off, the runout is exactly one enemy turn (timeout) and the next turn starts at 30; a hold (editor, laptop) freezes it',
      examples: battleLevels.map((i) => [i, [{ tick: TURN + 1 }]]).concat(battleLevels.slice(0, 1).map((i) => [i, [{ tick: 10 }, 'hold:editor', { tick: TURN + 5 }, 'hold:laptop', 'free:editor', { tick: 3 }, 'free:laptop', { tick: TURN }]])),
      build: () =>
        fc.property(
          fc.constantFrom(...battleLevels),
          fc.array(fc.oneof(fc.integer({ min: 1, max: TURN + 5 }).map((tick) => ({ tick })), fc.constantFrom('hold:editor', 'hold:laptop', 'free:editor', 'free:laptop')), { maxLength: 10 }),
          (i, steps) => {
            const session = battleAt(i);
            expect(session.snapshot().battle.secondsLeft === TURN, `level ${i}: the first player turn starts at ${session.snapshot().battle.secondsLeft} s, not ${TURN}`);
            const holds = new Set();
            for (const step of steps) {
              if (typeof step === 'string') {
                const [op, hold] = step.split(':');
                session.holdTurnTimer(hold, op === 'hold');
                if (op === 'hold') holds.add(hold);
                else holds.delete(hold);
                continue;
              }
              for (let t = 0; t < step.tick; t++) {
                const before = session.snapshot().battle;
                if (before?.phase !== 'player') return; // the battle ended (cleared, respawn): the timer has nothing left to model
                const r = session.tick();
                const enemyTurns = r.events.filter((e) => e.type === 'BATTLE_TURN' && e.actor === 'enemy');
                const after = session.snapshot().battle;
                const at = `level ${i}, ${before.secondsLeft} s left, holds [${[...holds]}]`;
                expect(before.held === holds.size > 0, `${at}: the snapshot says held=${before.held}`);
                if (holds.size > 0 || before.secondsLeft > 1) {
                  expect(enemyTurns.length === 0, `${at}: a tick ran ${enemyTurns.length} enemy turn(s)`);
                  const want = holds.size > 0 ? before.secondsLeft : before.secondsLeft - 1;
                  expect(after?.phase === 'player' && after.secondsLeft === want, `${at}: a tick left ${after?.phase} with ${after?.secondsLeft} s, want ${want}`);
                } else {
                  expect(enemyTurns.length === 1 && enemyTurns[0].reason === 'timeout', `${at}: the runout ran ${JSON.stringify(enemyTurns.map((e) => e.reason))}, want one 'timeout' enemy turn`);
                  if (after?.phase === 'player') expect(after.secondsLeft === TURN, `${at}: the next player turn starts at ${after.secondsLeft} s, not ${TURN}`);
                }
              }
            }
          },
        ),
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
    {
      name: 'PlayLifecycle FSM obeys its transition table and derived pause/overlay gates under arbitrary actions',
      examples: [[false, ['send:ENTER_INTRO', 'send:BEGIN_PLAY', 'add:hidden', 'del:intro', 'send:BEGIN_ENDING']]],
      build: () =>
        fc.property(
          fc.boolean(),
          fc.array(
            fc.oneof(
              fc.constantFrom('ENTER_INTRO', 'BEGIN_PLAY', 'BEGIN_ENDING', 'FINISH_OUTRO', 'PLAY_AGAIN', 'SWAP_LAB').map((e) => `send:${e}`),
              fc.constantFrom('intro', 'card', 'outro', 'ended', 'cinematic', 'hidden', 'reveal').map((r) => `add:${r}`),
              fc.constantFrom('intro', 'card', 'outro', 'ended', 'cinematic', 'hidden', 'reveal').map((r) => `del:${r}`),
            ),
            { maxLength: 24 },
          ),
          (initHidden, ops) => {
            const reached = reachableStates(PLAY_PHASE_TRANSITIONS, 'boot');
            const lc = createPlayLifecycle(initHidden);
            let model = 'boot';
            const reasons = new Set(initHidden ? ['intro', 'hidden'] : ['intro']);
            for (const op of ops) {
              const [kind, arg] = op.split(':');
              if (kind === 'send') {
                const wantNext = nextMachineState(PLAY_PHASE_TRANSITIONS, model, arg);
                const ok = lc.send(arg);
                expect(ok === (wantNext !== null), `send(${arg}) returned ${ok} from ${model}`);
                if (wantNext !== null) model = wantNext;
              } else if (kind === 'add') {
                lc.addReason(arg);
                reasons.add(arg);
              } else {
                lc.deleteReason(arg);
                reasons.delete(arg);
              }
              expect(lc.phase() === model && reached.has(lc.phase()), `phase mismatch: ${lc.phase()} vs ${model}`);
              const derived = lc.derive({ manualOpen: false, mapOpen: false });
              expect(derived.clockPaused === (reasons.size > 0), 'clockPaused disagrees with pause reasons');
              const nonHidden = [...reasons].some((r) => r !== 'hidden');
              expect(derived.shellBlocked === nonHidden, 'hidden alone must never block the terminal');
            }
          },
        ),
    },
    {
      name: 'KiroCompanion crack FSM maintains activeCrack/idle consistency, aborts on room change, and completes in required steps',
      examples: [[['load:qwen', 'start:/a:lock1', 'adv:/a', 'adv:/a']], [['start:/a:lock1', 'adv:/b']]],
      build: () =>
        fc.property(
          fc.array(
            fc.constantFrom('load:qwen', 'load:llama', 'start:/a:gate1', 'start:/b:gate2', 'adv:/a', 'adv:/b', 'clear'),
            { maxLength: 20 },
          ),
          (ops) => {
            const kiro = new KiroCompanion();
            for (const op of ops) {
              const [kind, a, b] = op.split(':');
              if (kind === 'load') kiro.loadCore(a);
              else if (kind === 'clear') kiro.clearRoomTransient();
              else if (kind === 'start') kiro.startCrack(a, b, `${a}/${b}`);
              else if (kind === 'adv') {
                const prev = kiro.activeCrack ? { ...kiro.activeCrack } : null;
                const res = kiro.advanceCrack(a);
                if (prev && prev.dirPath !== a) {
                  expect(kiro.crackPhase === 'idle' && kiro.activeCrack === null, 'room change did not abort crack');
                } else if (prev && prev.progress + 1 >= prev.required) {
                  expect(res.completedTargetPath === prev.targetPath && kiro.isUnlocked(prev.targetPath), 'completed crack did not unlock path');
                  expect(kiro.crackPhase === 'idle' && kiro.activeCrack === null, 'completed crack stayed active');
                }
              }
              expect((kiro.crackPhase === 'cracking') === (kiro.activeCrack !== null), 'crackPhase and activeCrack diverged');
            }
          },
        ),
    },
    {
      name: 'AgentDirector tutorial FSM is monotonic into finished/abandoned until reset()',
      examples: [[['arrive', 'leave', 'arrive', 'skip', 'reset', 'abandon', 'arrive']]],
      build: () =>
        fc.property(
          fc.array(fc.constantFrom('arrive', 'step', 'leave', 'skip', 'abandon', 'reset'), { maxLength: 20 }),
          (ops) => {
            const dir = new AgentDirector();
            for (const op of ops) {
              const before = dir.tutorialPhase;
              if (op === 'arrive') dir.arrive();
              else if (op === 'step') dir.observe([['ls']], { failed: false, leftDesk: false });
              else if (op === 'leave') dir.observe([['cd', '..']], { failed: false, leftDesk: true });
              else if (op === 'skip') dir.skip();
              else if (op === 'abandon') dir.abandon();
              else if (op === 'reset') dir.reset();
              const after = dir.tutorialPhase;
              if (op !== 'reset' && (before === 'finished' || before === 'abandoned')) {
                expect(after === before, `terminal phase ${before} transitioned on ${op} to ${after}`);
              }
              expect(dir.active() === (after === 'waiting' || after === 'active'), 'active() disagrees with tutorialPhase');
            }
          },
        ),
    },
    {
      name: 'BATTLE_TRANSITIONS + battle.ts orchestrator obey transition edges, turn timer, holds, and battleView invariants',
      examples: [[['begin:2', 'clock', 'clock', 'clock', 'clock', 'hold:editor', 'clock', 'free:editor', 'enemy', 'after:cleared']]],
      build: () =>
        fc.property(
          fc.array(
            fc.constantFrom(
              'begin:1',
              'begin:2',
              'begin:empty',
              'skip',
              'clock',
              'hold:editor',
              'hold:laptop',
              'free:editor',
              'free:laptop',
              'enemy',
              'after:alive',
              'after:cleared',
              'after:left',
              'end:left',
              'end:respawn',
            ),
            { maxLength: 50 },
          ),
          (ops) => {
            const reached = reachableStates(BATTLE_TRANSITIONS, 'idle');
            const b = createBattle();
            const threats = [{ id: 'e1', type: 'virus', boss: false }];
            const twoThreats = [threats[0], { id: 'e2', type: 'trojan', boss: false }];
            let phase = 'idle';
            let battleNum = 0;
            let introLeft = 0;
            let secondsLeft = TURN_SEC;
            const holds = new Set();

            for (const op of ops) {
              const ev = [];
              if (op.startsWith('begin:')) {
                const list = op === 'begin:empty' ? [] : op === 'begin:2' ? twoThreats : threats;
                beginBattle(b, list, battleNum + 1, ev);
                const next = nextMachineState(BATTLE_TRANSITIONS, phase, 'BEGIN');
                if (next && list.length > 0) {
                  phase = next;
                  battleNum += 1;
                  introLeft = INTRO_SEC;
                  secondsLeft = TURN_SEC;
                  expect(ev.length === 1 && ev[0].type === 'BATTLE_STARTED' && BIG_FOUR.includes(ev[0].agent), 'beginBattle did not emit BATTLE_STARTED');
                } else {
                  expect(ev.length === 0, `beginBattle emitted events unexpectedly in ${phase}`);
                }
              } else if (op === 'skip') {
                const ok = skipIntro(b, ev);
                const next = nextMachineState(BATTLE_TRANSITIONS, phase, 'SKIP_INTRO');
                expect(ok === (next !== null), `skipIntro returned ${ok} in ${phase}`);
                if (next) {
                  phase = next;
                  introLeft = 0;
                  secondsLeft = TURN_SEC;
                  expect(ev.length === 1 && ev[0].type === 'BATTLE_TURN' && ev[0].actor === 'player' && ev[0].first === true, 'skipIntro turn event mismatch');
                }
              } else if (op === 'clock') {
                const res = clockSecond(b, ev);
                if (phase === 'intro') {
                  introLeft -= 1;
                  expect(res === null, 'intro clockSecond must not time out');
                  if (introLeft <= 0) {
                    phase = 'player';
                    introLeft = 0;
                    secondsLeft = TURN_SEC;
                    expect(ev.length === 1 && ev[0].type === 'BATTLE_TURN' && ev[0].actor === 'player' && ev[0].first === true, 'intro expiry did not start player turn');
                  }
                } else if (phase === 'player' && holds.size === 0) {
                  secondsLeft = Math.max(0, secondsLeft - 1);
                  expect(res === (secondsLeft === 0 ? 'timeout' : null), `clockSecond returned ${res} at ${secondsLeft}s`);
                } else {
                  expect(res === null && ev.length === 0, `clockSecond mutated held/non-player battle in ${phase}`);
                }
              } else if (op.startsWith('hold:') || op.startsWith('free:')) {
                const [kind, hold] = op.split(':');
                setHold(b, hold, kind === 'hold');
                if (kind === 'hold') holds.add(hold);
                else holds.delete(hold);
              } else if (op === 'enemy') {
                startEnemyTurn(b, 'action', ev);
                const next = nextMachineState(BATTLE_TRANSITIONS, phase, 'START_ENEMY');
                if (next) {
                  phase = next;
                  expect(ev.length === 1 && ev[0].type === 'BATTLE_TURN' && ev[0].actor === 'enemy', 'startEnemyTurn event mismatch');
                } else {
                  expect(ev.length === 0, `startEnemyTurn emitted in ${phase}`);
                }
              } else if (op.startsWith('after:')) {
                const mode = op.split(':')[1];
                if (phase === 'idle') {
                  afterEnemyTurn(b, threats, null, ev);
                  expect(ev.length === 0, 'afterEnemyTurn in idle must be a no-op');
                } else if (mode === 'left') {
                  afterEnemyTurn(b, threats, 'left', ev);
                  phase = 'idle';
                  introLeft = 0;
                  secondsLeft = TURN_SEC;
                  expect(ev.length === 1 && ev[0].type === 'BATTLE_ENDED' && ev[0].reason === 'left', 'afterEnemyTurn left mismatch');
                } else if (mode === 'cleared') {
                  afterEnemyTurn(b, [], null, ev);
                  phase = 'idle';
                  introLeft = 0;
                  secondsLeft = TURN_SEC;
                  expect(ev.length === 1 && ev[0].type === 'BATTLE_ENDED' && ev[0].reason === 'cleared', 'afterEnemyTurn cleared mismatch');
                } else {
                  afterEnemyTurn(b, threats, null, ev);
                  const next = nextMachineState(BATTLE_TRANSITIONS, phase, 'START_PLAYER');
                  if (next) {
                    phase = next;
                    secondsLeft = TURN_SEC;
                    expect(ev.length === 1 && ev[0].type === 'BATTLE_TURN' && ev[0].actor === 'player' && ev[0].first === false, 'afterEnemyTurn player turn mismatch');
                  } else {
                    expect(ev.length === 0, `afterEnemyTurn started player turn from ${phase}`);
                  }
                }
              } else if (op.startsWith('end:')) {
                const reason = op.split(':')[1];
                endBattle(b, reason, ev);
                const next = nextMachineState(BATTLE_TRANSITIONS, phase, 'END');
                if (next) {
                  phase = next;
                  introLeft = 0;
                  secondsLeft = TURN_SEC;
                  expect(ev.length === 1 && ev[0].type === 'BATTLE_ENDED' && ev[0].reason === reason, 'endBattle event mismatch');
                } else {
                  expect(ev.length === 0, 'endBattle in idle must emit nothing');
                }
              }

              expect(reached.has(b.phase) && b.phase === phase, `battle phase ${b.phase} != ${phase}`);
              expect(b.battle === battleNum, `battle counter ${b.battle} != ${battleNum}`);
              const view = battleView(b);
              if (phase === 'idle') expect(view === null, 'battleView must be null in idle');
              else {
                expect(view !== null && view.phase === phase && view.held === (holds.size > 0), 'battleView mismatch');
                expect(view.secondsLeft === (phase === 'player' ? secondsLeft : null), `battleView secondsLeft ${view.secondsLeft} != ${secondsLeft}`);
              }
            }
          },
        ),
    },
    {
      name: 'AppBus preserves FIFO ordering, caps recent() at 200, respects unsubscribe, and publishKernel forwards in order',
      examples: [[['emit:key', 'unsub:a', 'emit:page', 'kernel:2', 'kernel:0']]],
      build: () =>
        fc.property(
          fc.array(
            fc.constantFrom('emit:key', 'emit:page', 'emit:menu', 'emit:timer', 'unsub:a', 'kernel:2', 'kernel:0'),
            { minLength: 1, maxLength: 260 },
          ),
          (ops) => {
            const bus = createAppBus();
            const seenA = [];
            const seenB = [];
            const expectedLog = [];
            const expectedA = [];
            const expectedB = [];
            let aSub = true;
            const unsubA = bus.subscribe((ev) => seenA.push(ev));
            bus.subscribe((ev) => seenB.push(ev));

            const pushExpected = (ev) => {
              expectedLog.push(ev);
              if (aSub) expectedA.push(ev);
              expectedB.push(ev);
            };

            for (let i = 0; i < ops.length; i++) {
              const op = ops[i];
              if (op === 'unsub:a') {
                unsubA();
                aSub = false;
              } else if (op === 'kernel:0') {
                publishKernel(undefined, [{ type: 'FLOOR_CLEARED', floorId: i, speedrunBonus: false, commandsCount: i }]);
                publishKernel(bus, []);
              } else if (op === 'kernel:2') {
                const k1 = { type: 'FLOOR_CLEARED', floorId: i, speedrunBonus: false, commandsCount: i };
                const k2 = { type: 'PERMISSION_DENIED_RATTLE', targetId: i, command: 'rm' };
                publishKernel(bus, [k1, k2]);
                pushExpected({ kind: 'kernel', event: k1 });
                pushExpected({ kind: 'kernel', event: k2 });
              } else {
                const ev =
                  op === 'emit:key'
                    ? { kind: 'key', key: 'press' }
                    : op === 'emit:page'
                      ? { kind: 'page' }
                      : op === 'emit:menu'
                        ? { kind: 'menu', action: 'move' }
                        : { kind: 'timer', secondsLeft: i % 31 };
                bus.emit(ev);
                pushExpected(ev);
              }
            }

            const recent = bus.recent();
            expect(recent.length <= 200, `AppBus recent exceeded cap: ${recent.length}`);
            expect(JSON.stringify(recent) === JSON.stringify(expectedLog.slice(-200)), 'AppBus recent() order/cap mismatch');
            expect(JSON.stringify(seenA) === JSON.stringify(expectedA), 'AppBus listener A mismatch after unsubscribe');
            expect(JSON.stringify(seenB) === JSON.stringify(expectedB), 'AppBus listener B mismatch');
          },
        ),
    },
    {
      name: 'PlayEventBus delivers emitted PlayEvents in order and isolates unsubscribed listeners',
      examples: [[['sub:1', 'sub:2', 'emit:modal', 'unsub:1', 'emit:sync', 'emit:paint']]],
      build: () =>
        fc.property(
          fc.array(
            fc.constantFrom('sub:1', 'sub:2', 'unsub:1', 'unsub:2', 'emit:sync', 'emit:modal', 'emit:restart', 'emit:run'),
            { minLength: 1, maxLength: 30 },
          ),
          (ops) => {
            const bus = createPlayBus();
            const logs = { 1: [], 2: [] };
            const expected = { 1: [], 2: [] };
            const active = { 1: null, 2: null };
            for (let i = 0; i < ops.length; i++) {
              const [kind, arg] = ops[i].split(':');
              if (kind === 'sub') {
                if (!active[arg]) active[arg] = bus.subscribe((ev) => logs[arg].push(ev.kind));
              } else if (kind === 'unsub') {
                if (active[arg]) {
                  active[arg]();
                  active[arg] = null;
                }
              } else {
                const ev =
                  arg === 'sync'
                    ? { kind: 'sync-pause' }
                    : arg === 'modal'
                      ? { kind: 'modal', modal: 'manual', action: 'toggle' }
                      : arg === 'restart'
                        ? { kind: 'floor-restart' }
                        : { kind: 'run-start' };
                bus.emit(ev);
                if (active[1]) expected[1].push(ev.kind);
                if (active[2]) expected[2].push(ev.kind);
              }
            }
            expect(JSON.stringify(logs[1]) === JSON.stringify(expected[1]), 'PlayEventBus listener 1 log diverged');
            expect(JSON.stringify(logs[2]) === JSON.stringify(expected[2]), 'PlayEventBus listener 2 log diverged');
          },
        ),
    },
  ];
}
