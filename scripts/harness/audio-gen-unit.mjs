#!/usr/bin/env node
// Unit suite of the ElevenLabs wrapper (spec .kiro/specs/audio-agent/, Req 5-9, 11), run in `npm run quality:agents`
// because it guards the credit cap. Runs audio-gen's `main` on a temp fixture with a fake `elevenlabs` and `ffmpeg`
// first on PATH: nothing here spends credits or touches the network.
//   node scripts/harness/audio-gen-unit.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { main, parseCli } from './audio-gen.mjs';
import { CAP, NOT_LOGGED_IN, RESERVE, capProblem } from './lib/audio-gen-cli.mjs';
import { makeFixture } from './lib/audio-gen-fakes.mjs';
import { patchManifest } from './lib/audio-gen-manifest.mjs';
import { NO_FFMPEG, postFilter } from './lib/audio-gen-post.mjs';
import { buildRequests } from './lib/audio-gen-request.mjs';
import { expandNames, loadRows, parseLength, rowFor } from './lib/audio-gen-rows.mjs';
import { testRunner } from './lib/test-kit.mjs';

const { test, count } = testRunner();
const fixtures = [];
const fixture = (opts) => {
  const f = makeFixture(opts);
  fixtures.push(f.dir);
  return f;
};
const run = (f, argv) => {
  const lines = [];
  const code = main(argv, { root: f.root, env: f.env, log: (l) => lines.push(l) });
  return { code, out: lines.join('\n') };
};
const requests = (f) => f.calls().filter((a) => a.includes('--output') && !a.includes('--dry-run'));
const read = (f, rel) => readFileSync(join(f.root, rel), 'utf8');

await test('rows: names, ranges and lengths are read the way the lists write them', () => {
  assert.deepEqual(expandNames('`key_press`'), ['key_press']);
  assert.deepEqual(expandNames('`taunt_clod_1` .. `_3`'), ['taunt_clod_1', 'taunt_clod_2', 'taunt_clod_3']);
  assert.deepEqual(expandNames('`kiro_advice` / `_2` .. `_3`'), ['kiro_advice', 'kiro_advice_2', 'kiro_advice_3']);
  assert.deepEqual(expandNames('`../etc`'), []);
  assert.deepEqual(parseLength('48 s, loop'), { seconds: 48, loop: true });
  assert.deepEqual(parseLength('~2.7s'), { seconds: 2.7, loop: false });
  const f = fixture();
  const rows = loadRows(f.root);
  assert.equal(rowFor(rows, 'taunt_clod_2').row.kind, 'voice');
  assert.equal(rowFor(rows, 'taunt_clod_2').row.voice, 'George');
  assert.deepEqual([rowFor(rows, 'key_press_2').base, rowFor(rows, 'key_press_2').variant], ['key_press', 2]);
  assert.equal(rowFor(rows, 'menu_bed').row.group, 'music');
  assert.equal(rowFor(rows, 'nope'), null);
});

await test('requests: house settings, the output path comes from the cue name, a plan goes in as the JSON body', () => {
  const f = fixture();
  const rows = loadRows(f.root);
  const [sfx] = buildRequests({ root: f.root, row: rowFor(rows, 'key_press').row, name: 'key_press' });
  for (const w of ['text-to-sound-effects', 'eleven_text_to_sound_v3', 'mp3_44100_192', '0.8']) assert.ok(sfx.argv.includes(w), w);
  assert.equal(sfx.argv[sfx.argv.indexOf('--duration-seconds') + 1], '0.5', 'the API minimum, not the listed 0.1 s');
  assert.equal(sfx.argv.at(-1), join(f.root, 'public/sfx/key_press.mp3'));
  const loop = buildRequests({ root: f.root, row: rowFor(rows, 'rain_loop').row, name: 'rain_loop', variants: 2 });
  assert.deepEqual(loop.map((r) => r.out), ['public/sfx/rain_loop.mp3', 'public/sfx/rain_loop_2.mp3']);
  assert.ok(loop[0].argv.includes('--loop'));
  const [bed] = buildRequests({ root: f.root, row: rowFor(rows, 'menu_bed').row, name: 'menu_bed' });
  for (const w of ['music_v2_5', '24000', '--force-instrumental']) assert.ok(bed.argv.includes(w), w);
  const [planned] = buildRequests({ root: f.root, row: rowFor(rows, 'floor_x').row, name: 'floor_x' });
  assert.equal(JSON.parse(planned.argv[planned.argv.indexOf('--json') + 1]).composition_plan.chunks.length, 1);
  assert.ok(!planned.argv.includes('--prompt'), 'never a prompt and a plan together');
  assert.throws(() => buildRequests({ root: f.root, row: rowFor(rows, 'key_press').row, name: '../../x' }), /snake_case/);
  assert.throws(() => buildRequests({ root: f.root, row: rowFor(rows, 'taunt_clod_1').row, name: 'taunt_clod_1' }), /--text/);
});

