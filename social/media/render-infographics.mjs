#!/usr/bin/env node
// Convenience shim matching TerraAgent's `node social/media/render-infographics.mjs [filter]` entrypoint.
import { main } from '../../scripts/harness/social-media.mjs';

main(['infographics', ...process.argv.slice(2)]).then(
  (code) => { process.exitCode = code; },
  (err) => { console.error(`social/media/render-infographics: ${err.message}`); process.exitCode = 1; },
);
