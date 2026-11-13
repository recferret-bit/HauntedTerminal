# AGENTS.md

Haunted Terminal: a web game (Vite, TypeScript, Three.js, xterm.js) with Comix Zone visuals, played by typing unix commands and code into a terminal.

## Read first

- `.kiro/steering/product.md`, `tech.md`, `structure.md`, `architecture.md`, `skills-map.md` (always loaded in Kiro).

## Two categories of work

1. **ASSET PCG**: procedural content generation of game assets. Start with the `haunted-art-direction` skill.
2. **LEVEL GEN**: levels and the chapter they form. Start with `chapter-architect-intake`.

Skill descriptions carry a `[ASSET PCG]` or `[LEVEL GEN]` tag. Full mapping and order: `.kiro/steering/skills-map.md`. Level generation uses assets but never creates them.

## Chapters are data

The engine names no chapter and no level. Behaviour lives in `chapters/<slug>/` (`level.spec.json -> script`, manifest, dialogs, comic) and is played by `src/chapters/script.ts`. Read `.kiro/steering/declarative-chapters.md`. A human reviews and tunes chapters in the **Chapter Editor** at `/editor` (skill `chapter-editor`); a new spec capability means typing it, interpreting it once, and adding it to `src/chapter-editor/schema.ts`.

## Scope

Kiroween ships **one chapter of about 11 levels**. Do not start more chapters.

## Repository layout

Keep the root clean: HTML pages go in `pages/` (the Vite root; `pages/storybook.html` is served at `/storybook.html`), docs in `docs/`, tooling in `scripts/`, source in `src/`. Only tool configs, `AGENTS.md`, `README.md` and `LICENSE` sit at the root. `npm run quality:root` enforces it. Full table: `.kiro/steering/structure.md`.

## Commands

- Run the stack: `npm start` (dev server in the background on http://localhost:5173, returns once it answers; storybook at `/storybook.html`), `npm stop`, `npm restart`, `npm run status`. Agents use these instead of `npm run dev`, which blocks the shell. Log: `scripts/harness/out/stack/stack.log`.
- Chapter editor: http://localhost:5173/editor (needs `npm start`). `node scripts/harness/generate-chapter.mjs` compiles; `--validate` is the fast read-only spec check; `--verify` adds the 0-death headless playthrough; `node scripts/harness/editor-smoke.mjs` drives the editor in headless Chrome.
- Comix editor: http://localhost:5173/comix-editor (needs `npm start`). `node scripts/harness/validate-comix.mjs` checks intro and outro specs.
- Build and check: `npm run build`, `npm run preview`, `npm run quality` (typecheck, root layout, size <= 600 lines/file and 130 lines/function, layer rules, declarative gate, no duplicates).

Skill scripts live in `.kiro/skills/*/scripts/` and `scripts/harness/`; both categories run. `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs` is the LEVEL GEN gate (specs, static checks, 0-death playthrough, comic artifacts, skill self-tests).

## Working rules

- Use the matching skill before improvising rules it already defines.
- Hooks in `.kiro/hooks/` are report-only (type-check and spec validation on save, a gate on stop) except one guard: it blocks edits to `src/chapters/generated/` and asks before changes to the chapter vocabulary. Specs for the big systems are in `.kiro/specs/`.
- Run validators for what you change and report only what you actually ran.
- Pin dependency versions. Do not hand-edit generated files.
- Commit only when asked.
