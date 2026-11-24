#!/usr/bin/env node
// Gated Netlify deploy for Out Of Credits (power `credits-ship`, spec .kiro/specs/netlify-deploy-power/).
//
//   node .kiro/powers/credits-ship/skills/ship/scripts/ship.mjs preview [--site-name <name>]
//   node .kiro/powers/credits-ship/skills/ship/scripts/ship.mjs prod        (only after the user's explicit yes)
//   node .kiro/powers/credits-ship/skills/ship/scripts/ship.mjs --dry-run   (gates + build, no login, no upload)
//   node .kiro/powers/credits-ship/skills/ship/scripts/ship.mjs --selftest  (pure checks, no network)
//
// preview: login check -> npm run quality -> generate-chapter --verify -> npm run build -> draft deploy of dist/
//          -> the whole chapter played on the preview URL -> stamp in scripts/harness/out/ship/last-preview.json.
// prod:    refuses unless the stamp is from a clean tree, the commit and the dist/ hash are unchanged; then a
//          production deploy of the same dist/ and the chapter played again on the production URL.
// Credentials: `netlify login` or NETLIFY_AUTH_TOKEN in the environment. The token is never read, stored or printed.
// Exit codes: 0 ok, 1 a gate, deploy or play failed (or a refusal), 2 setup needed (login).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const NETLIFY = ['-y', 'netlify-cli@27.20.0'];
const outDir = join(root, 'scripts/harness/out/ship');
const stampPath = join(outDir, 'last-preview.json');
const sitePath = join(outDir, 'site.json');
const DEFAULT_SITE_NAME = 'out-of-credits';
const GATES = [
  ['npm', ['run', 'quality']],
  ['node', ['scripts/harness/generate-chapter.mjs', '--verify']],
  ['npm', ['run', 'build']],
];

/** Parse argv into a command and options. Pure. */
export function parseCli(argv) {
  const opts = { command: null, siteName: null, problems: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--site-name') opts.siteName = argv[++i] ?? null;
    else if (a === '--dry-run' || a === '--selftest') opts.command = opts.command ?? a.slice(2);
    else if (a === 'preview' || a === 'prod') opts.command = opts.command ?? a;
    else opts.problems.push(`unknown argument: ${a}`);
  }
  if (!opts.command) opts.problems.push('missing command: preview, prod, --dry-run or --selftest');
  if (opts.siteName !== null && !/^[a-z0-9-]{1,63}$/.test(opts.siteName)) opts.problems.push('--site-name must be lowercase letters, digits and dashes');
  return opts;
}

/** Hide every secret value of `env` that appears in `text`. Pure. */
export function redact(text, env = process.env) {
  let out = String(text);
  for (const key of ['NETLIFY_AUTH_TOKEN', 'NETLIFY_PERSONAL_ACCESS_TOKEN']) {
    const value = env[key];
    if (value && value.length >= 6) out = out.split(value).join(`<${key}>`);
  }
  return out.replace(/(--auth[ =])\S+/g, '$1<redacted>');
}

/** Content hash of a folder: sorted relative paths and bytes. Changes when any file is added, removed or edited. */
export function hashDir(dir) {
  const files = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(dir);
  const h = createHash('sha256');
  for (const p of files) {
    h.update(relative(dir, p).split(sep).join('/'));
    h.update('\0');
    h.update(readFileSync(p));
    h.update('\0');
  }
  return `sha256:${h.digest('hex')}`;
}

/** The deploy record printed by `netlify deploy --json` (the CLI may print other lines first). Pure. */
export function parseDeployJson(stdout) {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    const data = JSON.parse(stdout.slice(start, end + 1));
    if (!data.deploy_id || !data.site_id) return null;
    return { deployId: data.deploy_id, siteId: data.site_id, siteName: data.site_name ?? null, deployUrl: data.deploy_url ?? null, url: data.url ?? null };
  } catch {
    return null;
  }
}

