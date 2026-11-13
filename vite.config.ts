import { fileURLToPath } from 'node:url';
import type { Connect } from 'vite';
import { defineConfig } from 'vite';
// @ts-expect-error plain Node module without types; it is dev-server tooling, not app code.
import { chapterApi } from './scripts/harness/lib/chapter-api.mjs';
// @ts-expect-error plain Node module without types; it is dev-server tooling, not app code.
import { comixApi } from './scripts/harness/lib/comix-api.mjs';

/** HTML entry pages live in pages/ (see .kiro/steering/structure.md); it is the Vite root, so URLs stay `/` and `/storybook.html`. */
const pages = (file = ''): string => fileURLToPath(new URL(`./pages/${file}`, import.meta.url));
const project = (dir: string): string => fileURLToPath(new URL(`./${dir}`, import.meta.url));

/** `/play/<chapter>/<level>` is the game, `/editor/...` the chapter editor, `/comix-editor/...` the comix editor; the browser keeps the path. */
const playPaths = (): Connect.NextHandleFunction => (req, _res, next) => {
  const url = req.url ?? '';
  const q = url.indexOf('?');
  const path = q === -1 ? url : url.slice(0, q);
  const search = q === -1 ? '' : url.slice(q);
  if (path === '/play' || path.startsWith('/play/')) req.url = `/play.html${search}`;
  if (path === '/editor' || path.startsWith('/editor/')) req.url = `/chapter-editor.html${search}`;
  if (path === '/comix-editor' || path.startsWith('/comix-editor/')) req.url = `/comix-editor.html${search}`;
  next();
};

export default defineConfig({
  root: pages(),
  publicDir: project('public'),
  // Pages load `/src/...`; the source tree sits next to pages/, not inside it.
  resolve: { alias: [{ find: /^\/src\//, replacement: `${project('src')}/` }] },
  plugins: [
    {
      name: 'play-paths',
      configureServer: (server) => { server.middlewares.use(playPaths()); },
      configurePreviewServer: (server) => { server.middlewares.use(playPaths()); },
    },
    // Dev server only: the chapter editor reads and writes chapters/ through /api/chapters.
    chapterApi(),
    comixApi(),
  ],
  server: { port: 5173 },
  build: {
    outDir: project('dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: pages('index.html'),
        hub: pages('hub.html'),
        play: pages('play.html'),
        chapters: pages('chapters.html'),
        comic: pages('comic.html'),
        cinematic: pages('cinematic.html'),
        storybook: pages('storybook.html'),
        dev: pages('dev.html'),
        editor: pages('chapter-editor.html'),
        comixEditor: pages('comix-editor.html'),
      },
    },
  },
});
