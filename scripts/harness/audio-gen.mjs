#!/usr/bin/env node
// The one way an agent reaches ElevenLabs (spec .kiro/specs/audio-agent/). Owned by lead-dev, so the agent that spends
// credits cannot raise its own cap (Q11). Dry run unless --generate; only sound-designer may pass --generate (the
// agent-shell-guard hook). Writes only public/sfx/<cue>.mp3 or public/music/<cue>.mp3 and that folder's manifest.
//   node scripts/harness/audio-gen.mjs plan <cue>... [--variants N] [--text "<line>"]   requests + estimate (no API call)
//   node scripts/harness/audio-gen.mjs plan <cue>... [...] --generate                  generate, post-process, patch manifest
//   node scripts/harness/audio-gen.mjs credits                                          balance, cap and reserve
//   node scripts/harness/audio-gen.mjs schema <resource> [<method>]                     the CLI's machine-readable --schema
//   node scripts/harness/audio-gen.mjs --check                                          offline consistency check
// Exit: 0 ok, 1 refused or failed, 3 generated but post-processing skipped (no ffmpeg).
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CAP, NOT_LOGGED_IN, RESERVE, capProblem, credits, dryRun, loggedIn, runCli, voiceId } from './lib/audio-gen-cli.mjs';
import { checkAudio, readManifest, writeEntry, MANIFESTS } from './lib/audio-gen-manifest.mjs';
import { postProcess } from './lib/audio-gen-post.mjs';
import { buildRequests } from './lib/audio-gen-request.mjs';
import { barSeconds, loadRows, rowFor } from './lib/audio-gen-rows.mjs';
import { projectRoot } from './lib/load.mjs';

const SCHEMA_WORD = /^[a-z][a-z0-9_-]*$/;
const MAX_VARIANTS = 4;

/** `{ cmd, cues, variants, text, generate, check }` from argv; throws on anything it does not know. */
export function parseCli(argv) {
  const opts = { cmd: null, cues: [], variants: 1, text: null, generate: false, check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') opts.check = true;
    else if (a === '--generate') opts.generate = true;
    else if (a === '--variants') opts.variants = Number(argv[++i]);
    else if (a === '--text') opts.text = argv[++i] ?? '';
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else if (!opts.cmd) opts.cmd = a;
    else opts.cues.push(a);
  }
  if (!Number.isInteger(opts.variants) || opts.variants < 1 || opts.variants > MAX_VARIANTS) throw new Error(`--variants must be 1 to ${MAX_VARIANTS}`);
  return opts;
}

/** Every request of a plan, voice ids resolved only when generating (a dry run makes no lookup). */
function planRequests(root, opts, env) {
  const rows = loadRows(root);
  if (!opts.cues.length) throw new Error('name at least one cue (a Name of docs/audio/SFX_LIST.md or MUSIC_LIST.md)');
  return opts.cues.flatMap((cue) => {
    const hit = rowFor(rows, cue);
    if (!hit) throw new Error(`${cue}: no row in docs/audio/SFX_LIST.md or MUSIC_LIST.md; write the row first`);
    const id = hit.row.kind === 'voice' && opts.generate ? voiceId(root, hit.row.voice, env) : undefined;
    return buildRequests({ root, row: hit.row, name: cue, variants: opts.variants, text: opts.text, voiceId: id }).map((r) => ({ ...r, row: hit.row, cue }));
  });
}

/** The manifest entry for a generated take: the existing one patched, or a new one in the shape of its neighbours. */
function entryFor(root, req, opts, post) {
  const old = (readManifest(root, req.group)[MANIFESTS[req.group].list] ?? []).find((e) => e.name === req.take);
  const file = { file: `${req.take}.mp3`, bytes: statSync(join(root, req.out)).size };
  const seconds = post.seconds ? Math.round(post.seconds * 100) / 100 : req.seconds;
  const base = old ?? (req.group === 'music'
    ? { name: req.take, where: req.row.effect, listed_seconds: req.row.seconds, plan_ms: Math.round(req.seconds * 1000), loop: req.row.loop }
    : { row: Number(req.row.row) || req.row.row, name: req.take, effect: req.row.effect, listed_seconds: req.row.seconds, duration_seconds: req.seconds, loop: req.row.loop });
  const entry = { ...base, files: [file] };
  if (req.kind === 'voice') Object.assign(entry, { duration_seconds: seconds, text: opts.text, voice: req.row.voice });
  if (post.post === false) entry.post = false;
  else delete entry.post;
  return entry;
}

