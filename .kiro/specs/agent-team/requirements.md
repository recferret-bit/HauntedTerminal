# Agent team: requirements

Status: approved (requirements, design and tasks approved by the user 2026-11-17)

Capability: a team of committed Kiro custom agents that tune each major part of Out Of Credits. Four gameplay designers own one feature each (terminal, laptop, comix, chapters). A lead game developer orchestrates them. An artist creates and updates assets through the ASSET PCG skills. A QA agent plays the game and touches every part of it. The user runs them from Kiro CLI and from the Kiro Crew app.

## Requirements

Agents: `lead-dev`, `terminal-designer`, `laptop-designer`, `comix-designer`, `chapters-designer`, `artist`, `qa`; since 2026-11-28 also `sound-designer` (`.kiro/specs/audio-agent/`); since 2026-11-26 also `smm-agent` (`.kiro/specs/social-smm-agent/`).

### Agent files

1. THE SYSTEM SHALL keep the seven agents in `.kiro/agents/<name>.json`, each with its prompt in a separate Markdown file referenced by `file://`, and `model: auto`.
2. `kiro-cli agent validate --path .kiro/agents/<name>.json` SHALL pass for every agent.
3. WHEN an agent starts, THE SYSTEM SHALL load `AGENTS.md`, the always-on steering, the steering for its own paths, and the skills of its area, listed explicitly in `resources`, within the CLI limit of 32 files and 100,000 characters.
4. WHEN the user runs `npm run agents:install`, THE SYSTEM SHALL symlink every repo agent into `~/.kiro/agents/` without touching other files there, and SHALL report any name clash instead of overwriting it.
5. WHEN the user runs `npm run agents:install -- --remove`, THE SYSTEM SHALL remove only the symlinks it created.

### Ownership

6. THE SYSTEM SHALL enforce, through `permissions.rules`, that each agent writes only its own paths:
   - `terminal-designer`: `src/game/{shell,commands-*,tree*,manual,lab-*}.ts`, `src/ui/`, `src/terminal-lab/`, `scripts/harness/terminal-lab/`.
   - `chapters-designer`: `chapters/`, `src/chapters/` except `generated/`, `src/chapter-editor/`, `src/game/{entities*,bestiary,puzzle,inventory,kiro,dialogue,agents}.ts`.
   - `comix-designer`: `comix/`, `src/cinematic/` except `generated/`, `src/comix-editor/`.
   - `laptop-designer`: `src/laptop/`.
   - `artist`: `src/procgen/`, `src/shaders/`, `src/renderer/`, `src/storybook/`, `public/assets/`.
   - `qa`: `docs/qa/` only.
   - `lead-dev`: `.kiro/specs/`; and the cross-cutting `src/contracts/`, `src/editor-core/`, `src/play/`, `src/pages/`, `src/hub/`, `src/styles/` only for a task recorded in a spec.
7. IF an agent tries to write outside its paths, THEN THE SYSTEM SHALL deny the write, and the agent SHALL tell the lead which owner the change needs.
8. Every agent SHALL run the compilers (`generate-chapter.mjs`, `generate-comix.mjs`) rather than edit `generated/` files, and SHALL follow `spec-first.md`: tuning goes ahead; a new feature stops at a draft spec and a question to the user.

### Orchestration

9. WHEN `lead-dev` receives a request, THE SYSTEM SHALL route each part to the owning agent, and only to the six agents named here (`subagent/<name>` tools, no generic sub-agent tool).
10. WHEN a delegated change finishes, `lead-dev` SHALL call `qa` on the affected features before reporting the change as done.
11. WHEN `artist` receives an asset request, THE SYSTEM SHALL read `credits-art-direction` first, use the matching ASSET PCG skill, and run its validator and the visual QA pass (`comic-panel-viewport-auditor`).
12. WHEN a designer finishes a change, THE SYSTEM SHALL run the gates of its feature (listed per agent in the design) and report the ones it actually ran.

### QA

13. WHEN `qa` runs, THE SYSTEM SHALL play the game in real Chrome (`play-browser.mjs`), run the suites of the affected features (or of all features when asked for a full pass), look at the screenshots it produces, and write a report.
14. THE SYSTEM SHALL write the QA report to `docs/qa/<YYYY-MM-DD>-<scope>.md`, with screenshots of failures in `docs/qa/media/`, listing each check run, its result, and each finding with the owning agent.

