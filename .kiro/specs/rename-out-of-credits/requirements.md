# Rename out of credits: requirements

Status: done

Capability: Rename the project from "Haunted Terminal" to "Out Of Credits" everywhere: display name, saved-data keys (with migration), package, release and installer names, external site, repo and domain targets, agents, powers, skills, MCP servers, past records, and the title and tagline text of the story.

## Requirements

1. WHEN the game, a page, a window title, the README or any player-facing text names the project, THE SYSTEM SHALL show "Out Of Credits" ("OUT OF CREDITS" where that text is already capitals).
2. WHEN the game loads and finds data under an old `haunted-terminal:*` key (achievements, progress, metagame, waitlist), THE SYSTEM SHALL copy it to the matching `out-of-credits:*` key, keep the version suffix, and use the new key from then on.
3. IF both an old and a new key exist, THEN THE SYSTEM SHALL keep the new key's data and leave it unchanged.
4. WHEN the player exports or imports a save file, THE SYSTEM SHALL write `out-of-credits-save.json` and SHALL still accept `haunted-terminal-save*.json` files.
5. WHEN the Steam waitlist export, desktop build, installer, portable bundle or release asset is named, THE SYSTEM SHALL use the `out-of-credits` slug, and `npm run desktop:verify` SHALL still pass with the 13 `ACH_*` keys synced 1:1.
6. WHEN the repo names its external targets (Netlify site, GitHub repo, domain), THE SYSTEM SHALL use `out-of-credits.netlify.app`, `OutOfCredits` and `outofcredits.app`. The user creates the targets; the repo does not call them.
7. WHEN an agent, power, skill, MCP server or script carries the `haunted-` prefix (`haunted-art-direction`, `haunted-ship`, `haunted-release`, `haunted-tauri-local`, `haunted-forge`), THE SYSTEM SHALL rename it to the `credits-` prefix, update every reference (`agents-build.mjs` table, regenerated `.kiro/agents/`, steering, `AGENTS.md`, `CLAUDE.md`, hooks, skills, specs) in the same change, and `npm run quality:agents` SHALL pass.
8. WHEN the rename edits past records (`docs/qa/` reports, merged specs, docs), THE SYSTEM SHALL change only the project name, not their findings, dates or verdicts.
9. WHEN the story names the game, THE SYSTEM SHALL carry the new title and the approved tagline in the comic, intro and outro, changed through the chapter and comix skills and compiled with the generators, never by hand in `generated/`.
10. WHILE the in-story and art-bible "haunted" and Kiroween theme is not the project name, THE SYSTEM SHALL leave that wording as it is.
11. WHEN the rename is complete, THE SYSTEM SHALL contain no `Haunted Terminal`, `HauntedTerminal`, `haunted-terminal` or `hauntedterminal` outside the migration code, the legacy-save acceptance and its tests, and git history.
12. WHEN the work runs, THE SYSTEM SHALL do it on branch `agent/rename-out-of-credits`, never on `main`.

## Out of scope

- Creating the Netlify site, GitHub repo, domain or renaming the folder on disk (the user does it).
- Rewriting git history.
- Changing the "haunted" story and art theme.
- A second chapter.

## Decisions

**Q1 Saved progress:** migrate or drop old keys?
**A (user, 2026-05-01):** A. Rename the keys and migrate old data on first load.

**Q2 Display casing:**
**A (user, 2026-05-01):** A. "Out Of Credits" in the UI, "OUT OF CREDITS" where the game uses caps.

**Q3 Code identifiers:**
**A (user, 2026-05-01):** B. Rename everything: agents, powers, skills, MCP servers, `agents-build.mjs`.

**Q4 External names:**
**A (user, 2026-05-01):** "ALL, B". Set new target names in the repo for the Netlify site, GitHub repo, domain and disk folder. The user creates the targets.

**Q5 Story and theme:**
**A (user, 2026-05-01):** "2", read as B. Also rewrite the title and tagline text in the comic, intro and outro.

**Q6 Slugs:**
**A (user, 2026-05-01):** Recommended: `out-of-credits` for package, save keys and Netlify site; `OutOfCredits` for the GitHub repo.

**Q7 Domain:**
**A (user, 2026-05-01):** Yes, `outofcredits.app`.

**Q8 Prefix:**
**A (user, 2026-05-01):** A. `credits-*`.

**Q9 Story theme wording:**
**A (user, 2026-05-01):** Yes. The "haunted" and Kiroween story and art wording stays; only the project name changes.

**Q10 Past records:**
**A (user, 2026-05-01):** Rewrite the name in `docs/qa/` reports and merged specs.

**Q12 Tagline:**
**A (user, 2026-05-01):** Approved the requirements without a tagline text. `chapters-designer` and `comix-designer` propose options; the user approves one in task 8 before any story text is written. (Recorded by the agent from the approval; correct it if you meant otherwise.)

**Q11 Branch:**
**A (user, 2026-05-01):** Yes, `agent/rename-out-of-credits`.

## Open questions

(none)

## Verification

- Req 1, 11: grep gate for the old names (allow-list: migration code and its tests), `npm run quality:brands`, `npm run quality`.
- Req 2, 3, 4: a unit check of the migration (old only, new only, both) and a legacy save import.
- Req 5: `npm run desktop:test`, `npm run desktop:verify`.
- Req 6, 7: `npm run quality:agents`, `node scripts/harness/forge-unit.mjs`, `node .kiro/powers/credits-ship/skills/ship/scripts/ship.mjs --selftest`.
- Req 8, 10: diff review of `docs/qa/` and specs, names only.
- Req 9: `node scripts/harness/generate-chapter.mjs --verify`, `node scripts/harness/generate-comix.mjs --verify`, `node .kiro/skills/comix-implementer/scripts/verify-comix.mjs`.
- Req 12: `git branch --show-current`.
- Whole change: `npm run quality`, `npm run build`, `npm run quality:fingerprint` (asset output unchanged apart from renamed ids, if any).
