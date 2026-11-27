// Comix properties: the 3D comix timeline simulation and static check on the real intro and outro (and on tuned or
// corrupted copies of them), the canonical JSON writer, and cue time expressions. Spec: .kiro/specs/property-based-tests/.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { stringifyComixJson } from '../lib/comix-json.mjs';
import { projectRoot } from '../lib/load.mjs';
import { corrupt, corruptions, filesUnder, jsonValue } from './arbitraries.mjs';
import { expect } from './kit.mjs';

/** Breakages a human can make in the comix editor that the Check tab must report (probed: each adds a specific error). */
const BREAKAGES = [
  ['a zero duration', (p) => { p.manifest.durationSec = 0; }],
  ['a panel that ends before it starts', (p, i) => { p.pages[i].panels[0].until = '0'; p.pages[i].panels[0].from = '0'; }],
  ['a missing cast list', (p) => { delete p.manifest.cast; }],
  ['an unknown cast model', (p) => { p.manifest.cast[0].model = 'agent.nope'; }],
  ['an unknown cue in a letter', (p, i) => {
    const letter = p.pages[i].panels.flatMap((panel) => panel.letters ?? []).find((l) => typeof l.from === 'string' || typeof l.at === 'string');
    letter[typeof letter.from === 'string' ? 'from' : 'at'] = 'NOPE_CUE';
  }],
  ['a track for an actor that is not in the cast', (p, i) => { (p.pages[i].tracks ??= []).push({ kind: 'actor_visibility', actor: 'ghost', from: '0', until: '1', visible: true }); }],
  ['a page window that ends before it starts', (p, i) => { p.pages[i].from = 9999; }],
  ['an unknown room', (p) => { p.manifest.stage.room = 'room.nope'; }],
  ['an unknown stage prop model', (p) => { (p.manifest.stage.props ??= []).push({ id: 'bad_prop', model: 'prop.nope', at: 'screen' }); }],
  ['a track targeting an unknown stage prop', (p, i) => { (p.pages[i].tracks ??= []).push({ kind: 'material_tint', target: 'missing_prop', zone: 'accent', from: '0', until: '1', color: '#ff0000' }); }],
  ['an invalid cast scale tuple', (p) => { p.manifest.cast[0].scale = [1, 2]; }],
];

/** Keys whose number is a duration or a step in seconds; tuning scales them. */
const DURATIONS = new Set(['typeDur', 'hold', 'step', 'dur', 'duration', 'fade']);

/** A tuned copy of a pack: every duration scaled by `time`, every camera rect moved by `dx, dy` and zoomed by `zoom`. */
function tune(pack, { time, dx, dy, zoom }) {
  const copy = structuredClone(pack);
  const walk = (v, inCamera) => {
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === 'number' && DURATIONS.has(k) && x > 0) v[k] = Number((x * time).toFixed(4));
      else if (inCamera && typeof x === 'number' && (k === 'x' || k === 'y')) v[k] = x + (k === 'x' ? dx : dy);
      else if (inCamera && typeof x === 'number' && (k === 'w' || k === 'h')) v[k] = x * zoom;
      else walk(x, inCamera || k === 'camera');
    }
  };
  for (const page of copy.pages) walk(page, false);
  return copy;
}

