# Tech

- Web app: Vite 6, TypeScript 5 (strict), Three.js 0.180, xterm.js 5 with the fit addon.
- Entry: `pages/index.html` loads `src/main.ts` (all HTML pages live in `pages/`, the Vite root). A Three.js canvas (`#scene`) sits under a transparent xterm terminal (`#terminal`).
- Commands: `npm run dev`, `npm run build` (typecheck + bundle), `npm run preview`, `npm run quality` (see `architecture.md`).
- Storybook: `pages/storybook.html`, served at `http://localhost:5173/storybook.html` (models, textures, FX under the real renderer). URL options: `src/storybook/domain/options.ts`.
- Content tooling is plain Node `.mjs` scripts: `scripts/harness/` (comic drawing, chapter compiler, screenshots, playthrough) and `.kiro/skills/*/scripts/` (validators and self-tests).

## Current state

Ported and refactored to the architecture rules: `src/procgen`, `src/shaders`, `src/storybook`, `src/contracts`. The ASSET PCG skills run against them (validators, self-tests, storybook screenshots). Not ported yet: the game itself (`src/game`, `src/renderer` stage, `src/ui`) and the LEVEL GEN runtime (`src/chapters`, `npm run chapter:*`); those skill scripts will not run. Do not claim a skill command passed unless you ran it.

## Rules

- Prefer deterministic, zero-LLM validators for anything that decides pass/fail.
- Pin dependency versions when adding packages.
- Keep generated files (`src/chapters/generated/`, rendered PNGs) reproducible from the specs; regenerate, do not hand-edit.
