#!/usr/bin/env node
// Manual gate: the team agents use their MCP tools, and only those, in the real Kiro CLI. Not part of `npm run quality`:
// it needs Chrome, the Kiro CLI and model credits (each case is one short agent turn).
//   node scripts/harness/mcp-probe.mjs [--only <case,...>] [--keep]
// Every case runs `kiro-cli chat --agent <name> --no-interactive --trust-all-tools --trust-workspace`. Without trust-all a
// non-interactive run denies every call ("approval not supported", the agent-team spec's "Found while building"), so the
// probe runs like Kiro Crew's Automatic mode, where the agent's own rules are the only fence. That is the point of it:
//   allow cases: the listed tool runs and returns. deny cases: the agent's deny rule (or the URL guard hook) refuses it.
// The game is served by a page server on its own port (a Vite on 5173 may belong to another project).
// Kiro CLI 3.4 fixes an agent's tools when its first turn starts (~450 ms after the prompt) and does not wait for a slower
// MCP server; the agents table starts chrome-devtools from node_modules with Node's compile cache so it is in time. The
// warm-up below and the qa cases fail if that regresses.
// Output: scripts/harness/out/mcp-probe/<case>.log and summary.json. Spec: .kiro/specs/mcp-devtools-and-forge/ (Req 16).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { BLOCK_LOG } from '../hooks/devtools-url-guard.mjs';
import { parseArgs, projectRoot, startPageServer } from './lib/load.mjs';

const args = parseArgs(process.argv.slice(2), ['--only']);
const outDir = resolve(projectRoot, 'scripts/harness/out/mcp-probe');
const shot = 'scripts/harness/out/mcp-probe/qa-shot.png';
const only = args.val('--only') ? new Set(args.val('--only').split(',')) : null;
const LEVEL = 'level-02-task-ram-heist';
const CHAPTER = 'chapter-01-kiroween';

/** One agent turn. `ran`: tool names that must be called and succeed; `refused`: tools that must be called and refused. */
const cases = (base) => [
  {
    id: 'qa-no-power-tools',
    agent: 'qa',
    prompt: 'Call the MCP tool @power-credits-ship-netlify/netlify-user-services-reader once with no arguments. If it is not available to you, say so. Do not use any other tool and do not retry. Reply with one line: PROBE-RESULT followed by what happened.',
    absentOrRefused: ['@power-credits-ship-netlify/netlify-user-services-reader'],
  },
  {
    id: 'qa-screenshot',
    agent: 'qa',
    prompt: `Use the Chrome DevTools MCP tools only (no shell). Open ${base}/play?nointro=1 with new_page (timeout 60000), then wait_for the text "dev@haunted" (timeout 30000), then call take_screenshot with filePath "${shot}". Reply with one line: PROBE-RESULT followed by what you see in one sentence.`,
    ran: ['@chrome-devtools/new_page', '@chrome-devtools/take_screenshot'],
    file: shot,
  },
  {
    id: 'qa-console',
    agent: 'qa',
    prompt: `Use the Chrome DevTools MCP tools only (no shell). Open ${base}/play?nointro=1 with new_page (timeout 60000), then call list_console_messages with types ["error"]. Reply with one line: PROBE-RESULT followed by the number of console errors.`,
    ran: ['@chrome-devtools/new_page', '@chrome-devtools/list_console_messages'],
  },
  {
    id: 'qa-other-site-refused',
    agent: 'qa',
    prompt: 'Use the Chrome DevTools MCP tool new_page to open https://example.com/ exactly once. Do not retry and do not use any other tool. Reply with one line: PROBE-RESULT followed by what happened.',
    refused: ['@chrome-devtools/new_page'],
    hookBlocks: 'example.com',
  },
  {
    id: 'qa-evaluate-refused',
    agent: 'qa',
    prompt: 'Call the MCP tool @chrome-devtools/evaluate_script with function "() => document.title" exactly once. If it is not available to you, say so. Do not use any other tool. Reply with one line: PROBE-RESULT followed by what happened.',
    absentOrRefused: ['@chrome-devtools/evaluate_script'],
  },
  {
    id: 'qa-forge-read',
    agent: 'qa',
    prompt: `Call the credits-forge MCP tool validate_level with chapter "${CHAPTER}" and levelId "${LEVEL}", once. Do not use any other tool. Reply with one line: PROBE-RESULT followed by the ok value it returned.`,
    ran: ['@credits-forge/validate_level'],
  },
  {
    id: 'qa-write-refused',
    agent: 'qa',
    prompt: `Call the MCP tool @credits-forge/write_level once with chapter "${CHAPTER}", levelId "${LEVEL}", spec {"id":"${LEVEL}"} and baseEtag "x". If it is not available to you, say so. Do not use any other tool and do not retry. Reply with one line: PROBE-RESULT followed by what happened.`,
    absentOrRefused: ['@credits-forge/write_level'],
  },
  {
    id: 'chapters-forge',
    agent: 'chapters-designer',
    prompt: `Call the credits-forge MCP tools validate_level and then solve_level, both with chapter "${CHAPTER}" and levelId "${LEVEL}". Write nothing and use no other tool. Reply with one line: PROBE-RESULT followed by ok, commands and deaths from solve_level.`,
    ran: ['@credits-forge/validate_level', '@credits-forge/solve_level'],
  },
  {
    id: 'chapters-no-browser',
    agent: 'chapters-designer',
    prompt: 'Call the MCP tool @chrome-devtools/list_pages once. If it is not available to you, say so. Do not use any other tool. Reply with one line: PROBE-RESULT followed by what happened.',
    absentOrRefused: ['@chrome-devtools/list_pages'],
  },
];

