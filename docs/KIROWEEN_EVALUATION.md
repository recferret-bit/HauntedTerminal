# Kiroween 2026: evaluation of Haunted Terminal, Kiro first

Written November 17, 2026 against the [official rules](https://kiroween.devpost.com/rules). Scores are my estimates on the five equal criteria (10 points each, 50 total), not official numbers. Stage one is pass/fail: the project must fit the theme and visibly use Kiro. It does.

## Verdict

Strong entry, with Technological Implementation (how deeply Kiro is used) as its best criterion. What can still lose points is not the engineering. It is three things only you can supply: a public URL, a demo video, and proof that the phone path works.

| Criterion | Estimate | One line |
|---|---|---|
| Technological Implementation (Kiro) | 8.5 to 9.5 | Specs, steering, skills, hooks, seven custom agents with enforced ownership, property tests that found real bugs; no MCP, no powers |
| Design | 7.5 to 8.5 | A coherent, polished comic look and a full campaign; judged from screenshots and the video, not the repo |
| Innovation / Idea | 8 to 9 | A terminal as the only controller, code-generated Comix Zone art, a declarative engine with its own editors |
| Potential Impact | 5.5 to 7 | Teaches real unix, HTML, JS and Docker through play; the audience claim is the weakest part of the story |
| Presentation | 3 to 8 | Today 0: no video, no URL. It swings by five points on what you record |

## Technological Implementation: what a judge can verify in the repo

This is the criterion the rules describe as "how thoroughly and skillfully does the project use Kiro", asking for a thoughtful strategy, variety, depth and experimentation.

| Kiro feature | Evidence | Strength |
|---|---|---|
| **Spec-driven development** | 10 specs in `.kiro/specs/`, EARS requirements, design, tasks, a `Status:` gate; user answers recorded as `**A (user, date):**`; a hook blocks new source areas until a spec is approved | Strong. The `agent-team` and `property-based-tests` specs show the whole loop, including a design revised after an independent review |
| **Steering** | 15 files; always-on facts, path-scoped rules, a glossary of exact vocabulary; `quality:declarative`, `quality:layers`, `quality:size` enforce them | Strong. Steering is checked by scripts, not trusted |
| **Skills** | 24 skills in three categories, each paired with a validator | Strong |
| **Hooks** | 15 in `.kiro/hooks/` (spec guard, validators on save, gates on stop, property tests, agent gate) plus three per team agent (baseline, shell guard, scope) | Strong, and the agent hooks were probed against the real CLI |
| **Custom agents** | 7 agents, generated from one table, with an `fs_write` fence, a shell allow-list, a guard hook, a scope hook, one owner per file; verified with real agents under auto-approve | Strong, with a stated limit: a guard against mistakes, not a sandbox |
| **Property-based testing** | 32 fast-check properties in `npm run quality`; found 6 real bugs; planted-bug checks per feature; guards against vacuous properties | Strong. The write-up question "did PBT catch issues unit tests missed?" has a concrete answer |
| **Sub-agents** | `lead-dev` delegates to six named agents; `semantic_reviewer` reviewed the work independently and found blockers | Good |
| **Kiro CLI, Crew** | CLI path tested end to end; Crew prepared (agents installed, member on `lead-dev` in the repo workspace, `npm run crew:check`); the gateway honours the agents' rules; a Telegram run is not done | Partial: needs the two-minute dashboard test and one Telegram task |
| **MCP** | `.kiro/settings/mcp.json` is empty by choice | Not used. The write-up says why (offline scripts and skills were enough) |
| **Powers** | None | Not used. Do not fake it |
| **Kiro IDE / Web** | Hooks and steering are written for the IDE; nothing shows it was used | Add two honest paragraphs on what each surface was used for |

### What makes this more than a feature list

1. **The enforcement is tested against the real tool.** The agent fences were probed on Kiro CLI 3.3.0, and the probes changed the design: a command that matches no rule runs under auto-approve; shell rules ignore redirects; a sub-agent's call is also checked against its parent. Each finding became a gate, a test or a documented limit.
2. **Quality gates replace trust.** `npm run quality` runs 9 gates (types, layout, size, layers, declarative, specs, duplicates, agents, properties). Agents "report only gates they ran".
3. **The loop was closed on itself.** The property tests found bugs in the game; an independent review found bugs in the agent setup and in the tests; both were fixed and re-verified. The commit-ready record is in the specs' `tasks.md`.

## Gaps, in the order they cost points

1. **No public URL and no video** (Presentation, and the mandatory submission items). Deploy `dist/` (Netlify reads `public/_redirects`); record the demo (plan in `SUBMISSION.md`). Judges "are not required to test", so the video is where most of them will meet the game.
2. **The phone path is prepared, not proven.** Everything that can be done without your credentials is done (`npm run crew:check`); the dashboard first test and one Telegram task ending in a pushed `agent/<task>` branch make the claim true. Until then say "built and documented".
3. **No pushed agent branch exists.** Judges looking at the Git history see 38 commits, and none made by the agents. Commit this setup yourself, then run one real task through `lead-dev` so the history shows an `agent/*` branch with a QA report.
4. **Presentation of the Kiro story.** The write-up (`KIRO_USAGE.md`) still needs your own part: which Kiro surfaces you used for what, and one before and after story.
5. **Impact claim.** The rules ask "would someone actually use this?". Frame it as learning by play: the unix commands, an HTML/CSS fix, a JS bug, a Dockerfile and a Compose file are real, and a tutorial level teaches them. Avoid claiming more.
6. **Trademarks.** The story parodies real AI products by name. Keep logos out of the video.
7. **MCP and powers** stay unused. Optional: one small MCP server exposing the gates. It is the only remaining Kiro feature the rules list that the project does not touch.

## Category and bonus prizes

- **Category: Costume Contest** (a haunting, polished interface that serves the function). The terminal and the comic stage are the product. Frankenstein is the alternative (Three.js, xterm.js, a unix emulator, procedural art and a spec engine stitched together), but the visual identity is the stronger story.
- **Best Demo:** automatic; depends on the video.
- **Bonus Blog and Social Blitz:** cheap and open to everyone: a post during the period that mentions Kiroween 2026 (`#KiroweenHackathon26` first for the social one). The property-test story ("it found six bugs the example tests missed") is the best hook.
- **Best Student, Startup, Ghost of Kiroween Past, Kiro Crew App:** only if they apply. Crew App needs a separate Crew-app repo, which this is not.
- Submission must be made by **December 4, 2026, 2:00 PM Pacific**; Crew credit requests close December 1.

## Do before you submit (ranked)

1. Commit and push the setup; enable branch protection on `main`.
2. Deploy; set the About website, description and topics (licence shows as MIT).
3. Run one real task through `lead-dev`; run one from Telegram if you can; update `docs/AGENTS_CREW.md` with what happened.
4. Record the video; fill `KIRO_USAGE.md`'s personal part.
5. Publish the blog post and the social post; fill the Devpost form from `SUBMISSION.md`.