await test('cli: unknown options (a path, --output) are refused; variants are 1 to 4', () => {
  assert.throws(() => parseCli(['plan', 'key_press', '--output', '/tmp/x']), /unknown option --output/);
  assert.throws(() => parseCli(['plan', 'key_press', '--variants', '9']), /1 to 4/);
  assert.equal(parseCli(['plan', 'a', 'b', '--generate']).cues.length, 2);
});

await test('dry run is the default: nothing is sent, no file is written, no balance or voice lookup', () => {
  const f = fixture();
  const before = read(f, 'public/sfx/manifest.json');
  const { code, out } = run(f, ['plan', 'key_press', 'taunt_clod_1', '--text', 'Pathetic bag of bones.']);
  assert.equal(code, 0);
  assert.match(out, /dry run: 2 request\(s\)/);
  assert.equal(requests(f).length, 0);
  assert.ok(f.calls().every((a) => a.includes('--dry-run')), 'only the CLI\'s local --dry-run ran');
  assert.ok(!out.includes('resolved'), 'the auth block of the dry run is not printed');
  assert.equal(read(f, 'public/sfx/manifest.json'), before);
});

await test('generate: writes the take, patches only its manifest entry, keeps every other byte, post-processes with ffmpeg', () => {
  const f = fixture();
  const before = read(f, 'public/sfx/manifest.json');
  const { code, out } = run(f, ['plan', 'key_press', '--generate']);
  assert.equal(code, 0, out);
  assert.equal(requests(f).length, 1);
  assert.match(read(f, 'public/sfx/key_press.mp3'), /fake-audio/);
  const after = read(f, 'public/sfx/manifest.json');
  assert.ok(after.startsWith(before.slice(0, before.indexOf('"bytes"'))), 'bytes before the entry are unchanged');
  assert.ok(after.endsWith(before.slice(before.indexOf('    }\n  ],'))), 'bytes after the entry are unchanged');
  assert.ok(after.includes('"duration_seconds": 0.5') && after.includes('"listed_seconds": 0.1'));
  const filter = f.ffmpegCalls().find((a) => a.includes('-af') && !a.includes('volumedetect'));
  assert.ok(filter[filter.indexOf('-af') + 1].includes('silenceremove') && filter.join(' ').includes('volume=3.00dB'), 'trim + gain to -3 dBFS from a -6 dB peak');
  assert.match(out, /spent so far 20/);
  assert.ok(!out.includes('sk_secret'), 'nothing of the subscription but counts and tier');
});

await test('generate: a retake takes the row\'s new length and loop flag instead of keeping the old ones', () => {
  const f = fixture();
  const list = join(f.root, 'docs/audio/SFX_LIST.md');
  writeFileSync(list, readFileSync(list, 'utf8').replace('| Key press | 0.1s |', '| Key press | 5s, loop |'));
  assert.equal(run(f, ['plan', 'key_press', '--generate']).code, 0);
  const entry = JSON.parse(read(f, 'public/sfx/manifest.json')).sounds.find((s) => s.name === 'key_press');
  assert.deepEqual([entry.listed_seconds, entry.duration_seconds, entry.loop], [5, 5, true]);
});

await test('generate: a new take is appended to the manifest, which stays valid JSON', () => {
  const f = fixture();
  const { code } = run(f, ['plan', 'key_press', '--variants', '2', '--generate']);
  assert.equal(code, 0);
  const doc = JSON.parse(read(f, 'public/sfx/manifest.json'));
  assert.deepEqual(doc.sounds.map((s) => s.name), ['key_press', 'key_press_2']);
  assert.equal(doc.variant_note, 'One kept take per cue.');
  assert.ok(read(f, 'public/sfx/manifest.json').includes('"duration_seconds": 0.5,'));
  const music = fixture();
  assert.equal(run(music, ['plan', 'menu_bed', '--generate']).code, 0);
  assert.equal(JSON.parse(read(music, 'public/music/manifest.json')).cues[0].plan_ms, 24000);
  assert.ok(music.ffmpegCalls().some((a) => a.includes('-filter_complex') && a.join(' ').includes('acrossfade=d=1.000')), 'loop join of one bar (80 BPM = 3 s, capped at a quarter of 4 s)');
});