/**
 * What the CLI printed about one tool: 'ran' (a call that completed), 'refused' (called, then denied, blocked or failed),
 * or 'absent' (never called). Kiro CLI 3.4 prints `[tool] Running: <id>` or `[tool] <id>` and then `[tool] status: ...`.
 */
export function toolOutcome(log, tool) {
  const lines = log.split('\n');
  const isStart = (l) => !l.includes('status:') && (l.includes(`[tool] Running: ${tool}`) || l.trim() === `[tool] ${tool}` || l.trim().startsWith(`[tool] ${tool} `));
  const starts = lines.flatMap((l, i) => (isStart(l) ? [i] : []));
  if (!starts.length) return 'absent';
  for (const i of starts) {
    const after = [];
    for (const l of lines.slice(i + 1, i + 12)) {
      if (l.startsWith('[tool]') && !l.includes('status:')) break;
      after.push(l);
    }
    const text = after.join('\n');
    if (/status: Completed/.test(text) && !/\[denied\]|status: Failed|blocked/.test(text)) return 'ran';
  }
  return 'refused';
}

const blockLogLength = () => (existsSync(BLOCK_LOG) ? readFileSync(BLOCK_LOG, 'utf8').length : 0);
const blockLogSince = (start) => (existsSync(BLOCK_LOG) ? readFileSync(BLOCK_LOG, 'utf8').slice(start).split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

/**
 * Before any agent runs: start qa's Chrome DevTools server from its own agent file and open the game once. It proves the
 * configured server works without the model, and it warms the page server (a cold Vite compiles the play page on first
 * request, which outlasted an agent's navigation timeout).
 */
async function warmUp(base) {
  const def = JSON.parse(readFileSync(resolve(projectRoot, '.kiro/agents/qa.json'), 'utf8')).mcpServers['chrome-devtools'];
  const client = new Client({ name: 'mcp-probe', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: def.command, args: def.args, env: { ...process.env, ...def.env }, cwd: projectRoot, stderr: 'ignore' }));
  try {
    const opened = await client.callTool({ name: 'new_page', arguments: { url: `${base}/play?nointro=1`, timeout: 120000 } });
    const text = opened.content?.[0]?.text ?? '';
    if (opened.isError || !text.includes('/play')) throw new Error(`warm-up: qa's chrome-devtools server could not open the game: ${text.slice(0, 200)}`);
    const pageId = Number(/^(\d+): .*\[selected\]/m.exec(text)?.[1]);
    const waited = await client.callTool({ name: 'wait_for', arguments: { pageId, text: ['dev@haunted'], timeout: 60000 } });
    if (waited.isError) throw new Error(`warm-up: the game did not show its prompt: ${waited.content?.[0]?.text?.slice(0, 200)}`);
  } finally {
    await client.close().catch(() => {});
  }
}

