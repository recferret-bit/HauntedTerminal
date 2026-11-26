#!/usr/bin/env node
// Convenience shim matching TerraAgent's `node social/media/make.mjs <spec.json> ...` entrypoint.
import { main } from '../../scripts/harness/social-media.mjs';

main(['video', ...process.argv.slice(2)]).then(
  (code) => { process.exitCode = code; },
  (err) => { console.error(`social/media/make: ${err.message}`); process.exitCode = 1; },
);
