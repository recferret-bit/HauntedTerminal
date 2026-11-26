// FFmpeg encoding, adaptive GIF compression, contact sheets, and multi-track audio mixing (in-game music + SFX + ElevenLabs VO).
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Resolves ffmpeg binary in priority order: FFMPEG_BIN -> PATH `ffmpeg` -> pinned `ffmpeg-static`. */
export function resolveFfmpeg(env = process.env) {
  if (env.FFMPEG_BIN && fs.existsSync(env.FFMPEG_BIN)) return env.FFMPEG_BIN;
  if (spawnSync('ffmpeg', ['-version'], { env, stdio: 'ignore' }).status === 0) return 'ffmpeg';
  try {
    const bundled = require('ffmpeg-static');
    if (bundled && fs.existsSync(bundled)) return bundled;
  } catch { /* optional fallback */ }
  throw new Error('ffmpeg binary not found (install ffmpeg-static or brew install ffmpeg, or set FFMPEG_BIN)');
}

function runFfmpeg(args, env = process.env) {
  const bin = resolveFfmpeg(env);
  return execFileSync(bin, ['-hide_banner', '-loglevel', 'error', ...args], { env, stdio: ['ignore', 'ignore', 'pipe'] });
}

const bytes = (p) => fs.statSync(p).size;
const mb = (p) => bytes(p) / (1024 * 1024);

const CROP_VF = {
  square: 'crop=min(iw\\,ih):min(iw\\,ih):(iw-min(iw\\,ih))/2:(ih-min(iw\\,ih))/2',
  vertical: 'crop=trunc(ih*9/16/2)*2:ih:(iw-trunc(ih*9/16/2)*2)/2:0',
};

function resolveCropFilters(spec) {
  if (spec.crop === 'square' && spec.width !== spec.height) return [CROP_VF.square];
  if (spec.crop === 'vertical' && spec.width >= spec.height) return [CROP_VF.vertical];
  return [];
}

function realAncestorPath(p) {
  let head = p;
  while (!fs.existsSync(head)) head = path.dirname(head);
  return path.join(fs.realpathSync(head), path.relative(head, p));
}

/** Ensures `--out` targets stay strictly inside git-ignored `social/media/out/`, `scripts/harness/out/`, or `os.tmpdir()`. */
export function assertSafeOutPath(outPath, root) {
  const resolved = realAncestorPath(path.resolve(outPath));
  const allowedRoots = [
    path.join(root, 'social/media/out'),
    path.join(root, 'scripts/harness/out'),
    os.tmpdir(),
  ].map((dir) => realAncestorPath(path.resolve(dir)));
  const ok = allowedRoots.some((base) => resolved === base || resolved.startsWith(base + path.sep));
  if (!ok) {
    throw new Error(`--out must be inside social/media/out/, scripts/harness/out/, or ${os.tmpdir()} (got ${outPath})`);
  }
  return path.resolve(outPath);
}

export function listSortedPngs(dir) {
  return fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort().map((f) => path.join(dir, f))
    : [];
}

export function saveBase64Png(outDir, id, base64Data) {
  const png = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(path.join(outDir, `${id}.png`), png);
  return png.length;
}

export function swapDir(stage, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const old = `${dest}.old.${process.pid}`;
  if (fs.existsSync(dest)) fs.renameSync(dest, old);
  fs.renameSync(stage, dest);
  fs.rmSync(old, { recursive: true, force: true });
}

