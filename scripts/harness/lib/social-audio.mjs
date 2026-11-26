// Declarative ElevenLabs social audio planner & generator (voiceovers, TikTok hooks, trailer beds & stings).
// Reuses scripts/harness/lib/audio-gen-cli.mjs (CAP = 15,000, RESERVE = 30,000, Keychain OAuth, zero API keys, dry-run default).
import fs from 'node:fs';
import path from 'node:path';
import { CAP, NOT_LOGGED_IN, RESERVE, capProblem, credits, dryRun, loggedIn, runCli, voiceId } from './audio-gen-cli.mjs';
import { postProcess } from './audio-gen-post.mjs';
import { COST, MUSIC_MODEL, OUTPUT_FORMAT, PROMPT_INFLUENCE, SFX_MODEL, takeName } from './audio-gen-request.mjs';
import { projectRoot } from './load.mjs';
import { resolveFfmpeg } from './social-ffmpeg.mjs';
import { readSocialAudioSpec } from './social-spec.mjs';

const MAX_VARIANTS = 3;
const IDS_CACHE_REL = 'scripts/harness/out/audio-gen/ids.json';

function resolveFilterPresetId(root, filterName, env) {
  if (!filterName) return null;
  const cacheFile = path.join(root, IDS_CACHE_REL);
  const key = `filter:${filterName.toLowerCase()}`;
  const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
  if (cache[key]) return cache[key];
  try {
    const raw = runCli(['audio-effects', 'get_catalog', '--format', 'json'], env).trim();
    if (!raw) return filterName;
    const catalog = JSON.parse(raw);
    const want = filterName.toLowerCase();
    const hit = (catalog.filter_presets ?? []).find((p) => (
      String(p.filter_preset_id ?? '').toLowerCase() === want
      || String(p.name ?? '').toLowerCase() === want
      || String(p.name ?? '').toLowerCase().includes(want)
    ));
    if (!hit?.filter_preset_id) return filterName;
    cache[key] = hit.filter_preset_id;
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(`${cacheFile}.tmp`, `${JSON.stringify(cache, null, 2)}\n`);
    fs.renameSync(`${cacheFile}.tmp`, cacheFile);
    return hit.filter_preset_id;
  } catch {
    return filterName;
  }
}

function buildCueBody(cue, resolvedVoiceId, resolvedFilterId) {
  if (cue.kind === 'voice') {
    const argv = [
      'text-to-speech', 'convert',
      '--voice-id', resolvedVoiceId ?? `<${cue.voice}>`,
      '--text', cue.text,
      '--model-id', cue.model,
      ...(resolvedFilterId ? ['--audio-effects.filter-preset-id', resolvedFilterId] : []),
    ];
    const estimate = Math.max(COST.speechMin, Math.ceil(cue.text.length * COST.speechPerChar));
    return { loop: false, seconds: cue.seconds, estimate, argv };
  }
  if (cue.kind === 'music') {
    const ms = Math.min(600000, Math.max(3000, Math.round(cue.seconds * 1000)));
    const payload = {
      prompt: cue.prompt,
      music_length_ms: ms,
      force_instrumental: true,
      model_id: cue.model || MUSIC_MODEL,
    };
    return {
      loop: cue.loop,
      seconds: ms / 1000,
      estimate: Math.ceil((ms / 1000) * COST.musicPerSecond),
      argv: ['music', 'compose', '--json', JSON.stringify(payload)],
    };
  }
  const seconds = Math.min(30, Math.max(0.5, cue.seconds));
  return {
    loop: cue.loop,
    seconds,
    estimate: Math.ceil(seconds * COST.sfxPerSecond),
    argv: [
      'text-to-sound-effects', 'convert',
      '--text', cue.prompt,
      '--model-id', cue.model || SFX_MODEL,
      '--duration-seconds', String(seconds),
      '--prompt-influence', String(PROMPT_INFLUENCE),
      ...(cue.loop ? ['--loop', 'true'] : []),
    ],
  };
}

function buildCueRequest(root, cue, variant, resolvedVoiceId, resolvedFilterId) {
  const take = takeName(cue.id, variant);
  const outRel = `social/media/out/audio/${take}.mp3`;
  const outAbs = path.join(root, outRel);
  const intent = `generate ${cue.kind} cue ${take} for Out Of Credits social media (${cue.platform})`;
  const body = buildCueBody(cue, resolvedVoiceId, resolvedFilterId);
  return {
    take,
    cueId: cue.id,
    kind: cue.kind,
    loop: body.loop,
    seconds: body.seconds,
    out: outRel,
    outAbs,
    estimate: body.estimate,
    argv: [...body.argv, '--output-format', OUTPUT_FORMAT, '--intent', intent, '--output', outAbs],
  };
}

function withBundledFfmpegEnv(env) {
  try {
    const bin = resolveFfmpeg(env);
    if (bin === 'ffmpeg') return env;
    const dir = path.dirname(bin);
    return { ...env, PATH: `${dir}${path.delimiter}${env.PATH ?? ''}` };
  } catch {
    return env;
  }
}

function patchSocialAudioManifest(root, entry) {
  const dir = path.join(root, 'social/media/out/audio');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'manifest.json');
  const doc = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { schemaVersion: 1, takes: [] };
  const idx = doc.takes.findIndex((t) => t.name === entry.name);
  if (idx >= 0) doc.takes[idx] = entry;
  else doc.takes.push(entry);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function cliError(err) {
  const text = String(err.stdout || err.stderr || err.message);
  try {
    const parsed = JSON.parse(text);
    return parsed.error?.message ?? parsed.message ?? text.trim().split('\n')[0];
  } catch {
    return text.trim().split('\n')[0];
  }
}

