#!/usr/bin/env node
// Convenience shim matching TerraAgent's `node social/media/capture-screenshots.mjs [filter]` entrypoint.
import { main } from '../../scripts/harness/social-media.mjs';

main(['screenshots', ...process.argv.slice(2)]).then(
  (code) => { process.exitCode = code; },
  (err) => { console.error(`social/media/capture-screenshots: ${err.message}`); process.exitCode = 1; },
);