/** Why production must be refused for this stamp and current state (empty list: promote). Pure. */
export function promoteProblems(stamp, current) {
  if (!stamp) return ['no passing preview recorded: run `ship.mjs preview` first'];
  const problems = [];
  if (stamp.dirty) problems.push('the preview was made from a working tree with uncommitted changes: commit, then run a new preview');
  if (current.dirty) problems.push('the working tree has uncommitted changes now: commit or stash, then run a new preview');
  if (stamp.commit !== current.commit) problems.push(`the commit changed since the preview (${short(stamp.commit)} -> ${short(current.commit)}): run a new preview`);
  if (stamp.distHash !== current.distHash) problems.push('dist/ changed since the preview: run a new preview');
  if (!stamp.siteId) problems.push('the preview record has no site id: run a new preview');
  return problems;
}

const short = (sha) => String(sha ?? 'none').slice(0, 8);

function run(cmd, args, { capture = false } = {}) {
  console.log(`\n$ ${redact([cmd, ...args].join(' '))}`);
  const res = spawnSync(cmd, args, { cwd: root, env: process.env, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
  return { ok: res.status === 0, stdout: res.stdout ?? '' };
}

function git(args) {
  const res = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return (res.stdout ?? '').trim();
}

function currentState() {
  const distDir = join(root, 'dist');
  return {
    commit: git(['rev-parse', 'HEAD']),
    dirty: git(['status', '--porcelain']).length > 0,
    distHash: existsSync(distDir) ? hashDir(distDir) : null,
  };
}

const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function loggedIn() {
  const res = spawnSync('npx', [...NETLIFY, 'status', '--json'], { cwd: root, env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    return JSON.parse(res.stdout.slice(res.stdout.indexOf('{'))).loggedIn === true;
  } catch {
    return false;
  }
}

function runGates() {
  for (const [cmd, args] of GATES) {
    if (!run(cmd, args).ok) {
      console.error(`\nFAIL     gate failed: ${cmd} ${args.join(' ')}. Nothing was uploaded.`);
      return false;
    }
  }
  return true;
}

function siteTarget(opts) {
  const siteId = process.env.NETLIFY_SITE_ID || readJson(sitePath)?.siteId || null;
  return siteId ? ['--site', siteId] : ['--site-name', opts.siteName ?? DEFAULT_SITE_NAME];
}

function deploy(target, { prod }) {
  const message = `credits-ship ${prod ? 'production' : 'preview'} ${short(git(['rev-parse', 'HEAD']))}`;
  const args = [...NETLIFY, 'deploy', '--dir', 'dist', '--no-build', '--json', '--message', message, ...target];
  if (prod) args.push('--prod');
  const res = run('npx', args, { capture: true });
  const record = res.ok ? parseDeployJson(res.stdout) : null;
  if (!record) console.error(`\nFAIL     netlify deploy did not return a deploy record${res.ok ? '' : ' (non-zero exit)'}`);
  return record;
}

function play(url) {
  const ok = run('node', ['scripts/harness/play-browser.mjs', '--url', url, '--nointro']).ok;
  if (!ok) console.error(`\nFAIL     the chapter did not play to the end on ${url}`);
  return ok;
}

function preview(opts) {
  if (!loggedIn()) {
    console.error('SETUP    not logged in to Netlify. Run once:  npx netlify-cli@27.20.0 login   (or set NETLIFY_AUTH_TOKEN in your shell)');
    return 2;
  }
  if (!runGates()) return 1;
  const before = currentState();
  const record = deploy(siteTarget(opts), { prod: false });
  if (!record) return 1;
  writeJson(sitePath, { siteId: record.siteId, siteName: record.siteName });
  if (!play(record.deployUrl)) return 1;
  writeJson(stampPath, { ...before, deployId: record.deployId, siteId: record.siteId, url: record.deployUrl, at: new Date().toISOString() });
  console.log(`\nPASS     preview ${record.deployUrl}`);
  console.log(before.dirty
    ? 'NOTE     made from uncommitted changes: commit and run a new preview before production.'
    : 'NEXT     check it in a browser; production only after an explicit yes:  ship.mjs prod');
  return 0;
}

function prod() {
  if (!loggedIn()) {
    console.error('SETUP    not logged in to Netlify. Run once:  npx netlify-cli@27.20.0 login');
    return 2;
  }
  const stamp = readJson(stampPath);
  const problems = promoteProblems(stamp, currentState());
  if (problems.length) {
    for (const p of problems) console.error(`REFUSE   ${p}`);
    return 1;
  }
  const record = deploy(['--site', stamp.siteId], { prod: true });
  if (!record) return 1;
  const url = record.url ?? record.deployUrl;
  if (!play(url)) return 1;
  console.log(`\nPASS     production ${url}  (the build played on preview ${stamp.url})`);
  console.log('NEXT     replace <LIVE_URL> in README.md (2 places) and set the GitHub About website to this URL.');
  return 0;
}

function dryRun() {
  if (!runGates()) return 1;
  const state = currentState();
  console.log(`\nPASS     dry run: gates and build passed. Would upload dist/ (${state.distHash}) from ${short(state.commit)}${state.dirty ? ' (uncommitted changes)' : ''} as a draft deploy, then play it.`);
  return 0;
}

function selftest() {
  const problems = [];
  const expect = (cond, what) => { if (!cond) problems.push(what); };
  expect(parseCli(['preview']).command === 'preview' && parseCli(['preview']).problems.length === 0, 'parses preview');
  expect(parseCli([]).problems.length === 1, 'refuses a missing command');
  expect(parseCli(['prod', '--force']).problems.length === 1, 'refuses an unknown flag');
  expect(parseCli(['preview', '--site-name', 'Bad Name']).problems.length === 1, 'refuses a bad site name');
  const env = { NETLIFY_AUTH_TOKEN: 'nfp_secret123456' };
  expect(!redact('token nfp_secret123456 --auth nfp_x', env).includes('nfp_'), 'redacts the token and --auth values');
  expect(parseDeployJson('Deploying...\n{"site_id":"s","deploy_id":"d","deploy_url":"https://d--x.netlify.app"}').deployUrl === 'https://d--x.netlify.app', 'parses the deploy record');
  expect(parseDeployJson('no json') === null && parseDeployJson('{"site_id":"s"}') === null, 'rejects a bad deploy record');
  const stamp = { commit: 'a1', dirty: false, distHash: 'h1', siteId: 's' };
  expect(promoteProblems(stamp, { commit: 'a1', dirty: false, distHash: 'h1' }).length === 0, 'promotes the played build');
  expect(promoteProblems(null, {}).length === 1, 'refuses without a preview');
  expect(promoteProblems({ ...stamp, dirty: true }, { commit: 'a1', dirty: false, distHash: 'h1' }).length === 1, 'refuses a preview from a dirty tree');
  expect(promoteProblems(stamp, { commit: 'a2', dirty: false, distHash: 'h1' }).length === 1, 'refuses a changed commit');
  expect(promoteProblems(stamp, { commit: 'a1', dirty: true, distHash: 'h1' }).length === 1, 'refuses a dirty tree now');
  expect(promoteProblems(stamp, { commit: 'a1', dirty: false, distHash: 'h2' }).length === 1, 'refuses a changed dist/');
  const tmp = mkdtempSync(join(tmpdir(), 'ship-selftest-'));
  try {
    mkdirSync(join(tmp, 'a'));
    writeFileSync(join(tmp, 'a/x.js'), '1');
    const h1 = hashDir(tmp);
    expect(h1 === hashDir(tmp), 'hash is stable');
    writeFileSync(join(tmp, 'a/x.js'), '2');
    expect(hashDir(tmp) !== h1, 'hash changes with a file');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  for (const p of problems) console.error(`FAIL     selftest: ${p}`);
  console.log(problems.length ? `selftest FAIL (${problems.length})` : 'selftest PASS (15 checks)');
  return problems.length ? 1 : 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const opts = parseCli(process.argv.slice(2));
  if (opts.problems.length) {
    for (const p of opts.problems) console.error(`usage    ${p}`);
    process.exitCode = 1;
  } else {
    const commands = { preview: () => preview(opts), prod, 'dry-run': dryRun, selftest };
    process.exitCode = commands[opts.command]();
  }
}