export function runSocialAudioCli(argv, { root = projectRoot, env = process.env, log = console.log } = {}) {
  const specFile = path.join(root, 'social/media/specs/audio-cues.json');
  const spec = readSocialAudioSpec(specFile);

  let cmd = null;
  let variants = 1;
  let generate = false;
  const ids = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--generate') generate = true;
    else if (a === '--variants') variants = Number(argv[++i]);
    else if (a.startsWith('-')) throw new Error(`unknown audio option ${a}`);
    else if (!cmd) cmd = a;
    else ids.push(a);
  }
  if (!Number.isInteger(variants) || variants < 1 || variants > MAX_VARIANTS) {
    throw new Error(`--variants must be 1 to ${MAX_VARIANTS}`);
  }

  if (cmd === 'list') {
    const musicDir = path.join(root, 'public/music');
    const sfxDir = path.join(root, 'public/sfx');
    const music = fs.existsSync(musicDir) ? fs.readdirSync(musicDir).filter((f) => f.endsWith('.mp3')).length : 0;
    const sfx = fs.existsSync(sfxDir) ? fs.readdirSync(sfxDir).filter((f) => f.endsWith('.mp3')).length : 0;
    log(`in-game audio: ${music} music beds (public/music/), ${sfx} SFX & robot voice takes (public/sfx/)`);
    log(`declarative social ElevenLabs cues (${spec.cues.length} in social/media/specs/audio-cues.json):`);
    for (const c of spec.cues) log(`  - ${c.id} (${c.kind}, ${c.platform}, ~${c.seconds}s): ${c.description}`);
    return 0;
  }

  if (cmd === 'credits') {
    if (!loggedIn(env)) throw new Error(NOT_LOGGED_IN);
    const c = credits(env);
    log(`used ${c.used} of ${c.limit} (tier ${c.tier}); remaining ${c.remaining}; cap ${CAP} per run; reserve ${RESERVE}`);
    return 0;
  }

  if (cmd !== 'plan') {
    throw new Error('usage: social-media.mjs audio plan <cue>... [--variants N] [--generate] | credits | list');
  }
  if (!ids.length) throw new Error('name at least one cue id from social/media/specs/audio-cues.json');

  const reqs = ids.flatMap((id) => {
    const cue = spec.cues.find((c) => c.id === id);
    if (!cue) throw new Error(`unknown social audio cue "${id}" (define it in social/media/specs/audio-cues.json first)`);
    const vId = cue.kind === 'voice' && generate ? voiceId(root, cue.voice, env) : undefined;
    const fId = cue.kind === 'voice' && cue.filter ? (generate ? resolveFilterPresetId(root, cue.filter, env) : cue.filter) : null;
    return Array.from({ length: variants }, (_, idx) => ({ cue, ...buildCueRequest(root, cue, idx + 1, vId, fId) }));
  });

  const totalEstimate = reqs.reduce((n, r) => n + r.estimate, 0);
  if (!generate) {
    fs.mkdirSync(path.join(root, 'social/media/out/audio'), { recursive: true });
    for (const r of reqs) {
      let preview;
      try {
        preview = dryRun(r.argv, env);
      } catch (err) {
        if (err?.code === 'ENOENT') {
          preview = { note: 'elevenlabs CLI binary not installed' };
        } else {
          throw new Error(`${r.take}: ElevenLabs --dry-run rejected request: ${cliError(err)}`, { cause: err });
        }
      }
      log(`${r.take} (${r.kind}) -> ${r.out}, ~${r.estimate} credits`);
      log(`  ${JSON.stringify(preview)}`);
    }
    log(`dry run: ${reqs.length} request(s), ~${totalEstimate} credits; nothing was sent (pass --generate when authorized)`);
    return 0;
  }

  if (!loggedIn(env)) throw new Error(NOT_LOGGED_IN);
  const before = credits(env);
  const refused = capProblem(totalEstimate, before.remaining);
  if (refused) throw new Error(`refused: ${refused}`);

  const ffEnv = withBundledFfmpegEnv(env);
  let exitCode = 0;
  for (const r of reqs) {
    fs.mkdirSync(path.dirname(r.outAbs), { recursive: true });
    try {
      runCli(r.argv, env);
    } catch (err) {
      throw new Error(`${r.take}: ElevenLabs request failed: ${cliError(err)}`, { cause: err });
    }
    if (!fs.existsSync(r.outAbs)) throw new Error(`${r.take}: ElevenLabs wrote no output file`);
    const post = postProcess(r.outAbs, { kind: r.kind, loop: r.loop, bar: 2 }, ffEnv);
    if (!post.post) exitCode = 3;
    patchSocialAudioManifest(root, {
      name: r.take,
      cueId: r.cueId,
      kind: r.kind,
      platform: r.cue.platform,
      file: `${r.take}.mp3`,
      bytes: fs.statSync(r.outAbs).size,
      duration_seconds: post.seconds ? Math.round(post.seconds * 100) / 100 : r.seconds,
      ...(r.cue.text ? { text: r.cue.text, voice: r.cue.voice } : { prompt: r.cue.prompt }),
      post: Boolean(post.post),
    });
    const spent = before.remaining - credits(env).remaining;
    log(`generated ${r.out}${post.post ? '' : ` (${post.reason})`}; spent so far ${spent} (estimated ${totalEstimate})`);
    if (spent > CAP && r !== reqs.at(-1)) {
      log(`stopped: measured spend ${spent} exceeded cap ${CAP}`);
      return 1;
    }
  }
  return exitCode;
}
