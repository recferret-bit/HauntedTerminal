import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/** HTML entry pages live in pages/ (see .kiro/steering/structure.md); it is the Vite root, so URLs stay `/` and `/storybook.html`. */
const pages = (file = ''): string => fileURLToPath(new URL(`./pages/${file}`, import.meta.url));
const project = (dir: string): string => fileURLToPath(new URL(`./${dir}`, import.meta.url));

export default defineConfig({
  root: pages(),
  publicDir: project('public'),
  // Pages load `/src/...`; the source tree sits next to pages/, not inside it.
  resolve: { alias: [{ find: /^\/src\//, replacement: `${project('src')}/` }] },
  server: { port: 5173 },
  build: {
    outDir: project('dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: pages('index.html'),
        storybook: pages('storybook.html'),
      },
    },
  },
});