### Commits and Kiro Crew

15. WHEN a task is done and QA passes, `lead-dev` SHALL commit it on a branch `agent/<task>` and push that branch.
16. IF the current branch is `main`, or a push would need force, THEN `lead-dev` SHALL NOT commit or push there.
17. THE SYSTEM SHALL document in `docs/AGENTS_CREW.md` how to run the team from Kiro CLI and from the Kiro Crew app through a Crew member bound to the repo's workspace, with `lead-dev` as the entry point.

### Added after the independent review (2026-11-17; see Decisions Q11)

18. THE SYSTEM SHALL write each agent's shell policy as an allow rule plus a catch-all `deny *` that excludes the same list, so that a command matching no rule is refused even where Kiro auto-approves (Kiro Crew's Automatic mode, `--trust-all-tools`). The list has no `find`, `sed`, `rm`, `printf`, `node -e` or generic `git diff`/`git push`.
19. WHEN an agent runs a shell command, a `PreToolUse` hook (`scripts/hooks/agent-shell-guard.mjs`) SHALL block: a redirect into a path outside the agent's write paths; git history writes by any agent but `lead-dev`; `commit`, `merge`, `push`, `rebase`, `cherry-pick` on `main` or `master`; `git add` without `--` and explicit paths; `--amend` and `-a`; and any push that is not `[-u] origin agent/<task>`.
20. WHEN an agent session starts, THE SYSTEM SHALL snapshot the dirty files; WHEN it stops, THE SYSTEM SHALL list the files changed since the snapshot outside the agent's paths, each with its owner, and SHALL NOT report files that were already dirty.
21. THE SYSTEM SHALL deny every agent writes to compiled output (`src/chapters/generated/`, `src/cinematic/generated/`, `chapters/*/story/out/`) and reads of secrets (`**/.env*`, `*.pem`, `~/.kiro/crew/.env`, `~/.ssh`, `~/.aws`).
22. THE SYSTEM SHALL run, inside `npm run quality:agents`, a rule self-test (commands each agent must be refused or allowed, evaluated the way Kiro matches rules) and `scripts/harness/agents-unit.mjs` (guard, scope hook, installer).
23. THE SYSTEM SHALL give every file an owner or classify it as infrastructure that only the user changes (`.kiro/agents/`, `.kiro/hooks/`, `.kiro/skills/`, `scripts/` outside the property suites, `pages/`, `package.json`); a new top-level folder is flagged until classified.

24. THE SYSTEM SHALL provide a read-only readiness check, `npm run crew:check`, that reports FAIL for each missing piece of the Crew setup (agents linked, valid, a Crew workspace on this repo, a member running `lead-dev` there, no `autoApprove` list, an `origin` remote, branch protection) and WARN for the rest (gateway, dirty tree), prints a fix for each, and never prints a secret.

## Out of scope

- New game features. Agents follow `spec-first.md` like any other session.
- Changes to the Kiro Crew built-in agents in `~/.kiro/agents/kirocrew-*`.
- Messaging channels (Telegram and the others) and any phone access: dropped by the user (Q14).
- A fifth designer for gameplay elements (Q7).

## Decisions

- **Q:** Which agents?
  **A (user, 2026-11-17):** Four gameplay feature designers (terminal, laptop, comix, chapters), a lead game developer who orchestrates the gameplay designers, one artist designer who uses the skills to create and update assets, and a QA agent who plays the game and touches every aspect of it.
- **Q:** What are they for?
  **A (user, 2026-11-17):** To tune each part of the game.
- **Q:** Where are they used?
  **A (user, 2026-11-17):** Kiro CLI for development; also from the phone and Kiro Crew.

- **Q1:** Whom does the lead dispatch, and when does QA run?
  **A (user, 2026-11-17):** The lead dispatches all six (four designers, artist, QA) and calls QA after every change it delegates.
- **Q2:** How do the agents reach Kiro Crew and the phone?
  **A (user, 2026-11-17):** Agents live in the repo's `.kiro/agents/`; `npm run agents:install` symlinks them into `~/.kiro/agents/`; the Crew gateway runs from the repo folder; the phone channel is Telegram.
- **Q3:** Is write access limited per agent?
  **A (user, 2026-11-17):** Yes, enforced by `permissions.rules`: each agent writes only its own area; QA writes only its reports; the lead writes only `.kiro/specs`. Shared files need an owner.
