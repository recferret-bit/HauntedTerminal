# Parody Brand Guard & Kiro Disclaimer: design

## Pieces

```
src/game/
  kiro.ts             formatDisclaimer() on KiroCompanion; 1-line parody footer + kiro disclaimer hint in formatStatus()
  puzzle.ts           cmdKiro: dispatches kiro disclaimer | legal | brands in classic session
  manual.ts           man kiro: documents kiro disclaimer (kiro legal)
src/chapters/
  session-kiro.ts     cmdKiro: dispatches kiro disclaimer | legal | brands in chapter session
  session-meta.ts     cmdBestiary: prints 1-line parody & non-affiliation header in bestiary output
  catalog.ts          GRIMOIRE_ENTRIES (kiro syntax) and BESTIARY_DOSSIER (parody cast note)
src/pages/
  chapters-binder.ts  renderBinder: renders parody & non-affiliation banner above Bestiary Dossier cards
pages/
  index.html          front-door footer / callout clarifying parody cast and non-affiliation
scripts/quality/
  check-brands.mjs    deterministic brand gate scanning repo files for forbidden Big Four AI brand tokens
.kiro/hooks/
  check-brands-on-save.json   PostFileSave hook running node scripts/quality/check-brands.mjs
package.json          adds quality:brands script and includes it in npm run quality
```

## Decisions

- **Shared `KiroCompanion.formatDisclaimer()` in `src/game/kiro.ts`.** Both the chapter shell (`src/chapters/session-kiro.ts`) and the classic/lab shell (`src/game/puzzle.ts`) delegate to `g.kiro.formatDisclaimer()`, returning the formatted terminal block plus a `KIRO_ACTION` (`action: 'scan'`) and `AGENT_TAUNT` (`agent: 'kiro'`) event so the stage and terminal behave identically in both shells. Rejected duplicating text in `session-kiro.ts` and `puzzle.ts`. Follows Decision 1 & Decision 2 in `requirements.md`.
- **Dual in-game visibility (terminal + UI).** Players and judges who stay in the terminal see the parody notice in `kiro` / `kiro status`, `kiro disclaimer` (`kiro legal` / `kiro brands`), `man kiro`, and `bestiary`; visitors on `/` (`pages/index.html`) and `/chapters.html?tab=bestiary` (`src/pages/chapters-binder.ts`) see a visible parody & non-affiliation notice without needing to type a command. Follows Decision 2 in `requirements.md`.
- **Preserve open-weight core IDs (`qwen`, `mistral`, `deepseek`, `llama`).** Keeping the 4 `KiroCoreId` identifiers avoids breaking any of the 11 chapter `solutionCommands` or existing hub `kiro_loaded` win rules, while `formatDisclaimer()` explicitly states that open-weight model, hardware, and POSIX terms are used strictly for educational gameplay. Follows Decision 3 in `requirements.md`.
- **Deterministic `scripts/quality/check-brands.mjs` gate + `.kiro/hooks/check-brands-on-save.json`.** Scans `git ls-files` (excluding compiled/binary files) with word-boundary regexes for forbidden Big Four AI brand tokens (`AGY`, `AGY-9`, `Antigravity`, `Codex`, `C0D3X`, `Code-X`, `Grok`, `GR0NK`, `Claude`, `CLAWD`, `OpenAI`, `Anthropic`, `xAI`, `ChatGPT`, `Gemini`) and whitelists only the documented non-character cases (`CLAUDE.md` filename/references, `Claude Code` tool docs, and the common noun `codex` in `codex cards`). Wired into `npm run quality` (`quality:brands`) and `.kiro/hooks/check-brands-on-save.json`. Follows Decision 4 in `requirements.md`.

## Layers and gates

- **Layer rules (`scripts/quality/check-layers.mjs`):** No new `src/<area>/` and no import-direction changes (`src/game/kiro.ts` stays in `game/`; `src/chapters/session-kiro.ts` already imports `game/kiro.ts`; `src/pages/chapters-binder.ts` stays in `pages/`).
- **Pages (`vite.config.ts`):** No new HTML entry pages; edits existing `pages/index.html` and `src/pages/chapters-binder.ts`.
- **Vocabulary (`src/chapters/types.ts`, `script-types.ts`):** Unchanged.
- **Asset fingerprints (`npm run quality:fingerprint`):** Byte-identical (no changes to `src/procgen/`, `src/shaders/`, or `src/renderer/`).
- **Verification gates:**
  - `node scripts/quality/check-specs.mjs`
  - `node scripts/quality/check-brands.mjs`
  - `node .kiro/skills/chapter-level-generator/scripts/self-test.mjs`
  - `node scripts/harness/terminal-lab-unit.mjs`
  - `node scripts/harness/editor-unit-test.mjs`
  - `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`
  - `npm run quality`
  - `npm run build`
