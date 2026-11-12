# Tech

- Web app: Vite 6, TypeScript 5 (strict), Three.js 0.180, xterm.js 5 with the fit addon.
- Entry: `pages/index.html` is the issue hub (the Vite root is `pages/`). The game is `pages/play.html`, served at `/play`, `/play/<chapter>`, and `/play/<chapter>/<level>` (a `floor/<n>` segment jumps a classic floor). `/hub.html` redirects to `/`.
- Commands: `npm start` / `npm stop` / `npm restart` / `npm run status` (the dev server as a background process, see below), `npm run build` (typecheck + bundle), `npm run preview`, `npm run quality` (see `architecture.md`). `npm run dev` is the same server in the foreground.
- Running the stack: `npm start` launches Vite on port 5173 in the background, waits until it answers, prints the URLs and returns; it is a no-op when already running. `npm stop` stops it and only ever touches processes started from this project (other Vite servers on the machine are left alone). Log: `scripts/harness/out/stack/stack.log`. Other port: `npm start -- --port 5174` (or `STACK_PORT=5174 npm start`; agents use the env form, since some agent shells refuse commands containing `--port`). Agents must use these, never `npm run dev`, which blocks the shell.
- Chapter editor: `pages/chapter-editor.html`, served at `/editor`, `/editor/<chapter>` and `/editor/<chapter>/<level>` (`?tab=` picks the tab). It edits `chapters/` through the dev-only API `/api/chapters` (`scripts/harness/lib/chapter-api.mjs`) and previews the game with `/play/...?draft=1`. Smoke test: `node scripts/harness/editor-smoke.mjs`.
- Storybook: `pages/storybook.html`, served at `http://localhost:5173/storybook.html` (models, textures, FX under the real renderer). URL options: `src/storybook/domain/options.ts`.
- Content tooling is plain Node `.mjs` scripts: `scripts/harness/` (comic drawing, chapter compiler, screenshots, playthrough) and `.kiro/skills/*/scripts/` (validators and self-tests).

## Current state

Ported and refactored to the architecture rules: `src/procgen`, `src/shaders`, `src/storybook`, `src/contracts`, and the playable shell (`src/game`, `src/renderer`, `src/ui`, `src/cinematic`, `src/chapters`, `src/sandbox`). Chapter packs live in `chapters/` and compile to `src/chapters/generated/` (`node scripts/harness/generate-chapter.mjs`). Do not claim a skill command passed unless you ran it.

## Rules

- Prefer deterministic, zero-LLM validators for anything that decides pass/fail.
- Pin dependency versions when adding packages.
- Chapters are declarative (`declarative-chapters.md`): `npm run quality:declarative` rejects chapter ids, level ids and `spec.index === N` in `src/`.
- Keep generated files (`src/chapters/generated/`, rendered PNGs) reproducible from the specs; regenerate, do not hand-edit.
