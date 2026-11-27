// Offline acoustic & config inspector for SFX and Music cues (`audio-gen.mjs inspect`).
// Combines public/{sfx,music}/manifest.json, src/audio/config.ts (SFX_TRIM, LOOP_GAINS), docs rows, and ffmpeg stats.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MANIFESTS, readManifest } from './audio-gen-manifest.mjs';
import { resolveFfmpeg } from './audio-gen-post.mjs';
import { loadRows, rowFor } from './audio-gen-rows.mjs';

export { resolveFfmpeg };

const AUDIO_CONFIG = 'src/audio/config.ts';
const LOOP_GAINS_DEFAULT = 0.35;

function valueStart(text, marker) {
  const decl = new RegExp(`(?:export\\s+)?const\\s+${marker}\\b[^=;]*=`).exec(text);
  if (decl) return decl.index + decl[0].length;
  const idx = text.indexOf(marker);
  if (idx < 0) return -1;
  const eq = text.indexOf('=', idx);
  return eq >= 0 ? eq + 1 : idx;
}

function extractBlock(text, marker) {
  const from = valueStart(text, marker);
  if (from < 0) return '';
  const open = text.indexOf('{', from);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return '';
}

function extractArray(text, marker) {
  const from = valueStart(text, marker);
  if (from < 0) return [];
  const open = text.indexOf('[', from);
  const close = text.indexOf(']', open);
  if (open < 0 || close < 0) return [];
  return [...text.slice(open + 1, close).matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
}

export function readAudioConfig(root) {
  const path = join(root, AUDIO_CONFIG);
  const sfxTrim = {};
  const loopGains = {};
  const loopIds = new Set();
  if (!existsSync(path)) return { sfxTrim, loopGains, loopIds, defaultLoopGain: LOOP_GAINS_DEFAULT };
  const text = readFileSync(path, 'utf8');
  const defaultMatch = /DEFAULT_LOOP_GAIN\s*=\s*([\d.]+)/.exec(text);
  const defaultLoopGain = defaultMatch ? Number(defaultMatch[1]) : LOOP_GAINS_DEFAULT;

  for (const id of extractArray(text, 'LOOP_CUE_IDS')) loopIds.add(id);

  const gainsBody = extractBlock(text, 'LOOP_GAINS');
  for (const m of gainsBody.matchAll(/([a-z0-9_]+)\s*:\s*([\d.]+)/g)) {
    loopGains[m[1]] = Number(m[2]);
  }

  const trimBody = extractBlock(text, 'SFX_TRIM');
  for (const m of trimBody.matchAll(/([a-z0-9_]+)\s*:\s*\{\s*offset:\s*([\d.]+)(?:\s*,\s*duration:\s*([\d.]+))?\s*,?\s*\}/g)) {
    const win = { offset: Number(m[2]) };
    if (m[3] !== undefined) win.duration = Number(m[3]);
    sfxTrim[m[1]] = win;
  }
  return { sfxTrim, loopGains, loopIds, defaultLoopGain };
}

export function parseSilenceAndVolume(stderr) {
  const durMatch = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(stderr);
  const durationSec = durMatch ? Number((Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3])).toFixed(3)) : null;
  const maxMatch = /max_volume:\s*(-?[\d.]+)\s*dB/.exec(stderr);
  const meanMatch = /mean_volume:\s*(-?[\d.]+)\s*dB/.exec(stderr);
  const maxDb = maxMatch ? Number(maxMatch[1]) : null;
  const meanDb = meanMatch ? Number(meanMatch[1]) : null;

  let leadingSilenceSec = 0;
  let trailingSilenceSec = 0;
  const spans = [];
  for (const line of stderr.split(/\r?\n/)) {
    const sm = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (sm) spans.push({ start: Number(sm[1]), end: null, duration: null });
    const em = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/.exec(line);
    if (em && spans.length > 0) {
      spans[spans.length - 1].end = Number(em[1]);
      spans[spans.length - 1].duration = Number(em[2]);
    }
  }
  if (spans.length > 0 && spans[0].start <= 0.005) {
    if (spans[0].end !== null) leadingSilenceSec = Number(spans[0].end.toFixed(3));
    else if (durationSec !== null) leadingSilenceSec = durationSec;
  }
  const last = spans[spans.length - 1];
  if (last && durationSec !== null) {
    if (last.end === null) trailingSilenceSec = Number(Math.max(0, durationSec - Math.max(0, last.start)).toFixed(3));
    else if (durationSec - last.end <= 0.03 && last.duration !== null) trailingSilenceSec = Number(last.duration.toFixed(3));
  }

  return { durationSec, maxDb, meanDb, leadingSilenceSec, trailingSilenceSec };
}

export function probeFile(ffmpegBin, filePath, env = process.env) {
  if (!ffmpegBin || !existsSync(filePath)) return null;
  const volRes = spawnSync(
    ffmpegBin,
    ['-hide_banner', '-nostats', '-i', filePath, '-af', 'volumedetect', '-f', 'null', '-'],
    { env, encoding: 'utf8' },
  );
  const volErr = `${volRes.stderr ?? ''}`;
  let combinedErr = volErr;
  if (/mean_volume:\s*-?[\d.]+\s*dB/.test(volErr)) {
    const silRes = spawnSync(
      ffmpegBin,
      ['-hide_banner', '-nostats', '-i', filePath, '-af', 'silencedetect=noise=-55dB:d=0.02', '-f', 'null', '-'],
      { env, encoding: 'utf8' },
    );
    combinedErr = `${volErr}\n${silRes.stderr ?? ''}`;
  }
  const parsed = parseSilenceAndVolume(combinedErr);
  if (parsed.durationSec === null && parsed.maxDb === null && parsed.meanDb === null) return null;
  const activeSec = parsed.durationSec !== null
    ? Number(Math.max(0, parsed.durationSec - parsed.leadingSilenceSec - parsed.trailingSilenceSec).toFixed(3))
    : null;
  return { ...parsed, activeSec };
}

