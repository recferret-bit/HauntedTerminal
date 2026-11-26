#!/usr/bin/env node
// Deterministic unit & real ffmpeg-static + fake ElevenLabs test suite for the Out Of Credits social media harness.
//   node scripts/harness/social-unit.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NOT_LOGGED_IN } from './lib/audio-gen-cli.mjs';
import { makeFixture } from './lib/audio-gen-fakes.mjs';
import { projectRoot } from './lib/load.mjs';
import { runSocialAudioCli } from './lib/social-audio.mjs';
import { assertSafeOutPath, compressBundle, duration, hasAudioStream, muxSoundtrack, renderContactSheet, renderVideoOutputs, resolveFfmpeg } from './lib/social-ffmpeg.mjs';
import { compactTimedCues, cuesForKernelEvent, keystrokeCues } from './lib/social-game-sfx.mjs';
import { renderInfographicMarkup } from './lib/social-infographics.mjs';
import { checkSocialSpecs, readInfographicsSpec, readScreenshotsSpec, readSocialAudioSpec, readVideoSpec } from './lib/social-spec.mjs';
import { testRunner } from './lib/test-kit.mjs';
import { main as socialMain } from './social-media.mjs';

const { test, count } = testRunner();

function withTempSpec(obj, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ooc-social-spec-'));
  const file = path.join(dir, 'spec.json');
  try {
    fs.writeFileSync(file, JSON.stringify(obj));
    return fn(file, dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

await test('checkSocialSpecs: real repository specs, audio references and $1M research pass with zero errors', async () => {
  assert.deepEqual(checkSocialSpecs(projectRoot), []);
  const lines = [];
  const code = await socialMain(['--check'], { root: projectRoot, log: (l) => lines.push(l) });
  assert.equal(code, 0);
  assert.match(lines.join('\n'), /social check OK/);

  for (const specName of ['x-teaser.video.json', 'youtube-trailer.video.json', 'tiktok-hook.video.json']) {
    const sp = readVideoSpec(path.join(projectRoot, 'social/media/specs', specName), { root: projectRoot });
    assert.ok(sp.total <= sp.maxSeconds);
    assert.ok(sp.audio?.music?.abs && fs.existsSync(sp.audio.music.abs), `${specName} music exists`);
    for (const c of sp.audio.resolvedCues) assert.ok(fs.existsSync(c.abs), `${specName} cue ${c.cue} exists`);
  }
  const tt = readVideoSpec(path.join(projectRoot, 'social/media/specs/tiktok-hook.video.json'), { root: projectRoot });
  assert.equal(tt.width, 1080);
  assert.equal(tt.height, 1920);
  assert.equal(tt.look, 'vertical');
});

await test('readVideoSpec: dynamic {chapter}/{level:N} resolution, portrait defaults and negative boundary guards', () => {
  withTempSpec({
    name: 'tiktok_auto_portrait',
    platform: 'tiktok',
    audio: 'title_theme',
    scenes: [
      {
        id: 'hook',
        dur: 3.5,
        mode: 'play',
        level: 3,
        skin: 'vt100',
        setup: [{ ticks: 75 }, { solution: { level: 3, count: 1 } }],
        events: [{ t: 0.4, do: 'typeAndSubmit', line: 'ls -la', cps: 20 }],
        sfx: [{ at: 0.2, cue: 'lightning', gainDb: -1 }],
        pills: [{ at: 0.2, dur: 2.8, pos: 'top-center', items: ['$ ls -la'] }],
        bursts: [{ at: 0.3, dur: 1.0, text: 'ZAP!', pos: 'top-right', accent: 'amber' }],
        captions: [{ n: '01', head: 'REAL UNIX TERMINAL', at: 0.2, dur: 3.0 }],
      },
      {
        id: 'laptop_scene',
        dur: 2.0,
        mode: 'laptop',
        laptop: { state: 'desktop', speed: 0, task: 'js-add' },
      },
      {
        id: 'sb_scene',
        dur: 2.0,
        mode: 'storybook',
        storybook: { inspect: 'boss.kernel', state: 'attack', from: 0.2, to: 1.8, ui: false },
      },
    ],
  }, (f) => {
    const sp = readVideoSpec(f, { root: projectRoot });
    assert.equal(sp.width, 1080);
    assert.equal(sp.height, 1920);
    assert.match(sp.scenes[0].url, /^\/play\/chapter-01-kiroween\/level-03-/);
    assert.equal(sp.scenes[0].setup.length, 2);
    assert.deepEqual(sp.scenes[0].setup[0], { ticks: 75 });
    assert.equal(sp.scenes[1].laptop.ui, false);
    assert.equal(sp.scenes[1].laptop.task, 'js-add');
    assert.equal(sp.scenes[2].storybook.guides, false);
    assert.match(sp.scenes[2].url, /guides=0/);
    assert.equal(sp.audio.resolvedCues.length, 1);
    assert.ok(sp.audio.music.abs.endsWith('public/music/title_theme.mp3'));
  });

  // Negative schema & boundary checks
  assert.throws(() => withTempSpec({ name: 'bad slug!', scenes: [{ dur: 2 }] }, (f) => readVideoSpec(f, { root: projectRoot })), /name/);
  assert.throws(() => withTempSpec({ name: 'empty_scenes', scenes: [] }, (f) => readVideoSpec(f, { root: projectRoot })), /scenes/);
  assert.throws(() => withTempSpec({ name: 'over_max', maxSeconds: 4, scenes: [{ dur: 5 }] }, (f) => readVideoSpec(f, { root: projectRoot })), /exceeds maxSeconds/);
  assert.throws(() => withTempSpec({ name: 'bad_mode', audio: false, scenes: [{ dur: 2, mode: 'vr' }] }, (f) => readVideoSpec(f, { root: projectRoot })), /mode/);
  assert.throws(() => withTempSpec({ name: 'bad_skin', audio: false, scenes: [{ dur: 2, mode: 'play', skin: 'powershell-xp' }] }, (f) => readVideoSpec(f, { root: projectRoot })), /skin/);
  assert.throws(() => withTempSpec({ name: 'bad_lvl', audio: false, scenes: [{ dur: 2, mode: 'play', level: 99 }] }, (f) => readVideoSpec(f, { root: projectRoot })), /no level index 99/);
  assert.throws(() => withTempSpec({ name: 'bad_ticks', audio: false, scenes: [{ dur: 2, mode: 'play', setup: [{ ticks: 0 }] }] }, (f) => readVideoSpec(f, { root: projectRoot })), /ticks/);
  assert.throws(() => withTempSpec({ name: 'bad_task', audio: false, scenes: [{ dur: 2, mode: 'laptop', laptop: { task: 'bad task!' } }] }, (f) => readVideoSpec(f, { root: projectRoot })), /laptop\.task/);
  assert.throws(() => withTempSpec({ name: 'bad_ev_t', audio: false, scenes: [{ dur: 2, events: [{ t: 2.5, do: 'tick' }] }] }, (f) => readVideoSpec(f, { root: projectRoot })), /events\[0\]\.t/);
  assert.throws(() => withTempSpec({ name: 'bad_dlg', audio: false, scenes: [{ dur: 3, dialogs: [{ title: 'T', rows: [] }] }] }, (f) => readVideoSpec(f, { root: projectRoot })), /rows/);
  assert.throws(() => withTempSpec({ name: 'bad_cue', audio: 'missing_bed_xyz', scenes: [{ dur: 2 }] }, (f) => readVideoSpec(f, { root: projectRoot })), /not found/);

  // --out path sandbox: refuses repo source/baselines/public paths so no agent can bypass fs_write fences
  for (const unsafe of ['src/game', 'docs/qa/baselines', 'public/music/title_theme.mp3', '../outside']) {
    assert.throws(() => assertSafeOutPath(path.resolve(projectRoot, unsafe), projectRoot), /--out must be inside/);
  }
  assert.ok(assertSafeOutPath(path.join(projectRoot, 'social/media/out/video/custom'), projectRoot).endsWith('custom'));
  assert.ok(assertSafeOutPath(path.join(os.tmpdir(), 'ooc-safe-out'), projectRoot).endsWith('ooc-safe-out'));
});

await test('screenshots & infographics specs: cross-references, markup escaping and planted failure detection', () => {
  const shots = readScreenshotsSpec(path.join(projectRoot, 'social/media/specs/screenshots.spec.json'), { root: projectRoot });
  const ig = readInfographicsSpec(path.join(projectRoot, 'social/media/specs/infographics.spec.json'));
  assert.equal(shots.shots.length, 10);
  assert.equal(ig.cards.length, 6);

  for (const card of ig.cards) {
    const html = renderInfographicMarkup(card, { hasScreenshot: true });
    assert.ok(html.includes('<svg class="ig-svg"'), `${card.id} renders SVG diagram`);
    assert.ok(html.includes(`data-diagram-kind="${card.diagram.kind}"`));
    assert.ok(html.includes(card.diagram.caption.replaceAll('>', '&gt;')), `${card.id} renders full diagram caption without mid-word truncation`);
    assert.ok(html.includes(`/__social_assets/${encodeURIComponent(card.screenshot)}`));
    const fallbackHtml = renderInfographicMarkup({ ...card, title: 'A <script> & "quote"' }, { hasScreenshot: false });
    assert.ok(fallbackHtml.includes('&lt;script&gt;') && !fallbackHtml.includes('<script>'));
  }
  const loopCard = ig.cards.find((c) => c.diagram.kind === 'loop');
  assert.ok(loopCard && renderInfographicMarkup(loopCard).includes('stroke-dasharray="6 4"'));
  const vsHtml = renderInfographicMarkup({ ...ig.cards[0], diagram: { ...ig.cards[0].diagram, kind: 'versus' } });
  assert.ok(vsHtml.includes('>VS</text>'));

  // Planted broken tree fails checkSocialSpecs cleanly
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ooc-bad-social-'));
  try {
    fs.mkdirSync(path.join(tmpRoot, 'social/media/specs'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'social/research'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'social/media/specs/screenshots.spec.json'), JSON.stringify({
      shots: [{ id: 'only-one', title: 'One', mode: 'laptop', dur: 2 }],
    }));
    fs.symlinkSync(path.join(projectRoot, 'chapters'), path.join(tmpRoot, 'chapters'));
    fs.writeFileSync(path.join(tmpRoot, 'social/media/specs/infographics.spec.json'), JSON.stringify({
      cards: [{ ...ig.cards[0], screenshot: 'missing-shot.png' }],
    }));
    fs.writeFileSync(path.join(tmpRoot, 'social/research/competitors-and-benchmarks.json'), JSON.stringify({
      revenueTargetUsd: 500,
      comparables: [],
    }));
    const probs = checkSocialSpecs(tmpRoot);
    assert.ok(probs.some((p) => p.includes('missing-shot.png')));
    assert.ok(probs.some((p) => p.includes('revenueTargetUsd')));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

await test('cuesForKernelEvent & keystrokeCues: gameplay events map to existing public/sfx files and deduplicate cleanly', () => {
  const sampleEvents = [
    { type: 'BATTLE_STARTED' },
    { type: 'ENEMY_STATE', state: 'petrified' },
    { type: 'ENEMY_KILLED', how: 'SIGKILL', model: 'boss.kernel' },
    { type: 'AGENT_TAUNT', agent: 'clod' },
    { type: 'LANTERN_REVEAL' },
    { type: 'ACHIEVEMENT_UNLOCKED' },
    { type: 'FLOOR_CLEARED' },
  ];
  const mapped = sampleEvents.flatMap(cuesForKernelEvent);
  assert.ok(mapped.includes('battle_start') && mapped.includes('petrify') && mapped.includes('boss_defeated') && mapped.includes('taunt_clod_1'));
  for (const cue of mapped) {
    assert.ok(fs.existsSync(path.join(projectRoot, 'public/sfx', `${cue}.mp3`)), `public/sfx/${cue}.mp3 must exist`);
  }

  const keys = keystrokeCues(1.0, 'ls -la', 20, true);
  assert.equal(keys.at(-1).cue, 'key_enter');
  const compacted = compactTimedCues([
    { at: 0.5, cue: 'kill' },
    { at: 0.52, cue: 'kill' },
    { at: 0.8, cue: 'kill' },
    { at: 9.99, cue: 'kill' },
  ], { maxDuration: 10, minGapSec: 0.1 });
  assert.equal(compacted.length, 2);
});

await test('real ffmpeg-static: frame render, square/portrait crop, multi-track in-game music + SFX + VO mix, --add-audio & compressBundle', async () => {
  const ff = resolveFfmpeg();
  assert.ok(fs.existsSync(ff) || ff === 'ffmpeg');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ooc-ff-enc-'));
  try {
    const frames = path.join(dir, 'frames');
    fs.mkdirSync(frames);
    execFileSync(ff, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=12:duration=2',
      '-start_number', '0', path.join(frames, 'f%05d.png'),
    ]);

    const out = renderVideoOutputs({
      name: 'unit_clip',
      fps: 12,
      total: 2,
      width: 320,
      height: 180,
      crop: 'square',
      gif: { maxMB: 5, width: 160, fps: 8 },
    }, frames, path.join(dir, 'rendered'), { preview: false });
    assert.ok(fs.existsSync(out.mp4) && fs.existsSync(out.gif) && fs.existsSync(out.sheet));

    const sheet2 = renderContactSheet([path.join(frames, 'f00000.png'), path.join(frames, 'f00005.png')], path.join(dir, 'shots-contact.jpg'));
    assert.ok(fs.existsSync(sheet2));

    // Multi-track mix: in-game music bed + 2 timed in-game SFX + voiceover
    const muxed = muxSoundtrack(out.mp4, {
      music: { abs: path.join(projectRoot, 'public/music/title_theme.mp3'), offset: 1, fadeIn: 0.2, fadeOut: 0.4, gainDb: -3, duckDb: -4, loop: true },
      voiceover: { abs: path.join(projectRoot, 'public/sfx/kiro_advice.mp3'), at: 0.2, gainDb: 1.0 },
      resolvedCues: [
        { at: 0.1, abs: path.join(projectRoot, 'public/sfx/lightning.mp3'), gainDb: -2 },
        { at: 0.9, abs: path.join(projectRoot, 'public/sfx/petrify.mp3'), gainDb: -1 },
      ],
    }, out.mp4, { clipDur: 2 });
    assert.equal(muxed.tracks, 4);
    assert.equal(hasAudioStream(out.mp4), true);
    const dur = duration(out.mp4);
    assert.ok(Math.abs(dur - 2) < 0.2, `expected ~2.0s duration, got ${dur}`);

    const bundle = compressBundle(out.mp4);
    assert.equal(hasAudioStream(bundle.minMp4.file), true);
    assert.ok(bundle.minGif.bytes > 500 && bundle.tinyGif && bundle.tinyGif.bytes <= 500 * 1024);

    // Standalone --add-audio on silent .mov preserves input and writes .voiced.mp4
    const silentMov = path.join(dir, 'raw.mov');
    execFileSync(ff, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=12:duration=1.5',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', silentMov,
    ]);
    const addCode = await socialMain(['video', '--add-audio', silentMov, 'title_theme', '--no-compress'], { root: projectRoot, log: () => {} });
    assert.equal(addCode, 0);
    const voicedMp4 = path.join(dir, 'raw.voiced.mp4');
    assert.equal(fs.existsSync(voicedMp4), true);
    assert.equal(hasAudioStream(voicedMp4), true);
    await assert.rejects(
      () => socialMain(['video', 'social/media/specs/x-teaser.video.json', '--preview', '--out', path.join(projectRoot, 'src/game')], { root: projectRoot, log: () => {} }),
      /--out must be inside/,
    );
    await assert.rejects(
      () => socialMain(['video', '--add-audio', silentMov, 'title_theme', '--out', path.join(projectRoot, 'public/music/title_theme.mp3')], { root: projectRoot, log: () => {} }),
      /--out must be inside/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

await test('social ElevenLabs wrapper: dry-run default, generate + manifest, 15k cap, 30k reserve & Keychain login checks', () => {
  const f = makeFixture();
  try {
    const audioSpec = readSocialAudioSpec(path.join(projectRoot, 'social/media/specs/audio-cues.json'));
    assert.ok(audioSpec.cues.length >= 6);
    fs.mkdirSync(path.join(f.root, 'social/media/specs'), { recursive: true });
    fs.copyFileSync(path.join(projectRoot, 'social/media/specs/audio-cues.json'), path.join(f.root, 'social/media/specs/audio-cues.json'));

    // 1. Default plan is dry-run across voice, robot-filtered voice, sfx & music (--json body): zero files written
    const dryLines = [];
    assert.equal(runSocialAudioCli(['plan', 'vo_tiktok_hook', 'vo_clod_social_taunt', 'sfx_social_panel_rip', 'music_social_short_loop'], { root: f.root, env: f.env, log: (l) => dryLines.push(l) }), 0);
    assert.match(dryLines.join('\n'), /dry run: 4 request\(s\)/);
    const musicCall = f.calls().find((a) => a[0] === 'music' && a[1] === 'compose');
    assert.ok(musicCall && musicCall.includes('--json'), 'music compose uses --json body');
    assert.equal(f.calls().filter((a) => a.includes('--output') && !a.includes('--dry-run')).length, 0);
    assert.equal(fs.existsSync(path.join(f.root, 'social/media/out/audio/vo_tiktok_hook.mp3')), false);

    // 2. --generate writes mp3 + manifest.json and post-processes (including robot filter voice cue)
    const genLines = [];
    assert.equal(runSocialAudioCli(['plan', 'vo_tiktok_hook', 'vo_clod_social_taunt', '--generate'], { root: f.root, env: f.env, log: (l) => genLines.push(l) }), 0);
    assert.equal(fs.existsSync(path.join(f.root, 'social/media/out/audio/vo_tiktok_hook.mp3')), true);
    assert.equal(fs.existsSync(path.join(f.root, 'social/media/out/audio/vo_clod_social_taunt.mp3')), true);
    const manifest = JSON.parse(fs.readFileSync(path.join(f.root, 'social/media/out/audio/manifest.json'), 'utf8'));
    assert.equal(manifest.takes[0].name, 'vo_tiktok_hook');
    assert.equal(manifest.takes[0].voice, 'George');

    // 3. Unknown option (--output) & unknown cue are rejected
    assert.throws(() => runSocialAudioCli(['plan', 'vo_tiktok_hook', '--output', '/tmp/x.mp3'], { root: f.root, env: f.env, log: () => {} }), /unknown audio option/);
    assert.throws(() => runSocialAudioCli(['plan', 'nonexistent_cue'], { root: f.root, env: f.env, log: () => {} }), /unknown social audio cue/);
  } finally {
    fs.rmSync(f.dir, { recursive: true, force: true });
  }

  // 4. Reserve & not-logged-in refusals
  const low = makeFixture({ state: { used: 100000 - 29990, limit: 100000 } });
  const unauth = makeFixture({ state: { loggedIn: false } });
  try {
    for (const fx of [low, unauth]) {
      fs.mkdirSync(path.join(fx.root, 'social/media/specs'), { recursive: true });
      fs.copyFileSync(path.join(projectRoot, 'social/media/specs/audio-cues.json'), path.join(fx.root, 'social/media/specs/audio-cues.json'));
    }
    assert.throws(() => runSocialAudioCli(['plan', 'vo_tiktok_hook', '--generate'], { root: low.root, env: low.env, log: () => {} }), /reserve/);
    assert.throws(() => runSocialAudioCli(['plan', 'vo_tiktok_hook', '--generate'], { root: unauth.root, env: unauth.env, log: () => {} }), (e) => e.message === NOT_LOGGED_IN);
  } finally {
    fs.rmSync(low.dir, { recursive: true, force: true });
    fs.rmSync(unauth.dir, { recursive: true, force: true });
  }
});

console.log(`\nsocial unit: ${count()} tests passed`);
