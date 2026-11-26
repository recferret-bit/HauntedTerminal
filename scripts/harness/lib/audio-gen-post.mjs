// Post-processing of a generated take with ffmpeg (user, 2026-11-28, Q8): trim silence at both ends of a one-shot,
// gain to a -3 dBFS peak, and for a music loop crossfade one bar of the head into the tail so the file loops. SFX loops
// are made loopable by the API (`--loop`) and only get the gain. Without ffmpeg the raw file stays. No gate needs it.
import { execFileSync, spawnSync } from 'node:child_process';
import { renameSync, rmSync } from 'node:fs';

export const PEAK_DB = -3;
const SILENCE = 'silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.02';
const ENCODE = ['-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100'];
export const NO_FFMPEG = 'post skipped: ffmpeg is not installed (brew install ffmpeg); the raw file was kept';

export function hasFfmpeg(env = process.env) {
  return spawnSync('ffmpeg', ['-version'], { env, stdio: 'ignore' }).status === 0;
}

/** `{ maxDb, seconds }` of a file, from ffmpeg's volumedetect pass (stderr). */
export function measure(file, env = process.env) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { env, encoding: 'utf8' });
  const text = `${r.stderr ?? ''}`;
  const maxDb = Number(/max_volume:\s*(-?[\d.]+) dB/.exec(text)?.[1]);
  const d = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(text);
  const seconds = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : NaN;
  if (!Number.isFinite(maxDb)) throw new Error(`ffmpeg could not measure ${file}`);
  return { maxDb, seconds };
}

/** The ffmpeg filter for one take: `kind` is sfx, voice or music; `bar` is one bar in seconds (music loops). */
export function postFilter({ kind, loop, gainDb, seconds, bar }) {
  const gain = `volume=${gainDb.toFixed(2)}dB`;
  if (loop && kind === 'music') {
    const d = Math.min(bar, seconds / 4).toFixed(3);
    return { complex: true, filter: `[0:a]asplit[a][b];[a]atrim=start=${d},asetpts=PTS-STARTPTS[body];[b]atrim=0:${d},asetpts=PTS-STARTPTS[head];[body][head]acrossfade=d=${d},${gain}[out]` };
  }
  if (loop) return { complex: false, filter: gain };
  return { complex: false, filter: `${SILENCE},areverse,${SILENCE},areverse,${gain}` };
}

/**
 * Trims, normalises and (loops) joins `file` in place: written to a temp file next to it, then renamed over it.
 * Returns `{ post: true, seconds }`, or `{ post: false, reason }` when ffmpeg is missing (the raw file stays).
 */
export function postProcess(file, { kind, loop, bar = 2 }, env = process.env) {
  if (!hasFfmpeg(env)) return { post: false, reason: NO_FFMPEG };
  const { maxDb, seconds } = measure(file, env);
  const { complex, filter } = postFilter({ kind, loop, gainDb: PEAK_DB - maxDb, seconds, bar });
  const tmp = `${file}.post.mp3`;
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, ...(complex ? ['-filter_complex', filter, '-map', '[out]'] : ['-af', filter]), ...ENCODE, tmp];
  try {
    execFileSync('ffmpeg', args, { env, stdio: ['ignore', 'ignore', 'pipe'] });
    renameSync(tmp, file);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
  return { post: true, seconds: measure(file, env).seconds };
}