export default async function comixSuite({ load }) {
  const { listComixPacks } = await load('/src/cinematic/catalog.ts');
  const { simulateComixPack } = await load('/src/cinematic/simulate.ts');
  const { checkComixPack } = await load('/src/comix-editor/check.ts');
  const { resolveTime } = await load('/src/cinematic/expr.ts');
  const packs = new Map(listComixPacks().map((p) => [p.manifest.id, p]));
  const packId = fc.constantFrom(...packs.keys());
  const comixDir = join(projectRoot, 'comix');
  const files = filesUnder(comixDir, '.json', readdirSync, join);

  const cueName = fc.stringMatching(/^[A-Z_][A-Z0-9_]{0,7}$/);
  const seconds = fc.double({ min: 0, max: 600, noNaN: true, noDefaultInfinity: true }).map((x) => Number(x.toFixed(3)));
  const delta = fc.double({ min: 0, max: 60, noNaN: true }).map((x) => Number(x.toFixed(3)));

  const errorCount = (issues) => issues.filter((i) => i.severity === 'error').length;
  const baseErrors = new Map([...packs].map(([id, p]) => [id, errorCount(checkComixPack(p))]));

  return [
    {
      name: 'the shipped comixes, tuned (durations, camera pan and zoom), still simulate at 60 fps with no errors',
      build: () =>
        fc.property(
          packId,
          fc.record({ time: fc.double({ min: 0.8, max: 1.25, noNaN: true }), dx: fc.double({ min: -0.3, max: 0.3, noNaN: true }), dy: fc.double({ min: -0.3, max: 0.3, noNaN: true }), zoom: fc.double({ min: 0.85, max: 1.15, noNaN: true }) }),
          (id, knobs) => {
            const base = packs.get(id);
            const sim = simulateComixPack(tune(base, knobs));
            expect(sim.ok && sim.errors.length === 0, `${base.manifest.id}: ${sim.errors.slice(0, 3).join('; ')}`);
            expect(sim.frames > 0 && Number.isFinite(sim.durationSec), `${base.manifest.id}: ${sim.frames} frames, ${sim.durationSec}s`);
          },
        ),
    },
    {
      name: 'the Check tab reports each kind of breakage a human can make, with a specific error',
      // Not a crash test: checkComixPack wraps its checks, so "returns a list" always holds. This asserts it NOTICES.
      build: () =>
        fc.property(packId, fc.constantFrom(...BREAKAGES.keys()), fc.nat(), (id, b, pick) => {
          const [label, apply] = BREAKAGES[b];
          const broken = structuredClone(packs.get(id));
          const page = pick % broken.pages.length;
          try {
            apply(broken, page);
          } catch {
            return; // this page lacks the part (no letters): nothing to break
          }
          const issues = checkComixPack(broken);
          expect(errorCount(issues) > baseErrors.get(id), `${id}: ${label} (page ${page}) added no error`);
          expect(issues.some((x) => x.severity === 'error' && !/malformed comix spec/.test(x.message)), `${id}: ${label} (page ${page}) was reported only as "malformed", not as a field error`);
        }),
    },
    {
      name: 'a corrupted comix never crashes the static check or the simulation: problems come back as issues (smoke)',
      // Found by this property: checkComixPack and simulateComixPack threw on null or mistyped fields (they now report).
      // Weak by design (the wrapper makes "returns a list" always true): the property above is the one that can fail on content.
      examples: [
        ['intro', 0, [{ path: ['cast'], how: 'null' }]],
        ['intro', 0, [{ path: ['stage'], how: 'delete' }]],
        ['intro', 1, [{ path: ['panels'], how: 'null' }]],
        ['outro', 0, [{ path: ['pages'], how: 'null' }]],
      ],
      build: () =>
        // One hand-edited file at a time: the manifest or one page, the way the editor saves them.
        fc.property(packId, fc.nat(), corruptions, (id, doc, ops) => {
          const base = packs.get(id);
          const broken = structuredClone(base);
          const which = doc % (base.pages.length + 1);
          if (which === 0) broken.manifest = corrupt(base.manifest, ops);
          else broken.pages[which - 1] = corrupt(base.pages[which - 1], ops);
          const issues = checkComixPack(broken);
          expect(Array.isArray(issues), 'checkComixPack did not return a list');
          const sim = simulateComixPack(broken);
          expect(typeof sim.ok === 'boolean' && Array.isArray(sim.errors), 'simulateComixPack did not return a result');
        }),
    },
    {
      name: 'the canonical writer reproduces every comix file byte for byte, and round-trips any JSON',
      build: () =>
        fc.property(fc.constantFrom(...files), jsonValue, (rel, value) => {
          const text = readFileSync(join(comixDir, rel), 'utf8');
          expect(stringifyComixJson(JSON.parse(text)) === text, `comix/${rel} is not in canonical form`);
          expect(JSON.stringify(JSON.parse(stringifyComixJson(value))) === JSON.stringify(value), 'round trip changed a value');
        }),
    },
    {
      name: 'cue time expressions resolve to finite numbers and add up (`CUE+d`, `CUE-d`, `+d`, plain seconds)',
      build: () =>
        fc.property(fc.dictionary(cueName, seconds, { minKeys: 1, maxKeys: 6 }), seconds, delta, fc.nat(), (cues, base, d, pick) => {
          const name = Object.keys(cues)[pick % Object.keys(cues).length];
          const close = (a, b) => Math.abs(a - b) < 1e-5;
          const cases = [
            [String(d), d], [`+${d}`, base + d], [`-${d}`, base - d], [name, cues[name]], [`${name}+${d}`, cues[name] + d], [`${name}-${d}`, cues[name] - d], [d, d],
          ];
          for (const [expr, want] of cases) {
            const got = resolveTime(expr, cues, base);
            expect(Number.isFinite(got) && close(got, want), `resolveTime(${JSON.stringify(expr)}) = ${got}, want ${want}`);
          }
        }),
    },
    {
      name: 'stage.props transforms (zOrder, scale, rotation) and prop-targeted actor_motion tracks validate & simulate cleanly',
      build: () =>
        fc.property(
          packId,
          fc.record({
            zOrder: fc.double({ min: -3, max: 3, noNaN: true }).map((n) => Number(n.toFixed(1))),
            scale: fc.tuple(
              fc.double({ min: 0.6, max: 1.6, noNaN: true }).map((n) => Number(n.toFixed(2))),
              fc.double({ min: 0.6, max: 1.6, noNaN: true }).map((n) => Number(n.toFixed(2))),
              fc.double({ min: 0.6, max: 1.6, noNaN: true }).map((n) => Number(n.toFixed(2))),
            ),
            rot: fc.tuple(fc.integer({ min: -25, max: 25 }), fc.integer({ min: -25, max: 25 }), fc.integer({ min: -35, max: 35 })),
          }),
          (id, xform) => {
            const copy = structuredClone(packs.get(id));
            const page = copy.pages[0];
            copy.manifest.stage.props = [
              ...(copy.manifest.stage.props ?? []),
              { id: 'cfg_prop_probe', model: 'prop.coffee_mug', at: { x: 2.1, y: 0.8, z: 0.4 }, visible: true, zOrder: xform.zOrder, scale: xform.scale, rotation: xform.rot },
            ];
            page.tracks = [
              ...(page.tracks ?? []),
              {
                kind: 'actor_motion',
                actor: 'cfg_prop_probe',
                from: String(page.from),
                until: String(page.until),
                fromPos: { x: 2.1, y: 0.8, z: 0.4 },
                toPos: { x: 2.5, y: 0.9, z: 0.4 },
                zOrderFrom: xform.zOrder,
                zOrderTo: xform.zOrder + 1,
                scaleVecFrom: xform.scale,
                scaleVecTo: [1, 1, 1],
                rotFrom: xform.rot,
                rotTo: 0,
              },
            ];
            const issues = checkComixPack(copy);
            expect(errorCount(issues) === 0, `${id} prop track check errors: ${JSON.stringify(issues.filter((x) => x.severity === 'error'))}`);
            const sim = simulateComixPack(copy);
            expect(sim.ok && sim.errors.length === 0, `${id} prop track sim errors: ${sim.errors.join('; ')}`);
          },
        ),
    },
  ];
}
