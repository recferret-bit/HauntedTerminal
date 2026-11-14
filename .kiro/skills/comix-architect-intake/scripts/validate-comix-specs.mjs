#!/usr/bin/env node
// Validates connected comix/<slug>/ packages (folder layout, manifest <-> page links, schema, assets, and 60fps simulation).
// Delegates to scripts/harness/validate-comix.mjs so CLI, hooks, skills, and /comix-editor share a single source of truth.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { projectRoot } from '../../../../scripts/harness/lib/load.mjs';

const target = resolve(projectRoot, 'scripts/harness/validate-comix.mjs');
try {
  const out = execFileSync(process.execPath, [target, ...process.argv.slice(2)], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  process.stdout.write(out);
} catch (err) {
  if (err.stdout) process.stdout.write(String(err.stdout));
  if (err.stderr) process.stderr.write(String(err.stderr));
  process.exit(err.status || 1);
}
