# Kiroween 2026: evaluation of Haunted Terminal, Kiro first

Written November 17, 2026 against the [official rules](https://kiroween.devpost.com/rules). Scores are my estimates on the five equal criteria (10 points each, 50 total), not official numbers. Stage one is pass/fail: the project must fit the theme and visibly use Kiro. It does.

## Verdict

Strong entry, with Technological Implementation (how deeply Kiro is used) as its best criterion. What can still lose points is not the engineering. It is three things only you can supply: a public URL, a demo video, and proof that the Kiro Crew app path works.

| Criterion | Estimate | One line |
|---|---|---|
| Technological Implementation (Kiro) | 8.5 to 9.5 | Specs (15), steering, skills, hooks, seven custom agents with enforced ownership, 34 property tests that found real bugs; a project power with the Netlify MCP server |
| Design | 8 to 9 | A coherent, polished comic look, offline-ready typography, startup conversion funnel, and a full 11-level campaign; judged from screenshots and the video |
| Innovation / Idea | 8 to 9 | A terminal as the only controller, code-generated Comix Zone art, a declarative engine with its own editors and Tauri + Steamworks desktop pipeline |
| Potential Impact | 7.5 to 8.5 | Teaches real unix, HTML, JS and Docker through play, paired with a $0-server-CAC browser-demo-to-Steam commercial funnel targeting Zachtronics/terminal-puzzle fans & CS learners |
| Presentation | 3 to 8 | Today 0: no video, no URL. It swings by five points on what you record |

## Technological Implementation: what a judge can verify in the repo

This is the criterion the rules describe as "how thoroughly and skillfully does the project use Kiro", asking for a thoughtful strategy, variety, depth and experimentation.

| Kiro feature | Evidence | Strength |
|---|---|---|
| **Spec-driven development** | 15 specs in `.kiro/specs/` (including the 3 inventory item specs, `steam-launch-funnel`, and `steamworks-store-release`), EARS requirements, design, tasks, a `Status:` gate; user answers recorded as `**A (user, date):**`; a hook blocks new source areas until a spec is approved | Strong. The `agent-team`, `property-based-tests`, and `steam-launch-funnel` specs show the whole loop, including designs revised after independent review |
| **Steering** | 15 files; always-on facts, path-scoped rules, a glossary of exact vocabulary; `quality:declarative`, `quality:layers`, `quality:size` enforce them | Strong. Steering is checked by scripts, not trusted |
| **Skills** | 24 skills in three categories, each paired with a validator | Strong |
| **Hooks** | 16 in `.kiro/hooks/` (spec guard, brand guard, validators on save, gates on stop, property tests, agent gate) plus three per team agent (baseline, shell guard, scope) | Strong, and the agent hooks were probed against the real CLI |
| **Custom agents** | 7 agents, generated from one table, with an `fs_write` fence, a shell allow-list, a guard hook, a scope hook, one owner per file; verified with real agents under auto-approve | Strong, with a stated limit: a guard against mistakes, not a sandbox |
| **Property-based testing** | 34 fast-check properties in `npm run quality`; found 7 real bugs; planted-bug checks per feature; guards against vacuous properties | Strong. The write-up question "did PBT catch issues unit tests missed?" has a concrete answer |
| **Sub-agents** | `lead-dev` delegates to six named agents; `semantic_reviewer` reviewed the work independently and found blockers | Good |
| **Kiro CLI, Crew** | CLI path tested end to end; Crew prepared (agents installed, member on `lead-dev` in the repo workspace, `npm run crew:check`); the gateway honours the agents' rules; a real chat with the member is not done | Partial: needs the two-minute first test and one real task in the app |
| **MCP** | Our own `haunted-forge` server (validate, solve, save levels), Chrome DevTools MCP for `qa`, the Netlify server in the power; exact per-agent tool lists checked by the gate and probed in the real CLI | Strong: the forge enforces the 0-death rule as a tool contract |
| **Powers** | `haunted-ship`: manifest, keywords, Netlify MCP, a `ship` skill whose script gates every deploy and plays the chapter on the preview | Good once the first real deploy is done |
| **Kiro IDE / Web** | Hooks and steering are written for the IDE; nothing shows it was used | Add two honest paragraphs on what each surface was used for |

### What makes this more than a feature list

1. **The enforcement is tested against the real tool.** The agent fences were probed on Kiro CLI 3.3.0, and the probes changed the design: a command that matches no rule runs under auto-approve; shell rules ignore redirects; a sub-agent's call is also checked against its parent. Each finding became a gate, a test or a documented limit.
2. **Quality gates replace trust.** `npm run quality` runs 11 gates (types, root layout, size, layers, declarative, specs, duplicates, agents, brands, MCP, properties). Agents "report only gates they ran".
3. **The loop was closed on itself.** The property tests found bugs in the game; an independent review found bugs in the agent setup and in the tests; both were fixed and re-verified. The commit-ready record is in the specs' `tasks.md`.

## Gaps, in the order they cost points

1. **No public URL and no video** (Presentation, and the mandatory submission items). Deploy `dist/` (Netlify reads `public/_redirects`); record the demo (plan in `SUBMISSION.md`). Judges "are not required to test", so the video is where most of them will meet the game.
2. **The Kiro Crew desktop app chat is prepared, not yet recorded.** Setup is checked by `npm run crew:check`, and `agent/*` branches have been pushed and merged (PRs #2 and #5); running one task live from the Kiro Crew app with a generated `docs/qa/` report closes the loop completely.
3. **Presentation of the Kiro story.** The write-up (`KIRO_USAGE.md`) still needs your own part: which Kiro surfaces you used for what, and one before and after story.
4. **Impact claim.** The rules ask "would someone actually use this?". Frame it as learning by play plus a commercial indie game funnel: the unix commands, an HTML/CSS fix, a JS bug, a Dockerfile and a Compose file are real, a tutorial level teaches them, and the $0-server-CAC browser demo converts players into Steam wishlists. Avoid claiming more.
5. **Trademarks & parody hygiene.** All AI agent villains use original parody cast names (`Anti-Gravy`, `Codec`, `Gork`, `Clod`), enforced across tracked files by `npm run quality:brands` and disclosed via `kiro disclaimer` and `/`. Keep third-party logos out of the video.
6. **MCP depth.** Done: `haunted-forge` and Chrome DevTools MCP for the agents, plus `@netlify/mcp` in the `haunted-ship` power. Next, optional: package `haunted-forge` with the LEVEL GEN skills as a second power.

## Category and bonus prizes

- **Category: Costume Contest** (a haunting, polished interface that serves the function). The terminal and the comic stage are the product. Frankenstein is the alternative (Three.js, xterm.js, a unix emulator, procedural art and a spec engine stitched together), but the visual identity is the stronger story.
- **Best Demo:** automatic; depends on the video.
- **Bonus Blog and Social Blitz:** cheap and open to everyone: a post during the period that mentions Kiroween 2026 (`#KiroweenHackathon26` first for the social one). The property-test story ("it found seven bugs the example tests missed") is the best hook.
- **Best Startup Project (Bonus Track):** Haunted Terminal is positioned as a real commercial indie game & developer-learning product: a frictionless, $0-backend-cost 11-level Browser Demo funnel (`/`) + Victory Screen Wishlist CTA -> 12 local `ACH_*` Steamworks-keyed achievements & portable JSON saves (`haunted-terminal-save.json` synced to Tauri `app_data_dir` for Steam Auto-Cloud) -> tagged macOS/Windows/Linux Tauri v2 desktop builds (`.github/workflows/desktop-release.yml`) -> Paid Full Steam Edition (Chapters 2–5 + Steam Workshop creator tools). Playbook & founder checklist: `docs/STEAM_RELEASE_PLAYBOOK.md` and `.kiro/specs/steamworks-store-release/`.
- **Best Student, Ghost of Kiroween Past, Kiro Crew App:** only if they apply. Crew App needs a separate Crew-app repo, which this is not.
- Submission must be made by **December 4, 2026, 2:00 PM Pacific**; Crew credit requests close December 1.

## Do before you submit (ranked)

1. Commit and push the setup; enable branch protection on `main`.
2. Deploy; set the About website, description and topics (licence shows as MIT).
3. Run the first test and one real task through `lead-dev` in the Kiro Crew app; update `docs/AGENTS_CREW.md` with what happened.
4. Record the video; fill `KIRO_USAGE.md`'s personal part.
5. Publish the blog post and the social post; fill the Devpost form from `SUBMISSION.md`.
