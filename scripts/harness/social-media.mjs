#!/usr/bin/env node
// Unified declarative Social Media Harness for Out Of Credits (spec .kiro/specs/social-smm-agent/).
// Owned by lead-dev (holds the ElevenLabs credit cap via social-audio.mjs).
//   node scripts/harness/social-media.mjs --check
//   node scripts/harness/social-media.mjs video <spec.json> [--preview] [--silent] [--audio <cue|file>] [--only a-b] [--remux] [--compress] [--keep] [--out <dir>]
//   node scripts/harness/social-media.mjs video --add-audio <in.mp4> <cue|song.mp3|spec.json> [--out <out.mp4>] [--no-compress]
//   node scripts/harness/social-media.mjs screenshots [filter] [--spec <file>] [--out <dir>]
//   node scripts/harness/social-media.mjs infographics [filter] [--spec <file>] [--out <dir>]
//   node scripts/harness/social-media.mjs audio plan <cue>... [--variants N] [--generate] | credits | list
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectRoot } from './lib/load.mjs';
import { runSocialAudioCli } from './lib/social-audio.mjs';
import { captureScreenshotsSuite, captureVideoFrames } from './lib/social-capture.mjs';
import { assertSafeOutPath, compressBundle, duration, muxSoundtrack, renderVideoOutputs, swapDir } from './lib/social-ffmpeg.mjs';
import { compactTimedCues } from './lib/social-game-sfx.mjs';
import { renderInfographicsSuite } from './lib/social-infographics.mjs';
import { checkSocialSpecs, readInfographicsSpec, readScreenshotsSpec, readVideoSpec, resolveSocialAudioFile } from './lib/social-spec.mjs';

const kb = (b) => `${(b / 1024).toFixed(0)} kB`;
const mb = (b) => `${(b / 1048576).toFixed(2)} MB`;

