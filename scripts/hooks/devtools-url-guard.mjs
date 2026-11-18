#!/usr/bin/env node
// PreToolUse hook (matcher `@chrome-devtools`) of the agent that holds Chrome DevTools MCP (qa). The server already makes
// Chrome refuse every site but the local dev servers and Netlify (--allowedUrlPattern); this hook is the second fence, and
// it stops the call before the server sees it, with a reason the agent can read. It blocks (exit 2):
//   - a `url` (or `urls`) that is not http(s)://localhost, http(s)://127.0.0.1, https://<name>.netlify.app, or about:blank;
//   - a URL with credentials in it (`http://localhost@evil.test`), whatever its host looks like;
//   - a `file:`, `javascript:`, `data:`, `view-source:`, `chrome:` or `devtools:` value in any field;
//   - an `emulate` call that sets anything but `cpuThrottlingRate` (user agent, headers, geolocation, network... are not
//     qa's; spec .kiro/specs/qa-visual-audit/, Q5).
//   node scripts/hooks/devtools-url-guard.mjs <agent-name>        (event JSON on stdin)
// Each block is also appended to scripts/harness/out/devtools-url-guard.log (git-ignored), so the MCP probe can check that
// a refusal came from the fence and not from what the agent says.
// Spec: .kiro/specs/mcp-devtools-and-forge/. Exit 0 when the call is fine, 2 with a reason on stderr when it is not.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BLOCK_LOG = resolve(dirname(fileURLToPath(import.meta.url)), '../harness/out/devtools-url-guard.log');

const URL_KEYS = new Set(['url', 'urls']);
const DANGEROUS = /^\s*(file|javascript|data|view-source|chrome|devtools|ftp|blob):/i;

/** Why `value` may not be opened, or '' when it may. Pure. */
export function urlProblem(value) {
  if (value.trim() === 'about:blank') return '';
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return `"${clip(value)}" is not an absolute URL`;
  }
  if (url.username || url.password) return `"${clip(value)}" carries credentials`;
  const host = url.hostname.toLowerCase();
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    if (host === 'localhost' || host === '127.0.0.1') return '';
    if (url.protocol === 'https:' && /^([a-z0-9-]+\.)+netlify\.app$/.test(host)) return '';
  }
  return `"${clip(value)}" is outside the allowed sites (localhost, 127.0.0.1, https://*.netlify.app)`;
}

const clip = (text) => (text.length > 80 ? `${text.slice(0, 77)}...` : text);

/** The first problem in a tool input (any depth), or '' when the call is fine. Pure. */
export function violation(input, key = '') {
  if (typeof input === 'string') {
    if (DANGEROUS.test(input)) return `"${clip(input)}" uses a scheme that is not allowed`;
    return URL_KEYS.has(key) ? urlProblem(input) : '';
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const reason = violation(item, key);
      if (reason) return reason;
    }
    return '';
  }
  if (input && typeof input === 'object') {
    for (const [k, v] of Object.entries(input)) {
      const reason = violation(v, k);
      if (reason) return reason;
    }
  }
  return '';
}

/** `emulate` may only throttle the CPU. Returns the problem, or '' for any other tool or a CPU-only call. Pure. */
export function emulateProblem(toolName, input) {
  if (!/(^|[/_@])emulate$/.test(String(toolName ?? ''))) return '';
  const extra = Object.keys(input ?? {}).filter((k) => k !== 'cpuThrottlingRate');
  return extra.length ? `emulate may only set cpuThrottlingRate (not ${extra.join(', ')})` : '';
}

function main() {
  const name = process.argv[2] ?? 'agent';
  let event;
  try {
    event = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }
  const reason = violation(event?.tool_input ?? {}) || emulateProblem(event?.tool_name, event?.tool_input);
  if (!reason) process.exit(0);
  try {
    mkdirSync(dirname(BLOCK_LOG), { recursive: true });
    appendFileSync(BLOCK_LOG, `${JSON.stringify({ at: new Date().toISOString(), agent: name, tool: event?.tool_name ?? '', reason })}\n`);
  } catch {
    /* the block stands even if the log cannot be written */
  }
  console.error(`devtools-url-guard: blocked for ${name}: ${reason}. Chrome DevTools MCP may open only the local dev servers and the project's Netlify site.`);
  process.exit(2);
}

if (import.meta.url === `file://${resolve(process.argv[1] ?? '')}`) main();
