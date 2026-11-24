---
inclusion: always
---

# The agent team and the property tests

Any agent that works in this repo (Kiro CLI, Kiro IDE, Kiro Crew's own agents, Claude Code) must know two things.

## The team (`.kiro/agents/`)

Seven custom agents tune the game. `lead-dev` is the entry point and the only one that commits (branches `agent/<task>` only, never `main`); it delegates to `terminal-designer`, `laptop-designer`, `comix-designer`, `chapters-designer`, `artist` and `qa`. Each writes only its own paths (the ownership table is in `.kiro/agents/prompts/team-rules.md`); each has a shell allow-list, a guard hook and a scope hook. Their files are generated from `scripts/harness/agents-build.mjs`: edit the table, run it, never edit the JSON, and never edit an agent's own fence or prompt from inside a session (`.kiro/agents/` belongs to the user).

- If you are one of the seven, `team-rules.md` is your contract: stay in your paths, hand other owners' changes over in your report, report only gates you ran.
- If you are any other agent, you may do what the user asks, but follow the same rules: spec-first, no hand edits of `generated/`, canonical JSON writers, and report only what you ran. For a request that touches several features, suggest `kiro-cli --agent lead-dev` (or the Kiro Crew app, `docs/AGENTS_CREW.md`).
- `qa` reports live in `docs/qa/`; reviews in `docs/reviews/`.

## MCP tools of the team

Each agent lists exactly the MCP tools it may call (`@server/tool`) and a rule refuses every other: `qa` has Chrome DevTools MCP (screenshots, console, network of `localhost` and `*.netlify.app` only, CPU throttling through `emulate` and performance traces, no JavaScript evaluation) and the read-only `credits-forge` tools; `chapters-designer` has every `credits-forge` tool and is the only one with `write_level`; `comix-designer` has `list_assets`; the others and `lead-dev` have none. Report each MCP call and what it returned. `npm run quality:agents` checks the lists; `node scripts/harness/mcp-probe.mjs` proves them in the real CLI.

## The visual audit

`qa` starts every visual pass with `node scripts/harness/visual-audit.mjs` (owned by `lead-dev`; spec `.kiro/specs/qa-visual-audit/`). It reads `scripts/harness/out/visual/summary.json`, explains every flag and diff, and fills the per-screen checklist of its prompt. The baselines in `docs/qa/baselines/` are approved by a person only: every team agent is denied `--update` and writes there.

## Property-based tests

`node scripts/harness/property-tests.mjs` (fast-check, fixed seed, part of `npm run quality`) checks invariants of the terminal (both shells), laptop, comix, chapters and gameplay elements on generated input. Run `--only <feature>` for what you touched. A failure prints a shrunk counterexample and a seed: reproduce with `--seed`, fix the cause, and keep the counterexample in that property's `examples`. When you change behaviour a property covers, change the property in the same commit. A property that cannot fail is a bug: say so in your report. How to read and extend them: `docs/PROPERTY_TESTS.md`.

## Gates for this layer

`npm run quality:agents` (table, rules, hooks, ownership, self-tests, `agents-unit.mjs`) and `npm run quality:props`, both inside `npm run quality`.
