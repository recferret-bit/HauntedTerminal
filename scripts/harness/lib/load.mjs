// Loads the project's TypeScript procgen module in node through Vite SSR (no build step, no WebGL).
//   import { withProcgen } from '../../../../scripts/harness/lib/load.mjs';
//   await withProcgen(async (procgen) => { procgen.ModelCatalog.list() ... });
import { createServer } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export async function withProcgen(fn, modulePath = '/src/procgen/index.ts') {
  const vite = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    return await fn(await vite.ssrLoadModule(modulePath), vite);
  } finally {
    await vite.close();
  }
}

/**
 * Start a Vite dev server for the HTML pages, with the project's vite.config.ts (its root is pages/).
 * Returns the server and its base URL; close it with `vite.close()`.
 */
export async function startPageServer(port, server = {}) {
  const vite = await createServer({
    configFile: resolve(projectRoot, 'vite.config.ts'),
    logLevel: 'error',
    server: { port, strictPort: false, host: '127.0.0.1', open: false, ...server },
  });
  await vite.listen();
  return { vite, base: `http://127.0.0.1:${vite.httpServer.address().port}` };
}

/** Minimal argv helpers shared by the harness scripts. */
export function parseArgs(argv = process.argv.slice(2), valueFlags = []) {
  const flags = new Set();
  const values = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (valueFlags.includes(a)) values[a] = argv[++i];
    else if (a.startsWith('--')) flags.add(a);
    else rest.push(a);
  }
  return { flag: (n) => flags.has(n), val: (n, d) => values[n] ?? d, rest };
}
