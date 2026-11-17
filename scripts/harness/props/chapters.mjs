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

export default async function chaptersSuite(ctx) {
  const { checkPack } = await ctx.load('/src/chapter-editor/check.ts');
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
  ];
}
