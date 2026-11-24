# Parody Brand Guard & Kiro Disclaimer: requirements

Status: done (requirements, design, tasks approved by the user 2026-11-17)

Capability: Clarify across the in-game Kiro Ghost companion (`kiro disclaimer` / `kiro legal` and `kiro status`), the Bestiary Dossier, and the `/` front door that Out Of Credits uses no real AI agent brands—all characters (`Clod`, `Gork`, `Codec`, `Anti-Gravy`) and organizations are original fictional parodies and technical terms are educational only—while enforcing brand-free specs and source files through a deterministic `.kiro/` quality gate (`scripts/quality/check-brands.mjs`) and save hook (`.kiro/hooks/check-brands-on-save.json`).

## Requirements

1. WHEN the player runs `kiro disclaimer` (or its alias `kiro legal` or `kiro brands`) in the terminal, THE SYSTEM SHALL print Kiro Ghost's parody and non-affiliation notice stating that the Big Four characters (`Anti-Gravy`, `Codec`, `Gork`, `Clod`) are original fictional parodies not affiliated with or endorsed by any AI company, and that open-weight model, hardware, and POSIX terms are used strictly for educational gameplay, returning exit code `0` and emitting a `KIRO_ACTION` / `AGENT_TAUNT` event from `kiro`.
2. WHEN the player runs `kiro`, `kiro status`, or `kiro cores`, THE SYSTEM SHALL include a concise parody/non-affiliation footer line and list `kiro disclaimer` in the available `kiro` commands line.
3. WHEN the player runs `man kiro` or views the Command Grimoire (`GRIMOIRE_ENTRIES`), THE SYSTEM SHALL document `kiro disclaimer` (`kiro legal`).
4. WHEN the player views the `/` front-door page (`pages/index.html`) or the Bestiary Dossier in `/chapters.html` (`src/pages/chapters-binder.ts` / `src/chapters/catalog.ts`), THE SYSTEM SHALL display a clear parody and non-affiliation notice clarifying that `Anti-Gravy`, `Codec`, `Gork`, and `Clod` are fictional parody characters and no real AI brands are used.
5. WHILE `kiro load <qwen|mistral|deepseek|llama>` is executed in any level or hub, THE SYSTEM SHALL keep the existing open-weight core IDs (`qwen`, `mistral`, `deepseek`, `llama`) and level `solutionCommands` unchanged.
6. WHEN `node scripts/quality/check-brands.mjs` (or `npm run quality:brands`, included in `npm run quality`) is executed, THE SYSTEM SHALL scan tracked source, chapter specs, comix specs, Terminal Lab scripts, HTML pages, skills, steering, and docs for forbidden Big Four AI agent brand tokens (`AGY`, `AGY-9`, `Antigravity`, `Codex`, `C0D3X`, `Code-X`, `Grok`, `GR0NK`, `Claude`, `CLAWD`, `OpenAI`, `Anthropic`, `xAI`, `ChatGPT`, `Gemini`) and exit `1` with file and line diagnostics if any unallowed match is found.
7. IF a matched token is a documented non-character reference (`CLAUDE.md` filename/references, `Claude Code` tool references in agent/workflow docs, or the common English noun `codex` in `codex cards`), THEN THE SYSTEM SHALL allow it in `scripts/quality/check-brands.mjs`.
8. WHEN a source, spec, page, or doc file is saved in Kiro, THE SYSTEM SHALL trigger `.kiro/hooks/check-brands-on-save.json` to run `node scripts/quality/check-brands.mjs`.

## Out of scope

- Renaming the four open-weight `kiro load` core IDs (`qwen`, `mistral`, `deepseek`, `llama`) or modifying level `solutionCommands`.
- Adding new 3D models, rooms, textures, shaders, or particle effects.

## Decisions

- **Q:** What kind of Kiro-based feature should clarify that no real brands are used?
  **A (user, 2026-11-17):** Both: in-game Kiro Ghost clarification command/banner AND a `.kiro/` brand-check gate + hook — covers both players/judges in-game and deterministic `.kiro/` enforcement.
- **Q:** Where should the in-game parody/non-affiliation clarification appear?
  **A (user, 2026-11-17):** In `kiro` status output, a `kiro disclaimer` (or `kiro legal`) subcommand, the Bestiary Dossier, and the `/` front-door page — visible across terminal and UI with zero gameplay friction.
- **Q:** How should remaining model, hardware, and service names (`qwen`, `mistral`, `deepseek`, `llama`, `RTX 4090`, `H100`, `ollama`, `stripe`) be handled?
  **A (user, 2026-11-17):** Keep open-weight core IDs (`qwen`, `mistral`, `deepseek`, `llama`) and clarify that all cast/orgs are fictional parodies and technical terms are educational only — preserves existing level solutions.
- **Q:** What `.kiro/` enforcement should guard against real brand mentions?
  **A (user, 2026-11-17):** Add deterministic `scripts/quality/check-brands.mjs` (in `npm run quality`) + a `.kiro/hooks/` check + steering rule — demonstrates Kiro governance and blocks regressions automatically.

## Open questions

(none)

## Verification

| Requirement | Gate |
|---|---|
| 1, 2, 3, 5 | `node .kiro/skills/chapter-level-generator/scripts/self-test.mjs`, `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/generate-chapter.mjs --verify` |
| 4 | `node scripts/harness/editor-unit-test.mjs`, `npm run build` |
| 6, 7, 8 | `node scripts/quality/check-brands.mjs`, `npm run quality`, `node scripts/quality/check-specs.mjs` |
