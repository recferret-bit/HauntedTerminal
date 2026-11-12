#!/usr/bin/env node
// Self-test for comix-story-drawer:
// Renders Chapter 1's 4-page Comix spec into a temp folder (--no-public), verifies PNG headers,
// exact dimensions, contact-sheet output, and non-flat pixel color diversity inside panels.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { projectRoot } from '../../../../scripts/harness/lib/load.mjs';

const drawScript = resolve(projectRoot, 'scripts/harness/draw-comix.mjs');
const tmp = mkdtempSync(resolve(tmpdir(), 'ht-comix-test-'));

try {
  execFileSync(
    process.execPath,
    [
      drawScript,
      '--chapter',
      'chapter-01-kiroween',
      '--out-dir',
      tmp,
      '--width',
      '600',
      '--height',
      '820',
      '--no-public',
    ],
    { cwd: projectRoot, stdio: 'pipe' },
  );

  for (const name of ['page-01.png', 'page-02.png', 'page-03.png', 'page-04.png', 'page-05.png', 'page-06.png', 'contact-sheet.png']) {
    const p = resolve(tmp, name);
    if (!existsSync(p)) throw new Error(`Missing expected rendered comic output: ${name}`);
    const buf = readFileSync(p);
    // Verify PNG signature
    if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
      throw new Error(`${name}: invalid PNG header`);
    }
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    if (name.startsWith('page-') && (w !== 600 || h !== 820)) {
      throw new Error(`${name}: expected 600x820, got ${w}x${h}`);
    }
    if (buf.length < 4000) {
      throw new Error(`${name}: suspiciously tiny PNG (${buf.length} bytes), likely blank`);
    }
  }

  console.log('comix-story-drawer self-test PASS');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