await test('cap: over 15,000 estimated, or under the 30,000 reserve after the run, is refused before any request', () => {
  assert.equal(CAP, 15000);
  assert.equal(RESERVE, 30000);
  assert.match(capProblem(CAP + 1, 1e9), /over the cap/);
  assert.match(capProblem(100, RESERVE + 99), /reserve/);
  assert.equal(capProblem(100, RESERVE + 100), null);
  const low = fixture({ state: { used: 100000 - RESERVE - 50, limit: 100000 } });
  assert.throws(() => run(low, ['plan', 'taunt_clod_1', '--text', 'x'.repeat(200), '--generate']), /reserve/);
  assert.equal(requests(low).length, 0);
});

await test('cap: measured spend is read after every request and stops the run past the cap', () => {
  const f = fixture({ state: { costPerCall: CAP + 1 } });
  const { code, out } = run(f, ['plan', 'key_press', '--variants', '3', '--generate']);
  assert.equal(code, 1);
  assert.equal(requests(f).length, 1);
  assert.match(out, /stopped: measured spend 15001/);
});

await test('auth: not logged in fails with the login hint and sends nothing; a failed request names the CLI message only', () => {
  const f = fixture({ state: { loggedIn: false } });
  assert.throws(() => run(f, ['plan', 'key_press', '--generate']), (e) => e.message === NOT_LOGGED_IN);
  assert.throws(() => run(f, ['credits']), /elevenlabs auth login/);
  assert.ok(!f.calls().some((a) => a[0] === 'user'), 'no balance read without a login');
  const bad = fixture({ state: { failConvert: true } });
  assert.throws(() => run(bad, ['plan', 'key_press', '--generate']), /key_press: the request failed: quota exceeded/);
});

await test('voice: the id is looked up once and cached; the line and voice are stored in the entry', () => {
  const f = fixture();
  assert.equal(run(f, ['plan', 'taunt_clod_2', '--text', 'Pathetic bag of bones.', '--generate']).code, 0);
  assert.equal(run(f, ['plan', 'taunt_clod_3', '--text', 'Try harder, meatball.', '--generate']).code, 0);
  assert.equal(f.calls().filter((a) => a[0] === 'voices').length, 1);
  const conv = requests(f)[0];
  assert.equal(conv[conv.indexOf('--voice-id') + 1], 'voice-george');
  assert.ok(conv.includes('robot') && conv.includes('eleven_v4'));
  const entry = JSON.parse(read(f, 'public/sfx/manifest.json')).sounds.find((s) => s.name === 'taunt_clod_2');
  assert.deepEqual([entry.text, entry.voice, entry.duration_seconds], ['Pathetic bag of bones.', 'George', 4]);
});

await test('no ffmpeg: the raw take stays, the entry says post: false, exit 3 with the install hint', () => {
  const f = fixture({ ffmpeg: false });
  const { code, out } = run(f, ['plan', 'key_press', '--generate']);
  assert.equal(code, 3);
  assert.ok(out.includes(NO_FFMPEG));
  assert.match(read(f, 'public/sfx/key_press.mp3'), /fake-audio/);
  assert.equal(JSON.parse(read(f, 'public/sfx/manifest.json')).sounds[0].post, false);
  assert.equal(postFilter({ kind: 'sfx', loop: true, gainDb: 1, seconds: 10, bar: 2 }).filter, 'volume=1.00dB', 'an SFX loop is loopable from the API: gain only');
});

await test('--check: the fixture passes; orphans both ways, unlisted and unmapped names fail; no network', () => {
  const f = fixture();
  assert.equal(run(f, ['--check']).code, 0);
  writeFileSync(join(f.root, 'public/sfx/stray.mp3'), 'x');
  rmSync(join(f.root, 'public/sfx/key_press.mp3'));
  writeFileSync(join(f.root, 'public/music/manifest.json'), patchManifest(read(f, 'public/music/manifest.json'), 'cues', { name: 'menu_bed', files: [{ file: 'menu_bed.mp3', bytes: 1 }] }));
  writeFileSync(join(f.root, 'public/music/menu_bed.mp3'), 'x');
  writeFileSync(join(f.root, 'public/sfx/manifest.json'), patchManifest(read(f, 'public/sfx/manifest.json'), 'sounds', { name: 'not_listed', files: [] }));
  const { code, out } = run(f, ['--check']);
  assert.equal(code, 1);
  assert.match(out, /stray\.mp3 has no entry/);
  assert.match(out, /key_press names key_press\.mp3, which is missing/);
  assert.match(out, /not_listed is in no row/);
  assert.match(out, /menu_bed is played by no app event or scene/);
  assert.match(out, /audio check FAILED \(5\)/, 'not_listed is also unmapped');
  assert.equal(f.calls().length, 0);
  assert.ok(existsSync(join(f.root, 'public/music/menu_bed.mp3')));
});

for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
console.log(`\naudio-gen unit: ${count()} tests passed`);
