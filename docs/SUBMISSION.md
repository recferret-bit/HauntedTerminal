# Kiroween 2026 submission pack

Source: [official rules](https://kiroween.devpost.com/rules), read November 17, 2026. Deadline: **Friday, December 4, 2026, 2:00 PM Pacific**. No extensions.

## Hard requirements (disqualification risks)

| Requirement | Status |
|---|---|
| Project built in the Submission Period (Oct 30 to Dec 4, 2026) | OK. First commit is Nov 12, 2026. |
| Public GitHub repo, not GitLab or Bitbucket | OK. `recferret-bit/OutOfCredits` is public. |
| OSI license file, detected in the repo's About box | MIT file present. TODO: check the About box shows "MIT". |
| `/.kiro` at the root, not in `.gitignore` | OK. 180+ files across agents, steering, specs, skills, hooks, and powers; `.gitignore` has no `.kiro` line. |
| All source, assets and run instructions in the repo | OK. See README. |
| URL to a working app | OK. https://out-of-credits.netlify.app |
| Demo video under 3 minutes, public on YouTube, no third-party trademarks or copyrighted music | **TODO (yours).** |
| Text description | Draft below. |
| Write-up on how Kiro was used | [`KIRO_USAGE.md`](KIRO_USAGE.md), needs your personal details. |
| Category chosen | Recommended: Costume Contest + **Best Startup Project** bonus track. |
| English materials | Fixed (two Russian docs translated). |

## Judging (five equal criteria, 10 points each)

1. Potential Impact: it teaches real unix, HTML, JS, Docker. Say so in the video and description.
2. Technological Implementation: Kiro depth. See `KIRO_USAGE.md`.
3. Design: complete product, not a proof of concept. The playable chapter plus comic plus cinematics.
4. Innovation: terminal as the only controller, procedural comic renderer, declarative content.
5. Presentation: the video. Stage one is pass/fail for theme fit and use of Kiro.

## TODO for you (placeholders I cannot fill)

- [x] Deployed 2026-11-17: https://out-of-credits.netlify.app (`credits-ship` power, preview played to the end, then production; README and the GitHub About website point at it). How it was done: `npx netlify-cli@27.20.0 login` once, then `node .kiro/powers/credits-ship/skills/ship/scripts/ship.mjs preview`, check the URL, then `prod`. Then replace `<LIVE_URL>` in `README.md` (2 places) and set the GitHub About website.
- [ ] Record the demo video (plan below), upload to YouTube as public, replace `<YOUTUBE_URL>` in `README.md`.
- [ ] Set the GitHub About box: description, topics, and confirm it shows the MIT license.
- [ ] Decide the legal name in `LICENSE` ("Andrei Sokolov") against git's "Andrey Sokolov", and make both match.
- [x] Trademark decision: refactored all story/code agent names to parody cast names (`Anti-Gravy`, `Codec`, `Gork`, `Clod`). Keep logos out of the demo video.
- [ ] Fill the personal parts of `docs/KIRO_USAGE.md` (surfaces, one before/after story).
- [x] Crew prepared: agents linked, workspace fixed, member `haunted-lead` on `lead-dev`, branch protection on (`npm run crew:check`).
- [ ] Run the first test and one real task through `lead-dev` in the Kiro Crew app, and one through the CLI; note them in `docs/AGENTS_CREW.md` and `docs/KIRO_USAGE.md`.
- [ ] Devpost form: category (Costume Contest), opt in to **Best Startup Project** bonus prize (paste pitch draft below), Kiro credits request by Dec 1 12:00 PM PT.
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
| 11 | Kiro features not visible in the repo | **Fixed for custom agents and PBT** (`.kiro/agents/`, `property-tests.mjs`). Powers and MCP: the `credits-ship` power bundles the Netlify MCP server (2026-11-17). |
| 12 | Audio needs a first click | Check once in a real browser. Audio is WebAudio, no files. |

## Kiro depth (status 2026-11-18)

The rules ask for evidence of custom agents, hooks, specs, steering, MCP, property-based testing and powers; judges verify through the repo and the write-up. The repo ships **7 custom agents**, **16 hooks** (plus 3 per team agent), **15 steering files**, **24 skills**, **15 specs**, **2 agent MCP servers** (`credits-forge` + Chrome DevTools MCP), **1 deploy power** (`credits-ship` bundling Netlify MCP), and **34 property-based tests** inside an **11-gate `npm run quality` suite**. Our own scoring against the five criteria: `docs/KIROWEEN_EVALUATION.md`.

## Kiro depth — built & verified

Ranked by value for the Technological Implementation score against cost.

1. **Built: custom agents.** Seven agents in `.kiro/agents/` (a lead, four feature designers, an artist, QA), one owner per file, tested on the CLI against the real tool (`agent/*` branches merged via PRs #2 and #5). Running a live chat task through the Kiro Crew desktop app remains your final check (`npm run crew:check`). See `docs/AGENTS_CREW.md`.
2. **Built: property-based tests.** 34 fast-check properties across five features, inside `npm run quality`; seven real bugs found and fixed. See `docs/PROPERTY_TESTS.md`.
3. **Built: two MCP servers for the agents** (`credits-forge` and Chrome DevTools MCP, spec `.kiro/specs/mcp-devtools-and-forge/`). `credits-forge` validates and solves level drafts headlessly with 0 deaths before allowing `write_level`; `qa` inspects live screenshots, console, and network through headless Chrome DevTools MCP without JS evaluation.
4. **Built: a power.** `credits-ship` (`.kiro/powers/credits-ship/`) bundles the Netlify MCP server with a gated `ship` skill that verifies 0-death browser playthroughs on the preview URL before allowing production promotion. Spec: `.kiro/specs/netlify-deploy-power/`.
5. **Surface comparison (free).** Write two paragraphs on what you used the CLI, IDE and Crew for. Pure text, but the rules ask for it.

## Demo video plan (under 3:00)

- 0:00 Hook: `/` startup front door ("Pulled inside your PC — your only weapon is a Unix terminal") -> click **Play Free Demo**, type `ls -la` in Level 1.
- 0:25 Play: `chmod -x` petrifying malware, `kill -9`, Split Code Editor fixing JS/Docker, unlocking a live `ACH_*` Steamworks-keyed comic toast.
- 1:10 Story & Art: 6-page rendered comic issue and real-time 3D orthographic intro/outro on a 100% code-generated zero-third-party-art stage.
- 1:35 Startup & Steam Wishlist Funnel: `/editor` & `/comix-editor` (future Steam Workshop creator tools), `/` Steam Coming Soon `<dialog>` waitlist, portable `out-of-credits-save.json` Auto-Cloud save export, and offline Tauri v2 + Steamworks desktop installers (`~4 MB` on macOS, plus Windows & Linux/Steam Deck) built on GitHub `v*` tags.
- 2:10 Kiro Depth: `.kiro/` architecture (15 specs, 16 hooks, 24 skills, 7 custom agents, `credits-forge` MCP, `credits-ship` power, 34 property tests).
- 2:45 Close: Live browser demo URL, Steam Wishlist / GitHub Releases, and repo.

Record on the device it targets (desktop browser). Use no music you do not own.

## Description draft (Devpost)

Out Of Credits is a 90s comic-book game where the only controller is a unix terminal. Lightning pulls a developer inside his own computer, and he survives by typing real commands. One 11-level chapter teaches `ls`, `cat`, `grep`, `chmod`, `kill`, and real HTML, JavaScript and Docker tasks, with 3 hubs, a boss, a six-page comic and animated 3D cinematics. Everything on screen is generated by code: no third-party art files, zero runtime CDN dependencies, and compact offline Tauri v2 desktop builds (`~4 MB` macOS `.dmg`, `< 15 MB` Windows setup, plus self-contained Linux/Steam Deck `.AppImage`/`.deb`). Content is declarative JSON checked by deterministic scripts, paired with a browser-demo-to-Steam conversion funnel (`/`), 12 local `ACH_*` Steamworks-keyed achievements, portable Auto-Cloud JSON saves, a chapter editor, a 3D comix editor, a Terminal Lab, and a Laptop Lab. Built entirely with Kiro: 7 custom agents, 15 steering files, 24 skills, 16 hooks, 15 specs, 2 MCP servers, 1 deploy power, and 34 property tests.

## Best Startup Project Bonus Prize — Devpost Pitch Draft

- **Problem & Audience:** Millions of CS students, bootcamp learners, and junior developers bounce off dry CLI/Docker documentation, while terminal/programming puzzle games (*TIS-100*, *Shenzhen I/O*, *Hacknet*) have proven a dedicated multi-hundred-thousand-copy commercial market on Steam.
- **Zero-CAC Browser-to-Steam Funnel:** Visitors play the full 11-level Chapter 1 Demo instantly in their browser (`/` -> `/play/chapter-01-kiroween`) with **zero backend server compute cost** (the VFS, POSIX shell, JS Worker, and sandboxed-iframe validator run 100% client-side). Every rank, `~/.bashrc` upgrade, and `ACH_*` trophy exports as a portable JSON save bundle (`out-of-credits-save.json`) that imports into native tagged Tauri desktop builds today and syncs automatically to Steam Achievements & Steam Auto-Cloud on launch.
- **Commercial Roadmap & Procedural Engine Moat:** Free permanent Chapter 1 Demo (Web + GitHub Release tags + Steam Next Fest Demo) converts players into the paid **Full Steam Edition** ($12.99–$14.99: Chapters 2–5 covering SSH/Networking, Git Rebase, SQL/Redis, and Cluster Bosses + Steam Workshop community campaigns authored in the built-in `/editor` and `/comix-editor`), plus classroom/bootcamp cohort packs—all with **$0 third-party asset royalties**.

## Optional bonus prizes

- **Best Startup Project**: opt in on the Devpost form and paste the Startup pitch above (companion playbook: `docs/STEAM_RELEASE_PLAYBOOK.md`, founder cutover checklist: `.kiro/specs/steamworks-store-release/`).
- **Bonus Blog**: publish a post during the period that says it is part of Kiroween 2026, and add its URL.
- **Social Blitz**: post starting with `#KiroweenHackathon26`, add the URL.
- **Best Demo**: automatic.
- Kiro credits: request by December 1, 2026, 12:00 PM Pacific.
