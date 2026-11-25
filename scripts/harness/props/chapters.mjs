// Chapter properties: the chapter session under random play on every level, determinism, the canonical JSON writer, and
// the static checks on corrupted packs. Spec: .kiro/specs/property-based-tests/.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { stringifyChapterJson } from '../lib/chapter-json.mjs';
import { projectRoot } from '../lib/load.mjs';
import { corrupt, corruptions, filesUnder, jsonValue } from './arbitraries.mjs';
import { expect, withFakeClock } from './kit.mjs';

/** Breakages a human can make in the editor that the Check tab must report (probed: each one adds a specific error). */
const BREAKAGES = [
  ['an exit gate that is not a file', (p, i) => { p.levels[i].exitDir = '/nowhere/gate'; }],
  ['a win rule on a missing file', (p, i) => {
    const rule = p.levels[i].winRules.find((r) => typeof r.path === 'string' && r.kind !== 'dir_accessible');
    rule.path = '/nope/none'; // throws (nothing to break) on a level whose rules name no file
  }],
  ['an unknown enemy type', (p, i) => { p.levels[i].enemies[0].type = 'dragon'; }],
  ['a missing required list (files)', (p, i) => { delete p.levels[i].files; }],
  ['a missing required list (winRules)', (p, i) => { delete p.levels[i].winRules; }],
  ['an unknown room kind', (p, i) => { p.levels[i].roomKind = 'nope'; }],
  ['a pickup on a missing file', (p, i) => { p.levels[i].pickups[0].path = '/zz/none'; }],
  ['a solution that is not a list', (p, i) => { p.levels[i].solutionCommands = 'x'; }],
  ['a missing level title', (p, i) => { delete p.levels[i].title; }],
  ['an unknown model on the ally', (p) => { p.manifest.allyNpc.model = 'npc.nope'; }],
];
import { chapterWorld } from './sessions.mjs';

function portableSaveAndPreviewProps(deps) {
  const {
    world,
    readAchievements,
    unlockAchievement,
    readChapterProgress,
    readMetagame,
    recordLevelClear,
    resetInMemoryStoresForTest,
    exportPortableSaveBundle,
    importPortableSaveBundle,
  } = deps;
  return [
    {
      name: 'preview sessions never record or emit ACH_* achievements under random play',
      build: () =>
        fc.property(world.play, ([levelIdx, steps]) => {
          resetInMemoryStoresForTest();
          world.drive(world.open(levelIdx), steps, (r, s) => {
            expect(
              r.events.every((e) => e.type !== 'ACHIEVEMENT_UNLOCKED'),
              `preview session emitted ACHIEVEMENT_UNLOCKED after ${JSON.stringify(s)}`,
            );
          });
          expect(
            Object.keys(readAchievements().unlocked).length === 0,
            'preview session mutated unlocked achievements in storage',
          );
        }),
    },
    {
      name: 'portable save import never throws on arbitrary JSON and merges ranks, scrap and ACH_* trophies monotonically',
      // Found during review: `progress: { toString: ... }` previously read `Object.prototype.toString` from `merged[chapId]`.
      examples: [
        ['toString', { progress: { toString: { x: { cleared: true } } } }],
        ['__proto__', { progress: { __proto__: { x: { cleared: true } } } }],
      ],
      build: () =>
        fc.property(
          fc.oneof(fc.constantFrom('toString', 'constructor', '__proto__', 'valueOf', ''), fc.string({ maxLength: 30 })),
          jsonValue,
          (badKey, fuzz) => {
            resetInMemoryStoresForTest();
            expect(importPortableSaveBundle(JSON.stringify(fuzz)).ok === false, 'arbitrary non-save JSON was accepted');

            const chapId = world.pack.manifest.id;
            const lvlId = world.levels[0].id;
            recordLevelClear(chapId, lvlId, 'S', 4, 12, true);
            unlockAchievement('first_boot', { now: 1000 });
            unlockAchievement('campaign_clear', { now: 2000 });
            const baselineScrap = readMetagame().scrap;
            const exported = JSON.stringify(exportPortableSaveBundle());

            resetInMemoryStoresForTest();
            expect(importPortableSaveBundle(exported).ok === true, 'round-trip save export failed to import');
            expect(readChapterProgress()[chapId]?.[lvlId]?.bestRank === 'S', 'round-trip lost S rank');

            const downgrade = JSON.stringify({
              format: 'haunted-terminal-save',
              version: 1,
              exportedAt: '2026-11-17T00:00:00Z',
              progress: {
                ...(badKey ? { [badKey]: { x: { cleared: true, bestRank: 'C', bestCommands: 99, bestTimeSec: 99 } } } : {}),
                [chapId]: { [lvlId]: { cleared: true, bestRank: 'C', bestCommands: 999, bestTimeSec: 999, chaosCleared: false } },
              },
              metagame: { scrap: 0, unlockedPerks: ['fake-perk'], activePerks: ['fake-perk'], awardedRanks: { [`${chapId}:${lvlId}`]: 'C' } },
              achievements: fuzz,
            });
            expect(importPortableSaveBundle(downgrade).ok === true, 'valid-header downgrade bundle failed to import');
            const rec = readChapterProgress()[chapId]?.[lvlId];
            expect(rec?.bestRank === 'S' && rec.bestCommands === 4 && rec.chaosCleared === true, 'import downgraded sector bestRank/commands/chaos');
            expect(readMetagame().scrap >= baselineScrap, 'import decreased Silicon Scrap');
            const ach = readAchievements().unlocked;
            expect(Boolean(ach.first_boot && ach.campaign_clear), 'import lost unlocked ACH_* trophies');
            expect(!Object.hasOwn(readChapterProgress(), 'toString'), 'prototype key leaked into progress store');
          },
        ),
    },
  ];
}

