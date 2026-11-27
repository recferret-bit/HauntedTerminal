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
    {
      name: 'ScriptLock matches flags (* and bundled short flags) and re: args cleanly, and freeAction unlocks 0 battle turns on refusal',
      build: () => {
        const battleIdx = world.levels.findIndex((l) => l.enemies.some((e) => !e.hidden && e.path.startsWith(`${l.cwd}/`) && e.path.slice(l.cwd.length + 1).indexOf('/') === -1));
        expect(battleIdx >= 0, 'expected at least one level with a starting-room enemy');
        return fc.property(
          fc.constantFrom('-l -a', '-la', '-al', '-l -a -h'),
          fc.constantFrom('--secret', '--secret=top'),
          (lsFlags, secretArg) => {
            const gated = world.openWith(battleIdx, (pack) => {
              const lvl = pack.levels[battleIdx];
              lvl.script = {
                ...(lvl.script ?? {}),
                openingSec: 0,
                timed: [],
                locks: [
                  { command: 'ls', flags: 'la', until: { kind: 'flag', name: 'ls_ok' }, message: 'LOCK-LA', freeAction: true },
                  { command: 'ls', flags: '*', until: { kind: 'flag', name: 'ls_ok' }, message: 'LOCK-STAR', freeAction: true },
                  { command: 'echo', args: 're:^--secret', until: { kind: 'flag', name: 'echo_ok' }, message: 'LOCK-ECHO', freeAction: true },
                ],
                triggers: [{ when: { kind: 'ran_command', name: 'pwd' }, steps: [{ kind: 'set_flag', name: 'ls_ok' }, { kind: 'set_flag', name: 'echo_ok' }] }],
              };
            });
            gated.inventory = { ...gated.inventory, items: [...new Set([...gated.inventory.items, 'tube_transistor'])] };
            gated.arriveLevel();
            gated.exec('ls'); // starts battle intro; plain ls has no flags
            gated.skipBattleIntro();
            let enemyEvents = 0;
            for (let i = 0; i < 6; i++) {
              const r = gated.exec(`ls ${lsFlags}`);
              expect(r.code === 1 && r.output.includes('LOCK-LA'), `expected LOCK-LA on ls ${lsFlags}, got ${JSON.stringify(r)}`);
              enemyEvents += count(r.events, 'ENEMY_TELL') + count(r.events, 'ENEMY_ATTACK');
              const rs = gated.exec('ls --all');
              expect(rs.code === 1 && rs.output.includes('LOCK-STAR'), `expected LOCK-STAR on ls --all, got ${JSON.stringify(rs.output)}`);
              enemyEvents += count(rs.events, 'ENEMY_TELL') + count(rs.events, 'ENEMY_ATTACK');
              const er = gated.exec(`echo ${secretArg}`);
              expect(er.code === 1 && er.output.includes('LOCK-ECHO'), `expected LOCK-ECHO on echo ${secretArg}`);
              enemyEvents += count(er.events, 'ENEMY_TELL') + count(er.events, 'ENEMY_ATTACK');
            }
            expect(enemyEvents === 0, `freeAction refusals triggered ${enemyEvents} enemy battle event(s)`);
            const echoOk = gated.exec('echo visible');
            expect(echoOk.code === 0 && echoOk.output.includes('visible'), 'non-matching echo args should not be locked');
            const unlock = gated.exec('pwd');
            expect(unlock.code === 0, 'pwd failed');
            expect(gated.exec(`ls ${lsFlags}`).code === 0, `ls ${lsFlags} stayed locked after flag was set`);
            expect(gated.exec('ls --all').code === 0, 'ls --all stayed locked after flag was set');
            expect(gated.exec(`echo ${secretArg}`).code === 0, `echo ${secretArg} stayed locked after flag was set`);
          },
        );
      },
    },
    {
      name: 'dialog_done blocks while mid-level dialog runs, clears on tick drain or Skip Dialog, preserves set_flag, and distinguishes ls flags',
      build: () =>
        fc.property(level, fc.integer({ min: 2, max: 8 }), fc.boolean(), (levelIdx, holdSec, useSkip) => {
          const session = world.openWith(levelIdx, (pack) => {
            const lvl = pack.levels[levelIdx];
            lvl.script = {
              ...(lvl.script ?? {}),
              openingSec: 0,
              timed: [],
              locks: [{ command: 'ls', flags: '*', until: { kind: 'dialog_done' }, message: 'WAIT-DIALOG', freeAction: true }],
              triggers: [
                { when: { kind: 'all', of: [] }, steps: [{ kind: 'dialog_box', speaker: 'kiro', text: 'HOLD ON', holdSec }, { kind: 'wait', sec: 1 }, { kind: 'set_flag', name: 'kept_flag' }] },
                { when: { kind: 'all', of: [{ kind: 'ran_command', name: 'ls', flags: 'la' }, { kind: 'not', of: { kind: 'flag', name: 'missing_flag' } }] }, steps: [{ kind: 'set_flag', name: 'ran_la' }, { kind: 'print', text: 'RAN-LA-ONLY\n' }] },
              ],
            };
          });
          session.inventory = { ...session.inventory, items: [...new Set([...session.inventory.items, 'tube_transistor'])] };
          session.tick();
          expect(session.snapshot().skippableDialog === true && session.snapshot().openingDialog === false, 'expected mid-level skippableDialog');
          const blocked = session.exec('ls -la');
          expect(blocked.code === 1 && blocked.output.includes('WAIT-DIALOG'), `expected WAIT-DIALOG before dialog finishes, got ${JSON.stringify(blocked.output)}`);
          const plain = session.exec('ls');
          expect(plain.code === 0 && !text(plain).includes('RAN-LA-ONLY'), 'plain ls must succeed and must not match ran_command flags:"la"');
          if (useSkip) {
            session.skipOpeningDialog();
          } else {
            for (let t = 0; t < holdSec + 8 && session.snapshot().skippableDialog; t++) session.tick();
          }
          expect(session.snapshot().skippableDialog === false, 'skippableDialog did not clear after ticks/skip');
          expect(session.rt.flags.has('kept_flag'), 'set_flag did not persist across dialog end/skip');
          const after = session.exec('ls -la');
          expect(after.code === 0 && text(after).includes('RAN-LA-ONLY') && session.rt.flags.has('ran_la'), 'ls -la failed or missed ran_command{flags:la} trigger after dialog cleared');
        }),
    },
    {
      name: 'the hidden tensor_gpu pickup stays cloaked before ls -la, locks ls -la during post-transistor dialog, drops with fromX/fromY on ls -la, and collects idempotently',
      build: () => {
        const idx = world.levels.findIndex((l) => (l.pickups ?? []).some((p) => p.type === 'tensor_gpu' && p.appearWhen?.kind === 'room_swept'));
        expect(idx >= 0, 'expected a level with room_swept-triggered tensor_gpu pickup');
        const pickup = world.levels[idx].pickups.find((p) => p.type === 'tensor_gpu');
        const fileName = pickup.path.split('/').pop();
        const sol = world.levels[idx].solutionCommands ?? [];
        const lsLaIdx = sol.indexOf('ls -la');
        expect(lsLaIdx > 0, `expected ls -la in ${world.levels[idx].id} solutionCommands`);
        return fc.property(
          fc.integer({ min: 1, max: 30 }),
          fc.array(fc.constantFrom('mv', 'source', 'hold', 'tick'), { minLength: 1, maxLength: 5 }),
          (seed, again) => {
            const session = world.open(idx, seed);
            expect(session.exec('ls').output.includes(fileName) === false, `${fileName} appeared in plain ls`);
            expect(session.exec(`mv ${fileName} ~`).code === 1, `mv ${fileName} ~ succeeded before ls -la`);
            for (const cmd of sol.slice(0, lsLaIdx)) {
              if (session.snapshot().skippableDialog) session.skipOpeningDialog();
              session.exec(cmd);
            }
            expect(session.snapshot().skippableDialog === true && session.snapshot().openingDialog === false, 'post-transistor dialog did not set skippableDialog');
            const lockedSweep = session.exec('ls -la');
            expect(lockedSweep.code === 1 && /Skip Dialog/i.test(lockedSweep.output), 'ls -la should be refused while post-transistor dialog is running');
            session.skipOpeningDialog();
            const sweep = session.exec('ls -la');
            expect(sweep.code === 0 && sweep.output.includes(fileName), `first allowed ls -la missed ${fileName}: ${sweep.output}`);
            expect(
              sweep.events.some((e) => e.type === 'ENTITY_SPAWNED' && e.entityId === pickup.id && e.fromX === pickup.dropFromX && e.fromY === pickup.dropFromY),
              `ls -la did not emit ENTITY_SPAWNED with fromX/fromY for ${pickup.id}`,
            );
            const first = session.exec(`mv ${fileName} ~`);
            expect(first.events.filter((e) => e.type === 'PICKUP_COLLECTED' && e.item === 'tensor_gpu').length === 1, `mv ${fileName} ~ did not collect tensor_gpu once`);
            const kept = JSON.stringify(session.snapshot().inventory);
            expect(session.snapshot().inventory.items.includes('tensor_gpu') && session.snapshot().inventory.held === 'tube_transistor', `bad inventory after collect: ${kept}`);
            for (const how of again) {
              const r = how === 'tick' ? session.tick() : session.exec(how === 'hold' ? 'hold tube_transistor' : `${how} ${fileName}${how === 'mv' ? ' ~' : ''}`);
              expect(!r.events.some((e) => e.type === 'PICKUP_COLLECTED' && e.item === 'tensor_gpu'), `tensor_gpu collected again by ${how}`);
              expect(JSON.stringify(session.snapshot().inventory) === kept, `inventory changed after ${how}: ${JSON.stringify(session.snapshot().inventory)}`);
            }
          },
        );
      },
    },
  ];
}