/** The CLI's own message from a failed run (its JSON error, else the first stderr line), never the command line. */
function cliError(err) {
  const text = String(err.stdout || err.stderr || err.message);
  try {
    const parsed = JSON.parse(text);
    return parsed.error?.message ?? parsed.message ?? text.trim().split('\n')[0];
  } catch {
    return text.trim().split('\n')[0];
  }
}

function printPlan(reqs, env, log) {
  for (const r of reqs) {
    let sent;
    try {
      sent = dryRun(r.argv, env);
    } catch (err) {
      sent = { error: `the CLI's --dry-run refused it: ${cliError(err)}` };
    }
    log(`${r.take} (${r.kind}${r.plan ? ', composition plan' : ''}) -> ${r.out}, ~${r.estimate} credits`);
    log(`  ${JSON.stringify(sent)}`);
  }
}

/** Generates every request under the cap; stops early when the measured spend passes it. Returns the exit code. */
function generate(root, reqs, opts, env, log) {
  if (!loggedIn(env)) throw new Error(NOT_LOGGED_IN);
  const estimate = reqs.reduce((n, r) => n + r.estimate, 0);
  const before = credits(env);
  const refused = capProblem(estimate, before.remaining);
  if (refused) throw new Error(`refused: ${refused}`);
  let code = 0;
  for (const r of reqs) {
    try {
      runCli(r.argv, env);
    } catch (err) {
      throw new Error(`${r.take}: the request failed: ${cliError(err)}`, { cause: err });
    }
    if (!existsSync(join(root, r.out))) throw new Error(`${r.take}: the CLI wrote no file`);
    const post = postProcess(join(root, r.out), { kind: r.kind, loop: r.row.loop, bar: barSeconds(r.row.prompt) }, env);
    if (!post.post) code = 3;
    writeEntry(root, r.group, entryFor(root, r, opts, post));
    const spent = before.remaining - credits(env).remaining;
    log(`generated ${r.out}${post.post ? '' : ` (${post.reason})`}; spent so far ${spent} (estimated ${estimate})`);
    if (spent > CAP && r !== reqs.at(-1)) {
      log(`stopped: measured spend ${spent} passed the cap of ${CAP}; the rest was not generated`);
      return 1;
    }
  }
  return code;
}

/** The whole command. `root` and `env` are parameters so the unit suite can run it on a temp copy with a fake CLI. */
export function main(argv, { root = projectRoot, env = process.env, log = console.log } = {}) {
  const opts = parseCli(argv);
  if (opts.check) {
    const problems = checkAudio(root);
    for (const p of problems) log(`  - ${p}`);
    log(problems.length ? `audio check FAILED (${problems.length})` : 'audio check OK');
    return problems.length ? 1 : 0;
  }
  if (opts.cmd === 'credits') {
    if (!loggedIn(env)) throw new Error(NOT_LOGGED_IN);
    const c = credits(env);
    log(`used ${c.used} of ${c.limit} (tier ${c.tier}); remaining ${c.remaining}; cap ${CAP} per run; reserve ${RESERVE}`);
    return 0;
  }
  if (opts.cmd === 'schema') {
    if (!opts.cues.length || opts.cues.length > 2 || !opts.cues.every((w) => SCHEMA_WORD.test(w))) throw new Error('schema <resource> [<method>]');
    log(runCli([...opts.cues, '--schema'], env).trimEnd());
    return 0;
  }
  if (opts.cmd !== 'plan') throw new Error('usage: audio-gen.mjs plan <cue>... [--variants N] [--text "<line>"] [--generate] | credits | schema <resource> [<method>] | --check');
  const reqs = planRequests(root, opts, env);
  if (!opts.generate) {
    printPlan(reqs, env, log);
    log(`dry run: ${reqs.length} request(s), ~${reqs.reduce((n, r) => n + r.estimate, 0)} credits; nothing was sent (add --generate when the brief says generate)`);
    return 0;
  }
  return generate(root, reqs, opts, env, log);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`audio-gen: ${err.message}`);
    process.exitCode = 1;
  }
}
