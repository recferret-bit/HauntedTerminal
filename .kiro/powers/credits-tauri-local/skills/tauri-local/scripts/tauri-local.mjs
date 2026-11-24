#!/usr/bin/env node
// Local, unversioned Tauri build for Out Of Credits (power `credits-tauri-local`, spec .kiro/specs/release-tags-power/).
//
//   node .kiro/powers/credits-tauri-local/skills/tauri-local/scripts/tauri-local.mjs            build for this machine, then open it
//   node .../tauri-local.mjs --no-open                                                          build only
//   node .../tauri-local.mjs --dry-run                                                          gates + web build + Tauri generation, no native build
//   node .../tauri-local.mjs --selftest                                                         pure checks, no build
//
// It wraps scripts/desktop/build-tauri-steam.mjs for the host only (no Steamworks, no matrix). It never tags, pushes,
// bumps a version, reads a credential or publishes. Output: scripts/harness/out/tauri-local/<label>/ (git-ignored).
// Exit codes: 0 ok, 1 the build failed, 2 setup needed (Rust toolchain missing).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const outBase = join(root, 'scripts/harness/out/tauri-local');

/** Parse argv. Pure. */
export function parseCli(argv) {
  const opts = { open: true, dryRun: false, selftest: false, problems: [] };
  for (const a of argv) {
    if (a === '--no-open') opts.open = false;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--selftest') opts.selftest = true;
    else opts.problems.push(`unknown argument: ${a}`);
  }
  return opts;
}

/** Label of a local build: it is a folder name, never a version. Pure. */
export function buildLabel(sha, dirty) {
  const clean = String(sha).replace(/[^0-9a-f]/gi, '').slice(0, 9) || 'nogit';
  return `local-${clean}${dirty ? '-dirty' : ''}`;
}

/** The command that opens `path` on `platform`. Pure. */
export function openCommand(platform, path) {
  if (platform === 'darwin') return ['open', [path]];
  if (platform === 'win32') return ['explorer', [path]];
  return ['xdg-open', [path]];
}

/** The build script arguments for one local build. Pure. */
export function buildArgs(releaseOut, dryRun) {
  const args = ['scripts/desktop/build-tauri-steam.mjs', '--no-steam', '--release-out', releaseOut];
  if (dryRun) args.push('--dry-run');
  return args;
}

function git(args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

/** The built macOS .app if there is one, else the output folder. */
function openTarget(releaseOut) {
  const macosDir = join(root, 'src-tauri/target/release/bundle/macos');
  if (existsSync(macosDir)) {
    const app = readdirSync(macosDir).find((f) => f.endsWith('.app'));
    if (app) return join(macosDir, app);
  }
  return releaseOut;
}

function run() {
  const opts = parseCli(process.argv.slice(2));
  if (opts.problems.length > 0) {
    for (const p of opts.problems) console.error(p);
    return 1;
  }
  const label = buildLabel(git(['rev-parse', '--short', 'HEAD']), git(['status', '--porcelain']) !== '');
  const releaseOut = join(outBase, label);
  console.log(`local Tauri build ${label} (not versioned, not a production build) -> ${relative(root, releaseOut)}`);
  const build = spawnSync('node', buildArgs(releaseOut, opts.dryRun), { cwd: root, stdio: 'inherit' });
  if (build.status !== 0) {
    console.error(build.status === 2 ? 'Rust toolchain missing: install it from https://rustup.rs and run again.' : `build failed (exit ${build.status}).`);
    return build.status === 2 ? 2 : 1;
  }
  if (opts.dryRun) return 0;
  mkdirSync(releaseOut, { recursive: true });
  writeFileSync(join(releaseOut, 'LOCAL-BUILD.txt'), `Local build ${label}. Not versioned, not a production build, not published.\n`);
  if (opts.open) {
    const [cmd, args] = openCommand(process.platform, openTarget(releaseOut));
    spawnSync(cmd, args, { stdio: 'ignore' });
  }
  return 0;
}

function selftest() {
  const eq = (a, b, what) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  };
  eq(parseCli([]).open, true, 'open by default');
  eq(parseCli(['--no-open']).open, false, '--no-open');
  eq(parseCli(['--tag']).problems.length, 1, 'unknown argument');
  eq(buildLabel('abc1234', false), 'local-abc1234', 'clean label');
  eq(buildLabel('abc1234', true), 'local-abc1234-dirty', 'dirty label');
  eq(buildLabel('', false), 'local-nogit', 'no git');
  eq(buildLabel('xyz; ../..', false), 'local-nogit', 'a label takes hex digits only');
  eq(openCommand('darwin', '/a')[0], 'open', 'open on macOS');
  eq(openCommand('linux', '/a')[0], 'xdg-open', 'open on Linux');
  eq(buildArgs('/o', false).includes('--steam'), false, 'no Steamworks');
  eq(buildArgs('/o', true).includes('--dry-run'), true, 'dry run passes through');
  console.log('tauri-local selftest OK');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(process.argv.includes('--selftest') ? selftest() : run());
}