/** Properties of the script vocabulary the tutorial uses: `script.locks` and `script.timed` (spec .kiro/specs/tutorial-rework/). */
function lockAndTimedProps(world) {
  const text = (r) => `${r.output ?? ''}\n${r.stderr ?? ''}`;
  const word = (line) => line.trim().split(/\s+/)[0];
  const lockedLevels = world.levels
    .map((level, index) => ({
      index,
      lock: (level.script?.locks ?? []).find((l) => l.until.kind === 'has_item' && l.until.item === 'lantern'),
      pickup: (level.pickups ?? []).find((p) => p.type === 'lantern'),
    }))
    .filter((l) => l.lock && l.pickup);
  const timedLevels = world.levels
    .map((level, index) => ({ index, timed: level.script?.timed ?? [] }))
    .filter((l) => l.timed.some((t) => t.steps.some((s) => s.kind === 'dialog_box')));
  // Commands that cannot take the lantern, delete its file or move the hero away from it.
  const idle = fc.oneof(
    { weight: 3, arbitrary: fc.constantFrom('ls', 'ls -a', 'ls -la', 'ls -l') },
    { weight: 3, arbitrary: fc.constantFrom('pwd', 'ps', 'help', 'hint', 'inventory', 'inv', 'hold lantern', 'hold terminal', 'cat *', 'kiro', 'kiro scan') },
    { weight: 1, arbitrary: fc.integer({ min: 1, max: 3 }).map((tick) => ({ tick })) },
  );
  const kept = (lock) => (s) => typeof s !== 'string' || !/lantern/.test(s.replace('hold lantern', '')) || word(s) === lock.command;

  return [
    {
      name: 'a `script.locks` command (also with flags) is refused until the lantern is held, and works after `mv lantern ~`',
      build: () =>
        fc.property(fc.constantFrom(...lockedLevels.keys()), fc.array(idle, { maxLength: 12 }), fc.constantFrom('', ' -a', ' -la', ' -l'), (l, steps, flags) => {
          const { index, lock, pickup } = lockedLevels[l];
          const session = world.open(index);
          const isLocked = (s) => typeof s === 'string' && word(s) === lock.command;
          const refused = (r) => (r.code ?? 0) !== 0 && text(r).includes(lock.message);
          for (const s of [...steps.filter(kept(lock)), `${lock.command}${flags}`]) {
            if (typeof s !== 'string') {
              for (let i = 0; i < s.tick; i++) session.tick();
            } else {
              const r = session.exec(s);
              if (isLocked(s)) expect(refused(r), `\`${s}\` before the lantern was not refused (code ${r.code}): ${JSON.stringify(text(r)).slice(0, 160)}`);
            }
            expect(!session.snapshot().inventory.items.includes('lantern'), `the lantern appeared in the inventory after ${JSON.stringify(s)}`);
          }
          const name = pickup.path.split('/').pop();
          session.exec(`mv ${name} ~`);
          expect(session.snapshot().inventory.items.includes('lantern'), `\`mv ${name} ~\` did not give the lantern`);
          for (const s of [`${lock.command}${flags}`, lock.command]) {
            const r = session.exec(s);
            expect(!refused(r) && !text(r).includes(lock.message), `\`${s}\` is still refused with the lantern held: ${JSON.stringify(text(r)).slice(0, 160)}`);
          }
        }),
    },
    {
      name: 'timed `dialog_box` entries fire once each, at the tick of their afterSec, in order',
      build: () =>
        fc.property(fc.constantFrom(...timedLevels.keys()), fc.integer({ min: 0, max: 40 }), (l, ticks) => {
          const { index, timed } = timedLevels[l];
          const session = world.open(index);
          const got = [];
          for (let t = 1; t <= ticks; t++) {
            const r = session.tick();
            if (r.events.some((e) => e.type === 'PLAYER_RESPAWNED')) return; // a death restarts the level clock
            for (const e of r.events) if (e.type === 'DIALOG_BOX') got.push([t, e.text]);
          }
          // An entry fires on the first tick t with t >= afterSec (the clock starts at tick 1); entries share a tick in spec order.
          const want = timed
            .flatMap((entry, i) => entry.steps.filter((s) => s.kind === 'dialog_box').map((s, j) => ({ at: Math.max(1, entry.afterSec), i, j, text: s.text })))
            .filter((w) => w.at <= ticks)
            .sort((a, b) => a.at - b.at || a.i - b.i || a.j - b.j)
            .map((w) => [w.at, w.text]);
          expect(JSON.stringify(got) === JSON.stringify(want), `after ${ticks} ticks the dialog boxes were ${JSON.stringify(got)}, the spec says ${JSON.stringify(want)}`);
        }),
    },
  ];
}

