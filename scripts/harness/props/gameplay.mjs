// Gameplay-element properties: HP, enemies, pickups, the inventory, exit gates and win rules, and Kiro cores, under random
// play on the real chapter levels (with part of each level's solution played first, so exits and kills happen).
// Spec: .kiro/specs/property-based-tests/.
import fc from 'fast-check';
import { expect } from './kit.mjs';
import { gameplayFsmProps } from './gameplay-fsm.mjs';
import { kiroSkillProps } from './kiro-skills.mjs';
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
  const fsmProps = await gameplayFsmProps(ctx);
  const skillProps = await kiroSkillProps(ctx);
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
  const transistorFrom = grantedFrom('tube_transistor');
  const mapFrom = grantedFrom('map');
  const manualFrom = grantedFrom('manual');
  const laptopFrom = grantedFrom('laptop');

  const pickupLevelsOf = (type) =>
    world.levels
      .map((l, index) => ({ index, level: l, pickup: (l.pickups ?? []).find((p) => p.type === type) }))
      .filter((l) => l.pickup)
      .map((l) => {
        const name = l.pickup.path.split('/').pop();
        const sol = l.level.solutionCommands ?? [];
        const mvIdx = sol.findIndex((cmd) => cmd === `mv ${name} ~`);
        return { index: l.index, name, prep: l.pickup.appearWhen && mvIdx > 0 ? sol.slice(0, mvIdx) : [] };
      });
  const pickupIdempotentProp = (type, list) => ({
    name: `the ${type} pickup is idempotent: collecting it again (any way, any number of times) changes nothing`,
    build: () =>
      fc.property(
        fc.constantFrom(...(list.length ? list.keys() : [0])),
        fc.array(fc.constantFrom('mv', 'source', 'hold', 'tick'), { minLength: 1, maxLength: 6 }),
        (l, again) => {
          const session = list.length
            ? world.open(list[l].index)
            : world.openWith(1, (p) => {
                const cwd = p.levels[1].cwd;
                p.levels[1].files.push({ path: `${cwd}/${type}`, kind: 'file', content: `${type}\n` });
                p.levels[1].pickups.push({ id: `prop_${type}`, type, path: `${cwd}/${type}` });
              });
          const name = list.length ? list[l].name : type;
          for (const prepCmd of list.length ? list[l].prep : []) {
            if (session.snapshot().skippableDialog) session.skipOpeningDialog();
            session.exec(prepCmd);
          }
          const first = session.exec(`mv ${name} ~`);
          expect(first.events.filter((e) => e.type === 'PICKUP_COLLECTED' && e.item === type).length === 1, `\`mv ${name} ~\` did not collect ${type} exactly once`);
          const kept = JSON.stringify(session.snapshot().inventory);
          expect(session.snapshot().inventory.held === type && kept.includes(`"${type}"`), `${type} is not held after collecting it: ${kept}`);
          for (const how of again) {
            const r = how === 'tick' ? session.tick() : session.exec(how === 'hold' ? `hold ${type}` : `${how} ${name}${how === 'mv' ? ' ~' : ''}`);
            expect(!r.events.some((e) => e.type === 'PICKUP_COLLECTED' && e.item === type), `${type} was collected again by ${how}`);
            expect(JSON.stringify(session.snapshot().inventory) === kept, `inventory changed from ${kept} to ${JSON.stringify(session.snapshot().inventory)} after ${how}`);
          }
        },
      ),
  });
  const transistorLevels = pickupLevelsOf('tube_transistor');
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
    if (session.snapshot().openingDialog) session.skipOpeningDialog();
    for (const c of world.levels[levelIdx].solutionCommands ?? []) {
      if (session.snapshot().battle?.phase === 'intro' || session.levelIdx !== levelIdx) break;
      if (session.snapshot().skippableDialog) session.skipOpeningDialog();
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
        for (const c of world.levels[last].solutionCommands ?? []) {
          if (session.snapshot().skippableDialog) session.skipOpeningDialog();
          session.exec(c);
        }
        const snap = session.exec('exit').snapshot;
        expect(snap.ended, 'the last level did not end the chapter after its solution and `exit`');
        expect(snap.room.floor === session.rt.spec.index, `ended room.floor ${snap.room.floor} != level index ${session.rt.spec.index}`);
      },
    },
    {
      // Found by this property: hub 3 accepted `kiro load mistral` (a declared alias of llama) but its win rule only accepted llama,
      // so following the alias left the exit locked (fixed in session-rules.ts: the rule honours `coreAliases`).
      examples: [[mistralHub, 'mistral']],
      name: 'in a Kiro hub, any known core loads but only the wanted core (or a declared alias) satisfies the win rule; an unknown core is refused and loads nothing',
      build: () =>
        fc.property(fc.constantFrom(...hubs.keys()), fc.constantFrom('qwen', 'mistral', 'deepseek', 'llama', 'codec-9', 'clod', ''), (h, core) => {
          const { index, rule, aliases } = hubs[h];
          const accepted = [rule.core, ...(aliases[rule.core] ?? [])];
          const known = ['qwen', 'mistral', 'deepseek', 'llama'].includes(core);
          const session = world.open(index);
          const before = session.kiro.activeCore.id;
          const r = session.exec(`kiro load ${core}`.trim());
          if (known) {
            expect((r.code ?? 0) === 0, `level ${index}: loading the known core ${core} failed: ${JSON.stringify(r.output).slice(0, 120)}`);
            expect(session.rt.loadedCores.has(core), `level ${index}: ${core} is not in loadedCores after a good load`);
            expect(session.kiro.activeCore.id === core, `level ${index}: ${core} was loaded but the active core is ${session.kiro.activeCore.id}`);
            expect(evalWinRule(session, rule) === accepted.includes(core), `level ${index} wants ${accepted.join(' or ')}: the kiro_loaded rule is ${evalWinRule(session, rule) ? 'met' : 'unmet'} after loading ${core}`);
          } else {
            expect((r.code ?? 0) !== 0, `level ${index}: \`kiro load ${core}\` of an unknown core succeeded`);
            expect(session.kiro.activeCore.id === before, `level ${index}: \`kiro load ${core}\` failed but the core went ${before} -> ${session.kiro.activeCore.id}`);
            expect(!session.rt.loadedCores.has(core), `level ${index}: ${core} was recorded as loaded though refused`);
            expect(!evalWinRule(session, rule), `level ${index}: the kiro_loaded rule is met by ${core} (wants ${accepted.join(' or ')})`);
          }
        }),
    },
    pickupIdempotentProp('tube_transistor', transistorLevels),
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
      // The shipped chapter starts bare-handed (`startItems: []`) and grants items across levels; random lists put the same item
      // in `startItems` and in several grants, which is what a human can do in the editor.
      name: '`startItems` and `grants` never put an item in the inventory twice, and give exactly the union that applies',
      build: () =>
        fc.property(
          fc.option(fc.array(itemId, { maxLength: 6 }), { nil: undefined }),
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
            const wantHeld = items.includes('tube_transistor') ? 'tube_transistor' : items.includes('terminal') ? 'terminal' : null;
            expect(held === wantHeld, `holds ${held}, expected ${wantHeld} from ${JSON.stringify(items)}`);
            for (const id of startItems ?? []) expect(items.includes(id), `startItems ${id} is missing from ${JSON.stringify(items)}`);
            const allowed = new Set([...(startItems ?? inv.starterInventory().items), ...grants.flatMap((g) => g.items ?? [])]);
            expect(items.every((i) => allowed.has(i)), `an item nobody named appeared: ${JSON.stringify(items)}`);
          },
        ),
    },
    {
      // `startItems: []` starts the hero completely bare-handed; unknown item ids are rejected by `validatePack`.
      name: '`validatePack` accepts empty or known `startItems` and rejects unknown item ids',
      examples: [[[]], [['sword']]],
      build: () =>
        fc.property(fc.array(fc.constantFrom(...inv.ITEM_IDS, 'sword', '', 'LAPTOP'), { maxLength: 6 }), (startItems) => {
          const pack = structuredClone(world.pack);
          pack.manifest.startItems = startItems;
          const hit = validatePack(pack, { winnable: false }).some((i) => i.severity === 'error' && i.message.startsWith('startItems'));
          const hasBad = startItems.some((id) => !inv.isItemId(id));
          expect(hit === hasBad, `startItems ${JSON.stringify(startItems)}: error reported = ${hit}, expected ${hasBad}`);
        }),
    },
    {
      // The thresholds come from the manifest's grants (`afterLevel`), so the examples sit on both sides of each one.
      name: 'starting at a later level (a jump) grants only the tools already unlocked up to that level',
      examples: [...new Set([1, transistorFrom - 1, transistorFrom, mapFrom - 1, mapFrom, laptopFrom - 1, laptopFrom, world.levels.length - 1])].filter((i) => i >= 1 && i < world.levels.length).map((i) => [i]),
      build: () =>
        fc.property(fc.integer({ min: 1, max: world.levels.length - 1 }), (levelIdx) => {
          const { items, held } = world.open(levelIdx).snapshot().inventory;
          expect(items.includes('terminal'), `a jump to level ${levelIdx + 1} does not carry the terminal: ${JSON.stringify(items)}`);
          if (levelIdx < transistorFrom) {
            expect(!items.includes('tube_transistor') && held === 'terminal', `a jump to level ${levelIdx + 1} holds ${held} and owns ${JSON.stringify(items)}`);
          } else {
            expect(items.includes('tube_transistor') && held === 'tube_transistor', `a jump to level ${levelIdx + 1} holds ${held} and owns ${JSON.stringify(items)}`);
            expect(items.filter((i) => i === 'tube_transistor').length === 1, `the tube_transistor is in the inventory ${items.filter((i) => i === 'tube_transistor').length} times`);
          }
          expect(items.includes('map') === (levelIdx >= mapFrom), `map grant mismatch at level ${levelIdx + 1}: ${JSON.stringify(items)}`);
          expect(items.includes('manual') === (levelIdx >= manualFrom), `manual grant mismatch at level ${levelIdx + 1}: ${JSON.stringify(items)}`);
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
        expect(session.snapshot().tutorial === null, 'the tutorial card shows before he has a terminal to type in');
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
        expect(session.snapshot().tutorial?.step === 1, 'the first tutorial card shows once he holds the terminal');
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
    ...fsmProps,
    ...skillProps,
  ];
}
