import { fileURLToPath } from 'node:url';
import type { Connect } from 'vite';
import { defineConfig } from 'vite';
// @ts-expect-error plain Node module without types; it is dev-server tooling, not app code.
import { chapterApi } from './scripts/harness/lib/chapter-api.mjs';
// @ts-expect-error plain Node module without types; it is dev-server tooling, not app code.
import { comixApi } from './scripts/harness/lib/comix-api.mjs';
// @ts-expect-error plain Node module without types; it is dev-server tooling, not app code.
import { terminalLabApi } from './scripts/harness/lib/terminal-lab-api.mjs';

/** HTML entry pages live in pages/ (see .kiro/steering/structure.md); it is the Vite root, so URLs stay `/` and `/storybook.html`. */
const pages = (file = ''): string => fileURLToPath(new URL(`./pages/${file}`, import.meta.url));
const project = (dir: string): string => fileURLToPath(new URL(`./${dir}`, import.meta.url));

/** `/play/<chapter>/<level>` is the game, `/editor/...` the chapter editor, `/comix-editor/...` the comix editor, `/terminal-lab/...` the terminal lab, `/laptop-lab` the laptop lab, `/audio-lab` the audio lab; the browser keeps the path. */
const playPaths = (): Connect.NextHandleFunction => (req, _res, next) => {
  const url = req.url ?? '';
  const q = url.indexOf('?');
  const path = q === -1 ? url : url.slice(0, q);
  const search = q === -1 ? '' : url.slice(q);
  if (path === '/play' || path.startsWith('/play/')) req.url = `/play.html${search}`;
  if (path === '/editor' || path.startsWith('/editor/')) req.url = `/chapter-editor.html${search}`;
  if (path === '/comix-editor' || path.startsWith('/comix-editor/')) req.url = `/comix-editor.html${search}`;
  if (path === '/terminal-lab' || path.startsWith('/terminal-lab/')) req.url = `/terminal-lab.html${search}`;
  if (path === '/laptop-lab') req.url = `/laptop-lab.html${search}`;
  if (path === '/audio-lab' || path === '/audio-lab/') req.url = `/audio-lab.html${search}`;
  if (path === '/manual' || path === '/manual/') req.url = `/manual.html${search}`;
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
    {
      // The landing pages draw their header and tiles from a module script. Block the first paint on it (and on the
      // CSS it pulls in), so a tab switch shows the finished page, never an empty header or unstyled content.
      name: 'hub-render-blocking',
      transformIndexHtml: {
        order: 'post',
        handler: (html, ctx) =>
          /^\/(index|desktop|achievements|comix)\.html$/.test(ctx.path)
            ? html.replace(/<script type="module"/g, '<script type="module" blocking="render"')
            : html,
      },
    },
    // Dev server only: the chapter editor reads and writes chapters/ through /api/chapters, the terminal lab its labs through /api/terminal-lab.
    chapterApi(),
    comixApi(),
    terminalLabApi(),
  ],
  // Always 5400: a busy port is an error, never a silent move to the next one (the harness and the docs name this port).
  server: { port: 5400, strictPort: true },
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
        comix: pages('comix.html'),
        achievements: pages('achievements.html'),
        desktop: pages('desktop.html'),
        cinematic: pages('cinematic.html'),
        storybook: pages('storybook.html'),
        dev: pages('dev.html'),
        editor: pages('chapter-editor.html'),
        comixEditor: pages('comix-editor.html'),
        terminalLab: pages('terminal-lab.html'),
        laptopLab: pages('laptop-lab.html'),
        audioLab: pages('audio-lab.html'),
        manual: pages('manual.html'),
      },
    },
  },
});
