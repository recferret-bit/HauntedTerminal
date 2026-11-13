#!/usr/bin/env node
// Root gate: only the entries below may sit in the repository root. Everything else has a home folder
// (pages/ for HTML, docs/ for long-form docs, src/, scripts/, public/...). Rules: .kiro/steering/structure.md
//   node scripts/quality/check-root.mjs
// Checks tracked and untracked-but-not-ignored files (ignored output like dist/ and node_modules/ is skipped).
import { execFileSync } from 'node:child_process';

/** Folders allowed at the root, with what belongs in them. */
const DIRS = {
  '.kiro': 'Kiro steering, skills, specs, hooks, settings',
  chapters: 'LEVEL GEN data: one folder per chapter',
  comix: 'declarative intro and outro specs',
  docs: 'long-form docs and notes (markdown)',
  pages: 'HTML entry pages (the Vite root)',
  public: 'static assets served as-is',
  scripts: 'Node tooling: harness, hooks, quality gates',
  src: 'TypeScript source',
};
/** Files allowed at the root: tool configs that must live there, the agent entry doc, the readme and the licence. */
const FILES = new Set(['.gitignore', 'AGENTS.md', 'LICENSE', 'README.md', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']);

const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--deduplicate'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
const bad = new Set();
for (const path of listed) {
  const [top, ...rest] = path.split('/');
  const isDir = rest.length > 0;
  if (isDir ? !(top in DIRS) : !FILES.has(top)) bad.add(isDir ? `${top}/` : top);
}
for (const entry of [...bad].sort()) {
  const hint = entry.endsWith('.html') ? 'move it to pages/' : entry.endsWith('.md') ? 'move it to docs/' : `put it in one of: ${Object.keys(DIRS).join(', ')}`;
  console.log(`ROOT  ${entry}  is not allowed at the repository root: ${hint}`);
}
console.log(bad.size ? `${bad.size} root violation(s)` : 'root gate OK');
process.exit(bad.size ? 1 : 0);