/** Exit doors (spec .kiro/specs/esc-menu-hud-rework/, R11-R14): the exit is a `door.ethernet` actor, locked iff a win rule fails. */
function exitDoorProps(world) {
  const parentOf = (p) => p.slice(0, p.lastIndexOf('/')) || '/';
  const nameOf = (p) => p.slice(p.lastIndexOf('/') + 1);
  const ethernet = (room) => room.actors.filter((a) => a.model === 'door.ethernet');
  const exitLevels = world.levels.map((l, i) => ({ l, i })).filter((x) => x.l.exitDir);
  const exitless = world.levels.map((l, i) => ({ l, i })).filter((x) => !x.l.exitDir);
  const steps = fc.array(fc.constantFrom(...world.levels.flatMap((l) => l.solutionCommands ?? []), 'ls', 'pwd', 'cat *'), { maxLength: 12 });
  return [
    {
      name: 'standing in the exit\'s parent room, the exit is a `door.ethernet` actor, locked (neighbour `locked`, no gold prompt) iff a win rule fails',
      build: () =>
        fc.property(fc.constantFrom(...exitLevels.keys()), steps, fc.boolean(), (k, play, solve) => {
          const { l, i } = exitLevels[k];
          const session = world.open(i);
          // Half the runs play the solution first (minus any line naming the exit), so the open side is reached too.
          if (solve) world.drive(session, (l.solutionCommands ?? []).filter((c) => !c.includes(nameOf(l.exitDir))));
          world.drive(session, play);
          if (session.snapshot().ended || session.snapshot().room.kind === 'outro') return;
          const parent = parentOf(l.exitDir);
          session.exec(`cd ${parent}`);
          const snap = session.snapshot();
          // A death reboot, a level change or a refused cd leaves the hero elsewhere: nothing to assert then.
          if (snap.cwd !== parent || snap.level?.title !== l.title) return;
          const name = nameOf(l.exitDir);
          const doors = ethernet(snap.room).filter((a) => a.target === name);
          expect(doors.length === 1, `${l.id}: ${doors.length} door.ethernet actors for exit ${name} in ${parent} (${JSON.stringify(snap.room.actors.map((a) => [a.id, a.model]))})`);
          expect(doors[0].kind === 'door', `${l.id}: exit door kind is ${doors[0].kind}`);
          const lockedByView = snap.room.neighbors.some((n) => n.label === name && n.relation === 'locked');
          expect(lockedByView === !snap.promptGold, `${l.id}: the view says locked=${lockedByView} but the exit is ${snap.promptGold ? 'open' : 'closed'} after ${JSON.stringify(play)}`);
        }),
    },
    {
      name: 'a level with only an `exitCommand` shows no `door.ethernet` actor, anywhere it can be walked to',
      build: () =>
        fc.property(fc.constantFrom(...exitless.keys()), steps, (k, play) => {
          const { l, i } = exitless[k];
          const session = world.open(i);
          const seen = (label) => {
            const snap = session.snapshot();
            expect(ethernet(snap.room).length === 0, `${l.id}: a door.ethernet actor in ${snap.cwd} ${label}`);
          };
          seen('on arrival');
          for (const s of play) {
            session.exec(s);
            seen(`after ${JSON.stringify(s)}`);
          }
        }),
    },
  ];
}

