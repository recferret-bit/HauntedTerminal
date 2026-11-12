# AGENTS.md

Haunted Terminal: a web game (Vite, TypeScript, Three.js, xterm.js) with Comix Zone visuals, played by typing unix commands and code into a terminal.

## Read first

- `.kiro/steering/product.md`, `tech.md`, `structure.md`, `skills-map.md` (always loaded in Kiro).

## Two categories of work

1. **ASSET PCG**: procedural content generation of game assets. Start with the `haunted-art-direction` skill.
2. **LEVEL GEN**: levels and the chapter they form. Start with `chapter-architect-intake`.

Skill descriptions carry a `[ASSET PCG]` or `[LEVEL GEN]` tag. Full mapping and order: `.kiro/steering/skills-map.md`. Level generation uses assets but never creates them.

## Scope

Kiroween ships **one chapter of about 11 levels**. Do not start more chapters.

## Commands

`npm run dev`, `npm run build`, `npm run preview`. Skill scripts live in `.kiro/skills/*/scripts/` and `scripts/harness/`; many need code from the earlier prototype that is not ported yet (see `.kiro/steering/tech.md`).

## Working rules

- Use the matching skill before improvising rules it already defines.
- Run validators for what you change and report only what you actually ran.
- Pin dependency versions. Do not hand-edit generated files.
- Commit only when asked.