function collectManifestEntries(root) {
  const out = [];
  for (const [group, { path, list }] of Object.entries(MANIFESTS)) {
    const abs = join(root, path);
    if (!existsSync(abs)) continue;
    const folder = `public/${group}`;
    const doc = readManifest(root, group);
    for (const entry of doc[list] ?? []) {
      out.push({ group, folder, entry });
    }
  }
  return out;
}

function buildTrimCheck(trim, metrics) {
  if (!trim || !metrics || metrics.durationSec === null || metrics.durationSec === undefined) return null;
  const dur = metrics.durationSec;
  const offsetValid = dur > trim.offset + 0.05;
  const durationValid = trim.duration === undefined ? true : dur > trim.offset + trim.duration;
  const uncoveredLeadSec = Number(Math.max(0, metrics.leadingSilenceSec - trim.offset).toFixed(3));
  const trimmedActiveSec =
    trim.duration !== undefined && durationValid
      ? Number(trim.duration.toFixed(3))
      : offsetValid
        ? Number(Math.max(0, dur - trim.offset).toFixed(3))
        : Number(dur.toFixed(3));
  return { offsetValid, durationValid, uncoveredLeadSec, trimmedActiveSec };
}

export function inspectAudio(root, { cues = [], all = false, env = process.env } = {}) {
  if (!all && cues.length === 0) throw new Error('inspect requires <cue>... or --all');
  const entries = collectManifestEntries(root);
  const byName = new Map(entries.map((item) => [item.entry.name, item]));
  const rows = loadRows(root);
  const cfg = readAudioConfig(root);
  const ffmpegBin = resolveFfmpeg(env);

  const selected = all
    ? entries
    : cues.map((name) => {
        const hit = byName.get(name);
        if (!hit) throw new Error(`unknown cue "${name}"`);
        return hit;
      });

  const results = selected.map(({ group, folder, entry }) => {
    const name = entry.name;
    const hit = rowFor(rows, name);
    const row = hit?.row ?? null;
    const files = (entry.files ?? []).map((f) => {
      const relPath = `${folder}/${f.file}`;
      const absPath = join(root, relPath);
      return { file: f.file, path: relPath, bytes: f.bytes ?? null, exists: existsSync(absPath), absPath };
    });
    const firstFile = files.find((f) => f.exists);
    const metrics = firstFile ? probeFile(ffmpegBin, firstFile.absPath, env) : null;
    const trim = cfg.sfxTrim[name] ?? null;
    const isLoop = Boolean(entry.loop) || cfg.loopIds.has(name) || name.endsWith('_loop');
    const loopGain = group === 'sfx' && isLoop ? (cfg.loopGains[name] ?? cfg.defaultLoopGain) : null;
    const trimCheck = buildTrimCheck(trim, metrics);
    const secondsAligned =
      row?.seconds !== null && row?.seconds !== undefined && metrics?.durationSec !== null && metrics?.durationSec !== undefined
        ? Math.abs(metrics.durationSec - row.seconds) <= Math.max(0.25, row.seconds * 0.25)
        : null;
    const listRow = row
      ? {
          present: true,
          row: row.row,
          kind: row.kind,
          listedSeconds: row.seconds,
          loop: row.loop,
          variant: hit?.variant ?? null,
          secondsAligned,
        }
      : { present: false, row: null, kind: null, listedSeconds: null, loop: null, variant: null, secondsAligned: null };
    return {
      name,
      group,
      kind: row?.kind ?? (group === 'music' ? 'music' : 'sfx'),
      loop: isLoop,
      loopGain,
      listedSeconds: entry.listed_seconds ?? row?.seconds ?? null,
      requestedSeconds: entry.duration_seconds ?? (entry.plan_ms ? entry.plan_ms / 1000 : null),
      trim,
      trimCheck,
      listRow,
      post: entry.post ?? null,
      files: files.map(({ file, path, bytes, exists }) => ({ file, path, bytes, exists })),
      metrics,
    };
  });

  return {
    ffmpegAvailable: Boolean(ffmpegBin),
    count: results.length,
    cues: results,
  };
}

export function formatInspectReport(report) {
  const lines = [`audio inspect: ${report.count} cue(s) · ffmpeg=${report.ffmpegAvailable ? 'yes' : 'no'}`];
  for (const c of report.cues) {
    const m = c.metrics;
    const dur = m?.durationSec !== null && m?.durationSec !== undefined ? `${m.durationSec.toFixed(3)}s` : `${c.listedSeconds ?? '?'}s(listed)`;
    const db = m?.maxDb !== null && m?.maxDb !== undefined ? `peak=${m.maxDb}dBFS` : 'peak=n/a';
    const sil = m?.durationSec !== null && m?.durationSec !== undefined ? `lead=${m.leadingSilenceSec}s tail=${m.trailingSilenceSec}s` : '';
    const trim = c.trim ? `trim=[${c.trim.offset}${c.trim.duration ? `, +${c.trim.duration}` : ''}]` : '';
    const gain = c.loopGain !== null ? `gain=${c.loopGain}` : '';
    const parts = [c.name.padEnd(22), c.group.padEnd(5), dur, db, sil, trim, gain].filter(Boolean);
    lines.push(`  ${parts.join('  ')}`);
  }
  return lines;
}
