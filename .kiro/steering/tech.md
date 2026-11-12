# Tech

- Web app: Vite 6, TypeScript 5 (strict), Three.js 0.180, xterm.js 5 with the fit addon.
- Entry: `index.html` loads `src/main.ts`. A Three.js canvas (`#scene`) sits under a transparent xterm terminal (`#terminal`).
- Commands: `npm run dev`, `npm run build` (typecheck + bundle), `npm run preview`.
- Content tooling is plain Node `.mjs` scripts: `scripts/harness/` (comic drawing, chapter compiler, screenshots, playthrough) and `.kiro/skills/*/scripts/` (validators and self-tests).

## Current state

The project was just initialised. The skills and harness were ported from an earlier prototype and expect code that is not here yet: `src/procgen`, `src/shaders`, `src/renderer`, `src/game`, `src/chapters`, and `npm run procgen:*` / `chapter:*` scripts. Until that code is ported, those scripts will not run. Do not claim a skill command passed unless you ran it.

## Rules

- Prefer deterministic, zero-LLM validators for anything that decides pass/fail.
- Pin dependency versions when adding packages.
- Keep generated files (`src/chapters/generated/`, rendered PNGs) reproducible from the specs; regenerate, do not hand-edit.
