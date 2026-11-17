#!/usr/bin/env node
// Parody brand guard (npm run quality:brands).
// Verifies that tracked/untracked workspace files contain zero forbidden Big Four AI agent brand tokens
// (while allowing documented non-character references such as `CLAUDE.md`, `Claude Code`, and `codex card(s)`).
// Spec: .kiro/specs/parody-brand-guard/.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BINARY_EXT = /\.(png|jpe?g|webp|gif|ico|glb|gltf|woff2?|ttf|otf|bin|mp3|wav|ogg)$/i;
const SKIP_PREFIXES = ['scripts/quality/check-brands.mjs', '.kiro/specs/parody-brand-guard/'];
const CLAUDE_CODE_DOCS = new Set(['AGENTS.md', 'CLAUDE.md', '.kiro/steering/team.md']);

const WORD_BRAND_RX =
  /\b(?:agy|agy-9|antigravity|codex|c0d3x|code-x|grok|gr0nk|g0rk|claude|clawd|cl0d|openai|anthropic|xai|chatgpt|gemini)\b/i;
const IDENT_BRAND_RX = /(?:claude_|_claude|boss-claude|claude-kernel|agy_|_agy)/i;

function scrubAllowed(line, relPath) {
  let clean = line
    .replace(/CLAUDE\.md/g, '')
    .replace(/\(AGENTS\|CLAUDE\|README\)\\\.md/g, '')
    .replace(/\bcodex cards?\b/gi, '')
    .replace(/\bread the codex from\b/gi, '');
  if (CLAUDE_CODE_DOCS.has(relPath)) {
    clean = clean.replace(/\bClaude Code(?:'s)?\b/g, '').replace(/\.claude\/settings\.json/g, '');
  }
  return clean;
}

export function findBrandMatch(line, relPath) {
  const clean = scrubAllowed(line, relPath);
  const m1 = WORD_BRAND_RX.exec(clean);
  if (m1) return m1[0];
  const m2 = IDENT_BRAND_RX.exec(clean);
  return m2 ? m2[0] : null;
}

function runSelfTest() {
  assert.ok(findBrandMatch('CLAUDE: "hello"', 'chapters/x.json'));
  assert.ok(findBrandMatch('AGY-9 disabled', 'src/game/kiro.ts'));
  assert.ok(findBrandMatch('C0D3X cluster', 'chapters/x.json'));
  assert.ok(findBrandMatch('GR0NK daemon', 'chapters/x.json'));
  assert.ok(findBrandMatch('Powered by OpenAI', 'docs/x.md'));
  assert.ok(findBrandMatch('.agy_spycam', 'src/game/view-layouts.ts'));
  assert.ok(findBrandMatch('claude_overlord.ko', 'chapters/x.json'));
  assert.equal(findBrandMatch('Edit CLAUDE.md and AGENTS.md', 'docs/x.md'), null);
  assert.equal(findBrandMatch('Instructions for Claude Code working here', 'CLAUDE.md'), null);
  assert.equal(findBrandMatch('Chapter-declared codex cards come from manifest', 'src/chapters/types.ts'), null);
  assert.ok(findBrandMatch('Claude Code should not appear in story', 'chapters/x.json'));
}

runSelfTest();

const root = process.cwd();
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);

const violations = [];
let checked = 0;

for (const rel of files) {
  if (BINARY_EXT.test(rel)) continue;
  if (SKIP_PREFIXES.some((prefix) => rel === prefix || rel.startsWith(prefix))) continue;
  const full = join(root, rel);
  if (!existsSync(full) || !statSync(full).isFile()) continue;
  checked += 1;
  const lines = readFileSync(full, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    const hit = findBrandMatch(line, rel);
    if (hit) {
      violations.push(`BRAND-VIOLATION  ${rel}:${idx + 1} (${hit}): ${line.trim().slice(0, 100)}`);
    }
  });
}

if (violations.length > 0) {
  for (const v of violations) console.error(v);
  console.error(`brand gate FAILED (${violations.length} violation(s) across ${checked} file(s))`);
  process.exit(1);
}

console.log(`brand gate OK (${checked} tracked files checked, 0 real AI brand mentions)`);
