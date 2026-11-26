# Release tags power: tasks

Tasks 3 and 4 (GitHub Pages) were dropped with requirement 10.

- [x] 1. `credits-tauri-local` power: `plugin.json`, `scripts/tauri-local.mjs` (relative to the power: `.kiro/powers/credits-tauri-local/skills/tauri-local/scripts/tauri-local.mjs`; host-only build, local label, output under `out/tauri-local/`, open, `--no-open`, `--dry-run`, `--selftest`). _Req 1-4_. Gates: `tauri-local.mjs --selftest`, `--dry-run`, `npm run desktop:test`, `npm run quality:root`
- [x] 2. `tauri-local` skill. _Req 1-4_. Gates: read-through against the requirements
- [x] 5. `credits-release` power: `plugin.json`, `scripts/release.mjs` (relative to the power: `.kiro/powers/credits-release/skills/release/scripts/release.mjs`; plan, checks, gates, tag, push, watch with `gh`, hand off to `ship.mjs`, `--dry-run`, `--selftest`). _Req 5-9_. Gates: `release.mjs --selftest`, `--dry-run` on a clean worktree, refusal cases in the self-test
- [x] 6. `release` skill (plan, ask, `--yes`, second yes for Netlify prod, never push a tag by hand). _Req 5-9_. Gates: read-through against the requirements
- [x] 7. Agents cannot run either power: deny probes in `check-agents.mjs`. _Req 11_. Gates: `npm run quality:agents`
- [x] 8. Docs: `structure.md`, `tech.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`. _All_. Gates: `npm run quality`
- [ ] 9. First real release (needs the user: `gh` and `netlify` logins, merge to `main`, a version). _Req 5-9_. Gates: `release.mjs release <version>` then `--yes`. Evidence found: tag `v0.1.0` (annotated) on `2c9458b`, pushed 2026-11-18; a GitHub Release with 7 assets; the `desktop-release.yml` run for it succeeded. The Netlify preview step of `release.mjs` (with its Netlify login preflight before the gates and the tag, added 2026-11-26) has not run on a real release yet, so this task stays unticked. Requirement 9 was reworded 2026-11-26 to match the code (preview only) and confirmed the same day.

