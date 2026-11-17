# AGENTS.md

Haunted Terminal: a web game (Vite, TypeScript, Three.js, xterm.js) with Comix Zone visuals, played by typing unix commands and code into a terminal.

## Read first

- `.kiro/steering/product.md`, `tech.md`, `structure.md`, `architecture.md`, `skills-map.md` (always loaded in Kiro).

## New features and big refactors: spec first

Any new feature or big refactor (a new command, mechanic, item, page, lab, layer, model category, contract or save-data change; any rework, redesign or migration) starts as a Kiro spec in `.kiro/specs/<name>/`, not as code. Use the `feature-spec-grill` skill. Grill the user until every open question is answered and recorded under `## Decisions`. Get requirements, design and tasks approved one at a time, and only then write code. Rule and size test: `.kiro/steering/spec-first.md`. The `guard-spec-first` hook blocks new `src/<area>/` and `pages/*.html` without an approved spec, and `npm run quality:specs` fails on them.

## Two categories of work

1. **ASSET PCG**: procedural content generation of game assets. Start with the `haunted-art-direction` skill.
2. **LEVEL GEN**: levels and the chapter they form. Start with `chapter-architect-intake`.

Skill descriptions carry a `[ASSET PCG]` or `[LEVEL GEN]` tag. Full mapping and order: `.kiro/steering/skills-map.md`. Level generation uses assets but never creates them.

## Chapters and Comixes are data

The engine names no chapter, no level, and no comix scene. Chapter behaviour lives in `chapters/<slug>/` (`level.spec.json -> script`, manifest, dialogs, comic) and is played by `src/chapters/script.ts` (`.kiro/steering/declarative-chapters.md`, tuned in `/editor`, skill `chapter-editor`). Animated 3D comix sequences live in `comix/<slug>/` (`comix.manifest.json` + connected `pages/page-XX-<slug>/page.spec.json`) and are played by `src/cinematic/` (`.kiro/steering/declarative-comix.md`, tuned in `/comix-editor`, skills `comix-architect-intake`, `comix-sequence-generator`, `comix-implementer`, `comix-editor`).

## Scope

Kiroween ships **one chapter of about 11 levels**. Do not start more chapters.

## Repository layout

Keep the root clean: HTML pages go in `pages/` (the Vite root; `pages/storybook.html` is served at `/storybook.html`), docs in `docs/`, tooling in `scripts/`, source in `src/`. Only tool configs, `AGENTS.md`, `README.md` and `LICENSE` sit at the root. `npm run quality:root` enforces it. Full table: `.kiro/steering/structure.md`.

## Commands

- Run the stack: `npm start` (dev server in the background on http://localhost:5173, returns once it answers; storybook at `/storybook.html`), `npm stop`, `npm restart`, `npm run status`. Agents use these instead of `npm run dev`, which blocks the shell. Log: `scripts/harness/out/stack/stack.log`.
- Chapter editor: http://localhost:5173/editor (needs `npm start`). `node scripts/harness/generate-chapter.mjs` compiles; `--validate` is the fast read-only spec check; `--verify` adds the 0-death headless playthrough; `node scripts/harness/editor-smoke.mjs` drives the editor in headless Chrome.
- Comix editor: http://localhost:5173/comix-editor (needs `npm start`). `node scripts/harness/generate-comix.mjs` compiles `comix/*` into `src/cinematic/generated/catalog-data.ts`; `--validate` runs static checks; `--verify` adds 60fps headless timeline simulation; `node scripts/harness/validate-comix.mjs` checks connected folder layout + specs; `node scripts/harness/comix-editor-smoke.mjs` drives `/comix-editor` in headless Chrome.
- Terminal Lab: http://localhost:5173/terminal-lab (needs `npm start`). Test bench for the terminal: place enemies, pickups, files, riddles, tasks and NPCs, script them, and see the real shell and stage react. Nobody takes damage. Labs are `scripts/harness/terminal-lab/*.lab.json`. `node scripts/harness/terminal-lab.mjs --all` runs every lab headlessly (`--run <file>`, `--transcript`); `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/terminal-lab-api-test.mjs` and `node scripts/harness/terminal-lab-smoke.mjs` test it. Spec: `.kiro/specs/terminal-lab/`.
- Laptop Lab: http://localhost:5173/laptop-lab (needs `npm start`). The developer's inventory laptop: open it, dive in, boot, use the desktop apps to write and run JS and HTML/CSS pages, and solve the coding tasks. Real keys and the real mouse drive its keys and trackpad. `node scripts/harness/laptop-unit.mjs` and `node scripts/harness/laptop-lab-smoke.mjs` test it. Spec: `.kiro/specs/laptop-inventory/`.
- Build and check: `npm run build`, `npm run preview`, `npm run quality` (typecheck, root layout, size <= 600 lines/file and 130 lines/function, layer rules, declarative gate, spec gate, no duplicates).

Skill scripts live in `.kiro/skills/*/scripts/` and `scripts/harness/`; both categories run. `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs` and `node .kiro/skills/comix-implementer/scripts/verify-comix.mjs` are the LEVEL GEN gates.

## Working rules

- Use the matching skill before improvising rules it already defines.
- New feature or big refactor: spec first (`spec-first.md`, skill `feature-spec-grill`). No code until the spec says `Status: approved`. If code was written before its spec, write the spec from it and grill the user; do not keep extending the code.
- Hooks in `.kiro/hooks/` are report-only (type-check and spec validation on save, gates and a spec status report on stop, a spec-first reminder on feature-like prompts), except two guards. `guard-chapter-files` blocks edits to `src/chapters/generated/` and `src/cinematic/generated/` and asks before changes to the chapter, comix or Terminal Lab vocabulary. `guard-spec-first` blocks new `src/<area>/` and `pages/*.html` without an approved spec and asks before edits to `check-layers.mjs` and `vite.config.ts`. Specs live in `.kiro/specs/`, each with a `Status:` line.
- Run validators for what you change and report only what you actually ran.
- Pin dependency versions. Do not hand-edit generated files.
- Commit only when asked.