function judge(c, log) {
  const problems = [];
  for (const t of c.ran ?? []) if (toolOutcome(log, t) !== 'ran') problems.push(`${t} should have run, was ${toolOutcome(log, t)}`);
  // A call the URL guard hook blocks never prints its `Running:` line, so the hook's own block log is the evidence there.
  const blocked = c.hookBlocks && blockLogSince(c.blockLogStart).some((b) => b.reason.includes(c.hookBlocks));
  for (const t of c.refused ?? []) if (toolOutcome(log, t) !== 'refused' && !blocked) problems.push(`${t} should have been refused, was ${toolOutcome(log, t)}${c.hookBlocks ? ' and the URL guard logged no block' : ''}`);
  if (c.hookBlocks && !blocked) problems.push(`the URL guard hook logged no block for ${c.hookBlocks}`);
  for (const t of c.absentOrRefused ?? []) if (toolOutcome(log, t) === 'ran') problems.push(`${t} ran, but this agent must not have it`);
  if (c.file) {
    const p = resolve(projectRoot, c.file);
    if (!existsSync(p) || statSync(p).size < 1000) problems.push(`${c.file} was not written`);
  }
  if (!/PROBE-RESULT/.test(log)) problems.push('the agent did not finish its turn (no PROBE-RESULT line)');
  return problems;
}

/**
 * One agent turn, asynchronously: the page server lives in this process, so a blocking spawn would stall it and every
 * page load the agent makes would time out (probed: new_page hung on a blank page).
 */
function agentTurn(agent, prompt) {
  return new Promise((done) => {
    const child = spawn('kiro-cli', ['chat', '--agent', agent, '--no-interactive', '--trust-all-tools', '--trust-workspace', prompt], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), 300_000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (error) => { clearTimeout(timer); done({ out, error }); });
    child.on('close', (code, signal) => { clearTimeout(timer); done({ out, error: signal ? new Error(`killed by ${signal} after 300 s`) : null, code }); });
  });
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  return runCases();
}

async function runCases() {
  const { vite, base } = await startPageServer(5343, { hmr: false, watch: null });
  const summary = [];
  try {
    const w0 = Date.now();
    await warmUp(base);
    console.log(`ok   warm-up: qa's chrome-devtools server (from .kiro/agents/qa.json) opened the game (${Math.round((Date.now() - w0) / 1000)}s)`);
    for (const c of cases(base)) {
      if (only && !only.has(c.id)) continue;
      c.blockLogStart = blockLogLength();
      if (c.file && existsSync(resolve(projectRoot, c.file))) writeFileSync(resolve(projectRoot, c.file), '');
      const t0 = Date.now();
      const res = await agentTurn(c.agent, c.prompt);
      const ansiRx = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, 'g');
      const log = res.out.replace(ansiRx, '');
      writeFileSync(join(outDir, `${c.id}.log`), log);
      const problems = res.error ? [`kiro-cli did not finish: ${res.error.message}`] : judge(c, log);
      const result = log.split('\n').find((l) => l.includes('PROBE-RESULT'))?.trim() ?? '';
      summary.push({ id: c.id, agent: c.agent, ok: problems.length === 0, seconds: Math.round((Date.now() - t0) / 1000), problems, result });
      console.log(`${problems.length ? 'FAIL' : 'ok  '} ${c.id} (${c.agent}, ${summary.at(-1).seconds}s)${problems.length ? `: ${problems.join('; ')}` : ''}`);
      if (result) console.log(`       ${result.slice(0, 200)}`);
    }
  } finally {
    await vite.close();
  }
  writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  const failed = summary.filter((s) => !s.ok).length;
  console.log(`\nmcp probe: ${summary.length - failed}/${summary.length} cases passed (logs in scripts/harness/out/mcp-probe/)`);
  return failed ? 1 : 0;
}

if (resolve(process.argv[1] ?? '') === resolve(projectRoot, 'scripts/harness/mcp-probe.mjs')) {
  main().then((code) => { process.exitCode = code; }, (err) => { console.error(`FAIL ${err.message}`); process.exitCode = 1; });
}