export default async function chaptersSuite(ctx) {
  const { checkPack } = await ctx.load('/src/chapter-editor/check.ts');
  const { readAchievements, unlockAchievement } = await ctx.load('/src/chapters/achievements.ts');
  const { readChapterProgress, readMetagame, recordLevelClear, resetInMemoryStoresForTest } = await ctx.load('/src/chapters/catalog.ts');
  const { exportPortableSaveBundle, importPortableSaveBundle } = await ctx.load('/src/chapters/portable-save.ts');
  const world = await chapterWorld(ctx);
  const chaptersDir = join(projectRoot, 'chapters');
  const files = filesUnder(chaptersDir, '.json', readdirSync, join);

  /** Everything a run shows the player: each output, each event list, each snapshot. */
  const transcript = (levelIdx, steps) =>
    withFakeClock(() => {
      const lines = [];
      world.drive(world.open(levelIdx), steps, (r, s) => lines.push(JSON.stringify([s, r.output ?? '', r.events, r.snapshot])));
      return lines;
    });

  const errorCount = (issues) => issues.filter((i) => i.severity === 'error').length;
  const isWrapper = (i) => /malformed spec/.test(i.message);
  const baseErrors = errorCount(checkPack(world.pack));

  return [
    {
      name: 'random play (commands and ticks) never throws on any level',
      build: () =>
        fc.property(world.play, ([levelIdx, steps]) => {
          world.drive(world.open(levelIdx), steps, (r, s) => {
            expect(Array.isArray(r.events) && r.snapshot && typeof r.snapshot.hp === 'number', `bad result after ${JSON.stringify(s)}`);
          });
        }),
    },
    {
      name: 'a death text (SSD restore or kernel panic) appears once in stdout and at most once in stderr, per command and per tick',
      // Found by the visual audit (finding 5): hurt() returned the text and the flow appended g.deathText again.
      // Idle play (a first command, then many ticks) makes the enemies kill the player on levels that have them.
      examples: [[0, 60, ['ls']], [1, 80, ['ls']], [2, 80, ['ls']], [4, 80, ['ls']], [10, 120, ['ls']]],
      build: () =>
        fc.property(fc.nat(world.levels.length - 1), fc.integer({ min: 20, max: 120 }), fc.constantFrom(['ls'], ['ls', 'cat *'], ['pwd', 'ps']), (levelIdx, ticks, cmds) => {
          const marks = ['[SSD SNAPSHOT RESTORED]', '[KERNEL PANIC]'];
          const count = (text, mark) => (text ?? '').split(mark).length - 1;
          const check = (r, label) => {
            for (const mark of marks) {
              expect(count(r.output, mark) <= 1, `${mark} printed ${count(r.output, mark)}x in stdout after ${label}`);
              expect(count(r.stderr, mark) <= 1, `${mark} printed ${count(r.stderr, mark)}x in stderr after ${label}`);
            }
          };
          const session = world.open(levelIdx);
          for (const c of cmds) check(session.exec(c), c);
          for (let i = 0; i < ticks; i++) check(session.tick(), `tick ${i}`);
        }),
    },
    {
      name: 'the same play twice gives the same output, events and snapshots',
      build: () =>
        fc.property(world.play, ([levelIdx, steps]) => {
          const a = transcript(levelIdx, steps);
          const b = transcript(levelIdx, steps);
          const at = a.findIndex((line, i) => line !== b[i]);
          expect(at === -1 && a.length === b.length, `runs differ at step ${at}:\n${a[at]?.slice(0, 300)}\n${b[at]?.slice(0, 300)}`);
        }),
    },
    {
      name: 'the canonical writer reproduces every chapter file byte for byte, and round-trips any JSON',
      // Found by this property: story/comix.spec.json held hand-padded numbers (0.50, 0.0); rewritten through the writer.
      build: () =>
        fc.property(fc.constantFrom(...files), jsonValue, (rel, value) => {
          const text = readFileSync(join(chaptersDir, rel), 'utf8');
          expect(stringifyChapterJson(JSON.parse(text), rel) === text, `chapters/${rel} is not in canonical form: save it through the editor, or rewrite it with stringifyChapterJson(JSON.parse(text), '${rel}')`);
          for (const style of ['levels/x/level.spec.json', 'story/dialogs.json']) {
            const back = JSON.parse(stringifyChapterJson(value, style));
            expect(JSON.stringify(back) === JSON.stringify(value), `round trip (${style}) changed a value`);
          }
        }),
    },
    {
      name: 'the Check tab reports each kind of breakage a human can make, with a specific error',
      // Not a crash test: checkPack wraps its checks, so "returns a list" always holds. This asserts it NOTICES.
      build: () =>
        fc.property(fc.constantFrom(...BREAKAGES.keys()), fc.nat(), (b, pick) => {
          const [label, apply] = BREAKAGES[b];
          const broken = structuredClone(world.pack);
          const i = 1 + (pick % (broken.levels.length - 1)); // level 0 is the tutorial; its lists are the shortest
          try {
            apply(broken, i);
          } catch {
            return; // this level lacks the part (no enemy, no pickup): nothing to break
          }
          const issues = checkPack(broken);
          expect(errorCount(issues) > baseErrors, `${label} on level ${i} added no error`);
          expect(issues.some((x) => x.severity === 'error' && !isWrapper(x)), `${label} on level ${i} was reported only as "malformed spec", not as a field error`);
        }),
    },
    {
      name: 'a corrupted pack never crashes the static checks: problems come back as issues (smoke)',
      // Found by this property: validatePack threw on deleted or mistyped fields; checkPack now reports a crash as an issue.
      // Weak by design (the wrapper makes "returns a list" always true): the property above is the one that can fail on content.
      examples: [
        [0, [{ path: ['boss'], how: 'null' }]],
        [0, [{ path: ['allyNpc'], how: 'delete' }]],
        [1, [{ path: ['levels'], how: 'delete' }]],
        [2, [{ path: ['files'], how: 'null' }]],
      ],
      build: () =>
        // One hand-edited file at a time, the way the editor saves: the manifest, a level, or the dialogs.
        fc.property(fc.nat(), corruptions, (doc, ops) => {
          const broken = structuredClone(world.pack);
          const which = doc % (broken.levels.length + 2);
          if (which === 0) broken.manifest = corrupt(broken.manifest, ops);
          else if (which === 1) broken.dialogs = corrupt(broken.dialogs ?? {}, ops);
          else broken.levels[which - 2] = corrupt(broken.levels[which - 2], ops);
          const issues = checkPack(broken);
          expect(Array.isArray(issues), 'checkPack did not return a list');
        }),
    },
    ...lockAndTimedProps(world),
    ...exitDoorProps(world),
    ...portableSaveAndPreviewProps({
      world,
      readAchievements,
      unlockAchievement,
      readChapterProgress,
      readMetagame,
      recordLevelClear,
      resetInMemoryStoresForTest,
      exportPortableSaveBundle,
      importPortableSaveBundle,
    }),
  ];
}
