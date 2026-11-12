#!/usr/bin/env node
// The local stack (the Vite dev server) as a background process that agents and humans can start and stop
// without a terminal blocking on it.
//   npm start            start it in the background, wait until it answers, print the URLs (no-op if running)
//   npm stop             stop it (only processes started from this project; other Vite servers are left alone)
//   npm restart          stop, then start
//   npm run status       is it running, on which port, where is the log
// Options: --port <n> (or STACK_PORT), default 5173 from vite.config.ts.
// State: scripts/harness/out/stack/stack.json (pid, port) and stack.log (server output). Both git-ignored.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const stateDir = resolve(root, 'scripts/harness/out/stack');
const stateFile = resolve(stateDir, 'stack.json');
const logFile = resolve(stateDir, 'stack.log');
const viteBin = resolve(root, 'node_modules/vite/bin/vite.js');

const args = process.argv.slice(2);
const command = args[0] ?? 'status';
const portArg = args.indexOf('--port');
const port = Number(portArg >= 0 ? args[portArg + 1] : process.env.STACK_PORT ?? 5173);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rel = (p) => relative(root, p);

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readState() {
  if (!existsSync(stateFile)) return null;
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    return null;
  }
}

/** PIDs listening on the TCP port (any address). */
function listeners(p) {
  try {
    return execFileSync('lsof', ['-nP', '-t', `-iTCP:${p}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
      .split('\n').filter(Boolean).map(Number);
  } catch {
    return [];
  }
}

/** The working directory of a process, so we only ever touch servers that belong to this project. */
function cwdOf(pid) {
  try {
    const out = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8' });
    return out.split('\n').find((l) => l.startsWith('n'))?.slice(1) ?? null;
  } catch {
    return null;
  }
}

async function answers(p) {
  try {
    const res = await fetch(`http://localhost:${p}/`, { signal: AbortSignal.timeout(1500) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

function urls(p) {
  return [
    `  game       http://localhost:${p}/`,
    `  dev        http://localhost:${p}/dev.html`,
    `  storybook  http://localhost:${p}/storybook.html`,
    `  inspect    http://localhost:${p}/storybook.html?inspect=<model id>`,
  ].join('\n');
}

/** Our server's PIDs: the one we started plus any listener on the port that runs from this project. */
function ourPids(p) {
  const pids = new Set();
  const state = readState();
  if (state && alive(state.pid)) pids.add(state.pid);
  for (const pid of listeners(p)) if (cwdOf(pid) === root) pids.add(pid);
  return [...pids];
}

async function start() {
  const mine = ourPids(port);
  if (mine.length && (await answers(port))) {
    console.log(`stack already running (pid ${mine.join(', ')}, port ${port})\n${urls(port)}`);
    return 0;
  }
  const foreign = listeners(port).filter((pid) => !mine.includes(pid));
  if (foreign.length) {
    console.error(`port ${port} is taken by pid ${foreign.join(', ')} (${cwdOf(foreign[0]) ?? 'unknown dir'}), not this project.`);
    console.error(`Stop that process or run on another port: npm start -- --port ${port + 1}`);
    return 1;
  }
  if (!existsSync(viteBin)) {
    console.error('vite is not installed: run `npm ci` first.');
    return 1;
  }
  mkdirSync(stateDir, { recursive: true });
  const log = openSync(logFile, 'w');
  const child = spawn(process.execPath, [viteBin, '--port', String(port), '--strictPort'], {
    cwd: root, detached: true, stdio: ['ignore', log, log],
  });
  child.unref();
  writeFileSync(stateFile, JSON.stringify({ pid: child.pid, port, startedAt: new Date().toISOString() }, null, 2));
  for (let i = 0; i < 60; i++) {
    if (await answers(port)) {
      console.log(`stack started (pid ${child.pid}, port ${port}, log ${rel(logFile)})\n${urls(port)}`);
      return 0;
    }
    if (!alive(child.pid)) break;
    await sleep(250);
  }
  console.error(`stack did not come up on port ${port}. Last log lines (${rel(logFile)}):`);
  console.error(readFileSync(logFile, 'utf8').split('\n').slice(-15).join('\n'));
  await stop(true);
  return 1;
}

async function stop(quiet = false) {
  const pids = ourPids(port);
  for (const pid of pids) {
    // Detached children lead their own process group: signal the group, fall back to the pid.
    try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ } }
  }
  for (let i = 0; i < 20 && pids.some(alive); i++) await sleep(250);
  for (const pid of pids.filter(alive)) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }
  rmSync(stateFile, { force: true });
  if (!quiet) console.log(pids.length ? `stack stopped (pid ${pids.join(', ')})` : `stack is not running (port ${port})`);
  return 0;
}

async function status() {
  const pids = ourPids(port);
  if (pids.length && (await answers(port))) {
    console.log(`stack running (pid ${pids.join(', ')}, port ${port}, log ${rel(logFile)})\n${urls(port)}`);
  } else if (pids.length) {
    console.log(`stack process alive (pid ${pids.join(', ')}) but port ${port} does not answer; see ${rel(logFile)}`);
  } else {
    console.log(`stack is not running (port ${port}). Start it with: npm start`);
  }
  return 0;
}

const commands = {
  start,
  stop: () => stop(),
  restart: async () => (await stop(), start()),
  status,
};
if (!(command in commands)) {
  console.error(`usage: node scripts/harness/stack.mjs start|stop|restart|status [--port <n>]`);
  process.exit(2);
}
process.exit(await commands[command]());
