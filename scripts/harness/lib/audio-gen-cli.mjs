// The only code that runs the `elevenlabs` CLI (always as an argv array, never through a shell): login check, credit
// balance, the cap, voice ids, and the request itself. It never reads .env, never passes --xi-api-key, and prints only
// counts and the tier. Spec: .kiro/specs/audio-agent/ (Req 7, 8; Q6, Q9, Q11: lead-dev owns these numbers).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Most credits one run may spend (user, 2026-11-28, Q6). */
export const CAP = 15000;
/** A run must leave at least this many credits (twice the cap). */
export const RESERVE = 2 * CAP;
const IDS_CACHE = 'scripts/harness/out/audio-gen/ids.json';

/** Runs `elevenlabs <argv>` and returns stdout. `env` carries PATH (the unit suite puts a fake CLI first). */
export function runCli(argv, env = process.env) {
  return execFileSync('elevenlabs', argv, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

function json(argv, env) {
  return JSON.parse(runCli([...argv, '--format', 'json'], env));
}

/** True when the CLI has an active credential source (the Keychain OAuth login). */
export function loggedIn(env) {
  try {
    const status = json(['auth', 'status'], env);
    return (status.schemes ?? []).some((s) => s.logged_in === true || (s.sources ?? []).some((src) => src.state === 'active'));
  } catch {
    return false;
  }
}

export const NOT_LOGGED_IN = 'not logged in: run `elevenlabs auth login` (the wrapper uses the CLI login; it never reads an API key)';

/** `{ used, limit, remaining, tier }` from `user subscription get`. Nothing else of the reply is kept. */
export function credits(env) {
  const sub = json(['user', 'subscription', 'get'], env);
  const used = Number(sub.character_count);
  const limit = Number(sub.character_limit);
  if (!Number.isFinite(used) || !Number.isFinite(limit)) throw new Error('could not read the credit balance (user subscription get)');
  return { used, limit, remaining: limit - used, tier: String(sub.tier ?? '') };
}

/** Why a run of `estimate` credits must not start with `remaining` left, or null. */
export function capProblem(estimate, remaining) {
  if (estimate > CAP) return `estimated ${estimate} credits is over the cap of ${CAP} per run: ask for fewer takes or split the run`;
  if (remaining - estimate < RESERVE) return `only ${remaining} credits left; the run (${estimate}) would leave less than the reserve of ${RESERVE}`;
  return null;
}

/** Voice id for a premade voice name (`Laura`), looked up once and cached in the git-ignored harness output. */
export function voiceId(root, name, env) {
  const path = join(root, IDS_CACHE);
  const cache = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  if (cache[name]) return cache[name];
  const found = json(['voices', 'search', '--search', name, '--query', 'voices[].{id: voice_id, name: name}'], env)
    .find((v) => v.name === name || String(v.name).startsWith(`${name} `));
  if (!found) throw new Error(`no ElevenLabs voice named ${name}`);
  cache[name] = found.id;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, `${JSON.stringify(cache, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
  return found.id;
}

/** What the request would send, from the CLI's own `--dry-run` (no network): method, url and body; never auth. */
export function dryRun(argv, env) {
  const r = json([...argv, '--dry-run'], env);
  return { method: r.method, url: r.url, body: r.body };
}
