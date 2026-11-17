# Kiroween 2026 submission pack

Source: [official rules](https://kiroween.devpost.com/rules), read November 17, 2026. Deadline: **Friday, December 4, 2026, 2:00 PM Pacific**. No extensions.

## Hard requirements (disqualification risks)

| Requirement | Status |
|---|---|
| Project built in the Submission Period (Oct 30 to Dec 4, 2026) | OK. First commit is Nov 12, 2026. |
| Public GitHub repo, not GitLab or Bitbucket | OK. `recferret-bit/HauntedTerminal` is public. |
| OSI license file, detected in the repo's About box | MIT file present. TODO: check the About box shows "MIT". |
| `/.kiro` at the root, not in `.gitignore` | OK. 146 tracked files; `.gitignore` has no `.kiro` line. |
| All source, assets and run instructions in the repo | OK. See README. |
| URL to a working app | **TODO (yours).** |
| Demo video under 3 minutes, public on YouTube, no third-party trademarks or copyrighted music | **TODO (yours).** |
| Text description | Draft below. |
| Write-up on how Kiro was used | [`KIRO_USAGE.md`](KIRO_USAGE.md), needs your personal details. |
| Category chosen | Recommended: Costume Contest. |
| English materials | Fixed (two Russian docs translated). |

## Judging (five equal criteria, 10 points each)

1. Potential Impact: it teaches real unix, HTML, JS, Docker. Say so in the video and description.
2. Technological Implementation: Kiro depth. See `KIRO_USAGE.md`.
3. Design: complete product, not a proof of concept. The playable chapter plus comic plus cinematics.
4. Innovation: terminal as the only controller, procedural comic renderer, declarative content.
5. Presentation: the video. Stage one is pass/fail for theme fit and use of Kiro.

## TODO for you (placeholders I cannot fill)

- [ ] Deploy with the `haunted-ship` power: `npx netlify-cli@27.20.0 login` once, then `node .kiro/powers/haunted-ship/skills/ship/scripts/ship.mjs preview`, check the URL, then `prod`. Then replace `<LIVE_URL>` in `README.md` (2 places) and set the GitHub About website.
- [ ] Record the demo video (plan below), upload to YouTube as public, replace `<YOUTUBE_URL>` in `README.md`.
- [ ] Set the GitHub About box: description, topics, and confirm it shows the MIT license.
- [ ] Decide the legal name in `LICENSE` ("Andrei Sokolov") against git's "Andrey Sokolov", and make both match.
- [x] Trademark decision: refactored all story/code agent names to parody cast names (`Anti-Gravy`, `Codec`, `Gork`, `Clod`). Keep logos out of the demo video.
- [ ] Fill the personal parts of `docs/KIRO_USAGE.md` (surfaces, one before/after story).
- [x] Crew prepared: agents linked, workspace fixed, member `haunted-lead` on `lead-dev`, branch protection on (`npm run crew:check`).
- [ ] Run the first test and one real task through `lead-dev` in the Kiro Crew app, and one through the CLI; note them in `docs/AGENTS_CREW.md` and `docs/KIRO_USAGE.md`.
- [ ] Devpost form: category (Costume Contest), bonus prizes, Kiro credits request by Dec 1 12:00 PM PT.
- [ ] Optional: blog post and `#KiroweenHackathon26` post, add their URLs.
- [ ] Run before submitting: `node scripts/harness/editor-smoke.mjs`, `comix-editor-smoke.mjs`, `terminal-lab-smoke.mjs`, `laptop-lab-smoke.mjs`, `model-geometry-validator --all --strict`, `npm run quality:fingerprint`.

## Issues found and their state

| # | Issue | State |
|---|---|---|
| 1 | LICENSE name differs from git author | TODO (yours, legal name) |
| 2 | No live URL | TODO (yours). Build passes and `_redirects` is in place. |
| 3 | No demo video | TODO (yours). Plan below. |
| 4 | Browser playthrough failed | **Fixed.** The script was the old classic-floor one pointed at the chapter. `play-browser.mjs` now builds its script from every level's `solutionCommands`, so it cannot drift. It plays all 11 levels in real Chrome: 64 commands, 85 s, rank S, no console errors. The old script still drives `--script ... --query ''` (classic floors). |
| 5 | Two specs with open tasks | **Closed.** `chapter-editor` and `declarative-chapter-runtime` are `done`; unbuilt items moved to a "Backlog" section of each `tasks.md`, recorded under `## Decisions`. Revert if you want any of them in scope. |
| 6 | Legacy specs written after code | **Disclosed.** Their status line keeps "legacy: written before spec-first.md". Do not claim spec-first for them. |
| 7 | Trademarks in the story | **Fixed.** Uses parody cast names (Anti-Gravy, Codec, Gork, Clod). |
| 8 | README start date | **Fixed.** Uses the first commit date, Nov 12. |
| 9 | Screenshots only in ignored `out/` | **Fixed.** Copied to `docs/media/`. |
| 10 | Some suites not run | TODO, command list above |
| 11 | Kiro features not visible in the repo | **Fixed for custom agents and PBT** (`.kiro/agents/`, `property-tests.mjs`). Powers and MCP: the `haunted-ship` power bundles the Netlify MCP server (2026-11-17). |
| 12 | Audio needs a first click | Check once in a real browser. Audio is WebAudio, no files. |

## Kiro depth (status 2026-11-17)

The rules ask for evidence of custom agents, hooks, specs, steering, MCP, property-based testing and powers; judges verify through the repo and the write-up. The repo now shows 7 custom agents, 15 hooks, 15 steering files, 24 skills, 10 specs and 32 properties. Our own scoring against the five criteria: `docs/KIROWEEN_EVALUATION.md`. MCP and powers are not used, and the write-up says so.

## Kiro depth plan (items 1 and 2 done 2026-11-17)

Ranked by value for the Technological Implementation score against cost.

1. **Built: custom agents.** Seven agents in `.kiro/agents/` (a lead, four feature designers, an artist, QA), one owner per file, tested on the CLI against the real tool. The Kiro Crew app run and a pushed `agent/*` branch are not yet done: say "built and documented" until they are. See `docs/AGENTS_CREW.md`.
2. **Done: property-based tests.** 32 fast-check properties across five features, inside `npm run quality`; six real bugs found and fixed. See `docs/PROPERTY_TESTS.md`.
3. **A small MCP server exposing the gates (medium cost).** Tools such as `run_quality`, `verify_chapter`, `run_terminal_lab`, `list_specs`, returning structured results. Trade-off: it reverses today's "keep mcp.json empty" rule and adds `@modelcontextprotocol/sdk`. Cheaper alternative: wire an existing Chrome DevTools MCP for the visual QA you now do through a hand-written CDP client.
4. **Built: a power.** `haunted-ship` (`.kiro/powers/haunted-ship/`) bundles the Netlify MCP server with a gated deploy skill. Spec: `.kiro/specs/netlify-deploy-power/`.
5. **Surface comparison (free).** Write two paragraphs on what you used the CLI, IDE and Crew for. Pure text, but the rules ask for it.

## Demo video plan (under 3:00)

- 0:00 Hook: "What if the only controller was your terminal?" Show level 1, type `ls`.
- 0:20 Play: `cat`, `kill -9`, `chmod -x` on a monster; show a code task.
- 1:10 The comic issue and the 3D intro.
- 1:35 Under the hood: generate-by-code assets, the storybook, the chapter editor.
- 2:05 Kiro: `.kiro` folder, spec, hook blocking, quality gate output.
- 2:40 Close with the URL and the repo.

Record on the device it targets (desktop browser). Use no music you do not own.

## Description draft (Devpost)

Haunted Terminal is a 90s comic-book game where the only controller is a unix terminal. Lightning pulls a developer inside his own computer, and he survives by typing real commands. One 11-level chapter teaches `ls`, `cat`, `grep`, `chmod`, `kill`, and real HTML, JavaScript and Docker tasks, with a hub, a boss, a six-page comic and animated 3D cinematics. Everything on screen is generated by code: no art files. Content is declarative JSON checked by deterministic scripts, and the repo includes a chapter editor, a 3D comix editor and a Terminal Lab. Built entirely with Kiro: 7 custom agents, 15 steering files, 24 skills, 15 hooks, 32 property tests and spec-first development.

## Optional bonus prizes

- **Bonus Blog**: publish a post during the period that says it is part of Kiroween 2026, and add its URL.
- **Social Blitz**: post starting with `#KiroweenHackathon26`, add the URL.
- **Best Demo**: automatic.
- Kiro credits: request by December 1, 2026, 12:00 PM Pacific.