- **Q4:** Do agents commit?
  **A (user, 2026-11-17):** The lead commits each finished task to a branch `agent/<task>` and pushes it; never `main`, never force-push. Review happens on GitHub from the phone.

- **Q6:** Which model?
  **A (user, 2026-11-17):** `auto` for every agent.
- **Q7:** Who owns the shared code?
  **A (user, 2026-11-17):** Terminal designer: shell, commands, tree, manual and lab files in `src/game`, plus `src/ui`, `src/terminal-lab`, lab scripts. Chapters designer: gameplay elements in `src/game` (entities, bestiary, puzzle, inventory, kiro, dialogue, agents), plus `chapters/`, `src/chapters`, `src/chapter-editor`. Comix designer: `comix/`, `src/cinematic`, `src/comix-editor`. Laptop designer: `src/laptop`. Artist: `src/procgen`, `src/shaders`, `src/renderer`, `src/storybook`, `public/assets`. Lead: `src/contracts`, `src/editor-core`, `src/play`, `src/pages`, `src/hub`, `src/styles`, only through a task recorded in a spec.
- **Q8:** Where does the QA report go?
  **A (user, 2026-11-17):** `docs/qa/<date>-<scope>.md` on the `agent/<task>` branch, failing screenshots in `docs/qa/media/`.

- **Q11:** Close the review findings and the two open behaviour questions.
  **A (user delegated, 2026-11-17):** "Use your recommendations." Applied as: (1) the shell becomes an allow-list written as allow plus catch-all deny (requirement 18) with a guard hook for redirects and git (19); (2) requirement 6 is read as: each designer writes its own paths, never compiled output (21); (3) the lead also owns steering, `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/*.md`, `docs/media`, `docs/reviews`, the property runner and the shared property helpers, because the spec-first "Finish" step needs someone to update them; each property suite file belongs to the designer of its feature, so that designer can add regression examples; (4) the lead's session fence is the union of its sub-agents' write paths and shell extras, because Kiro checks a sub-agent's call against the parent session (the dry run showed `qa` blocked otherwise); the lead's own share is held by the scope hook, not by the fence; (5) branch protection on GitHub for `main` is recommended as the real barrier and left to the user; (6) `sed` with an empty pattern is refused like GNU sed, and `cp` of an unreadable file fails like the classic shell already did.

- **Q13:** Prepare everything to use Kiro Crew.
  **A (user, 2026-11-17):** "Commit this, then prepare everything to make it possible to use Kiro Crew in the best way." Applied as: the work is committed on `main` in four commits (not pushed); the agents are linked into `~/.kiro/agents`; the stale Crew workspace path is fixed and the member `haunted-lead` runs `lead-dev` in it (Crew config backed up first); a gateway was started only for tests and stopped; `npm run crew:check` and a first-test script are in `docs/AGENTS_CREW.md`. Left to the user because they need credentials or change remote settings: the Telegram bot token, starting the gateway, and GitHub branch protection.

- **Q14:** Telegram.
  **A (user, 2026-11-17):** "Skip Telegram, remove it everywhere." Applied as: no messaging channel and no phone access are part of this spec any more. Supersedes the phone parts of Q1-Q4 above (kept as history): requirement 17 and task 9 now name the Kiro Crew app; the doctor no longer checks Telegram; docs, prompts and steering no longer mention it. The reviewed document `docs/reviews/2026-11-17-agents-and-property-tests.md` keeps its original wording as a record.

## Open questions


## Verification

- Req 1-3: `kiro-cli agent validate` on all seven files, and a check script (`scripts/quality/check-agents.mjs`, in `npm run quality`) for prompt files, `model: auto`, the `resources` size limit, and the lead's sub-agent list.
- Req 4-5: `scripts/harness/agents-unit.mjs` runs the installer twice (idempotent), with a clashing file, and with `--remove`, against a temporary `HOME`.
- Req 6-7: the check script compares each agent's write rules with the ownership table, so no path has two owners and every source folder has one; one manual denied write per agent.
- Req 8-16: one real tuning task through `lead-dev` from the CLI, ending in a QA report and an `agent/<task>` branch.
- Req 17: the first test and one real task through the Kiro Crew app (manual, by the user), recorded in `docs/AGENTS_CREW.md`.
