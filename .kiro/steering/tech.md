# Tech

- Web app: Vite 6, TypeScript 5 (strict), Three.js 0.180, xterm.js 5 with the fit addon.
- Entry: `pages/index.html` is the issue hub (the Vite root is `pages/`). The game is `pages/play.html`, served at `/play`, `/play/<chapter>`, and `/play/<chapter>/<level>` (a `floor/<n>` segment jumps a classic floor). `/hub.html` redirects to `/`.
- Commands: `npm start` / `npm stop` / `npm restart` / `npm run status` (the dev server as a background process, see below), `npm run build` (typecheck + bundle), `npm run preview`, `npm run quality` (see `architecture.md`). `npm run dev` is the same server in the foreground.
- Running the stack: `npm start` launches Vite on port 5173 in the background, waits until it answers, prints the URLs and returns; it is a no-op when already running. `npm stop` stops it and only ever touches processes started from this project (other Vite servers on the machine are left alone). Log: `scripts/harness/out/stack/stack.log`. Other port: `npm start -- --port 5174` (or `STACK_PORT=5174 npm start`; agents use the env form, since some agent shells refuse commands containing `--port`). Agents must use these, never `npm run dev`, which blocks the shell.
- Chapter editor: `pages/chapter-editor.html`, served at `/editor`, `/editor/<chapter>` and `/editor/<chapter>/<level>` (`?tab=` picks the tab). Built on shared `src/editor-core/`, it edits `chapters/` through the dev-only API `/api/chapters` (`scripts/harness/lib/chapter-api.mjs` + `editor-api-common.mjs`) and previews the game with `/play/...?draft=1`. Smoke test: `node scripts/harness/editor-smoke.mjs`.
- Comix editor: `pages/comix-editor.html`, served at `/comix-editor`, `/comix-editor/<slug>` and `/comix-editor/<slug>/<target>` (`?tab=` picks the tab). Built on `src/editor-core/`, it edits connected `comix/<slug>/` sequences through `/api/comix` (`scripts/harness/lib/comix-api.mjs` + `editor-api-common.mjs`), supports bidirectional 2D/3D viewport <-> Inspector selection, and previews `/cinematic.html?draft=1&editor=1`. Tests: `node scripts/harness/editor-unit-test.mjs` and `node scripts/harness/comix-editor-smoke.mjs`.
- Storybook: `pages/storybook.html`, served at `http://localhost:5173/storybook.html` (models, textures, FX under the real renderer). URL options: `src/storybook/domain/options.ts`.
- Content tooling is plain Node `.mjs` scripts: `scripts/harness/` (comic drawing, chapter & comix compilers, editor unit/smoke suites, screenshots, playthrough) and `.kiro/skills/*/scripts/` (validators and self-tests).

## Current state

Ported and refactored to the architecture rules: `src/procgen`, `src/shaders`, `src/storybook`, `src/contracts`, the playable shell (`src/game`, `src/renderer`, `src/ui`, `src/cinematic`, `src/chapters`, `src/sandbox`), and the shared workstation editors (`src/editor-core`, `src/chapter-editor`, `src/comix-editor`). Chapter packs live in `chapters/` and compile to `src/chapters/generated/` (`node scripts/harness/generate-chapter.mjs`); animated 3D comix packs live in `comix/` and compile to `src/cinematic/generated/` (`node scripts/harness/generate-comix.mjs`). Do not claim a skill command passed unless you ran it.

## Rules

- Prefer deterministic, zero-LLM validators for anything that decides pass/fail.
- Pin dependency versions when adding packages.
- Chapters and Comixes are declarative (`declarative-chapters.md`, `declarative-comix.md`): `npm run quality:declarative` rejects chapter ids, level ids, comix sequence/page ids, and `spec.index === N` in `src/`.
- Keep generated files (`src/chapters/generated/`, `src/cinematic/generated/`, rendered PNGs) reproducible from the specs; regenerate, do not hand-edit.