function argVal(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

async function runVideoCmd(args, { root = projectRoot, env = process.env, log = console.log } = {}) {
  const has = (k) => args.includes(k);
  const addTarget = argVal(args, '--add-audio');
  if (addTarget) {
    const pos = args.find((a, i) => !a.startsWith('--') && a !== addTarget && (i === 0 || !['--add-audio', '--out'].includes(args[i - 1])));
    if (!pos) throw new Error('usage: social-media.mjs video --add-audio <in.mp4> <cue|song.mp3|spec.json> [--out <out.mp4>]');
    const mp4In = path.resolve(addTarget);
    const parsed = path.parse(mp4In);
    const defOut = path.join(parsed.dir, `${parsed.name}${parsed.name.endsWith('.voiced') ? '.revoiced' : '.voiced'}.mp4`);
    const outArg = argVal(args, '--out');
    const mp4Out = outArg ? assertSafeOutPath(outArg, root) : assertSafeOutPath(defOut, root);
    const dur = duration(mp4In, env);
    if (!dur) throw new Error(`could not read duration of ${mp4In}`);
    const audioCfg = pos.toLowerCase().endsWith('.json')
      ? (() => {
        const sp = readVideoSpec(pos, { root });
        if (!sp.audio) throw new Error(`spec ${sp.name} has audio disabled`);
        return sp.audio;
      })()
      : resolveSocialAudioFile(pos, { root, specDir: process.cwd(), group: 'music', mustExist: true });
    const m = muxSoundtrack(mp4In, audioCfg, mp4Out, { clipDur: dur, env });
    log(`voiced ${mp4Out} (${dur.toFixed(2)}s, ${mb(m.bytes)}, ${m.tracks} track(s))`);
    if (!has('--no-compress')) {
      const c = compressBundle(mp4Out, { env });
      log(`  min.mp4 ${mb(c.minMp4.bytes)}  min.gif ${mb(c.minGif.bytes)}${c.tinyGif ? `  tiny.gif ${kb(c.tinyGif.bytes)}` : ''}`);
    }
    return 0;
  }

  const specArg = args.find((a, i) => !a.startsWith('--') && (i === 0 || !['--only', '--out', '--audio'].includes(args[i - 1])));
  if (!specArg) throw new Error('usage: social-media.mjs video <spec.json> [--preview] [--silent] [--audio <cue|file>] [--only a-b] [--remux] [--compress]');

  const preview = has('--preview');
  const silent = has('--silent') || has('--video-only');
  const remux = has('--remux');
  const compressOnly = has('--compress');
  const onlyArg = argVal(args, '--only');
  const only = onlyArg ? onlyArg.split('-').map(Number) : null;
  if (only && (only.length !== 2 || !Number.isFinite(only[0]) || !Number.isFinite(only[1]) || only[0] < 0 || only[1] <= only[0])) {
    throw new Error(`--only must be <startSec>-<endSec> with 0 <= start < end (got "${onlyArg}")`);
  }

  const spec = readVideoSpec(specArg, { root });
  const audioOverride = argVal(args, '--audio');
  if (audioOverride) {
    const abs = resolveSocialAudioFile(audioOverride, { root, specDir: process.cwd(), group: 'music', mustExist: true });
    spec.audio = {
      music: { src: audioOverride, abs, offset: 0, fadeIn: 0.35, fadeOut: 1.8, gainDb: -2, duckDb: -5, loop: true },
      voiceover: null,
      resolvedCues: spec.audio?.resolvedCues ?? [],
      autoGameSfx: spec.audio?.autoGameSfx ?? true,
    };
  }
  if (preview) {
    spec.width = Math.max(240, Math.round(spec.width / 2));
    spec.height = Math.max(240, Math.round(spec.height / 2));
    spec.fps = 12;
  }

  const suffix = preview ? '-preview' : only ? '-partial' : '';
  const videoRoot = path.join(root, 'social/media/out/video');
  const outArg = argVal(args, '--out');
  const dest = outArg ? assertSafeOutPath(outArg, root) : path.join(videoRoot, `${spec.name}${suffix}`);
  const mp4Live = path.join(dest, `${spec.name}.mp4`);

  if (compressOnly) {
    const c = compressBundle(mp4Live, { env });
    log(`${spec.name}: min.mp4 ${mb(c.minMp4.bytes)}  min.gif ${mb(c.minGif.bytes)}${c.tinyGif ? `  tiny.gif ${kb(c.tinyGif.bytes)}` : ''}`);
    return 0;
  }
  if (remux) {
    if (!fs.existsSync(mp4Live)) throw new Error(`no video at ${mp4Live} to remux`);
    if (!spec.audio) throw new Error(`spec ${spec.name} has no audio configured`);
    const m = muxSoundtrack(mp4Live, spec.audio, mp4Live, { env });
    const c = compressBundle(mp4Live, { env });
    log(`remux -> ${path.relative(root, mp4Live)} (${mb(m.bytes)}, ${m.tracks} track(s))  min.mp4 ${mb(c.minMp4.bytes)}`);
    return 0;
  }

  const stage = `${dest}.staging`;
  const framesDir = path.join(stage, '_frames');
  fs.rmSync(stage, { recursive: true, force: true });

  log(`${spec.name} (${spec.platform}): ${spec.scenes.length} scenes, ${spec.total.toFixed(2)}s @ ${spec.fps}fps (${spec.width}x${spec.height})${preview ? ' [PREVIEW]' : ''}`);
  const t0 = Date.now();
  const cap = await captureVideoFrames(spec, framesDir, { only, root, log });
  log(`  captured ${cap.frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (cap.errors.length) log(`  [warn] ${cap.errors.length} browser console/page issue(s): ${cap.errors.slice(0, 3).join(' | ')}`);

  fs.writeFileSync(path.join(stage, 'timeline.json'), `${JSON.stringify({ scenes: cap.sceneMetrics, events: cap.timeline }, null, 2)}\n`);
  const rendered = renderVideoOutputs(spec, framesDir, stage, { preview, env });
  if (!has('--keep')) fs.rmSync(framesDir, { recursive: true, force: true });

  if (!silent && spec.audio) {
    const clipDur = cap.frames / spec.fps;
    const sliceOffset = only ? Math.max(0, only[0]) : 0;
    const combinedCues = spec.audio.autoGameSfx
      ? compactTimedCues([...(spec.audio.resolvedCues ?? []), ...cap.autoSfxCues], { maxDuration: spec.total }).map((c) => ({
        ...c,
        abs: c.abs ?? path.join(root, 'public/sfx', `${c.cue}.mp3`),
      }))
      : (spec.audio.resolvedCues ?? []);
    const muxRes = muxSoundtrack(rendered.mp4, { ...spec.audio, resolvedCues: combinedCues }, rendered.mp4, { clipDur, sliceOffset, env });
    log(`  audio -> mixed ${muxRes.tracks} track(s) (${clipDur.toFixed(2)}s)`);
  }

  let comp = null;
  if (!preview && !only) comp = compressBundle(rendered.mp4, { env });
  swapDir(stage, dest);

  log(`DONE -> ${path.relative(root, dest)}/`);
  log(`  mp4      ${path.basename(rendered.mp4).padEnd(24)} ${mb(fs.statSync(path.join(dest, path.basename(rendered.mp4))).size)}`);
  if (rendered.gif) log(`  gif      ${path.basename(rendered.gif).padEnd(24)} ${rendered.gifMB.toFixed(2)} MB`);
  if (comp) log(`  min.mp4  ${path.basename(comp.minMp4.file).padEnd(24)} ${mb(comp.minMp4.bytes)}`);
  log('  sheet    contact.jpg');
  return 0;
}

export async function main(argv, { root = projectRoot, env = process.env, log = console.log } = {}) {
  if (argv.includes('--check')) {
    const problems = checkSocialSpecs(root);
    for (const p of problems) log(`  - ${p}`);
    log(problems.length ? `social check FAILED (${problems.length})` : 'social check OK');
    return problems.length ? 1 : 0;
  }

  const [sub, ...rest] = argv;
  if (sub === 'video' || sub === 'make') {
    return runVideoCmd(rest, { root, env, log });
  }
  if (sub === 'screenshots') {
    const specFile = argVal(rest, '--spec') ?? path.join(root, 'social/media/specs/screenshots.spec.json');
    const outArg = argVal(rest, '--out');
    const outDir = outArg ? assertSafeOutPath(outArg, root) : path.join(root, 'social/media/out/screenshots');
    const filter = rest.find((a, i) => !a.startsWith('--') && (i === 0 || !['--spec', '--out'].includes(rest[i - 1]))) ?? null;
    const spec = readScreenshotsSpec(specFile, { root });
    await captureScreenshotsSuite(spec, outDir, { filter, log, env });
    return 0;
  }
  if (sub === 'infographics') {
    const specFile = argVal(rest, '--spec') ?? path.join(root, 'social/media/specs/infographics.spec.json');
    const outArg = argVal(rest, '--out');
    const outDir = outArg ? assertSafeOutPath(outArg, root) : path.join(root, 'social/media/out/infographics');
    const shotsDir = path.join(root, 'social/media/out/screenshots');
    const filter = rest.find((a, i) => !a.startsWith('--') && (i === 0 || !['--spec', '--out'].includes(rest[i - 1]))) ?? null;
    const spec = readInfographicsSpec(specFile);
    await renderInfographicsSuite(spec, outDir, { shotsDir, filter, log, env });
    return 0;
  }
  if (sub === 'audio') {
    return runSocialAudioCli(rest, { root, env, log });
  }

  throw new Error([
    'usage:',
    '  node scripts/harness/social-media.mjs --check',
    '  node scripts/harness/social-media.mjs video <spec.json> [--preview] [--silent] [--audio <cue|file>] [--only a-b] [--remux] [--compress]',
    '  node scripts/harness/social-media.mjs video --add-audio <in.mp4> <cue|song.mp3|spec.json> [--out <out.mp4>]',
    '  node scripts/harness/social-media.mjs screenshots [filter]',
    '  node scripts/harness/social-media.mjs infographics [filter]',
    '  node scripts/harness/social-media.mjs audio plan <cue>... [--variants N] [--generate] | credits | list',
  ].join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (err) => {
      console.error(`social-media: ${err.message}`);
      process.exitCode = 1;
    },
  );
}