export function duration(file, env = process.env) {
  const bin = resolveFfmpeg(env);
  const r = spawnSync(bin, ['-hide_banner', '-i', file], { env, encoding: 'utf8' });
  const text = `${r.stderr ?? ''}${r.stdout ?? ''}`;
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

export function hasAudioStream(file, env = process.env) {
  const bin = resolveFfmpeg(env);
  const r = spawnSync(bin, ['-hide_banner', '-i', file], { env, encoding: 'utf8' });
  return /Stream #\d+:\d+.*Audio:/.test(`${r.stderr ?? ''}${r.stdout ?? ''}`);
}

export function renderContactSheet(pngFiles, outSheet, { cols = 4, tileW = 480, tileH = 270, env = process.env } = {}) {
  if (!pngFiles.length) return null;
  const rows = Math.ceil(pngFiles.length / cols);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ooc-sheet-'));
  try {
    pngFiles.forEach((f, idx) => {
      fs.copyFileSync(f, path.join(tmp, `s${String(idx).padStart(3, '0')}.png`));
    });
    runFfmpeg([
      '-y', '-framerate', '1',
      '-i', path.join(tmp, 's%03d.png'),
      '-vf', `scale=${tileW}:${tileH}:force_original_aspect_ratio=decrease,pad=${tileW}:${tileH}:(ow-iw)/2:(oh-ih)/2:0x110e1b,tile=${cols}x${rows}:padding=6:margin=8:color=0x110e1b`,
      '-frames:v', '1', '-q:v', '2',
      outSheet,
    ], env);
    return outSheet;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export function renderVideoOutputs(spec, framesDir, outDir, { preview = false, env = process.env } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const input = path.join(framesDir, 'f%05d.png');
  const mp4 = path.join(outDir, `${spec.name}.mp4`);
  const gif = path.join(outDir, `${spec.name}.gif`);
  const sheet = path.join(outDir, 'contact.jpg');
  const baseVf = resolveCropFilters(spec);

  runFfmpeg([
    '-y', '-framerate', String(spec.fps), '-i', input,
    ...(baseVf.length ? ['-vf', baseVf.join(',')] : []),
    '-c:v', 'libx264', '-preset', preview ? 'ultrafast' : 'slow', '-crf', preview ? '23' : '18',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4,
  ], env);

  const totalFrames = fs.readdirSync(framesDir).filter((f) => f.endsWith('.png')).length;
  const cols = spec.total > 20 ? 5 : 4;
  const rows = spec.total > 20 ? 5 : 4;
  const step = Math.max(1, Math.floor(totalFrames / (cols * rows)));
  const tileW = spec.crop || spec.width < spec.height ? 240 : 320;
  runFfmpeg([
    '-y', '-i', input,
    '-vf', [...baseVf, `select='not(mod(n\\,${step}))'`, `scale=${tileW}:-1`, `tile=${cols}x${rows}:padding=4:margin=4:color=0x110e1b`].join(','),
    '-frames:v', '1', '-q:v', '3', sheet,
  ], env);

  if (preview) return { mp4, mp4MB: mb(mp4), gif: null, gifMB: 0, gifCfg: null, sheet };

  const ladder = [
    [spec.gif.width, spec.gif.fps, 256],
    [540, Math.min(spec.gif.fps, 11), 224],
    [460, 10, 192],
    [400, 9, 160],
    [340, 8, 128],
  ];
  let chosen = null;
  for (const [w, gfps, colors] of ladder) {
    const vf = `fps=${gfps},scale=${w}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=${colors}:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3`;
    runFfmpeg(['-y', '-i', mp4, '-vf', vf, '-loop', '0', gif], env);
    chosen = { w, fps: gfps, colors, mb: mb(gif) };
    if (chosen.mb <= spec.gif.maxMB) break;
  }
  return { mp4, mp4MB: mb(mp4), gif, gifMB: chosen.mb, gifCfg: chosen, sheet };
}

function appendChain(state, flt) {
  const inIdx = state.idx++;
  const lbl = `a${inIdx}`;
  state.chains.push(`[${inIdx}:a:0]${flt.join(',')}[${lbl}]`);
  state.labels.push(`[${lbl}]`);
}

function pushDelayedTrack({ abs, relAt, gainDb, dur }, state) {
  if (relAt < -0.01 || relAt >= dur - 0.04 || !abs || !fs.existsSync(abs)) return;
  const delayMs = Math.max(0, Math.round(relAt * 1000));
  state.inputs.push('-i', abs);
  const flt = ['asetpts=PTS-STARTPTS'];
  if (Math.abs(gainDb) > 1e-3) flt.push(`volume=${gainDb.toFixed(2)}dB`);
  if (delayMs > 0) flt.push(`adelay=${delayMs}|${delayMs}`);
  flt.push(`apad=whole_dur=${dur.toFixed(4)}`, `atrim=0:${dur.toFixed(4)}`);
  appendChain(state, flt);
}

function buildAudioMixArgs(audioPlan, dur, sliceOffset) {
  const state = { inputs: [], chains: [], labels: [], idx: 1 }; // 0 is videoIn
  const hasVo = Boolean(audioPlan.voiceover?.abs && fs.existsSync(audioPlan.voiceover.abs));

  if (audioPlan.music?.abs && fs.existsSync(audioPlan.music.abs)) {
    const m = audioPlan.music;
    const startSec = Math.max(0, (m.offset ?? 0) + sliceOffset);
    if (m.loop !== false) state.inputs.push('-stream_loop', '-1');
    if (startSec > 0.001) state.inputs.push('-ss', startSec.toFixed(3));
    state.inputs.push('-i', m.abs);
    const fadeIn = Math.min(m.fadeIn ?? 0.35, dur * 0.45);
    const fadeOut = Math.min(m.fadeOut ?? 1.8, dur * 0.45);
    const gain = (m.gainDb ?? -2) + (hasVo ? (m.duckDb ?? -5) : 0);
    const flt = [`atrim=0:${dur.toFixed(4)}`, 'asetpts=PTS-STARTPTS'];
    if (Math.abs(gain) > 1e-3) flt.push(`volume=${gain.toFixed(2)}dB`);
    if (fadeIn > 0.01) flt.push(`afade=t=in:st=0:d=${fadeIn.toFixed(3)}`);
    if (fadeOut > 0.01) flt.push(`afade=t=out:st=${Math.max(0, dur - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`);
    appendChain(state, flt);
  }

  if (hasVo) {
    const vo = audioPlan.voiceover;
    pushDelayedTrack({ abs: vo.abs, relAt: (vo.at ?? 0) - sliceOffset, gainDb: vo.gainDb ?? 1.5, dur }, state);
  }

  for (const c of audioPlan.resolvedCues ?? []) {
    pushDelayedTrack({ abs: c.abs, relAt: c.at - sliceOffset, gainDb: c.gainDb ?? 0, dur }, state);
  }

  if (!state.labels.length) return null;
  const mix = state.labels.length === 1
    ? `${state.chains[0]};${state.labels[0]}alimiter=limit=0.94[aout]`
    : `${state.chains.join(';')};${state.labels.join('')}amix=inputs=${state.labels.length}:duration=longest:dropout_transition=0:normalize=0,atrim=0:${dur.toFixed(4)},alimiter=limit=0.94[aout]`;
  return { inputs: state.inputs, filterComplex: mix, tracks: state.labels.length };
}

/**
 * Muxes a single soundtrack path OR a full multi-track Out Of Credits audio plan (music bed + ElevenLabs VO + SFX cues)
 * onto an existing video file without re-encoding video frames (`-c:v copy`).
 */
export function muxSoundtrack(videoIn, audioCfg, mp4Out, { clipDur = null, sliceOffset = 0, env = process.env } = {}) {
  const dur = clipDur ?? duration(videoIn, env);
  if (!dur || dur <= 0) throw new Error(`muxSoundtrack: invalid video duration for ${videoIn}`);

  const plan = typeof audioCfg === 'string'
    ? { music: { abs: audioCfg, offset: 0, fadeIn: 0.35, fadeOut: Math.min(2.0, dur * 0.15), gainDb: 0, loop: true }, resolvedCues: [] }
    : (audioCfg.music || audioCfg.voiceover || audioCfg.resolvedCues
      ? audioCfg
      : { music: audioCfg, resolvedCues: [] });

  const built = buildAudioMixArgs(plan, dur, sliceOffset);
  if (!built) return { file: videoIn, bytes: bytes(videoIn), duration: dur, tracks: 0 };

  const tmp = videoIn === mp4Out ? `${mp4Out}.mux.mp4` : mp4Out;
  runFfmpeg([
    '-y',
    '-i', videoIn,
    ...built.inputs,
    '-filter_complex', built.filterComplex,
    '-map', '0:v:0',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000',
    '-shortest',
    '-movflags', '+faststart',
    tmp,
  ], env);
  if (tmp !== mp4Out) fs.renameSync(tmp, mp4Out);
  return { file: mp4Out, bytes: bytes(mp4Out), duration: dur, tracks: built.tracks };
}

export function compressMp4(mp4In, mp4Out, { crf = 24, env = process.env } = {}) {
  runFfmpeg([
    '-y', '-i', mp4In, '-map', '0:v:0', '-map', '0:a?',
    '-c:v', 'libx264', '-preset', 'veryslow', '-crf', String(crf), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000',
    '-movflags', '+faststart', mp4Out,
  ], env);
  return { file: mp4Out, bytes: bytes(mp4Out) };
}

function gifAt(mp4In, gifOut, { w, fps, colors, bayer = 3 }, env) {
  const vf = `fps=${fps},scale=${w}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=${colors}:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=${bayer}:diff_mode=rectangle`;
  runFfmpeg(['-y', '-i', mp4In, '-vf', vf, '-loop', '0', gifOut], env);
  return { w, fps, colors, bayer, bytes: bytes(gifOut) };
}

export function compressGif(mp4In, gifOut, { maxMB = 5, env = process.env } = {}) {
  const cap = maxMB * 1024 * 1024;
  const ladder = [[480, 10, 128], [440, 10, 96], [400, 9, 96], [360, 8, 80], [320, 7, 64]];
  let chosen;
  for (const [w, fps, colors] of ladder) {
    chosen = gifAt(mp4In, gifOut, { w, fps, colors }, env);
    if (chosen.bytes <= cap) break;
  }
  return { file: gifOut, ...chosen };
}

export function compressTinyGif(mp4In, gifOut, { maxKB = 500, env = process.env } = {}) {
  const cap = maxKB * 1024;
  const ladder = [
    [320, 8, 64, 4], [280, 7, 48, 4], [240, 6, 40, 5], [200, 5, 28, 5], [160, 4, 20, 5],
  ];
  let chosen;
  for (const [w, fps, colors, bayer] of ladder) {
    chosen = gifAt(mp4In, gifOut, { w, fps, colors, bayer }, env);
    if (chosen.bytes <= cap) break;
  }
  return { file: gifOut, ...chosen, capped: chosen.bytes <= cap };
}

export function compressBundle(mp4In, { env = process.env } = {}) {
  const stem = mp4In.replace(/\.mp4$/i, '');
  const dur = duration(mp4In, env) ?? 999;
  const minGifCap = dur > 30 ? 8 : 4.5;
  return {
    minMp4: compressMp4(mp4In, `${stem}.min.mp4`, { env }),
    minGif: compressGif(mp4In, `${stem}.min.gif`, { maxMB: minGifCap, env }),
    tinyGif: dur <= 22 ? compressTinyGif(mp4In, `${stem}.tiny.gif`, { env }) : null,
  };
}
