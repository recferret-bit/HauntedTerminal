// Test doubles for audio-gen-unit.mjs: a fake `elevenlabs` and a fake `ffmpeg` (Node scripts first on a temp PATH, so no
// test spends credits or needs a network), and a small fixture tree with the two lists, both manifests and a mapping.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The fake CLI. State in $FAKE_DIR/state.json: `{ used, limit, loggedIn, costPerCall }`. Every call is appended to
 * $FAKE_DIR/calls.jsonl. A request with --output writes a stub mp3 and adds costPerCall to `used`.
 */
const FAKE_ELEVENLABS = `
const fs = require('fs'); const path = require('path');
const dir = process.env.FAKE_DIR; const argv = process.argv.slice(2);
fs.appendFileSync(path.join(dir, 'calls.jsonl'), JSON.stringify(argv) + '\\n');
const state = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
const out = (v) => process.stdout.write(JSON.stringify(v));
const flag = (f) => { const i = argv.indexOf(f); return i < 0 ? undefined : argv[i + 1]; };
if (argv[0] === 'auth') out({ schemes: [{ logged_in: state.loggedIn, sources: [{ state: state.loggedIn ? 'active' : 'missing' }] }] });
else if (argv[0] === 'user') out({ character_count: state.used, character_limit: state.limit, tier: 'creator', xi_api_key: 'sk_secret' });
else if (argv[0] === 'voices') out([{ id: 'voice-george', name: 'George - Warm' }]);
else if (argv.includes('--schema')) out({ operation: argv.slice(0, 2).join('.') });
else if (argv.includes('--dry-run')) out({ method: 'POST', url: 'https://api.example/' + argv[0], body: { n: argv.length }, auth: { credentials: 'resolved' } });
else if (flag('--output')) {
  if (state.failConvert) { process.stderr.write('{"error":{"message":"quota exceeded"}}'); process.exit(1); }
  fs.writeFileSync(flag('--output'), Buffer.from('ID3fake-audio-' + argv[0]));
  state.used += state.costPerCall; fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state));
}
`;

/** The fake ffmpeg: `-version`; a volumedetect pass prints a -6 dB peak and a 4 s duration; anything else copies input to the last arg. */
const FAKE_FFMPEG = `
const fs = require('fs'); const path = require('path');
const argv = process.argv.slice(2);
fs.appendFileSync(path.join(process.env.FAKE_DIR, 'ffmpeg.jsonl'), JSON.stringify(argv) + '\\n');
if (argv[0] === '-version') process.exit(0);
const input = argv[argv.indexOf('-i') + 1];
if (argv.includes('volumedetect')) { process.stderr.write('  Duration: 00:00:04.00, start: 0\\n[Parsed_volumedetect_0] max_volume: -6.0 dB\\n'); process.exit(0); }
fs.copyFileSync(input, argv.at(-1));
`;

const SFX_LIST = `# Sound effects list

| # | Name | Effect (trigger) | Length | Prompt |
|---|---|---|---|---|
| 1 | \`key_press\` | Key press | 0.1s | A key "clack". Total length: 0.1 seconds. |
| 2 | \`rain_loop\` | Rain | 10s, loop | Rain on a window. |
| 13d | \`taunt_clod_1\` .. \`_3\` | Clod taunt voice | ~3s | ElevenLabs \`eleven_v4\` + \`robot\` filter (\`George\`): taunts. |
| 14 | \`kiro_advice\` / \`_2\` .. \`_3\` | Kiro voice | ~2.7s | ElevenLabs \`eleven_v4\` + \`robot\` filter (\`Jessica\`): cheers. |
`;
const MUSIC_LIST = `# Music list

| # | Name | Where it plays | Length | Prompt |
|---|---|---|---|---|
| 2 | \`menu_bed\` | Esc menu | 24 s, loop | Tracker pad, A minor, 80 BPM, eight bars. Total length: 24 seconds. |
| 9 | \`floor_x\` | A floor | 40 s, loop | 96 BPM floor. |
`;
/** Written the way the real manifests are (Python json, indent 2, `0.5`/`4.0` floats). */
const SFX_MANIFEST = `{
  "model": "eleven_text_to_sound_v3",
  "sounds": [
    {
      "row": 1,
      "name": "key_press",
      "effect": "Key press",
      "listed_seconds": 0.1,
      "duration_seconds": 0.5,
      "loop": false,
      "files": [
        {
          "file": "key_press.mp3",
          "bytes": 3
        }
      ]
    }
  ],
  "variant_note": "One kept take per cue."
}`;
const MUSIC_MANIFEST = `{
  "model": "music_v2_5",
  "cues": []
}`;

/** A fresh fixture root and fake bin. `state` overrides the CLI state. Returns `{ root, dir, env, calls(), ffmpegCalls() }`. */
export function makeFixture({ state = {}, ffmpeg = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'audio-gen-'));
  const root = join(dir, 'root');
  const bin = join(dir, 'bin');
  const write = (rel, text) => {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  write('docs/audio/SFX_LIST.md', SFX_LIST);
  write('docs/audio/MUSIC_LIST.md', MUSIC_LIST);
  write('public/sfx/manifest.json', SFX_MANIFEST);
  write('public/music/manifest.json', MUSIC_MANIFEST);
  write('public/sfx/key_press.mp3', 'ID3');
  write('public/music/plans/floor_x.json', JSON.stringify({ name: 'floor_x', plan_ms: 40000, plan: { chunks: [{ duration_ms: 40000, text: 'x' }] } }));
  write('src/audio/sfx-map.ts', "export const MAP = ['key_press'];\n");
  write('src/audio/catalog.ts', "export const SFX_IDS = ['key_press', 'only_in_catalog'];\n");
  mkdirSync(bin, { recursive: true });
  const script = (name, body) => {
    writeFileSync(join(bin, name), `#!${process.execPath}\n${body}`);
    chmodSync(join(bin, name), 0o755);
  };
  script('elevenlabs', FAKE_ELEVENLABS);
  if (ffmpeg) script('ffmpeg', FAKE_FFMPEG);
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ used: 1000, limit: 100000, loggedIn: true, costPerCall: 20, ...state }));
  writeFileSync(join(dir, 'calls.jsonl'), '');
  writeFileSync(join(dir, 'ffmpeg.jsonl'), '');
  const lines = (f) => readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { root, dir, env: { PATH: bin, FAKE_DIR: dir, HOME: dir }, calls: () => lines('calls.jsonl'), ffmpegCalls: () => lines('ffmpeg.jsonl') };
}
